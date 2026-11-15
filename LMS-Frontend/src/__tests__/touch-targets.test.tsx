import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { Button } from '../components/Button';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('touch targets (44 px on touch screens)', () => {
  it('defines the touch-target rules for coarse pointers only', () => {
    const css = read('index.css');
    const rule = css.slice(css.indexOf('@media (pointer: coarse)'));
    expect(rule).toContain('.touch-target { min-height: 44px; min-width: 44px; }');
    expect(rule).toMatch(/\.touch-target-link \{[^}]*padding-block: 14px;[^}]*margin-block: -14px;/);
  });

  it('every shared Button is a touch target', () => {
    render(<Button size="sm">Join</Button>);
    expect(screen.getByRole('button', { name: 'Join' }).className).toContain('touch-target');
  });

  it.each([
    ['components/Layout.tsx', 2],
    ['components/GlobalSearchBar.tsx', 1],
    ['components/NotificationBell.tsx', 1],
    ['components/dashboard/OnboardingChecklist.tsx', 1],
    ['components/dashboard/CertEligibilitySection.tsx', 1],
    ['components/StudentWalletStatusCard.tsx', 3],
  ])('%s marks its small controls as touch targets', (file, count) => {
    expect((read(file).match(/touch-target/g) ?? []).length).toBeGreaterThanOrEqual(count);
  });
});
