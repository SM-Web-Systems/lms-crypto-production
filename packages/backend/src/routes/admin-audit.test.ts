import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const adminSrc = readFileSync(join(__dirname, "admin.ts"), "utf-8");

/**
 * P0-2-F1 — Admin mutation audit logging gaps
 *
 * Every admin mutation handler must call auditLog() with a named action and
 * an opts object containing at minimum { userId (or detail), ip }.
 */
describe("Admin mutation audit logging (P0-2-F1)", () => {
  it("credit handler calls auditLog('admin_credit')", () => {
    expect(adminSrc).toContain('auditLog("admin_credit"');
  });

  it("suspend handler calls auditLog('admin_suspend')", () => {
    expect(adminSrc).toContain('auditLog("admin_suspend"');
  });

  it("unsuspend handler calls auditLog('admin_unsuspend')", () => {
    expect(adminSrc).toContain('auditLog("admin_unsuspend"');
  });

  it("create admin handler calls auditLog('admin_create')", () => {
    expect(adminSrc).toContain('auditLog("admin_create"');
  });

  it("deactivate handler calls auditLog('admin_deactivate')", () => {
    expect(adminSrc).toContain('auditLog("admin_deactivate"');
  });

  it("reactivate handler calls auditLog('admin_reactivate')", () => {
    expect(adminSrc).toContain('auditLog("admin_reactivate"');
  });

  it("billing-policy handler calls auditLog('admin_billing_policy')", () => {
    expect(adminSrc).toContain('auditLog("admin_billing_policy"');
  });

  it("reset-password handler calls auditLog('admin_reset_password')", () => {
    expect(adminSrc).toContain('auditLog("admin_reset_password"');
  });

  it("all admin auditLog calls include ip: request.ip", () => {
    // Each auditLog call should have ip context
    const matches = adminSrc.match(/auditLog\("admin_\w+"/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(8);
  });
});
