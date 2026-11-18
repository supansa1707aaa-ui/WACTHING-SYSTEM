import { getAccessToken } from './firebaseAuth';
import type {
  ActivityLogRecord,
  AttachmentRecord,
  CooperativeObservation,
  DashboardPayload,
  DefectRecord,
  FarmerGroupObservation,
  SystemUser,
  UserProfile,
  WorkspaceConfig,
} from '../types/coop';

const CONFIG_STORAGE_KEY = 'coop_watching_workspace_config_v1';

export function loadWorkspaceConfig(): WorkspaceConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WorkspaceConfig>;
      return {
        spreadsheetId: parsed.spreadsheetId || '',
        driveFolderId: parsed.driveFolderId || '',
        appsScriptUrl: parsed.appsScriptUrl || '',
        multiSheet: parsed.multiSheet || {
          pullAllSheets: true,
          splitPerIssue: true,
          sheetRules: [],
        },
      };
    }
  } catch {
    // ignore storage errors
  }
  return {
    spreadsheetId: '',
    driveFolderId: '',
    appsScriptUrl: '',
    multiSheet: {
      pullAllSheets: true,
      splitPerIssue: true,
      sheetRules: [],
    },
  };
}

export function saveWorkspaceConfig(config: WorkspaceConfig): void {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export class ApiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiAuthError';
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  overrideConfig?: Partial<WorkspaceConfig>
): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new ApiAuthError('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนดำเนินการ');
  }

  const config = loadWorkspaceConfig();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const sheetId = overrideConfig?.spreadsheetId ?? config.spreadsheetId;
  const folderId = overrideConfig?.driveFolderId ?? config.driveFolderId;
  const sheetCfg = overrideConfig?.multiSheet ?? config.multiSheet;
  if (sheetId) headers.set('x-spreadsheet-id', sheetId);
  if (folderId) headers.set('x-drive-folder-id', folderId);
  if (sheetCfg) headers.set('x-sheet-config', encodeURIComponent(JSON.stringify(sheetCfg)));

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
  }

  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    message?: string;
    data?: T;
  };

  if (response.status === 401) {
    throw new ApiAuthError(json.error || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบด้วย Google ใหม่อีกครั้ง');
  }

  if (!response.ok || json.success === false) {
    throw new Error(json.error || `เกิดข้อผิดพลาดจากระบบ (${response.status})`);
  }

  return json.data as T;
}

