import { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config";
import { resolveTenantApiKey } from "./tenant-api-key";

export async function verifyTurnstile(request: FastifyRequest, reply: FastifyReply) {
  // Skip in development if no key configured
  if (!config.TURNSTILE_SECRET_KEY || config.TURNSTILE_SECRET_KEY === "placeholder_get_from_cloudflare") {
    return;
  }

  // Skip Turnstile for authorized API integrations (DB keys or legacy env var keys).
  const rawKey = request.headers["x-api-key"] as string | undefined;
  if (rawKey) {
    const ctx = await resolveTenantApiKey(rawKey);
    if (ctx) return;
  }

  const body = request.body as any;

  // Skip turnstile on 2FA step — user already passed verification on the first login attempt
  if (body?.twoFaToken) {
    return;
  }

  const turnstileToken = body?.turnstileToken || body?.cfTurnstileResponse;

  if (!turnstileToken) {
    return reply.status(400).send({
      error: "Human verification required. Please complete the captcha.",
    });
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", config.TURNSTILE_SECRET_KEY);
    formData.append("response", turnstileToken);
    formData.append("remoteip", request.ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    const result = await res.json() as { success: boolean; "error-codes"?: string[] };

    if (!result.success) {
      console.warn("Turnstile verification failed:", result["error-codes"]);
      return reply.status(403).send({
        error: "Human verification failed. Please try again.",
      });
    }
  } catch (err) {
    console.error("Turnstile verification error:", err);
    // Fail open in case Cloudflare is down — log but allow
    console.warn("Turnstile service unavailable — allowing request");
  }
}
