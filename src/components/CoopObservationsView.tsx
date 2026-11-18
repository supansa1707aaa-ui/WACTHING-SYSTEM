import { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  RotateCcw,
  Eye,
  Edit3,
  Trash2,
  FileSpreadsheet,
  Printer,
  ArrowUpDown,
  X,
  Building2,
  Upload,
  Database,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  OBSERVATION_STATUS_OPTIONS,
  EMBLEM_URL,
  type ActivityLogRecord,
  type CooperativeObservation,
  type ObservationStatus,
  type UserRole,
} from '../types/coop';
import { DefectStatusBadge, ObservationStatusBadge } from './StatusBadge';
import { PaginationBar } from './PaginationBar';
import { ConfirmModal } from './ConfirmModal';
import { coopApi, loadWorkspaceConfig } from '../services/api';
import { exportToExcel, formatThaiDateTime, triggerOfficialPrint } from '../utils/exportUtils';
import {
  parseAllSheets,
  parseCsvMatrix,
  type ParsedSheetResult,
  type ParsedWorkbookSummary,
} from '../utils/csvImportParser';

interface CoopObservationsViewProps {
  records: CooperativeObservation[];
  userRole: UserRole;
  isConfigured: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onSetLoading: (loading: boolean, message?: string) => void;
}

interface FormState {
  CooperativeName: string;
  LetterInfo: string;
  AccountingYear: string;
  IssueCount: string;
  ObservationDetails: string;
  CorrectionGuidelines: string;
  Status: ObservationStatus;
}

const EMPTY_FORM: FormState = {
  CooperativeName: '',
  LetterInfo: '',
  AccountingYear: String(new Date().getFullYear() + 543),
  IssueCount: '1',
  ObservationDetails: '',
  CorrectionGuidelines: '',
  Status: 'อยู่ระหว่างดำเนินการ',
};

const ATTACHED_2567_CSV_URL = '/assets/aistudio/____________________2567_c8c41c9d';

