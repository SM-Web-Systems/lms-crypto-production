/**
 * Sponsor cohort payment requests that an administrator approves or declines.
 * Approval records the decision and settles the learners' certificate payments; no money moves here.
 */
import api from './api';
import { assertApiSuccess } from '../utils/apiError';
import type { ApiResponse } from '../types/api';

export type CohortPaymentStatus = 'pending' | 'approved' | 'declined';

export interface CohortPaymentRequest {
  paymentId: string;
  cohortId: string;
  cohortName: string;
  courseName: string | null;
  sponsorUserId: string;
  sponsorName: string | null;
  sponsorEmail: string | null;
  amountCents: number;
  currency: string;
  learnerCount: number;
  status: CohortPaymentStatus;
  paymentStatus: string;
  declineReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export const cohortPaymentService = {
  async list(status?: CohortPaymentStatus): Promise<CohortPaymentRequest[]> {
    const res = await api.get<ApiResponse<{ requests: CohortPaymentRequest[] }>>('/admin/cohort-payments', { params: status ? { status } : {} });
    return assertApiSuccess(res, 'Could not load cohort payment requests').requests;
  },
  async approve(paymentId: string): Promise<CohortPaymentRequest & { learnersSettled: number }> {
    const res = await api.post<ApiResponse<CohortPaymentRequest & { learnersSettled: number }>>(`/admin/cohort-payments/${encodeURIComponent(paymentId)}/approve`, {});
    return assertApiSuccess(res, 'Could not approve the payment request');
  },
  async decline(paymentId: string, reason: string): Promise<CohortPaymentRequest> {
    const res = await api.post<ApiResponse<CohortPaymentRequest>>(`/admin/cohort-payments/${encodeURIComponent(paymentId)}/decline`, { reason });
    return assertApiSuccess(res, 'Could not decline the payment request');
  },
};
