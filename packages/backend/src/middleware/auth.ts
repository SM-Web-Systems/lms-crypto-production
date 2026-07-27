import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken, JwtPayload } from "../lib/auth";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "No token provided" });
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    // Reject admin tokens used on user endpoints (token confusion guard)
    if (payload.type === "admin") {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
    request.user = payload;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
