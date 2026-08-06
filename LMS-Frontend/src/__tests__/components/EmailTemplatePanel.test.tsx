/**
 * Tests for Phase 22 C3 — EmailTemplatePanel component.
 *
 * ET-F1  — renders template list
 * ET-F2  — clicking template shows edit form
 * ET-F3  — save calls updateTemplate with correct payload
 * ET-F4  — preview button shows rendered HTML
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/emailTemplateService', () => ({
  emailTemplateService: {
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    previewTemplate: vi.fn(),
  },
}));

import { EmailTemplatePanel } from '../../components/EmailTemplatePanel';
import { emailTemplateService } from '../../services/emailTemplateService';

const mockListTemplates = emailTemplateService.listTemplates as ReturnType<typeof vi.fn>;
const mockUpdateTemplate = emailTemplateService.updateTemplate as ReturnType<typeof vi.fn>;
const mockPreviewTemplate = emailTemplateService.previewTemplate as ReturnType<typeof vi.fn>;

const sampleTemplates = [
  {
    id: 't1',
    slug: 'enrollment',
    category: 'enrollment',
    name: 'Course Enrollment',
    subject: "You've been enrolled in {{courseName}}",
    bodyHtml: '<p>Hi {{studentName}}</p>',
    variables: ['studentName', 'courseName', 'lmsName', 'loginUrl'],
    version: 1,
    updatedBy: null,
    createdAt: '2026-08-06T00:00:00Z',
    updatedAt: '2026-08-06T00:00:00Z',
  },
  {
    id: 't2',
    slug: 'password-reset',
    category: 'auth',
    name: 'Password Reset',
    subject: 'Reset your {{lmsName}} password',
    bodyHtml: '<p>Hi {{userName}}</p>',
    variables: ['userName', 'lmsName', 'resetUrl'],
    version: 1,
    updatedBy: null,
    createdAt: '2026-08-06T00:00:00Z',
    updatedAt: '2026-08-06T00:00:00Z',
  },
];

describe('EmailTemplatePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTemplates.mockResolvedValue(sampleTemplates);
  });

  // ET-F1: renders template list
  it('ET-F1 — renders template list with names and categories', async () => {
    render(<EmailTemplatePanel />);
    await waitFor(() => {
      expect(screen.getByText('Course Enrollment')).toBeInTheDocument();
    });
    expect(screen.getByText('Password Reset')).toBeInTheDocument();
    expect(screen.getByText('enrollment')).toBeInTheDocument();
    expect(screen.getByText('auth')).toBeInTheDocument();
  });

  // ET-F2: clicking template shows edit form
  it('ET-F2 — clicking template shows edit form', async () => {
    const user = userEvent.setup();
    render(<EmailTemplatePanel />);
    await waitFor(() => expect(screen.getByText('Course Enrollment')).toBeInTheDocument());

    await user.click(screen.getByTestId('template-row-enrollment'));
    await waitFor(() => {
      expect(screen.getByTestId('template-edit-form')).toBeInTheDocument();
    });
  });

  // ET-F3: save calls updateTemplate with payload
  it('ET-F3 — save calls updateTemplate with correct payload', async () => {
    const user = userEvent.setup();
    mockUpdateTemplate.mockResolvedValue({ ...sampleTemplates[0], version: 2 });
    render(<EmailTemplatePanel />);
    await waitFor(() => expect(screen.getByText('Course Enrollment')).toBeInTheDocument());

    await user.click(screen.getByTestId('template-row-enrollment'));
    await waitFor(() => expect(screen.getByTestId('btn-save-template')).toBeInTheDocument());

    await user.click(screen.getByTestId('btn-save-template'));
    await waitFor(() => {
      expect(mockUpdateTemplate).toHaveBeenCalledWith('enrollment', {
        subject: sampleTemplates[0].subject,
        bodyHtml: sampleTemplates[0].bodyHtml,
      });
    });
  });

  // ET-F4: preview shows rendered HTML
  it('ET-F4 — preview button shows rendered HTML', async () => {
    const user = userEvent.setup();
    mockPreviewTemplate.mockResolvedValue({
      subject: "You've been enrolled in Blockchain 101",
      html: '<p>Hi Jane Doe</p>',
    });
    render(<EmailTemplatePanel />);
    await waitFor(() => expect(screen.getByText('Course Enrollment')).toBeInTheDocument());

    await user.click(screen.getByTestId('template-row-enrollment'));
    await waitFor(() => expect(screen.getByTestId('btn-preview-template')).toBeInTheDocument());

    await user.click(screen.getByTestId('btn-preview-template'));
    await waitFor(() => {
      expect(screen.getByTestId('template-preview')).toBeInTheDocument();
    });
  });
});
