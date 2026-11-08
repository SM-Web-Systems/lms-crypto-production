/**
 * Tests for Phase 26 C1 — GlobalSearchBar.
 *
 * SRCH-FE-1: GlobalSearchBar renders and shows results on input
 * SRCH-FE-2: GlobalSearchBar opens on Ctrl+K keyboard shortcut
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/searchService', () => ({
  searchService: {
    search: vi.fn(),
  },
}));

vi.mock('../../context/useAuth', () => ({
  useAuth: () => ({ user: { role: 'student', name: 'Test', workspaces: ['student'], permissions: ['course.view', 'certificate.view_own', 'quiz.view'] } }),
}));

import { searchService } from '../../services/searchService';
import GlobalSearchBar from '../../components/GlobalSearchBar';

const mockSearch = searchService.search as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

const renderBar = () =>
  render(
    <MemoryRouter>
      <GlobalSearchBar />
    </MemoryRouter>,
  );

describe('SRCH-FE-1: GlobalSearchBar renders and shows results', () => {
  it('displays search results after typing', async () => {
    mockSearch.mockResolvedValue({
      query: 'blockchain',
      results: {
        courses: [{ id: 'c1', title: 'Blockchain Fundamentals', courseCode: 'BLK-101', description: 'Learn basics' }],
        credentials: [],
      },
      counts: { courses: 1, credentials: 0 },
    });

    const user = userEvent.setup();
    renderBar();

    // Click the search trigger to open
    await user.click(screen.getByTestId('search-trigger'));

    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeDefined();
    });

    // Type search query
    await user.type(screen.getByTestId('search-input'), 'blockchain');

    await waitFor(() => {
      expect(screen.getByText('Blockchain Fundamentals')).toBeDefined();
    });

    expect(screen.getByTestId('search-result-course')).toBeDefined();
  });
});

describe('SRCH-FE-2: GlobalSearchBar opens on Ctrl+K', () => {
  it('opens search modal on Ctrl+K keyboard shortcut', async () => {
    renderBar();

    // Verify search modal is NOT visible initially
    expect(screen.queryByTestId('search-modal')).toBeNull();

    // Press Ctrl+K
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByTestId('search-modal')).toBeDefined();
    });

    expect(screen.getByTestId('search-input')).toBeDefined();
  });
});

describe('LMS-006: keyboard and accessible search controls', () => {
  it('returns to Search when pointer activation leaves focus on the page body', async () => {
    renderBar();
    const trigger = screen.getByRole('button', { name: 'Search' });
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(trigger); // WebKit pointer activation need not focus a button.
    const input = screen.getByRole('textbox', { name: 'Search courses, certificates, and more' });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('returns to the previous input when opened with the keyboard shortcut', async () => {
    render(<MemoryRouter><input aria-label="Previous control" /><GlobalSearchBar /></MemoryRouter>);
    const previous = screen.getByRole('textbox', { name: 'Previous control' });
    previous.focus();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const input = screen.getByRole('textbox', { name: 'Search courses, certificates, and more' });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(previous).toHaveFocus());
  });

  it('names the trigger and dialog, traps focus, and restores it after Escape', async () => {
    const user = userEvent.setup();
    renderBar();
    const trigger = screen.getByRole('button', { name: 'Search' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Search' });
    const input = screen.getByRole('textbox', { name: 'Search courses, certificates, and more' });
    const close = screen.getByRole('button', { name: 'Close search' });
    expect(dialog).toBeVisible();
    await waitFor(() => expect(input).toHaveFocus());
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
