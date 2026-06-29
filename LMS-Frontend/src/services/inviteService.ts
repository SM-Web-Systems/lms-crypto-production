import api from './api';
import type { ApiResponse } from '../types/api';

export interface InviteResult {
  enrolled: string[];
  invited: string[];
  alreadyEnrolled: string[];
  errors: string[];
}

export interface PendingInvite {
  id: string;
  courseId: string;
  email: string;
  token: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

export const inviteService = {
  /** Bulk invite emails to a course. Returns enrolled / invited / alreadyEnrolled counts. */
  async bulkInvite(courseId: string, emails: string[]): Promise<InviteResult> {
    const res = await api.post<ApiResponse<InviteResult>>(`/courses/${courseId}/invite`, { emails });
    if (!res.data?.success) throw new Error('Invite request failed');
    return res.data.data!;
  },

  /** List pending invites for a course */
  async getPendingInvites(courseId: string): Promise<PendingInvite[]> {
    const res = await api.get<ApiResponse<{ invites: PendingInvite[] }>>(`/courses/${courseId}/invites`);
    return res.data?.data?.invites ?? [];
  },

  /** Revoke a pending invite */
  async revokeInvite(courseId: string, inviteId: string): Promise<void> {
    await api.delete(`/courses/${courseId}/invites/${inviteId}`);
  },

  /** Download CSV template for bulk invite */
  downloadTemplate(): void {
    const csv = 'Name,Email\nJohn Doe,john@example.com\nJane Smith,jane@example.com\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'course-members-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  },

  /** Parse a CSV or newline/comma-separated string and extract emails */
  parseEmailsFromText(raw: string): string[] {
    const lines = raw.split(/[\r\n]+/);
    const emails: string[] = [];
    for (const line of lines) {
      const cells = line.split(',');
      for (const cell of cells) {
        const v = cell.trim();
        if (v.includes('@') && v.includes('.')) emails.push(v.toLowerCase());
      }
    }
    return [...new Set(emails)];
  },

  /** Parse CSV file for emails (also handles Name,Email columns) */
  async parseCSVFile(file: File): Promise<string[]> {
    const text = await file.text();
    const lines = text.split(/[\r\n]+/).filter(Boolean);
    const emails: string[] = [];
    let headerEmailIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (i === 0) {
        headerEmailIdx = cells.findIndex((c) => c.toLowerCase() === 'email');
        if (headerEmailIdx === -1) {
          // No header — treat every cell that looks like an email
          cells.forEach((c) => { if (c.includes('@')) emails.push(c.toLowerCase()); });
        }
        continue;
      }
      const candidate = headerEmailIdx >= 0 ? cells[headerEmailIdx] : cells.find((c) => c.includes('@'));
      if (candidate && candidate.includes('@')) emails.push(candidate.toLowerCase());
    }
    return [...new Set(emails)];
  },
};
