# LMS Course Content Sync — Assessment

**Date:** 2026-08-26
**Status:** Complete

---

## 1. LMS Repository Location and Structure

| Property | Value |
|---|---|
| Repository | `SM-Web-Systems/lms-crypto-production` |
| Local path | `/home/webadmin/web-stack/html/LMS-AmmaWallet/` |
| Frontend | `LMS-Frontend/` (Vite + React + TypeScript) |
| Backend | `LMS-Server/` (Express + better-sqlite3) |
| Branch | `main` |
| HEAD | `8d490da` |
| Docker containers | `lms-web` (frontend, port 80) + `lms-api` (backend, port 3001) |
| Live URL | `https://lms.smwebsystems.com` |
| Test framework | Vitest + @testing-library/react + jsdom |

## 2. LMS Course Content Storage Mechanism

**Hardcoded in JSX component.**

File: `LMS-Frontend/src/pages/Landing.tsx` lines 17-51

The `LEARNING_PATHS` const array contains 4 stale entries rendered directly in the "Learning paths" section. No database, JSON file, or API is involved for landing page course listing.

### Current LMS Fields per Entry

| Field | Type | Purpose |
|---|---|---|
| `name` | string | Display title |
| `level` | string | Badge text ("Available now", "Coming soon", etc.) |
| `description` | string | One-line description |
| `available` | boolean | Controls styling and link behavior |
| `href` | string | Link destination |
| `external` | boolean | Opens in new tab if true |

## 3. Current Stale LMS "Learning Paths" Content (Verbatim)

```typescript
const LEARNING_PATHS = [
  {
    name: 'Stellar & Soroban',
    level: 'Available now',
    description: 'Structured weeks, materials, and outcomes inside the LMS — sign in to start.',
    available: true,
    href: '/login',
    external: false,
  },
  {
    name: 'Blockchain for Beginners',
    level: 'Open companion site',
    description: 'Multi-format path with modules, media, and quizzes — aligned with how we teach on the web.',
    available: true,
    href: 'https://blockchain-vibe-coding.smwebsystems.com',
    external: true,
  },
  {
    name: 'Ethereum & security',
    level: 'Coming soon',
    description: 'Crash courses and security-minded patterns for EVM — on the roadmap.',
    available: false,
    href: '#topics',
    external: false,
  },
  {
    name: 'Solana & automation',
    level: 'Coming soon',
    description: 'On-chain programs and trading workflows — planned expansions.',
    available: false,
    href: '#topics',
    external: false,
  },
];
```

## 4. Main Website Course Content Storage Mechanism

**TypeScript data file.**

File: `app/courses/data.ts` — exports `CourseCardData[]` array of 9 courses.

### Main Website Fields per Course

| Field | Type | Purpose |
|---|---|---|
| `slug` | string | URL path segment |
| `title` | string | Full course title |
| `shortDescription` | string | Listing card description |
| `level` | string | Difficulty level |
| `length` | string | Format (Cohort-based, Crash course, etc.) |
| `status` | "live" \| "coming-soon" | Availability |
| `publishedAt` | string | ISO date for sort order |
| `imageUrl` | string? | Optional image |

## 5. All 9 Courses Extracted from Main Website

| # | Title | Slug | Description | Level | Format | Status |
|---|---|---|---|---|---|---|
| 1 | Introduction to Autonomous Robotics with Arduino Hands-On | introduction-to-autonomous-robotics-arduino | Learn the foundations of autonomous robotics using Arduino through hands-on practical sessions and guided experimentation. | Beginner | Cohort-based | live |
| 2 | Introduction to Electronics | introduction-to-electronics | Build foundational electronics knowledge for makers, robotics learners, and hardware-focused builders. | Beginner | Self-paced | live |
| 3 | Stellar: The Vibe-Coding Crash Course | stellar-vibe-coding-crash-course | A fast-track crash course for builders who want to start creating on Stellar using modern AI-assisted workflows. | Beginner to Intermediate | Crash course | live |
| 4 | Blockchain-Vibe-Coding: Stellar From Zero to dApp | blockchain-vibe-coding-stellar-zero-to-dapp | Go from first principles to building a full Stellar dApp with AI-assisted development, wallet integration, and production-minded workflows. | Intermediate | Multi-module | live |
| 5 | Ethereum From Zero to Smart Contracts | eth-crash-course | Learn Ethereum fundamentals and build toward smart contract development from the ground up. | Beginner to Intermediate | Crash course | live |
| 6 | Vibe Hack 101 — Learn How to Win Hackathons | vibe-hack-101 | Learn how to approach hackathons strategically, build quickly, collaborate effectively, and improve your chances of winning. | Beginner to Intermediate | Workshop series | live |
| 7 | Build on Stellar — Soroban Crash Course | soroban-crash-course | Learn Soroban fundamentals and start building smart contracts in the Stellar ecosystem. | Intermediate | Crash course | live |
| 8 | Rust Crash Course — Programming Basics: Web3 & Smart Contract Development | rust-crash-course | Learn Rust fundamentals through a practical course designed for future Web3 and smart contract developers. | Beginner | Crash course | live |
| 9 | Build on Stellar | build-on-stellar | A foundational Stellar learning track covering blockchain basics, Stellar consensus, and the core Stellar technology stack. | Beginner | Multi-playlist | live |

**All 9 courses are status "live".** No courses are "coming soon."

## 6. Current LMS Course Detail-Page Routing

The LMS has **no public course detail pages**. The 4 current entries link to:
- `/login` (internal sign-in page)
- `https://blockchain-vibe-coding.smwebsystems.com` (external companion site)
- `#topics` (same-page anchor for unavailable courses)

Course detail pages exist only behind authentication (e.g., `/student/course`).

## 7. Field Mapping: Main Website → LMS

| Main Website Field | LMS Field | Mapping |
|---|---|---|
| `title` | `name` | Direct copy |
| `shortDescription` | `description` | Direct copy |
| `level` | `level` | Map to badge text (e.g., "Beginner", "Intermediate") |
| `length` | (new field) | Add as secondary badge or include in description |
| `status` | `available` | "live" → true, "coming-soon" → false |
| `slug` | `href` | Link to `https://smwebsystems.com/courses/{slug}` |
| — | `external` | true (links to main site course pages) |

## 8. "Coming Soon" Assessment

All 9 courses on the main site have `status: "live"`. No "Coming soon" badges should appear in the updated LMS.

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Content drift after static sync | LOW | Document as known limitation; recommend shared data source as future task |
| Breaking LMS login flow during content edit | LOW | Only editing `LEARNING_PATHS` data, not touching auth code. Test login link preservation. |
| Footer "Blockchain for Beginners" link becoming orphaned | LOW | Update footer link to main site courses page |

## 10. Recommended Approach

**Static duplication (Option 1)**: Replace the `LEARNING_PATHS` array in `Landing.tsx` with 9 entries matching the main website's course data. Each entry links to the main site's course detail page (`https://smwebsystems.com/courses/{slug}`). No new pages, APIs, or shared data infrastructure needed.