export function CoopObservationsView({
  records,
  userRole,
  isConfigured,
  onRefresh,
  onNotify,
  onSetLoading,
}: CoopObservationsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'No' | 'CooperativeName' | 'AccountingYear'>('No');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CooperativeObservation | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CooperativeObservation | null>(null);

  const [detailTarget, setDetailTarget] = useState<CooperativeObservation | null>(null);
  const [detailLogs, setDetailLogs] = useState<ActivityLogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Multi-Sheet Import Modal State
  const [importOpen, setImportOpen] = useState(false);
  const [importSourceTab, setImportSourceTab] = useState<'attached' | 'csv' | 'gsheet'>('attached');
  const [splitPerIssue, setSplitPerIssue] = useState(true);
  const [yearOverride, setYearOverride] = useState('');
  const [rawSheets, setRawSheets] = useState<Array<{ sheetName: string; matrix: string[][] }> | null>(null);
  const [sourceSpreadsheetId, setSourceSpreadsheetId] = useState(() => loadWorkspaceConfig().spreadsheetId || '');
  const [sourceSpreadsheetTitle, setSourceSpreadsheetTitle] = useState('');
  const [checkedSheetNames, setCheckedSheetNames] = useState<string[]>([]);
  const [previewSheetName, setPreviewSheetName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const parsedWorkbook = useMemo<ParsedWorkbookSummary | null>(() => {
    if (!rawSheets) return null;
    return parseAllSheets(rawSheets, {
      accountingYearOverride: yearOverride,
      splitPerIssue,
    });
  }, [rawSheets, yearOverride, splitPerIssue]);

  const selectedSheetTotals = useMemo(() => {
    if (!parsedWorkbook) return { coopRows: [], farmerRows: [], defectRows: [], total: 0 };
    const activeSet = new Set(checkedSheetNames);
    const activeSheets = parsedWorkbook.sheets.filter((s) => activeSet.has(s.sheetName) && s.rowCount > 0);
    const coopRows = activeSheets.flatMap((s) => s.coopRows);
    const farmerRows = activeSheets.flatMap((s) => s.farmerRows);
    const defectRows = activeSheets.flatMap((s) => s.defectRows);
    return {
      coopRows,
      farmerRows,
      defectRows,
      total: coopRows.length + farmerRows.length + defectRows.length,
    };
  }, [parsedWorkbook, checkedSheetNames]);

  const activePreviewSheet: ParsedSheetResult | null = useMemo(() => {
    if (!parsedWorkbook || parsedWorkbook.sheets.length === 0) return null;
    return (
      parsedWorkbook.sheets.find((s) => s.sheetName === previewSheetName) ||
      parsedWorkbook.sheets.find((s) => s.rowCount > 0) ||
      parsedWorkbook.sheets[0]
    );
  }, [parsedWorkbook, previewSheetName]);

  const years = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => r.AccountingYear && s.add(String(r.AccountingYear)));
    return Array.from(s).sort().reverse();
  }, [records]);

  const sourceSheets = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => r.SourceSheet && s.add(r.SourceSheet));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'th'));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = records.filter((r) => {
      if (q) {
        const matchName = r.CooperativeName.toLowerCase().includes(q);
        const matchDetails = r.ObservationDetails.toLowerCase().includes(q);
        const matchYear = String(r.AccountingYear).toLowerCase().includes(q);
        const matchLetter = String(r.LetterInfo || '').toLowerCase().includes(q);
        if (!matchName && !matchDetails && !matchYear && !matchLetter) return false;
      }
      if (yearFilter !== 'ALL' && String(r.AccountingYear) !== yearFilter) return false;
      if (statusFilter !== 'ALL' && r.Status !== statusFilter) return false;
      if (sheetFilter !== 'ALL' && (r.SourceSheet || '') !== sheetFilter) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'No') {
        cmp = Number(a.No) - Number(b.No);
      } else if (sortField === 'CooperativeName') {
        cmp = a.CooperativeName.localeCompare(b.CooperativeName, 'th');
      } else {
        cmp = String(a.AccountingYear).localeCompare(String(b.AccountingYear), 'th');
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [records, searchQuery, yearFilter, statusFilter, sheetFilter, sortField, sortAsc]);

  const issueSummaryByCoop = useMemo(() => {
    const map = new Map<string, { name: string; records: number; issues: number }>();
    filteredRecords.forEach((r) => {
      const cur = map.get(r.CooperativeName) || { name: r.CooperativeName, records: 0, issues: 0 };
      cur.records += 1;
      cur.issues += Number(r.IssueCount || 0);
      map.set(r.CooperativeName, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.issues - a.issues);
  }, [filteredRecords]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  const toggleSort = (field: 'No' | 'CooperativeName' | 'AccountingYear') => {
    if (sortField === field) {
      setSortAsc((p) => !p);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const openAddModal = () => {
    setEditingRecord(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (record: CooperativeObservation) => {
    setEditingRecord(record);
    setForm({
      CooperativeName: record.CooperativeName,
      LetterInfo: record.LetterInfo || '',
      AccountingYear: String(record.AccountingYear),
      IssueCount: String(record.IssueCount),
      ObservationDetails: record.ObservationDetails,
      CorrectionGuidelines: record.CorrectionGuidelines,
      Status: record.Status,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const applyLoadedSheets = (
    sheets: Array<{ sheetName: string; matrix: string[][] }>,
    title = ''
  ) => {
    const parsed = parseAllSheets(sheets, { accountingYearOverride: yearOverride, splitPerIssue });
    const validNames = parsed.sheets.filter((s) => s.rowCount > 0).map((s) => s.sheetName);
    setRawSheets(sheets);
    setSourceSpreadsheetTitle(title);
    setCheckedSheetNames(validNames);
    setPreviewSheetName(validNames[0] || sheets[0]?.sheetName || '');
    if (validNames.length === 0) {
      setImportError('ไม่พบข้อมูลที่ตรงกับโครงสร้างตารางสหกรณ์ กลุ่มเกษตรกร หรือข้อบกพร่องในแผ่นงานที่โหลด');
    }
  };

  const openImportModal = async (defaultTab: 'attached' | 'csv' | 'gsheet' = 'attached') => {
    setImportOpen(true);
    setImportSourceTab(defaultTab);
    setImportError(null);
    setRawSheets(null);
    setSourceSpreadsheetTitle('');
    setCheckedSheetNames([]);
    setPreviewSheetName('');
    setYearOverride('');
    if (defaultTab === 'attached') {
      await handleLoadAttachedCsv();
    }
  };

  const handleLoadAttachedCsv = async () => {
    setImportError(null);
    try {
      const res = await fetch(ATTACHED_2567_CSV_URL);
      if (!res.ok) throw new Error('ไม่พบไฟล์ฐานข้อมูลที่แนบมา');
      const text = await res.text();
      const matrix = parseCsvMatrix(text);
      applyLoadedSheets(
        [{ sheetName: 'ข้อสังเกตสหกรณ์ ปี 2567', matrix }],
        'ข้อสังเกตสหกรณ์ ปี 2567 (ไฟล์แนบ)'
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'ไม่สามารถอ่านไฟล์ CSV ได้');
      setRawSheets(null);
    }
  };

  const handleUploadWorkbookFile = async (file: File) => {
    setImportError(null);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheets = wb.SheetNames.map((sheetName) => {
          const ws = wb.Sheets[sheetName];
          const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: '',
            raw: false,
          });
          const matrix = aoa.map((row) => row.map((cell) => String(cell ?? '').trim()));
          return { sheetName, matrix };
        });
        applyLoadedSheets(sheets, file.name);
      } else {
        const text = await file.text();
        const matrix = parseCsvMatrix(text);
        const sheetName = file.name.replace(/\.[^.]+$/, '') || 'ข้อสังเกตสหกรณ์';
        applyLoadedSheets([{ sheetName, matrix }], file.name);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'ไฟล์ไม่ตรงตามโครงสร้างที่รองรับ');
      setRawSheets(null);
    }
  };

  const handleReadAllFromGoogleSheet = async () => {
    if (!sourceSpreadsheetId.trim()) {
      setImportError('กรุณาระบุ Google Spreadsheet ID ต้นทาง');
      return;
    }
    setImportError(null);
    onSetLoading(true, 'กำลังดึงข้อมูลจากทุกแผ่นงาน (All Sheets) ใน Google Sheets...');
    try {
      const res = await coopApi.readAllGoogleSheets(sourceSpreadsheetId.trim());
      applyLoadedSheets(res.sheets, res.spreadsheetTitle);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'ไม่สามารถอ่านทุกแผ่นงานใน Google Sheets ได้');
      setRawSheets(null);
    } finally {
      onSetLoading(false);
    }
  };

  const toggleCheckedSheet = (sheetName: string) => {
    setCheckedSheetNames((prev) =>
      prev.includes(sheetName) ? prev.filter((n) => n !== sheetName) : [...prev, sheetName]
    );
  };

  const handleConfirmImport = async () => {
    if (selectedSheetTotals.total === 0 || importing) return;
    if (!isConfigured) {
      setImportError('กรุณาเชื่อมต่อ Google Spreadsheet เป้าหมายในหน้าตั้งค่าก่อนนำเข้าข้อมูล');
      return;
    }

    setImporting(true);
    onSetLoading(
      true,
      `กำลังนำเข้าข้อมูล ${selectedSheetTotals.total} รายการ จากทุก Sheets ที่เลือกลง Google Sheets...`
    );
    try {
      const res = await coopApi.importAllSheets({
        coopRows: selectedSheetTotals.coopRows as unknown as Array<Record<string, unknown>>,
        farmerRows: selectedSheetTotals.farmerRows as unknown as Array<Record<string, unknown>>,
        defectRows: selectedSheetTotals.defectRows as unknown as Array<Record<string, unknown>>,
      });
      await onRefresh();
      setImportOpen(false);
      const parts: string[] = [];
      if (res.coopInserted > 0) parts.push(`สหกรณ์ ${res.coopInserted}`);
      if (res.farmerInserted > 0) parts.push(`กลุ่มเกษตรกร ${res.farmerInserted}`);
      if (res.defectInserted > 0) parts.push(`ข้อบกพร่อง ${res.defectInserted}`);
      const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      onNotify(
        'success',
        `นำเข้าข้อมูลสำเร็จ ${res.totalInserted} รายการ${detail}${
          res.skippedDuplicates > 0 ? ` · ข้ามข้อมูลซ้ำ ${res.skippedDuplicates} รายการ` : ''
        }`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'นำเข้าข้อมูลไม่สำเร็จ';
      setImportError(msg);
      onNotify('error', msg);
    } finally {
      setImporting(false);
      onSetLoading(false);
    }
  };

  const handleValidateAndPromptSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.CooperativeName.trim()) return setFormError('กรุณาระบุชื่อสหกรณ์');
    if (!form.AccountingYear.trim()) return setFormError('กรุณาระบุปีบัญชี');
    const issueNum = Number(form.IssueCount);
    if (!Number.isInteger(issueNum) || issueNum < 1) {
      return setFormError('จำนวนประเด็นต้องเป็นจำนวนเต็มมากกว่า 0');
    }
    if (!form.ObservationDetails.trim()) return setFormError('กรุณาระบุข้อสังเกตที่ตรวจพบ');
    if (!form.CorrectionGuidelines.trim()) return setFormError('กรุณาระบุแนวทางการแก้ไข');

    setFormError(null);
    if (editingRecord) {
      setConfirmSaveOpen(true);
    } else {
      void executeSave();
    }
  };

  const executeSave = async () => {
    if (submitting) return;
    setConfirmSaveOpen(false);
    setSubmitting(true);
    onSetLoading(true, 'กำลังบันทึกข้อมูลข้อสังเกตของสหกรณ์ลง Google Sheets...');
    try {
      const payload = {
        CooperativeName: form.CooperativeName.trim(),
        LetterInfo: form.LetterInfo.trim(),
        AccountingYear: form.AccountingYear.trim(),
        IssueCount: Number(form.IssueCount),
        ObservationDetails: form.ObservationDetails.trim(),
        CorrectionGuidelines: form.CorrectionGuidelines.trim(),
        Status: form.Status,
      };
      if (editingRecord) {
        await coopApi.updateCoopObservation(editingRecord.ID, payload);
      } else {
        await coopApi.createCoopObservation(payload);
      }
      await onRefresh();
      setFormOpen(false);
      onNotify('success', 'บันทึกข้อมูลสำเร็จ');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'บันทึกข้อมูลไม่สำเร็จ';
      setFormError(msg);
      onNotify('error', msg);
    } finally {
      setSubmitting(false);
      onSetLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    onSetLoading(true, 'กำลังลบข้อมูลออกจาก Google Sheets...');
    try {
      await coopApi.deleteCoopObservation(deleteTarget.ID);
      await onRefresh();
      setDeleteTarget(null);
      onNotify('success', 'ลบข้อมูลข้อสังเกตของสหกรณ์สำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ลบข้อมูลไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const openDetailModal = async (record: CooperativeObservation) => {
    setDetailTarget(record);
    setLogsLoading(true);
    try {
      const logs = await coopApi.listLogs(record.ID);
      setDetailLogs(logs);
    } catch {
      setDetailLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleExportExcel = () => {
    exportToExcel(
      filteredRecords,
      [
        { header: 'ที่', value: (r) => r.No, width: 8 },
        { header: 'ชื่อสหกรณ์', value: (r) => r.CooperativeName, width: 32 },
        { header: 'เลขที่หนังสือ/วันที่', value: (r) => r.LetterInfo || '', width: 28 },
        { header: 'ปีบัญชี', value: (r) => r.AccountingYear, width: 12 },
        { header: 'จำนวนประเด็น', value: (r) => r.IssueCount, width: 14 },
        { header: 'ข้อสังเกตที่ตรวจพบ', value: (r) => r.ObservationDetails, width: 45 },
        { header: 'แนวทางการแก้ไข', value: (r) => r.CorrectionGuidelines, width: 45 },
        { header: 'สถานะการดำเนินการ', value: (r) => r.Status, width: 22 },
      ],
      'ข้อสังเกตของสหกรณ์',
      'Coop_Observations',
      'รายงานข้อสังเกตของสหกรณ์'
    );
  };

  return (
    <div className="space-y-5">
      {/* Formal Print Header */}
      <div className="hidden print-only mb-4 border-b-2 border-[#0B3B2C] pb-3">
        <div className="flex items-center gap-3">
          <img src={EMBLEM_URL} alt="ตราหน่วยงาน" className="w-12 h-12 object-contain" />
          <div>
            <h2 className="text-lg font-bold text-[#0B3B2C]">
              CO-OP WATCHING SYSTEM — รายงานข้อสังเกตของสหกรณ์
            </h2>
            <p className="text-xs text-neutral-700">
              สำนักงานสหกรณ์จังหวัดชัยนาท · วันที่พิมพ์: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Header Action Bar */}
      <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-3 @2xl:gap-4 no-print">
        <div>
          <p className="text-xs font-semibold text-[#9A7409]">เมนูที่ 1 : ข้อสังเกต · ส่วนที่ 1.1</p>
          <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">ข้อสังเกตของสหกรณ์</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void openImportModal('attached')}
            disabled={!isConfigured}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg border border-[#C9A227] bg-amber-50 text-xs font-bold text-[#0B3B2C] hover:bg-amber-100 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-[#9A7409]" />
            <span>ดึงข้อมูลทุก Sheets / CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredRecords.length === 0}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg border border-emerald-700/30 bg-white text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ส่งออก Excel</span>
          </button>
          <button
            type="button"
            onClick={triggerOfficialPrint}
            disabled={filteredRecords.length === 0}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>ส่งออก PDF / พิมพ์</span>
          </button>
          <button
            type="button"
            onClick={openAddModal}
            disabled={!isConfigured}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-[#E5C158]" />
            <span>เพิ่มข้อสังเกต</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Panel */}
      <section className="bg-white rounded-xl border border-neutral-200 p-4 no-print">
        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-12 gap-3 items-end">
          <div className={sourceSheets.length > 0 ? '@4xl:col-span-4' : '@4xl:col-span-5'}>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              ค้นหาชื่อสหกรณ์ / เลขที่หนังสือ / รายละเอียดข้อสังเกต
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="พิมพ์ชื่อสหกรณ์ เลขที่หนังสือ หรือคำค้นหา..."
                className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
              />
            </div>
          </div>

          <div className="@4xl:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">ปีบัญชี</label>
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกปีบัญชี</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  ปี {y}
                </option>
              ))}
            </select>
          </div>

          <div className={sourceSheets.length > 0 ? '@4xl:col-span-2' : '@4xl:col-span-3'}>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">สถานะการดำเนินการ</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกสถานะ</option>
              {OBSERVATION_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {sourceSheets.length > 0 && (
            <div className="@4xl:col-span-2">
              <label className="block text-xs font-semibold text-neutral-600 mb-1">แผ่นงาน (Sheet)</label>
              <select
                value={sheetFilter}
                onChange={(e) => {
                  setSheetFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
              >
                <option value="ALL">ทุกแผ่นงาน</option>
                {sourceSheets.map((sh) => (
                  <option key={sh} value={sh}>
                    {sh}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="@4xl:col-span-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setYearFilter('ALL');
                setStatusFilter('ALL');
                setSheetFilter('ALL');
                setPage(1);
              }}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ล้างตัวกรอง</span>
            </button>
          </div>
        </div>
      </section>

      {/* Issue Count Per Cooperative Summary Strip */}
      {issueSummaryByCoop.length > 0 && (
        <section className="bg-white rounded-xl border border-neutral-200 p-4 no-print">
          <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-1.5 mb-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B3B2C]">
              <Building2 className="w-4 h-4 text-[#C9A227] shrink-0" />
              <span>สรุปจำนวนประเด็นข้อสังเกตแยกตามสหกรณ์</span>
            </div>
            <span className="text-xs text-neutral-500 tabular-nums">
              รวม {issueSummaryByCoop.length} สหกรณ์ ·{' '}
              {filteredRecords.reduce((acc, r) => acc + Number(r.IssueCount || 0), 0)} ประเด็น
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-700">
            {issueSummaryByCoop.slice(0, 12).map((item) => (
              <span key={item.name} className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-[#0B3B2C]">{item.name}:</span>
                <span className="tabular-nums font-bold text-[#9A7409]">{item.issues} ประเด็น</span>
                <span className="text-neutral-400">({item.records} รายการ)</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Main Data Table + Mobile Card View */}
      <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden print-container">
        {/* Smartphone Card Layout */}
        <div className="block @3xl:hidden no-print divide-y divide-neutral-200">
          {paginated.length === 0 ? (
            <div className="py-12 px-4 text-center text-neutral-500">
              <p className="font-semibold text-neutral-700 text-sm">
                ยังไม่มีข้อมูลข้อสังเกตของสหกรณ์ที่ตรงกับเงื่อนไข
              </p>
              <p className="text-xs mt-1">
                กดปุ่ม &quot;ดึงข้อมูลทุก Sheets / CSV&quot; หรือ &quot;เพิ่มข้อสังเกต&quot; เพื่อเริ่มต้น
              </p>
            </div>
          ) : (
            paginated.map((row) => (
              <article key={row.ID} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-neutral-500 tabular-nums">
                      ลำดับที่ {row.No} · ปีบัญชี {row.AccountingYear} ·{' '}
                      <strong className="text-[#0B3B2C]">
                        {Number(row.IssueCount).toLocaleString('th-TH')} ประเด็น
                      </strong>
                    </p>
                    <h3 className="text-sm font-bold text-[#0B3B2C] leading-snug">
                      {row.CooperativeName}
                    </h3>
                    {row.SourceSheet && (
                      <p className="text-[11px] text-neutral-500">แผ่นงาน: {row.SourceSheet}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <ObservationStatusBadge status={row.Status} />
                  </div>
                </div>

                {row.LetterInfo && (
                  <p className="text-xs text-neutral-600">
                    <span className="font-semibold text-neutral-800">เลขที่หนังสือ/วันที่:</span>{' '}
                    {row.LetterInfo}
                  </p>
                )}

                <div className="space-y-1 text-xs">
                  <p className="font-bold text-[#0B3B2C]">ข้อสังเกตที่ตรวจพบ</p>
                  <p className="text-neutral-800 whitespace-pre-wrap leading-relaxed">
                    {row.ObservationDetails}
                  </p>
                </div>

                <div className="space-y-1 text-xs pt-2 border-t border-neutral-100">
                  <p className="font-bold text-[#0B3B2C]">แนวทางการแก้ไข</p>
                  <p className="text-neutral-700 whitespace-pre-wrap leading-relaxed">
                    {row.CorrectionGuidelines}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => openDetailModal(row)}
                    className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50"
                  >
                    <Eye className="w-4 h-4" />
                    <span>รายละเอียด</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(row)}
                    className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/70 text-xs font-semibold text-amber-800 hover:bg-amber-100/70"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>แก้ไข</span>
                  </button>
                  {userRole === 'Admin' && !row.IsExternalSheet && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(row)}
                      className="min-h-[42px] min-w-[42px] inline-flex items-center justify-center px-3 py-2 rounded-lg border border-red-200 bg-red-50/70 text-xs font-semibold text-red-700 hover:bg-red-100/70"
                      aria-label="ลบข้อมูล"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        <div className="hidden @3xl:block print-block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1060px]">
            <thead>
              <tr className="bg-[#0B3B2C] text-white text-xs font-bold">
                <th className="py-3 px-3 w-14 text-center">
                  <button
                    type="button"
                    onClick={() => toggleSort('No')}
                    className="inline-flex items-center gap-1 hover:text-[#E5C158]"
                  >
                    <span>ที่</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3 w-52">
                  <button
                    type="button"
                    onClick={() => toggleSort('CooperativeName')}
                    className="inline-flex items-center gap-1 hover:text-[#E5C158]"
                  >
                    <span>ชื่อสหกรณ์</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3 w-44">เลขที่หนังสือ/วันที่</th>
                <th className="py-3 px-3 w-20 text-center">
                  <button
                    type="button"
                    onClick={() => toggleSort('AccountingYear')}
                    className="inline-flex items-center gap-1 hover:text-[#E5C158]"
                  >
                    <span>ปีบัญชี</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3 w-24 text-right">จำนวนประเด็น</th>
                <th className="py-3 px-3 min-w-[240px]">ข้อสังเกตที่ตรวจพบ</th>
                <th className="py-3 px-3 min-w-[240px]">แนวทางการแก้ไข</th>
                <th className="py-3 px-3 w-40">สถานะ</th>
                <th className="py-3 px-3 w-36 text-center no-print">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-neutral-500">
                    <p className="font-semibold text-neutral-700">ยังไม่มีข้อมูลข้อสังเกตของสหกรณ์ที่ตรงกับเงื่อนไข</p>
                    <p className="text-xs mt-1">
                      กดปุ่ม &quot;นำเข้าจาก Google Sheets / CSV&quot; เพื่อนำเข้าไฟล์ฐานข้อมูล พ.ศ. 2567 หรือกด &quot;เพิ่มข้อสังเกต&quot;
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((row) => (
                  <tr key={row.ID} className="hover:bg-[#F7F9F8] transition-colors align-top">
                    <td className="py-3 px-3 text-center font-semibold text-neutral-700 tabular-nums">
                      {row.No}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#0B3B2C]">
                      <div>{row.CooperativeName}</div>
                      {row.SourceSheet && (
                        <div className="text-[11px] font-normal text-neutral-500 mt-0.5">
                          แผ่นงาน: {row.SourceSheet}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-neutral-700">{row.LetterInfo || '-'}</td>
                    <td className="py-3 px-3 text-center tabular-nums font-medium">{row.AccountingYear}</td>
                    <td className="py-3 px-3 text-right font-bold tabular-nums text-[#0B3B2C]">
                      {Number(row.IssueCount).toLocaleString('th-TH')}
                    </td>
                    <td className="py-3 px-3 text-neutral-800 whitespace-pre-wrap leading-relaxed text-[13px]">
                      {row.ObservationDetails}
                    </td>
                    <td className="py-3 px-3 text-neutral-700 whitespace-pre-wrap leading-relaxed text-[13px]">
                      {row.CorrectionGuidelines}
                    </td>
                    <td className="py-3 px-3">
                      <ObservationStatusBadge status={row.Status} />
                    </td>
                    <td className="py-3 px-3 no-print">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openDetailModal(row)}
                          className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-200/70 hover:text-[#0B3B2C] transition-colors"
                          title="ดูรายละเอียด"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50 transition-colors"
                          title="แก้ไขข้อมูล"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {userRole === 'Admin' && !row.IsExternalSheet && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="p-1.5 rounded-lg text-red-700 hover:bg-red-50 transition-colors"
                            title="ลบข้อมูล (Admin)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="no-print">
          <PaginationBar
            totalItems={filteredRecords.length}
            currentPage={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setPage(1);
            }}
          />
        </div>
      </section>

      {/* Multi-Sheet Import from Google Sheets / Excel / CSV Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4">
          <div className="w-full max-w-5xl bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <div>
                <h3 className="text-base font-bold">
                  ดึงและนำเข้าข้อมูลจากฐานข้อมูลทั้งหมดทุก Sheets (Google Sheets / Excel / CSV)
                </h3>
                <p className="text-xs text-emerald-100/80">
                  อ่านข้อมูลครบทุกแผ่นงานอัตโนมัติ (ข้อสังเกตสหกรณ์, กลุ่มเกษตรกร และข้อบกพร่อง) พร้อมรองรับแถวรวมประเด็นและเครื่องหมาย ✔️
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Source Tabs */}
              <div className="flex flex-wrap gap-2 p-1 bg-[#F7F9F8] rounded-lg border border-neutral-200">
                <button
                  type="button"
                  onClick={() => {
                    setImportSourceTab('attached');
                    void handleLoadAttachedCsv();
                  }}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-md text-xs font-bold transition-colors ${
                    importSourceTab === 'attached'
                      ? 'bg-[#0B3B2C] text-white'
                      : 'text-neutral-700 hover:bg-neutral-200/50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>ไฟล์ฐานข้อมูลที่แนบมา (พ.ศ. 2567)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportSourceTab('csv');
                    setRawSheets(null);
                    setImportError(null);
                  }}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-md text-xs font-bold transition-colors ${
                    importSourceTab === 'csv'
                      ? 'bg-[#0B3B2C] text-white'
                      : 'text-neutral-700 hover:bg-neutral-200/50'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>อัปโหลดไฟล์ Excel (.xlsx) / CSV (ทุก Sheets)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportSourceTab('gsheet');
                    setRawSheets(null);
                    setImportError(null);
                  }}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-md text-xs font-bold transition-colors ${
                    importSourceTab === 'gsheet'
                      ? 'bg-[#0B3B2C] text-white'
                      : 'text-neutral-700 hover:bg-neutral-200/50'
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>ดึงทุก Sheets จาก Google Sheets</span>
                </button>
              </div>

              {importSourceTab === 'csv' && (
                <div className="p-4 rounded-xl border border-dashed border-neutral-300 bg-[#F7F9F8] flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs text-neutral-700">
                    เลือกไฟล์ <strong>.xlsx / .xls</strong> (ระบบจะดึงข้อมูลทุกแผ่นงานในไฟล์ให้อัตโนมัติ) หรือไฟล์ <strong>.csv</strong> จาก Google Sheets
                  </p>
                  <label className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold cursor-pointer hover:bg-[#082c21] whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5 text-[#E5C158]" />
                    <span>เลือกไฟล์ Excel / CSV</span>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadWorkbookFile(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              )}

              {importSourceTab === 'gsheet' && (
                <div className="p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-8">
                      <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                        Google Spreadsheet ID ต้นทาง (ดึงครบทุกแผ่นงาน/ทุกปีในไฟล์เดียว)
                      </label>
                      <input
                        type="text"
                        value={sourceSpreadsheetId}
                        onChange={(e) => setSourceSpreadsheetId(e.target.value)}
                        placeholder="วาง Spreadsheet ID ที่มีข้อมูล..."
                        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-mono-tabular"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <button
                        type="button"
                        onClick={() => void handleReadAllFromGoogleSheet()}
                        className="w-full min-h-[38px] py-2 px-3 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21]"
                      >
                        ดึงข้อมูลทุก Sheets ทั้งไฟล์
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Import Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#F7F9F8] border border-neutral-200 text-xs">
                <div>
                  <label className="block font-bold text-[#0B3B2C] mb-1">รูปแบบการจัดเก็บรายการ</label>
                  <select
                    value={splitPerIssue ? 'split' : 'merge'}
                    onChange={(e) => setSplitPerIssue(e.target.value === 'split')}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs"
                  >
                    <option value="split">แยกเป็นรายประเด็น (แนะนำ: ติดตามสถานะรายข้อได้อิสระ)</option>
                    <option value="merge">รวมเป็น 1 รายการต่อสหกรณ์/หนังสือ</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-[#0B3B2C] mb-1">
                    กำหนดปีบัญชีรวม (เว้นว่างเพื่อให้ตรวจจับอัตโนมัติตามแต่ละ Sheet)
                  </label>
                  <input
                    type="text"
                    value={yearOverride}
                    onChange={(e) => setYearOverride(e.target.value)}
                    placeholder={
                      activePreviewSheet?.accountingYear
                        ? `ตรวจพบอัตโนมัติ: ปี ${activePreviewSheet.accountingYear}`
                        : 'เช่น 2567'
                    }
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs tabular-nums"
                  />
                </div>
              </div>

              {importError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                  {importError}
                </div>
              )}

              {/* All-Sheets Summary & Tab Selector */}
              {parsedWorkbook && parsedWorkbook.sheets.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#0B3B2C] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        {sourceSpreadsheetTitle ? `${sourceSpreadsheetTitle} · ` : ''}
                        พบทั้งหมด {parsedWorkbook.sheets.length} Sheets · พร้อมนำเข้า {selectedSheetTotals.total} รายการ
                      </span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCheckedSheetNames(
                            parsedWorkbook.sheets.filter((s) => s.rowCount > 0).map((s) => s.sheetName)
                          )
                        }
                        className="text-[#0B3B2C] font-semibold underline hover:text-[#15803D]"
                      >
                        เลือกทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckedSheetNames([])}
                        className="text-neutral-500 font-semibold underline hover:text-neutral-800"
                      >
                        ล้างการเลือก
                      </button>
                    </div>
                  </div>

                  {/* Sheet Pills / Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {parsedWorkbook.sheets.map((sheet) => {
                      const isChecked = checkedSheetNames.includes(sheet.sheetName);
                      const isActivePreview = activePreviewSheet?.sheetName === sheet.sheetName;
                      const moduleLabel =
                        sheet.moduleType === 'coop'
                          ? 'ข้อสังเกตสหกรณ์'
                          : sheet.moduleType === 'farmer'
                          ? 'กลุ่มเกษตรกร'
                          : sheet.moduleType === 'defects'
                          ? 'ข้อบกพร่อง'
                          : sheet.moduleType === 'system'
                          ? 'ชีทระบบ (ข้าม)'
                          : 'ไม่รองรับ';
                      return (
                        <div
                          key={sheet.sheetName}
                          onClick={() => setPreviewSheetName(sheet.sheetName)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isActivePreview
                              ? 'border-[#0B3B2C] bg-emerald-50/70'
                              : 'border-neutral-200 bg-white hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <label
                              className="flex items-center gap-2 font-bold text-[#0B3B2C] cursor-pointer min-w-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={sheet.rowCount === 0}
                                onChange={() => toggleCheckedSheet(sheet.sheetName)}
                                className="rounded border-neutral-300 text-[#0B3B2C] focus:ring-[#0B3B2C]"
                              />
                              <span className="truncate">{sheet.sheetName}</span>
                            </label>
                            <span className="tabular-nums font-bold text-[#9A7409] shrink-0">
                              {sheet.rowCount} รายการ
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1 pl-6 text-[11px] text-neutral-600">
                            <span>{moduleLabel}</span>
                            {sheet.accountingYear && <span>ปี {sheet.accountingYear}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preview Table / Mobile Cards for Active Sheet */}
              {activePreviewSheet && activePreviewSheet.rowCount > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-[#0B3B2C]">
                    ตัวอย่างข้อมูลแผ่นงาน: {activePreviewSheet.sheetName} ({activePreviewSheet.rowCount} รายการ
                    {activePreviewSheet.accountingYear ? ` · ปีบัญชี ${activePreviewSheet.accountingYear}` : ''})
                  </p>

                  {activePreviewSheet.moduleType === 'coop' && (
                    <div className="border border-neutral-200 rounded-xl overflow-x-auto max-h-64">
                      <table className="w-full text-left border-collapse text-xs min-w-[780px]">
                        <thead>
                          <tr className="bg-[#0B3B2C] text-white">
                            <th className="py-2 px-3 w-12 text-center">ที่</th>
                            <th className="py-2 px-3 w-44">ชื่อสหกรณ์</th>
                            <th className="py-2 px-3 w-36">เลขที่หนังสือ/วันที่</th>
                            <th className="py-2 px-3 w-16 text-center">ปี</th>
                            <th className="py-2 px-3 w-16 text-right">ประเด็น</th>
                            <th className="py-2 px-3">ข้อสังเกตที่ตรวจพบ</th>
                            <th className="py-2 px-3">แนวทางการแก้ไข</th>
                            <th className="py-2 px-3 w-36">สถานะ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {activePreviewSheet.coopRows.map((r, idx) => (
                            <tr key={idx} className="align-top">
                              <td className="py-2 px-3 text-center tabular-nums">{idx + 1}</td>
                              <td className="py-2 px-3 font-semibold text-[#0B3B2C]">{r.CooperativeName}</td>
                              <td className="py-2 px-3">{r.LetterInfo || '-'}</td>
                              <td className="py-2 px-3 text-center tabular-nums">{r.AccountingYear}</td>
                              <td className="py-2 px-3 text-right tabular-nums font-bold">{r.IssueCount}</td>
                              <td className="py-2 px-3 whitespace-pre-wrap">{r.ObservationDetails}</td>
                              <td className="py-2 px-3 whitespace-pre-wrap">{r.CorrectionGuidelines}</td>
                              <td className="py-2 px-3">
                                <ObservationStatusBadge status={r.Status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {activePreviewSheet.moduleType === 'farmer' && (
                    <div className="border border-neutral-200 rounded-xl overflow-x-auto max-h-64">
                      <table className="w-full text-left border-collapse text-xs min-w-[760px]">
                        <thead>
                          <tr className="bg-[#0B3B2C] text-white">
                            <th className="py-2 px-3 w-12 text-center">ที่</th>
                            <th className="py-2 px-3 w-48">ชื่อกลุ่มเกษตรกร</th>
                            <th className="py-2 px-3 w-16 text-center">ปี</th>
                            <th className="py-2 px-3 w-16 text-right">ประเด็น</th>
                            <th className="py-2 px-3">ข้อสังเกตที่ตรวจพบ</th>
                            <th className="py-2 px-3">แนวทางการแก้ไข</th>
                            <th className="py-2 px-3 w-36">สถานะ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {activePreviewSheet.farmerRows.map((r, idx) => (
                            <tr key={idx} className="align-top">
                              <td className="py-2 px-3 text-center tabular-nums">{idx + 1}</td>
                              <td className="py-2 px-3 font-semibold text-[#0B3B2C]">{r.FarmerGroupName}</td>
                              <td className="py-2 px-3 text-center tabular-nums">{r.AccountingYear}</td>
                              <td className="py-2 px-3 text-right tabular-nums font-bold">{r.IssueCount}</td>
                              <td className="py-2 px-3 whitespace-pre-wrap">{r.ObservationDetails}</td>
                              <td className="py-2 px-3 whitespace-pre-wrap">{r.CorrectionGuidelines}</td>
                              <td className="py-2 px-3">
                                <ObservationStatusBadge status={r.Status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {activePreviewSheet.moduleType === 'defects' && (
                    <div className="border border-neutral-200 rounded-xl overflow-x-auto max-h-64">
                      <table className="w-full text-left border-collapse text-xs min-w-[720px]">
                        <thead>
                          <tr className="bg-[#0B3B2C] text-white">
                            <th className="py-2 px-3 w-12 text-center">ที่</th>
                            <th className="py-2 px-3 w-44">ชื่อสหกรณ์</th>
                            <th className="py-2 px-3 w-32">เลขที่คำสั่ง</th>
                            <th className="py-2 px-3">ประเด็นข้อบกพร่อง</th>
                            <th className="py-2 px-3">ผลการแก้ไข</th>
                            <th className="py-2 px-3 w-40">สถานะ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200">
                          {activePreviewSheet.defectRows.map((r, idx) => (
                            <tr key={idx} className="align-top">
                              <td className="py-2 px-3 text-center tabular-nums">{idx + 1}</td>
                              <td className="py-2 px-3 font-semibold text-[#0B3B2C]">{r.CooperativeName}</td>
                              <td className="py-2 px-3">{r.OrderNumber}</td>
                              <td className="py-2 px-3 whitespace-pre-wrap">{r.DefectDetails}</td>
                              <td className="py-2 px-3 whitespace-pre-wrap">{r.CorrectionResults || '-'}</td>
                              <td className="py-2 px-3">
                                <DefectStatusBadge status={r.DefectStatus} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 bg-[#F7F9F8] border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmImport()}
                disabled={selectedSheetTotals.total === 0 || importing}
                className="min-h-[40px] px-5 py-2 rounded-lg bg-[#0B3B2C] text-white text-sm font-semibold hover:bg-[#082c21] disabled:opacity-50"
              >
                {importing
                  ? 'กำลังนำเข้าข้อมูลทุก Sheets...'
                  : `ยืนยันนำเข้าทั้งหมด (${selectedSheetTotals.total} รายการ)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <h3 className="text-base font-bold">
                {editingRecord ? 'แก้ไขข้อมูลข้อสังเกตของสหกรณ์' : 'เพิ่มข้อสังเกตของสหกรณ์'}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleValidateAndPromptSave} className="p-5 overflow-y-auto space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-800">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                    ชื่อสหกรณ์ <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.CooperativeName}
                    onChange={(e) => setForm({ ...form, CooperativeName: e.target.value })}
                    placeholder="เช่น สหกรณ์การเกษตรเพื่อการตลาดลูกค้า ธ.ก.ส.ชัยนาท จำกัด"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                    ปีบัญชี <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.AccountingYear}
                    onChange={(e) => setForm({ ...form, AccountingYear: e.target.value })}
                    placeholder="เช่น 2567"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  เลขที่หนังสือ/วันที่
                </label>
                <input
                  type="text"
                  value={form.LetterInfo}
                  onChange={(e) => setForm({ ...form, LetterInfo: e.target.value })}
                  placeholder="เช่น กษ 04 ชน/876 ลงวันที่ 20 พฤศจิกายน 2569"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                    จำนวนประเด็น <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.IssueCount}
                    onChange={(e) => setForm({ ...form, IssueCount: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                    สถานะการดำเนินการ <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={form.Status}
                    onChange={(e) => setForm({ ...form, Status: e.target.value as ObservationStatus })}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  >
                    {OBSERVATION_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  ข้อสังเกตที่ตรวจพบ (รองรับหลายบรรทัด) <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.ObservationDetails}
                  onChange={(e) => setForm({ ...form, ObservationDetails: e.target.value })}
                  placeholder="ระบุรายละเอียดข้อสังเกตที่ตรวจพบ..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  แนวทางการแก้ไข (รองรับหลายบรรทัด) <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.CorrectionGuidelines}
                  onChange={(e) => setForm({ ...form, CorrectionGuidelines: e.target.value })}
                  placeholder="ระบุแนวทางการแก้ไขและข้อเสนอแนะ..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
                <span className="text-xs text-neutral-500">
                  * ระบบจะสร้างรหัส ID และลำดับที่ให้อัตโนมัติ
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-lg bg-[#0B3B2C] text-white text-sm font-semibold hover:bg-[#082c21] disabled:opacity-60"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail & Activity History Modal */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <div>
                <p className="text-xs text-[#E5C158] font-mono-tabular">{detailTarget.ID}</p>
                <h3 className="text-base font-bold">{detailTarget.CooperativeName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="p-1.5 rounded-lg text-white/80 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-[#F7F9F8] border border-neutral-200">
                <div>
                  <p className="text-xs text-neutral-500">ลำดับที่</p>
                  <p className="font-bold text-[#0B3B2C] tabular-nums">{detailTarget.No}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs text-neutral-500">เลขที่หนังสือ/วันที่</p>
                  <p className="font-semibold text-xs">{detailTarget.LetterInfo || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">ปีบัญชี</p>
                  <p className="font-bold tabular-nums">{detailTarget.AccountingYear}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">จำนวนประเด็น</p>
                  <p className="font-bold text-[#0B3B2C] tabular-nums">{detailTarget.IssueCount} ประเด็น</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">สถานะ</p>
                  <div className="mt-0.5">
                    <ObservationStatusBadge status={detailTarget.Status} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#0B3B2C]">ข้อสังเกตที่ตรวจพบ</p>
                <div className="p-3.5 rounded-lg border border-neutral-200 bg-white whitespace-pre-wrap leading-relaxed">
                  {detailTarget.ObservationDetails}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#0B3B2C]">แนวทางการแก้ไข</p>
                <div className="p-3.5 rounded-lg border border-neutral-200 bg-white whitespace-pre-wrap leading-relaxed">
                  {detailTarget.CorrectionGuidelines}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-neutral-600 pt-2 border-t border-neutral-200">
                <div>
                  <span className="font-semibold">สร้างรายการ:</span> {formatThaiDateTime(detailTarget.CreatedAt)} โดย {detailTarget.CreatedBy}
                </div>
                <div>
                  <span className="font-semibold">แก้ไขล่าสุด:</span> {formatThaiDateTime(detailTarget.UpdatedAt)} โดย {detailTarget.UpdatedBy}
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-200">
                <p className="text-xs font-bold text-[#0B3B2C] mb-2">ประวัติการเปลี่ยนแปลง (Activity Log)</p>
                {logsLoading ? (
                  <p className="text-xs text-neutral-500">กำลังโหลดประวัติ...</p>
                ) : detailLogs.length === 0 ? (
                  <p className="text-xs text-neutral-500">ไม่พบประวัติการเปลี่ยนแปลงเพิ่มเติม</p>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {detailLogs.map((log) => (
                      <div key={log.ID} className="p-2.5 rounded-lg bg-[#F7F9F8] border border-neutral-200 text-xs">
                        <div className="flex items-center justify-between gap-2 font-semibold text-[#0B3B2C]">
                          <span>{log.Action}</span>
                          <span className="text-neutral-500 font-normal">{formatThaiDateTime(log.ActionDate)}</span>
                        </div>
                        <p className="text-neutral-600 mt-0.5">ผู้ดำเนินการ: {log.ActionBy}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={confirmSaveOpen}
        title="ยืนยันการแก้ไขข้อมูลข้อสังเกต"
        message={`ต้องการบันทึกการปรับปรุงข้อมูลของ "${form.CooperativeName}" ปีบัญชี ${form.AccountingYear} ลงใน Google Sheets ใช่หรือไม่?`}
        confirmLabel="ยืนยันบันทึกการแก้ไข"
        variant="primary"
        isLoading={submitting}
        onConfirm={() => void executeSave()}
        onCancel={() => setConfirmSaveOpen(false)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="ยืนยันการลบข้อมูลข้อสังเกต"
        message={`คุณต้องการลบข้อมูลข้อสังเกตของ "${deleteTarget?.CooperativeName}" (รหัส ${deleteTarget?.ID}) ออกจาก Google Sheets ใช่หรือไม่?`}
        detailText={deleteTarget?.ObservationDetails}
        confirmLabel="ยืนยันการลบข้อมูล"
        variant="danger"
        onConfirm={() => void executeDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
