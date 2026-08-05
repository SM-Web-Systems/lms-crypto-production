/**
 * Tests for Phase 11 C2 — TierSelector + BadgeDisplay components.
 *
 * TIER-F1  — Tier selection modal renders when tiersEnabled='both'
 * TIER-F2  — Free tier auto-selected when tiersEnabled='free_only'
 * TIER-F3  — Paid tier auto-selected when tiersEnabled='paid_only'
 * TIER-F4  — Clicking free tier calls onSelect('free')
 * TIER-F5  — Clicking paid tier calls onSelect('paid')
 * TIER-F6  — Shows paid tier price when not free
 * TIER-F7  — BadgeDisplay renders view/download buttons
 * TIER-F8  — BadgeDisplay shows preview modal on click
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/courseCompletionService', () => ({
  courseCompletionService: {
    getTiers: vi.fn(),
    getBadge: vi.fn(),
    getPricing: vi.fn(),
    getCourseProgress: vi.fn(),
    getStudentProgress: vi.fn(),
    getAllProgress: vi.fn(),
    getMyProgress: vi.fn(),
    getMyCredentials: vi.fn(),
    markLessonComplete: vi.fn(),
    getLessonCompletions: vi.fn(),
    updateProgress: vi.fn(),
    applyForCertificate: vi.fn(),
    getCourseApplications: vi.fn(),
    recommendApplication: vi.fn(),
    getRequirements: vi.fn(),
    saveRequirements: vi.fn(),
  },
}));

import { TierSelector, BadgeDisplay } from '../../components/TierSelector';
import { courseCompletionService } from '../../services/courseCompletionService';

const mockGetTiers = courseCompletionService.getTiers as ReturnType<typeof vi.fn>;
const mockGetBadge = courseCompletionService.getBadge as ReturnType<typeof vi.fn>;

describe('TierSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TIER-F1: Modal renders when both tiers available
  it('TIER-F1 — renders tier selection modal when tiersEnabled=both', async () => {
    mockGetTiers.mockResolvedValue({ tiersEnabled: 'both', priceCents: 2500, currency: 'USD', isFree: false });
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(<TierSelector courseId="c1" onSelect={onSelect} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Choose Certificate Type')).toBeInTheDocument();
    });
    expect(screen.getByText('Free Badge')).toBeInTheDocument();
    expect(screen.getByText('Verified NFT Certificate')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  // TIER-F2: Auto-select free when free_only
  it('TIER-F2 — auto-selects free when tiersEnabled=free_only', async () => {
    mockGetTiers.mockResolvedValue({ tiersEnabled: 'free_only', priceCents: 0, currency: 'USD', isFree: true });
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(<TierSelector courseId="c1" onSelect={onSelect} onCancel={onCancel} />);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('free');
    });
  });

  // TIER-F3: Auto-select paid when paid_only
  it('TIER-F3 — auto-selects paid when tiersEnabled=paid_only', async () => {
    mockGetTiers.mockResolvedValue({ tiersEnabled: 'paid_only', priceCents: 5000, currency: 'USD', isFree: false });
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(<TierSelector courseId="c1" onSelect={onSelect} onCancel={onCancel} />);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith('paid');
    });
  });

  // TIER-F4: Clicking free tier card
  it('TIER-F4 — clicking free tier calls onSelect with free', async () => {
    const user = userEvent.setup();
    mockGetTiers.mockResolvedValue({ tiersEnabled: 'both', priceCents: 2500, currency: 'USD', isFree: false });
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(<TierSelector courseId="c1" onSelect={onSelect} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Free Badge')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Free Badge'));
    expect(onSelect).toHaveBeenCalledWith('free');
  });

  // TIER-F5: Clicking paid tier card
  it('TIER-F5 — clicking paid tier calls onSelect with paid', async () => {
    const user = userEvent.setup();
    mockGetTiers.mockResolvedValue({ tiersEnabled: 'both', priceCents: 2500, currency: 'USD', isFree: false });
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(<TierSelector courseId="c1" onSelect={onSelect} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText('Verified NFT Certificate')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Verified NFT Certificate'));
    expect(onSelect).toHaveBeenCalledWith('paid');
  });

  // TIER-F6: Shows price for paid tier
  it('TIER-F6 — shows paid tier price when not free', async () => {
    mockGetTiers.mockResolvedValue({ tiersEnabled: 'both', priceCents: 2500, currency: 'USD', isFree: false });
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(<TierSelector courseId="c1" onSelect={onSelect} onCancel={onCancel} />);

    await waitFor(() => {
      expect(screen.getByText('$25.00')).toBeInTheDocument();
    });
  });
});

describe('BadgeDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TIER-F7: Renders view and download buttons
  it('TIER-F7 — renders view and download buttons', async () => {
    mockGetBadge.mockResolvedValue({
      badgeId: 'badge-123',
      userId: 'u1',
      courseId: 'c1',
      applicationId: 'app1',
      badgeSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Test</text></svg>',
      badgeHash: 'abc123',
      createdAt: '2026-08-05T00:00:00Z',
    });

    render(<BadgeDisplay badgeId="badge-123" />);

    await waitFor(() => {
      expect(screen.getByText('View Badge')).toBeInTheDocument();
    });
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  // TIER-F8: Shows preview modal on view click
  it('TIER-F8 — shows preview modal on View Badge click', async () => {
    const user = userEvent.setup();
    mockGetBadge.mockResolvedValue({
      badgeId: 'badge-456',
      userId: 'u1',
      courseId: 'c1',
      applicationId: 'app1',
      badgeSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Certificate</text></svg>',
      badgeHash: 'def456',
      createdAt: '2026-08-05T00:00:00Z',
    });

    render(<BadgeDisplay badgeId="badge-456" />);

    await waitFor(() => {
      expect(screen.getByText('View Badge')).toBeInTheDocument();
    });

    await user.click(screen.getByText('View Badge'));

    expect(screen.getByText('Your Certificate Badge')).toBeInTheDocument();
    expect(screen.getByText('Download SVG')).toBeInTheDocument();
  });
});
