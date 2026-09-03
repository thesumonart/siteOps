import { expect, type Page } from '@playwright/test';

import { E2E_API_URL } from '../../playwright.config';
import { verificationTokenFor } from './verification';

/**
 * Account setup driven through the product's own screens.
 *
 * Registration, verification and organization creation are performed by
 * clicking through the real forms rather than by writing to the database,
 * because the point of an end-to-end test is that those screens work. Only the
 * verification *token* is read out of the database, because the alternative is
 * a mail provider.
 */

export interface TestAccount {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly organization: string;
}

/** A fresh identity per test, so two runs can never collide on a unique index. */
export function newAccount(label: string): TestAccount {
  const unique = `${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: `E2E ${label}`,
    email: `e2e-${label}-${unique}@siteops.test`,
    password: 'E2eTestPassw0rd!',
    organization: `E2E ${label} ${unique.slice(-6)}`,
  };
}

export async function register(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Your name').fill(account.name);
  await page.getByLabel('Work email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/verify-email/);
}

/** Follows the real verification link, exactly as clicking it from an inbox would. */
export async function verifyEmail(page: Page, account: TestAccount): Promise<void> {
  const token = verificationTokenFor(account.email);
  const callback = new URL('/verify-email/confirmed', page.url()).toString();

  await page.goto(
    `${E2E_API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callback)}`,
  );
  await expect(page).toHaveURL(/\/verify-email\/confirmed/);
}

export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

/** True when the browser still holds a usable session. */
export async function isSignedIn(page: Page): Promise<boolean> {
  await page.goto('/dashboard');
  return !page.url().includes('/login');
}

export async function createOrganization(page: Page, account: TestAccount): Promise<void> {
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel(/organization name/i).fill(account.organization);
  await page.getByRole('button', { name: /create organization/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Register, verify and land on a dashboard with one organization. */
export async function onboard(page: Page, account: TestAccount): Promise<void> {
  await register(page, account);
  await verifyEmail(page, account);

  // Verifying signs the person in — `autoSignInAfterVerification` — so the
  // sign-in form is only needed when that has not happened.
  if (!(await isSignedIn(page))) {
    await signIn(page, account);
  }

  await createOrganization(page, account);
}
