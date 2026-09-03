import { expect, test, type Page } from '@playwright/test';

import { E2E_API_URL } from '../playwright.config';
import { newAccount, onboard, signIn } from './support/account';
import { closeDb, deleteAccount } from './support/database';

/**
 * The guarantee that matters most in a multi-tenant product: one agency can
 * never reach another's data, and cannot even confirm that a given identifier
 * exists.
 *
 * Asserted end to end because it depends on three things agreeing — the
 * organization header the browser sends, the membership the API resolves from
 * the session, and every repository query being scoped by organization. A unit
 * test on any one of them would still pass if another were wrong.
 */

const owner = newAccount('tenant-owner');
const outsider = newAccount('tenant-outsider');

let websiteId = '';
let organizationId = '';

let outsiderOrganizationId = '';

test.beforeAll(async ({ browser }) => {
  const ownerPage = await browser.newPage();
  await onboard(ownerPage, owner);

  await addWebsite(ownerPage, 'Owned Site', 'https://owned-site.example.com');
  await ownerPage.getByRole('link', { name: 'Owned Site' }).click();
  await ownerPage.waitForURL(/\/dashboard\/websites\/[0-9a-f]{24}/);
  websiteId = ownerPage.url().split('/').pop() ?? '';
  organizationId = await readActiveOrganization(ownerPage);
  await ownerPage.close();

  // The outsider is onboarded once, here. Registering the same address again
  // in a per-test hook would fail on the unique index rather than test
  // anything about isolation.
  const outsiderPage = await browser.newPage();
  await onboard(outsiderPage, outsider);
  outsiderOrganizationId = await readActiveOrganization(outsiderPage);
  await outsiderPage.close();

  expect(websiteId).toMatch(/^[0-9a-f]{24}$/);
  expect(organizationId).toMatch(/^[0-9a-f]{24}$/);
  expect(outsiderOrganizationId).not.toBe(organizationId);
});

test.afterAll(async () => {
  await deleteAccount(owner.email);
  await deleteAccount(outsider.email);
  await closeDb();
});

test.describe("another organization's data", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, outsider);
    await page.waitForURL(/\/dashboard/);
  });

  test('is not listed', async ({ page }) => {
    await page.goto('/dashboard/websites');

    await expect(page.getByText('Owned Site')).toHaveCount(0);
    await expect(page.getByText(/add your first website/i)).toBeVisible();
  });

  test('reads as not found when addressed directly', async ({ page }) => {
    await page.goto(`/dashboard/websites/${websiteId}`);

    // "Not found", never "forbidden": confirming the id exists but belongs to
    // someone else is an enumeration oracle.
    await expect(page.getByText(/not found/i)).toBeVisible();
    await expect(page.getByText(/forbidden|permission|not allowed/i)).toHaveCount(0);
  });

  test('is refused by the API even when the organization header is forged', async ({
    page,
    request,
  }) => {
    await page.goto('/dashboard');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    // A real session, pointed at an organization this user does not belong to.
    const response = await request.get(`${E2E_API_URL}/api/websites`, {
      headers: { cookie: cookieHeader, 'x-organization-id': organizationId },
    });

    expect(response.status()).toBe(404);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ success: false, error: { code: 'ORGANIZATION_NOT_FOUND' } });
  });

  test('cannot be reached by asking the API for the website directly', async ({
    page,
    request,
  }) => {
    await page.goto('/dashboard');
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    // The outsider's own organization, but someone else's website id — the
    // case a scoped query has to catch rather than the guard.
    const response = await request.get(`${E2E_API_URL}/api/websites/${websiteId}`, {
      headers: { cookie: cookieHeader, 'x-organization-id': outsiderOrganizationId },
    });

    expect(response.status()).toBe(404);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ success: false, error: { code: 'WEBSITE_NOT_FOUND' } });
  });
});

async function addWebsite(page: Page, name: string, url: string): Promise<void> {
  await page.goto('/dashboard/websites');
  await page
    .getByRole('button', { name: /add website/i })
    .first()
    .click();
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/url/i).fill(url);
  await page
    .getByRole('button', { name: /^add website$/i })
    .last()
    .click();
  await expect(page.getByRole('link', { name })).toBeVisible();
}

/** The organization the dashboard is currently showing, as the browser knows it. */
async function readActiveOrganization(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === 'siteops.active_org')?.value ?? '';
}
