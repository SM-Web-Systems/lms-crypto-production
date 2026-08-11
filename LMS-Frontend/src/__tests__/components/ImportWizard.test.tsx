import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportWizard from '../../components/ImportWizard';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  courseId: 'course-123',
  courseTitle: 'Test Course',
  onImportComplete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImportWizard (Phase 26 C4)', () => {
  it('IW-FE-1: renders three source options (ZIP, CSV, Folder)', () => {
    render(<ImportWizard {...defaultProps} />);

    expect(screen.getByTestId('source-zip')).toBeDefined();
    expect(screen.getByTestId('source-csv')).toBeDefined();
    expect(screen.getByTestId('source-folder')).toBeDefined();
    expect(screen.getByText('Upload ZIP')).toBeDefined();
    expect(screen.getByText('Upload CSV')).toBeDefined();
    expect(screen.getByText('Select Folder')).toBeDefined();
  });

  it('IW-FE-2: does not render when open is false', () => {
    render(<ImportWizard {...defaultProps} open={false} />);
    expect(screen.queryByTestId('import-wizard')).toBeNull();
  });

  it('IW-FE-3: Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<ImportWizard {...defaultProps} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('WIZ-GH-1 — GitHub source option renders', () => {
  it('shows GitHub Repository button in Step 1', () => {
    render(<ImportWizard {...defaultProps} />);
    expect(screen.getByTestId('source-github')).toBeDefined();
    expect(screen.getByText(/GitHub Repository/i)).toBeDefined();
  });
});

describe('WIZ-GH-2 — GitHub form validation', () => {
  it('shows validation error when submitting empty repo URL', async () => {
    render(<ImportWizard {...defaultProps} />);
    // Click GitHub source to reveal the form
    fireEvent.click(screen.getByTestId('source-github'));
    // Click Fetch without entering URL
    const fetchBtn = screen.getByText(/^Fetch$/i);
    fireEvent.click(fetchBtn);
    await waitFor(() => {
      expect(screen.getByText(/repository URL is required/i)).toBeInTheDocument();
    });
  });
});

describe('WIZ-GH-3 — GitHub import error handling', () => {
  it('shows error message on 404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({
        success: false,
        error: { message: 'Repository not found or not public' },
      }),
    });

    render(<ImportWizard {...defaultProps} />);
    fireEvent.click(screen.getByTestId('source-github'));

    const urlInput = screen.getByPlaceholderText(/github\.com/i);
    fireEvent.change(urlInput, { target: { value: 'https://github.com/SM-Web-Systems/nonexistent' } });

    const fetchBtn = screen.getByText(/^Fetch$/i);
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(screen.getByText(/not found|not public/i)).toBeInTheDocument();
    });
  });
});
