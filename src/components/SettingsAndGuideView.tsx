import { useState } from 'react';
import {
  Database,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Wrench,
  BookOpen,
  Code2,
  Copy,
  Check,
  Table2,
  ClipboardCheck,
  Loader2,
  Layers,
  RefreshCw,
} from 'lucide-react';
import type {
  MultiSheetSettings,
  SheetModuleMapping,
  SheetSourceRule,
  WorkspaceConfig,
} from '../types/coop';
import { coopApi } from '../services/api';

interface SettingsAndGuideViewProps {
  config: WorkspaceConfig;
  onConfigSaved: (newConfig: WorkspaceConfig) => Promise<void>;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onSetLoading: (loading: boolean, message?: string) => void;
}

type GuideTab = 'connection' | 'sheets' | 'apps-script' | 'deploy-guide' | 'manual' | 'tests';

const SHEET_SCHEMA_ROWS = [
  {
    name: '1. CooperativeObservations',
    desc: 'เก็บข้อมูลข้อสังเกตของสหกรณ์',
    cols: 'ID, No, CooperativeName, LetterInfo, AccountingYear, IssueCount, ObservationDetails, CorrectionGuidelines, Status, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy',
  },
  {
    name: '2. FarmerGroupObservations',
    desc: 'เก็บข้อมูลข้อสังเกตของกลุ่มเกษตรกร (ฐานข้อมูลแยกอิสระ)',
    cols: 'ID, No, FarmerGroupName, AccountingYear, AuditOfficeLetterNumber, AuditOfficeLetterDate, CorrectionNotificationLetterNumber, CorrectionNotificationLetterDate, IssueCount, ObservationDetails, CorrectionGuidelines, Status, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy',
  },
  {
    name: '3. Defects',
    desc: 'เก็บข้อมูลข้อบกพร่องของสหกรณ์',
    cols: 'ID, No, CooperativeName, OrderNumber, OrderDate, DefectDetails, CorrectionResults, DefectStatus, CreatedAt, UpdatedAt, CreatedBy, UpdatedBy',
  },
  {
    name: '4. Attachments',
    desc: 'เก็บข้อมูลไฟล์แนบ PDF บน Google Drive',
    cols: 'ID, RelatedRecordID, RecordType, FileName, FileID, FileURL, UploadedAt, UploadedBy',
  },
  {
    name: '5. ActivityLogs',
    desc: 'เก็บประวัติการดำเนินงาน (ห้ามลบเมื่อแก้ไขข้อมูลเดิม)',
    cols: 'ID, RecordID, RecordType, Action, OldValue, NewValue, ActionBy, ActionDate',
  },
  {
    name: '6. Users (RBAC)',
    desc: 'เก็บรายชื่อเจ้าหน้าที่และสิทธิ์ Admin / Staff',
    cols: 'ID, Email, DisplayName, Role, IsActive, CreatedAt, UpdatedAt',
  },
];

const TEST_CHECKLIST = [
  { id: 'T01', title: 'เข้าสู่ระบบด้วย Google Workspace (Firebase Auth + OAuth)', expected: 'รับ Token ในหน่วยความจำ และตรวจสอบสิทธิ์ Admin/Staff จากชีท Users สำเร็จ' },
  { id: 'T02', title: 'ทดสอบเชื่อมต่อและสร้างแผ่นงานอัตโนมัติ (6 Sheets + Drive Folder)', expected: 'สร้าง/ตรวจสอบครบ 6 แผ่นงานพร้อมหัวคอลัมน์ตรงตามข้อกำหนด' },
  { id: 'T03', title: 'เพิ่ม / แก้ไข / ลบ ข้อสังเกตของสหกรณ์ (เมนู 1.1)', expected: 'สร้าง ID ไม่ซ้ำ รัน No อัตโนมัติ แก้ไขแถวเดิมไม่ซ้ำซ้อน มีหน้าต่างยืนยันก่อนลบ' },
  { id: 'T04', title: 'เพิ่ม / แก้ไข / ค้นหาเลขที่หนังสือ ข้อสังเกตของกลุ่มเกษตรกร (เมนู 1.2)', expected: 'แยกฐานข้อมูลชัดเจน ค้นหาตามเลขที่/วันที่หนังสือได้ ตรวจสอบความถูกต้องครบ' },
  { id: 'T05', title: 'แนบไฟล์ PDF / เปิดดูตัวอย่าง / ดาวน์โหลด / ลบไฟล์แนบ (Google Drive)', expected: 'อัปโหลดเข้า Folder ID โดยไม่ตั้งไฟล์เป็นสาธารณะ เปิดดู PDF ในแอปได้จริง' },
  { id: 'T06', title: 'เพิ่ม / แก้ไข / บันทึกผลการแก้ไขเพิ่มเติม ข้อบกพร่อง (เมนู 2)', expected: 'แสดงสีสถานะทั้ง 4 ระดับ (แดง/ส้ม/เขียวอ่อน/เขียวเข้ม) ถูกต้อง' },
  { id: 'T07', title: 'Dashboard คำนวณตัวเลข 9 การ์ด และ 5 กราฟจากข้อมูลจริง', expected: 'ตัวเลขและการ์ดอัปเดตทันทีหลังเพิ่ม/แก้ไข/ลบ โดยไม่มีตัวเลขจำลอง' },
  { id: 'T08', title: 'ระบบรายงานผู้บริหาร 12 รูปแบบ ส่งออก Excel (.xlsx) และ PDF/พิมพ์', expected: 'หัวรายงานระบุ CO-OP WATCHING SYSTEM, สำนักงานสหกรณ์จังหวัดชัยนาท และวันที่จัดทำครบถ้วน' },
  { id: 'T09', title: 'ตรวจสอบสิทธิ์ Backend RBAC (Admin vs Staff)', expected: 'Staff ไม่สามารถลบข้อมูลหรือเข้าจัดการผู้ใช้งานได้ (Backend ตอบกลับ 403)' },
  { id: 'T10', title: 'ตรวจสอบการแสดงผลบน Desktop, Tablet และ Smartphone', expected: 'Sidebar ย่อ/ขยายได้ และบนมือถือเปลี่ยนเป็น Mobile Navigation ที่ใช้งานสะดวก' },
];

