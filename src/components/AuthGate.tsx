import { ShieldCheck, FileSpreadsheet, FolderLock, BarChart3, Loader2 } from 'lucide-react';
import { EMBLEM_URL } from '../types/coop';

interface AuthGateProps {
  onSignIn: () => void;
  isSigningIn: boolean;
  errorMessage?: string | null;
}

export function AuthGate({ onSignIn, isSigningIn, errorMessage }: AuthGateProps) {
  return (
    <div className="min-h-screen bg-[#F7F9F8] flex flex-col justify-between">
      <div className="h-1.5 w-full bg-gradient-to-r from-[#0B3B2C] via-[#C9A227] to-[#0B3B2C]" />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl bg-white rounded-2xl border border-neutral-200 shadow-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Formal Government Panel */}
          <div className="lg:col-span-6 bg-[#0B3B2C] text-white p-8 flex flex-col justify-between relative overflow-hidden">
            <div className="space-y-5 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-white p-1.5 border-2 border-[#C9A227] shrink-0 flex items-center justify-center">
                  <img
                    src={EMBLEM_URL}
                    alt="ตราสัญลักษณ์สำนักงานสหกรณ์จังหวัดชัยนาท"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-[#E5C158]">
                    สำนักงานสหกรณ์จังหวัดชัยนาท
                  </p>
                  <h1 className="text-xl font-bold tracking-tight text-white mt-0.5">
                    CO-OP WATCHING SYSTEM
                  </h1>
                </div>
              </div>

              <div className="h-px bg-white/15" />

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">
                  ระบบติดตามข้อสังเกตและข้อบกพร่องของสหกรณ์
                </h2>
                <p className="text-sm text-emerald-100/90 leading-relaxed">
                  ฐานข้อมูลกลางสำหรับจัดเก็บ รวบรวม วิเคราะห์ และติดตามผลการแก้ไขข้อสังเกตและข้อบกพร่องของสหกรณ์และกลุ่มเกษตรกรในจังหวัดชัยนาท
                </p>
              </div>

              <ul className="space-y-3 pt-2 text-xs text-emerald-50/90">
                <li className="flex items-start gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-[#E5C158] shrink-0 mt-0.5" />
                  <span>เชื่อมต่อฐานข้อมูล Google Sheets โดยตรง แยกข้อมูลข้อสังเกตสหกรณ์ กลุ่มเกษตรกร และข้อบกพร่องชัดเจน</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <FolderLock className="w-4 h-4 text-[#E5C158] shrink-0 mt-0.5" />
                  <span>จัดเก็บเอกสารแนบ PDF ใน Google Drive ตามสิทธิ์ราชการ ไม่เปิดเป็นสาธารณะ</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <BarChart3 className="w-4 h-4 text-[#E5C158] shrink-0 mt-0.5" />
                  <span>Dashboard ผู้บริหารสรุปผลแบบ Real-time พร้อมระบบรายงาน Excel และ PDF</span>
                </li>
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-white/15 text-xs text-emerald-200/80">
              <span>ระบบฐานข้อมูลกลางเพื่อการกำกับดูแลและพัฒนาสหกรณ์</span>
            </div>
          </div>

          {/* Right Sign-In Panel */}
          <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-center bg-white">
            <div className="space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B3B2C] mb-2">
                  <ShieldCheck className="w-4 h-4 text-[#C9A227]" />
                  <span>ยืนยันตัวตนเจ้าหน้าที่ผู้ปฏิบัติงาน</span>
                </div>
                <h3 className="text-2xl font-bold text-[#0B3B2C]">เข้าสู่ระบบด้วยบัญชี Google</h3>
                <p className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
                  กรุณาลงชื่อเข้าใช้ด้วยบัญชี Google Workspace ที่ได้รับอนุญาต เพื่อเข้าถึงฐานข้อมูล Google Sheets และคลังเอกสาร Google Drive ของหน่วยงาน
                </p>
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 leading-relaxed">
                  {errorMessage}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={isSigningIn}
                  className="gsi-material-button w-full"
                >
                  <div className="gsi-material-button-content-wrapper">
                    {isSigningIn ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[#0B3B2C]" />
                    ) : (
                      <div className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          style={{ display: 'block' }}
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                          <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                      </div>
                    )}
                    <span className="gsi-material-button-contents">
                      {isSigningIn ? 'กำลังยืนยันตัวตน...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#F7F9F8] border border-neutral-200 space-y-1.5 text-xs text-neutral-600">
                <p className="font-semibold text-[#0B3B2C]">การรักษาความปลอดภัยข้อมูล</p>
                <p>
                  ระบบจะตรวจสอบสิทธิ์ผู้ใช้งาน (Admin / Staff) จากฐานข้อมูลกลาง และบันทึกประวัติการดำเนินการทุกครั้งโดยไม่เก็บโทเค็นลับไว้ในเบราว์เซอร์ถาวร
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-4 px-6 text-center text-xs text-neutral-600 space-y-0.5">
        <p className="font-semibold text-[#0B3B2C]">
          พัฒนาระบบโดย กลุ่มตรวจการสหกรณ์ สำนักงานสหกรณ์จังหวัดชัยนาท
        </p>
        <p className="text-[11px] text-neutral-500">
          CO-OP WATCHING SYSTEM · ระบบติดตามข้อสังเกตและข้อบกพร่องของสหกรณ์
        </p>
      </footer>
    </div>
  );
}
