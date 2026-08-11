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
  useAuth: () => ({ user: { role: 'student', name: 'Test' } }),
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
