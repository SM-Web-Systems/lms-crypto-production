/**
 * Inserts / updates the "3-Week Solana Crash Course" from solana-crash-course.md
 * into the courses table.
 *
 * Usage: npm run db:seed-solana
 *
 * Enroll students by adding course code SOLANA-CRASH to user_course_codes (or via admin).
 */

import dotenv from 'dotenv';
dotenv.config();

import { db, close } from '../config/database.js';
import type { Course, CourseSection } from '../types/index.js';

const ID = (s: string) => s;

const SOLANA_CRASH_COURSE: Course = {
  id: ID('course-solana-crash-2026'),
  title: '3-Week Solana Crash Course',
  description:
    'Structured for senior EVM/Anchor engineers — fast-track entry point. Architecture, Anchor, and ecosystem (April 2026).',
  courseCode: 'SOLANA-CRASH',
  sections: [
    {
      id: ID('sol-w1-d12'),
      title: 'Week 1 — Day 1–2: Core Concepts',
      objective: 'Understand what makes Solana different from EVM at the protocol level.',
      outcome: 'You have read core docs and the whitepaper focus areas (PoH, Tower BFT, runtime).',
      items: [
        {
          id: ID('sol-w1-d12-pdf'),
          type: 'pdf',
          title: 'Solana Whitepaper (PDF)',
          order: 1,
          fileUrl:
            'https://github.com/solana-labs/whitepaper/raw/master/solana-whitepaper-en.pdf',
        },
        {
          id: ID('sol-w1-d12-docs'),
          type: 'link',
          title: 'Official Docs — How Solana Works',
          order: 2,
          url: 'https://solana.com/docs',
        },
        {
          id: ID('sol-w1-d12-helius'),
          type: 'link',
          title: 'Helius Blog — Solana programming model',
          order: 3,
          url: 'https://www.helius.dev/blog',
        },
      ],
    },
    {
      id: ID('sol-w1-d34'),
      title: 'Week 1 — Day 3–4: Accounts Model',
      objective: 'Internalize accounts, ownership, rent, and storage vs EVM.',
      outcome: 'You can explain account ownership, rent, and the data storage model.',
      items: [
        {
          id: ID('sol-w1-d34-yt-ch'),
          type: 'link',
          title: 'Solana Foundation YouTube (Accounts & explainers)',
          order: 1,
          url: 'https://www.youtube.com/@SolanaFndn',
        },
        {
          id: ID('sol-w1-d34-helius-acct'),
          type: 'link',
          title: 'Helius — Solana Account Model (search blog)',
          order: 2,
          url: 'https://www.helius.dev/blog',
        },
      ],
    },
    {
      id: ID('sol-w1-d57'),
      title: 'Week 1 — Day 5–7: Transactions & Runtime',
      objective: 'Use the Cookbook and Playground; ship a first transaction mindset.',
      outcome: 'You can navigate Cookbook, Playground, and follow a current setup tutorial.',
      items: [
        {
          id: ID('sol-w1-d57-cookbook'),
          type: 'link',
          title: 'Solana Cookbook',
          order: 1,
          url: 'https://solana.com/developers/cookbook',
        },
        {
          id: ID('sol-w1-d57-vid'),
          type: 'video',
          title: 'Solana Playground Setup Tutorial (2026)',
          order: 2,
          url: 'https://www.youtube.com/watch?v=sJF0OA6tHSo',
        },
        {
          id: ID('sol-w1-d57-pg'),
          type: 'link',
          title: 'Solana Playground (browser IDE)',
          order: 3,
          url: 'https://beta.solpg.io',
        },
      ],
    },
    {
      id: ID('sol-w2-d89'),
      title: 'Week 2 — Day 8–9: Anchor Setup & First Program',
      objective: 'Install Anchor mentally and ship a minimal program path.',
      outcome: 'You know where official Anchor and Solana “getting started” docs live.',
      items: [
        {
          id: ID('sol-w2-d89-anchor'),
          type: 'link',
          title: 'Official Anchor Docs',
          order: 1,
          url: 'https://www.anchor-lang.com/docs',
        },
        {
          id: ID('sol-w2-d89-sol-anchor'),
          type: 'link',
          title: 'Solana Docs — Anchor Getting Started',
          order: 2,
          url: 'https://solana.com/docs/programs/anchor',
        },
        {
          id: ID('sol-w2-d89-helius-anchor'),
          type: 'link',
          title: "Helius — Beginner's Guide to Anchor",
          order: 3,
          url: 'https://www.helius.dev/blog/an-introduction-to-anchor-a-beginners-guide-to-building-solana-programs',
        },
      ],
    },
    {
      id: ID('sol-w2-d1011'),
      title: 'Week 2 — Day 10–11: IDL, CPIs & PDAs',
      objective: 'IDL, CPIs, and PDAs at a practitioner level.',
      outcome: 'You have an intro video and reference repos bookmarked.',
      items: [
        {
          id: ID('sol-w2-d1011-vid'),
          type: 'video',
          title: 'Intro to Anchor / Solana Development (Solana Foundation)',
          order: 1,
          url: 'https://www.youtube.com/watch?v=Ru-ywR7rtgY',
        },
        {
          id: ID('sol-w2-d1011-qn'),
          type: 'link',
          title: 'QuickNode — First Anchor Program (Part 1)',
          order: 2,
          url: 'https://www.quicknode.com/guides/solana-development/anchor/how-to-write-your-first-anchor-program-in-solana-part-1',
        },
        {
          id: ID('sol-w2-d1011-gh'),
          type: 'link',
          title: 'Anchor GitHub (examples/)',
          order: 3,
          url: 'https://github.com/solana-foundation/anchor',
        },
      ],
    },
    {
      id: ID('sol-w2-d1214'),
      title: 'Week 2 — Day 12–14: Build a Working Program',
      objective: 'Escrow or token vault on devnet; follow a full-stack style guide.',
      outcome: 'You have a project brief and faucet for devnet SOL.',
      items: [
        {
          id: ID('sol-w2-d1214-loris'),
          type: 'link',
          title: "Loris Leiva — Create a Solana dApp From Scratch",
          order: 1,
          url: 'https://lorisleiva.com/create-a-solana-dapp-from-scratch/getting-started-with-solana-and-anchor',
        },
        {
          id: ID('sol-w2-d1214-faucet'),
          type: 'link',
          title: 'Devnet Faucet',
          order: 2,
          url: 'https://faucet.solana.com',
        },
      ],
    },
    {
      id: ID('sol-w3-d1516'),
      title: 'Week 3 — Day 15–16: SPL Tokens & Token Extensions',
      objective: 'SPL, Token-2022, and March 2026 ecosystem context.',
      outcome: 'You can find SPL docs and Token Extensions coverage.',
      items: [
        {
          id: ID('sol-w3-d1516-spl'),
          type: 'link',
          title: 'Solana Program Library (SPL)',
          order: 1,
          url: 'https://spl.solana.com',
        },
        {
          id: ID('sol-w3-d1516-helius-t22'),
          type: 'link',
          title: 'Helius Blog — Token Extensions (search)',
          order: 2,
          url: 'https://www.helius.dev/blog',
        },
        {
          id: ID('sol-w3-d1516-news'),
          type: 'link',
          title: 'Solana — Ecosystem roundup March 2026 (P-Token / SIMD-0266)',
          order: 3,
          url: 'https://solana.com/news/solana-ecosystem-roundup-march-2026',
        },
      ],
    },
    {
      id: ID('sol-w3-d1718'),
      title: 'Week 3 — Day 17–18: RPC, Infrastructure & Helius',
      objective: 'RPC providers, dev tools, and Solana Developer Platform.',
      outcome: 'You know major infra entry points and SDP announcement.',
      items: [
        {
          id: ID('sol-w3-d1718-helius'),
          type: 'link',
          title: 'Helius — RPC & APIs',
          order: 1,
          url: 'https://www.helius.dev',
        },
        {
          id: ID('sol-w3-d1718-tools'),
          type: 'link',
          title: 'Solana — Developer tools (payments / MCP / streaming)',
          order: 2,
          url: 'https://solana.com/docs/payments/developer-tools',
        },
        {
          id: ID('sol-w3-d1718-sdp'),
          type: 'link',
          title: 'Solana Developer Platform (SDP) — March 2026',
          order: 3,
          url: 'https://solana.com/news/solana-developer-platform',
        },
      ],
    },
    {
      id: ID('sol-w3-d1920'),
      title: 'Week 3 — Day 19–20: Security & Auditing',
      objective: 'Audit mindset, fuzzing, curated reading.',
      outcome: 'You have a path to Ackee bootcamp search and Awesome Solana list.',
      items: [
        {
          id: ID('sol-w3-d1920-ackee'),
          type: 'link',
          title: 'Ackee — Solana Auditors Bootcamp (search on YouTube)',
          order: 1,
          url: 'https://www.youtube.com/results?search_query=Ackee+Solana+Auditors+Bootcamp',
        },
        {
          id: ID('sol-w3-d1920-awesome'),
          type: 'link',
          title: 'Helius — Awesome Solana',
          order: 2,
          url: 'https://github.com/helius-labs/solana-awesome',
        },
      ],
    },
    {
      id: ID('sol-w3-d21'),
      title: 'Week 3 — Day 21: Community, Grants & Next Steps',
      objective: 'Hubs, Stack Exchange, Superteam, grants.',
      outcome: 'You know where to ask questions and find funding/community.',
      items: [
        {
          id: ID('sol-w3-d21-hub'),
          type: 'link',
          title: 'Solana Developers Hub',
          order: 1,
          url: 'https://solana.com/developers',
        },
        {
          id: ID('sol-w3-d21-res'),
          type: 'link',
          title: 'Developer Resources',
          order: 2,
          url: 'https://solana.com/developers/resources',
        },
        {
          id: ID('sol-w3-d21-se'),
          type: 'link',
          title: 'Solana Stack Exchange',
          order: 3,
          url: 'https://solana.stackexchange.com',
        },
        {
          id: ID('sol-w3-d21-super'),
          type: 'link',
          title: 'Superteam',
          order: 4,
          url: 'https://superteam.fun',
        },
        {
          id: ID('sol-w3-d21-grants'),
          type: 'link',
          title: 'Solana Foundation Grants',
          order: 5,
          url: 'https://solana.org/grants',
        },
      ],
    },
    {
      id: ID('sol-bonus'),
      title: 'Bonus — PDF & reading list',
      objective: 'Central references from the syllabus.',
      items: [
        {
          id: ID('sol-bonus-wp'),
          type: 'pdf',
          title: 'Solana Whitepaper',
          order: 1,
          fileUrl:
            'https://github.com/solana-labs/whitepaper/raw/master/solana-whitepaper-en.pdf',
        },
        {
          id: ID('sol-bonus-anchor-book'),
          type: 'link',
          title: 'Anchor Book / Docs',
          order: 2,
          url: 'https://www.anchor-lang.com/docs',
        },
        {
          id: ID('sol-bonus-helius-h1'),
          type: 'link',
          title: 'Helius — Solana Ecosystem Report H1 2025',
          order: 3,
          url: 'https://www.helius.dev/blog/solana-ecosystem-report-h1-2025',
        },
        {
          id: ID('sol-bonus-march'),
          type: 'link',
          title: 'March 2026 Ecosystem Roundup',
          order: 4,
          url: 'https://solana.com/news/solana-ecosystem-roundup-march-2026',
        },
      ],
    },
    {
      id: ID('sol-gaps'),
      title: 'Key gaps to watch (EVM → Solana)',
      objective: 'Token-2022, web3.js v2, P-Token, Agave.',
      outcome:
        'Token Extensions (Token-2022); web3.js v2 breaks v1 tutorials; P-Token (SIMD-0266) on testnet March 2026; Agave 2.0 validator client at supermajority.',
      items: [],
    },
  ] as CourseSection[],
};

function seed() {
  try {
    const upsert = db.prepare(`
      INSERT INTO courses (id, title, description, course_code, sections)
      VALUES (@id, @title, @description, @courseCode, @sections)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        course_code = excluded.course_code,
        sections = excluded.sections
    `);

    upsert.run({
      id: SOLANA_CRASH_COURSE.id,
      title: SOLANA_CRASH_COURSE.title,
      description: SOLANA_CRASH_COURSE.description ?? null,
      courseCode: SOLANA_CRASH_COURSE.courseCode,
      sections: JSON.stringify(SOLANA_CRASH_COURSE.sections),
    });

    console.log('Upserted course:', SOLANA_CRASH_COURSE.title);
    console.log('  id:         ', SOLANA_CRASH_COURSE.id);
    console.log('  courseCode: ', SOLANA_CRASH_COURSE.courseCode);
    console.log('  sections:   ', SOLANA_CRASH_COURSE.sections.length);
    console.log('');
    console.log('Grant access: insert into user_course_codes (user_id, course_code) values (?, "SOLANA-CRASH");');
  } catch (err) {
    console.error('Error seeding Solana course:', err);
    process.exit(1);
  } finally {
    close();
  }
}

seed();
