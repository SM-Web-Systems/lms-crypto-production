/**
 * emailTemplateService — Phase 22 C3: frontend API for email template management.
 */

import api from './api';

export interface EmailTemplate {
  id: string;
  slug: string;
  category: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string[];
  version: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const emailTemplateService = {
  async listTemplates(): Promise<EmailTemplate[]> {
    const res = await api.get<{ success: boolean; data: { templates: EmailTemplate[] } }>('/admin/email-templates');
    return res.data.data.templates;
  },

  async getTemplate(slug: string): Promise<EmailTemplate> {
    const res = await api.get<{ success: boolean; data: EmailTemplate }>(`/admin/email-templates/${slug}`);
    return res.data.data;
  },

  async updateTemplate(slug: string, data: { subject: string; bodyHtml: string }): Promise<EmailTemplate> {
    const res = await api.put<{ success: boolean; data: EmailTemplate }>(`/admin/email-templates/${slug}`, data);
    return res.data.data;
  },

  async previewTemplate(slug: string): Promise<{ subject: string; html: string }> {
    const res = await api.post<{ success: boolean; data: { subject: string; html: string } }>(`/admin/email-templates/${slug}/preview`);
    return res.data.data;
  },
};
