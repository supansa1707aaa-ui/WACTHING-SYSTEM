import { useMemo, useState } from 'react';
import { History, Search, RotateCcw } from 'lucide-react';
import type { ActivityLogRecord } from '../types/coop';
import { formatThaiDateTime } from '../utils/exportUtils';
import { PaginationBar } from './PaginationBar';

interface ActivityLogsViewProps {
  logs: ActivityLogRecord[];
}

export function ActivityLogsView({ logs }: ActivityLogsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((l) => {
      if (q) {
        const text = `${l.RecordID} ${l.ActionBy} ${l.OldValue} ${l.NewValue}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (typeFilter !== 'ALL' && l.RecordType !== typeFilter) return false;
      if (actionFilter !== 'ALL' && l.Action !== actionFilter) return false;
      return true;
    });
  }, [logs, searchQuery, typeFilter, actionFilter]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page, pageSize]);

  const summarizeChange = (raw: string) => {
    if (!raw) return '-';
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const parts: string[] = [];
      if (obj.CooperativeName) parts.push(`สหกรณ์: ${obj.CooperativeName}`);
      if (obj.FarmerGroupName) parts.push(`กลุ่มเกษตรกร: ${obj.FarmerGroupName}`);
      if (obj.Status) parts.push(`สถานะ: ${obj.Status}`);
      if (obj.DefectStatus) parts.push(`สถานะ: ${obj.DefectStatus}`);
      if (obj.FileName) parts.push(`ไฟล์: ${obj.FileName}`);
      if (obj.Email) parts.push(`บัญชี: ${obj.Email} (${obj.Role})`);
      return parts.length > 0 ? parts.join(' · ') : raw.slice(0, 140);
    } catch {
      return raw.slice(0, 140);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-[#9A7409]">ระบบตรวจสอบย้อนหลัง (Immutable Audit Trail)</p>
        <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">ประวัติการดำเนินงาน (Activity Logs)</h2>
      </div>

      <section className="bg-white rounded-xl border border-neutral-200 p-4">
        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-3 items-end">
          <div className="@xl:col-span-2">
            <label className="block text-xs font-semibold text-neutral-600 mb-1">
              ค้นหาตามรหัสรายการ / ผู้ดำเนินการ / รายละเอียด
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
                placeholder="ค้นหา ID, อีเมลผู้แก้ไข, ชื่อสหกรณ์..."
                className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">ประเภทข้อมูล</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="CooperativeObservations">ข้อสังเกตของสหกรณ์</option>
              <option value="FarmerGroupObservations">ข้อสังเกตของกลุ่มเกษตรกร</option>
              <option value="Defects">ข้อบกพร่อง</option>
              <option value="Attachments">ไฟล์แนบ</option>
              <option value="Users">ผู้ใช้งาน</option>
            </select>
          </div>

          <div className="flex gap-2">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">ทุกการกระทำ</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="UPLOAD_ATTACHMENT">UPLOAD_ATTACHMENT</option>
              <option value="DELETE_ATTACHMENT">DELETE_ATTACHMENT</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('ALL');
                setActionFilter('ALL');
                setPage(1);
              }}
              className="min-h-[40px] min-w-[40px] px-3 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 flex items-center justify-center"
              title="ล้างตัวกรอง"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        {/* Smartphone Card Layout */}
        <div className="block @3xl:hidden divide-y divide-neutral-200">
          {paginated.length === 0 ? (
            <div className="py-12 px-4 text-center text-neutral-500">
              <History className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
              <p className="font-semibold text-neutral-700 text-sm">ยังไม่มีประวัติการดำเนินงาน</p>
            </div>
          ) : (
            paginated.map((log) => (
              <article key={log.ID} className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#0B3B2C]">{log.Action}</span>
                  <span className="tabular-nums text-neutral-500">
                    {formatThaiDateTime(log.ActionDate)}
                  </span>
                </div>
                <p className="text-neutral-700">
                  <span className="font-semibold">{log.RecordType}</span> ·{' '}
                  <span className="font-mono-tabular text-neutral-500">{log.RecordID}</span>
                </p>
                {log.OldValue && (
                  <p className="text-neutral-600 leading-relaxed">
                    <span className="font-semibold text-neutral-700">เดิม:</span>{' '}
                    {summarizeChange(log.OldValue)}
                  </p>
                )}
                <p className="text-neutral-900 font-medium leading-relaxed">
                  <span className="font-semibold text-[#0B3B2C]">ใหม่:</span>{' '}
                  {summarizeChange(log.NewValue)}
                </p>
                <p className="text-neutral-500 pt-1">ผู้ดำเนินการ: {log.ActionBy}</p>
              </article>
            ))
          )}
        </div>

        <div className="hidden @3xl:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr className="bg-[#0B3B2C] text-white text-xs font-bold">
                <th className="py-3 px-3 w-40">วันเวลาที่ดำเนินการ</th>
                <th className="py-3 px-3 w-36">การกระทำ</th>
                <th className="py-3 px-3 w-44">ประเภท / รหัสอ้างอิง</th>
                <th className="py-3 px-3">ข้อมูลเดิม (OldValue)</th>
                <th className="py-3 px-3">ข้อมูลใหม่ (NewValue)</th>
                <th className="py-3 px-3 w-48">ผู้ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-xs">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-neutral-500">
                    <History className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
                    <p className="font-semibold text-neutral-700">ยังไม่มีประวัติการดำเนินงาน</p>
                  </td>
                </tr>
              ) : (
                paginated.map((log) => (
                  <tr key={log.ID} className="hover:bg-[#F7F9F8] align-top">
                    <td className="py-3 px-3 tabular-nums text-neutral-700 whitespace-nowrap">
                      {formatThaiDateTime(log.ActionDate)}
                    </td>
                    <td className="py-3 px-3 font-bold text-[#0B3B2C]">{log.Action}</td>
                    <td className="py-3 px-3">
                      <p className="font-semibold text-neutral-800">{log.RecordType}</p>
                      <p className="text-[11px] font-mono-tabular text-neutral-500">{log.RecordID}</p>
                    </td>
                    <td className="py-3 px-3 text-neutral-600 leading-relaxed">
                      {summarizeChange(log.OldValue)}
                    </td>
                    <td className="py-3 px-3 text-neutral-900 font-medium leading-relaxed">
                      {summarizeChange(log.NewValue)}
                    </td>
                    <td className="py-3 px-3 text-neutral-700">{log.ActionBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          totalItems={filteredLogs.length}
          currentPage={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
        />
      </section>
    </div>
  );
}
