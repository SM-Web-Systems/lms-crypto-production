/**
 * cohortService — Phase 11 C3: frontend API for sponsor cohort management.
 */

import api from './api';
import type { SponsorCohortSummary, CohortMemberDetail, BulkApplyResult, CertificateTier } from '../types/api';

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

  async getCohort(cohortId: string): Promise<{ cohort: SponsorCohortSummary; members: CohortMemberDetail[] }> {
    const res = await api.get<{ success: boolean; data: { cohort: SponsorCohortSummary; members: CohortMemberDetail[] } }>(
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
};
