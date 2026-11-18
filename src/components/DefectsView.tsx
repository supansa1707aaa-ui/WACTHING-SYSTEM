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
  ClipboardEdit,
} from 'lucide-react';
import {
  DEFECT_STATUS_OPTIONS,
  EMBLEM_URL,
  type ActivityLogRecord,
  type DefectRecord,
  type DefectStatus,
  type UserRole,
} from '../types/coop';
import { DefectStatusBadge } from './StatusBadge';
import { PaginationBar } from './PaginationBar';
import { ConfirmModal } from './ConfirmModal';
import { coopApi } from '../services/api';
import { exportToExcel, formatThaiDate, formatThaiDateTime, triggerOfficialPrint } from '../utils/exportUtils';

interface DefectsViewProps {
  records: DefectRecord[];
  userRole: UserRole;
  isConfigured: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onSetLoading: (loading: boolean, message?: string) => void;
}

interface FormState {
  CooperativeName: string;
  OrderNumber: string;
  OrderDate: string;
  DefectDetails: string;
  CorrectionResults: string;
  DefectStatus: DefectStatus;
}

const EMPTY_FORM: FormState = {
  CooperativeName: '',
  OrderNumber: '',
  OrderDate: '',
  DefectDetails: '',
  CorrectionResults: '',
  DefectStatus: 'ยังไม่ได้ดำเนินการแก้ไข',
};

