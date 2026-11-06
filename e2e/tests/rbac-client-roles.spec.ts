import { randomUUID } from 'node:crypto';
import { test, expect } from '../fixtures/auth';
import { withFixtureDatabase } from '../helpers/fixture-db';
import { apiURL } from '../playwright.config';

for (const width of [320, 390, 768]) {
  test(`LMS-012: current multiple/custom/zero grants remain usable at ${width}px`, async ({ superAdminPage: page, request }) => {
    const suffix = randomUUID();
    const name = `Role learner ${width}`;
    const email = `roles-${suffix}@example.invalid`;
    const registered = await request.post(`${apiURL}/api/v1/auth/register`, {
      data: { name, email, password: 'password123' },
    });
    expect(registered.status()).toBe(201);
    const id = (await registered.json()).data.user.id as string;
    const roleId = `adviser-${suffix}`;
    withFixtureDatabase(db => {
      db.prepare('INSERT INTO roles(id,name,label) VALUES(?,?,?)').run(roleId, roleId, 'Learning adviser');
      // A stale compatibility label must never manufacture a displayed grant.
      db.prepare("UPDATE users SET role='admin' WHERE id=?").run(id);
    });

    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/users');
    const search = page.getByRole('searchbox', { name: 'Search users' });
    await search.fill(email);
    const manage = page.getByRole('button', { name: `Manage roles for ${name}`, exact: true });
    await expect(manage).toBeVisible();
    const row = page.locator('tr').filter({ has: manage });
    await expect(row.getByText('Student', { exact: true })).toBeVisible();
    await expect(row.getByText('Admin', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await search.focus();
    await page.keyboard.press('Tab');
    await expect(manage).toBeFocused();
    await page.keyboard.press('Enter');

    await page.getByRole('combobox', { name: 'Select role to assign' }).selectOption(roleId);
    await page.getByRole('button', { name: 'Assign selected role' }).click();
    await page.getByRole('alertdialog', { name: 'Confirm action' }).getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(row.getByText('Learning adviser', { exact: true })).toBeVisible();
    await expect(row.getByText('Student', { exact: true })).toBeVisible();

    for (const label of ['Learning adviser', 'Student']) {
      await page.getByRole('button', { name: `Remove ${label} role`, exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Confirm action' }).getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(row.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(row.getByText('No roles assigned', { exact: true })).toBeVisible();
    const directory = await page.request.get(`${apiURL}/api/v1/users`);
    expect(directory.status()).toBe(200);
    const target = (await directory.json()).data.users.find((user: { id: string }) => user.id === id);
    expect(target.roleSummaries).toEqual([]);
    expect(target).not.toHaveProperty('permissions');
    expect(target).not.toHaveProperty('workspaces');
  });
}
