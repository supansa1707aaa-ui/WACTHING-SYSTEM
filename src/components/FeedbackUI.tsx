import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';

export function LoadingOverlay({ visible, message = 'กำลังประมวลผลและเชื่อมต่อฐานข้อมูล Google Sheets...' }: { visible: boolean; message?: string }) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B3B2C]/35 backdrop-blur-[1px]">
      <div className="bg-white border border-neutral-200 rounded-xl shadow-xl px-6 py-5 flex items-center gap-3.5 max-w-sm mx-4">
        <Loader2 className="w-6 h-6 text-[#0B3B2C] animate-spin shrink-0" />
        <div>
          <p className="text-sm font-bold text-[#0B3B2C]">กรุณารอสักครู่</p>
          <p className="text-xs text-neutral-600 mt-0.5">{message}</p>
        </div>
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-16 lg:bottom-5 right-4 sm:right-5 z-[70] flex flex-col gap-2.5 max-w-md w-[calc(100vw-2rem)] sm:w-auto no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border ${
            t.type === 'success'
              ? 'bg-[#0B3B2C] text-white border-[#C9A227]/60'
              : 'bg-red-800 text-white border-red-900'
          }`}
        >
          {t.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-[#E5C158] shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-200 shrink-0 mt-0.5" />
          )}
          <p className="text-sm font-medium flex-1 leading-snug">{t.text}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
            aria-label="ปิดการแจ้งเตือน"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
