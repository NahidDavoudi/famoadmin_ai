import React from 'react';

export type ColumnPriority = 'primary' | 'secondary' | 'desktop-only';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T, index: number) => React.ReactNode;
  priority: ColumnPriority;
  // primary: تو کارت موبایل به‌عنوان عنوان کارت
  // secondary: تو کارت موبایل با label کوچک
  // desktop-only: فقط تو جدول دسکتاپ، تو موبایل کاملاً حذف
  mobileLabel?: string;
  hideWhenEmpty?: boolean; // اگه مقدار همه‌ی ردیف‌ها "-" یا خالیه، ستون کلاً حذف بشه
  rawValue?: (row: T) => unknown;
  value?: (row: T) => unknown;
  headerClassName?: string;
  cellClassName?: string;
  isAction?: boolean;
};

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string;
  emptyState?: React.ReactNode;
  mobileCardRender?: (row: T, index: number) => React.ReactNode;
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
  tableAriaLabel?: string;
  ariaLabel?: string;
  actionsHeader?: string;
  renderActions?: (row: T, index: number) => React.ReactNode;
}

/**
 * Extracts plain text from a ReactNode or primitive value to detect empty / "-" cells.
 */
export function extractNodeText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).trim();
  }
  if (Array.isArray(node)) {
    return node.map(extractNodeText).join('').trim();
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: unknown };
    return extractNodeText(props?.children);
  }
  return '';
}

export function isValueEffectivelyEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  const text = typeof val === 'object' ? extractNodeText(val) : String(val).trim();
  return text === '' || text === '-' || text === '—' || text === 'ثبت نشده';
}

export function isRowColumnEmpty<T>(col: Column<T>, row: T, index = 0): boolean {
  const valExtractor = col.rawValue || col.value;
  if (valExtractor) {
    return isValueEffectivelyEmpty(valExtractor(row));
  }
  const record = row as Record<string, unknown>;
  if (record && typeof record === 'object' && col.key in record) {
    return isValueEffectivelyEmpty(record[col.key]);
  }
  return isValueEffectivelyEmpty(col.cell(row, index));
}

export function resolveVisibleColumns<T>(columns: Column<T>[], data: T[]): Column<T>[] {
  if (!data || data.length === 0) return columns;
  return columns.filter((col) => {
    if (!col.hideWhenEmpty) return true;
    const allEmpty = data.every((row, idx) => isRowColumnEmpty(col, row, idx));
    return !allEmpty;
  });
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  rowClassName,
  emptyState,
  mobileCardRender,
  renderMobileCard,
  tableAriaLabel,
  ariaLabel,
  actionsHeader,
  renderActions,
}: DataTableProps<T>) {
  if (!data || data.length === 0) {
    if (emptyState) {
      return <>{emptyState}</>;
    }
    return (
      <div className="bg-white rounded-2xl p-10 text-center border border-slate-200/80 shadow-xs">
        <p className="text-sm font-semibold text-slate-500">موردی برای نمایش یافت نشد</p>
      </div>
    );
  }

  const effectiveColumns: Column<T>[] = renderActions
    ? [
        ...columns,
        {
          key: 'actions',
          header: actionsHeader || 'عملیات',
          priority: 'secondary',
          isAction: true,
          cell: renderActions,
        },
      ]
    : columns;

  const visibleColumns = resolveVisibleColumns(effectiveColumns, data);
  const primaryCol =
    visibleColumns.find((c) => c.priority === 'primary' && !c.isAction && c.key !== 'actions') ||
    visibleColumns[0];
  const actionCol = visibleColumns.find((c) => c.isAction || c.key === 'actions');
  const secondaryCols = visibleColumns.filter(
    (c) =>
      c.priority === 'secondary' &&
      c.key !== primaryCol?.key &&
      c.key !== actionCol?.key &&
      !c.isAction
  );

  const customMobileRenderer = mobileCardRender || renderMobileCard;
  const effectiveAriaLabel = tableAriaLabel || ariaLabel;

  return (
    <div className="w-full">
      {/* دسکتاپ (md به بالا): جدول کامل و عادی بدون اسکرول افقی */}
      <table
        aria-label={effectiveAriaLabel}
        className="hidden md:table w-full text-sm border-collapse"
      >
        <thead className="bg-[#344868] text-white text-xs">
          <tr>
            {visibleColumns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3.5 text-start font-semibold whitespace-nowrap ${
                  col.priority === 'primary' ? 'min-w-[170px]' : ''
                } ${col.headerClassName || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row, idx) => {
            const customRowCls = rowClassName ? rowClassName(row, idx) : '';
            return (
              <tr
                key={rowKey(row, idx)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`hover:bg-slate-50/80 transition-colors ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${customRowCls}`}
              >
                {visibleColumns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3.5 text-start align-middle ${
                      col.priority === 'primary' ? 'font-semibold text-slate-800' : ''
                    } ${col.cellClassName || ''}`}
                  >
                    {col.cell(row, idx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* موبایل (زیر md): لیست کارت بدون اسکرول افقی و حداکثر ۳ آیتم اطلاعاتی */}
      <ul className="md:hidden space-y-3 p-3" role="list">
        {data.map((row, idx) => {
          if (customMobileRenderer) {
            return (
              <li
                key={rowKey(row, idx)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-colors ${
                  onRowClick ? 'cursor-pointer active:bg-slate-50' : ''
                }`}
              >
                {customMobileRenderer(row, idx)}
              </li>
            );
          }

          // فقط ستون‌های secondary که مقدار واقعی (غیر از "-" و خالی) دارند، حداکثر ۳ آیتم
          const nonEmptySecondary = secondaryCols
            .filter((col) => !isRowColumnEmpty(col, row, idx))
            .slice(0, 3);

          return (
            <li
              key={rowKey(row, idx)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-colors ${
                onRowClick ? 'cursor-pointer active:bg-slate-50' : ''
              }`}
            >
              {/* ردیف بالای کارت: عنوان اصلی (primary) + دکمه‌های عملیات در گوشه کارت (حداقل 44×44) */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 font-bold text-slate-800 text-sm leading-snug break-words">
                  {primaryCol ? primaryCol.cell(row, idx) : null}
                </div>
                {actionCol && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 flex items-center gap-1 -mt-1 -me-1 [&_button]:min-w-[44px] [&_button]:min-h-[44px] [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_a]:min-w-[44px] [&_a]:min-h-[44px] [&_a]:inline-flex [&_a]:items-center [&_a]:justify-center"
                  >
                    {actionCol.cell(row, idx)}
                  </div>
                )}
              </div>

              {/* حداکثر ۳ آیتم اطلاعاتی secondary با لیبل کوچک */}
              {nonEmptySecondary.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                  {nonEmptySecondary.map((col) => {
                    const label = col.mobileLabel !== undefined ? col.mobileLabel : col.header;
                    return (
                      <div key={col.key} className="flex items-center gap-1.5 min-w-0">
                        {label && <span className="text-slate-400 shrink-0">{label}:</span>}
                        <span className="text-slate-700 font-medium break-words">
                          {col.cell(row, idx)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default DataTable;
