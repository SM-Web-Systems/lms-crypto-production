import { query, queryOne, execute } from '../config/database.js';
import { ZipArchive } from 'archiver';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function assembleExport(exportId: string, userId: string): void {
  // Mark as processing
  execute("UPDATE data_exports SET status = 'processing' WHERE id = ?", [exportId]);

  setImmediate(() => {
    try {
      const tmpDir = os.tmpdir();
      const filePath = path.join(tmpDir, `export-${exportId}.zip`);
      const output = fs.createWriteStream(filePath);
      const archive = new ZipArchive({ zlib: { level: 9 } });

      output.on('close', () => {
        execute(
          "UPDATE data_exports SET status = 'ready', file_path = ?, completed_at = datetime('now') WHERE id = ?",
          [filePath, exportId],
        );
      });

      archive.on('error', (err: Error) => {
        execute(
          "UPDATE data_exports SET status = 'failed', error = ? WHERE id = ?",
          [err.message, exportId],
        );
      });

      archive.pipe(output);

      // Profile
      const user = queryOne<Record<string, unknown>>(
        'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
        [userId],
      );
      archive.append(JSON.stringify(user, null, 2), { name: 'profile.json' });

      // Submissions — submissions.student_id references students.id; students.user_id references users.id
      const submissions = query<Record<string, unknown>>(
        `SELECT s.id, s.course_id, s.item_id, s.file_name, s.feedback, s.status, s.submitted_at
         FROM submissions s
         JOIN students st ON s.student_id = st.id
         WHERE st.user_id = ?`,
        [userId],
      );
      archive.append(JSON.stringify(submissions, null, 2), { name: 'submissions.json' });

      // Certificates
      const certs = query<Record<string, unknown>>(
        'SELECT id, course_id, contract_id, mint_status, tx_hash, created_at FROM nft_credentials WHERE user_id = ?',
        [userId],
      );
      archive.append(JSON.stringify(certs, null, 2), { name: 'certificates.json' });

      // Messages
      const messages = query<Record<string, unknown>>(
        'SELECT cm.id, cm.conversation_id, cm.body, cm.created_at FROM conversation_messages cm WHERE cm.sender_id = ? ORDER BY cm.created_at',
        [userId],
      );
      archive.append(JSON.stringify(messages, null, 2), { name: 'messages.json' });

      // Login history
      const history = query<Record<string, unknown>>(
        'SELECT login_at, ip_address, user_agent, auth_method FROM login_history WHERE user_id = ? ORDER BY login_at',
        [userId],
      );
      archive.append(JSON.stringify(history, null, 2), { name: 'login-history.json' });

      // Notifications
      const notifications = query<Record<string, unknown>>(
        'SELECT id, type, title, body, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at',
        [userId],
      );
      archive.append(JSON.stringify(notifications, null, 2), { name: 'notifications.json' });

      // Forum topics (if forum tables exist)
      const hasForumTopics = queryOne<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='forum_topics'"
      );
      if (hasForumTopics) {
        const forumTopics = query<Record<string, unknown>>(
          'SELECT id, title, body, course_id, created_at, updated_at FROM forum_topics WHERE author_id = ? ORDER BY created_at',
          [userId],
        );
        archive.append(JSON.stringify(forumTopics, null, 2), { name: 'forum-topics.json' });

        const forumPosts = query<Record<string, unknown>>(
          'SELECT id, topic_id, body, created_at, updated_at FROM forum_posts WHERE author_id = ? ORDER BY created_at',
          [userId],
        );
        archive.append(JSON.stringify(forumPosts, null, 2), { name: 'forum-posts.json' });
      }

      archive.finalize();
    } catch (err) {
      execute(
        "UPDATE data_exports SET status = 'failed', error = ? WHERE id = ?",
        [(err as Error).message, exportId],
      );
    }
  });
}
