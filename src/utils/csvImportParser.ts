import type { DefectStatus, ObservationStatus } from '../types/coop';

export interface ParsedCoopImportRow {
  CooperativeName: string;
  LetterInfo: string;
  AccountingYear: string;
  IssueCount: number;
  ObservationDetails: string;
  CorrectionGuidelines: string;
  Status: ObservationStatus;
}

export interface ParsedFarmerImportRow {
  FarmerGroupName: string;
  AccountingYear: string;
  AuditOfficeLetterNumber: string;
  AuditOfficeLetterDate: string;
  CorrectionNotificationLetterNumber: string;
  CorrectionNotificationLetterDate: string;
  IssueCount: number;
  ObservationDetails: string;
  CorrectionGuidelines: string;
  Status: ObservationStatus;
}

export interface ParsedDefectImportRow {
  CooperativeName: string;
  OrderNumber: string;
  OrderDate: string;
  DefectDetails: string;
  CorrectionResults: string;
  DefectStatus: DefectStatus;
}

export type SheetModuleType = 'coop' | 'farmer' | 'defects' | 'system' | 'unsupported';

export interface ParsedSheetResult {
  sheetName: string;
  moduleType: SheetModuleType;
  accountingYear?: string;
  coopRows: ParsedCoopImportRow[];
  farmerRows: ParsedFarmerImportRow[];
  defectRows: ParsedDefectImportRow[];
  rowCount: number;
  error?: string;
}

export interface ParsedWorkbookSummary {
  sheets: ParsedSheetResult[];
  totalCoop: number;
  totalFarmer: number;
  totalDefects: number;
}

/**
 * RFC-4180 compliant CSV parser supporting UTF-8 BOM, Thai text, and multi-line quoted cells.
 */
export function parseCsvMatrix(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(h: string): string {
  // Remove whitespace and Thai combining marks (upper/lower vowels & tone marks) for resilient matching
  return String(h || '')
    .replace(/\s+/g, '')
    .replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '')
    .toLowerCase();
}

function isCheckedCell(val: string | undefined): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return (
    v.includes('✔') ||
    v.includes('✓') ||
    v === 'true' ||
    v === '1' ||
    v === 'ใช่' ||
    v === 'x' ||
    v === '/'
  );
}

function normalizeObservationStatus(val: string | undefined): ObservationStatus {
  const v = String(val || '').trim();
  if (v === 'แก้ไขเสร็จสิ้น' || v.includes('เสร็จสิ้น')) return 'แก้ไขเสร็จสิ้น';
  return 'อยู่ระหว่างดำเนินการ';
}

function normalizeDefectStatus(val: string | undefined): DefectStatus {
  const v = String(val || '').trim();
  if (v === 'แก้ไขเสร็จสิ้น') return 'แก้ไขเสร็จสิ้น';
  if (v === 'แก้ไขแล้ว') return 'แก้ไขแล้ว';
  if (v === 'อยู่ระหว่างดำเนินการแก้ไข' || v.includes('อยู่ระหว่าง')) return 'อยู่ระหว่างดำเนินการแก้ไข';
  return 'ยังไม่ได้ดำเนินการแก้ไข';
}

function normalizeDateToIso(val: string | undefined): string {
  const raw = String(val || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    let yearNum = Number(slashMatch[3]);
    if (yearNum > 2400) yearNum -= 543;
    return `${yearNum}-${month}-${day}`;
  }
  return '';
}

export function extractAccountingYear(
  matrix: string[][],
  fallbackYear = '2567',
  sheetName?: string
): string {
  for (let i = 0; i < Math.min(3, matrix.length); i++) {
    const line = (matrix[i] || []).join(' ');
    const match = line.match(/(25\d{2}|20\d{2})/);
    if (match) return match[1];
  }
  if (sheetName) {
    const tabMatch = sheetName.match(/(25\d{2}|20\d{2})/);
    if (tabMatch) return tabMatch[1];
  }
  return fallbackYear;
}

/**
 * Parses the official Thai Cooperative Observation sheet matrix OR standard CooperativeObservations sheet into structured rows.
 * Supports merged/blank continuation rows (carries down CooperativeName & LetterInfo).
 */
