/**
 * Tests for Phase 22 C2 — Cohort Status Transitions (Lazy Evaluation).
 *
 * CST-1  — admin can transition draft → active via PATCH
 * CST-2  — admin can transition active → completed via PATCH
 * CST-3  — invalid transition (completed → draft) rejected with 400
 * CST-4  — lazy evaluation auto-transitions draft → active on start_date
 * CST-5  — lazy evaluation auto-transitions active → completed on end_date
 * CST-6  — status-log records all transitions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import app from '../app.js';
import { db } from '../config/database.js';
import { makeToken } from './helpers/auth.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(role: 'admin' | 'student', suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, wallet_linking_status)
    VALUES ('${userId}', 'User ${suffix}', '${suffix}@test.com', '${HASH}', '${role}', 'none');
  `);
  return userId;
}

function seedCourse(title: string, code: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', '${title}', '${code}', '[]');
  `);
  return courseId;
}

describe('Cohort Status Transitions (C2)', () => {
  let adminId: string;
  let adminToken: string;
  let courseId: string;

  beforeEach(() => {
    adminId = seedUser('admin', 'cst-admin');
    adminToken = makeToken({ userId: adminId, email: 'cst-admin@test.com', role: 'admin' });
    courseId = seedCourse('CST Course', 'CST-101');
  });

  function createCohort(overrides?: { startDate?: string; endDate?: string; status?: string }) {
    const cohortId = uuidv4();
    const status = overrides?.status ?? 'draft';
    db.exec(`
      INSERT INTO sponsor_cohorts (id, name, sponsor_user_id, course_id, selected_tier, status, start_date, end_date, created_at)
      VALUES ('${cohortId}', 'Test Cohort', '${adminId}', '${courseId}', 'free', '${status}',
              ${overrides?.startDate ? `'${overrides.startDate}'` : 'NULL'},
              ${overrides?.endDate ? `'${overrides.endDate}'` : 'NULL'},
              datetime('now'));
    `);
    return cohortId;
  }

  describe('CST-1: admin override draft → active', () => {
    it('transitions successfully', async () => {
      const cohortId = createCohort();
      const res = await request(app)
        .patch(`/api/v1/admin/cohorts/${cohortId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active', reason: 'Manual activation' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('active');
    });
  });

  describe('CST-2: admin override active → completed', () => {
    it('transitions successfully', async () => {
      const cohortId = createCohort({ status: 'active' });
      const res = await request(app)
        .patch(`/api/v1/admin/cohorts/${cohortId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('completed');
    });
  });

  describe('CST-3: invalid transition rejected', () => {
    it('rejects completed → active', async () => {
      const cohortId = createCohort({ status: 'completed' });
      const res = await request(app)
        .patch(`/api/v1/admin/cohorts/${cohortId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });

      expect(res.status).toBe(400);
    });
  });

  describe('CST-4: lazy evaluation draft → active on start_date', () => {
    it('auto-transitions when start_date is past', async () => {
      const cohortId = createCohort({ startDate: '2020-01-01T00:00:00Z' });

      const res = await request(app)
        .get(`/api/v1/admin/cohorts`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const cohort = res.body.data.cohorts.find((c: any) => c.cohortId === cohortId);
      expect(cohort.status).toBe('active');
    });
  });

  describe('CST-5: lazy evaluation active → completed on end_date', () => {
    it('auto-transitions when end_date is past', async () => {
      const cohortId = createCohort({ status: 'active', endDate: '2020-01-01T00:00:00Z' });

      const res = await request(app)
        .get(`/api/v1/admin/cohorts`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const cohort = res.body.data.cohorts.find((c: any) => c.cohortId === cohortId);
      expect(cohort.status).toBe('completed');
    });
  });

  describe('CST-6: status-log records transitions', () => {
    it('returns log entries for all transitions', async () => {
      const cohortId = createCohort();

      // Transition draft → active
      await request(app)
        .patch(`/api/v1/admin/cohorts/${cohortId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active', reason: 'Test activation' });

      // Transition active → completed
      await request(app)
        .patch(`/api/v1/admin/cohorts/${cohortId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed', reason: 'Test completion' });

      // Get log
      const res = await request(app)
        .get(`/api/v1/admin/cohorts/${cohortId}/status-log`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.log).toHaveLength(2);
      const statuses = res.body.data.log.map((l: any) => l.toStatus).sort();
      expect(statuses).toEqual(['active', 'completed']);
    });
  });
});
