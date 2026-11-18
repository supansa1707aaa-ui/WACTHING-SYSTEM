import { useState } from 'react';
import { Plus, Edit3, Trash2, Shield, UserCheck, X } from 'lucide-react';
import type { SystemUser, UserRole } from '../types/coop';
import { ConfirmModal } from './ConfirmModal';
import { coopApi } from '../services/api';
import { formatThaiDateTime } from '../utils/exportUtils';

interface UsersManagementViewProps {
  users: SystemUser[];
  currentUserEmail: string;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onSetLoading: (loading: boolean, message?: string) => void;
}

export function UsersManagementView({
  users,
  currentUserEmail,
  onRefresh,
  onNotify,
  onSetLoading,
}: UsersManagementViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SystemUser | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('Staff');
  const [isActive, setIsActive] = useState<'TRUE' | 'FALSE'>('TRUE');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemUser | null>(null);

  const openAdd = () => {
    setEditing(null);
    setEmail('');
    setDisplayName('');
    setRole('Staff');
    setIsActive('TRUE');
    setModalOpen(true);
  };

  const openEdit = (u: SystemUser) => {
    setEditing(u);
    setEmail(u.Email);
    setDisplayName(u.DisplayName);
    setRole(u.Role === 'Admin' ? 'Admin' : 'Staff');
    setIsActive(String(u.IsActive).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    onSetLoading(true, 'กำลังบันทึกข้อมูลสิทธิ์ผู้ใช้งานลง Google Sheets...');
    try {
      if (editing) {
        await coopApi.updateUser(editing.ID, {
          DisplayName: displayName.trim(),
          Role: role,
          IsActive: isActive,
        });
      } else {
        await coopApi.createUser({
          Email: email.trim().toLowerCase(),
          DisplayName: displayName.trim(),
          Role: role,
          IsActive: isActive,
        });
      }
      await onRefresh();
      setModalOpen(false);
      onNotify('success', 'บันทึกข้อมูลผู้ใช้งานสำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'บันทึกผู้ใช้งานไม่สำเร็จ');
    } finally {
      setSubmitting(false);
      onSetLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    onSetLoading(true, 'กำลังลบสิทธิ์ผู้ใช้งาน...');
    try {
      await coopApi.deleteUser(deleteTarget.ID);
      await onRefresh();
      setDeleteTarget(null);
      onNotify('success', 'ลบผู้ใช้งานเรียบร้อยแล้ว');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'ลบผู้ใช้งานไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#9A7409]">ระบบความปลอดภัยและกำหนดสิทธิ์ (Admin Only)</p>
          <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">จัดการผู้ใช้งานและสิทธิ์การเข้าถึง</h2>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] whitespace-nowrap"
        >
          <Plus className="w-4 h-4 text-[#E5C158]" />
          <span>เพิ่มเจ้าหน้าที่ / ผู้ดูแลระบบ</span>
        </button>
      </div>

      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4 text-xs">
        <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-1">
          <div className="flex items-center gap-2 font-bold text-[#0B3B2C] text-sm">
            <Shield className="w-4 h-4 text-[#C9A227]" />
            <span>ผู้ดูแลระบบ (Admin)</span>
          </div>
          <p className="text-neutral-600">
            ดูข้อมูลทุกเมนู · เพิ่ม · แก้ไข · ลบข้อมูลและไฟล์แนบ · จัดการผู้ใช้งาน · ดูประวัติการดำเนินงาน · ตั้งค่าฐานข้อมูล
          </p>
        </div>
        <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-1">
          <div className="flex items-center gap-2 font-bold text-[#0B3B2C] text-sm">
            <UserCheck className="w-4 h-4 text-[#15803D]" />
            <span>เจ้าหน้าที่ (Staff)</span>
          </div>
          <p className="text-neutral-600">
            ดูข้อมูล · เพิ่มข้อมูล · แก้ไขข้อมูล · ค้นหา · ออกรายงาน · แนบเอกสาร PDF (ไม่สามารถลบข้อมูลหรือจัดการผู้ใช้งานได้)
          </p>
        </div>
      </div>

      <section className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        {/* Smartphone Card Layout */}
        <div className="block @3xl:hidden divide-y divide-neutral-200">
          {users.map((u) => {
            const active = String(u.IsActive).toUpperCase() === 'TRUE';
            const isSelf = u.Email.toLowerCase() === currentUserEmail.toLowerCase();
            return (
              <article key={u.ID} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#0B3B2C]">
                      {u.DisplayName}{' '}
                      {isSelf && <span className="text-xs font-medium text-[#9A7409]">(บัญชีปัจจุบัน)</span>}
                    </h3>
                    <p className="text-neutral-600 truncate mt-0.5">{u.Email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
                      u.Role === 'Admin'
                        ? 'bg-[#0B3B2C] text-white border-[#0B3B2C]'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {u.Role === 'Admin' ? 'ผู้ดูแลระบบ (Admin)' : 'เจ้าหน้าที่ (Staff)'}
                  </span>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
                      active
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                    }`}
                  >
                    {active ? 'เปิดใช้งาน' : 'ระงับสิทธิ์'}
                  </span>
                </div>

                <p className="text-neutral-500 tabular-nums">
                  อัปเดตล่าสุด: {formatThaiDateTime(u.UpdatedAt)}
                </p>

                <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/70 text-xs font-semibold text-amber-800 hover:bg-amber-100/70"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>แก้ไขสิทธิ์</span>
                  </button>
                  {!isSelf && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(u)}
                      className="min-h-[42px] min-w-[42px] inline-flex items-center justify-center px-3 py-2 rounded-lg border border-red-200 bg-red-50/70 text-xs font-semibold text-red-700 hover:bg-red-100/70"
                      aria-label="ลบผู้ใช้งาน"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden @3xl:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-[#0B3B2C] text-white text-xs font-bold">
                <th className="py-3 px-4">ชื่อ-สกุล</th>
                <th className="py-3 px-4">บัญชี Google (Email)</th>
                <th className="py-3 px-4 w-36">ระดับสิทธิ์</th>
                <th className="py-3 px-4 w-32">สถานะ</th>
                <th className="py-3 px-4 w-44">อัปเดตล่าสุด</th>
                <th className="py-3 px-4 w-28 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {users.map((u) => {
                const active = String(u.IsActive).toUpperCase() === 'TRUE';
                const isSelf = u.Email.toLowerCase() === currentUserEmail.toLowerCase();
                return (
                  <tr key={u.ID} className="hover:bg-[#F7F9F8]">
                    <td className="py-3 px-4 font-semibold text-[#0B3B2C]">
                      {u.DisplayName} {isSelf && <span className="text-xs text-[#9A7409]">(บัญชีปัจจุบัน)</span>}
                    </td>
                    <td className="py-3 px-4 text-neutral-700">{u.Email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
                          u.Role === 'Admin'
                            ? 'bg-[#0B3B2C] text-white border-[#0B3B2C]'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {u.Role === 'Admin' ? 'ผู้ดูแลระบบ (Admin)' : 'เจ้าหน้าที่ (Staff)'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${
                          active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                        }`}
                      >
                        {active ? 'เปิดใช้งาน' : 'ระงับสิทธิ์'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-neutral-600 tabular-nums">
                      {formatThaiDateTime(u.UpdatedAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50"
                          title="แก้ไขสิทธิ์"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded-lg text-red-700 hover:bg-red-50"
                            title="ลบผู้ใช้งาน"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-[#0B3B2C] text-white">
              <h3 className="text-base font-bold">
                {editing ? 'แก้ไขข้อมูลสิทธิ์ผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  อีเมล Google Workspace <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  disabled={Boolean(editing)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  ชื่อ-สกุลเจ้าหน้าที่ <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="เช่น นายสมชาย ใจดี"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">ระดับสิทธิ์</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="Staff">Staff (เจ้าหน้าที่)</option>
                    <option value="Admin">Admin (ผู้ดูแลระบบ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#0B3B2C] mb-1">สถานะการใช้งาน</label>
                  <select
                    value={isActive}
                    onChange={(e) => setIsActive(e.target.value as 'TRUE' | 'FALSE')}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="TRUE">เปิดใช้งาน</option>
                    <option value="FALSE">ระงับสิทธิ์</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-300 text-sm font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-[#0B3B2C] text-white text-sm font-semibold hover:bg-[#082c21]"
                >
                  {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="ยืนยันการลบผู้ใช้งาน"
        message={`ต้องการลบบัญชี "${deleteTarget?.DisplayName}" (${deleteTarget?.Email}) ออกจากระบบใช่หรือไม่?`}
        confirmLabel="ยืนยันการลบ"
        variant="danger"
        onConfirm={() => void executeDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