export function SettingsAndGuideView({
  config,
  onConfigSaved,
  onNotify,
  onSetLoading,
}: SettingsAndGuideViewProps) {
  const [activeTab, setActiveTab] = useState<GuideTab>('connection');
  const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheetId);
  const [driveFolderId, setDriveFolderId] = useState(config.driveFolderId);
  const [appsScriptUrl, setAppsScriptUrl] = useState(config.appsScriptUrl || '');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    spreadsheetConnected: boolean;
    spreadsheetTitle: string;
    existingSheets: string[];
    missingSheets: string[];
    driveStatus: { connected: boolean; folderName?: string; error?: string };
    userEmail: string;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Multi-Sheet configuration state
  const [pullAllSheets, setPullAllSheets] = useState<boolean>(
    config.multiSheet?.pullAllSheets !== false
  );
  const [splitPerIssue, setSplitPerIssue] = useState<boolean>(
    config.multiSheet?.splitPerIssue !== false
  );
  const [sheetRules, setSheetRules] = useState<SheetSourceRule[]>(
    config.multiSheet?.sheetRules || []
  );
  const [inspecting, setInspecting] = useState(false);
  const [inspectedTitle, setInspectedTitle] = useState('');
  const [inspectedSheets, setInspectedSheets] = useState<
    Array<{
      sheetName: string;
      isPrimarySystemSheet: boolean;
      detectedModule: 'coop' | 'farmer' | 'defects' | 'system' | 'unsupported';
      accountingYear: string;
      rowCount: number;
      headers: string[];
    }>
  >([]);

  const buildMultiSheetPayload = (): MultiSheetSettings => ({
    pullAllSheets,
    splitPerIssue,
    sheetRules,
  });

  const handleInspectSheets = async (targetId?: string) => {
    const idToInspect = (targetId ?? spreadsheetId).trim();
    if (!idToInspect) {
      setTestError('กรุณาระบุ Google Spreadsheet ID ก่อนโหลดรายชื่อแผ่นงาน');
      return;
    }
    setInspecting(true);
    setTestError(null);
    try {
      const res = await coopApi.inspectSheets(idToInspect);
      setInspectedTitle(res.spreadsheetTitle);
      setInspectedSheets(res.sheets);
      // Merge newly discovered sheets into sheetRules while preserving user overrides
      setSheetRules((prev) => {
        const prevMap = new Map(prev.map((r) => [r.sheetName, r]));
        return res.sheets
          .filter((s) => s.detectedModule !== 'system')
          .map((s) => {
            const existing = prevMap.get(s.sheetName);
            if (existing) return existing;
            return {
              sheetName: s.sheetName,
              enabled: pullAllSheets ? s.detectedModule !== 'unsupported' || s.isPrimarySystemSheet : false,
              module: 'auto' as SheetModuleMapping,
              accountingYearOverride: '',
            };
          });
      });
      onNotify('success', `พบทั้งหมด ${res.sheets.length} แผ่นงานใน "${res.spreadsheetTitle}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถโหลดรายชื่อแผ่นงานได้';
      setTestError(msg);
      onNotify('error', msg);
    } finally {
      setInspecting(false);
    }
  };

  const updateSheetRule = (sheetName: string, patch: Partial<SheetSourceRule>) => {
    setSheetRules((prev) => {
      const exists = prev.some((r) => r.sheetName === sheetName);
      if (exists) {
        return prev.map((r) => (r.sheetName === sheetName ? { ...r, ...patch } : r));
      }
      return [
        ...prev,
        {
          sheetName,
          enabled: true,
          module: 'auto',
          accountingYearOverride: '',
          ...patch,
        },
      ];
    });
  };

  const handleTestConnection = async () => {
    if (!spreadsheetId.trim()) {
      setTestError('กรุณาระบุ Google Spreadsheet ID ก่อนทดสอบการเชื่อมต่อ');
      return;
    }
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await coopApi.testConnection({
        spreadsheetId: spreadsheetId.trim(),
        driveFolderId: driveFolderId.trim(),
      });
      setTestResult(res);
      await handleInspectSheets(spreadsheetId.trim());
      if (res.missingSheets.length === 0 && (!driveFolderId.trim() || res.driveStatus.connected)) {
        onNotify('success', 'ทดสอบการเชื่อมต่อ Google Sheets และ Google Drive สำเร็จ');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ทดสอบการเชื่อมต่อไม่สำเร็จ';
      setTestError(msg);
      onNotify('error', msg);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveMultiSheetOnly = async () => {
    if (!spreadsheetId.trim()) {
      onNotify('error', 'กรุณาระบุ Google Spreadsheet ID');
      return;
    }
    onSetLoading(true, 'กำลังบันทึกการตั้งค่าและดึงข้อมูลจากทุก Sheets มาแสดงผล...');
    try {
      const nextCfg: WorkspaceConfig = {
        spreadsheetId: spreadsheetId.trim(),
        driveFolderId: driveFolderId.trim(),
        appsScriptUrl: appsScriptUrl.trim(),
        multiSheet: buildMultiSheetPayload(),
      };
      await onConfigSaved(nextCfg);
      onNotify('success', 'บันทึกการกำหนดค่าดึงข้อมูลราย Sheet และโหลดข้อมูลสำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const handleSaveAndVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spreadsheetId.trim()) {
      onNotify('error', 'กรุณาระบุ Google Spreadsheet ID');
      return;
    }
    onSetLoading(true, 'กำลังตรวจสอบและบันทึกการตั้งค่าการเชื่อมต่อ...');
    try {
      const nextCfg: WorkspaceConfig = {
        spreadsheetId: spreadsheetId.trim(),
        driveFolderId: driveFolderId.trim(),
        appsScriptUrl: appsScriptUrl.trim(),
        multiSheet: buildMultiSheetPayload(),
      };
      // Ensure sheets exist on this spreadsheet
      await coopApi.bootstrapWorkspace({
        spreadsheetId: nextCfg.spreadsheetId,
        driveFolderId: nextCfg.driveFolderId,
      });
      await onConfigSaved(nextCfg);
      onNotify('success', 'เชื่อมต่อและเตรียมฐานข้อมูล Google Sheets สำเร็จ');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'บันทึกการตั้งค่าไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const handleAutoCreateWorkspace = async () => {
    onSetLoading(true, 'กำลังสร้าง Google Spreadsheet (6 แผ่นงาน) และโฟลเดอร์ Google Drive ใหม่...');
    try {
      const result = await coopApi.bootstrapWorkspace({
        createNewSpreadsheet: true,
        createNewFolder: true,
      });
      setSpreadsheetId(result.spreadsheetId);
      setDriveFolderId(result.driveFolderId);
      const nextCfg: WorkspaceConfig = {
        spreadsheetId: result.spreadsheetId,
        driveFolderId: result.driveFolderId,
        appsScriptUrl: appsScriptUrl.trim(),
        multiSheet: buildMultiSheetPayload(),
      };
      await onConfigSaved(nextCfg);
      onNotify('success', `สร้างฐานข้อมูล "${result.spreadsheetTitle}" และโฟลเดอร์ Drive สำเร็จ`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'สร้างฐานข้อมูลอัตโนมัติไม่สำเร็จ');
    } finally {
      onSetLoading(false);
    }
  };

  const handleCopyCodeGs = async () => {
    const snippet = `// ดูไฟล์ฉบับเต็มได้ที่ /apps-script/Code.gs ในซอร์สโค้ดโปรเจกต์
// รองรับแผ่นงาน: CooperativeObservations, FarmerGroupObservations, Defects, Attachments, ActivityLogs, Users
// พร้อมฟังก์ชัน doGet, doPost, LockService, RBAC และ Drive PDF Upload แบบส่วนตัว`;
    try {
      const resp = await fetch('/apps-script/Code.gs');
      const text = resp.ok ? await resp.text() : snippet;
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
      onNotify('success', 'คัดลอกซอร์สโค้ด Code.gs เรียบร้อยแล้ว');
    } catch {
      onNotify('error', 'ไม่สามารถคัดลอกโค้ดได้');
    }
  };

  const tabs: Array<{ id: GuideTab; label: string; icon: React.ReactNode }> = [
    { id: 'connection', label: 'ตั้งค่าเชื่อมต่อฐานข้อมูล', icon: <Database className="w-4 h-4" /> },
    { id: 'sheets', label: 'โครงสร้าง Google Sheets', icon: <Table2 className="w-4 h-4" /> },
    { id: 'apps-script', label: 'Apps Script (Code.gs)', icon: <Code2 className="w-4 h-4" /> },
    { id: 'deploy-guide', label: 'ขั้นตอนติดตั้ง & Drive', icon: <Wrench className="w-4 h-4" /> },
    { id: 'manual', label: 'คู่มือการใช้งาน', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'tests', label: 'รายการทดสอบระบบ', icon: <ClipboardCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-[#9A7409]">การเชื่อมต่อระบบ เอกสารทางเทคนิค และคู่มือส่งมอบ</p>
        <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">ตั้งค่าการเชื่อมต่อและคู่มือระบบ</h2>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-white rounded-xl border border-neutral-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`inline-flex items-center gap-2 min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-[#0B3B2C] text-white shadow-sm'
                : 'text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Connection Settings */}
      {activeTab === 'connection' && (
        <div className="grid grid-cols-1 @4xl:grid-cols-12 gap-5">
          <div className="@4xl:col-span-7 bg-white rounded-xl border border-neutral-200 p-4 @xl:p-6 space-y-5">
            <div>
              <h3 className="text-base font-bold text-[#0B3B2C]">
                กำหนดค่า Google Sheets และ Google Drive
              </h3>
              <p className="text-xs text-neutral-600 mt-1">
                ระบุ Spreadsheet ID และ Google Drive Folder ID ของสำนักงานสหกรณ์จังหวัดชัยนาท หรือกดสร้างใหม่ได้อัตโนมัติในคลิกเดียว
              </p>
            </div>

            <form onSubmit={handleSaveAndVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  Google Spreadsheet ID <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <Database className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                    placeholder="เช่น 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2.5 text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  คัดลอกรหัสระหว่าง /d/ และ /edit จาก URL ของ Google Sheets
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  Google Drive Folder ID (สำหรับจัดเก็บไฟล์แนบ PDF)
                </label>
                <div className="relative">
                  <FolderOpen className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    placeholder="เช่น 1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                    className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2.5 text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  คัดลอกรหัสหลัง /folders/ ใน URL ของโฟลเดอร์ Google Drive
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
                  Google Apps Script Web App URL (ทางเลือกเพิ่มเติม)
                </label>
                <input
                  type="url"
                  value={appsScriptUrl}
                  onChange={(e) => setAppsScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-mono-tabular focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50 disabled:opacity-60"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                  <span>ทดสอบและโหลดรายชื่อ Sheets</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveMultiSheetOnly()}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg border border-[#0B3B2C] bg-emerald-50 text-xs font-bold text-[#0B3B2C] hover:bg-emerald-100"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>บันทึกและดึงข้อมูลจากทุก Sheets</span>
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-5 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21]"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#E5C158]" />
                  <span>บันทึกและเตรียมแผ่นงานทั้ง 6 แผ่นงาน</span>
                </button>
              </div>
            </form>

            {testError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">ไม่สามารถเชื่อมต่อได้</p>
                  <p className="mt-0.5">{testError}</p>
                </div>
              </div>
            )}

            {testResult && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs text-emerald-950">
                <p className="font-bold flex items-center gap-1.5 text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>ผลการทดสอบการเชื่อมต่อจริง</span>
                </p>
                <p>
                  <strong>ชื่อไฟล์ Google Sheets:</strong> {testResult.spreadsheetTitle}
                </p>
                <p>
                  <strong>แผ่นงานที่พบ:</strong> {testResult.existingSheets.join(', ')}
                </p>
                {testResult.missingSheets.length > 0 && (
                  <p className="text-orange-800 font-semibold">
                    แผ่นงานมาตรฐานที่ยังไม่มี: {testResult.missingSheets.join(', ')} (ระบบยังสามารถดึงข้อมูลจากแผ่นงานแยกแต่ละ Sheets ที่มีอยู่มาแสดงผลได้ทันที หรือกดเตรียมแผ่นงานเพื่อสร้างเพิ่มเติม)
                  </p>
                )}
                <p>
                  <strong>Google Drive Folder:</strong>{' '}
                  {testResult.driveStatus.connected
                    ? `เชื่อมต่อสำเร็จ (${testResult.driveStatus.folderName})`
                    : testResult.driveStatus.error}
                </p>
              </div>
            )}
          </div>

          <div className="@4xl:col-span-5 bg-white rounded-xl border border-neutral-200 p-4 @xl:p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-[#9A7409]">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#0B3B2C]">
                สร้างฐานข้อมูลใหม่ให้อัตโนมัติ (1-Click Setup)
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed">
                หากยังไม่มีไฟล์ Google Sheets หรือโฟลเดอร์ Google Drive ระบบสามารถสร้างไฟล์ฐานข้อมูลใหม่พร้อมแผ่นงานทั้ง 6 แผ่นงาน หัวตารางสีเขียวเข้ม และโฟลเดอร์เก็บไฟล์ PDF ในบัญชี Google ของท่านให้ทันที
              </p>
              <ul className="text-xs text-neutral-700 space-y-1.5 pt-1">
                <li>1. CooperativeObservations</li>
                <li>2. FarmerGroupObservations</li>
                <li>3. Defects</li>
                <li>4. Attachments</li>
                <li>5. ActivityLogs</li>
                <li>6. Users (กำหนดบัญชีปัจจุบันเป็น Admin อัตโนมัติ)</li>
              </ul>
            </div>

            <button
              type="button"
              onClick={handleAutoCreateWorkspace}
              className="w-full py-3 px-4 rounded-lg bg-[#C9A227] text-[#0B3B2C] text-sm font-bold hover:bg-[#dfb93d] transition-colors"
            >
              สร้าง Spreadsheet & Drive Folder ใหม่อัตโนมัติ
            </button>
          </div>

          {/* Multi-Sheet Source Configuration Card */}
          <div className="@4xl:col-span-12 bg-white rounded-xl border border-neutral-200 p-4 @xl:p-6 space-y-4">
            <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0B3B2C] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#C9A227] shrink-0" />
                  <span>กำหนดค่าการดึงข้อมูลจากแต่ละ Sheet มาแสดงผล (Multi-Sheet Mapping)</span>
                </h3>
                <p className="text-xs text-neutral-600 mt-1">
                  กรณีฐานข้อมูล Google Sheets เก็บข้อมูลแยกไว้ในหลายแผ่นงาน (เช่น แยกตามปีบัญชี หรือแยกตามประเภทสหกรณ์/กลุ่มเกษตรกร/ข้อบกพร่อง) ระบบจะดึงข้อมูลจากทุก Sheet ที่เปิดใช้งานมาแสดงผลร่วมกันโดยอัตโนมัติ
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleInspectSheets()}
                disabled={inspecting}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {inspecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-[#E5C158]" />}
                <span>โหลดรายชื่อ Sheets ในไฟล์นี้</span>
              </button>
            </div>

            <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3 p-3.5 rounded-xl bg-[#F7F9F8] border border-neutral-200 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pullAllSheets}
                  onChange={(e) => setPullAllSheets(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 text-[#0B3B2C] focus:ring-[#0B3B2C]"
                />
                <span>
                  <strong className="text-[#0B3B2C] block">ดึงข้อมูลจากทุก Sheets ที่รองรับโดยอัตโนมัติ</strong>
                  <span className="text-neutral-600">
                    อ่านข้อมูลจากทุกแผ่นงานใน Spreadsheet ที่มีหัวตารางตรงตามระบบ (หรือปิดเพื่อเลือกเปิดเฉพาะบาง Sheet ด้านล่าง)
                  </span>
                </span>
              </label>

              <div>
                <label className="block font-bold text-[#0B3B2C] mb-1">
                  การอ่านข้อมูลจากแผ่นงานแบบแถวรวมประเด็น (Merged Rows)
                </label>
                <select
                  value={splitPerIssue ? 'split' : 'merge'}
                  onChange={(e) => setSplitPerIssue(e.target.value === 'split')}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="split">แยกเป็นรายประเด็น (ติดตามสถานะรายข้อได้ละเอียด)</option>
                  <option value="merge">รวมเป็น 1 รายการต่อสหกรณ์/หนังสือ</option>
                </select>
              </div>
            </div>

            {inspectedSheets.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#0B3B2C]">
                    แผ่นงานที่พบใน &quot;{inspectedTitle}&quot; ({inspectedSheets.length} Sheets)
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleSaveMultiSheetOnly()}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#15803D] text-white text-xs font-semibold hover:bg-[#166534]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>บันทึกการตั้งค่า Sheet และแสดงผลทันที</span>
                  </button>
                </div>

                {/* Mobile Cards for Sheet Config */}
                <div className="block @3xl:hidden divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
                  {inspectedSheets
                    .filter((s) => s.detectedModule !== 'system')
                    .map((s) => {
                      const rule = sheetRules.find((r) => r.sheetName === s.sheetName);
                      const isEnabled = rule ? rule.enabled : pullAllSheets && s.detectedModule !== 'unsupported';
                      const moduleVal = rule?.module || 'auto';
                      const yearVal = rule?.accountingYearOverride || '';
                      return (
                        <div key={s.sheetName} className="p-3.5 space-y-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 font-bold text-[#0B3B2C]">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => updateSheetRule(s.sheetName, { enabled: e.target.checked })}
                                className="rounded border-neutral-300 text-[#0B3B2C]"
                              />
                              <span>{s.sheetName}</span>
                            </label>
                            <span className="tabular-nums font-bold text-[#9A7409]">{s.rowCount} รายการ</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={moduleVal}
                              onChange={(e) =>
                                updateSheetRule(s.sheetName, {
                                  module: e.target.value as SheetModuleMapping,
                                  enabled: e.target.value !== 'skip',
                                })
                              }
                              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
                            >
                              <option value="auto">อัตโนมัติ ({s.detectedModule})</option>
                              <option value="coop">1.1 ข้อสังเกตสหกรณ์</option>
                              <option value="farmer">1.2 กลุ่มเกษตรกร</option>
                              <option value="defects">2. ข้อบกพร่อง</option>
                              <option value="skip">ไม่ดึงข้อมูล</option>
                            </select>
                            <input
                              type="text"
                              value={yearVal}
                              onChange={(e) => updateSheetRule(s.sheetName, { accountingYearOverride: e.target.value })}
                              placeholder={s.accountingYear ? `ปี ${s.accountingYear}` : 'ปีบัญชี (อัตโนมัติ)'}
                              className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Desktop Table for Sheet Config */}
                <div className="hidden @3xl:block overflow-x-auto border border-neutral-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B3B2C] text-white">
                        <th className="py-2.5 px-3 w-16 text-center">แสดงผล</th>
                        <th className="py-2.5 px-3">ชื่อแผ่นงาน (Google Sheet Tab)</th>
                        <th className="py-2.5 px-3 w-36">ตรวจพบอัตโนมัติ</th>
                        <th className="py-2.5 px-3 w-52">กำหนดโมดูลแสดงผล</th>
                        <th className="py-2.5 px-3 w-36">กำหนดปีบัญชี</th>
                        <th className="py-2.5 px-3 w-28 text-right">จำนวนรายการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {inspectedSheets
                        .filter((s) => s.detectedModule !== 'system')
                        .map((s) => {
                          const rule = sheetRules.find((r) => r.sheetName === s.sheetName);
                          const isEnabled = rule ? rule.enabled : pullAllSheets && s.detectedModule !== 'unsupported';
                          const moduleVal = rule?.module || 'auto';
                          const yearVal = rule?.accountingYearOverride || '';
                          const detectedLabel =
                            s.detectedModule === 'coop'
                              ? 'ข้อสังเกตสหกรณ์'
                              : s.detectedModule === 'farmer'
                              ? 'กลุ่มเกษตรกร'
                              : s.detectedModule === 'defects'
                              ? 'ข้อบกพร่อง'
                              : 'ยังไม่ตรงรูปแบบ';
                          return (
                            <tr key={s.sheetName} className="hover:bg-[#F7F9F8]">
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isEnabled}
                                  onChange={(e) => updateSheetRule(s.sheetName, { enabled: e.target.checked })}
                                  className="rounded border-neutral-300 text-[#0B3B2C]"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <p className="font-bold text-[#0B3B2C]">{s.sheetName}</p>
                                {s.headers.length > 0 && (
                                  <p className="text-[11px] text-neutral-500 truncate max-w-md">
                                    คอลัมน์: {s.headers.join(', ')}
                                  </p>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-neutral-700">{detectedLabel}</td>
                              <td className="py-2.5 px-3">
                                <select
                                  value={moduleVal}
                                  onChange={(e) =>
                                    updateSheetRule(s.sheetName, {
                                      module: e.target.value as SheetModuleMapping,
                                      enabled: e.target.value !== 'skip',
                                    })
                                  }
                                  className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
                                >
                                  <option value="auto">อัตโนมัติ ({detectedLabel})</option>
                                  <option value="coop">1.1 ข้อสังเกตสหกรณ์</option>
                                  <option value="farmer">1.2 กลุ่มเกษตรกร</option>
                                  <option value="defects">2. ข้อบกพร่อง</option>
                                  <option value="skip">ไม่ดึงข้อมูล</option>
                                </select>
                              </td>
                              <td className="py-2.5 px-3">
                                <input
                                  type="text"
                                  value={yearVal}
                                  onChange={(e) => updateSheetRule(s.sheetName, { accountingYearOverride: e.target.value })}
                                  placeholder={s.accountingYear ? `อัตโนมัติ (${s.accountingYear})` : 'อัตโนมัติ'}
                                  className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs tabular-nums"
                                />
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#0B3B2C]">
                                {s.rowCount.toLocaleString('th-TH')}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Sheets Schema */}
      {activeTab === 'sheets' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
          <h3 className="text-base font-bold text-[#0B3B2C]">
            โครงสร้างฐานข้อมูล Google Sheets (5 แผ่นงานหลัก + 1 แผ่นงานสิทธิ์ผู้ใช้งาน)
          </h3>
          <div className="space-y-3">
            {SHEET_SCHEMA_ROWS.map((s) => (
              <div key={s.name} className="p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200 space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h4 className="text-sm font-bold text-[#0B3B2C]">{s.name}</h4>
                  <span className="text-xs text-neutral-600">{s.desc}</span>
                </div>
                <p className="text-xs font-mono-tabular text-neutral-800 bg-white p-2.5 rounded-lg border border-neutral-200 break-words">
                  {s.cols}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Apps Script Code.gs */}
      {activeTab === 'apps-script' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#0B3B2C]">
                ซอร์สโค้ด Google Apps Script Backend (apps-script/Code.gs)
              </h3>
              <p className="text-xs text-neutral-600">
                รองรับ CRUD ทั้ง 3 ฐานข้อมูล, ค้นหา/กรอง, อัปโหลดไฟล์ PDF เข้า Google Drive แบบส่วนตัว, บันทึก ActivityLogs และตรวจสิทธิ์ RBAC
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyCodeGs}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21]"
            >
              {copiedCode ? <Check className="w-4 h-4 text-[#E5C158]" /> : <Copy className="w-4 h-4" />}
              <span>{copiedCode ? 'คัดลอกสำเร็จ' : 'คัดลอกโครงสร้างโค้ด'}</span>
            </button>
          </div>
          <div className="p-4 rounded-xl bg-neutral-900 text-emerald-100 text-xs font-mono-tabular overflow-x-auto leading-relaxed">
            <pre>{`// ไฟล์ซอร์สโค้ดฉบับเต็มอยู่ที่: /apps-script/Code.gs
// ความสามารถครบทั้ง 10 ส่วนตามข้อกำหนด:
// 1. readSheetObjects() - อ่านข้อมูลจาก Google Sheets
// 2. createRecord() - เพิ่มข้อมูลพร้อมสร้าง ID และ No อัตโนมัติ + ป้องกันข้อมูลซ้ำ
// 3. updateRecord() - แก้ไขแถวเดิมโดยอ้างอิง ID (ไม่สร้างแถวซ้ำ)
// 4. deleteRecord() - ลบข้อมูลพร้อมรันลำดับ No ใหม่ (เฉพาะ Admin)
// 5. listRecords() / filter - ค้นหาและกรองข้อมูล
// 6. uploadPdfToDrive() - อัปโหลดไฟล์ PDF โดยตั้งสิทธิ์ PRIVATE ตามระเบียบราชการ
// 7. deleteAttachment() - ลบไฟล์แนบและลงประวัติ
// 8. logActivity() - บันทึกประวัติการดำเนินงานลง ActivityLogs ทุกครั้ง
// 9. buildDashboardSummary() - คำนวณผลสรุปจริงจาก Google Sheets
// 10. authorizeUser() & LockService - ตรวจสอบสิทธิ์ Admin/Staff และป้องกันข้อมูลชนกัน`}</pre>
          </div>
        </div>
      )}

      {/* Tab 4: Deploy & Setup Guide */}
      {activeTab === 'deploy-guide' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5 text-sm text-neutral-800 leading-relaxed">
          <section className="space-y-2">
            <h3 className="text-base font-bold text-[#0B3B2C]">ขั้นตอนที่ 1 : การตั้งค่า Google Sheets และ Google Drive</h3>
            <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>เข้าสู่ระบบด้วยบัญชี Google ของหน่วยงานในหน้า Login ของ CO-OP WATCHING SYSTEM</li>
              <li>ไปที่เมนู <strong>ตั้งค่าเชื่อมต่อ &amp; คู่มือ</strong> แล้วกดปุ่ม <strong>&quot;สร้าง Spreadsheet &amp; Drive Folder ใหม่อัตโนมัติ&quot;</strong> หรือระบุ Spreadsheet ID และ Drive Folder ID ที่มีอยู่แล้ว</li>
              <li>ใน Google Drive ให้กำหนดสิทธิ์การแชร์โฟลเดอร์เฉพาะเจ้าหน้าที่สำนักงานสหกรณ์จังหวัดชัยนาทเท่านั้น (ห้ามตั้งค่าเป็น Anyone with the link)</li>
            </ol>
          </section>

          <section className="space-y-2 pt-3 border-t border-neutral-200">
            <h3 className="text-base font-bold text-[#0B3B2C]">ขั้นตอนที่ 2 : การ Deploy Google Apps Script (กรณีต้องการใช้งานผ่าน Web App URL)</h3>
            <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm">
              <li>เปิด Google Sheets ฐานข้อมูล แล้วไปที่เมนู <strong>Extensions &gt; Apps Script</strong></li>
              <li>นำโค้ดจากไฟล์ <code>apps-script/Code.gs</code> วางลงใน Editor และบันทึกโปรเจกต์</li>
              <li>ไปที่ <strong>Project Settings &gt; Script Properties</strong> เพิ่มค่า <code>SPREADSHEET_ID</code> และ <code>DRIVE_FOLDER_ID</code></li>
              <li>คลิก <strong>Deploy &gt; New deployment &gt; Select type: Web app</strong></li>
              <li>เลือก Execute as: <strong>Me</strong> และ Who has access: <strong>Anyone</strong> (การตรวจสอบสิทธิ์ผู้ใช้จะทำใน Backend Proxy และชีท Users)</li>
              <li>คัดลอก Web App URL ที่ได้มาบันทึกในหน้าตั้งค่า (ระบบหลักเชื่อมต่อผ่าน Backend Proxy + Google Workspace API โดยตรงอยู่แล้วจึงใช้งานได้ทันทีโดยไม่มีปัญหา CORS)</li>
            </ol>
          </section>
        </div>
      )}

      {/* Tab 5: Thai User Manual */}
      {activeTab === 'manual' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-6 space-y-4 text-sm text-neutral-800 leading-relaxed">
          <h3 className="text-base font-bold text-[#0B3B2C]">คู่มือการใช้งานระบบ CO-OP WATCHING SYSTEM (ภาษาไทย)</h3>
          <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4 text-xs @xl:text-sm">
            <div className="p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200 space-y-2">
              <p className="font-bold text-[#0B3B2C]">สำหรับผู้บริหาร</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>เปิดหน้า <strong>Dashboard ภาพรวม</strong> เพื่อดูการ์ดสรุปทั้ง 9 รายการและกราฟทั้ง 5 รูปแบบ</li>
                <li>ใช้ตัวกรองปีบัญชี ชื่อสหกรณ์ กลุ่มเกษตรกร หรือสถานะ เพื่อวิเคราะห์เชิงลึก</li>
                <li>ไปที่เมนู <strong>ระบบรายงาน</strong> เพื่อดูรายงาน 12 รูปแบบและส่งออก Excel / พิมพ์ PDF สำหรับการประชุม</li>
              </ul>
            </div>
            <div className="p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200 space-y-2">
              <p className="font-bold text-[#0B3B2C]">สำหรับเจ้าหน้าที่ปฏิบัติงาน</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>บันทึกข้อสังเกตของสหกรณ์ที่ <strong>เมนู 1.1</strong> และข้อสังเกตของกลุ่มเกษตรกรที่ <strong>เมนู 1.2</strong> (แยกฐานข้อมูลกันอย่างชัดเจน)</li>
                <li>ในเมนู 1.2 กดปุ่ม <strong>&quot;ดูรายละเอียด&quot;</strong> เพื่อแนบไฟล์ PDF หนังสือราชการเข้า Google Drive และเปิดดูตัวอย่างได้ทันที</li>
                <li>บันทึกและอัปเดตผลการแก้ไขข้อบกพร่องที่ <strong>เมนู 2 ข้อบกพร่อง</strong> พร้อมติดตามประวัติการแก้ไขได้ตลอดเวลา</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: System Test Checklist */}
      {activeTab === 'tests' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-6 space-y-4">
          <h3 className="text-base font-bold text-[#0B3B2C]">รายการทดสอบระบบ (System Verification Matrix)</h3>
          {/* Mobile Test Cards */}
          <div className="block @3xl:hidden divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
            {TEST_CHECKLIST.map((t) => (
              <div key={t.id} className="p-3.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-tabular font-bold text-[#0B3B2C]">{t.id}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> พร้อมทดสอบ
                  </span>
                </div>
                <p className="font-semibold text-neutral-900">{t.title}</p>
                <p className="text-neutral-600 leading-relaxed">{t.expected}</p>
              </div>
            ))}
          </div>

          <div className="hidden @3xl:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0B3B2C] text-white">
                  <th className="py-2.5 px-3 w-16">รหัส</th>
                  <th className="py-2.5 px-3 w-72">รายการทดสอบ</th>
                  <th className="py-2.5 px-3">ผลลัพธ์ที่คาดหวัง</th>
                  <th className="py-2.5 px-3 w-28 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {TEST_CHECKLIST.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 px-3 font-mono-tabular font-bold text-[#0B3B2C]">{t.id}</td>
                    <td className="py-2.5 px-3 font-semibold">{t.title}</td>
                    <td className="py-2.5 px-3 text-neutral-700">{t.expected}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> พร้อมทดสอบ
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
