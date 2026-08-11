/**
 * Phase 24 C3: BadgeGallery page tests.
 *
 * GALLERY-FE-1: BadgeGallery renders grid of NFTBadge components
 * GALLERY-FE-2: BadgeGallery filter dropdown shows unique course titles
 * GALLERY-FE-3: BadgeGallery sort toggle reverses order
 * GALLERY-FE-4: BadgeGallery shows empty state when no credentials
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import BadgeGallery from '../../pages/BadgeGallery';

const mockCredentials = [
  {
    credentialId: 'cred-1',
    walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
    txHash: 'tx1',
    courseId: 'c1',
    courseTitle: 'Blockchain 101',
    courseCode: 'BVC-101',
    quizId: null,
    quizTitle: null,
    network: 'public',
    issuedAt: '2026-07-01T12:00:00Z',
    sorobanTokenId: 42,
    contractId: 'CDPKSOOE4UZF',
  },
  {
    credentialId: 'cred-2',
    walletAddress: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDE',
    txHash: 'tx2',
    courseId: 'c2',
    courseTitle: 'Smart Contracts',
    courseCode: 'SVC-201',
    quizId: null,
    quizTitle: null,
    network: 'public',
    issuedAt: '2026-08-01T12:00:00Z',
    sorobanTokenId: 43,
    contractId: 'CDPKSOOE4UZF',
  },
];

// Mock the courseCompletionService
vi.mock('../../services/courseCompletionService', () => ({
  courseCompletionService: {
    getMyCredentials: vi.fn(),
  },
}));

import { courseCompletionService } from '../../services/courseCompletionService';

describe('BadgeGallery', () => {
  beforeEach(() => {
    vi.mocked(courseCompletionService.getMyCredentials).mockResolvedValue(mockCredentials);
  });

  it('GALLERY-FE-1: renders grid of NFTBadge components', async () => {
    render(
      <MemoryRouter>
        <BadgeGallery />
      </MemoryRouter>,
    );

    const b101 = await screen.findAllByText('Blockchain 101');
    expect(b101.length).toBeGreaterThanOrEqual(1);
    const sc = screen.getAllByText('Smart Contracts');
    expect(sc.length).toBeGreaterThanOrEqual(1);
  });

  it('GALLERY-FE-2: filter dropdown shows unique course titles', async () => {
    render(
      <MemoryRouter>
        <BadgeGallery />
      </MemoryRouter>,
    );

    await screen.findAllByText('Blockchain 101');

    const filter = screen.getByRole('combobox');
    expect(filter).toBeTruthy();

    // Check filter options
    const options = screen.getAllByRole('option');
    const optionTexts = options.map((o) => o.textContent);
    expect(optionTexts).toContain('All Courses');
    expect(optionTexts).toContain('Blockchain 101');
    expect(optionTexts).toContain('Smart Contracts');
  });

  it('GALLERY-FE-3: sort toggle reverses order', async () => {
    render(
      <MemoryRouter>
        <BadgeGallery />
      </MemoryRouter>,
    );

    await screen.findAllByText('Blockchain 101');

    // Default is newest first — Smart Contracts (Aug) should be first
    const badges = screen.getAllByText(/Token #/);
    expect(badges[0].textContent).toContain('43'); // Smart Contracts token

    // Click sort button to switch to oldest first
    const sortBtn = screen.getByRole('button', { name: /oldest/i });
    fireEvent.click(sortBtn);

    await waitFor(() => {
      const reordered = screen.getAllByText(/Token #/);
      expect(reordered[0].textContent).toContain('42'); // Blockchain 101 token
    });
  });

  it('GALLERY-FE-4: shows empty state when no credentials', async () => {
    vi.mocked(courseCompletionService.getMyCredentials).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <BadgeGallery />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/No badges yet/i)).toBeTruthy();
  });
});
