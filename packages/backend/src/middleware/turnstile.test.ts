import { describe, it, expect, vi, beforeEach } from "vitest";

const mockConfig = vi.hoisted(() => ({
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
}));

vi.mock("../config", () => ({
  config: mockConfig,
}));

vi.mock("./tenant-api-key", () => ({
  resolveTenantApiKey: vi.fn().mockResolvedValue(null),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { verifyTurnstile } from "./turnstile";

function makeRequest(body: any = {}, url = "/api/v1/auth/register") {
  return {
    body,
    ip: "127.0.0.1",
    headers: {},
    routeOptions: { url },
  } as any;
}

function makeReply() {
  const reply: any = {
    sent: false,
    statusCode: 200,
    body: null,
  };
  reply.status = vi.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = vi.fn((data: any) => {
    reply.body = data;
    reply.sent = true;
    return reply;
  });
  return reply;
}

describe("Turnstile middleware (P0-1-F4 + P0-1-F11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
  });

  it("returns 400 when no turnstile token provided", async () => {
    const req = makeRequest({});
    const rep = makeReply();
    await verifyTurnstile(req, rep);
    expect(rep.status).toHaveBeenCalledWith(400);
  });

  it("returns 403 when Cloudflare says verification failed", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: false, "error-codes": ["invalid-input-response"] }),
    });

    const req = makeRequest({ turnstileToken: "bad-token" });
    const rep = makeReply();
    await verifyTurnstile(req, rep);
    expect(rep.status).toHaveBeenCalledWith(403);
  });

  it("allows request when Cloudflare says verification succeeded", async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true }),
    });

    const req = makeRequest({ turnstileToken: "good-token" });
    const rep = makeReply();
    await verifyTurnstile(req, rep);
    // Should not call reply.status at all — request passes through
    expect(rep.status).not.toHaveBeenCalled();
  });

  it("returns 503 when Cloudflare is unreachable (fail-closed, P0-1-F4)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const req = makeRequest({ turnstileToken: "some-token" });
    const rep = makeReply();
    await verifyTurnstile(req, rep);
    expect(rep.status).toHaveBeenCalledWith(503);
    expect(rep.body.error).toContain("unavailable");
  });

  it("skips Turnstile in dev when no key configured", async () => {
    mockConfig.TURNSTILE_SECRET_KEY = "";
    const req = makeRequest({});
    const rep = makeReply();
    await verifyTurnstile(req, rep);
    expect(rep.status).not.toHaveBeenCalled();
  });

  it("twoFaToken on login route skips Turnstile (P0-1-F11 — allowed)", async () => {
    const req = makeRequest({ twoFaToken: "some-token" }, "/api/v1/auth/login");
    const rep = makeReply();
    await verifyTurnstile(req, rep);
    expect(rep.status).not.toHaveBeenCalled();
  });

  it("twoFaToken on register route does NOT skip Turnstile (P0-1-F11 — rejected)", async () => {
    const req = makeRequest({ twoFaToken: "some-token" }, "/api/v1/auth/register");
    const rep = makeReply();
    await verifyTurnstile(req, rep);
    // Should still require turnstileToken — returns 400
    expect(rep.status).toHaveBeenCalledWith(400);
  });
});
