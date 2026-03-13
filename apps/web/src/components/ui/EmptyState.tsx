interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = "📁", title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 border-dashed py-16 flex flex-col items-center justify-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-2xl mb-4">{icon}</div>
      <div className="text-[15px] font-semibold text-slate-600">{title}</div>
      {description && <div className="text-[13px] text-slate-400 mt-1.5 max-w-sm text-center leading-relaxed">{description}</div>}
      {actionLabel && (
        <button onClick={onAction} className="mt-5 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-medium px-5 py-2.5 rounded-lg transition-all hover:shadow-sm hover:shadow-blue-600/20">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
