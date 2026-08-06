import { test, expect } from '../fixtures/auth';

test.describe('Student dashboard', () => {
  test('student sees the dashboard after login', async ({ studentPage }) => {
    await studentPage.goto('/student');

    // Student dashboard should load
    await expect(studentPage.getByText(/dashboard/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