export const coopApi = {
  bootstrapWorkspace: (payload: {
    spreadsheetId?: string;
    driveFolderId?: string;
    createNewSpreadsheet?: boolean;
    createNewFolder?: boolean;
  }) =>
    apiRequest<{
      spreadsheetId: string;
      spreadsheetTitle: string;
      driveFolderId: string;
      folderName: string;
      role: 'Admin' | 'Staff';
      sheets: string[];
    }>('/api/workspace/bootstrap', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  testConnection: (payload: { spreadsheetId: string; driveFolderId: string }) =>
    apiRequest<{
      spreadsheetConnected: boolean;
      spreadsheetTitle: string;
      existingSheets: string[];
      missingSheets: string[];
      driveStatus: { connected: boolean; folderName?: string; error?: string };
      userEmail: string;
    }>('/api/workspace/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  inspectSheets: (spreadsheetId: string) =>
    apiRequest<{
      spreadsheetTitle: string;
      sheets: Array<{
        sheetName: string;
        isPrimarySystemSheet: boolean;
        detectedModule: 'coop' | 'farmer' | 'defects' | 'system' | 'unsupported';
        accountingYear: string;
        rowCount: number;
        headers: string[];
      }>;
    }>('/api/workspace/inspect-sheets', {
      method: 'POST',
      body: JSON.stringify({ spreadsheetId }),
    }),

  testAppsScript: (webAppUrl: string) =>
    apiRequest<{ success: boolean; message?: string }>('/api/apps-script-test', {
      method: 'POST',
      body: JSON.stringify({ webAppUrl }),
    }),

  getMe: () => apiRequest<UserProfile>('/api/me'),

  getDashboard: () => apiRequest<DashboardPayload>('/api/dashboard'),

  // Cooperative Observations
  listCoopObservations: () => apiRequest<CooperativeObservation[]>('/api/coop-observations'),
  createCoopObservation: (data: Omit<CooperativeObservation, 'ID' | 'No' | 'CreatedAt' | 'UpdatedAt' | 'CreatedBy' | 'UpdatedBy'>) =>
    apiRequest<CooperativeObservation>('/api/coop-observations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  importCoopObservations: (rows: Array<Record<string, unknown>>) =>
    apiRequest<{ insertedCount: number; skippedDuplicates: number; inserted: CooperativeObservation[] }>(
      '/api/coop-observations/import',
      {
        method: 'POST',
        body: JSON.stringify({ rows }),
      }
    ),
  readRawGoogleSheet: (payload: { sourceSpreadsheetId: string; sheetName?: string }) =>
    apiRequest<{
      spreadsheetTitle: string;
      tabs: string[];
      selectedTab: string;
      matrix: string[][];
    }>('/api/coop-observations/read-raw-sheet', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  readAllGoogleSheets: (sourceSpreadsheetId: string) =>
    apiRequest<{
      spreadsheetTitle: string;
      tabs: string[];
      sheets: Array<{ sheetName: string; matrix: string[][] }>;
    }>('/api/workspace/read-all-sheets', {
      method: 'POST',
      body: JSON.stringify({ sourceSpreadsheetId }),
    }),
  importAllSheets: (payload: {
    coopRows?: Array<Record<string, unknown>>;
    farmerRows?: Array<Record<string, unknown>>;
    defectRows?: Array<Record<string, unknown>>;
  }) =>
    apiRequest<{
      coopInserted: number;
      farmerInserted: number;
      defectInserted: number;
      totalInserted: number;
      skippedDuplicates: number;
    }>('/api/workspace/import-all-sheets', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCoopObservation: (
    id: string,
    data: Omit<CooperativeObservation, 'ID' | 'No' | 'CreatedAt' | 'UpdatedAt' | 'CreatedBy' | 'UpdatedBy'>
  ) =>
    apiRequest<CooperativeObservation>(`/api/coop-observations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCoopObservation: (id: string) =>
    apiRequest<void>(`/api/coop-observations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Farmer Group Observations
  listFarmerObservations: () => apiRequest<FarmerGroupObservation[]>('/api/farmer-observations'),
  createFarmerObservation: (
    data: Omit<FarmerGroupObservation, 'ID' | 'No' | 'CreatedAt' | 'UpdatedAt' | 'CreatedBy' | 'UpdatedBy'>
  ) =>
    apiRequest<FarmerGroupObservation>('/api/farmer-observations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateFarmerObservation: (
    id: string,
    data: Omit<FarmerGroupObservation, 'ID' | 'No' | 'CreatedAt' | 'UpdatedAt' | 'CreatedBy' | 'UpdatedBy'>
  ) =>
    apiRequest<FarmerGroupObservation>(`/api/farmer-observations/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFarmerObservation: (id: string) =>
    apiRequest<void>(`/api/farmer-observations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Defects
  listDefects: () => apiRequest<DefectRecord[]>('/api/defects'),
  createDefect: (data: Omit<DefectRecord, 'ID' | 'No' | 'CreatedAt' | 'UpdatedAt' | 'CreatedBy' | 'UpdatedBy'>) =>
    apiRequest<DefectRecord>('/api/defects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateDefect: (
    id: string,
    data: Omit<DefectRecord, 'ID' | 'No' | 'CreatedAt' | 'UpdatedAt' | 'CreatedBy' | 'UpdatedBy'>
  ) =>
    apiRequest<DefectRecord>(`/api/defects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteDefect: (id: string) =>
    apiRequest<void>(`/api/defects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Attachments
  listAttachments: (relatedRecordId?: string) =>
    apiRequest<AttachmentRecord[]>(
      relatedRecordId
        ? `/api/attachments?relatedRecordId=${encodeURIComponent(relatedRecordId)}`
        : '/api/attachments'
    ),
  uploadAttachment: (payload: {
    relatedRecordID: string;
    recordType: string;
    fileName: string;
    base64Data: string;
    mimeType: string;
  }) =>
    apiRequest<AttachmentRecord>('/api/attachments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteAttachment: (id: string) =>
    apiRequest<void>(`/api/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  fetchAttachmentBlob: async (fileId: string, fileName: string, mode: 'inline' | 'download'): Promise<Blob> => {
    const token = getAccessToken();
    if (!token) throw new ApiAuthError('กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนเปิดเอกสาร');
    const config = loadWorkspaceConfig();
    const res = await fetch(
      `/api/attachments/${encodeURIComponent(fileId)}/content?mode=${mode}&name=${encodeURIComponent(fileName)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-spreadsheet-id': config.spreadsheetId,
          'x-drive-folder-id': config.driveFolderId,
        },
      }
    );
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'ไม่สามารถดาวน์โหลดเอกสารจาก Google Drive ได้');
    }
    return await res.blob();
  },

  // Logs
  listLogs: (recordId?: string) =>
    apiRequest<ActivityLogRecord[]>(
      recordId ? `/api/logs?recordId=${encodeURIComponent(recordId)}` : '/api/logs'
    ),

  // Users (Admin)
  listUsers: () => apiRequest<SystemUser[]>('/api/users'),
  createUser: (data: { Email: string; DisplayName: string; Role: 'Admin' | 'Staff'; IsActive: string }) =>
    apiRequest<SystemUser>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateUser: (id: string, data: { DisplayName: string; Role: 'Admin' | 'Staff'; IsActive: string }) =>
    apiRequest<SystemUser>(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteUser: (id: string) =>
    apiRequest<void>(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