export function parseThaiCoopSheetMatrix(
  matrix: string[][],
  options: {
    accountingYearOverride?: string;
    splitPerIssue?: boolean;
    sheetName?: string;
  } = {}
): { accountingYear: string; rows: ParsedCoopImportRow[] } {
  const detectedYear = extractAccountingYear(matrix, '2567', options.sheetName);
  const accountingYear = options.accountingYearOverride?.trim() || detectedYear;
  const splitPerIssue = options.splitPerIssue !== false;

  // 1) Check for standard system schema header first: CooperativeName + ObservationDetails
  let stdHeaderIdx = -1;
  let stdCols: Record<string, number> = {};
  for (let i = 0; i < Math.min(5, matrix.length); i++) {
    const row = matrix[i] || [];
    const nameIdx = row.findIndex((c) => c.trim() === 'CooperativeName');
    const obsIdx = row.findIndex((c) => c.trim() === 'ObservationDetails');
    if (nameIdx !== -1 && obsIdx !== -1) {
      stdHeaderIdx = i;
      row.forEach((h, idx) => {
        stdCols[h.trim()] = idx;
      });
      break;
    }
  }

  if (stdHeaderIdx !== -1) {
    const rows: ParsedCoopImportRow[] = [];
    for (let r = stdHeaderIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] || [];
      const CooperativeName = String(row[stdCols.CooperativeName] || '').trim();
      const ObservationDetails = String(row[stdCols.ObservationDetails] || '').trim();
      if (!CooperativeName || !ObservationDetails) continue;
      const rowYear =
        options.accountingYearOverride?.trim() ||
        (stdCols.AccountingYear !== undefined ? String(row[stdCols.AccountingYear] || '').trim() : '') ||
        detectedYear;
      const countVal = stdCols.IssueCount !== undefined ? Number(row[stdCols.IssueCount] || 1) : 1;
      rows.push({
        CooperativeName,
        LetterInfo: stdCols.LetterInfo !== undefined ? String(row[stdCols.LetterInfo] || '').trim() : '',
        AccountingYear: rowYear,
        IssueCount: Number.isInteger(countVal) && countVal > 0 ? countVal : 1,
        ObservationDetails,
        CorrectionGuidelines:
          stdCols.CorrectionGuidelines !== undefined
            ? String(row[stdCols.CorrectionGuidelines] || '').trim() || '-'
            : '-',
        Status:
          stdCols.Status !== undefined
            ? normalizeObservationStatus(row[stdCols.Status])
            : 'อยู่ระหว่างดำเนินการ',
      });
    }
    return { accountingYear, rows };
  }

  // 2) Locate official Thai Cooperative Observation header row
  let headerIdx = -1;
  let colName = -1;
  let colLetter = -1;
  let colYear = -1;
  let colIssueCount = -1;
  let colObs = -1;
  let colGuide = -1;
  let colDone = -1;
  let colInProgress = -1;
  let colStatusText = -1;

  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const normalized = (matrix[i] || []).map(normalizeHeader);
    const nameIdx = normalized.findIndex((c) => c.includes('ชอสหกรณ') || c === 'สหกรณ');
    const obsIdx = normalized.findIndex((c) => c.includes('ขอสงเกต'));
    if (nameIdx !== -1 && obsIdx !== -1) {
      headerIdx = i;
      colName = nameIdx;
      colObs = obsIdx;
      colLetter = normalized.findIndex((c) => c.includes('เลขทหนงสอ') || c.includes('เลขหนงสอ'));
      colYear = normalized.findIndex((c) => c.includes('ปบญช'));
      colIssueCount = normalized.findIndex((c) => c.includes('จำนวนประเดน'));
      colGuide = normalized.findIndex((c) => c.includes('แนวทางการแกไข') || c.includes('แนวทางแกไข'));
      colDone = normalized.findIndex((c) => c.includes('แกไขเสรจสน'));
      colInProgress = normalized.findIndex((c) => c.includes('อยระหวางดำเนนการ'));
      colStatusText = normalized.findIndex((c) => c === 'สถานะ' || c.includes('สถานะการดำเนนการ'));
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error(
      'ไม่พบหัวตารางที่รองรับ (ต้องมีคอลัมน์ "ชื่อสหกรณ์" และ "ข้อสังเกตที่ตรวจพบ")'
    );
  }

  interface GroupedBlock {
    coopName: string;
    letterInfo: string;
    blockYear: string;
    declaredIssueCount: number;
    items: Array<{
      obs: string;
      guide: string;
      status: ObservationStatus;
    }>;
  }

  const blocks: GroupedBlock[] = [];
  let currentBlock: GroupedBlock | null = null;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (row.every((c) => !String(c || '').trim())) continue;

    const rawName = (row[colName] || '').trim();
    const rawLetter = colLetter >= 0 ? (row[colLetter] || '').trim() : '';
    const rawRowYear = colYear >= 0 ? (row[colYear] || '').trim() : '';
    const rawCount = colIssueCount >= 0 ? Number(row[colIssueCount] || 0) : 0;
    const obs = (row[colObs] || '').trim();
    const guide = colGuide >= 0 ? (row[colGuide] || '').trim() : '';

    let status: ObservationStatus = 'อยู่ระหว่างดำเนินการ';
    if (colDone >= 0 || colInProgress >= 0) {
      const isDone = colDone >= 0 && isCheckedCell(row[colDone]);
      const isInProgress = colInProgress >= 0 && isCheckedCell(row[colInProgress]);
      status = isDone && !isInProgress ? 'แก้ไขเสร็จสิ้น' : 'อยู่ระหว่างดำเนินการ';
    } else if (colStatusText >= 0) {
      status = normalizeObservationStatus(row[colStatusText]);
    }

    if (rawName) {
      currentBlock = {
        coopName: rawName,
        letterInfo: rawLetter,
        blockYear: options.accountingYearOverride?.trim() || rawRowYear || accountingYear,
        declaredIssueCount: rawCount > 0 ? rawCount : 1,
        items: [],
      };
      blocks.push(currentBlock);
    }

    if (currentBlock && (obs || guide)) {
      currentBlock.items.push({
        obs: obs || '-',
        guide: guide || '-',
        status,
      });
    }
  }

  const output: ParsedCoopImportRow[] = [];

  for (const block of blocks) {
    if (block.items.length === 0) continue;

    if (splitPerIssue) {
      for (const item of block.items) {
        output.push({
          CooperativeName: block.coopName,
          LetterInfo: block.letterInfo,
          AccountingYear: block.blockYear,
          IssueCount: 1,
          ObservationDetails: item.obs,
          CorrectionGuidelines: item.guide,
          Status: item.status,
        });
      }
    } else {
      const allDone = block.items.every((it) => it.status === 'แก้ไขเสร็จสิ้น');
      output.push({
        CooperativeName: block.coopName,
        LetterInfo: block.letterInfo,
        AccountingYear: block.blockYear,
        IssueCount: block.declaredIssueCount || block.items.length,
        ObservationDetails: block.items.map((it) => it.obs).join('\n\n'),
        CorrectionGuidelines: block.items.map((it) => it.guide).join('\n\n'),
        Status: allDone ? 'แก้ไขเสร็จสิ้น' : 'อยู่ระหว่างดำเนินการ',
      });
    }
  }

  return { accountingYear, rows: output };
}

