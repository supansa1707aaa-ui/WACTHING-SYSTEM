import { CheckCircle2, Clock, AlertCircle, ShieldCheck } from 'lucide-react';
import type { DefectStatus, ObservationStatus } from '../types/coop';

export function ObservationStatusBadge({ status }: { status: ObservationStatus | string }) {
  const isDone = status === 'แก้ไขเสร็จสิ้น';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap border ${
        isDone
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-orange-50 text-orange-800 border-orange-200'
      }`}
    >
      {isDone ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
      ) : (
        <Clock className="w-3.5 h-3.5 text-orange-600 shrink-0" />
      )}
      <span>{status}</span>
    </span>
  );
}

export function DefectStatusBadge({ status }: { status: DefectStatus | string }) {
  switch (status) {
    case 'ยังไม่ได้ดำเนินการแก้ไข':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap bg-red-50 text-red-800 border border-red-200">
          <AlertCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'อยู่ระหว่างดำเนินการแก้ไข':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap bg-orange-50 text-orange-800 border border-orange-200">
          <Clock className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'แก้ไขแล้ว':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap bg-lime-50 text-lime-800 border border-lime-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-lime-700 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'แก้ไขเสร็จสิ้น':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap bg-[#0B3B2C] text-white border border-[#0B3B2C]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#E5C158] shrink-0" />
          <span>{status}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 whitespace-nowrap">
          {status}
        </span>
      );
  }
}
