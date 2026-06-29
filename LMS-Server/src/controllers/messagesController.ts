import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../config/database.js';
import { AuthRequest, ConversationResponse, MessageResponse, ErrorCodes } from '../types/index.js';
import { AppError } from '../middleware/errorHandler.js';

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

    const rows = query<{ id: string; conversation_id: string; sender_id: string; body: string; created_at: string }>(
      'SELECT id, conversation_id, sender_id, body, created_at FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversationId]
    );

    const messages: MessageResponse[] = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      body: r.body,
      createdAt: toISO(r.created_at),
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

    const errors: Array<{ field: string; message: string }> = [];
    if (body === undefined || body === null || (typeof body === 'string' && body.trim() === '')) {
      errors.push({ field: 'body', message: 'Body is required' });
    }
    if (errors.length > 0) {
      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
    }

    const messageId = uuidv4();
    const bodyText = typeof body === 'string' ? body.trim() : String(body);
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
