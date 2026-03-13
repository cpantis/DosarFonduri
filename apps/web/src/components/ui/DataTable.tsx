import { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

interface Column<T = any> {
  key: string;
  label: string;
  className?: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T = any> {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
}

export function DataTable<T extends Record<string, any>>({ columns, rows, emptyText = "Nicio înregistrare" }: DataTableProps<T>) {
  if (!rows?.length) {
    return <EmptyState icon="📋" title={emptyText} />;
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {columns.map((col) => (
              <th key={col.key} className="text-left px-5 py-3 text-[11px] uppercase tracking-wide text-slate-500 font-medium">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
              {columns.map((col) => (
                <td key={col.key} className={`px-5 py-4 text-[13px] ${col.className || "text-slate-700"}`}>
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
