import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ConversationResponse, MessageResponse, AdminMessageResponse, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditLog } from '../services/auditService.js';

/** Escape HTML special characters to prevent stored XSS. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toISO(ts: string | null | undefined): string {
  if (ts == null) return new Date().toISOString();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? String(ts) : d.toISOString();
}

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getConversations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const rows = query<{ id: string; user1_id: string; user2_id: string; updated_at: string }>(
      `SELECT id, user1_id, user2_id, updated_at FROM conversations
       WHERE user1_id = ? OR user2_id = ?
       ORDER BY updated_at DESC`,
      [userId, userId]
    );

    const conversations: ConversationResponse[] = [];
    for (const row of rows) {
      const u1 = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [row.user1_id]);
      const u2 = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [row.user2_id]);
      conversations.push({
        id: row.id,
        participantIds: [row.user1_id, row.user2_id],
        participantNames: [u1?.name ?? '', u2?.name ?? ''],
        updatedAt: toISO(row.updated_at),
      });
    }

    res.json({
      success: true,
      data: { conversations },
    });
  } catch (error) {
    next(error);
  }
}

export async function postConversations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { otherUserId } = req.body;
    if (!otherUserId || typeof otherUserId !== 'string') {
      throw new AppError('otherUserId is required', 400, ErrorCodes.VALIDATION_ERROR);
    }

    const [id1, id2] = sortPair(userId, otherUserId.trim());

    let row = queryOne<{ id: string; user1_id: string; user2_id: string; updated_at: string }>(
      'SELECT id, user1_id, user2_id, updated_at FROM conversations WHERE user1_id = ? AND user2_id = ?',
      [id1, id2]
    );

    let created = false;
    if (!row) {
      created = true;
      const id = uuidv4();
      execute(
        "INSERT INTO conversations (id, user1_id, user2_id, updated_at) VALUES (?, ?, ?, datetime('now'))",
        [id, id1, id2]
      );
      row = queryOne<{ id: string; user1_id: string; user2_id: string; updated_at: string }>(
        'SELECT id, user1_id, user2_id, updated_at FROM conversations WHERE id = ?',
        [id]
      );
      if (!row) {
        throw new AppError('Failed to create conversation', 500, ErrorCodes.INTERNAL_ERROR);
      }
    }

    const u1 = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [row.user1_id]);
    const u2 = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [row.user2_id]);
    const conversation: ConversationResponse = {
      id: row.id,
      participantIds: [row.user1_id, row.user2_id],
      participantNames: [u1?.name ?? '', u2?.name ?? ''],
      updatedAt: toISO(row.updated_at),
    };

    res.status(created ? 201 : 200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
}

function assertParticipant(conv: { user1_id: string; user2_id: string } | null, userId: string): boolean {
  return !!conv && (conv.user1_id === userId || conv.user2_id === userId);
}

export async function getConversation(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id } = req.params;
    const row = queryOne<{ id: string; user1_id: string; user2_id: string; updated_at: string }>(
      'SELECT id, user1_id, user2_id, updated_at FROM conversations WHERE id = ?',
      [id]
    );

    if (!row || !assertParticipant(row, userId)) {
      throw new AppError('Conversation not found', 404, ErrorCodes.NOT_FOUND);
    }

    const u1 = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [row.user1_id]);
    const u2 = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [row.user2_id]);
    const conversation: ConversationResponse = {
      id: row.id,
      participantIds: [row.user1_id, row.user2_id],
      participantNames: [u1?.name ?? '', u2?.name ?? ''],
      updatedAt: toISO(row.updated_at),
    };

    res.json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id: conversationId } = req.params;
    const conv = queryOne<{ user1_id: string; user2_id: string }>(
      'SELECT user1_id, user2_id FROM conversations WHERE id = ?',
      [conversationId]
    );

    if (!conv || !assertParticipant(conv, userId)) {
      throw new AppError('Conversation not found', 404, ErrorCodes.NOT_FOUND);
    }

    // LMS-PAGINATION-001: paginate messages
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const rows = query<{ id: string; conversation_id: string; sender_id: string; body: string; created_at: string; is_deleted: number }>(
      `SELECT id, conversation_id, sender_id,
              CASE WHEN is_deleted = 1 THEN NULL ELSE body END AS body,
              created_at, is_deleted
       FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      [conversationId, limit, offset]
    );

    const messages: MessageResponse[] = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      body: r.body,
      createdAt: toISO(r.created_at),
      isDeleted: r.is_deleted === 1,
    }));

    res.json({
      success: true,
      data: { messages },
    });
  } catch (error) {
    next(error);
  }
}

export async function getUnreadCount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    // Count conversations that have messages from the OTHER participant newer than last read
    const row = queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM conversations c
       WHERE (c.user1_id = ? OR c.user2_id = ?)
         AND (
           -- at least one message not sent by me
           EXISTS (
             SELECT 1 FROM conversation_messages m
             WHERE m.conversation_id = c.id AND m.sender_id != ?
           )
         )
         AND (
           -- never read this conversation
           NOT EXISTS (SELECT 1 FROM conversation_reads r WHERE r.user_id = ? AND r.conversation_id = c.id)
           OR
           -- last read before the most recent message from the other person
           (
             SELECT MAX(m2.created_at) FROM conversation_messages m2
             WHERE m2.conversation_id = c.id AND m2.sender_id != ?
           ) > (
             SELECT r2.last_read_at FROM conversation_reads r2
             WHERE r2.user_id = ? AND r2.conversation_id = c.id
           )
         )`,
      [userId, userId, userId, userId, userId, userId]
    );

    res.json({ success: true, data: { count: row?.count ?? 0 } });
  } catch (error) {
    next(error);
  }
}

export async function markConversationRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id: conversationId } = req.params;
    const conv = queryOne<{ user1_id: string; user2_id: string }>(
      'SELECT user1_id, user2_id FROM conversations WHERE id = ?',
      [conversationId]
    );
    if (!conv || !assertParticipant(conv, userId)) {
      throw new AppError('Conversation not found', 404, ErrorCodes.NOT_FOUND);
    }

    const now = new Date().toISOString();
    execute(
      `INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, conversation_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
      [userId, conversationId, now]
    );

    res.json({ success: true, data: { lastReadAt: now } });
  } catch (error) {
    next(error);
  }
}

export async function postMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { id: conversationId } = req.params;
    const { body } = req.body;

    const conv = queryOne<{ id: string }>('SELECT id FROM conversations WHERE id = ?', [conversationId]);
    const convCheck = queryOne<{ user1_id: string; user2_id: string }>(
      'SELECT user1_id, user2_id FROM conversations WHERE id = ?',
      [conversationId]
    );
    if (!conv || !convCheck || !assertParticipant(convCheck, userId)) {
      throw new AppError('Conversation not found', 404, ErrorCodes.NOT_FOUND);
    }

    // Messaging rate limit: 10/hr per new contact (< 24h first message)
    const firstMsg = queryOne<{ created_at: string }>(
      `SELECT MIN(created_at) as created_at FROM conversation_messages WHERE conversation_id = ?`,
      [conversationId],
    );

    if (firstMsg?.created_at) {
      // Handle both SQLite 'YYYY-MM-DD HH:MM:SS' and ISO 'YYYY-MM-DDTHH:MM:SS.sssZ' formats
      const normalised = firstMsg.created_at.includes('T')
        ? firstMsg.created_at
        : firstMsg.created_at.replace(' ', 'T') + 'Z';
      const firstMsgAge = Date.now() - new Date(normalised).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;

      if (firstMsgAge < twentyFourHours) {
        // New contact — check rate
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const recentCount = queryOne<{ cnt: number }>(
          'SELECT COUNT(*) as cnt FROM conversation_messages WHERE conversation_id = ? AND sender_id = ? AND created_at > ?',
          [conversationId, userId, oneHourAgo],
        );
        if (recentCount && recentCount.cnt >= 10) {
          throw new AppError('Message rate limit exceeded for new contact', 429, ErrorCodes.RATE_LIMITED);
        }
      }
    }

    const errors: Array<{ field: string; message: string }> = [];
    if (body === undefined || body === null || (typeof body === 'string' && body.trim() === '')) {
      errors.push({ field: 'body', message: 'Body is required' });
    }
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    const messageId = uuidv4();
    const bodyText = escapeHtml(typeof body === 'string' ? body.trim() : String(body));
    const now = new Date().toISOString();

    execute(
      'INSERT INTO conversation_messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      [messageId, conversationId, userId, bodyText, now]
    );
    execute('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);

    const message: MessageResponse = {
      id: messageId,
      conversationId,
      senderId: userId,
      body: bodyText,
      createdAt: now,
    };

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { messageId } = req.params;

    const msg = queryOne<{ id: string; conversation_id: string; sender_id: string; is_deleted: number; body: string }>(
      'SELECT id, conversation_id, sender_id, is_deleted, body FROM conversation_messages WHERE id = ?',
      [messageId]
    );

    if (!msg) {
      throw new AppError('Message not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (msg.is_deleted === 1) {
      throw new AppError('Message already deleted', 409, ErrorCodes.ALREADY_DELETED);
    }

    // Check the user is a participant in the conversation
    const conv = queryOne<{ user1_id: string; user2_id: string }>(
      'SELECT user1_id, user2_id FROM conversations WHERE id = ?',
      [msg.conversation_id]
    );

    if (!conv || !assertParticipant(conv, userId)) {
      throw new AppError('Not authorized to delete this message', 403, ErrorCodes.FORBIDDEN);
    }

    // Only the sender can self-delete
    if (msg.sender_id !== userId) {
      throw new AppError('Not authorized to delete this message', 403, ErrorCodes.FORBIDDEN);
    }

    execute(
      `UPDATE conversation_messages
       SET is_deleted = 1, deleted_at = datetime('now'), deleted_by = ?, deletion_type = 'self_delete'
       WHERE id = ? AND is_deleted = 0`,
      [userId, messageId]
    );

    auditLog({
      action: 'message.deleted',
      actorId: userId,
      targetId: messageId,
      details: JSON.stringify({
        conversation_id: msg.conversation_id,
        body_length: msg.body.length,
        deletion_type: 'self_delete',
      }),
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function adminDeleteMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminId = req.user?.userId;
    if (!adminId) {
      throw new AppError('Authentication required', 401, ErrorCodes.UNAUTHORIZED);
    }

    const { messageId } = req.params;

    const msg = queryOne<{ id: string; conversation_id: string; sender_id: string; is_deleted: number; body: string }>(
      'SELECT id, conversation_id, sender_id, is_deleted, body FROM conversation_messages WHERE id = ?',
      [messageId]
    );

    if (!msg) {
      throw new AppError('Message not found', 404, ErrorCodes.NOT_FOUND);
    }

    if (msg.is_deleted === 1) {
      throw new AppError('Message already deleted', 409, ErrorCodes.ALREADY_DELETED);
    }

    execute(
      `UPDATE conversation_messages
       SET is_deleted = 1, deleted_at = datetime('now'), deleted_by = ?, deletion_type = 'admin_delete'
       WHERE id = ? AND is_deleted = 0`,
      [adminId, messageId]
    );

    auditLog({
      action: 'message.admin_deleted',
      actorId: adminId,
      targetId: messageId,
      details: JSON.stringify({
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        body_preview: msg.body.slice(0, 100),
        deletion_type: 'admin_delete',
      }),
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
}

export async function adminGetConversationMessages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { conversationId } = req.params;

    const rows = query<{
      id: string; conversation_id: string; sender_id: string; body: string;
      created_at: string; is_deleted: number; deleted_at: string | null;
      deleted_by: string | null; deletion_type: string | null;
      sender_name: string | null; sender_email: string | null;
      original_name: string | null; original_email: string | null;
    }>(
      `SELECT cm.id, cm.conversation_id, cm.sender_id, cm.body, cm.created_at,
              cm.is_deleted, cm.deleted_at, cm.deleted_by, cm.deletion_type,
              u.name AS sender_name, u.email AS sender_email,
              du.original_name, du.original_email
       FROM conversation_messages cm
       LEFT JOIN users u ON u.id = cm.sender_id
       LEFT JOIN deleted_user_identities du ON du.user_id = cm.sender_id
       WHERE cm.conversation_id = ?
       ORDER BY cm.created_at ASC`,
      [conversationId]
    );

    const messages: AdminMessageResponse[] = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      body: r.body,
      createdAt: toISO(r.created_at),
      isDeleted: r.is_deleted === 1,
      deletedAt: r.deleted_at,
      deletedBy: r.deleted_by,
      deletionType: r.deletion_type,
      senderName: r.sender_name ?? undefined,
      senderEmail: r.sender_email ?? undefined,
      originalSenderName: r.original_name,
      originalSenderEmail: r.original_email,
    }));

    res.json({ success: true, data: { messages } });
  } catch (error) {
    next(error);
  }
}

export async function adminGetMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { messageId } = req.params;

    const row = queryOne<{
      id: string; conversation_id: string; sender_id: string; body: string;
      created_at: string; is_deleted: number; deleted_at: string | null;
      deleted_by: string | null; deletion_type: string | null;
      sender_name: string | null; sender_email: string | null;
      original_name: string | null; original_email: string | null;
    }>(
      `SELECT cm.id, cm.conversation_id, cm.sender_id, cm.body, cm.created_at,
              cm.is_deleted, cm.deleted_at, cm.deleted_by, cm.deletion_type,
              u.name AS sender_name, u.email AS sender_email,
              du.original_name, du.original_email
       FROM conversation_messages cm
       LEFT JOIN users u ON u.id = cm.sender_id
       LEFT JOIN deleted_user_identities du ON du.user_id = cm.sender_id
       WHERE cm.id = ?`,
      [messageId]
    );

    if (!row) {
      throw new AppError('Message not found', 404, ErrorCodes.NOT_FOUND);
    }

    const message: AdminMessageResponse = {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: toISO(row.created_at),
      isDeleted: row.is_deleted === 1,
      deletedAt: row.deleted_at,
      deletedBy: row.deleted_by,
      deletionType: row.deletion_type,
      senderName: row.sender_name ?? undefined,
      senderEmail: row.sender_email ?? undefined,
      originalSenderName: row.original_name,
      originalSenderEmail: row.original_email,
    };

    res.json({ success: true, data: { message } });
  } catch (error) {
    next(error);
  }
}
