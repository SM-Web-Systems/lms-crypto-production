// packages/backend/src/lib/url-validator.test.ts
import { describe, it, expect } from "vitest";
import { validateExternalUrl } from "./url-validator";

describe("validateExternalUrl", () => {
  // Should PASS (safe URLs)
  it("allows https URLs to public domains", () => {
    expect(() => validateExternalUrl("https://example.com/path")).not.toThrow();
    expect(() => validateExternalUrl("https://stellar.org/.well-known/stellar.toml")).not.toThrow();
  });

  // Should REJECT (unsafe URLs)
  it("rejects http:// (non-TLS)", () => {
    expect(() => validateExternalUrl("http://example.com")).toThrow();
  });

  it("rejects file:// scheme", () => {
    expect(() => validateExternalUrl("file:///etc/passwd")).toThrow();
  });

  it("rejects javascript: scheme", () => {
    expect(() => validateExternalUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects data: scheme", () => {
    expect(() => validateExternalUrl("data:text/html,<script>alert(1)</script>")).toThrow();
  });

  it("rejects localhost", () => {
    expect(() => validateExternalUrl("https://localhost/path")).toThrow();
    expect(() => validateExternalUrl("https://localhost:3000/path")).toThrow();
  });

  it("rejects 127.0.0.1 (loopback)", () => {
    expect(() => validateExternalUrl("https://127.0.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://127.0.0.255/path")).toThrow();
  });

  it("rejects 10.x.x.x (private class A)", () => {
    expect(() => validateExternalUrl("https://10.0.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://10.255.255.255/path")).toThrow();
  });

  it("rejects 172.16-31.x.x (private class B)", () => {
    expect(() => validateExternalUrl("https://172.16.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://172.31.255.255/path")).toThrow();
  });

  it("rejects 192.168.x.x (private class C)", () => {
    expect(() => validateExternalUrl("https://192.168.0.1/path")).toThrow();
    expect(() => validateExternalUrl("https://192.168.255.255/path")).toThrow();
  });

  it("rejects 169.254.x.x (link-local / cloud metadata)", () => {
    expect(() => validateExternalUrl("https://169.254.169.254/latest/meta-data/")).toThrow();
  });

  it("rejects 0.0.0.0", () => {
    expect(() => validateExternalUrl("https://0.0.0.0/path")).toThrow();
  });

  it("rejects IPv6 loopback (::1)", () => {
    expect(() => validateExternalUrl("https://[::1]/path")).toThrow();
  });

  it("rejects metadata.google.internal", () => {
    expect(() => validateExternalUrl("https://metadata.google.internal/")).toThrow();
  });

  it("rejects invalid URLs", () => {
    expect(() => validateExternalUrl("not-a-url")).toThrow();
    expect(() => validateExternalUrl("")).toThrow();
  });

  it("allows 172.15.x.x (not in private range)", () => {
    expect(() => validateExternalUrl("https://172.15.0.1/path")).not.toThrow();
  });

  it("allows 172.32.x.x (not in private range)", () => {
    expect(() => validateExternalUrl("https://172.32.0.1/path")).not.toThrow();
  });
});
