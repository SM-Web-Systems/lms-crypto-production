/**
 * lazy-loading.test.tsx — Phase 25 C3
 *
 * PERF-FE-1: Lazy-loaded page renders after Suspense resolves
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React, { Suspense } from 'react';

vi.mock('../services/courseCompletionService', () => ({
  courseCompletionService: {
    getMyCredentials: vi.fn().mockResolvedValue([]),
  },
}));

describe('Lazy loading (Phase 25 C3)', () => {
  it('PERF-FE-1: lazy-loaded BadgeGallery renders after Suspense resolves', async () => {
    const BadgeGallery = React.lazy(() => import('../pages/BadgeGallery'));

    render(
      <MemoryRouter>
        <Suspense fallback={<div>Loading...</div>}>
          <BadgeGallery />
        </Suspense>
      </MemoryRouter>,
    );

    // After lazy load resolves, the component renders
    await waitFor(() => {
      expect(screen.getByText('My Badges')).toBeTruthy();
    });
  });
});
