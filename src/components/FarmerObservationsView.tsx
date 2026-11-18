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
  Paperclip,
  Upload,
  Download,
  FileText,
  Sprout,
} from 'lucide-react';
import {
  OBSERVATION_STATUS_OPTIONS,
  EMBLEM_URL,
  type ActivityLogRecord,
  type AttachmentRecord,
  type FarmerGroupObservation,
  type ObservationStatus,
  type UserRole,
} from '../types/coop';
import { ObservationStatusBadge } from './StatusBadge';
import { PaginationBar } from './PaginationBar';
import { ConfirmModal } from './ConfirmModal';
import { PdfPreviewModal } from './PdfPreviewModal';
import { coopApi } from '../services/api';
import { exportToExcel, formatThaiDate, formatThaiDateTime, triggerOfficialPrint } from '../utils/exportUtils';

interface FarmerObservationsViewProps {
  records: FarmerGroupObservation[];
  attachments: AttachmentRecord[];
  userRole: UserRole;
  isConfigured: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onSetLoading: (loading: boolean, message?: string) => void;
}

interface FormState {
  FarmerGroupName: string;
  AccountingYear: string;
  AuditOfficeLetterNumber: string;
  AuditOfficeLetterDate: string;
  CorrectionNotificationLetterNumber: string;
  CorrectionNotificationLetterDate: string;
  IssueCount: string;
  ObservationDetails: string;
  CorrectionGuidelines: string;
  Status: ObservationStatus;
}

const EMPTY_FORM: FormState = {
  FarmerGroupName: '',
  AccountingYear: String(new Date().getFullYear() + 543),
  AuditOfficeLetterNumber: '',
  AuditOfficeLetterDate: '',
  CorrectionNotificationLetterNumber: '',
  CorrectionNotificationLetterDate: '',
  IssueCount: '1',
  ObservationDetails: '',
  CorrectionGuidelines: '',
  Status: 'อยู่ระหว่างดำเนินการ',
};

