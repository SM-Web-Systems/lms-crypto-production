import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import { Sparkles, ArrowRight } from 'lucide-react';

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface DashboardHeroProps {
  userName: string;
  engagementHint: { text: string; icon: React.ComponentType<{ className?: string }> };
}

const DashboardHero: React.FC<DashboardHeroProps> = ({ userName, engagementHint }) => {
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);
  const firstName = userName.trim().split(/\s+/)[0] || 'there';
  const HintIcon = engagementHint.icon;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-gradient-to-br from-accent-teal/[0.12] via-white to-primary-50/90 shadow-updraft ring-1 ring-neutral-900/[0.04]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[length:28px_28px] bg-[linear-gradient(to_right,rgb(15_26_31/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(15_26_31/0.06)_1px,transparent_1px)]"
        aria-hidden
      />
      <div className="relative px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-dark ring-1 ring-neutral-200/80 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-accent-teal" aria-hidden />
              Your learning hub
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
              {greeting}, {firstName}!
            </h1>
            <p className="text-neutral-700 text-base sm:text-lg leading-relaxed">
              Pick up where you left off — course, quizzes, and classmates are one tap away.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" onClick={() => navigate('/student/course')}>
                Go to course
                <ArrowRight className="h-4 w-4 ml-2" aria-hidden />
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('/student/quizzes')}>
                Take a quiz
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-white/80 bg-white/60 backdrop-blur-sm px-4 py-4 sm:px-5 sm:py-5 shadow-sm ring-1 ring-neutral-200/60 max-w-md w-full lg:shrink-0">
            <div className="flex gap-3 items-start">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-teal/15 text-accent-teal">
                <HintIcon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Today's nudge</p>
                <p className="text-sm text-neutral-800 mt-1 leading-relaxed font-medium">{engagementHint.text}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default DashboardHero;
