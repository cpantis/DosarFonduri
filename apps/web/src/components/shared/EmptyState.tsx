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
      <div className="text-5xl mb-4" style={{ color: "var(--text-muted)" }}>{icon}</div>
      <h3 className="text-lg font-medium" style={{ color: "var(--text-secondary)" }}>{title}</h3>
      {description && (
        <p className="text-sm mt-1 max-w-md" style={{ color: "var(--text-muted)" }}>{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
          style={{ background: "var(--accent-blue)", color: "var(--text-on-accent)" }}
        >
          {actionLabel}
        </button>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
