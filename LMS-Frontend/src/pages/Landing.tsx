import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  FileText,
  MessageCircle,
  ClipboardList,
  ArrowRight,
  Layers,
  ExternalLink,
  CheckCircle2,
  X,
} from 'lucide-react';

import { LawyeredFloatDecor } from '@/components/landing/LawyeredFloatDecor';

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
    description:
      'Multi-format path with modules, media, and quizzes — aligned with how we teach on the web.',
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
] as const;

const Landing: React.FC = () => {
  const features = [
    {
      icon: BookOpen,
      title: 'Course content',
      description: 'Sections, outcomes, videos, PDFs — structured so learners always know where they are.',
    },
    {
      icon: FileText,
      title: 'Submissions & feedback',
      description: 'Upload work once. Instructors review in one pipeline with clear statuses.',
    },
    {
      icon: ClipboardList,
      title: 'Quizzes',
      description: 'Check understanding inside the platform — completions tied to the learner profile.',
    },
    {
      icon: MessageCircle,
      title: 'Forum & messages',
      description: 'Class-wide discussion plus direct messaging, without scattering threads elsewhere.',
    },
  ];

  const comparison = {
    without: [
      'Links and files spread across chats and folders',
      'No shared place for deadlines, quizzes, or grades',
      'Progress is fragmented or invisible to admins',
    ],
    withUs: [
      'One syllabus and timeline per cohort',
      'Submissions, reviews, and notes in one flow',
      'Learners stay oriented — staff see throughput',
    ],
  };

  return (
    <div className="min-h-screen bg-white text-neutral-800">
      <header className="lms-landing-header">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <Link
              to="/"
              className="flex items-center gap-2.5 sm:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2 rounded-lg"
            >
              <img src="/logo.png" alt="" className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-lg ring-1 ring-neutral-200" />
              <div>
                <span className="text-base sm:text-lg font-bold text-neutral-900 block leading-tight tracking-tight">
                  SM Web Systems
                </span>
                <span className="text-[10px] sm:text-[11px] text-neutral-500 hidden sm:block font-semibold uppercase tracking-wider">
                  Learning platform
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <a
                href="#topics"
                className="hidden sm:inline-flex text-sm font-semibold text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-lg transition-colors"
              >
                Learning paths
              </a>
              <Link
                to="/login"
                className="inline-flex items-center px-4 py-2.5 rounded-full text-sm font-semibold bg-primary-dark text-white hover:bg-primary-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2 shadow-sm"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero — light, roomy, shifting mesh + floating UI (Lawyered-style) */}
      <section className="relative overflow-hidden border-b border-neutral-200/70">
        <div className="absolute inset-0 lms-hero-mesh" aria-hidden />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-grid-faint bg-[length:64px_64px] opacity-[0.28]"
        />
        <div className="relative max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-10 xl:gap-14 items-center">
            <div className="max-w-xl lg:max-w-none">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.28em] text-accent-teal mb-4">
                Blockchain education · Cohort LMS
              </p>
              <h1 className="text-[2rem] sm:text-5xl lg:text-[3rem] xl:text-[3.35rem] font-extrabold text-neutral-900 tracking-tight leading-[1.08] mb-5">
                Structured learning{' '}
                <span className="text-accent-teal">from first lesson</span>
                {' — '}
                to shipped skills.
              </h1>
              <p className="text-neutral-600 text-base sm:text-lg leading-relaxed mb-9 max-w-xl">
                Courses, quizzes, submissions, and conversations in one workspace — fewer handoffs,
                clearer feedback, closer to how modern teams actually run programmes.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-wrap mb-10">
                <Link
                  to="/login"
                  className="inline-flex justify-center items-center px-7 py-3.5 rounded-full text-[15px] font-semibold bg-primary-dark text-white hover:bg-primary-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-teal shadow-sm"
                >
                  Continue to Sign in
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
                <a
                  href="#topics"
                  className="inline-flex justify-center items-center px-7 py-3.5 rounded-full text-[15px] font-semibold border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 transition-colors shadow-sm"
                >
                  Explore learning paths
                </a>
              </div>

              <p className="text-sm text-neutral-500 font-medium tracking-tight border-t border-neutral-200/80 pt-8 max-w-md">
                One sign-in · Content, practice, and messaging together · Built for focused teams
              </p>
            </div>

            <div className="relative min-h-[380px] sm:min-h-[420px] hidden lg:block select-none">
              <LawyeredFloatDecor className="z-10" />
            </div>

            {/* Mobile: subtle strip instead of stacked cards */}
            <div className="lg:hidden -mt-4 mb-2 border border-neutral-200/80 rounded-2xl bg-white/70 p-4 shadow-card">
              <div className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {['Weeks · outcomes', 'Quizzes · subs', 'Forum · DMs'].map((t) => (
                  <span
                    key={t}
                    className="shrink-0 text-xs font-semibold text-neutral-600 px-3 py-1.5 rounded-full bg-neutral-100 border border-neutral-200/90"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Without / With — tighter, editorial */}
      <section className="py-14 sm:py-20 px-4 bg-neutral-50 border-b border-neutral-200/80">
        <div className="max-w-8xl mx-auto">
          <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-14">
            <p className="lms-kicker mb-3">Learning operations</p>
            <h2 className="text-3xl sm:text-[2.25rem] font-bold text-neutral-900 tracking-tight leading-tight mb-3">
              One platform. Every teaching loop.
            </h2>
            <p className="text-neutral-600 text-base sm:text-lg leading-relaxed">
              Stop routing every task through ad-hoc chat. Run the full loop where it belongs.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-5 md:gap-8 max-w-5xl mx-auto">
            <div className="rounded-2xl border border-neutral-200 bg-white p-7 sm:p-9">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-5">Without</p>
              <ul className="space-y-3.5">
                {comparison.without.map((line) => (
                  <li key={line} className="flex gap-3 text-neutral-600 text-[15px] leading-relaxed">
                    <X className="w-5 h-5 shrink-0 text-neutral-300 mt-0.5" strokeWidth={2} aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 border-accent-teal/30 bg-white p-7 sm:p-9 shadow-[0_18px_50px_-20px_rgb(61_122_140/0.2)] ring-4 ring-accent-teal/[0.07]">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent-teal mb-5">With this LMS</p>
              <ul className="space-y-3.5">
                {comparison.withUs.map((line) => (
                  <li key={line} className="flex gap-3 text-neutral-700 text-[15px] leading-relaxed font-medium">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-accent-teal mt-0.5" strokeWidth={2} aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/login"
                className="mt-8 inline-flex items-center text-sm font-bold text-accent-teal hover:text-accent-teal-hover"
              >
                Open workspace
                <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Paths — simplified chrome */}
      <section id="topics" className="py-14 sm:py-20 px-4 scroll-mt-24">
        <div className="max-w-8xl mx-auto">
          <div className="mb-10 sm:mb-12">
            <p className="lms-kicker mb-3">Topics</p>
            <h2 className="text-2xl sm:text-4xl font-bold text-neutral-900 tracking-tight">Learning paths</h2>
          </div>

          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            {LEARNING_PATHS.map((path) => (
              <div
                key={path.name}
                className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-6 sm:p-7 transition-colors hover:border-neutral-300"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      path.available
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                    }`}
                  >
                    {path.level}
                  </span>
                  {!path.available && (
                    <span className="text-[10px] font-semibold uppercase text-neutral-400">Roadmap</span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-neutral-900 mb-2 group-hover:text-primary-dark transition-colors">
                  {path.name}
                </h3>
                <p className="text-neutral-600 text-sm leading-relaxed flex-1 mb-5">{path.description}</p>
                {path.external ? (
                  <a
                    href={path.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm font-semibold text-accent-teal hover:text-accent-teal-hover mt-auto"
                  >
                    Companion site <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </a>
                ) : path.available ? (
                  <Link
                    to={path.href}
                    className="inline-flex items-center text-sm font-semibold text-accent-teal hover:text-accent-teal-hover mt-auto"
                  >
                    Sign in to start <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </Link>
                ) : (
                  <span className="text-sm text-neutral-400 mt-auto">Opening with your instructor soon</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities — sparse grid */}
      <section id="features" className="py-14 sm:py-20 px-4 scroll-mt-24 border-t border-neutral-100 bg-neutral-50/80">
        <div className="max-w-8xl mx-auto">
          <p className="lms-kicker mb-3">Capabilities</p>
          <h2 className="text-2xl sm:text-4xl font-bold text-neutral-900 tracking-tight mb-10">
            What learners and staff share
          </h2>
          <div className="grid gap-px bg-neutral-200 rounded-2xl overflow-hidden border border-neutral-200 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white p-6 sm:p-8 flex gap-4 group">
                <div className="w-11 h-11 rounded-xl bg-accent-teal/10 flex items-center justify-center shrink-0 ring-1 ring-accent-teal/15 group-hover:bg-accent-teal/[0.15] transition-colors">
                  <Icon className="w-5 h-5 text-accent-teal" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 mb-1.5 tracking-tight">{title}</h3>
                  <p className="text-neutral-600 text-sm leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-4 items-center justify-between border-t border-neutral-200 pt-8">
            <p className="text-sm text-neutral-500 flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-teal shrink-0" />
              Prefer the cohort view? Dashboard opens after{' '}
              <Link className="font-semibold text-accent-teal hover:underline whitespace-nowrap" to="/login">
                sign in →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA — minimal */}
      <section className="py-16 sm:py-20 px-4 border-t border-neutral-200 bg-white">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-3">Ready when you are</h2>
          <p className="text-neutral-600 mb-8 text-base leading-relaxed">
            Your account is the door — courses and tools sit behind it.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center px-8 py-3.5 rounded-full text-base font-semibold bg-primary-dark text-white hover:bg-primary-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-teal shadow-sm"
          >
            Sign in to the LMS
            <ArrowRight className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </section>

      <footer className="py-10 px-4 bg-neutral-50 border-t border-neutral-200 text-neutral-600">
        <div className="max-w-8xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8 text-sm">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg ring-1 ring-neutral-200" />
            <div>
              <span className="font-semibold text-neutral-900 block">SM Web Systems</span>
              <span className="text-neutral-500">Learning Management System</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 items-start">
            <a
              href="https://blockchain-vibe-coding.smwebsystems.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 font-medium"
            >
              Blockchain for Beginners <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
            <span>© {new Date().getFullYear()} SM Web Systems</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
