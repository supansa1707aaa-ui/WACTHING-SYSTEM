import { useMemo, useState } from 'react';
import {
  Building2,
  Sprout,
  ClipboardCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Filter,
  RotateCcw,
  Settings,
  Database,
} from 'lucide-react';
import type { DashboardPayload, NavSection } from '../types/coop';

interface DashboardViewProps {
  data: DashboardPayload | null;
  isConfigured: boolean;
  onNavigate: (section: NavSection) => void;
}

export function DashboardView({ data, isConfigured, onNavigate }: DashboardViewProps) {
  const [yearFilter, setYearFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'COOP' | 'FARMER' | 'DEFECT'>('ALL');
  const [coopNameFilter, setCoopNameFilter] = useState('ALL');
  const [farmerNameFilter, setFarmerNameFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const coopObs = data?.coopObservations || [];
  const farmerObs = data?.farmerObservations || [];
  const defects = data?.defects || [];

  const accountingYears = useMemo(() => {
    const set = new Set<string>();
    coopObs.forEach((r) => r.AccountingYear && set.add(String(r.AccountingYear)));
    farmerObs.forEach((r) => r.AccountingYear && set.add(String(r.AccountingYear)));
    defects.forEach((r) => {
      if (r.OrderDate) set.add(String(r.OrderDate).slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [coopObs, farmerObs, defects]);

  const coopNames = useMemo(() => {
    const set = new Set<string>();
    coopObs.forEach((r) => r.CooperativeName && set.add(r.CooperativeName));
    defects.forEach((r) => r.CooperativeName && set.add(r.CooperativeName));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [coopObs, defects]);

  const farmerNames = useMemo(() => {
    const set = new Set<string>();
    farmerObs.forEach((r) => r.FarmerGroupName && set.add(r.FarmerGroupName));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'));
  }, [farmerObs]);

  const filtered = useMemo(() => {
    const fCoop =
      typeFilter === 'FARMER' || typeFilter === 'DEFECT'
        ? []
        : coopObs.filter((r) => {
            if (yearFilter !== 'ALL' && String(r.AccountingYear) !== yearFilter) return false;
            if (coopNameFilter !== 'ALL' && r.CooperativeName !== coopNameFilter) return false;
            if (statusFilter !== 'ALL' && r.Status !== statusFilter) return false;
            return true;
          });

    const fFarmer =
      typeFilter === 'COOP' || typeFilter === 'DEFECT'
        ? []
        : farmerObs.filter((r) => {
            if (yearFilter !== 'ALL' && String(r.AccountingYear) !== yearFilter) return false;
            if (farmerNameFilter !== 'ALL' && r.FarmerGroupName !== farmerNameFilter) return false;
            if (statusFilter !== 'ALL' && r.Status !== statusFilter) return false;
            return true;
          });

    const fDefects =
      typeFilter === 'COOP' || typeFilter === 'FARMER'
        ? []
        : defects.filter((r) => {
            if (yearFilter !== 'ALL' && (!r.OrderDate || !String(r.OrderDate).startsWith(yearFilter))) {
              return false;
            }
            if (coopNameFilter !== 'ALL' && r.CooperativeName !== coopNameFilter) return false;
            if (statusFilter !== 'ALL' && r.DefectStatus !== statusFilter) return false;
            return true;
          });

    return { fCoop, fFarmer, fDefects };
  }, [coopObs, farmerObs, defects, yearFilter, typeFilter, coopNameFilter, farmerNameFilter, statusFilter]);

  const kpis = useMemo(() => {
    const uniqueCoops = new Set<string>();
    filtered.fCoop.forEach((r) => r.CooperativeName && uniqueCoops.add(r.CooperativeName));
    filtered.fDefects.forEach((r) => r.CooperativeName && uniqueCoops.add(r.CooperativeName));

    const uniqueFarmers = new Set<string>();
    filtered.fFarmer.forEach((r) => r.FarmerGroupName && uniqueFarmers.add(r.FarmerGroupName));

    const allObs = [...filtered.fCoop, ...filtered.fFarmer];
    const completedObs = allObs.filter((r) => r.Status === 'แก้ไขเสร็จสิ้น').length;
    const inProgressObs = allObs.filter((r) => r.Status === 'อยู่ระหว่างดำเนินการ').length;

    const completedDefects = filtered.fDefects.filter((r) => r.DefectStatus === 'แก้ไขเสร็จสิ้น').length;
    const inProgressDefects = filtered.fDefects.filter((r) => r.DefectStatus !== 'แก้ไขเสร็จสิ้น').length;

    return {
      totalCooperatives: uniqueCoops.size,
      totalFarmerGroups: uniqueFarmers.size,
      totalCoopObservations: filtered.fCoop.length,
      totalFarmerObservations: filtered.fFarmer.length,
      completedObservations: completedObs,
      inProgressObservations: inProgressObs,
      totalDefects: filtered.fDefects.length,
      completedDefects,
      inProgressDefects,
    };
  }, [filtered]);

  // Chart datasets derived strictly from real filtered Google Sheets data
  const coopByEntity = useMemo(() => {
    const map = new Map<string, { name: string; done: number; pending: number }>();
    filtered.fCoop.forEach((r) => {
      const entry = map.get(r.CooperativeName) || { name: r.CooperativeName, done: 0, pending: 0 };
      if (r.Status === 'แก้ไขเสร็จสิ้น') entry.done += 1;
      else entry.pending += 1;
      map.set(r.CooperativeName, entry);
    });
    return Array.from(map.values())
      .sort((a, b) => b.done + b.pending - (a.done + a.pending))
      .slice(0, 8);
  }, [filtered.fCoop]);

  const farmerByEntity = useMemo(() => {
    const map = new Map<string, { name: string; done: number; pending: number }>();
    filtered.fFarmer.forEach((r) => {
      const entry = map.get(r.FarmerGroupName) || { name: r.FarmerGroupName, done: 0, pending: 0 };
      if (r.Status === 'แก้ไขเสร็จสิ้น') entry.done += 1;
      else entry.pending += 1;
      map.set(r.FarmerGroupName, entry);
    });
    return Array.from(map.values())
      .sort((a, b) => b.done + b.pending - (a.done + a.pending))
      .slice(0, 8);
  }, [filtered.fFarmer]);

  const defectStatusCounts = useMemo(() => {
    const counts = {
      'ยังไม่ได้ดำเนินการแก้ไข': 0,
      'อยู่ระหว่างดำเนินการแก้ไข': 0,
      'แก้ไขแล้ว': 0,
      'แก้ไขเสร็จสิ้น': 0,
    };
    filtered.fDefects.forEach((r) => {
      if (r.DefectStatus in counts) {
        counts[r.DefectStatus as keyof typeof counts] += 1;
      }
    });
    return counts;
  }, [filtered.fDefects]);

  const byAccountingYear = useMemo(() => {
    const map = new Map<string, { year: string; coop: number; farmer: number; defect: number }>();
    filtered.fCoop.forEach((r) => {
      const y = String(r.AccountingYear || 'ไม่ระบุ');
      const cur = map.get(y) || { year: y, coop: 0, farmer: 0, defect: 0 };
      cur.coop += 1;
      map.set(y, cur);
    });
    filtered.fFarmer.forEach((r) => {
      const y = String(r.AccountingYear || 'ไม่ระบุ');
      const cur = map.get(y) || { year: y, coop: 0, farmer: 0, defect: 0 };
      cur.farmer += 1;
      map.set(y, cur);
    });
    filtered.fDefects.forEach((r) => {
      const y = r.OrderDate ? String(r.OrderDate).slice(0, 4) : 'ไม่ระบุ';
      const cur = map.get(y) || { year: y, coop: 0, farmer: 0, defect: 0 };
      cur.defect += 1;
      map.set(y, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year));
  }, [filtered]);

  const resetFilters = () => {
    setYearFilter('ALL');
    setTypeFilter('ALL');
    setCoopNameFilter('ALL');
    setFarmerNameFilter('ALL');
    setStatusFilter('ALL');
  };

  if (!isConfigured) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-8 text-center max-w-2xl mx-auto my-8 space-y-4">
        <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-200 text-[#0B3B2C] flex items-center justify-center mx-auto">
          <Database className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-[#0B3B2C]">
          ยังไม่ได้เชื่อมต่อฐานข้อมูล Google Sheets และ Google Drive
        </h2>
        <p className="text-sm text-neutral-600 leading-relaxed">
          ระบบ CO-OP WATCHING SYSTEM จะแสดงข้อมูลจริงจาก Google Sheets เท่านั้น (ไม่มีการแสดงข้อมูลจำลอง)
          กรุณาตั้งค่า Spreadsheet ID และ Google Drive Folder ID หรือใช้ปุ่มสร้างฐานข้อมูลอัตโนมัติในหน้าตั้งค่า
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0B3B2C] text-white text-sm font-semibold hover:bg-[#082c21] transition-colors"
          >
            <Settings className="w-4 h-4 text-[#E5C158]" />
            <span>ไปหน้าตั้งค่าเชื่อมต่อฐานข้อมูล</span>
          </button>
        </div>
      </div>
    );
  }

  const allStatusesForFilter = [
    'แก้ไขเสร็จสิ้น',
    'อยู่ระหว่างดำเนินการ',
    'ยังไม่ได้ดำเนินการแก้ไข',
    'อยู่ระหว่างดำเนินการแก้ไข',
    'แก้ไขแล้ว',
  ];

  const totalObsCount = kpis.completedObservations + kpis.inProgressObservations;
  const obsDonePct = totalObsCount > 0 ? Math.round((kpis.completedObservations / totalObsCount) * 100) : 0;
  const defectDonePct = kpis.totalDefects > 0 ? Math.round((kpis.completedDefects / kpis.totalDefects) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Page Title & Filters */}
      <div className="flex flex-col @3xl:flex-row @3xl:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#9A7409]">
            ภาพรวมข้อมูลจริงจากฐานข้อมูลกลาง Google Sheets
          </p>
          <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">
            Dashboard สรุปผลการติดตามข้อสังเกตและข้อบกพร่อง
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('coop-observations')}
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50 transition-colors whitespace-nowrap"
          >
            จัดการข้อสังเกตสหกรณ์
          </button>
          <button
            type="button"
            onClick={() => onNavigate('farmer-observations')}
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50 transition-colors whitespace-nowrap"
          >
            จัดการข้อสังเกตกลุ่มเกษตรกร
          </button>
          <button
            type="button"
            onClick={() => onNavigate('defects')}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] transition-colors whitespace-nowrap"
          >
            จัดการข้อบกพร่อง
          </button>
        </div>
      </div>

      {/* Configured Multi-Sheet Sources Overview */}
      {data?.sheetSources && data.sheetSources.length > 0 && (
        <section className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#0B3B2C]">
              <Database className="w-4 h-4 text-[#C9A227] shrink-0" />
              <span>แหล่งข้อมูลที่ดึงมาแสดงผลจากแต่ละ Sheet ({data.sheetSources.filter((s) => s.enabled).length} แผ่นงาน)</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B3B2C] hover:text-[#15803D] transition-colors self-start @xl:self-auto"
            >
              <Settings className="w-3.5 h-3.5 text-[#C9A227]" />
              <span>กำหนดค่าดึงข้อมูลแต่ละ Sheet</span>
            </button>
          </div>
          <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-2.5 text-xs">
            {data.sheetSources.map((src) => {
              const moduleText =
                src.moduleType === 'coop'
                  ? 'ข้อสังเกตสหกรณ์'
                  : src.moduleType === 'farmer'
                  ? 'ข้อสังเกตกลุ่มเกษตรกร'
                  : src.moduleType === 'defects'
                  ? 'ข้อบกพร่องสหกรณ์'
                  : src.moduleType === 'system'
                  ? 'ชีทระบบ'
                  : 'ข้าม/ไม่นำมาแสดง';
              return (
                <div
                  key={src.sheetName}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
                    src.enabled
                      ? 'bg-[#F7F9F8] border-neutral-200 text-neutral-800'
                      : 'bg-neutral-50 border-neutral-200/60 text-neutral-400'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-[#0B3B2C] truncate" title={src.sheetName}>
                      {src.sheetName}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {moduleText}
                      {src.accountingYear ? ` · ปี ${src.accountingYear}` : ''}
                    </p>
                  </div>
                  <span className="tabular-nums font-bold text-[#9A7409] shrink-0">
                    {src.enabled ? `${src.rowCount.toLocaleString('th-TH')} รายการ` : 'ปิดอยู่'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Dashboard Filters (Part 3.3) */}
      <section className="bg-white rounded-xl border border-neutral-200 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[#0B3B2C]">
            <Filter className="w-4 h-4 text-[#C9A227]" />
            <span>ตัวกรองข้อมูล Dashboard</span>
          </div>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-[#0B3B2C] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>ล้างตัวกรอง</span>
          </button>
        </div>

        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">ปีบัญชี / ปีคำสั่ง</label>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกปีบัญชี</option>
              {accountingYears.map((y) => (
                <option key={y} value={y}>
                  ปี {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">ประเภทข้อมูล</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทั้งหมด</option>
              <option value="COOP">ข้อสังเกตของสหกรณ์</option>
              <option value="FARMER">ข้อสังเกตของกลุ่มเกษตรกร</option>
              <option value="DEFECT">ข้อบกพร่องของสหกรณ์</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">ชื่อสหกรณ์</label>
            <select
              value={coopNameFilter}
              onChange={(e) => setCoopNameFilter(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกสหกรณ์</option>
              {coopNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">ชื่อกลุ่มเกษตรกร</label>
            <select
              value={farmerNameFilter}
              onChange={(e) => setFarmerNameFilter(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกกลุ่มเกษตรกร</option>
              {farmerNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">สถานะการดำเนินการ</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
            >
              <option value="ALL">ทุกสถานะ</option>
              {allStatusesForFilter.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 9 KPI Summary Cards (Part 3.1) */}
      <section className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 gap-3.5">
        <KpiCard
          label="1. สหกรณ์ที่มีข้อมูลในระบบ"
          value={kpis.totalCooperatives}
          unit="แห่ง"
          icon={<Building2 className="w-5 h-5 text-[#0B3B2C]" />}
          tone="neutral"
        />
        <KpiCard
          label="2. กลุ่มเกษตรกรที่มีข้อมูลในระบบ"
          value={kpis.totalFarmerGroups}
          unit="แห่ง"
          icon={<Sprout className="w-5 h-5 text-[#0B3B2C]" />}
          tone="neutral"
        />
        <KpiCard
          label="3. ข้อสังเกตของสหกรณ์ทั้งหมด"
          value={kpis.totalCoopObservations}
          unit="รายการ"
          icon={<ClipboardCheck className="w-5 h-5 text-[#15803D]" />}
          tone="green"
        />
        <KpiCard
          label="4. ข้อสังเกตของกลุ่มเกษตรกรทั้งหมด"
          value={kpis.totalFarmerObservations}
          unit="รายการ"
          icon={<ClipboardCheck className="w-5 h-5 text-[#15803D]" />}
          tone="green"
        />
        <KpiCard
          label="5. ข้อสังเกตที่แก้ไขเสร็จสิ้น"
          value={kpis.completedObservations}
          unit="รายการ"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-700" />}
          tone="emerald"
        />
        <KpiCard
          label="6. ข้อสังเกตที่อยู่ระหว่างดำเนินการ"
          value={kpis.inProgressObservations}
          unit="รายการ"
          icon={<Clock className="w-5 h-5 text-orange-600" />}
          tone="amber"
        />
        <KpiCard
          label="7. ข้อบกพร่องทั้งหมด"
          value={kpis.totalDefects}
          unit="รายการ"
          icon={<AlertTriangle className="w-5 h-5 text-[#9A7409]" />}
          tone="gold"
        />
        <KpiCard
          label="8. ข้อบกพร่องที่แก้ไขเสร็จสิ้น"
          value={kpis.completedDefects}
          unit="รายการ"
          icon={<ShieldCheck className="w-5 h-5 text-[#0B3B2C]" />}
          tone="emerald"
        />
        <KpiCard
          label="9. ข้อบกพร่องที่อยู่ระหว่างดำเนินการ"
          value={kpis.inProgressDefects}
          unit="รายการ"
          icon={<Clock className="w-5 h-5 text-red-700" />}
          tone="red"
        />
      </section>

      {/* 5 Analytical Charts (Part 3.2) */}
      <section className="grid grid-cols-1 @3xl:grid-cols-2 gap-4 @2xl:gap-5">
        {/* Chart 1: ข้อสังเกตของสหกรณ์ */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-5">
          <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-[#0B3B2C]">
                กราฟจำนวนข้อสังเกตของสหกรณ์
              </h3>
              <p className="text-xs text-neutral-500">จำแนกตามสหกรณ์และสถานะการดำเนินการ</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-600 shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#15803D]" /> เสร็จสิ้น
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> ระหว่างดำเนินการ
              </span>
            </div>
          </div>
          <HorizontalStackedBarChart items={coopByEntity} emptyText="ยังไม่มีข้อมูลข้อสังเกตของสหกรณ์" />
        </div>

        {/* Chart 2: ข้อสังเกตของกลุ่มเกษตรกร */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-5">
          <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-[#0B3B2C]">
                กราฟจำนวนข้อสังเกตของกลุ่มเกษตรกร
              </h3>
              <p className="text-xs text-neutral-500">จำแนกตามกลุ่มเกษตรกรและสถานะการดำเนินการ</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-neutral-600 shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#15803D]" /> เสร็จสิ้น
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> ระหว่างดำเนินการ
              </span>
            </div>
          </div>
          <HorizontalStackedBarChart items={farmerByEntity} emptyText="ยังไม่มีข้อมูลข้อสังเกตของกลุ่มเกษตรกร" />
        </div>

        {/* Chart 3: จำนวนข้อบกพร่อง */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-[#0B3B2C]">
              กราฟจำนวนข้อบกพร่องแยกตามสถานะ
            </h3>
            <p className="text-xs text-neutral-500">
              แสดงจำนวนข้อบกพร่องทั้ง 4 สถานะตามคำสั่งแก้ไข
            </p>
          </div>
          <DefectStatusChart counts={defectStatusCounts} total={kpis.totalDefects} />
        </div>

        {/* Chart 4: เปรียบเทียบสถานะการแก้ไข */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-[#0B3B2C]">
              กราฟเปรียบเทียบสถานะการแก้ไขภาพรวม
            </h3>
            <p className="text-xs text-neutral-500">
              ร้อยละความคืบหน้าการแก้ไขข้อสังเกตเทียบกับข้อบกพร่อง
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 @xl:gap-6 py-2">
            <DonutStat
              title="ข้อสังเกตรวม"
              completed={kpis.completedObservations}
              pending={kpis.inProgressObservations}
              percent={obsDonePct}
              accentColor="#15803D"
            />
            <DonutStat
              title="ข้อบกพร่อง"
              completed={kpis.completedDefects}
              pending={kpis.inProgressDefects}
              percent={defectDonePct}
              accentColor="#0B3B2C"
            />
          </div>
        </div>
      </section>

      {/* Chart 5: สรุปข้อมูลแยกตามปีบัญชี */}
      <section className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-5">
        <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-2 mb-5">
          <div>
            <h3 className="text-base font-bold text-[#0B3B2C]">
              กราฟสรุปข้อมูลแยกตามปีบัญชี
            </h3>
            <p className="text-xs text-neutral-500">
              เปรียบเทียบจำนวนข้อสังเกตสหกรณ์ ข้อสังเกตกลุ่มเกษตรกร และข้อบกพร่องในแต่ละปี
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#0B3B2C]" /> ข้อสังเกตสหกรณ์
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#16A34A]" /> ข้อสังเกตกลุ่มเกษตรกร
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#C9A227]" /> ข้อบกพร่อง
            </span>
          </div>
        </div>
        <AccountingYearBarChart rows={byAccountingYear} />
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  icon,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  tone: 'neutral' | 'green' | 'emerald' | 'amber' | 'gold' | 'red';
}) {
  const iconBgMap: Record<typeof tone, string> = {
    neutral: 'bg-neutral-100 border-neutral-200',
    green: 'bg-emerald-50 border-emerald-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    amber: 'bg-orange-50 border-orange-200',
    gold: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center justify-between gap-4 hover:border-[#C9A227]/70 transition-colors">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-neutral-600 truncate">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-1.5">
          <span className="text-2xl font-bold text-[#0B3B2C] tabular-nums">
            {value.toLocaleString('th-TH')}
          </span>
          <span className="text-xs font-medium text-neutral-500">{unit}</span>
        </div>
      </div>
      <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${iconBgMap[tone]}`}>
        {icon}
      </div>
    </div>
  );
}

function HorizontalStackedBarChart({
  items,
  emptyText,
}: {
  items: Array<{ name: string; done: number; pending: number }>;
  emptyText: string;
}) {
  if (items.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-xs text-neutral-500 bg-[#F7F9F8] rounded-lg border border-dashed border-neutral-200">
        {emptyText}
      </div>
    );
  }
  const maxVal = Math.max(...items.map((i) => i.done + i.pending), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const total = item.done + item.pending;
        const doneWidth = (item.done / maxVal) * 100;
        const pendingWidth = (item.pending / maxVal) * 100;
        return (
          <div key={item.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="font-medium text-neutral-800 truncate" title={item.name}>
                {item.name}
              </span>
              <span className="font-semibold text-[#0B3B2C] tabular-nums shrink-0">
                {total} รายการ ({item.done}/{total})
              </span>
            </div>
            <div className="h-3.5 w-full bg-neutral-100 rounded overflow-hidden flex">
              {item.done > 0 && (
                <div
                  style={{ width: `${doneWidth}%` }}
                  className="bg-[#15803D] h-full transition-all duration-300"
                  title={`แก้ไขเสร็จสิ้น: ${item.done}`}
                />
              )}
              {item.pending > 0 && (
                <div
                  style={{ width: `${pendingWidth}%` }}
                  className="bg-orange-500 h-full transition-all duration-300"
                  title={`อยู่ระหว่างดำเนินการ: ${item.pending}`}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DefectStatusChart({
  counts,
  total,
}: {
  counts: Record<string, number>;
  total: number;
}) {
  if (total === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-xs text-neutral-500 bg-[#F7F9F8] rounded-lg border border-dashed border-neutral-200">
        ยังไม่มีข้อมูลข้อบกพร่องในระบบ
      </div>
    );
  }

  const rows = [
    { label: 'ยังไม่ได้ดำเนินการแก้ไข', count: counts['ยังไม่ได้ดำเนินการแก้ไข'], color: '#B91C1C' },
    { label: 'อยู่ระหว่างดำเนินการแก้ไข', count: counts['อยู่ระหว่างดำเนินการแก้ไข'], color: '#EA580C' },
    { label: 'แก้ไขแล้ว', count: counts['แก้ไขแล้ว'], color: '#65A30D' },
    { label: 'แก้ไขเสร็จสิ้น', count: counts['แก้ไขเสร็จสิ้น'], color: '#0B3B2C' },
  ];

  return (
    <div className="space-y-3.5 py-2">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-800">{r.label}</span>
              <span className="font-bold tabular-nums text-neutral-900">
                {r.count} รายการ ({pct}%)
              </span>
            </div>
            <div className="h-3.5 w-full bg-neutral-100 rounded overflow-hidden">
              <div
                style={{ width: `${pct}%`, backgroundColor: r.color }}
                className="h-full transition-all duration-300 rounded-r"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutStat({
  title,
  completed,
  pending,
  percent,
  accentColor,
}: {
  title: string;
  completed: number;
  pending: number;
  percent: number;
  accentColor: string;
}) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-3 @lg:p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200">
      <div className="relative w-24 h-24 @lg:w-28 @lg:h-28">
        <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="12"
          />
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke={accentColor}
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[#0B3B2C] tabular-nums">{percent}%</span>
          <span className="text-[10px] font-medium text-neutral-500">เสร็จสิ้น</span>
        </div>
      </div>
      <p className="text-sm font-bold text-[#0B3B2C] mt-3">{title}</p>
      <div className="flex items-center gap-3 text-xs text-neutral-600 mt-1 tabular-nums">
        <span>เสร็จสิ้น: {completed}</span>
        <span>·</span>
        <span>คงค้าง: {pending}</span>
      </div>
    </div>
  );
}

function AccountingYearBarChart({
  rows,
}: {
  rows: Array<{ year: string; coop: number; farmer: number; defect: number }>;
}) {
  if (rows.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-xs text-neutral-500 bg-[#F7F9F8] rounded-lg border border-dashed border-neutral-200">
        ยังไม่มีข้อมูลแยกตามปีบัญชี
      </div>
    );
  }

  const maxVal = Math.max(...rows.flatMap((r) => [r.coop, r.farmer, r.defect]), 1);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[320px] flex items-end justify-around gap-4 @lg:gap-6 h-56 pt-6 pb-2 px-2 @lg:px-4 border-b border-neutral-200">
        {rows.map((row) => (
          <div key={row.year} className="flex flex-col items-center gap-2 flex-1 max-w-[140px]">
            <div className="w-full h-40 flex items-end justify-center gap-1.5">
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[10px] font-bold text-[#0B3B2C] tabular-nums">{row.coop}</span>
                <div
                  style={{ height: `${Math.max((row.coop / maxVal) * 120, row.coop > 0 ? 8 : 2)}px` }}
                  className="w-full max-w-[22px] bg-[#0B3B2C] rounded-t transition-all"
                  title={`ข้อสังเกตสหกรณ์: ${row.coop}`}
                />
              </div>
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[10px] font-bold text-[#15803D] tabular-nums">{row.farmer}</span>
                <div
                  style={{ height: `${Math.max((row.farmer / maxVal) * 120, row.farmer > 0 ? 8 : 2)}px` }}
                  className="w-full max-w-[22px] bg-[#16A34A] rounded-t transition-all"
                  title={`ข้อสังเกตกลุ่มเกษตรกร: ${row.farmer}`}
                />
              </div>
              <div className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[10px] font-bold text-[#9A7409] tabular-nums">{row.defect}</span>
                <div
                  style={{ height: `${Math.max((row.defect / maxVal) * 120, row.defect > 0 ? 8 : 2)}px` }}
                  className="w-full max-w-[22px] bg-[#C9A227] rounded-t transition-all"
                  title={`ข้อบกพร่อง: ${row.defect}`}
                />
              </div>
            </div>
            <span className="text-xs font-bold text-neutral-700 tabular-nums">ปี {row.year}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
