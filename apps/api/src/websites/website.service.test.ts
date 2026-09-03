import { HttpStatus } from '@nestjs/common';
import type { CreateWebsiteInput } from '@siteops/shared';
import { describe, expect, it, vi } from 'vitest';

import { ApiException } from '../common/errors/api-exception.js';
import type { CheckRepository } from '../monitoring/check.repository.js';
import type { IncidentRepository } from '../monitoring/incident.repository.js';
import type { OrganizationContext } from '../organizations/organization.types.js';
import type { WebsiteRecord, WebsiteRepository } from './website.repository.js';
import { WebsiteService } from './website.service.js';

const ORG_ID = '507f1f77bcf86cd799439011';
const WEBSITE_ID = '507f1f77bcf86cd799439012';
const ACTOR = { id: '507f1f77bcf86cd799439013', name: 'Sumon' };

function organizationOf(plan: 'free' | 'agency' = 'free'): OrganizationContext {
  return {
    id: ORG_ID,
    objectId: { toHexString: () => ORG_ID },
    name: 'Acme',
    slug: 'acme',
    plan,
    role: 'owner',
    permissions: [],
  } as unknown as OrganizationContext;
}

function websiteRecord(overrides: Partial<WebsiteRecord> = {}): WebsiteRecord {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: { toHexString: () => WEBSITE_ID },
    organizationId: { toHexString: () => ORG_ID },
    name: 'Acme',
    url: 'https://acme.com/',
    canonicalKey: 'acme.com',
    status: 'unknown',
    monitoringEnabled: true,
    monitoringIntervalSeconds: 300,
    requestTimeoutMs: 10_000,
    failureThreshold: 3,
    recoveryThreshold: 2,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    nextCheckAt: now,
    leaseExpiresAt: null,
    lastCheckedAt: null,
    lastSuccessfulCheckAt: null,
    lastFailedAt: null,
    lastResponseTimeMs: null,
    lastStatusCode: null,
    currentIncidentId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as unknown as WebsiteRecord;
}

function buildService(
  options: { readonly count?: number; readonly existing?: WebsiteRecord } = {},
) {
  const repository = {
    countForOrganization: vi.fn().mockResolvedValue(options.count ?? 0),
    create: vi
      .fn()
      .mockImplementation((input: { name: string; url: string }) =>
        Promise.resolve(websiteRecord({ name: input.name, url: input.url })),
      ),
    findById: vi.fn().mockResolvedValue(options.existing ?? null),
    update: vi.fn().mockImplementation(() => Promise.resolve(websiteRecord())),
    delete: vi.fn().mockResolvedValue(options.existing ?? null),
    deleteIncidentsFor: vi.fn().mockResolvedValue(0),
    deleteChecksFor: vi.fn().mockResolvedValue(0),
    list: vi.fn(),
  } as unknown as WebsiteRepository;

  // The list rollups are the only thing these two are used for, and no test
  // here exercises `list()` — an empty page short-circuits before touching them.
  const checks = {
    totalsByWebsite: vi.fn().mockResolvedValue(new Map()),
  } as unknown as CheckRepository;
  const incidents = {
    openIncidentIdsFor: vi.fn().mockResolvedValue(new Map()),
  } as unknown as IncidentRepository;

  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new WebsiteService(repository, checks, incidents, audit);

  return { service, repository };
}

function createInput(overrides: Partial<CreateWebsiteInput> = {}): CreateWebsiteInput {
  return {
    name: 'Acme',
    url: 'https://acme.com',
    monitoringIntervalSeconds: 300,
    requestTimeoutMs: 10_000,
    failureThreshold: 3,
    recoveryThreshold: 2,
    ...overrides,
  };
}

async function rejection(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiException) return error;
    throw error;
  }
  throw new Error('Expected an ApiException.');
}

describe('WebsiteService — SSRF at creation', () => {
  /**
   * The service re-validates rather than trusting that the request went through
   * the Zod pipe. This is the first of two layers; the worker checks the
   * resolved address before connecting.
   */
  it.each([
    ['http://localhost:3000', 'BLOCKED_WEBSITE_URL'],
    ['http://127.0.0.1/admin', 'BLOCKED_WEBSITE_URL'],
    ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_WEBSITE_URL'],
    ['http://10.0.0.5', 'BLOCKED_WEBSITE_URL'],
    ['http://[::1]', 'BLOCKED_WEBSITE_URL'],
    ['http://db.internal', 'BLOCKED_WEBSITE_URL'],
    ['file:///etc/passwd', 'INVALID_WEBSITE_URL'],
    ['javascript:alert(1)', 'INVALID_WEBSITE_URL'],
    ['https://admin:hunter2@acme.com', 'INVALID_WEBSITE_URL'],
  ])('refuses %s', async (url, expectedCode) => {
    const { service, repository } = buildService();

    const error = await rejection(service.create(organizationOf(), createInput({ url }), ACTOR));

    expect(error.code).toBe(expectedCode);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    // Nothing was written for a rejected target.
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('stores the normalized URL and its canonical key', async () => {
    const { service, repository } = buildService();

    await service.create(
      organizationOf(),
      createInput({ url: 'HTTPS://WWW.Acme.com:443/' }),
      ACTOR,
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://www.acme.com/',
        // `www.` and the default port are stripped for duplicate detection.
        canonicalKey: 'acme.com',
      }),
    );
  });
});

