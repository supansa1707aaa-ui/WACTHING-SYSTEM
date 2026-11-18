import { useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  Sprout,
  AlertTriangle,
  FileBarChart2,
  History,
  Users,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  RefreshCw,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { EMBLEM_URL } from '../types/coop';
import type { NavSection, UserProfile } from '../types/coop';

export type ViewportMode = 'desktop' | 'smartphone';

interface LayoutShellProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  user: UserProfile;
  isConfigured: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  viewMode: ViewportMode;
  onChangeViewMode: (mode: ViewportMode) => void;
  children: React.ReactNode;
}

export function LayoutShell({
  activeSection,
  onSelectSection,
  user,
  isConfigured,
  isRefreshing,
  onRefresh,
  onLogout,
  viewMode,
  onChangeViewMode,
  children,
}: LayoutShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [obsOpen, setObsOpen] = useState(true);

  const isSmartphone = viewMode === 'smartphone';

  const handleNav = (section: NavSection) => {
    onSelectSection(section);
    setMobileOpen(false);
  };

  const navContent = (isMobile: boolean) => {
    const isNarrow = !isMobile && collapsed;
    return (
      <div className="flex flex-col h-full bg-[#0B3B2C] text-white select-none">
        {/* Brand Block */}
        <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-white p-1 border border-[#C9A227] shrink-0 flex items-center justify-center">
              <img
                src={EMBLEM_URL}
                alt="ตราสัญลักษณ์"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain rounded"
              />
            </div>
            {!isNarrow && (
              <div className="min-w-0">
                <p className="text-sm font-bold tracking-tight text-white truncate">
                  CO-OP WATCHING
                </p>
                <p className="text-[11px] font-medium text-[#E5C158] truncate">
                  สำนักงานสหกรณ์จังหวัดชัยนาท
                </p>
              </div>
            )}
          </div>
          {isMobile ? (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
              aria-label="ปิดเมนู"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="hidden lg:flex p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              aria-label={collapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
              title={collapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5" aria-label="เมนูหลัก">
          <button
            type="button"
            onClick={() => handleNav('dashboard')}
            className={`w-full flex items-center gap-3 px-3 ${
              isMobile ? 'min-h-[44px] py-2.5' : 'py-2.5'
            } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeSection === 'dashboard'
                ? 'bg-[#155E46] text-white border border-[#C9A227]/60 shadow-sm'
                : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
            }`}
            title="Dashboard ภาพรวม"
          >
            <LayoutDashboard className="w-4 h-4 text-[#E5C158] shrink-0" />
            {!isNarrow && <span className="truncate">Dashboard ภาพรวม</span>}
          </button>

          {/* Menu 1: ข้อสังเกต */}
          <div className="pt-2">
            {!isNarrow ? (
              <>
                <button
                  type="button"
                  onClick={() => setObsOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3 py-2 min-h-[40px] rounded-lg text-xs font-bold text-[#E5C158] hover:bg-white/5 transition-colors whitespace-nowrap"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 shrink-0" />
                    <span>เมนูที่ 1 : ข้อสังเกต</span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${obsOpen ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
                {obsOpen && (
                  <div className="mt-1 ml-2 pl-2 border-l border-white/15 space-y-1">
                    <button
                      type="button"
                      onClick={() => handleNav('coop-observations')}
                      className={`w-full flex items-center gap-2.5 px-3 ${
                        isMobile ? 'min-h-[44px]' : 'py-2'
                      } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        activeSection === 'coop-observations'
                          ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                          : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Building2 className="w-4 h-4 shrink-0 text-emerald-200" />
                      <span className="truncate">1.1 ข้อสังเกตของสหกรณ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNav('farmer-observations')}
                      className={`w-full flex items-center gap-2.5 px-3 ${
                        isMobile ? 'min-h-[44px]' : 'py-2'
                      } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                        activeSection === 'farmer-observations'
                          ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                          : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Sprout className="w-4 h-4 shrink-0 text-emerald-200" />
                      <span className="truncate">1.2 ข้อสังเกตของกลุ่มเกษตรกร</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleNav('coop-observations')}
                  title="1.1 ข้อสังเกตของสหกรณ์"
                  className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                    activeSection === 'coop-observations'
                      ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                      : 'text-emerald-100/85 hover:bg-white/10'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNav('farmer-observations')}
                  title="1.2 ข้อสังเกตของกลุ่มเกษตรกร"
                  className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-colors ${
                    activeSection === 'farmer-observations'
                      ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                      : 'text-emerald-100/85 hover:bg-white/10'
                  }`}
                >
                  <Sprout className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Menu 2: ข้อบกพร่อง */}
          <div className="pt-1">
            {!isNarrow && (
              <p className="px-3 py-1 text-xs font-bold text-[#E5C158]">
                เมนูที่ 2 : ข้อบกพร่อง
              </p>
            )}
            <button
              type="button"
              onClick={() => handleNav('defects')}
              title="ข้อบกพร่องของสหกรณ์"
              className={`w-full flex items-center gap-3 px-3 ${
                isMobile ? 'min-h-[44px]' : 'py-2.5'
              } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === 'defects'
                  ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                  : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-[#E5C158] shrink-0" />
              {!isNarrow && <span className="truncate">ข้อบกพร่องของสหกรณ์</span>}
            </button>
          </div>

          <div className="my-3 h-px bg-white/10" />

          <button
            type="button"
            onClick={() => handleNav('reports')}
            title="ระบบรายงานผู้บริหาร"
            className={`w-full flex items-center gap-3 px-3 ${
              isMobile ? 'min-h-[44px]' : 'py-2.5'
            } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeSection === 'reports'
                ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FileBarChart2 className="w-4 h-4 text-emerald-200 shrink-0" />
            {!isNarrow && <span className="truncate">ระบบรายงาน</span>}
          </button>

          <button
            type="button"
            onClick={() => handleNav('activity-logs')}
            title="ประวัติการดำเนินงาน"
            className={`w-full flex items-center gap-3 px-3 ${
              isMobile ? 'min-h-[44px]' : 'py-2.5'
            } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeSection === 'activity-logs'
                ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
            }`}
          >
            <History className="w-4 h-4 text-emerald-200 shrink-0" />
            {!isNarrow && <span className="truncate">ประวัติการดำเนินงาน</span>}
          </button>

          {user.role === 'Admin' && (
            <button
              type="button"
              onClick={() => handleNav('users')}
              title="จัดการผู้ใช้งาน (Admin)"
              className={`w-full flex items-center gap-3 px-3 ${
                isMobile ? 'min-h-[44px]' : 'py-2.5'
              } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === 'users'
                  ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                  : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 text-[#E5C158] shrink-0" />
              {!isNarrow && <span className="truncate">จัดการผู้ใช้งาน</span>}
            </button>
          )}

          <button
            type="button"
            onClick={() => handleNav('settings')}
            title="ตั้งค่าเชื่อมต่อและคู่มือระบบ"
            className={`w-full flex items-center gap-3 px-3 ${
              isMobile ? 'min-h-[44px]' : 'py-2.5'
            } rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeSection === 'settings'
                ? 'bg-[#155E46] text-white border border-[#C9A227]/60'
                : 'text-emerald-100/85 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4 text-emerald-200 shrink-0" />
            {!isNarrow && <span className="truncate">ตั้งค่าเชื่อมต่อ & คู่มือ</span>}
          </button>

          {/* View Mode Switch inside Mobile Drawer (for md+ users previewing smartphone) */}
          {isMobile && isSmartphone && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onChangeViewMode('desktop');
                  setMobileOpen(false);
                }}
                className="w-full hidden md:flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm font-semibold text-[#E5C158] bg-white/5 hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                <Monitor className="w-4 h-4 shrink-0" />
                <span>สลับกลับมุมมองเดสก์ท็อป</span>
              </button>
            </div>
          )}
        </nav>

        {/* Footer User Info */}
        <div className="p-3 border-t border-white/10 bg-[#082c21]">
          {!isNarrow ? (
            <div className="space-y-2">
              <div className="text-xs">
                <p className="font-semibold text-white truncate">{user.name}</p>
                <p className="text-emerald-200/80 truncate">{user.email}</p>
                <p className="text-[11px] font-semibold text-[#E5C158] mt-0.5">
                  สิทธิ์: {user.role === 'Admin' ? 'ผู้ดูแลระบบ (Admin)' : 'เจ้าหน้าที่ (Staff)'}
                </p>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 px-3 min-h-[40px] py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLogout}
              title="ออกจากระบบ"
              className="w-full flex items-center justify-center py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const bottomQuickTabs = (
    <>
      <button
        type="button"
        onClick={() => handleNav('dashboard')}
        className={`flex flex-col items-center justify-center min-h-[50px] py-1.5 gap-0.5 transition-colors whitespace-nowrap ${
          activeSection === 'dashboard'
            ? 'text-[#0B3B2C] font-bold bg-emerald-50/80 border-t-2 border-[#0B3B2C]'
            : 'text-neutral-600 hover:text-[#0B3B2C]'
        }`}
      >
        <LayoutDashboard className="w-4 h-4" />
        <span>ภาพรวม</span>
      </button>
      <button
        type="button"
        onClick={() => handleNav('coop-observations')}
        className={`flex flex-col items-center justify-center min-h-[50px] py-1.5 gap-0.5 transition-colors whitespace-nowrap ${
          activeSection === 'coop-observations'
            ? 'text-[#0B3B2C] font-bold bg-emerald-50/80 border-t-2 border-[#0B3B2C]'
            : 'text-neutral-600 hover:text-[#0B3B2C]'
        }`}
      >
        <Building2 className="w-4 h-4" />
        <span>สหกรณ์</span>
      </button>
      <button
        type="button"
        onClick={() => handleNav('farmer-observations')}
        className={`flex flex-col items-center justify-center min-h-[50px] py-1.5 gap-0.5 transition-colors whitespace-nowrap ${
          activeSection === 'farmer-observations'
            ? 'text-[#0B3B2C] font-bold bg-emerald-50/80 border-t-2 border-[#0B3B2C]'
            : 'text-neutral-600 hover:text-[#0B3B2C]'
        }`}
      >
        <Sprout className="w-4 h-4" />
        <span>เกษตรกร</span>
      </button>
      <button
        type="button"
        onClick={() => handleNav('defects')}
        className={`flex flex-col items-center justify-center min-h-[50px] py-1.5 gap-0.5 transition-colors whitespace-nowrap ${
          activeSection === 'defects'
            ? 'text-[#0B3B2C] font-bold bg-emerald-50/80 border-t-2 border-[#0B3B2C]'
            : 'text-neutral-600 hover:text-[#0B3B2C]'
        }`}
      >
        <AlertTriangle className="w-4 h-4" />
        <span>ข้อบกพร่อง</span>
      </button>
      <button
        type="button"
        onClick={() => handleNav('reports')}
        className={`flex flex-col items-center justify-center min-h-[50px] py-1.5 gap-0.5 transition-colors whitespace-nowrap ${
          activeSection === 'reports'
            ? 'text-[#0B3B2C] font-bold bg-emerald-50/80 border-t-2 border-[#0B3B2C]'
            : 'text-neutral-600 hover:text-[#0B3B2C]'
        }`}
      >
        <FileBarChart2 className="w-4 h-4" />
        <span>รายงาน</span>
      </button>
    </>
  );

  return (
    <div
      className={
        isSmartphone
          ? 'min-h-screen bg-[#E6EDE8] md:py-4 md:px-4 flex flex-col items-center justify-center print:bg-white print:p-0 print:block'
          : 'min-h-screen flex bg-[#F7F9F8]'
      }
    >
      {/* Smartphone Mode Top Switcher Strip (Desktop / Tablet Only) */}
      {isSmartphone && (
        <div className="hidden md:flex items-center justify-between gap-4 w-full max-w-[412px] mb-2.5 px-1 no-print">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0B3B2C]">
            <Smartphone className="w-4 h-4 text-[#9A7409]" />
            <span>หน้าจอมุมมองผ่านสมาร์ทโฟน</span>
          </div>
          <button
            type="button"
            onClick={() => onChangeViewMode('desktop')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] transition-colors whitespace-nowrap shrink-0"
          >
            <Monitor className="w-3.5 h-3.5 text-[#E5C158]" />
            <span>มุมมองเดสก์ท็อป</span>
          </button>
        </div>
      )}

      {/* Desktop Collapsible Sidebar (hidden in Smartphone mode) */}
      {!isSmartphone && (
        <aside
          className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-all duration-200 no-print ${
            collapsed ? 'w-[76px]' : 'w-[268px]'
          }`}
        >
          {navContent(false)}
        </aside>
      )}

      {/* App Viewport Wrapper (Full width in desktop mode, 412px Smartphone Frame in smartphone mode) */}
      <div
        className={
          isSmartphone
            ? 'w-full min-h-screen md:min-h-[600px] md:max-w-[412px] md:h-[min(844px,calc(100vh-4.5rem))] md:rounded-[30px] md:border-[6px] md:border-[#0B3B2C] md:shadow-2xl bg-[#F7F9F8] flex flex-col overflow-hidden relative print:max-w-none print:h-auto print:overflow-visible print:border-0 print:rounded-none print:shadow-none'
            : 'flex-1 flex flex-col min-w-0'
        }
      >
        {/* Mobile Navigation Drawer */}
        {mobileOpen && (
          <div
            className={`${
              isSmartphone ? 'absolute inset-0' : 'fixed inset-0 lg:hidden'
            } z-50 flex no-print`}
          >
            <div className="w-[276px] h-full shadow-2xl">{navContent(true)}</div>
            <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-neutral-200 shrink-0 no-print">
          <div className="h-1 w-full bg-gradient-to-r from-[#0B3B2C] via-[#C9A227] to-[#0B3B2C]" />
          <div
            className={`${
              isSmartphone ? 'px-3 py-2' : 'px-4 sm:px-6 py-3'
            } flex items-center justify-between gap-2 sm:gap-4`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className={`${
                  isSmartphone ? 'flex' : 'lg:hidden flex'
                } min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-neutral-200 text-[#0B3B2C] hover:bg-neutral-100 shrink-0`}
                aria-label="เปิดเมนูนำทาง"
              >
                <Menu className="w-5 h-5" />
              </button>

              {isSmartphone && (
                <div className="w-8 h-8 rounded-lg bg-white p-0.5 border border-[#C9A227] shrink-0 flex items-center justify-center">
                  <img
                    src={EMBLEM_URL}
                    alt="ตราสัญลักษณ์"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain rounded"
                  />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1
                    className={`${
                      isSmartphone ? 'text-sm' : 'text-base sm:text-lg'
                    } font-bold text-[#0B3B2C] truncate`}
                  >
                    CO-OP WATCHING SYSTEM
                  </h1>
                  {!isSmartphone && (
                    <>
                      <span className="hidden sm:inline text-neutral-300">|</span>
                      <span className="hidden sm:inline text-xs font-semibold text-[#9A7409] truncate">
                        สำนักงานสหกรณ์จังหวัดชัยนาท
                      </span>
                    </>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-neutral-600 truncate">
                  {isSmartphone
                    ? 'สำนักงานสหกรณ์จังหวัดชัยนาท'
                    : 'ระบบติดตามข้อสังเกตและข้อบกพร่องของสหกรณ์'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {!isSmartphone && (
                <button
                  type="button"
                  onClick={() => onChangeViewMode('smartphone')}
                  className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C9A227]/70 bg-amber-50/70 text-xs font-semibold text-[#0B3B2C] hover:bg-amber-100/70 transition-colors whitespace-nowrap shrink-0"
                  title="สลับหน้าจอเพื่อดูและใช้งานในมุมมองสมาร์ทโฟน"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#9A7409]" />
                  <span>มุมมองสมาร์ทโฟน</span>
                </button>
              )}

              {isConfigured && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  aria-label="ซิงค์ข้อมูลล่าสุด"
                  title="ซิงค์ข้อมูลล่าสุด"
                  className={`inline-flex items-center justify-center gap-1.5 ${
                    isSmartphone ? 'min-h-[40px] min-w-[40px] px-2' : 'px-3 py-2'
                  } rounded-lg border border-neutral-300 bg-white text-xs font-semibold text-[#0B3B2C] hover:bg-neutral-50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {!isSmartphone && <span className="hidden sm:inline">ซิงค์ข้อมูลล่าสุด</span>}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleNav('settings')}
                aria-label="ตั้งค่าฐานข้อมูล"
                title="ตั้งค่าฐานข้อมูล"
                className={`inline-flex items-center justify-center gap-1.5 ${
                  isSmartphone ? 'min-h-[40px] min-w-[40px] px-2' : 'px-3 py-2'
                } rounded-lg bg-[#0B3B2C] text-white text-xs font-semibold hover:bg-[#082c21] transition-colors whitespace-nowrap shrink-0`}
              >
                <Settings className="w-3.5 h-3.5 text-[#E5C158]" />
                {!isSmartphone && <span className="hidden sm:inline">ตั้งค่าฐานข้อมูล</span>}
              </button>
            </div>
          </div>
        </header>

        {/* Viewport Content with Container Query Context (@container) */}
        <main
          className={
            isSmartphone
              ? 'flex-1 overflow-y-auto p-3.5 pb-4 w-full @container print:overflow-visible print:p-0 flex flex-col'
              : 'flex-1 p-4 sm:p-6 pb-20 lg:pb-8 max-w-[1440px] w-full mx-auto @container flex flex-col'
          }
        >
          <div className="flex-1">{children}</div>
          <footer className="mt-8 pt-4 border-t border-neutral-200 text-center text-xs text-neutral-600 no-print">
            <p className="font-semibold text-[#0B3B2C]">
              พัฒนาระบบโดย กลุ่มตรวจการสหกรณ์ สำนักงานสหกรณ์จังหวัดชัยนาท
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              CO-OP WATCHING SYSTEM · ระบบติดตามข้อสังเกตและข้อบกพร่องของสหกรณ์
            </p>
          </footer>
        </main>

        {/* Mobile Bottom Quick Bar (<= 15% height, >= 44px touch targets) */}
        {isSmartphone ? (
          <nav
            aria-label="เมนูลัดบนสมาร์ทโฟน"
            className="shrink-0 z-30 bg-white/95 backdrop-blur-md border-t border-neutral-200 grid grid-cols-5 text-[10px] font-medium text-neutral-700 no-print"
          >
            {bottomQuickTabs}
          </nav>
        ) : (
          <nav
            aria-label="เมนูลัดบนมือถือ"
            className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-neutral-200 grid grid-cols-5 text-[10px] font-medium text-neutral-700 no-print"
          >
            {bottomQuickTabs}
          </nav>
        )}
      </div>
    </div>
  );
}