export function FarmerObservationsView({
  records,
  attachments,
  userRole,
  isConfigured,
  onRefresh,
  onNotify,
  onSetLoading,
}: FarmerObservationsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [letterNumberSearch, setLetterNumberSearch] = useState('');
  const [letterDateSearch, setLetterDateSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'No' | 'FarmerGroupName' | 'AccountingYear'>('No');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FarmerGroupObservation | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FarmerGroupObservation | null>(null);

  const [detailTarget, setDetailTarget] = useState<FarmerGroupObservation | null>(null);
  const [detailLogs, setDetailLogs] = useState<ActivityLogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [previewPdf, setPreviewPdf] = useState<{ fileId: string; fileName: string } | null>(null);
  const [deleteAttTarget, setDeleteAttTarget] = useState<AttachmentRecord | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);

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

  const attachmentsByRecord = useMemo(() => {
    const map = new Map<string, AttachmentRecord[]>();
    attachments.forEach((att) => {
      const list = map.get(att.RelatedRecordID) || [];
      list.push(att);
      map.set(att.RelatedRecordID, list);
    });
    return map;
  }, [attachments]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const lq = letterNumberSearch.trim().toLowerCase();

    const list = records.filter((r) => {
      if (q) {
        const matchName = r.FarmerGroupName.toLowerCase().includes(q);
        const matchObs = r.ObservationDetails.toLowerCase().includes(q);
        if (!matchName && !matchObs) return false;
      }
      if (yearFilter !== 'ALL' && String(r.AccountingYear) !== yearFilter) return false;
      if (lq) {
        const m1 = String(r.AuditOfficeLetterNumber || '').toLowerCase().includes(lq);
        const m2 = String(r.CorrectionNotificationLetterNumber || '').toLowerCase().includes(lq);
        if (!m1 && !m2) return false;
      }
      if (letterDateSearch) {
        const d1 = String(r.AuditOfficeLetterDate || '');
        const d2 = String(r.CorrectionNotificationLetterDate || '');
        if (d1 !== letterDateSearch && d2 !== letterDateSearch) return false;
      }
      if (statusFilter !== 'ALL' && r.Status !== statusFilter) return false;
      if (sheetFilter !== 'ALL' && (r.SourceSheet || '') !== sheetFilter) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'No') {
        cmp = Number(a.No) - Number(b.No);
      } else if (sortField === 'FarmerGroupName') {
        cmp = a.FarmerGroupName.localeCompare(b.FarmerGroupName, 'th');
      } else {
        cmp = String(a.AccountingYear).localeCompare(String(b.AccountingYear), 'th');
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [records, searchQuery, yearFilter, letterNumberSearch, letterDateSearch, statusFilter, sheetFilter, sortField, sortAsc]);

  const issueSummaryByFarmer = useMemo(() => {
    const map = new Map<string, { name: string; records: number; issues: number }>();
    filteredRecords.forEach((r) => {
      const cur = map.get(r.FarmerGroupName) || { name: r.FarmerGroupName, records: 0, issues: 0 };
      cur.records += 1;
      cur.issues += Number(r.IssueCount || 0);
      map.set(r.FarmerGroupName, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.issues - a.issues);
  }, [filteredRecords]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  const toggleSort = (field: 'No' | 'FarmerGroupName' | 'AccountingYear') => {
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

  const openEditModal = (record: FarmerGroupObservation) => {
    setEditingRecord(record);
    setForm({
      FarmerGroupName: record.FarmerGroupName,
      AccountingYear: String(record.AccountingYear),
      AuditOfficeLetterNumber: record.AuditOfficeLetterNumber || '',
      AuditOfficeLetterDate: record.AuditOfficeLetterDate || '',
      CorrectionNotificationLetterNumber: record.CorrectionNotificationLetterNumber || '',
      CorrectionNotificationLetterDate: record.CorrectionNotificationLetterDate || '',
      IssueCount: String(record.IssueCount),
      ObservationDetails: record.ObservationDetails,
      CorrectionGuidelines: record.CorrectionGuidelines,
      Status: record.Status,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const handleValidateAndPromptSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.FarmerGroupName.trim()) return setFormError('กรุณาระบุชื่อกลุ่มเกษตรกร');
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
    onSetLoading(true, 'กำลังบันทึกข้อมูลข้อสังเกตของกลุ่มเกษตรกรลง Google Sheets...');
    try {
      const payload = {
        FarmerGroupName: form.FarmerGroupName.trim(),
        AccountingYear: form.AccountingYear.trim(),
        AuditOfficeLetterNumber: form.AuditOfficeLetterNumber.trim(),
        AuditOfficeLetterDate: form.AuditOfficeLetterDate.trim(),
        CorrectionNotificationLetterNumber: form.CorrectionNotificationLetterNumber.trim(),
        CorrectionNotificationLetterDate: form.CorrectionNotificationLetterDate.trim(),
        IssueCount: Number(form.IssueCount),
        ObservationDetails: form.ObservationDetails.trim(),
        CorrectionGuidelines: form.CorrectionGuidelines.trim(),
        Status: form.Status,
      };
      if (editingRecord) {
        await coopApi.updateFarmerObservation(editingRecord.ID, payload);
      } else {
        await coopApi.createFarmerObservation(payload);
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
      await coopApi.deleteFarmerObservation(deleteTarget.ID);
      await onRefresh();
      setDeleteTarget(null);
      onNotify('success', 'ลบข้อมูลข้อสังเกตของกลุ่มเกษตรกรสำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ลบข้อมูลไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const openDetailModal = async (record: FarmerGroupObservation) => {
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

  const handleUploadPdf = async (record: FarmerGroupObservation, file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onNotify('error', 'รองรับเฉพาะไฟล์เอกสาร PDF (.pdf) เท่านั้น');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      onNotify('error', 'ไฟล์ PDF มีขนาดใหญ่เกิน 15 MB');
      return;
    }

    setUploadingPdf(true);
    onSetLoading(true, `กำลังอัปโหลดไฟล์ "${file.name}" ไปยัง Google Drive...`);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const base64 = result.split(',')[1] || '';
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });

      await coopApi.uploadAttachment({
        relatedRecordID: record.ID,
        recordType: 'FarmerGroupObservations',
        fileName: file.name,
        base64Data,
        mimeType: 'application/pdf',
      });
      await onRefresh();
      onNotify('success', 'แนบเอกสาร PDF สำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'อัปโหลดไฟล์ PDF ไม่สำเร็จ');
    } finally {
      setUploadingPdf(false);
      onSetLoading(false);
    }
  };

  const handleDownloadPdf = async (att: AttachmentRecord) => {
    onSetLoading(true, `กำลังดาวน์โหลด "${att.FileName}" จาก Google Drive...`);
    try {
      const blob = await coopApi.fetchAttachmentBlob(att.FileID, att.FileName, 'download');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.FileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ดาวน์โหลดไฟล์ไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const executeDeleteAttachment = async () => {
    if (!deleteAttTarget) return;
    onSetLoading(true, 'กำลังลบไฟล์แนบออกจาก Google Drive และ Google Sheets...');
    try {
      await coopApi.deleteAttachment(deleteAttTarget.ID);
      await onRefresh();
      setDeleteAttTarget(null);
      onNotify('success', 'ลบไฟล์แนบสำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ลบไฟล์แนบไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const handleExportExcel = () => {
    exportToExcel(
      filteredRecords,
      [
        { header: 'ที่', value: (r) => r.No, width: 8 },
        { header: 'ชื่อกลุ่มเกษตรกร', value: (r) => r.FarmerGroupName, width: 30 },
        { header: 'ปีบัญชี', value: (r) => r.AccountingYear, width: 12 },
        { header: 'เลขที่หนังสือสำนักงานตรวจบัญชีฯ', value: (r) => r.AuditOfficeLetterNumber, width: 24 },
        { header: 'วันที่หนังสือ (ตรวจบัญชีฯ)', value: (r) => r.AuditOfficeLetterDate, width: 16 },
        { header: 'เลขที่หนังสือแจ้งผลการแก้ไข', value: (r) => r.CorrectionNotificationLetterNumber, width: 24 },
        { header: 'วันที่หนังสือ (แจ้งผล)', value: (r) => r.CorrectionNotificationLetterDate, width: 16 },
        { header: 'จำนวนประเด็น', value: (r) => r.IssueCount, width: 14 },
        { header: 'ข้อสังเกตที่ตรวจพบ', value: (r) => r.ObservationDetails, width: 42 },
        { header: 'แนวทางการแก้ไข', value: (r) => r.CorrectionGuidelines, width: 42 },
        { header: 'สถานะการดำเนินการ', value: (r) => r.Status, width: 22 },
      ],
      'ข้อสังเกตของกลุ่มเกษตรกร',
      'Farmer_Group_Observations',
      'รายงานข้อสังเกตของกลุ่มเกษตรกร'
    );
  };

  const activeAttachments = detailTarget ? attachmentsByRecord.get(detailTarget.ID) || [] : [];

  return (
    <div className="space-y-5">
      {/* Formal Print Header */}
      <div className="hidden print-only mb-4 border-b-2 border-[#0B3B2C] pb-3">
        <div className="flex items-center gap-3">
          <img src={EMBLEM_URL} alt="ตราหน่วยงาน" className="w-12 h-12 object-contain" />
          <div>
            <h2 className="text-lg font-bold text-[#0B3B2C]">
              CO-OP WATCHING SYSTEM — รายงานข้อสังเกตของกลุ่มเกษตรกร
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
          <p className="text-xs font-semibold text-[#9A7409]">เมนูที่ 1 : ข้อสังเกต · ส่วนที่ 1.2 (ฐานข้อมูลแยกอิสระ)</p>
          <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">ข้อสังเกตของกลุ่มเกษตรกร</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            <span>เพิ่มข้อสังเกตกลุ่มเกษตรกร</span>
          </button>
        </div>
      </div>

      {/* Multi-field Search & Filter Panel */}
      <section className="bg-white rounded-xl border border-neutral-200 p-4 no-print">
        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-12 gap-3 items-end">
          <div className="@4xl:col-span-3">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              ค้นหาชื่อกลุ่มเกษตรกร / รายละเอียด
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
                placeholder="พิมพ์ชื่อกลุ่มเกษตรกร..."
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

          <div className="@4xl:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">ค้นหาเลขที่หนังสือ</label>
            <input
              type="text"
              value={letterNumberSearch}
              onChange={(e) => {
                setLetterNumberSearch(e.target.value);
                setPage(1);
              }}
              placeholder="เลขที่หนังสือ..."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            />
          </div>

          <div className="@4xl:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">วันที่หนังสือ</label>
            <input
              type="date"
              value={letterDateSearch}
              onChange={(e) => {
                setLetterDateSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            />
          </div>

          <div className="@4xl:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">สถานะ</label>
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

          <div className="@4xl:col-span-1">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setYearFilter('ALL');
                setLetterNumberSearch('');
                setLetterDateSearch('');
                setStatusFilter('ALL');
                setSheetFilter('ALL');
                setPage(1);
              }}
              title="ล้างตัวกรอง"
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="@4xl:hidden">ล้างตัวกรอง</span>
            </button>
          </div>
        </div>

        {sourceSheets.length > 0 && (
          <div className="mt-3 pt-3 border-t border-neutral-100 flex flex-col @xl:flex-row @xl:items-center gap-2">
            <label className="text-xs font-semibold text-neutral-600 shrink-0">
              กรองตามแผ่นงาน (Sheet):
            </label>
            <select
              value={sheetFilter}
              onChange={(e) => {
                setSheetFilter(e.target.value);
                setPage(1);
              }}
              className="w-full @xl:w-72 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกแผ่นงาน ({sourceSheets.length} แผ่นงาน)</option>
              {sourceSheets.map((sh) => (
                <option key={sh} value={sh}>
                  {sh}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* Issue Count Summary Strip */}
      {issueSummaryByFarmer.length > 0 && (
        <section className="bg-white rounded-xl border border-neutral-200 p-4 no-print">
          <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-1.5 mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B3B2C]">
              <Sprout className="w-4 h-4 text-[#C9A227] shrink-0" />
              <span>สรุปจำนวนประเด็นข้อสังเกตแยกตามกลุ่มเกษตรกร</span>
            </div>
            <span className="text-xs text-neutral-500 tabular-nums">
              รวม {issueSummaryByFarmer.length} กลุ่ม ·{' '}
              {filteredRecords.reduce((acc, r) => acc + Number(r.IssueCount || 0), 0)} ประเด็น
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-700">
            {issueSummaryByFarmer.slice(0, 12).map((item) => (
              <span key={item.name} className="inline-flex items-center gap-1.5">
                <span className="font-semibold text-[#0B3B2C]">{item.name}:</span>
                <span className="tabular-nums font-bold text-[#9A7409]">{item.issues} ประเด็น</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Horizontally Scrollable Table + Mobile Card View */}
      <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden print-container">
        {/* Smartphone Card Layout */}
        <div className="block @3xl:hidden no-print divide-y divide-neutral-200">
          {paginated.length === 0 ? (
            <div className="py-12 px-4 text-center text-neutral-500">
              <p className="font-semibold text-neutral-700 text-sm">
                ยังไม่มีข้อมูลข้อสังเกตของกลุ่มเกษตรกรที่ตรงกับเงื่อนไข
              </p>
              <p className="text-xs mt-1">กดปุ่ม &quot;เพิ่มข้อสังเกตกลุ่มเกษตรกร&quot; เพื่อบันทึกรายการใหม่</p>
            </div>
          ) : (
            paginated.map((row) => {
              const rowAtts = attachmentsByRecord.get(row.ID) || [];
              return (
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
                        {row.FarmerGroupName}
                      </h3>
                      {row.SourceSheet && (
                        <p className="text-[11px] text-neutral-500">แผ่นงาน: {row.SourceSheet}</p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <ObservationStatusBadge status={row.Status} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 text-xs text-neutral-700 bg-[#F7F9F8] rounded-lg p-3 border border-neutral-200/80">
                    <p>
                      <span className="font-semibold text-[#0B3B2C]">หนังสือตรวจบัญชีฯ:</span>{' '}
                      {row.AuditOfficeLetterNumber || '-'}{' '}
                      {row.AuditOfficeLetterDate ? `(${formatThaiDate(row.AuditOfficeLetterDate)})` : ''}
                    </p>
                    <p>
                      <span className="font-semibold text-[#0B3B2C]">หนังสือแจ้งผลแก้ไข:</span>{' '}
                      {row.CorrectionNotificationLetterNumber || '-'}{' '}
                      {row.CorrectionNotificationLetterDate
                        ? `(${formatThaiDate(row.CorrectionNotificationLetterDate)})`
                        : ''}
                    </p>
                  </div>

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
                      <Paperclip className="w-3.5 h-3.5 text-[#C9A227]" />
                      <span className="tabular-nums">รายละเอียด &amp; PDF ({rowAtts.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(row)}
                      className="min-h-[42px] inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/70 text-xs font-semibold text-amber-800 hover:bg-amber-100/70"
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
              );
            })
          )}
        </div>

        <div className="hidden @3xl:block print-block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1460px]">
            <thead>
              <tr className="bg-[#0B3B2C] text-white text-xs font-bold">
                <th className="py-3 px-3 w-12 text-center">
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
                    onClick={() => toggleSort('FarmerGroupName')}
                    className="inline-flex items-center gap-1 hover:text-[#E5C158]"
                  >
                    <span>ชื่อกลุ่มเกษตรกร</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
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
                <th className="py-3 px-3 w-40">เลขที่หนังสือสำนักงานตรวจบัญชีฯ</th>
                <th className="py-3 px-3 w-28">วันที่หนังสือ</th>
                <th className="py-3 px-3 w-40">เลขที่หนังสือแจ้งผลการแก้ไข</th>
                <th className="py-3 px-3 w-28">วันที่หนังสือ</th>
                <th className="py-3 px-3 w-24 text-right">จำนวนประเด็น</th>
                <th className="py-3 px-3 min-w-[210px]">ข้อสังเกตที่ตรวจพบ</th>
                <th className="py-3 px-3 min-w-[210px]">แนวทางการแก้ไข</th>
                <th className="py-3 px-3 w-36">สถานะ</th>
                <th className="py-3 px-3 w-28 text-center no-print">ไฟล์ PDF</th>
                <th className="py-3 px-3 w-36 text-center no-print">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-14 text-center text-neutral-500">
                    <p className="font-semibold text-neutral-700">ยังไม่มีข้อมูลข้อสังเกตของกลุ่มเกษตรกรที่ตรงกับเงื่อนไข</p>
                    <p className="text-xs mt-1">กดปุ่ม &quot;เพิ่มข้อสังเกตกลุ่มเกษตรกร&quot; เพื่อบันทึกรายการใหม่</p>
                  </td>
                </tr>
              ) : (
                paginated.map((row) => {
                  const rowAtts = attachmentsByRecord.get(row.ID) || [];
                  return (
                    <tr key={row.ID} className="hover:bg-[#F7F9F8] transition-colors align-top">
                      <td className="py-3 px-3 text-center font-semibold text-neutral-700 tabular-nums">
                        {row.No}
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#0B3B2C]">
                        <div>{row.FarmerGroupName}</div>
                        {row.SourceSheet && (
                          <div className="text-[11px] font-normal text-neutral-500 mt-0.5">
                            แผ่นงาน: {row.SourceSheet}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center tabular-nums font-medium">{row.AccountingYear}</td>
                      <td className="py-3 px-3 text-xs text-neutral-800">{row.AuditOfficeLetterNumber || '-'}</td>
                      <td className="py-3 px-3 text-xs text-neutral-700 tabular-nums whitespace-nowrap">
                        {formatThaiDate(row.AuditOfficeLetterDate)}
                      </td>
                      <td className="py-3 px-3 text-xs text-neutral-800">
                        {row.CorrectionNotificationLetterNumber || '-'}
                      </td>
                      <td className="py-3 px-3 text-xs text-neutral-700 tabular-nums whitespace-nowrap">
                        {formatThaiDate(row.CorrectionNotificationLetterDate)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-[#0B3B2C]">
                        {Number(row.IssueCount).toLocaleString('th-TH')}
                      </td>
                      <td className="py-3 px-3 text-[13px] text-neutral-800 whitespace-pre-wrap leading-relaxed">
                        {row.ObservationDetails}
                      </td>
                      <td className="py-3 px-3 text-[13px] text-neutral-700 whitespace-pre-wrap leading-relaxed">
                        {row.CorrectionGuidelines}
                      </td>
                      <td className="py-3 px-3">
                        <ObservationStatusBadge status={row.Status} />
                      </td>
                      <td className="py-3 px-3 text-center no-print">
                        <button
                          type="button"
                          onClick={() => openDetailModal(row)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-neutral-300 bg-white text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50 whitespace-nowrap"
                        >
                          <Paperclip className="w-3.5 h-3.5 text-[#C9A227]" />
                          <span className="tabular-nums">{rowAtts.length} ไฟล์</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDetailModal(row)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-200/70 transition-colors whitespace-nowrap"
                            title="ดูรายละเอียดและแนบเอกสาร"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>ดูรายละเอียด</span>
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
                  );
                })
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

      {/* Add / Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <h3 className="text-base font-bold">
                {editingRecord ? 'แก้ไขข้อมูลข้อสังเกตของกลุ่มเกษตรกร' : 'เพิ่มข้อมูลข้อสังเกตของกลุ่มเกษตรกร'}
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
                    ชื่อกลุ่มเกษตรกร <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.FarmerGroupName}
                    onChange={(e) => setForm({ ...form, FarmerGroupName: e.target.value })}
                    placeholder="เช่น กลุ่มเกษตรกรทำนาบางหลวง"
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
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
              </div>

              {/* Separate Official Letter Fields */}
              <div className="p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200 space-y-3">
                <p className="text-xs font-bold text-[#0B3B2C]">
                  ข้อมูลหนังสือสำนักงานตรวจบัญชีสหกรณ์ชัยนาท
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">เลขที่หนังสือ</label>
                    <input
                      type="text"
                      value={form.AuditOfficeLetterNumber}
                      onChange={(e) => setForm({ ...form, AuditOfficeLetterNumber: e.target.value })}
                      placeholder="เช่น กษ 0407/..."
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">วันที่หนังสือ</label>
                    <input
                      type="date"
                      value={form.AuditOfficeLetterDate}
                      onChange={(e) => setForm({ ...form, AuditOfficeLetterDate: e.target.value })}
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                    />
                  </div>
                </div>

                <p className="text-xs font-bold text-[#0B3B2C] pt-2">
                  ข้อมูลหนังสือแจ้งผลการแก้ไขของกลุ่มเกษตรกร
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">เลขที่หนังสือ</label>
                    <input
                      type="text"
                      value={form.CorrectionNotificationLetterNumber}
                      onChange={(e) =>
                        setForm({ ...form, CorrectionNotificationLetterNumber: e.target.value })
                      }
                      placeholder="เลขที่หนังสือตอบกลับ..."
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">วันที่หนังสือ</label>
                    <input
                      type="date"
                      value={form.CorrectionNotificationLetterDate}
                      onChange={(e) =>
                        setForm({ ...form, CorrectionNotificationLetterDate: e.target.value })
                      }
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                    />
                  </div>
                </div>
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
                  ข้อสังเกตที่ตรวจพบ <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.ObservationDetails}
                  onChange={(e) => setForm({ ...form, ObservationDetails: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  แนวทางการแก้ไข <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.CorrectionGuidelines}
                  onChange={(e) => setForm({ ...form, CorrectionGuidelines: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200">
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
            </form>
          </div>
        </div>
      )}

      {/* Detail + PDF Attachment Manager Modal */}
      {detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <div>
                <p className="text-xs text-[#E5C158] font-mono-tabular">{detailTarget.ID}</p>
                <h3 className="text-base font-bold">{detailTarget.FarmerGroupName}</h3>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#F7F9F8] border border-neutral-200">
                <div>
                  <p className="text-xs text-neutral-500">ปีบัญชี</p>
                  <p className="font-bold tabular-nums">{detailTarget.AccountingYear}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">จำนวนประเด็น</p>
                  <p className="font-bold text-[#0B3B2C] tabular-nums">{detailTarget.IssueCount} ประเด็น</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">หนังสือตรวจบัญชีฯ</p>
                  <p className="font-semibold text-xs">
                    {detailTarget.AuditOfficeLetterNumber || '-'} ({formatThaiDate(detailTarget.AuditOfficeLetterDate)})
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">สถานะ</p>
                  <div className="mt-0.5">
                    <ObservationStatusBadge status={detailTarget.Status} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

              {/* Google Drive PDF Attachment Section */}
              <div className="p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-[#0B3B2C] flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-[#C9A227]" />
                      <span>เอกสารแนบ PDF (จัดเก็บใน Google Drive แบบส่วนตัวตามสิทธิ์ราชการ)</span>
                    </h4>
                    <p className="text-xs text-neutral-600">
                      หนังสือสำนักงานตรวจบัญชีสหกรณ์ชัยนาท / หนังสือแจ้งผลแก้ไข / หลักฐานประกอบ
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] cursor-pointer transition-colors whitespace-nowrap shrink-0">
                    <Upload className="w-3.5 h-3.5 text-[#E5C158]" />
                    <span>{uploadingPdf ? 'กำลังอัปโหลด...' : 'แนบไฟล์ PDF'}</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={uploadingPdf}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadPdf(detailTarget, file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {activeAttachments.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-3 text-center border border-dashed border-neutral-300 rounded-lg bg-white">
                    ยังไม่มีเอกสาร PDF แนบในรายการนี้
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeAttachments.map((att) => (
                      <div
                        key={att.ID}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-white border border-neutral-200"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-neutral-900 truncate">{att.FileName}</p>
                            <p className="text-[11px] text-neutral-500">
                              อัปโหลดโดย {att.UploadedBy} · {formatThaiDateTime(att.UploadedAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewPdf({ fileId: att.FileID, fileName: att.FileName })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-neutral-300 text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>เปิดดู</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDownloadPdf(att)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-neutral-300 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>ดาวน์โหลด</span>
                          </button>
                          {userRole === 'Admin' && (
                            <button
                              type="button"
                              onClick={() => setDeleteAttTarget(att)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>ลบ</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                <p className="text-xs font-bold text-[#0B3B2C] mb-2">ประวัติการดำเนินงาน (Activity Log)</p>
                {logsLoading ? (
                  <p className="text-xs text-neutral-500">กำลังโหลดประวัติ...</p>
                ) : detailLogs.length === 0 ? (
                  <p className="text-xs text-neutral-500">ไม่พบประวัติการเปลี่ยนแปลงเพิ่มเติม</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
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

      {/* PDF Preview Modal */}
      <PdfPreviewModal file={previewPdf} onClose={() => setPreviewPdf(null)} />

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={confirmSaveOpen}
        title="ยืนยันการแก้ไขข้อมูลกลุ่มเกษตรกร"
        message={`ต้องการบันทึกการปรับปรุงข้อมูลของ "${form.FarmerGroupName}" ปีบัญชี ${form.AccountingYear} ลง Google Sheets ใช่หรือไม่?`}
        confirmLabel="ยืนยันบันทึกการแก้ไข"
        variant="primary"
        isLoading={submitting}
        onConfirm={() => void executeSave()}
        onCancel={() => setConfirmSaveOpen(false)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="ยืนยันการลบข้อมูลข้อสังเกตกลุ่มเกษตรกร"
        message={`คุณต้องการลบข้อมูลของ "${deleteTarget?.FarmerGroupName}" (รหัส ${deleteTarget?.ID}) ออกจาก Google Sheets ใช่หรือไม่?`}
        detailText={deleteTarget?.ObservationDetails}
        confirmLabel="ยืนยันการลบข้อมูล"
        variant="danger"
        onConfirm={() => void executeDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteAttTarget)}
        title="ยืนยันการลบไฟล์แนบ PDF"
        message={`คุณต้องการลบไฟล์ "${deleteAttTarget?.FileName}" ออกจาก Google Drive และรายการเอกสารแนบใช่หรือไม่?`}
        confirmLabel="ยืนยันลบไฟล์แนบ"
        variant="danger"
        onConfirm={() => void executeDeleteAttachment()}
        onCancel={() => setDeleteAttTarget(null)}
      />
    </div>
  );
}
