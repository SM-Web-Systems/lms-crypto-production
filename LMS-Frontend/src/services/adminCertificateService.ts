/**
 * adminCertificateService — admin-only certificate application management.
 */

import api from './api';
import type { NftApplication, IssuedCredential, CoursePricing, PaymentRecord, TiersEnabled } from '../types/api';

export const adminCertificateService = {
  /** GET /admin/certificates — all applications with optional filters */
  async getAllCertificates(params?: {
    status?: 'pending' | 'approved' | 'rejected' | 'minted';
    courseId?: string;
  }): Promise<NftApplication[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.courseId) query.set('courseId', params.courseId);
    const qs = query.toString();
    const res = await api.get<{
      success: boolean;
      data: { certificates: NftApplication[]; total: number };
    }>(`/admin/certificates${qs ? `?${qs}` : ''}`);
    return res.data.data?.certificates ?? [];
  },

  /** PATCH /courses/:courseId/completions/applications/:appId/approve */
  async approveApplication(courseId: string, appId: string, notes?: string): Promise<NftApplication> {
    const res = await api.patch<{ success: boolean; data: NftApplication }>(
      `/courses/${courseId}/completions/applications/${appId}/approve`,
      { notes }
    );
    return res.data.data!;
  },

  /** PATCH /courses/:courseId/completions/applications/:appId/reject */
  async rejectApplication(courseId: string, appId: string, reason?: string): Promise<NftApplication> {
    const res = await api.patch<{ success: boolean; data: NftApplication }>(
      `/courses/${courseId}/completions/applications/${appId}/reject`,
      { reason }
    );
    return res.data.data!;
  },

  /** POST /courses/:courseId/completions/applications/:appId/mint */
  async mintApplication(courseId: string, appId: string): Promise<NftApplication> {
    const res = await api.post<{ success: boolean; data: NftApplication }>(
      `/courses/${courseId}/completions/applications/${appId}/mint`
    );
    return res.data.data!;
  },

  /** GET /admin/issued-credentials — all nft_credentials rows (admin + lecturer) */
  async getIssuedCredentials(params?: {
    courseId?: string;
    userId?: string;
    mintStatus?: 'pending' | 'minted' | 'failed';
    network?: 'public' | 'testnet';
  }): Promise<IssuedCredential[]> {
    const qs = new URLSearchParams();
    if (params?.courseId) qs.set('courseId', params.courseId);
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.mintStatus) qs.set('mintStatus', params.mintStatus);
    if (params?.network) qs.set('network', params.network);
    const q = qs.toString();
    const res = await api.get<{
      success: boolean;
      data: { credentials: IssuedCredential[]; total: number };
    }>(`/admin/issued-credentials${q ? `?${q}` : ''}`);
    return res.data.data?.credentials ?? [];
  },

  /** POST /admin/credentials/:id/reconcile — check Horizon for failed credential */
  async reconcileCredential(credentialId: string): Promise<{
    status: string;
    reason?: string;
    txHash?: string;
  }> {
    const res = await api.post<{
      success: boolean;
      data: { status: string; reason?: string; txHash?: string };
    }>(`/admin/credentials/${credentialId}/reconcile`);
    return res.data.data;
  },

  /** POST /admin/credentials/:credentialId/remint — L-013 re-mint correction flow */
  async remintCredential(
    credentialId: string,
    walletAddress?: string,
  ): Promise<{ newCredentialId: string; supersededCredentialId: string; txHash: string; walletAddress: string }> {
    const res = await api.post<{
      success: boolean;
      data: { newCredentialId: string; supersededCredentialId: string; txHash: string; walletAddress: string };
    }>(`/admin/credentials/${credentialId}/remint`, walletAddress ? { walletAddress } : {});
    return res.data.data;
  },

  /** GET /admin/payments — all payments with optional filters */
  async getPayments(params?: {
    status?: string;
    courseId?: string;
  }): Promise<PaymentRecord[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.courseId) query.set('courseId', params.courseId);
    const qs = query.toString();
    const res = await api.get<{
      success: boolean;
      data: { payments: PaymentRecord[] };
    }>(`/admin/payments${qs ? `?${qs}` : ''}`);
    return res.data.data?.payments ?? [];
  },

  /** POST /admin/payments/:paymentId/confirm — manual payment confirmation */
  async confirmPayment(paymentId: string, notes?: string): Promise<{ status: string }> {
    const res = await api.post<{ success: boolean; data: { status: string } }>(
      `/admin/payments/${paymentId}/confirm`,
      { notes },
    );
    return res.data.data;
  },

  /** POST /admin/payments/:paymentId/waive — waive payment */
  async waivePayment(paymentId: string, notes: string): Promise<{ status: string }> {
    const res = await api.post<{ success: boolean; data: { status: string } }>(
      `/admin/payments/${paymentId}/waive`,
      { notes },
    );
    return res.data.data;
  },

  /** PUT /admin/courses/:courseId/pricing — set certificate price + tier mode + Stellar prices */
  async setCoursePricing(
    courseId: string,
    priceCents: number,
    tiersEnabled?: TiersEnabled,
    stellarPriceXlm?: number | null,
    stellarPriceUsdc?: number | null,
  ): Promise<CoursePricing> {
    const body: Record<string, unknown> = { priceCents };
    if (tiersEnabled) body.tiersEnabled = tiersEnabled;
    if (stellarPriceXlm !== undefined) body.stellarPriceXlm = stellarPriceXlm;
    if (stellarPriceUsdc !== undefined) body.stellarPriceUsdc = stellarPriceUsdc;
    const res = await api.put<{ success: boolean; data: CoursePricing }>(
      `/admin/courses/${courseId}/pricing`,
      body,
    );
    return res.data.data;
  },
};
