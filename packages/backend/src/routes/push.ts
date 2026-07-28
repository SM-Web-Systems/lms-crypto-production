import { FastifyInstance } from "fastify";
import webpush from "web-push";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";

// Configure web-push
if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    config.VAPID_EMAIL || "mailto:noreply@ammawallet.com",
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY
  );
}

export async function pushRoutes(app: FastifyInstance) {
  // Get VAPID public key (no auth needed)
  app.get(
    "/api/v1/push/vapid-key",
    {
      schema: {
        tags: ["Push Notifications"],
        summary: "Get VAPID public key for push subscription",
        response: {
          200: {
            type: "object",
            properties: { publicKey: { type: "string" } },
          },
        },
      },
    },
    async () => {
      return { publicKey: config.VAPID_PUBLIC_KEY || "" };
    }
  );

  // Subscribe to push notifications
  app.post(
    "/api/v1/push/subscribe",
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ["Push Notifications"],
        summary: "Register a push notification subscription",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["endpoint", "keys"],
          properties: {
            endpoint: { type: "string" },
            keys: {
              type: "object",
              properties: {
                p256dh: { type: "string" },
                auth: { type: "string" },
              },
              required: ["p256dh", "auth"],
            },
          },
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
        },
      },
    },
    async (request) => {
      const user = (request as any).user;
      const { endpoint, keys } = request.body as any;

      await db
        .insert(pushSubscriptions)
        .values({
          userId: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: request.headers["user-agent"] || null,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id },
        });

      return { success: true };
    }
  );

  // Unsubscribe
  app.post(
    "/api/v1/push/unsubscribe",
    {
      preHandler: [authMiddleware],
      schema: {
        tags: ["Push Notifications"],
        summary: "Remove a push notification subscription",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["endpoint"],
          properties: { endpoint: { type: "string" } },
        },
        response: {
          200: { type: "object", properties: { success: { type: "boolean" } } },
        },
      },
    },
    async (request) => {
      const user = (request as any).user;
      const { endpoint } = request.body as any;

      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, user.id),
            eq(pushSubscriptions.endpoint, endpoint)
          )
        );

      return { success: true };
    }
  );

  // Send test notification (for debugging)
  app.post(
    "/api/v1/push/test",
    {
      preHandler: [authMiddleware],
      config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
      schema: {
        tags: ["Push Notifications"],
        summary: "Send a test push notification to all your devices",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: { sent: { type: "number" }, failed: { type: "number" } },
          },
        },
      },
    },
    async (request) => {
      const user = (request as any).user;

      const subs = await db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, user.id));

      let sent = 0;
      let failed = 0;

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: "Amma Wallet",
              body: "Push notifications are working!",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              data: { url: "/" },
            })
          );
          sent++;
        } catch (err: any) {
          failed++;
          // Remove invalid subscriptions (410 Gone)
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id));
          }
        }
      }

      return { sent, failed };
    }
  );
}

// Utility: send push to a specific user (used by other modules)
export async function sendPushToUser(
  userId: number,
  payload: { title: string; body: string; icon?: string; data?: any }
) {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          icon: payload.icon || "/icon-192.png",
          badge: "/icon-192.png",
          data: payload.data || {},
        })
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}
