/**
 * LandingCourses.test.tsx — LMS Course Content Sync
 *
 * Tests that the Landing page "Learning paths" section shows exactly the 9
 * courses from the main website, with correct titles, descriptions, levels,
 * and links. Verifies stale content is removed and login button is unchanged.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../../pages/Landing';

/** Canonical course titles from smwebsystems.com/courses (source of truth) */
const EXPECTED_COURSES = [
  'Introduction to Autonomous Robotics with Arduino Hands-On',
  'Introduction to Electronics',
  'Stellar: The Vibe-Coding Crash Course',
  'Blockchain-Vibe-Coding: Stellar From Zero to dApp',
  'Ethereum From Zero to Smart Contracts',
  'Vibe Hack 101 — Learn How to Win Hackathons',
  'Build on Stellar — Soroban Crash Course',
  'Rust Crash Course — Programming Basics: Web3 & Smart Contract Development',
  'Build on Stellar',
] as const;

/** Stale titles that must NOT appear anywhere on the page */
const STALE_TITLES = [
  'Stellar & Soroban',
  'Blockchain for Beginners',
  'Ethereum & security',
  'Solana & automation',
];

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe('LMS Landing — Course Content Sync', () => {
  it('COURSE-01: renders exactly 9 course entries', () => {
    renderLanding();
    const heading = screen.getByRole('heading', { name: /learning paths/i });
    // The section containing the heading has the course cards
    const section = heading.closest('section')!;
    // Each course card has an h3 heading
    const courseHeadings = within(section).getAllByRole('heading', { level: 3 });
    expect(courseHeadings).toHaveLength(9);
  });

  it.each(EXPECTED_COURSES)(
    'COURSE-02: renders course title "%s"',
    (title) => {
      renderLanding();
      expect(screen.getByText(title)).toBeInTheDocument();
    },
  );

  it.each(STALE_TITLES)(
    'COURSE-03: stale title "%s" does not appear anywhere',
    (staleTitle) => {
      renderLanding();
      expect(screen.queryByText(staleTitle)).not.toBeInTheDocument();
    },
  );

  it('COURSE-04: no "Coming soon" badges appear', () => {
    renderLanding();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('COURSE-05: no "Roadmap" labels appear', () => {
    renderLanding();
    expect(screen.queryByText('Roadmap')).not.toBeInTheDocument();
  });

  it('COURSE-06: each course links to its exact smwebsystems.com/courses/{slug}', () => {
    renderLanding();
    const expectedHrefs = [
      'https://smwebsystems.com/courses/introduction-to-autonomous-robotics-arduino',
      'https://smwebsystems.com/courses/introduction-to-electronics',
      'https://smwebsystems.com/courses/stellar-vibe-coding-crash-course',
      'https://smwebsystems.com/courses/blockchain-vibe-coding-stellar-zero-to-dapp',
      'https://smwebsystems.com/courses/eth-crash-course',
      'https://smwebsystems.com/courses/vibe-hack-101',
      'https://smwebsystems.com/courses/soroban-crash-course',
      'https://smwebsystems.com/courses/rust-crash-course',
      'https://smwebsystems.com/courses/build-on-stellar',
    ];
    const links = screen.getAllByRole('link', { name: /view course/i });
    expect(links).toHaveLength(9);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(expectedHrefs);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('COURSE-07: login button text and destination unchanged', () => {
    renderLanding();
    // Header "Sign in" link
    const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
    const headerSignIn = signInLinks[0];
    expect(headerSignIn).toHaveAttribute('href', '/login');
    expect(headerSignIn).toBeInTheDocument();
  });

  it('COURSE-08: hero "Continue to Sign in" button links to /login', () => {
    renderLanding();
    const continueBtn = screen.getByRole('link', { name: /continue to sign in/i });
    expect(continueBtn).toHaveAttribute('href', '/login');
  });

  it('COURSE-09: course levels are displayed as badges', () => {
    renderLanding();
    // Check a few representative levels exist
    expect(screen.getAllByText('Beginner').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Intermediate').length).toBeGreaterThanOrEqual(1);
  });

  it('COURSE-10: course descriptions from main site are present', () => {
    renderLanding();
    expect(
      screen.getByText(/Learn the foundations of autonomous robotics/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Learn Ethereum fundamentals and build toward/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A foundational Stellar learning track/),
    ).toBeInTheDocument();
  });
});
