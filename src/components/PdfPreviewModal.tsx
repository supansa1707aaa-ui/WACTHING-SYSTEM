import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { coopApi } from '../services/api';

interface PdfPreviewModalProps {
  file: { fileId: string; fileName: string } | null;
  onClose: () => void;
}

export function PdfPreviewModal({ file, onClose }: PdfPreviewModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activeUrl: string | null = null;
    if (!file) {
      setBlobUrl(null);
      return;
    }

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const blob = await coopApi.fetchAttachmentBlob(file.fileId, file.fileName, 'inline');
        activeUrl = URL.createObjectURL(blob);
        setBlobUrl(activeUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดเอกสาร PDF ได้');
      } finally {
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [file]);

  if (!file) return null;

  const handleDownload = async () => {
    try {
      const blob = await coopApi.fetchAttachmentBlob(file.fileId, file.fileName, 'download');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดาวน์โหลดเอกสารไม่สำเร็จ');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl h-[88vh] flex flex-col bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0B3B2C] text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 text-[#E5C158] shrink-0" />
            <h3 className="text-sm font-semibold truncate">{file.fileName}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#C9A227] text-[#0B3B2C] hover:bg-[#dfb93d] transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ดาวน์โหลด PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="ปิดตัวอย่างเอกสาร"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-neutral-100 relative">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-600">
              <Loader2 className="w-7 h-7 animate-spin text-[#0B3B2C]" />
              <span className="text-sm font-medium">กำลังโหลดเอกสาร PDF จาก Google Drive...</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md rounded-xl bg-white border border-red-200 p-5 text-center space-y-2">
                <p className="text-sm font-semibold text-red-700">{error}</p>
                <p className="text-xs text-neutral-600">
                  ตรวจสอบสิทธิ์การเข้าถึงโฟลเดอร์ Google Drive ของบัญชีผู้ใช้งานปัจจุบัน
                </p>
              </div>
            </div>
          )}
          {!loading && !error && blobUrl && (
            <iframe
              src={blobUrl}
              title={file.fileName}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
