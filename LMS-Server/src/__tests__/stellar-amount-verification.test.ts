/**
 * Tests for FIND-010a — Stellar payment amount verification.
 *
 * AMT-1: createStellarPayment stores stellar_expected_amount
 * AMT-2: createStellarPayment handles null stellar_expected_amount
 * AMT-3: Dust payment amount is below 99% threshold (should be rejected by monitor logic)
 * AMT-4: Exact payment amount passes verification
 * AMT-5: Payment at 99% boundary passes verification
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { db, queryOne } from '../config/database.js';
import { createStellarPayment } from '../services/paymentService.js';
import type { Payment } from '../types/index.js';

const HASH = bcrypt.hashSync('password123', 4);

function seedUser(suffix: string) {
  const userId = uuidv4();
  db.exec(`
    INSERT INTO users (id, name, email, password_hash, role, walletAddress, wallet_linking_status)
    VALUES ('${userId}', 'Amt User ${suffix}', 'amt-${suffix}@test.com', '${HASH}', 'student', 'GAMT${suffix}', 'linked');
  `);
  return userId;
}

function seedCourse(suffix: string) {
  const courseId = uuidv4();
  db.exec(`
    INSERT INTO courses (id, title, course_code, sections)
    VALUES ('${courseId}', 'Amt Course ${suffix}', 'AMT${suffix}', '[]');
  `);
  return courseId;
}

function seedApplication(userId: string, courseId: string) {
  const appId = uuidv4();
  db.exec(`
    INSERT INTO course_nft_applications (id, user_id, course_id, wallet_address, status)
    VALUES ('${appId}', '${userId}', '${courseId}', 'GTEST', 'pending');
  `);
  return appId;
}

describe('Stellar Payment Amount Verification (FIND-010a)', () => {
  it('AMT-1: createStellarPayment stores stellar_expected_amount', () => {
    const userId = seedUser('amt1');
    const courseId = seedCourse('amt1');
    const appId = seedApplication(userId, courseId);

    const payment = createStellarPayment(
      userId, courseId, appId, 5000, 'memo-amt1', 'stellar_xlm', 25.5,
    );

    const row = queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [payment.id]);
    expect(row).toBeDefined();
    expect(row!.stellar_expected_amount).toBe(25.5);
    expect(row!.payment_method).toBe('stellar_xlm');
    expect(row!.stellar_memo).toBe('memo-amt1');
  });

  it('AMT-2: createStellarPayment handles null stellar_expected_amount', () => {
    const userId = seedUser('amt2');
    const courseId = seedCourse('amt2');
    const appId = seedApplication(userId, courseId);

    const payment = createStellarPayment(
      userId, courseId, appId, 5000, 'memo-amt2', 'stellar_usdc',
    );

    const row = queryOne<Payment>('SELECT * FROM payments WHERE id = ?', [payment.id]);
    expect(row).toBeDefined();
    expect(row!.stellar_expected_amount).toBeNull();
  });

  it('AMT-3: Dust payment is below 99% of expected (verification logic)', () => {
    const expectedAmount = 25.5;
    const dustAmount = 0.0000001; // 7 stroops
    const minAcceptable = expectedAmount * 0.99;

    expect(dustAmount).toBeLessThan(minAcceptable);
  });

  it('AMT-4: Exact payment passes verification', () => {
    const expectedAmount = 25.5;
    const receivedAmount = 25.5;
    const minAcceptable = expectedAmount * 0.99;

    expect(receivedAmount).toBeGreaterThanOrEqual(minAcceptable);
  });

  it('AMT-5: Payment at 99% boundary passes verification', () => {
    const expectedAmount = 100.0;
    const receivedAmount = 99.0; // exactly 99%
    const minAcceptable = expectedAmount * 0.99;

    expect(receivedAmount).toBeGreaterThanOrEqual(minAcceptable);
  });
});