/**
 * Parses FarmerGroupObservations sheet (standard headers or Thai headers).
 */
export function parseFarmerGroupSheetMatrix(
  matrix: string[][],
  options: { accountingYearOverride?: string; sheetName?: string } = {}
): { accountingYear: string; rows: ParsedFarmerImportRow[] } {
  const detectedYear = extractAccountingYear(matrix, '2567', options.sheetName);
  const accountingYear = options.accountingYearOverride?.trim() || detectedYear;

  let headerIdx = -1;
  let colName = -1;
  let colYear = -1;
  let colAuditNo = -1;
  let colAuditDate = -1;
  let colNotifyNo = -1;
  let colNotifyDate = -1;
  let colIssueCount = -1;
  let colObs = -1;
  let colGuide = -1;
  let colDone = -1;
  let colInProgress = -1;
  let colStatus = -1;

  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const rawRow = matrix[i] || [];
    const normalized = rawRow.map(normalizeHeader);

    const stdName = rawRow.findIndex((c) => c.trim() === 'FarmerGroupName');
    const stdObs = rawRow.findIndex((c) => c.trim() === 'ObservationDetails');
    if (stdName !== -1 && stdObs !== -1) {
      headerIdx = i;
      colName = stdName;
      colObs = stdObs;
      colYear = rawRow.findIndex((c) => c.trim() === 'AccountingYear');
      colAuditNo = rawRow.findIndex((c) => c.trim() === 'AuditOfficeLetterNumber');
      colAuditDate = rawRow.findIndex((c) => c.trim() === 'AuditOfficeLetterDate');
      colNotifyNo = rawRow.findIndex((c) => c.trim() === 'CorrectionNotificationLetterNumber');
      colNotifyDate = rawRow.findIndex((c) => c.trim() === 'CorrectionNotificationLetterDate');
      colIssueCount = rawRow.findIndex((c) => c.trim() === 'IssueCount');
      colGuide = rawRow.findIndex((c) => c.trim() === 'CorrectionGuidelines');
      colStatus = rawRow.findIndex((c) => c.trim() === 'Status');
      break;
    }

    const thName = normalized.findIndex((c) => c.includes('กลมเกษตรกร'));
    const thObs = normalized.findIndex((c) => c.includes('ขอสงเกต'));
    if (thName !== -1 && thObs !== -1) {
      headerIdx = i;
      colName = thName;
      colObs = thObs;
      colYear = normalized.findIndex((c) => c.includes('ปบญช'));
      colAuditNo = normalized.findIndex(
        (c) => c.includes('เลขทหนงสอสตส') || c.includes('เลขทหนงสอตรวจบญช') || c.includes('เลขทหนงสอ') || c.includes('เลขหนงสอ')
      );
      colAuditDate = normalized.findIndex((c) => c.includes('ลงวนท') && c.includes('สตส'));
      colNotifyNo = normalized.findIndex((c) => c.includes('แจงแกไข'));
      colIssueCount = normalized.findIndex((c) => c.includes('จำนวนประเดน'));
      colGuide = normalized.findIndex((c) => c.includes('แนวทางการแกไข') || c.includes('แนวทางแกไข'));
      colDone = normalized.findIndex((c) => c.includes('แกไขเสรจสน'));
      colInProgress = normalized.findIndex((c) => c.includes('อยระหวางดำเนนการ'));
      colStatus = normalized.findIndex((c) => c === 'สถานะ' || c.includes('สถานะการดำเนนการ'));
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('ไม่พบหัวตารางข้อสังเกตของกลุ่มเกษตรกรที่รองรับ');
  }

  const rows: ParsedFarmerImportRow[] = [];
  let lastGroupName = '';
  let lastAuditNo = '';
  let lastAuditDate = '';
  let lastNotifyNo = '';
  let lastNotifyDate = '';
  let lastYear = accountingYear;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (row.every((c) => !String(c || '').trim())) continue;

    const rawName = (row[colName] || '').trim();
    if (rawName) {
      lastGroupName = rawName;
      lastYear =
        options.accountingYearOverride?.trim() ||
        (colYear >= 0 ? (row[colYear] || '').trim() : '') ||
        accountingYear;
      lastAuditNo = colAuditNo >= 0 ? (row[colAuditNo] || '').trim() : '';
      lastAuditDate = colAuditDate >= 0 ? normalizeDateToIso(row[colAuditDate]) : '';
      lastNotifyNo = colNotifyNo >= 0 ? (row[colNotifyNo] || '').trim() : '';
      lastNotifyDate = colNotifyDate >= 0 ? normalizeDateToIso(row[colNotifyDate]) : '';
    }

    const obs = (row[colObs] || '').trim();
    const guide = colGuide >= 0 ? (row[colGuide] || '').trim() : '';
    if (!lastGroupName || (!obs && !guide)) continue;

    let status: ObservationStatus = 'อยู่ระหว่างดำเนินการ';
    if (colDone >= 0 || colInProgress >= 0) {
      const isDone = colDone >= 0 && isCheckedCell(row[colDone]);
      const isInProgress = colInProgress >= 0 && isCheckedCell(row[colInProgress]);
      status = isDone && !isInProgress ? 'แก้ไขเสร็จสิ้น' : 'อยู่ระหว่างดำเนินการ';
    } else if (colStatus >= 0) {
      status = normalizeObservationStatus(row[colStatus]);
    }

    const rawCount = colIssueCount >= 0 ? Number(row[colIssueCount] || 1) : 1;
    rows.push({
      FarmerGroupName: lastGroupName,
      AccountingYear: lastYear,
      AuditOfficeLetterNumber: lastAuditNo,
      AuditOfficeLetterDate: lastAuditDate,
      CorrectionNotificationLetterNumber: lastNotifyNo,
      CorrectionNotificationLetterDate: lastNotifyDate,
      IssueCount: Number.isInteger(rawCount) && rawCount > 0 ? rawCount : 1,
      ObservationDetails: obs || '-',
      CorrectionGuidelines: guide || '-',
      Status: status,
    });
  }

  return { accountingYear, rows };
}

