import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { TableSortControls } from '../lib/table-sort';

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
  /** Backend sort key from table whitelist */
  sortKey?: string;
  /** Optional small tooltip / sub-caption shown on header (e.g. "درصد این درس") */
  headerTooltip?: string;
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
  actionsHeaderClassName?: string;
  actionsCellClassName?: string;
  renderActions?: (row: T, index: number) => React.ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sortController?: TableSortControls<any>;
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
  actionsHeaderClassName,
  actionsCellClassName,
  renderActions,
  sortController,
}: DataTableProps<T>) {
  const mobileSelectId = React.useId();

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
          headerClassName: actionsHeaderClassName || 'w-28',
          cellClassName: actionsCellClassName || 'w-28',
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
      {/* دسکتاپ (md به بالا): جدول کامل با table-fixed و عرض صریح ستون‌ها بدون اسکرول افقی */}
      <table
        aria-label={effectiveAriaLabel}
        className="hidden md:table w-full table-fixed text-sm border-collapse"
      >
        <thead className="bg-[#344868] text-white text-xs">
          <tr>
            {visibleColumns.map((col) => {
              const isActionCol = Boolean(col.isAction || col.key === 'actions');
              const sortKey = col.sortKey;
              const isSortable = Boolean(
                sortController &&
                  sortKey &&
                  (sortController.allowedKeys as readonly string[]).includes(sortKey)
              );
              const ariaSort =
                isSortable && sortController && sortKey
                  ? sortController.getAriaSort(sortKey)
                  : undefined;
              const isActiveSort = Boolean(isSortable && sortController && sortController.sort === sortKey);
              const isCentered = Boolean(col.headerClassName?.includes('text-center'));

              return (
                <th
                  key={col.key}
                  aria-sort={ariaSort}
                  className={`px-3.5 py-3.5 text-start font-semibold min-w-0 break-words first:rounded-ss-2xl last:rounded-se-2xl ${
                    isActionCol
                      ? col.headerClassName
                        ? 'shrink-0 whitespace-nowrap'
                        : 'w-28 shrink-0 whitespace-nowrap'
                      : ''
                  } ${col.headerClassName || ''}`}
                >
                  {isSortable && sortController && sortKey ? (
                    <button
                      type="button"
                      onClick={() => sortController.toggleSort(sortKey)}
                      title={col.headerTooltip || `مرتب‌سازی بر اساس ${col.header}`}
                      aria-label={
                        col.headerTooltip
                          ? `مرتب‌سازی بر اساس ${col.header} (${col.headerTooltip})`
                          : `مرتب‌سازی بر اساس ${col.header}`
                      }
                      className={`group inline-flex flex-col gap-0.5 max-w-full cursor-pointer rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white ${
                        isCentered ? 'items-center mx-auto' : 'items-start'
                      } ${isActiveSort ? 'text-white' : 'text-white/90'}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <span>{col.header}</span>
                        {isActiveSort ? (
                          sortController.order === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown
                            className="w-3.5 h-3.5 shrink-0 text-white/55 group-hover:text-white/90 transition-colors"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      {col.headerTooltip && (
                        <span className="text-[10px] font-normal text-white/75 leading-tight">
                          {col.headerTooltip}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="inline-flex flex-col gap-0.5">
                      <span>{col.header}</span>
                      {col.headerTooltip && (
                        <span className="text-[10px] font-normal text-white/75 leading-tight">
                          {col.headerTooltip}
                        </span>
                      )}
                    </div>
                  )}
                </th>
              );
            })}
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
                {visibleColumns.map((col) => {
                  const isActionCol = Boolean(col.isAction || col.key === 'actions');
                  return (
                    <td
                      key={col.key}
                      className={`px-3.5 py-3.5 text-start align-middle min-w-0 ${
                        isActionCol
                          ? col.cellClassName
                            ? 'shrink-0 whitespace-nowrap'
                            : 'w-28 shrink-0 whitespace-nowrap'
                          : 'break-words'
                      } ${
                        col.priority === 'primary' ? 'font-semibold text-slate-800' : ''
                      } ${col.cellClassName || ''}`}
                    >
                      {col.cell(row, idx)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* موبایل (زیر md): نوار مرتب‌سازی + لیست کارت بدون اسکرول افقی */}
      {sortController && sortController.options.length > 0 && (
        <div className="md:hidden px-3 pt-3 pb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <label
              htmlFor={mobileSelectId}
              className="text-xs font-semibold text-slate-600 whitespace-nowrap shrink-0"
            >
              مرتب‌سازی بر اساس
            </label>
            <select
              id={mobileSelectId}
              value={sortController.sort}
              onChange={(e) => sortController.setSortKey(e.target.value)}
              className="flex-1 min-w-0 min-h-[40px] px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#445D84]"
            >
              {sortController.options.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.hint ? `${opt.label} (${opt.hint})` : opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => sortController.toggleDirection()}
            aria-label={
              sortController.order === 'asc'
                ? 'ترتیب صعودی؛ تغییر به نزولی'
                : 'ترتیب نزولی؛ تغییر به صعودی'
            }
            className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#445D84] inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {sortController.order === 'asc' ? (
              <>
                <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>صعودی</span>
              </>
            ) : (
              <>
                <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>نزولی</span>
              </>
            )}
          </button>
        </div>
      )}

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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-[130px] flex-1 font-bold text-slate-800 text-sm leading-snug break-words">
                  {primaryCol ? primaryCol.cell(row, idx) : null}
                </div>
                {actionCol && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 flex flex-wrap items-center gap-1 -mt-1 -me-1 [&_button]:min-w-[44px] [&_button]:min-h-[44px] [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center [&_a]:min-w-[44px] [&_a]:min-h-[44px] [&_a]:inline-flex [&_a]:items-center [&_a]:justify-center"
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
