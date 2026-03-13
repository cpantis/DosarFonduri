"use client";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="text-[40px] mb-3" style={{ opacity: 0.5 }}>{icon}</div>
      <h3
        className="text-sm font-semibold mb-1 text-slate-400"
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-[13px] max-w-md mb-6 leading-relaxed text-slate-400"
        >
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