/**
 * Parses Defects sheet (standard headers or Thai headers).
 */
export function parseDefectsSheetMatrix(
  matrix: string[][],
  options: { sheetName?: string } = {}
): ParsedDefectImportRow[] {
  let headerIdx = -1;
  let colName = -1;
  let colOrderNo = -1;
  let colOrderDate = -1;
  let colDetails = -1;
  let colResults = -1;
  let colStatus = -1;

  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const rawRow = matrix[i] || [];
    const normalized = rawRow.map(normalizeHeader);

    const stdName = rawRow.findIndex((c) => c.trim() === 'CooperativeName');
    const stdDefect = rawRow.findIndex((c) => c.trim() === 'DefectDetails');
    if (stdName !== -1 && stdDefect !== -1) {
      headerIdx = i;
      colName = stdName;
      colDetails = stdDefect;
      colOrderNo = rawRow.findIndex((c) => c.trim() === 'OrderNumber');
      colOrderDate = rawRow.findIndex((c) => c.trim() === 'OrderDate');
      colResults = rawRow.findIndex((c) => c.trim() === 'CorrectionResults');
      colStatus = rawRow.findIndex((c) => c.trim() === 'DefectStatus');
      break;
    }

    const thName = normalized.findIndex((c) => c.includes('ชอสหกรณ') || c === 'สหกรณ');
    const thDefect = normalized.findIndex((c) => c.includes('ขอบกพรอง'));
    if (thName !== -1 && thDefect !== -1) {
      headerIdx = i;
      colName = thName;
      colDetails = thDefect;
      colOrderNo = normalized.findIndex((c) => c.includes('เลขทคำสง') || c.includes('เลขคำสง'));
      colOrderDate = normalized.findIndex((c) => c.includes('วนทออกคำสง') || c.includes('ลงวนท'));
      colResults = normalized.findIndex((c) => c.includes('ผลการแกไข'));
      colStatus = normalized.findIndex((c) => c.includes('สถานะ'));
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('ไม่พบหัวตารางข้อบกพร่องที่รองรับ');
  }

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const rows: ParsedDefectImportRow[] = [];
  let lastCoop = '';
  let lastOrderNo = '';
  let lastOrderDate = fallbackDate;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (row.every((c) => !String(c || '').trim())) continue;

    const rawCoop = (row[colName] || '').trim();
    if (rawCoop) {
      lastCoop = rawCoop;
      lastOrderNo = (colOrderNo >= 0 ? (row[colOrderNo] || '').trim() : '') || `คำสั่ง/${options.sheetName || 'นำเข้า'}`;
      const parsedDate = colOrderDate >= 0 ? normalizeDateToIso(row[colOrderDate]) : '';
      lastOrderDate = parsedDate || fallbackDate;
    }

    const details = (row[colDetails] || '').trim();
    if (!lastCoop || !details) continue;

    rows.push({
      CooperativeName: lastCoop,
      OrderNumber: lastOrderNo || '-',
      OrderDate: lastOrderDate,
      DefectDetails: details,
      CorrectionResults: colResults >= 0 ? (row[colResults] || '').trim() : '',
      DefectStatus: colStatus >= 0 ? normalizeDefectStatus(row[colStatus]) : 'ยังไม่ได้ดำเนินการแก้ไข',
    });
  }

  return rows;
}

