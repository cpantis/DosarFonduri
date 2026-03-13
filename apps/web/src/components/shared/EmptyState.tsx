"use client";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  action?: React.ReactNode;
}

export function EmptyState({ icon = "📭", title, description, actionLabel, onAction, action }: EmptyStateProps) {
  return (
    <div className="py-12 flex flex-col items-center text-center">
      <div className="text-5xl text-slate-300 mb-4">{icon}</div>
      <h3 className="text-lg font-medium text-slate-500">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 mt-1 max-w-md">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
