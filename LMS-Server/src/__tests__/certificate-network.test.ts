/**
 * UX-023: a course certificate records the network it was really issued on, and the
 * application and progress responses carry it, so explorer links point at the right network.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';
import * as mintModule from '../services/mintService.js';
import { upgradeCertificateEmailCopy, LEGACY_CERTIFICATE_EMAIL } from '../config/database.js';

const HASH = bcrypt.hashSync('password123', 4);
const WALLET = 'GBVRLTX5AKI6TS5TAENKN3CMRM2EWORUD6CKDVV4K5E54DGJD3W7LP4I';
const FAKE_TX = 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
const CONTRACT = 'CDPKSOOE4UZFM4TS52H7LMP2TYNLJBFAMT6M4E2H67KZEAH6UF54H524';

function seed() {
  const adminId = uuidv4();
  const studentId = uuidv4();
  const courseId = uuidv4();
  const appId = uuidv4();
  const code = `CN-${uuidv4().slice(0, 8)}`;
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES
      ('${adminId}', 'CN Admin', 'cn-admin-${adminId}@test.com', '${HASH}', 'admin', NULL, 'none'),
      ('${studentId}', 'CN Student', 'cn-student-${studentId}@test.com', '${HASH}', 'student', '${WALLET}', 'linked');
    INSERT INTO courses (id, title, description, course_code, sections)
    VALUES ('${courseId}', 'CN Course', 'desc', '${code}', '[]');
    INSERT INTO user_course_codes (user_id, course_code) VALUES ('${studentId}', '${code}');
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status, applied_at)
    VALUES ('${appId}', '${studentId}', '${courseId}', '${WALLET}', 'approved', datetime('now'));
  `);
  return {
    courseId,
    appId,
    admin: makeToken({ userId: adminId, email: `cn-admin-${adminId}@test.com`, role: 'admin' }),
    student: makeToken({ userId: studentId, email: `cn-student-${studentId}@test.com`, role: 'student' }),
  };
}

beforeEach(() => {
  process.env.NFT_CONTRACT_ID = CONTRACT;
  vi.stubEnv('NFT_STELLAR_NETWORK', 'testnet');
});
afterEach(() => {
  delete process.env.NFT_CONTRACT_ID;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('certificate network on testnet', () => {
  it('records testnet on the credential and returns it on applications and progress', async () => {
    const { courseId, appId, admin, student } = seed();
    vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: FAKE_TX });

    const mint = await request(app)
      .post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`)
      .set('Authorization', `Bearer ${admin}`);
    expect(mint.status).toBe(200);

    const row = db.prepare('SELECT network FROM nft_credentials WHERE application_id = ?').get(appId) as { network: string };
    expect(row.network).toBe('testnet');

    const adminList = await request(app).get('/api/v1/admin/certificates').set('Authorization', `Bearer ${admin}`);
    const listed = (adminList.body.data.certificates as { applicationId: string; network: string | null }[])
      .find((c) => c.applicationId === appId);
    expect(listed?.network).toBe('testnet');

    const own = await request(app)
      .get(`/api/v1/courses/${courseId}/completions/applications?view=own`)
      .set('Authorization', `Bearer ${student}`);
    expect(own.body.data.applications[0].network).toBe('testnet');

    const progress = await request(app).get('/api/v1/students/me/progress').set('Authorization', `Bearer ${student}`);
    const course = (progress.body.data.courses as { courseId: string; network: string | null }[]).find((c) => c.courseId === courseId);
    expect(course?.network).toBe('testnet');
  });
});

describe('certificate copy for learners (UX-023)', () => {
  const banned = /\b(NFT|badge|credential|mint(ed|ing)?)\b/i;

  it('tells the learner their certificate was issued, without NFT or mint words', async () => {
    const { courseId, appId, admin } = seed();
    vi.spyOn(mintModule, 'mintCredential').mockResolvedValue({ txHash: FAKE_TX });
    await request(app).post(`/api/v1/courses/${courseId}/completions/applications/${appId}/mint`).set('Authorization', `Bearer ${admin}`);

    const n = db.prepare(
      `SELECT n.title, n.body FROM notifications n JOIN course_nft_applications a ON a.user_id = n.user_id
       WHERE a.id = ? AND n.type = 'nft_minted'`,
    ).get(appId) as { title: string; body: string };
    expect(n.title).toBe('Certificate Issued');
    expect(`${n.title} ${n.body}`).not.toMatch(banned);
  });

  it('seeds the certificate email without NFT or mint words', () => {
    const row = db.prepare("SELECT subject, body_html FROM email_templates WHERE slug = 'certificate-minted'").get() as { subject: string; body_html: string };
    expect(`${row.subject} ${row.body_html}`).not.toMatch(banned);
  });

  it('replaces the old default certificate email, but never one an admin edited', () => {
    db.prepare("UPDATE email_templates SET subject = ? WHERE slug = 'certificate-minted'").run(LEGACY_CERTIFICATE_EMAIL.subject);
    db.prepare("UPDATE email_templates SET body_html = ? WHERE slug = 'certificate-minted'").run(LEGACY_CERTIFICATE_EMAIL.bodyHtml);
    upgradeCertificateEmailCopy();
    const row = db.prepare("SELECT subject FROM email_templates WHERE slug = 'certificate-minted'").get() as { subject: string };
    expect(row.subject).not.toMatch(banned);

    db.prepare("UPDATE email_templates SET subject = 'Custom NFT news', body_html = ? WHERE slug = 'certificate-minted'").run(LEGACY_CERTIFICATE_EMAIL.bodyHtml);
    upgradeCertificateEmailCopy();
    const edited = db.prepare("SELECT subject FROM email_templates WHERE slug = 'certificate-minted'").get() as { subject: string };
    expect(edited.subject).toBe('Custom NFT news');
  });
});
