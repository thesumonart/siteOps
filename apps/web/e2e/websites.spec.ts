import { expect, test, type Page } from '@playwright/test';

import { newAccount, onboard } from './support/account';
import { closeDb, deleteAccount } from './support/database';

/**
 * Managing monitored websites, and the refusals around it.
 *
 * The SSRF cases are here rather than only in the worker's unit tests because
 * the rule has to survive the whole path: a shared Zod schema in the browser,
 * the same schema in the API's validation pipe, and the service re-checking on
 * its own. A test at any single layer would still pass if another were removed.
 */

const account = newAccount('websites');

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await onboard(page, account);
  await page.close();
});

test.afterAll(async () => {
  await deleteAccount(account.email);
  await closeDb();
});

test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
});

test.describe('website management', () => {
  test('adds a website and shows it awaiting its first check', async ({ page }) => {
    await page.goto('/dashboard/websites');
    await openAddDialog(page);

    await page.getByLabel('Name').fill('Acme Storefront');
    await page.getByLabel('URL').fill('https://acme-storefront.example.com');
    await page
      .getByRole('button', { name: /^add website$/i })
      .last()
      .click();

    const row = page.getByRole('row', { name: /Acme Storefront/ });
    await expect(row).toBeVisible();
    // A website with no checks yet reports nothing, not a flattering default.
    await expect(row).toContainText('—');
    await expect(row).toContainText(/unknown|awaiting/i);
  });

  test('refuses a private address, with a reason the person can act on', async ({ page }) => {
    await page.goto('/dashboard/websites');
    await openAddDialog(page);

    await page.getByLabel('Name').fill('Internal Admin');
    await page.getByLabel('URL').fill('http://192.168.1.10/admin');
    await page
      .getByRole('button', { name: /^add website$/i })
      .last()
      .click();

    await expect(
      page.getByText(/private|internal|not permitted|cannot be monitored/i),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /Internal Admin/ })).toHaveCount(0);
  });

  test('refuses a cloud metadata endpoint', async ({ page }) => {
    await page.goto('/dashboard/websites');
    await openAddDialog(page);

    await page.getByLabel('Name').fill('Metadata');
    await page.getByLabel('URL').fill('http://169.254.169.254/latest/meta-data/');
    await page
      .getByRole('button', { name: /^add website$/i })
      .last()
      .click();

    await expect(
      page.getByText(/private|internal|not permitted|cannot be monitored/i),
    ).toBeVisible();
  });

  test('refuses a scheme that is not http or https', async ({ page }) => {
    await page.goto('/dashboard/websites');
    await openAddDialog(page);

    await page.getByLabel('Name').fill('Passwd');
    await page.getByLabel('URL').fill('file:///etc/passwd');
    await page
      .getByRole('button', { name: /^add website$/i })
      .last()
      .click();

    await expect(page.getByText(/http|https|valid url/i).first()).toBeVisible();
  });

  test('refuses the same URL twice', async ({ page }) => {
    await page.goto('/dashboard/websites');
    await openAddDialog(page);
    await page.getByLabel('Name').fill('Duplicate');
    await page.getByLabel('URL').fill('https://acme-storefront.example.com');
    await page
      .getByRole('button', { name: /^add website$/i })
      .last()
      .click();

    await expect(page.getByText(/already/i)).toBeVisible();
  });

  test('pauses and resumes monitoring', async ({ page }) => {
    await page.goto('/dashboard/websites');
    await page.getByRole('link', { name: 'Acme Storefront' }).click();
    await page.waitForURL(/\/dashboard\/websites\/[0-9a-f]{24}/);

    await page.getByRole('button', { name: /^pause$/i }).click();
    await expect(page.getByText('Paused').first()).toBeVisible();

    await page.getByRole('button', { name: /^resume$/i }).click();
    await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  });

  test('deletes a website only after its name is typed', async ({ page }) => {
    await page.goto('/dashboard/websites');
    await page.getByRole('link', { name: 'Acme Storefront' }).click();
    await page.waitForURL(/\/dashboard\/websites\/[0-9a-f]{24}/);

    await page.getByRole('button', { name: /^delete$/i }).click();

    const confirm = page.getByRole('button', { name: /delete website/i });
    // Guarded until the name matches, so an irreversible action needs intent.
    await expect(confirm).toBeDisabled();

    await page.getByLabel(/type .* to confirm/i).fill('Acme Storefront');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await page.waitForURL(/\/dashboard\/websites$/);
    await expect(page.getByRole('link', { name: 'Acme Storefront' })).toHaveCount(0);
  });
});

async function openAddDialog(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /add website/i })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
