/**
 * Invoice/Receipt PDF generation — Phase 16 C1.
 *
 * Generates PDF receipts for confirmed/waived payments.
 * Uses pdfkit (pure JS, no native dependencies).
 */

import PDFDocument from 'pdfkit';
import { queryOne } from '../config/database.js';

export interface ReceiptData {
  paymentId: string;
  studentName: string;
  studentEmail: string;
  courseName: string;
  courseCode: string;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
  paystackReference: string | null;
  stellarTxHash: string | null;
  stellarMemo: string | null;
  notes: string | null;
}

/**
 * Fetch receipt data by payment ID with JOINs to users and courses.
 * Returns null if payment not found.
 */
export function getReceiptData(paymentId: string): ReceiptData | null {
  const row = queryOne<{
    id: string;
    user_id: string;
    student_name: string;
    student_email: string;
    course_name: string;
    course_code: string;
    amount_cents: number;
    currency: string;
    payment_method: string;
    status: string;
    confirmed_at: string | null;
    created_at: string;
    paystack_reference: string | null;
    stellar_tx_hash: string | null;
    stellar_memo: string | null;
    notes: string | null;
  }>(`
    SELECT
      p.id,
      p.user_id,
      u.name        AS student_name,
      u.email       AS student_email,
      c.title       AS course_name,
      c.course_code AS course_code,
      p.amount_cents,
      p.currency,
      p.payment_method,
      p.status,
      p.confirmed_at,
      p.created_at,
      p.paystack_reference,
      p.stellar_tx_hash,
      p.stellar_memo,
      p.notes
    FROM payments p
    JOIN users u ON u.id = p.user_id
    JOIN courses c ON c.id = p.course_id
    WHERE p.id = ?
  `, [paymentId]);

  if (!row) return null;

  return {
    paymentId: row.id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    courseName: row.course_name,
    courseCode: row.course_code,
    amountCents: row.amount_cents,
    currency: row.currency,
    paymentMethod: row.payment_method,
    status: row.status,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    paystackReference: row.paystack_reference,
    stellarTxHash: row.stellar_tx_hash,
    stellarMemo: row.stellar_memo,
    notes: row.notes,
  };
}

/** Format cents as currency string (e.g. 1500 → "$15.00") */
function formatAmount(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  const symbols: Record<string, string> = { USD: '$', ZAR: 'R', NGN: '₦' };
  return `${symbols[currency] ?? currency + ' '}${amount}`;
}

/** Format payment method for display */
function formatMethod(method: string): string {
  const labels: Record<string, string> = {
    manual: 'Manual / Bank Transfer',
    paystack: 'Paystack (Card)',
    stellar_xlm: 'Stellar (XLM)',
    stellar_usdc: 'Stellar (USDC)',
    waived: 'Waived',
  };
  return labels[method] ?? method;
}

/** Format date string for display */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate a PDF receipt buffer for the given payment data.
 * Returns a Buffer containing the PDF.
 */
export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text('Payment Receipt', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666666').text('SM Web Systems — Blockchain Academy LMS', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).text('https://lms.smwebsystems.com', { align: 'center' });
    doc.moveDown(1.5);

    // Divider
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);

    // Receipt details
    doc.fillColor('#000000').fontSize(11);

    const labelX = 50;
    const valueX = 200;

    const addRow = (label: string, value: string) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').text(label, labelX, y, { width: 140 });
      doc.font('Helvetica').text(value, valueX, y, { width: 340 });
      doc.moveDown(0.6);
    };

    addRow('Receipt No:', data.paymentId.slice(0, 8).toUpperCase());
    addRow('Date:', formatDate(data.confirmedAt ?? data.createdAt));
    addRow('Student:', data.studentName);
    addRow('Email:', data.studentEmail);

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#eeeeee').stroke();
    doc.moveDown(0.8);

    addRow('Course:', data.courseName);
    addRow('Course Code:', data.courseCode);
    addRow('Amount:', formatAmount(data.amountCents, data.currency));
    addRow('Payment Method:', formatMethod(data.paymentMethod));
    addRow('Status:', data.status === 'confirmed' ? 'Paid' : data.status === 'waived' ? 'Waived' : data.status);

    if (data.confirmedAt) {
      addRow('Confirmed:', formatDate(data.confirmedAt));
    }

    // Payment reference details
    if (data.paystackReference) {
      addRow('Paystack Ref:', data.paystackReference);
    }
    if (data.stellarTxHash) {
      addRow('Stellar TX:', data.stellarTxHash.slice(0, 16) + '...');
    }
    if (data.stellarMemo) {
      addRow('Stellar Memo:', data.stellarMemo);
    }

    if (data.notes) {
      doc.moveDown(0.5);
      addRow('Notes:', data.notes);
    }

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.8);
    doc.fontSize(8).fillColor('#999999')
      .text(`Generated on ${new Date().toISOString().slice(0, 10)}. This is an electronically generated receipt.`, {
        align: 'center',
      });

    doc.end();
  });
}
