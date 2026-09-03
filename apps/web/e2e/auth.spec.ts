import { expect, test } from '@playwright/test';

import { isSignedIn, newAccount, onboard, register, signIn, verifyEmail } from './support/account';
import { closeDb, deleteAccount } from './support/database';

/**
 * Sign-up through to a working dashboard, and the boundaries around it.
 *
 * Route protection is asserted from the browser rather than from a unit test on
 * the middleware, because the guarantee is "an anonymous visitor cannot see
 * this page" — which depends on the middleware, the layout's own session check
 * and the API agreeing with each other.
 */

const account = newAccount('auth');

test.afterAll(async () => {
  await deleteAccount(account.email);
  await closeDb();
});

test.describe('authentication', () => {
  test('sends an anonymous visitor to sign-in and back again', async ({ page }) => {
    await page.goto('/dashboard/websites');

    await expect(page).toHaveURL(/\/login/);
    // The intended destination survives the detour, so signing in does not
    // dump someone on a generic landing page.
    expect(page.url()).toContain('next=');
  });

  test('sends an anonymous visitor to sign-in even for a dashboard route that does not exist', async ({
    page,
  }) => {
    // The protected area is gated before routing, so an unknown path under it
    // reveals nothing — not even whether the page exists.
    await page.goto('/dashboard/definitely-not-a-page');

    await expect(page).toHaveURL(/\/login/);
  });

  test('serves an unknown public route as a clean 404, with no stack trace', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-page');

    expect(response?.status()).toBe(404);
    const body = page.locator('body');
    await expect(body).not.toContainText('at Object.');
    await expect(body).not.toContainText('node_modules');
    // A filesystem path in a rendered page means an unhandled error escaped.
    await expect(body).not.toContainText('siteops/apps');
  });

  test('registers, verifies, and is signed in to create an organization', async ({ page }) => {
    await register(page, account);
    // Nobody is admitted before confirming the address.
    await expect(page.getByText(new RegExp(account.email, 'i'))).toBeVisible();

    await verifyEmail(page, account);

    // Confirming the address signs the person in, so they are not asked for a
    // password they typed a moment ago.
    expect(await isSignedIn(page)).toBe(true);

    await page.waitForURL(/\/onboarding/);
    await page.getByLabel(/organization name/i).fill(account.organization);
    await page.getByRole('button', { name: /create organization/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: account.organization })).toBeVisible();
  });

  test('rejects a wrong password without saying which half was wrong', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill('NotTheRightPassword1!');
    await page.getByRole('button', { name: /sign in/i }).click();

    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible();
    // Naming the email as valid would confirm the account exists.
    await expect(alert).not.toContainText(/no account|not registered|unknown email/i);
  });

  test('signs out and locks the dashboard again', async ({ page }) => {
    await signIn(page, account);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login|\/$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('a second account', () => {
  const other = newAccount('auth-second');

  test.afterAll(async () => {
    await deleteAccount(other.email);
  });

  test('gets its own organization and sees nothing of the first', async ({ page }) => {
    await onboard(page, other);

    await expect(page.getByRole('heading', { name: other.organization })).toBeVisible();
    await expect(page.getByText(account.organization)).toHaveCount(0);
  });
});
