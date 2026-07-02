/**
 * Seed 2 dummy courses for SM Web Systems LMS.
 * Usage: npm run db:seed-courses
 */

import dotenv from 'dotenv';
dotenv.config();

import { db, close } from '../config/database.js';
import type { Course } from '../types/index.js';

const ID = (s: string) => s;

const DUMMY_COURSES: Course[] = [
  {
    id: ID('course-blockchain-basics'),
    title: 'Blockchain Basics (Week 1)',
    description: 'Prerequisite module: core concepts and terminology.',
    courseCode: 'BLOCKCHAIN-101',
    sections: [
      {
        id: ID('sec-bc-day1'),
        title: 'Day 1 - Introduction',
        objective: 'Build a strong mental model of what a blockchain is.',
        outcome: 'You should understand blocks, hashes, and chains.',
        items: [
          {
            id: ID('item-bc-v1'),
            type: 'video',
            title: 'Part 1: What is a blockchain?',
            order: 1,
            url: 'https://www.youtube.com/embed/SSo_EIwHSd4',
          },
          {
            id: ID('item-bc-link1'),
            type: 'link',
            title: 'Slides (Day 1)',
            order: 2,
            url: 'https://example.com/slides-day1',
          },
        ],
      },
      {
        id: ID('sec-bc-day2'),
        title: 'Day 2 - Consensus',
        objective: 'Understand how nodes agree on the next block.',
        outcome: 'You should be able to explain proof-of-work and proof-of-stake.',
        items: [
          {
            id: ID('item-bc-v2'),
            type: 'video',
            title: 'Consensus mechanisms',
            order: 1,
            url: 'https://www.youtube.com/embed/UmhvJVn2b_s',
          },
          {
            id: ID('item-bc-link2'),
            type: 'link',
            title: 'Further reading',
            order: 2,
            url: 'https://ethereum.org/en/developers/docs/consensus-mechanisms/',
          },
        ],
      },
    ],
  },
  {
    id: ID('course-solidity'),
    title: 'Smart Contracts & Solidity',
    description: 'Write and deploy simple smart contracts.',
    courseCode: 'SOLIDITY-201',
    sections: [
      {
        id: ID('sec-sol-fund'),
        title: 'Solidity fundamentals',
        objective: 'Learn syntax, types, and basic patterns.',
        outcome: 'You can write a simple contract and compile it.',
        items: [
          {
            id: ID('item-sol-v1'),
            type: 'video',
            title: 'Solidity in 15 minutes',
            order: 1,
            url: 'https://www.youtube.com/embed/5bqQ5FQaRog',
          },
          {
            id: ID('item-sol-link'),
            type: 'link',
            title: 'Solidity docs',
            order: 2,
            url: 'https://docs.soliditylang.org/',
          },
        ],
      },
      {
        id: ID('sec-sol-deploy'),
        title: 'Deploying contracts',
        objective: 'Use Remix or Hardhat to deploy to a testnet.',
        outcome: 'You have deployed at least one contract.',
        items: [
          {
            id: ID('item-sol-v2'),
            type: 'video',
            title: 'Remix walkthrough',
            order: 1,
            url: 'https://www.youtube.com/embed/5bqQ5FQaRog',
          },
          {
            id: ID('item-sol-pdf'),
            type: 'pdf',
            title: 'Lab handout (PDF)',
            order: 2,
          },
        ],
      },
    ],
  },
  {
    id: ID('course-web3-dapps'),
    title: 'Web3 & dApps',
    description: 'Build decentralized applications and connect to wallets.',
    courseCode: 'WEB3-301',
    sections: [
      {
        id: ID('sec-web3-wallets'),
        title: 'Wallets and signing',
        objective: 'Understand how users connect and sign transactions.',
        outcome: 'You can integrate MetaMask (or similar) in a front-end.',
        items: [
          {
            id: ID('item-web3-v1'),
            type: 'video',
            title: 'MetaMask and ethers.js',
            order: 1,
            url: 'https://www.youtube.com/embed/YV6HmQ0Rvb4',
          },
          {
            id: ID('item-web3-link'),
            type: 'link',
            title: 'ethers.js docs',
            order: 2,
            url: 'https://docs.ethers.org/v6/',
          },
        ],
      },
      {
        id: ID('sec-web3-dapp'),
        title: 'Your first dApp',
        objective: 'Connect a React app to a contract and display data.',
        outcome: 'You have a small dApp that reads from a contract.',
        items: [
          {
            id: ID('item-web3-v2'),
            type: 'video',
            title: 'Full-stack dApp tutorial',
            order: 1,
            url: 'https://www.youtube.com/embed/8FmX2_yBYP0',
          },
          {
            id: ID('item-web3-pdf'),
            type: 'pdf',
            title: 'Lab: Build a token dashboard',
            order: 2,
          },
        ],
      },
      {
        id: ID('sec-web3-security'),
        title: 'Security and best practices',
        objective: 'Avoid common pitfalls in dApp and contract development.',
        outcome: 'You can list key security considerations.',
        items: [
          {
            id: ID('item-web3-link2'),
            type: 'link',
            title: 'Smart contract security checklist',
            order: 1,
            url: 'https://consensys.github.io/smart-contract-best-practices/',
          },
        ],
      },
    ],
  },
];

function seed() {
  try {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO courses (id, title, description, course_code, sections) VALUES (?, ?, ?, ?, ?)'
    );
    for (const course of DUMMY_COURSES) {
      const result = insert.run(
        course.id,
        course.title,
        course.description ?? null,
        course.courseCode,
        JSON.stringify(course.sections)
      );
      if (result.changes > 0) {
        console.log('Created course:', course.title);
      } else {
        console.log('Skipped (id exists):', course.title);
      }
    }
    console.log('Seeded', DUMMY_COURSES.length, 'dummy courses.');
  } catch (err) {
    console.error('Error seeding courses:', err);
    process.exit(1);
  } finally {
    close();
  }
}

seed();
