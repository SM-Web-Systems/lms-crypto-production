import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ClipboardList,
  Upload,
  Library,
  Mail,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';

const quickActions = [
  {
    to: '/student/course',
    title: 'Course',
    blurb: 'Lessons & progress',
    icon: BookOpen,
    gradient: 'from-accent-teal/15 via-white to-primary-50/80',
    iconBg: 'bg-accent-teal/20 text-accent-teal',
  },
  {
    to: '/student/quizzes',
    title: 'Quizzes',
    blurb: 'Practice & checks',
    icon: ClipboardList,
    gradient: 'from-sky-100/80 via-white to-indigo-50/60',
    iconBg: 'bg-sky-500/15 text-sky-700',
  },
  {
    to: '/student/submissions',
    title: 'Submissions',
    blurb: 'Upload work',
    icon: Upload,
    gradient: 'from-violet-100/70 via-white to-fuchsia-50/50',
    iconBg: 'bg-violet-500/15 text-violet-700',
  },
  {
    to: '/student/documents',
    title: 'Resources',
    blurb: 'Files & readings',
    icon: Library,
    gradient: 'from-amber-100/70 via-white to-orange-50/50',
    iconBg: 'bg-amber-500/15 text-amber-800',
  },
  {
    to: '/student/messages',
    title: 'Messages',
    blurb: 'Chat with classmates',
    icon: Mail,
    gradient: 'from-teal-100/80 via-white to-emerald-50/60',
    iconBg: 'bg-teal-600/15 text-teal-800',
  },
  {
    to: '/student/forum',
    title: 'Forum',
    blurb: 'Discuss & ask',
    icon: MessageCircle,
    gradient: 'from-primary-100/90 via-white to-neutral-50',
    iconBg: 'bg-primary-500/15 text-primary-dark',
  },
];

const QuickActionsGrid: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Jump in</h2>
          <p className="text-sm text-neutral-600 mt-0.5">Everything you need, no hunting in the menu.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.to}
              type="button"
              onClick={() => navigate(action.to)}
              className={`group text-left rounded-xl border border-neutral-200/90 bg-gradient-to-br ${action.gradient} p-4 shadow-card ring-1 ring-neutral-900/[0.03] transition-all hover:shadow-updraft-hover hover:-translate-y-0.5 hover:ring-neutral-900/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal focus-visible:ring-offset-2`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.iconBg} shrink-0`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <ArrowRight
                  className="h-5 w-5 text-neutral-400 group-hover:text-accent-teal group-hover:translate-x-0.5 transition-transform shrink-0"
                  aria-hidden
                />
              </div>
              <p className="mt-3 font-semibold text-neutral-900">{action.title}</p>
              <p className="text-sm text-neutral-600 mt-0.5">{action.blurb}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default QuickActionsGrid;
