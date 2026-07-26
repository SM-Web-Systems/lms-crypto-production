const pulse = 'animate-pulse rounded-md bg-neutral-200/80';

/** Student / admin dashboard: title, promo strip, stat tiles, content blocks. */
export function DashboardPageSkeleton({ variant = 'student' }: { variant?: 'student' | 'admin' }) {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="mb-8 space-y-3">
        <div className={`h-9 w-64 max-w-full ${pulse}`} />
        <div className={`h-4 w-96 max-w-full ${pulse}`} />
      </div>
      <div className={`h-24 w-full rounded-xl border border-neutral-200/80 ${pulse} mb-6`} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-neutral-200/80 bg-white p-5 shadow-sm">
            <div className={`h-4 w-24 ${pulse} mb-4`} />
            <div className={`h-9 w-16 ${pulse}`} />
          </div>
        ))}
      </div>
      {variant === 'admin' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-neutral-200/80 bg-white p-5 min-h-[240px] space-y-3">
            <div className={`h-5 w-40 ${pulse}`} />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`h-14 w-full ${pulse}`} />
            ))}
          </div>
          <div className="rounded-xl border border-neutral-200/80 bg-white p-5 min-h-[240px] space-y-4">
            <div className={`h-5 w-48 ${pulse}`} />
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className={`h-3 w-32 ${pulse}`} />
                <div className={`h-2 w-full ${pulse}`} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200/80 bg-white p-5 min-h-[280px] space-y-3">
          <div className={`h-5 w-44 ${pulse}`} />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`h-16 w-full ${pulse}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Student resources: document cards only (filters stay visible on the page). */
export function DocumentsGridSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading documents">
      <div>
        <div className={`h-5 w-40 ${pulse} mb-4`} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-neutral-200/80 bg-white p-5 space-y-3">
              <div className="flex gap-3">
                <div className={`h-14 w-14 shrink-0 ${pulse}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-full ${pulse}`} />
                  <div className={`h-3 w-[85%] ${pulse}`} />
                  <div className={`h-3 w-1/2 ${pulse}`} />
                </div>
              </div>
              <div className={`h-9 w-full ${pulse}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Admin documents table area. */
export function DocumentsTableSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white overflow-hidden" aria-busy="true" aria-label="Loading documents">
      <div className="px-5 py-4 border-b border-neutral-100">
        <div className={`h-5 w-48 ${pulse}`} />
      </div>
      <div className="p-4 space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className={`h-12 w-full ${pulse}`} />
        ))}
      </div>
    </div>
  );
}

/** Admin course: header + course list rows. */
export function AdminCoursePageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading courses">
      <div className="mb-8 flex gap-3">
        <div className={`h-10 w-10 shrink-0 rounded-lg ${pulse}`} />
        <div className="space-y-2 flex-1">
          <div className={`h-8 w-48 ${pulse}`} />
          <div className={`h-4 max-w-xl w-full ${pulse}`} />
        </div>
      </div>
      <div className={`h-10 w-40 ${pulse} mb-6`} />
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-neutral-200/80 bg-white p-4 flex justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className={`h-5 w-56 max-w-full ${pulse}`} />
              <div className={`h-3 w-72 max-w-full ${pulse}`} />
            </div>
            <div className="flex gap-2 shrink-0">
              <div className={`h-9 w-20 ${pulse}`} />
              <div className={`h-9 w-10 ${pulse}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Course members: hero, stat tiles, course grid, roster block. */
export function CourseMembersPageSkeleton() {
  return (
    <div className="pb-10 space-y-8" aria-busy="true" aria-label="Loading course members">
      <div className={`rounded-2xl border border-neutral-200/90 bg-neutral-50/50 h-[min(220px,32vh)] ${pulse}`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-neutral-200/80 bg-white p-5 shadow-sm">
            <div className={`h-12 w-12 rounded-xl ${pulse} mb-3`} />
            <div className={`h-4 w-28 ${pulse} mb-2`} />
            <div className={`h-8 w-14 ${pulse}`} />
          </div>
        ))}
      </div>
      <div>
        <div className={`h-5 w-36 ${pulse} mb-4`} />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-24 rounded-xl border border-neutral-200/80 ${pulse}`} />
          ))}
        </div>
      </div>
      <div className={`rounded-xl border border-neutral-200/80 min-h-[280px] ${pulse}`} />
    </div>
  );
}

/** StudentDashboard: certificate eligibility section while courses are loading. */
export function CertEligibilitySkeleton() {
  const pulse = 'animate-pulse rounded-md bg-neutral-200/80';
  return (
    <div aria-busy="true">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className={`h-5 w-44 ${pulse}`} />
          <div className={`h-3 w-72 max-w-full ${pulse}`} />
        </div>
        <div className={`h-4 w-24 shrink-0 ${pulse}`} />
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className={`h-4 w-48 max-w-full ${pulse}`} />
              <div className={`h-3 w-20 ${pulse}`} />
            </div>
            <div className={`h-9 w-28 shrink-0 ${pulse}`} />
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className={`h-4 w-40 max-w-full ${pulse}`} />
              <div className={`h-3 w-20 ${pulse}`} />
            </div>
            <div className={`h-9 w-28 shrink-0 ${pulse}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
