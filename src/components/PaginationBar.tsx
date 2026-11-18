import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function PaginationBar({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-3 px-4 py-3 bg-[#F7F9F8] border-t border-neutral-200 text-xs text-neutral-700">
      <div className="flex flex-wrap items-center gap-3">
        <span className="tabular-nums">
          แสดง <strong className="text-[#0B3B2C]">{startItem}</strong> -{' '}
          <strong className="text-[#0B3B2C]">{endItem}</strong> จากทั้งหมด{' '}
          <strong className="text-[#0B3B2C]">{totalItems.toLocaleString('th-TH')}</strong> รายการ
        </span>
        <div className="flex items-center gap-1.5">
          <label htmlFor="page-size-select" className="text-neutral-600">
            ต่อหน้า:
          </label>
          <select
            id="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs font-medium text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
          >
            {[10, 20, 50, 100].map((sz) => (
              <option key={sz} value={sz}>
                {sz} รายการ
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between @xl:justify-end gap-2">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-700 font-medium hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>ก่อนหน้า</span>
        </button>
        <span className="px-2 font-semibold tabular-nums text-[#0B3B2C]">
          หน้า {safePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-700 font-medium hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <span>ถัดไป</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
