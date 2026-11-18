import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, FileBarChart2, RotateCcw } from 'lucide-react';
import {
  EMBLEM_URL,
  type CooperativeObservation,
  type DefectRecord,
  type FarmerGroupObservation,
} from '../types/coop';
import { ObservationStatusBadge, DefectStatusBadge } from './StatusBadge';
import { exportToExcel, formatThaiDate } from '../utils/exportUtils';

interface ReportsViewProps {
  coopObservations: CooperativeObservation[];
  farmerObservations: FarmerGroupObservation[];
  defects: DefectRecord[];
}

type ReportCategory = 'OBSERVATION' | 'DEFECT';
type ObsReportType =
  | 'OBS_COOP'
  | 'OBS_FARMER'
  | 'OBS_BY_YEAR'
  | 'OBS_BY_ENTITY'
  | 'OBS_COMPLETED'
  | 'OBS_IN_PROGRESS';

type DefectReportType =
  | 'DEF_ALL'
  | 'DEF_BY_COOP'
  | 'DEF_BY_ORDER'
  | 'DEF_BY_STATUS'
  | 'DEF_UNRESOLVED'
  | 'DEF_COMPLETED';

export function ReportsView({
  coopObservations,
  farmerObservations,
  defects,
}: ReportsViewProps) {
  const [category, setCategory] = useState<ReportCategory>('OBSERVATION');
  const [obsReportType, setObsReportType] = useState<ObsReportType>('OBS_COOP');
  const [defectReportType, setDefectReportType] = useState<DefectReportType>('DEF_ALL');

  const [selectedYear, setSelectedYear] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState('ALL');
  const [selectedOrder, setSelectedOrder] = useState('ALL');
  const [selectedDefectStatus, setSelectedDefectStatus] = useState('ALL');

  const availableYears = useMemo(() => {
    const s = new Set<string>();
    coopObservations.forEach((r) => r.AccountingYear && s.add(String(r.AccountingYear)));
    farmerObservations.forEach((r) => r.AccountingYear && s.add(String(r.AccountingYear)));
    defects.forEach((r) => r.OrderDate && s.add(String(r.OrderDate).slice(0, 4)));
    return Array.from(s).sort().reverse();
  }, [coopObservations, farmerObservations, defects]);

  const availableEntities = useMemo(() => {
    const s = new Set<string>();
    if (category === 'OBSERVATION') {
      coopObservations.forEach((r) => r.CooperativeName && s.add(r.CooperativeName));
      farmerObservations.forEach((r) => r.FarmerGroupName && s.add(r.FarmerGroupName));
    } else {
      defects.forEach((r) => r.CooperativeName && s.add(r.CooperativeName));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'th'));
  }, [category, coopObservations, farmerObservations, defects]);

  const availableOrders = useMemo(() => {
    const s = new Set<string>();
    defects.forEach((r) => r.OrderNumber && s.add(r.OrderNumber));
    return Array.from(s).sort();
  }, [defects]);

  const observationRows = useMemo(() => {
    type UnifiedObsRow = {
      id: string;
      groupType: 'สหกรณ์' | 'กลุ่มเกษตรกร';
      entityName: string;
      year: string;
      issueCount: number;
      details: string;
      guidelines: string;
      status: string;
    };

    const coopList: UnifiedObsRow[] = coopObservations.map((r) => ({
      id: r.ID,
      groupType: 'สหกรณ์',
      entityName: r.CooperativeName,
      year: String(r.AccountingYear),
      issueCount: Number(r.IssueCount || 0),
      details: r.ObservationDetails,
      guidelines: r.CorrectionGuidelines,
      status: r.Status,
    }));

    const farmerList: UnifiedObsRow[] = farmerObservations.map((r) => ({
      id: r.ID,
      groupType: 'กลุ่มเกษตรกร',
      entityName: r.FarmerGroupName,
      year: String(r.AccountingYear),
      issueCount: Number(r.IssueCount || 0),
      details: r.ObservationDetails,
      guidelines: r.CorrectionGuidelines,
      status: r.Status,
    }));

    let combined = [...coopList, ...farmerList];

    if (obsReportType === 'OBS_COOP') combined = coopList;
    if (obsReportType === 'OBS_FARMER') combined = farmerList;
    if (obsReportType === 'OBS_COMPLETED') combined = combined.filter((r) => r.status === 'แก้ไขเสร็จสิ้น');
    if (obsReportType === 'OBS_IN_PROGRESS') {
      combined = combined.filter((r) => r.status === 'อยู่ระหว่างดำเนินการ');
    }

    if (selectedYear !== 'ALL') combined = combined.filter((r) => r.year === selectedYear);
    if (selectedEntity !== 'ALL') combined = combined.filter((r) => r.entityName === selectedEntity);

    if (obsReportType === 'OBS_BY_YEAR') {
      combined.sort((a, b) => b.year.localeCompare(a.year) || a.entityName.localeCompare(b.entityName, 'th'));
    } else if (obsReportType === 'OBS_BY_ENTITY') {
      combined.sort((a, b) => a.entityName.localeCompare(b.entityName, 'th'));
    }

    return combined;
  }, [coopObservations, farmerObservations, obsReportType, selectedYear, selectedEntity]);

  const defectRows = useMemo(() => {
    let list = [...defects];

    if (defectReportType === 'DEF_UNRESOLVED') {
      list = list.filter((r) => r.DefectStatus === 'ยังไม่ได้ดำเนินการแก้ไข');
    } else if (defectReportType === 'DEF_COMPLETED') {
      list = list.filter((r) => r.DefectStatus === 'แก้ไขเสร็จสิ้น');
    }

    if (selectedYear !== 'ALL') {
      list = list.filter((r) => r.OrderDate && String(r.OrderDate).startsWith(selectedYear));
    }
    if (selectedEntity !== 'ALL') {
      list = list.filter((r) => r.CooperativeName === selectedEntity);
    }
    if (selectedOrder !== 'ALL') {
      list = list.filter((r) => r.OrderNumber === selectedOrder);
    }
    if (selectedDefectStatus !== 'ALL') {
      list = list.filter((r) => r.DefectStatus === selectedDefectStatus);
    }

    if (defectReportType === 'DEF_BY_COOP') {
      list.sort((a, b) => a.CooperativeName.localeCompare(b.CooperativeName, 'th'));
    } else if (defectReportType === 'DEF_BY_ORDER') {
      list.sort((a, b) => a.OrderNumber.localeCompare(b.OrderNumber, 'th'));
    } else if (defectReportType === 'DEF_BY_STATUS') {
      list.sort((a, b) => a.DefectStatus.localeCompare(b.DefectStatus, 'th'));
    }

    return list;
  }, [defects, defectReportType, selectedYear, selectedEntity, selectedOrder, selectedDefectStatus]);

  const reportTitle = useMemo(() => {
    if (category === 'OBSERVATION') {
      const map: Record<ObsReportType, string> = {
        OBS_COOP: 'รายงานข้อสังเกตของสหกรณ์',
        OBS_FARMER: 'รายงานข้อสังเกตของกลุ่มเกษตรกร',
        OBS_BY_YEAR: 'รายงานข้อสังเกตแยกตามปีบัญชี',
        OBS_BY_ENTITY: 'รายงานข้อสังเกตแยกตามชื่อสหกรณ์และกลุ่มเกษตรกร',
        OBS_COMPLETED: 'รายงานข้อสังเกตที่แก้ไขเสร็จสิ้น',
        OBS_IN_PROGRESS: 'รายงานข้อสังเกตที่อยู่ระหว่างดำเนินการ',
      };
      return map[obsReportType];
    }
    const map: Record<DefectReportType, string> = {
      DEF_ALL: 'รายงานข้อบกพร่องทั้งหมด',
      DEF_BY_COOP: 'รายงานข้อบกพร่องแยกตามชื่อสหกรณ์',
      DEF_BY_ORDER: 'รายงานข้อบกพร่องแยกตามเลขที่คำสั่ง',
      DEF_BY_STATUS: 'รายงานข้อบกพร่องแยกตามสถานะ',
      DEF_UNRESOLVED: 'รายงานข้อบกพร่องที่ยังไม่ได้แก้ไข',
      DEF_COMPLETED: 'รายงานข้อบกพร่องที่แก้ไขเสร็จสิ้น',
    };
    return map[defectReportType];
  }, [category, obsReportType, defectReportType]);

  const handleExportExcel = () => {
    if (category === 'OBSERVATION') {
      exportToExcel(
        observationRows,
        [
          { header: 'ที่', value: (_r, idx) => idx + 1, width: 8 },
          { header: 'ประเภท', value: (r) => r.groupType, width: 16 },
          { header: 'ชื่อสหกรณ์ / กลุ่มเกษตรกร', value: (r) => r.entityName, width: 32 },
          { header: 'ปีบัญชี', value: (r) => r.year, width: 12 },
          { header: 'จำนวนประเด็น', value: (r) => r.issueCount, width: 14 },
          { header: 'ข้อสังเกตที่ตรวจพบ', value: (r) => r.details, width: 45 },
          { header: 'แนวทางการแก้ไข', value: (r) => r.guidelines, width: 45 },
          { header: 'สถานะการดำเนินการ', value: (r) => r.status, width: 22 },
        ],
        reportTitle,
        'Report_Observations',
        reportTitle
      );
    } else {
      exportToExcel(
        defectRows,
        [
          { header: 'ที่', value: (_r, idx) => idx + 1, width: 8 },
          { header: 'ชื่อสหกรณ์', value: (r) => r.CooperativeName, width: 30 },
          { header: 'เลขที่คำสั่ง', value: (r) => r.OrderNumber, width: 18 },
          { header: 'สั่ง ณ วันที่', value: (r) => r.OrderDate, width: 16 },
          { header: 'รายละเอียดประเด็นข้อบกพร่อง', value: (r) => r.DefectDetails, width: 45 },
          { header: 'ผลการแก้ไข', value: (r) => r.CorrectionResults, width: 45 },
          { header: 'สถานะข้อบกพร่อง', value: (r) => r.DefectStatus, width: 24 },
        ],
        reportTitle,
        'Report_Defects',
        reportTitle
      );
    }
  };

  const todayFormatted = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const activeCount = category === 'OBSERVATION' ? observationRows.length : defectRows.length;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col @3xl:flex-row @3xl:items-center justify-between gap-3 @2xl:gap-4 no-print">
        <div>
          <p className="text-xs font-semibold text-[#9A7409]">สำหรับผู้บริหารและเจ้าหน้าที่</p>
          <h2 className="text-xl @2xl:text-2xl font-bold text-[#0B3B2C] mt-0.5">ระบบรายงานทางการ</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={activeCount === 0}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg border border-emerald-700/30 bg-white text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ส่งออก Excel</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={activeCount === 0}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Printer className="w-4 h-4 text-[#E5C158]" />
            <span>ส่งออก PDF / พิมพ์รายงาน</span>
          </button>
        </div>
      </div>

      {/* Report Configuration Controls */}
      <section className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-5 space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F7F9F8] rounded-lg border border-neutral-200">
            <button
              type="button"
              onClick={() => {
                setCategory('OBSERVATION');
                setSelectedEntity('ALL');
              }}
              className={`min-h-[38px] px-3.5 py-2 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                category === 'OBSERVATION'
                  ? 'bg-[#0B3B2C] text-white shadow-sm'
                  : 'text-neutral-700 hover:text-[#0B3B2C]'
              }`}
            >
              รายงานข้อสังเกต (6 รูปแบบ)
            </button>
            <button
              type="button"
              onClick={() => {
                setCategory('DEFECT');
                setSelectedEntity('ALL');
              }}
              className={`min-h-[38px] px-3.5 py-2 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                category === 'DEFECT'
                  ? 'bg-[#0B3B2C] text-white shadow-sm'
                  : 'text-neutral-700 hover:text-[#0B3B2C]'
              }`}
            >
              รายงานข้อบกพร่อง (6 รูปแบบ)
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedYear('ALL');
              setSelectedEntity('ALL');
              setSelectedOrder('ALL');
              setSelectedDefectStatus('ALL');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-[#0B3B2C]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>รีเซ็ตตัวกรองรายงาน</span>
          </button>
        </div>

        <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-4 gap-3">
          <div className="@xl:col-span-2">
            <label className="block text-xs font-bold text-[#0B3B2C] mb-1">ประเภทรายงานที่ต้องการ</label>
            {category === 'OBSERVATION' ? (
              <select
                value={obsReportType}
                onChange={(e) => setObsReportType(e.target.value as ObsReportType)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
              >
                <option value="OBS_COOP">1. รายงานข้อสังเกตของสหกรณ์</option>
                <option value="OBS_FARMER">2. รายงานข้อสังเกตของกลุ่มเกษตรกร</option>
                <option value="OBS_BY_YEAR">3. รายงานแยกตามปีบัญชี</option>
                <option value="OBS_BY_ENTITY">4. รายงานแยกตามชื่อสหกรณ์และกลุ่มเกษตรกร</option>
                <option value="OBS_COMPLETED">5. รายงานข้อสังเกตที่แก้ไขเสร็จสิ้น</option>
                <option value="OBS_IN_PROGRESS">6. รายงานข้อสังเกตที่อยู่ระหว่างดำเนินการ</option>
              </select>
            ) : (
              <select
                value={defectReportType}
                onChange={(e) => setDefectReportType(e.target.value as DefectReportType)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0B3B2C]/30"
              >
                <option value="DEF_ALL">1. รายงานข้อบกพร่องทั้งหมด</option>
                <option value="DEF_BY_COOP">2. รายงานแยกตามชื่อสหกรณ์</option>
                <option value="DEF_BY_ORDER">3. รายงานแยกตามเลขที่คำสั่ง</option>
                <option value="DEF_BY_STATUS">4. รายงานแยกตามสถานะ</option>
                <option value="DEF_UNRESOLVED">5. รายงานข้อบกพร่องที่ยังไม่ได้แก้ไข</option>
                <option value="DEF_COMPLETED">6. รายงานข้อบกพร่องที่แก้ไขเสร็จสิ้น</option>
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0B3B2C] mb-1">ปีบัญชี / ปีคำสั่ง</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">ทุกปีบัญชี</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  ปี {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#0B3B2C] mb-1">
              {category === 'OBSERVATION' ? 'สหกรณ์ / กลุ่มเกษตรกร' : 'ชื่อสหกรณ์'}
            </label>
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">ทั้งหมด</option>
              {availableEntities.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {category === 'DEFECT' && (
            <>
              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">เลขที่คำสั่ง</label>
                <select
                  value={selectedOrder}
                  onChange={(e) => setSelectedOrder(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">ทุกคำสั่ง</option>
                  {availableOrders.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0B3B2C] mb-1">สถานะข้อบกพร่อง</label>
                <select
                  value={selectedDefectStatus}
                  onChange={(e) => setSelectedDefectStatus(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">ทุกสถานะ</option>
                  <option value="ยังไม่ได้ดำเนินการแก้ไข">ยังไม่ได้ดำเนินการแก้ไข</option>
                  <option value="อยู่ระหว่างดำเนินการแก้ไข">อยู่ระหว่างดำเนินการแก้ไข</option>
                  <option value="แก้ไขแล้ว">แก้ไขแล้ว</option>
                  <option value="แก้ไขเสร็จสิ้น">แก้ไขเสร็จสิ้น</option>
                </select>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Formal Executive Report Document Preview */}
      <section className="bg-white rounded-xl border border-neutral-200 p-4 @xl:p-8 print-container space-y-5">
        <div className="flex flex-col @xl:flex-row @xl:items-center justify-between gap-4 border-b-2 border-[#0B3B2C] pb-4">
          <div className="flex items-center gap-3 @xl:gap-4">
            <img
              src={EMBLEM_URL}
              alt="ตราสำนักงานสหกรณ์จังหวัดชัยนาท"
              referrerPolicy="no-referrer"
              className="w-12 h-12 @xl:w-14 @xl:h-14 object-contain border border-[#C9A227] rounded-lg p-1 bg-white shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#9A7409]">
                CO-OP WATCHING SYSTEM · สำนักงานสหกรณ์จังหวัดชัยนาท
              </p>
              <h3 className="text-lg @xl:text-xl font-bold text-[#0B3B2C] mt-0.5">{reportTitle}</h3>
              <p className="text-xs text-neutral-600 mt-0.5">
                วันที่จัดทำรายงาน: {todayFormatted} · ปีบัญชี:{' '}
                {selectedYear === 'ALL' ? 'ทั้งหมด' : selectedYear}
              </p>
            </div>
          </div>
          <div className="text-left @xl:text-right text-xs text-neutral-700 tabular-nums shrink-0">
            <p className="font-bold text-[#0B3B2C] text-sm">รวมทั้งสิ้น {activeCount} รายการ</p>
            {category === 'OBSERVATION' && (
              <p className="text-neutral-600">
                จำนวนประเด็นรวม:{' '}
                {observationRows.reduce((acc, r) => acc + r.issueCount, 0).toLocaleString('th-TH')} ประเด็น
              </p>
            )}
          </div>
        </div>

        {activeCount === 0 ? (
          <div className="py-12 text-center text-neutral-500">
            <FileBarChart2 className="w-10 h-10 mx-auto text-neutral-300 mb-2" />
            <p className="text-sm font-semibold text-neutral-700">ไม่พบข้อมูลตามเงื่อนไขรายงานที่เลือก</p>
          </div>
        ) : category === 'OBSERVATION' ? (
          <>
            {/* Mobile Report Cards */}
            <div className="block @3xl:hidden no-print divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
              {observationRows.map((row, idx) => (
                <article key={row.id} className="p-3.5 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-neutral-500 tabular-nums">
                        #{idx + 1} · {row.groupType} · ปี {row.year} ·{' '}
                        <strong className="text-[#0B3B2C]">{row.issueCount} ประเด็น</strong>
                      </p>
                      <h4 className="text-sm font-bold text-[#0B3B2C] mt-0.5">{row.entityName}</h4>
                    </div>
                    <ObservationStatusBadge status={row.status} />
                  </div>
                  <div>
                    <p className="font-bold text-[#0B3B2C]">ข้อสังเกตที่ตรวจพบ</p>
                    <p className="text-neutral-800 whitespace-pre-wrap leading-relaxed mt-0.5">
                      {row.details}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-neutral-100">
                    <p className="font-bold text-[#0B3B2C]">แนวทางการแก้ไข</p>
                    <p className="text-neutral-700 whitespace-pre-wrap leading-relaxed mt-0.5">
                      {row.guidelines}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden @3xl:block print-block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B3B2C] text-white text-xs font-bold">
                    <th className="py-2.5 px-3 w-12 text-center">ที่</th>
                    <th className="py-2.5 px-3 w-28">ประเภท</th>
                    <th className="py-2.5 px-3 w-48">ชื่อสหกรณ์ / กลุ่มเกษตรกร</th>
                    <th className="py-2.5 px-3 w-20 text-center">ปีบัญชี</th>
                    <th className="py-2.5 px-3 w-24 text-right">ประเด็น</th>
                    <th className="py-2.5 px-3">ข้อสังเกตที่ตรวจพบ</th>
                    <th className="py-2.5 px-3">แนวทางการแก้ไข</th>
                    <th className="py-2.5 px-3 w-36">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 text-xs">
                  {observationRows.map((row, idx) => (
                    <tr key={row.id} className="align-top">
                      <td className="py-2.5 px-3 text-center tabular-nums font-semibold">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-neutral-700">{row.groupType}</td>
                      <td className="py-2.5 px-3 font-semibold text-[#0B3B2C]">{row.entityName}</td>
                      <td className="py-2.5 px-3 text-center tabular-nums">{row.year}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold">{row.issueCount}</td>
                      <td className="py-2.5 px-3 whitespace-pre-wrap leading-relaxed">{row.details}</td>
                      <td className="py-2.5 px-3 whitespace-pre-wrap leading-relaxed">{row.guidelines}</td>
                      <td className="py-2.5 px-3">
                        <ObservationStatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Mobile Report Cards (Defects) */}
            <div className="block @3xl:hidden no-print divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
              {defectRows.map((row, idx) => (
                <article key={row.ID} className="p-3.5 space-y-2.5 text-xs">
                  <div className="space-y-1">
                    <p className="text-neutral-500 tabular-nums">
                      #{idx + 1} · คำสั่ง {row.OrderNumber} · {formatThaiDate(row.OrderDate)}
                    </p>
                    <h4 className="text-sm font-bold text-[#0B3B2C]">{row.CooperativeName}</h4>
                  </div>
                  <div>
                    <DefectStatusBadge status={row.DefectStatus} />
                  </div>
                  <div>
                    <p className="font-bold text-[#0B3B2C]">รายละเอียดประเด็นข้อบกพร่อง</p>
                    <p className="text-neutral-800 whitespace-pre-wrap leading-relaxed mt-0.5">
                      {row.DefectDetails}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-neutral-100">
                    <p className="font-bold text-[#0B3B2C]">ผลการแก้ไข</p>
                    <p className="text-neutral-700 whitespace-pre-wrap leading-relaxed mt-0.5">
                      {row.CorrectionResults || '-'}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden @3xl:block print-block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B3B2C] text-white text-xs font-bold">
                    <th className="py-2.5 px-3 w-12 text-center">ที่</th>
                    <th className="py-2.5 px-3 w-48">ชื่อสหกรณ์</th>
                    <th className="py-2.5 px-3 w-28">เลขที่คำสั่ง</th>
                    <th className="py-2.5 px-3 w-28">สั่ง ณ วันที่</th>
                    <th className="py-2.5 px-3">รายละเอียดประเด็นข้อบกพร่อง</th>
                    <th className="py-2.5 px-3">ผลการแก้ไข</th>
                    <th className="py-2.5 px-3 w-44">สถานะข้อบกพร่อง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 text-xs">
                  {defectRows.map((row, idx) => (
                    <tr key={row.ID} className="align-top">
                      <td className="py-2.5 px-3 text-center tabular-nums font-semibold">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-semibold text-[#0B3B2C]">{row.CooperativeName}</td>
                      <td className="py-2.5 px-3 font-medium">{row.OrderNumber}</td>
                      <td className="py-2.5 px-3 tabular-nums whitespace-nowrap">
                        {formatThaiDate(row.OrderDate)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-pre-wrap leading-relaxed">{row.DefectDetails}</td>
                      <td className="py-2.5 px-3 whitespace-pre-wrap leading-relaxed">
                        {row.CorrectionResults || '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        <DefectStatusBadge status={row.DefectStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