describe('WebsiteService — plan limits', () => {
  it('refuses to exceed the plan website cap', async () => {
    // The free plan allows three.
    const { service, repository } = buildService({ count: 3 });

    const error = await rejection(service.create(organizationOf('free'), createInput(), ACTOR));

    expect(error.code).toBe('PLAN_LIMIT_REACHED');
    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows creation below the cap', async () => {
    const { service, repository } = buildService({ count: 2 });

    await service.create(organizationOf('free'), createInput(), ACTOR);

    expect(repository.create).toHaveBeenCalledOnce();
  });

  it('refuses an interval faster than the plan permits', async () => {
    const { service } = buildService({ count: 0 });

    const error = await rejection(
      service.create(organizationOf('free'), createInput({ monitoringIntervalSeconds: 60 }), ACTOR),
    );

    expect(error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('allows a one-minute interval on a plan that includes it', async () => {
    const { service, repository } = buildService({ count: 0 });

    await service.create(
      organizationOf('agency'),
      createInput({ monitoringIntervalSeconds: 60 }),
      ACTOR,
    );

    expect(repository.create).toHaveBeenCalledOnce();
  });
});

describe('WebsiteService — duplicates', () => {
  it('turns a duplicate-key error into a conflict rather than a 500', async () => {
    const { service, repository } = buildService();
    vi.mocked(repository.create).mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key'), { code: 11000 }),
    );

    const error = await rejection(service.create(organizationOf(), createInput(), ACTOR));

    expect(error.code).toBe('WEBSITE_URL_ALREADY_MONITORED');
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('lets an unrelated database error surface instead of masking it', async () => {
    const { service, repository } = buildService();
    const failure = new Error('connection reset');
    vi.mocked(repository.create).mockRejectedValue(failure);

    await expect(service.create(organizationOf(), createInput(), ACTOR)).rejects.toThrow(
      'connection reset',
    );
  });
});

describe('WebsiteService — tenant scoping', () => {
  it('reports a website from another organization as not found', async () => {
    // The repository filters by organizationId, so a foreign id resolves to
    // null and the caller learns nothing about whether it exists.
    const { service } = buildService();

    const error = await rejection(service.getById(organizationOf(), WEBSITE_ID));

    expect(error.code).toBe('WEBSITE_NOT_FOUND');
    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('refuses to delete a website it cannot see', async () => {
    const { service, repository } = buildService();

    const error = await rejection(service.delete(organizationOf(), WEBSITE_ID, ACTOR));

    expect(error.code).toBe('WEBSITE_NOT_FOUND');
    expect(repository.deleteIncidentsFor).not.toHaveBeenCalled();
  });
});

describe('WebsiteService — monitoring state', () => {
  it('clears the failure streak when monitoring is paused', async () => {
    const { service, repository } = buildService({
      existing: websiteRecord({ consecutiveFailures: 2 }),
    });

    await service.setMonitoring(organizationOf(), WEBSITE_ID, false, ACTOR);

    expect(repository.update).toHaveBeenCalledWith(
      expect.anything(),
      WEBSITE_ID,
      expect.objectContaining({
        monitoringEnabled: false,
        status: 'paused',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      }),
    );
  });

  it('resumes into an unknown state rather than a stale one', async () => {
    const { service, repository } = buildService({
      existing: websiteRecord({ monitoringEnabled: false, status: 'paused' }),
    });

    await service.setMonitoring(organizationOf(), WEBSITE_ID, true, ACTOR);

    expect(repository.update).toHaveBeenCalledWith(
      expect.anything(),
      WEBSITE_ID,
      expect.objectContaining({ monitoringEnabled: true, status: 'unknown' }),
    );
  });

  it('restarts confirmation counters when the URL changes', async () => {
    const { service, repository } = buildService({
      existing: websiteRecord({ consecutiveFailures: 2, canonicalKey: 'acme.com' }),
    });

    await service.update(organizationOf(), WEBSITE_ID, { url: 'https://other-site.com' }, ACTOR);

    expect(repository.update).toHaveBeenCalledWith(
      expect.anything(),
      WEBSITE_ID,
      expect.objectContaining({
        url: 'https://other-site.com/',
        canonicalKey: 'other-site.com',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      }),
    );
  });

  it('leaves counters alone when only the name changes', async () => {
    const { service, repository } = buildService({
      existing: websiteRecord({ consecutiveFailures: 2 }),
    });

    await service.update(organizationOf(), WEBSITE_ID, { name: 'Renamed' }, ACTOR);

    const changes = vi.mocked(repository.update).mock.calls[0]?.[2] ?? {};
    expect(changes).toEqual({ name: 'Renamed' });
  });

  it('refuses a blocked URL on update, not only on creation', async () => {
    const { service } = buildService({ existing: websiteRecord() });

    const error = await rejection(
      service.update(organizationOf(), WEBSITE_ID, { url: 'http://169.254.169.254' }, ACTOR),
    );

    expect(error.code).toBe('BLOCKED_WEBSITE_URL');
  });
});