export function DefectsView({
  records,
  userRole,
  isConfigured,
  onRefresh,
  onNotify,
  onSetLoading,
}: DefectsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [orderNumberSearch, setOrderNumberSearch] = useState('');
  const [orderDateSearch, setOrderDateSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sheetFilter, setSheetFilter] = useState('ALL');
  const [sortField, setSortField] = useState<'No' | 'CooperativeName' | 'OrderDate'>('No');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DefectRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [quickResultTarget, setQuickResultTarget] = useState<DefectRecord | null>(null);
  const [quickResultsText, setQuickResultsText] = useState('');
  const [quickStatus, setQuickStatus] = useState<DefectStatus>('อยู่ระหว่างดำเนินการแก้ไข');

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DefectRecord | null>(null);

  const [detailTarget, setDetailTarget] = useState<DefectRecord | null>(null);
  const [detailLogs, setDetailLogs] = useState<ActivityLogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const sourceSheets = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => r.SourceSheet && s.add(r.SourceSheet));
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'th'));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const oq = orderNumberSearch.trim().toLowerCase();

    const list = records.filter((r) => {
      if (q) {
        const m1 = r.CooperativeName.toLowerCase().includes(q);
        const m2 = r.DefectDetails.toLowerCase().includes(q);
        if (!m1 && !m2) return false;
      }
      if (oq && !String(r.OrderNumber || '').toLowerCase().includes(oq)) return false;
      if (orderDateSearch && String(r.OrderDate || '') !== orderDateSearch) return false;
      if (statusFilter !== 'ALL' && r.DefectStatus !== statusFilter) return false;
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
        cmp = String(a.OrderDate).localeCompare(String(b.OrderDate));
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [records, searchQuery, orderNumberSearch, orderDateSearch, statusFilter, sheetFilter, sortField, sortAsc]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page, pageSize]);

  const toggleSort = (field: 'No' | 'CooperativeName' | 'OrderDate') => {
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

  const openEditModal = (record: DefectRecord) => {
    setEditingRecord(record);
    setForm({
      CooperativeName: record.CooperativeName,
      OrderNumber: record.OrderNumber,
      OrderDate: record.OrderDate,
      DefectDetails: record.DefectDetails,
      CorrectionResults: record.CorrectionResults,
      DefectStatus: record.DefectStatus,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openQuickResultModal = (record: DefectRecord) => {
    setQuickResultTarget(record);
    setQuickResultsText(record.CorrectionResults || '');
    setQuickStatus(record.DefectStatus);
  };

  const handleValidateAndPromptSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.CooperativeName.trim()) return setFormError('กรุณาระบุชื่อสหกรณ์');
    if (!form.OrderNumber.trim()) return setFormError('กรุณาระบุเลขที่คำสั่ง');
    if (!form.OrderDate.trim()) return setFormError('กรุณาระบุวันที่ออกคำสั่ง');
    if (!form.DefectDetails.trim()) return setFormError('กรุณาระบุรายละเอียดประเด็นข้อบกพร่อง');

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
    onSetLoading(true, 'กำลังบันทึกข้อมูลข้อบกพร่องลง Google Sheets...');
    try {
      const payload = {
        CooperativeName: form.CooperativeName.trim(),
        OrderNumber: form.OrderNumber.trim(),
        OrderDate: form.OrderDate.trim(),
        DefectDetails: form.DefectDetails.trim(),
        CorrectionResults: form.CorrectionResults.trim(),
        DefectStatus: form.DefectStatus,
      };
      if (editingRecord) {
        await coopApi.updateDefect(editingRecord.ID, payload);
      } else {
        await coopApi.createDefect(payload);
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

  const executeQuickResultSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickResultTarget || submitting) return;
    setSubmitting(true);
    onSetLoading(true, 'กำลังบันทึกผลการแก้ไขเพิ่มเติม...');
    try {
      await coopApi.updateDefect(quickResultTarget.ID, {
        CooperativeName: quickResultTarget.CooperativeName,
        OrderNumber: quickResultTarget.OrderNumber,
        OrderDate: quickResultTarget.OrderDate,
        DefectDetails: quickResultTarget.DefectDetails,
        CorrectionResults: quickResultsText.trim(),
        DefectStatus: quickStatus,
      });
      await onRefresh();
      setQuickResultTarget(null);
      onNotify('success', 'บันทึกข้อมูลสำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'บันทึกผลการแก้ไขไม่สำเร็จ');
    } finally {
      setSubmitting(false);
      onSetLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    onSetLoading(true, 'กำลังลบข้อมูลข้อบกพร่องออกจาก Google Sheets...');
    try {
      await coopApi.deleteDefect(deleteTarget.ID);
      await onRefresh();
      setDeleteTarget(null);
      onNotify('success', 'ลบข้อมูลข้อบกพร่องสำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ลบข้อมูลไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const openDetailModal = async (record: DefectRecord) => {
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
        { header: 'ชื่อสหกรณ์', value: (r) => r.CooperativeName, width: 30 },
        { header: 'เลขที่คำสั่ง', value: (r) => r.OrderNumber, width: 20 },
        { header: 'สั่ง ณ วันที่', value: (r) => r.OrderDate, width: 16 },
        { header: 'รายละเอียดประเด็นข้อบกพร่อง', value: (r) => r.DefectDetails, width: 45 },
        { header: 'ผลการแก้ไข', value: (r) => r.CorrectionResults, width: 45 },
        { header: 'สถานะข้อบกพร่อง', value: (r) => r.DefectStatus, width: 24 },
      ],
      'ข้อบกพร่องของสหกรณ์',
      'Coop_Defects',
      'รายงานข้อบกพร่องของสหกรณ์'
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
              CO-OP WATCHING SYSTEM — รายงานข้อบกพร่องของสหกรณ์
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
          <p className="text-xs font-semibold text-[#9A7409]">เมนูที่ 2 : ข้อบกพร่อง</p>
          <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">ข้อบกพร่องของสหกรณ์</h2>
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
            <span>เพิ่มข้อบกพร่อง</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Panel */}
      <section className="bg-white rounded-xl border border-neutral-200 p-4 no-print">
        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-12 gap-3 items-end">
          <div className="@4xl:col-span-4">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              ค้นหาชื่อสหกรณ์ / ประเด็นข้อบกพร่อง
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
                placeholder="พิมพ์ชื่อสหกรณ์หรือรายละเอียด..."
                className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
              />
            </div>
          </div>

          <div className="@4xl:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">เลขที่คำสั่ง</label>
            <input
              type="text"
              value={orderNumberSearch}
              onChange={(e) => {
                setOrderNumberSearch(e.target.value);
                setPage(1);
              }}
              placeholder="เช่น 125/2568"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            />
          </div>

          <div className="@4xl:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">สั่ง ณ วันที่</label>
            <input
              type="date"
              value={orderDateSearch}
              onChange={(e) => {
                setOrderDateSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            />
          </div>

          <div className="@4xl:col-span-3">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">สถานะข้อบกพร่อง</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกสถานะ</option>
              {DEFECT_STATUS_OPTIONS.map((s) => (
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
                setOrderNumberSearch('');
                setOrderDateSearch('');
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

      {/* Main Data Table + Mobile Card View */}
      <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden print-container">
        {/* Smartphone Card Layout */}
        <div className="block @3xl:hidden no-print divide-y divide-neutral-200">
          {paginated.length === 0 ? (
            <div className="py-12 px-4 text-center text-neutral-500">
              <p className="font-semibold text-neutral-700 text-sm">ยังไม่มีข้อมูลข้อบกพร่องที่ตรงกับเงื่อนไข</p>
              <p className="text-xs mt-1">กดปุ่ม &quot;เพิ่มข้อบกพร่อง&quot; เพื่อบันทึกรายการใหม่</p>
            </div>
          ) : (
            paginated.map((row) => (
              <article key={row.ID} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-neutral-500 tabular-nums">
                      ลำดับที่ {row.No} · คำสั่งเลขที่ <strong className="text-[#0B3B2C]">{row.OrderNumber}</strong> ·{' '}
                      {formatThaiDate(row.OrderDate)}
                    </p>
                    <h3 className="text-sm font-bold text-[#0B3B2C] leading-snug">
                      {row.CooperativeName}
                    </h3>
                    {row.SourceSheet && (
                      <p className="text-[11px] text-neutral-500">แผ่นงาน: {row.SourceSheet}</p>
                    )}
                  </div>
                </div>

                <div>
                  <DefectStatusBadge status={row.DefectStatus} />
                </div>

                <div className="space-y-1 text-xs">
                  <p className="font-bold text-[#0B3B2C]">รายละเอียดประเด็นข้อบกพร่อง</p>
                  <p className="text-neutral-800 whitespace-pre-wrap leading-relaxed">
                    {row.DefectDetails}
                  </p>
                </div>

                <div className="space-y-1 text-xs pt-2 border-t border-neutral-100">
                  <p className="font-bold text-[#0B3B2C]">ผลการแก้ไข</p>
                  <p className="text-neutral-700 whitespace-pre-wrap leading-relaxed">
                    {row.CorrectionResults || (
                      <span className="text-neutral-400">ยังไม่มีบันทึกผลการแก้ไข</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => openQuickResultModal(row)}
                    className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21]"
                  >
                    <ClipboardEdit className="w-3.5 h-3.5 text-[#E5C158]" />
                    <span>บันทึกผลแก้ไข</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openDetailModal(row)}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50"
                  >
                    <Eye className="w-4 h-4" />
                    <span>ดู</span>
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
            ))
          )}
        </div>

        <div className="hidden @3xl:block print-block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1040px]">
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
                <th className="py-3 px-3 w-32">เลขที่คำสั่ง</th>
                <th className="py-3 px-3 w-32">
                  <button
                    type="button"
                    onClick={() => toggleSort('OrderDate')}
                    className="inline-flex items-center gap-1 hover:text-[#E5C158]"
                  >
                    <span>สั่ง ณ วันที่</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3 min-w-[240px]">รายละเอียดประเด็นข้อบกพร่อง</th>
                <th className="py-3 px-3 min-w-[220px]">ผลการแก้ไข</th>
                <th className="py-3 px-3 w-48">สถานะข้อบกพร่อง</th>
                <th className="py-3 px-3 w-40 text-center no-print">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-neutral-500">
                    <p className="font-semibold text-neutral-700">ยังไม่มีข้อมูลข้อบกพร่องที่ตรงกับเงื่อนไข</p>
                    <p className="text-xs mt-1">กดปุ่ม &quot;เพิ่มข้อบกพร่อง&quot; เพื่อบันทึกรายการใหม่</p>
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
                    <td className="py-3 px-3 font-medium text-neutral-800">{row.OrderNumber}</td>
                    <td className="py-3 px-3 text-xs text-neutral-700 tabular-nums whitespace-nowrap">
                      {formatThaiDate(row.OrderDate)}
                    </td>
                    <td className="py-3 px-3 text-[13px] text-neutral-800 whitespace-pre-wrap leading-relaxed">
                      {row.DefectDetails}
                    </td>
                    <td className="py-3 px-3 text-[13px] text-neutral-700 whitespace-pre-wrap leading-relaxed">
                      {row.CorrectionResults || <span className="text-neutral-400">ยังไม่มีบันทึกผลการแก้ไข</span>}
                    </td>
                    <td className="py-3 px-3">
                      <DefectStatusBadge status={row.DefectStatus} />
                    </td>
                    <td className="py-3 px-3 no-print">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openDetailModal(row)}
                          className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-200/70 hover:text-[#0B3B2C]"
                          title="ดูรายละเอียด"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuickResultModal(row)}
                          className="p-1.5 rounded-lg text-[#15803D] hover:bg-emerald-50"
                          title="บันทึกผลการแก้ไขเพิ่มเติม"
                        >
                          <ClipboardEdit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50"
                          title="แก้ไขข้อมูล"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {userRole === 'Admin' && !row.IsExternalSheet && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="p-1.5 rounded-lg text-red-700 hover:bg-red-50"
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

      {/* Add / Edit Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <h3 className="text-base font-bold">
                {editingRecord ? 'แก้ไขข้อมูลข้อบกพร่องของสหกรณ์' : 'เพิ่มข้อมูลข้อบกพร่องของสหกรณ์'}
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

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  ชื่อสหกรณ์ <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.CooperativeName}
                  onChange={(e) => setForm({ ...form, CooperativeName: e.target.value })}
                  placeholder="เช่น สหกรณ์การเกษตรสรรพยา จำกัด"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                    เลขที่คำสั่ง <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.OrderNumber}
                    onChange={(e) => setForm({ ...form, OrderNumber: e.target.value })}
                    placeholder="เช่น 104/2568"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                    สั่ง ณ วันที่ <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={form.OrderDate}
                    onChange={(e) => setForm({ ...form, OrderDate: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                    สถานะข้อบกพร่อง <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={form.DefectStatus}
                    onChange={(e) => setForm({ ...form, DefectStatus: e.target.value as DefectStatus })}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  >
                    {DEFECT_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  รายละเอียดประเด็นข้อบกพร่อง (รองรับหลายบรรทัด) <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.DefectDetails}
                  onChange={(e) => setForm({ ...form, DefectDetails: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  ผลการแก้ไข (รองรับหลายบรรทัด)
                </label>
                <textarea
                  rows={4}
                  value={form.CorrectionResults}
                  onChange={(e) => setForm({ ...form, CorrectionResults: e.target.value })}
                  placeholder="บันทึกความคืบหน้าหรือผลการแก้ไข..."
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

      {/* Quick Update Correction Result Modal */}
      {quickResultTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <h3 className="text-base font-bold">บันทึกผลการแก้ไขเพิ่มเติม</h3>
              <button
                type="button"
                onClick={() => setQuickResultTarget(null)}
                className="p-1.5 rounded-lg text-white/80 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={executeQuickResultSave} className="p-5 space-y-4">
              <div className="p-3 rounded-lg bg-[#F7F9F8] border border-neutral-200 text-xs">
                <p className="font-bold text-[#0B3B2C]">{quickResultTarget.CooperativeName}</p>
                <p className="text-neutral-600 mt-0.5">คำสั่งเลขที่ {quickResultTarget.OrderNumber}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">สถานะข้อบกพร่องล่าสุด</label>
                <select
                  value={quickStatus}
                  onChange={(e) => setQuickStatus(e.target.value as DefectStatus)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                >
                  {DEFECT_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">ผลการแก้ไขเพิ่มเติม</label>
                <textarea
                  rows={5}
                  value={quickResultsText}
                  onChange={(e) => setQuickResultsText(e.target.value)}
                  placeholder="ระบุรายละเอียดผลการแก้ไข..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setQuickResultTarget(null)}
                  className="px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#0B3B2C] text-white text-sm font-semibold hover:bg-[#082c21] disabled:opacity-60"
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึกผลการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#F7F9F8] border border-neutral-200">
                <div>
                  <p className="text-xs text-neutral-500">ลำดับที่</p>
                  <p className="font-bold tabular-nums">{detailTarget.No}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">เลขที่คำสั่ง</p>
                  <p className="font-bold">{detailTarget.OrderNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">สั่ง ณ วันที่</p>
                  <p className="font-bold tabular-nums">{formatThaiDate(detailTarget.OrderDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">สถานะข้อบกพร่อง</p>
                  <div className="mt-0.5">
                    <DefectStatusBadge status={detailTarget.DefectStatus} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#0B3B2C]">รายละเอียดประเด็นข้อบกพร่อง</p>
                <div className="p-3.5 rounded-lg border border-neutral-200 bg-white whitespace-pre-wrap leading-relaxed">
                  {detailTarget.DefectDetails}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-[#0B3B2C]">ผลการแก้ไข</p>
                <div className="p-3.5 rounded-lg border border-neutral-200 bg-white whitespace-pre-wrap leading-relaxed">
                  {detailTarget.CorrectionResults || '-'}
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
                <p className="text-xs font-bold text-[#0B3B2C] mb-2">ประวัติการดำเนินงาน (Activity Log)</p>
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
        title="ยืนยันการแก้ไขข้อมูลข้อบกพร่อง"
        message={`ต้องการบันทึกการปรับปรุงข้อมูลข้อบกพร่องของ "${form.CooperativeName}" คำสั่งเลขที่ ${form.OrderNumber} ลง Google Sheets ใช่หรือไม่?`}
        confirmLabel="ยืนยันบันทึกการแก้ไข"
        variant="primary"
        isLoading={submitting}
        onConfirm={() => void executeSave()}
        onCancel={() => setConfirmSaveOpen(false)}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="ยืนยันการลบข้อมูลข้อบกพร่อง"
        message={`คุณต้องการลบข้อมูลข้อบกพร่องของ "${deleteTarget?.CooperativeName}" (คำสั่ง ${deleteTarget?.OrderNumber}) ออกจาก Google Sheets ใช่หรือไม่?`}
        detailText={deleteTarget?.DefectDetails}
        confirmLabel="ยืนยันการลบข้อมูล"
        variant="danger"
        onConfirm={() => void executeDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
