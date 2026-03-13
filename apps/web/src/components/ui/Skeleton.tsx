/** Enterprise skeleton loading component */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonText({ width = "w-full", className = "" }: { width?: string; className?: string }) {
  return <div className={`skeleton skeleton-text ${width} ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <SkeletonText width="w-2/3" />
          <SkeletonText width="w-1/3" className="skeleton-text-sm" />
        </div>
      </div>
      <SkeletonText width="w-full" />
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5">
      <Skeleton className="w-10 h-10 rounded-xl mb-3" />
      <Skeleton className="w-16 h-7 rounded-lg mb-2" />
      <SkeletonText width="w-20" className="skeleton-text-sm" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3 flex gap-8">
        <SkeletonText width="w-20" className="skeleton-text-sm" />
        <SkeletonText width="w-24" className="skeleton-text-sm" />
        <SkeletonText width="w-16" className="skeleton-text-sm" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3.5 flex gap-8 border-b border-slate-50 last:border-0">
          <SkeletonText width="w-32" />
          <SkeletonText width="w-24" />
          <SkeletonText width="w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="animate-[fadeIn_.3s_ease-out]">
      {/* Header skeleton */}
      <div className="bg-white border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <Skeleton className="w-48 h-7 rounded-lg mb-2" />
          <SkeletonText width="w-32" className="skeleton-text-sm" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <SkeletonTable />
      </div>
    </div>
  );
}
