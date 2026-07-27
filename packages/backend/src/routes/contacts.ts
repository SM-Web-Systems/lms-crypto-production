import { FastifyInstance } from "fastify";
import { db } from "../db";
import { addressBook } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth";

export async function addressBookRoutes(app: FastifyInstance) {
  // List contacts
  app.get("/api/v1/contacts", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Contacts"],
      summary: "List all contacts in address book",
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
              address: { type: "string" },
              memo: { type: "string", nullable: true },
              memoType: { type: "string", nullable: true },
              notes: { type: "string", nullable: true },
              createdAt: { type: "string" },
            },
          },
        },
      },
    },
  }, async (request) => {
    const userId = request.user!.userId;
    return db.select().from(addressBook).where(eq(addressBook.userId, userId)).orderBy(addressBook.name);
  });

  // Add contact
  app.post("/api/v1/contacts", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Contacts"],
      summary: "Add a contact to address book",
      security: [{ bearerAuth: [] }],
      body: {
        type: "object",
        required: ["name", "address"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          address: { type: "string", minLength: 56, maxLength: 56, description: "Stellar public key (G...)" },
          memo: { type: "string", maxLength: 200 },
          memoType: { type: "string", enum: ["text", "id", "hash"] },
          notes: { type: "string", maxLength: 500 },
        },
      },
      response: {
        201: { type: "object", properties: { id: { type: "number" }, name: { type: "string" }, address: { type: "string" } } },
        409: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { name, address, memo, memoType, notes } = request.body as any;

    const existing = await db.select().from(addressBook)
      .where(and(eq(addressBook.userId, userId), eq(addressBook.address, address)))
      .limit(1);
    if (existing.length > 0) {
      return reply.status(409).send({ error: "This address is already in your contacts" });
    }

    const [contact] = await db.insert(addressBook).values({
      userId, name, address, memo: memo || null, memoType: memoType || null, notes: notes || null,
    }).returning();

    return reply.status(201).send(contact);
  });

  // Update contact
  app.patch("/api/v1/contacts/:id", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Contacts"],
      summary: "Update a contact",
      security: [{ bearerAuth: [] }],
      params: { type: "object", properties: { id: { type: "number" } } },
      body: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 },
          memo: { type: "string", maxLength: 200 },
          memoType: { type: "string", enum: ["text", "id", "hash"] },
          notes: { type: "string", maxLength: 500 },
        },
      },
      response: {
        200: { type: "object", properties: { ok: { type: "boolean" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as any;
    const updates = request.body as any;

    const result = await db.update(addressBook)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(addressBook.id, id), eq(addressBook.userId, userId)));

    const count = (result as any).rowCount || 0;
    if (count === 0) {
      return reply.status(404).send({ error: "Contact not found" });
    }
    return { ok: true };
  });

  // Delete contact
  app.delete("/api/v1/contacts/:id", {
    preHandler: authMiddleware,
    schema: {
      tags: ["Contacts"],
      summary: "Delete a contact",
      security: [{ bearerAuth: [] }],
      params: { type: "object", properties: { id: { type: "number" } } },
      response: {
        200: { type: "object", properties: { ok: { type: "boolean" } } },
      },
    },
  }, async (request) => {
    const userId = request.user!.userId;
    const { id } = request.params as any;

    await db.delete(addressBook)
      .where(and(eq(addressBook.id, id), eq(addressBook.userId, userId)));

    return { ok: true };
  });
}
