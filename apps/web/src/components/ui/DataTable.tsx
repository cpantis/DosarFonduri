import { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

interface Column<T = any> {
  key: string;
  label: string;
  className?: string;
  align?: "left" | "center" | "right";
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T = any> {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
  emptyIcon?: string;
  onRowClick?: (row: T) => void;
  compact?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, emptyText = "Nicio înregistrare", emptyIcon = "📋", onRowClick, compact = false,
}: DataTableProps<T>) {
  if (!rows?.length) {
    return <EmptyState icon={emptyIcon} title={emptyText} />;
  }

  const cellPadding = compact ? "px-4 py-2.5" : "px-5 py-3.5";

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${cellPadding} text-[11px] uppercase tracking-wider text-slate-400 font-medium ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`transition-colors ${onRowClick ? "cursor-pointer hover:bg-slate-50/80" : "hover:bg-slate-50/50"}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`${cellPadding} text-[13px] ${col.className || "text-slate-700"} ${
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : ""
                  }`}
                >
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
