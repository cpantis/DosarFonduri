interface Tab {
  key: string;
  label: string;
  count?: number;
  icon?: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex items-center gap-0.5 border-b border-slate-200/80">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`relative px-4 py-3 text-[13px] font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            active === tab.key
              ? "text-blue-600"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {tab.icon && <span className="text-[14px]">{tab.icon}</span>}
          {tab.label}
          {tab.count !== undefined && (
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
              active === tab.key ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"
            }`}>
              {tab.count}
            </span>
          )}
          {active === tab.key && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