const SYSTEM_SHEET_NAMES = new Set(['attachments', 'activitylogs', 'users']);

/**
 * Auto-detects the sheet module type and parses its rows accordingly.
 */
export function parseSheetAuto(
  sheetName: string,
  matrix: string[][],
  options: {
    accountingYearOverride?: string;
    splitPerIssue?: boolean;
    forcedModule?: 'coop' | 'farmer' | 'defects';
  } = {}
): ParsedSheetResult {
  if (!options.forcedModule && SYSTEM_SHEET_NAMES.has(sheetName.trim().toLowerCase())) {
    return {
      sheetName,
      moduleType: 'system',
      coopRows: [],
      farmerRows: [],
      defectRows: [],
      rowCount: 0,
    };
  }

  // Inspect top 10 rows to detect module type (or use forcedModule)
  let detectedType: SheetModuleType = options.forcedModule || 'unsupported';
  if (!options.forcedModule) {
    for (let i = 0; i < Math.min(10, matrix.length); i++) {
      const rawRow = matrix[i] || [];
      const normalized = rawRow.map(normalizeHeader);

      const hasStdCoop = rawRow.some((c) => c.trim() === 'CooperativeName') && rawRow.some((c) => c.trim() === 'ObservationDetails');
      const hasStdFarmer = rawRow.some((c) => c.trim() === 'FarmerGroupName') && rawRow.some((c) => c.trim() === 'ObservationDetails');
      const hasStdDefect = rawRow.some((c) => c.trim() === 'CooperativeName') && rawRow.some((c) => c.trim() === 'DefectDetails');

      if (hasStdFarmer || (normalized.some((c) => c.includes('กลมเกษตรกร')) && normalized.some((c) => c.includes('ขอสงเกต')))) {
        detectedType = 'farmer';
        break;
      }
      if (hasStdDefect || (normalized.some((c) => c.includes('ชอสหกรณ') || c === 'สหกรณ') && normalized.some((c) => c.includes('ขอบกพรอง')))) {
        detectedType = 'defects';
        break;
      }
      if (hasStdCoop || (normalized.some((c) => c.includes('ชอสหกรณ') || c === 'สหกรณ') && normalized.some((c) => c.includes('ขอสงเกต')))) {
        detectedType = 'coop';
        break;
      }
    }
  }

  if (detectedType === 'unsupported') {
    return {
      sheetName,
      moduleType: 'unsupported',
      coopRows: [],
      farmerRows: [],
      defectRows: [],
      rowCount: 0,
      error: 'หัวตารางไม่ตรงกับโครงสร้างที่รองรับ',
    };
  }

  try {
    if (detectedType === 'coop') {
      const parsed = parseThaiCoopSheetMatrix(matrix, { ...options, sheetName });
      return {
        sheetName,
        moduleType: 'coop',
        accountingYear: parsed.accountingYear,
        coopRows: parsed.rows,
        farmerRows: [],
        defectRows: [],
        rowCount: parsed.rows.length,
      };
    }
    if (detectedType === 'farmer') {
      const parsed = parseFarmerGroupSheetMatrix(matrix, {
        accountingYearOverride: options.accountingYearOverride,
        sheetName,
      });
      return {
        sheetName,
        moduleType: 'farmer',
        accountingYear: parsed.accountingYear,
        coopRows: [],
        farmerRows: parsed.rows,
        defectRows: [],
        rowCount: parsed.rows.length,
      };
    }
    const defects = parseDefectsSheetMatrix(matrix, { sheetName });
    return {
      sheetName,
      moduleType: 'defects',
      coopRows: [],
      farmerRows: [],
      defectRows: defects,
      rowCount: defects.length,
    };
  } catch (err) {
    return {
      sheetName,
      moduleType: 'unsupported',
      coopRows: [],
      farmerRows: [],
      defectRows: [],
      rowCount: 0,
      error: err instanceof Error ? err.message : 'ไม่สามารถแปลงข้อมูลในแผ่นงานนี้ได้',
    };
  }
}

/**
 * Parses all sheets/tabs in a Google Spreadsheet or multi-sheet Excel workbook.
 */
export function parseAllSheets(
  sheets: Array<{ sheetName: string; matrix: string[][] }>,
  options: {
    accountingYearOverride?: string;
    splitPerIssue?: boolean;
  } = {}
): ParsedWorkbookSummary {
  const results = sheets.map((s) => parseSheetAuto(s.sheetName, s.matrix, options));
  return {
    sheets: results,
    totalCoop: results.reduce((sum, s) => sum + s.coopRows.length, 0),
    totalFarmer: results.reduce((sum, s) => sum + s.farmerRows.length, 0),
    totalDefects: results.reduce((sum, s) => sum + s.defectRows.length, 0),
  };
}
