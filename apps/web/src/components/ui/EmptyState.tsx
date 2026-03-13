interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = "📁", title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 py-16 flex flex-col items-center justify-center">
      <div className="text-5xl mb-4 opacity-30">{icon}</div>
      <div className="text-lg font-medium text-slate-500">{title}</div>
      {description && <div className="text-sm text-slate-400 mt-1 max-w-md text-center">{description}</div>}
      {actionLabel && (
        <button onClick={onAction} className="mt-5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
