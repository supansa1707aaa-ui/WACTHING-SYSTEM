import { useCallback, useEffect, useState } from 'react';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/firebaseAuth';
import {
  ApiAuthError,
  coopApi,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
} from './services/api';
import type {
  ActivityLogRecord,
  AttachmentRecord,
  CooperativeObservation,
  DashboardPayload,
  DefectRecord,
  FarmerGroupObservation,
  NavSection,
  SystemUser,
  UserProfile,
  WorkspaceConfig,
} from './types/coop';
import { AuthGate } from './components/AuthGate';
import { LayoutShell, type ViewportMode } from './components/LayoutShell';
import { DashboardView } from './components/DashboardView';
import { CoopObservationsView } from './components/CoopObservationsView';
import { FarmerObservationsView } from './components/FarmerObservationsView';
import { DefectsView } from './components/DefectsView';
import { ReportsView } from './components/ReportsView';
import { ActivityLogsView } from './components/ActivityLogsView';
import { UsersManagementView } from './components/UsersManagementView';
import { SettingsAndGuideView } from './components/SettingsAndGuideView';
import { LoadingOverlay, ToastContainer, type ToastMessage } from './components/FeedbackUI';

export default function App() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [config, setConfig] = useState<WorkspaceConfig>(() => loadWorkspaceConfig());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [viewMode, setViewMode] = useState<ViewportMode>('desktop');

  const [coopObservations, setCoopObservations] = useState<CooperativeObservation[]>([]);
  const [farmerObservations, setFarmerObservations] = useState<FarmerGroupObservation[]>([]);
  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [logs, setLogs] = useState<ActivityLogRecord[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overlayLoading, setOverlayLoading] = useState<{ visible: boolean; message?: string }>({
    visible: false,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setLoadingState = useCallback((visible: boolean, message?: string) => {
    setOverlayLoading({ visible, message });
  }, []);

  const loadAllData = useCallback(
    async (targetConfig?: WorkspaceConfig) => {
      const activeCfg = targetConfig || config;
      if (!activeCfg.spreadsheetId || !getAccessToken()) return;

      setIsRefreshing(true);
      try {
        const me = await coopApi.getMe();
        setUserProfile(me);

        const [dashboard, attList, logList] = await Promise.all([
          coopApi.getDashboard(),
          coopApi.listAttachments(),
          coopApi.listLogs(),
        ]);

        setCoopObservations(dashboard.coopObservations || []);
        setFarmerObservations(dashboard.farmerObservations || []);
        setDefects(dashboard.defects || []);
        setAttachments(attList || []);
        setLogs(logList || []);

        if (me.role === 'Admin') {
          const userList = await coopApi.listUsers();
          setUsers(userList || []);
        } else {
          setUsers([]);
        }
      } catch (err) {
        if (err instanceof ApiAuthError) {
          clearAccessToken();
          setNeedsAuth(true);
          setAuthError(err.message);
        } else {
          pushToast('error', err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้');
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [config, pushToast]
  );

  useEffect(() => {
    const unsubscribe = initAuth(
      (firebaseUser) => {
        setNeedsAuth(false);
        setAuthError(null);
        setUserProfile((prev) =>
          prev || {
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || firebaseUser.email || 'เจ้าหน้าที่',
            role: 'Admin',
          }
        );
      },
      () => {
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      const currentCfg = loadWorkspaceConfig();
      setConfig(currentCfg);
      setNeedsAuth(false);

      const fallbackProfile: UserProfile = {
        email: result.user.email || '',
        name: result.user.displayName || result.user.email || 'เจ้าหน้าที่',
        role: 'Admin',
      };
      setUserProfile(fallbackProfile);

      if (currentCfg.spreadsheetId) {
        await loadAllData(currentCfg);
      } else {
        setActiveSection('settings');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ';
      setAuthError(msg);
      pushToast('error', msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUserProfile(null);
    setCoopObservations([]);
    setFarmerObservations([]);
    setDefects([]);
    setAttachments([]);
    setLogs([]);
    setUsers([]);
    setNeedsAuth(true);
  };

  const handleConfigSaved = async (newCfg: WorkspaceConfig) => {
    saveWorkspaceConfig(newCfg);
    setConfig(newCfg);
    await loadAllData(newCfg);
  };

  if (needsAuth || !userProfile) {
    return (
      <>
        <AuthGate
          onSignIn={() => void handleGoogleLogin()}
          isSigningIn={isSigningIn}
          errorMessage={authError}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const isConfigured = Boolean(config.spreadsheetId);
  const dashboardPayload: DashboardPayload | null = isConfigured
    ? {
        coopObservations,
        farmerObservations,
        defects,
        attachmentsCount: attachments.length,
      }
    : null;

  return (
    <>
      <LayoutShell
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        user={userProfile}
        isConfigured={isConfigured}
        isRefreshing={isRefreshing}
        onRefresh={() => void loadAllData()}
        onLogout={() => void handleLogout()}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
      >
        {activeSection === 'dashboard' && (
          <DashboardView
            data={dashboardPayload}
            isConfigured={isConfigured}
            onNavigate={setActiveSection}
          />
        )}

        {activeSection === 'coop-observations' && (
          <CoopObservationsView
            records={coopObservations}
            userRole={userProfile.role}
            isConfigured={isConfigured}
            onRefresh={() => loadAllData()}
            onNotify={pushToast}
            onSetLoading={setLoadingState}
          />
        )}

        {activeSection === 'farmer-observations' && (
          <FarmerObservationsView
            records={farmerObservations}
            attachments={attachments}
            userRole={userProfile.role}
            isConfigured={isConfigured}
            onRefresh={() => loadAllData()}
            onNotify={pushToast}
            onSetLoading={setLoadingState}
          />
        )}

        {activeSection === 'defects' && (
          <DefectsView
            records={defects}
            userRole={userProfile.role}
            isConfigured={isConfigured}
            onRefresh={() => loadAllData()}
            onNotify={pushToast}
            onSetLoading={setLoadingState}
          />
        )}

        {activeSection === 'reports' && (
          <ReportsView
            coopObservations={coopObservations}
            farmerObservations={farmerObservations}
            defects={defects}
          />
        )}

        {activeSection === 'activity-logs' && <ActivityLogsView logs={logs} />}

        {activeSection === 'users' && userProfile.role === 'Admin' && (
          <UsersManagementView
            users={users}
            currentUserEmail={userProfile.email}
            onRefresh={() => loadAllData()}
            onNotify={pushToast}
            onSetLoading={setLoadingState}
          />
        )}

        {activeSection === 'settings' && (
          <SettingsAndGuideView
            config={config}
            onConfigSaved={handleConfigSaved}
            onNotify={pushToast}
            onSetLoading={setLoadingState}
          />
        )}
      </LayoutShell>

      <LoadingOverlay visible={overlayLoading.visible} message={overlayLoading.message} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
