/**
 * cohortService — Phase 11 C3: frontend API for sponsor cohort management.
 */

import api from './api';
import type { SponsorCohortSummary, CohortMemberDetail, CohortCompletionStats, BulkApplyResult, CertificateTier } from '../types/api';

export const cohortService = {
  async createCohort(params: {
    name: string;
    courseId: string;
    selectedTier: CertificateTier;
    memberUserIds?: string[];
  }): Promise<SponsorCohortSummary> {
    const res = await api.post<{ success: boolean; data: SponsorCohortSummary }>('/admin/cohorts', params);
    return res.data.data;
  },

  async listCohorts(courseId?: string): Promise<SponsorCohortSummary[]> {
    const qs = courseId ? `?courseId=${courseId}` : '';
    const res = await api.get<{ success: boolean; data: { cohorts: SponsorCohortSummary[] } }>(`/admin/cohorts${qs}`);
    return res.data.data?.cohorts ?? [];
  },

  async getCohort(cohortId: string): Promise<{ cohort: SponsorCohortSummary; members: CohortMemberDetail[]; completionStats: CohortCompletionStats }> {
    const res = await api.get<{ success: boolean; data: { cohort: SponsorCohortSummary; members: CohortMemberDetail[]; completionStats: CohortCompletionStats } }>(
      `/admin/cohorts/${cohortId}`,
    );
    return res.data.data;
  },

  async addMembers(cohortId: string, userIds: string[]): Promise<{ added: number; skipped: number }> {
    const res = await api.post<{ success: boolean; data: { added: number; skipped: number } }>(
      `/admin/cohorts/${cohortId}/members`,
      { userIds },
    );
    return res.data.data;
  },

  async removeMember(cohortId: string, userId: string): Promise<void> {
    await api.delete(`/admin/cohorts/${cohortId}/members/${userId}`);
  },

  async bulkApply(cohortId: string): Promise<BulkApplyResult> {
    const res = await api.post<{ success: boolean; data: BulkApplyResult }>(
      `/admin/cohorts/${cohortId}/apply`,
    );
    return res.data.data;
  },

  async bulkPay(cohortId: string): Promise<{ paymentId: string; amountCents: number; memberCount: number; status: string }> {
    const res = await api.post<{ success: boolean; data: { paymentId: string; amountCents: number; memberCount: number; status: string } }>(
      `/admin/cohorts/${cohortId}/pay`,
    );
    return res.data.data;
  },

  async transitionStatus(cohortId: string, status: 'active' | 'completed', reason?: string): Promise<{ cohortId: string; status: string }> {
    const res = await api.patch<{ success: boolean; data: { cohortId: string; status: string } }>(
      `/admin/cohorts/${cohortId}/status`,
      { status, reason },
    );
    return res.data.data;
  },

  async getStatusLog(cohortId: string): Promise<Array<{ id: string; fromStatus: string; toStatus: string; triggeredBy: string; reason: string | null; createdAt: string }>> {
    const res = await api.get<{ success: boolean; data: { log: Array<{ id: string; fromStatus: string; toStatus: string; triggeredBy: string; reason: string | null; createdAt: string }> } }>(
      `/admin/cohorts/${cohortId}/status-log`,
    );
    return res.data.data.log;
  },
};
