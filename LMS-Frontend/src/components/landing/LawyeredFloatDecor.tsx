import { cn } from '@/lib/utils';

/**
 * Light, airy “floating product UI” silhouettes — Lawyered-style motion without spheres or Three.js.
 */
export function LawyeredFloatDecor({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute right-[2%] top-[14%] w-[clamp(220px,32vw,340px)] rounded-2xl border border-neutral-200/90 bg-white/95 shadow-[0_24px_64px_-12px_rgb(15_26_31/0.12)] backdrop-blur-sm lms-float-ui lms-float-ui--1 overflow-hidden">
        <FakeChrome title="Course week 3" />
        <div className="space-y-2.5 px-4 pb-4">
          <div className="h-2 rounded-full bg-neutral-200/90 w-[88%]" />
          <div className="h-2 rounded-full bg-neutral-100 w-[72%]" />
          <div className="flex gap-2 pt-2">
            <span className="h-8 flex-1 rounded-lg bg-accent-teal/12 ring-1 ring-accent-teal/20" />
            <span className="h-8 w-14 rounded-lg bg-neutral-100" />
          </div>
        </div>
      </div>

      <div className="absolute right-[14%] top-[42%] w-[clamp(200px,28vw,300px)] rounded-2xl border border-neutral-200/70 bg-neutral-50/95 shadow-lg lms-float-ui lms-float-ui--2 opacity-[0.97] overflow-hidden">
        <FakeChrome title="Submission" muted />
        <div className="space-y-2 px-4 pb-4">
          <div className="h-2 rounded-full bg-neutral-300/50 w-[55%]" />
          <div className="rounded-lg bg-white border border-neutral-200/80 h-16 flex items-center justify-center">
            <div className="w-24 h-1.5 rounded-full bg-accent-teal/25" />
          </div>
        </div>
      </div>

      <div className="absolute right-[6%] top-[62%] w-[clamp(180px,26vw,260px)] rounded-xl border border-primary-200/40 bg-white/90 shadow-md lms-float-ui lms-float-ui--3 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100 bg-primary-50/50">
          <div className="w-7 h-7 rounded-full bg-accent-teal/20" />
          <div className="flex-1 space-y-1">
            <div className="h-1.5 rounded-full bg-neutral-300/80 w-[46%]" />
            <div className="h-1 rounded-full bg-neutral-200 w-[30%]" />
          </div>
        </div>
        <div className="p-3 space-y-2">
          <div className="h-8 rounded-lg bg-neutral-100 w-full" />
          <div className="h-8 rounded-lg bg-neutral-50 w-[85%]" />
        </div>
      </div>
    </div>
  );
}

function FakeChrome({ title, muted }: { title: string; muted?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 border-b rounded-t-2xl',
        muted ? 'border-neutral-200/80 bg-white/70' : 'border-neutral-200/80 bg-white/80'
      )}
    >
      <div className="flex gap-1.5 shrink-0">
        <span className="w-2 h-2 rounded-full bg-neutral-300/90" />
        <span className="w-2 h-2 rounded-full bg-neutral-200" />
      </div>
      <span className="text-[11px] font-semibold text-neutral-500 truncate tracking-wide">{title}</span>
    </div>
  );
}
