import * as XLSX from 'xlsx';

export interface ExcelColumn<T> {
  header: string;
  value: (row: T, index: number) => string | number;
  width?: number;
}

export function exportToExcel<T>(
  rows: T[],
  columns: ExcelColumn<T>[],
  sheetTitle: string,
  fileNamePrefix: string,
  reportSubtitle?: string
) {
  const today = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const headerBanner = [
    ['CO-OP WATCHING SYSTEM — ระบบติดตามข้อสังเกตและข้อบกพร่องของสหกรณ์'],
    ['สำนักงานสหกรณ์จังหวัดชัยนาท'],
    [reportSubtitle || sheetTitle, `วันที่จัดทำรายงาน: ${today}`],
    [],
    columns.map((c) => c.header),
  ];

  const dataRows = rows.map((row, idx) => columns.map((col) => col.value(row, idx)));
  const worksheet = XLSX.utils.aoa_to_sheet([...headerBanner, ...dataRows]);

  worksheet['!cols'] = columns.map((col) => ({ wch: col.width || 22 }));

  const workbook = XLSX.utils.book_new();
  const safeSheetName = sheetTitle.slice(0, 31).replace(/[\\/?*[\]]/g, '');
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName || 'Report');

  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${fileNamePrefix}_${dateTag}.xlsx`);
}

export function formatThaiDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatThaiDateTime(dateStr?: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return parsed.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function triggerOfficialPrint() {
  window.print();
}
