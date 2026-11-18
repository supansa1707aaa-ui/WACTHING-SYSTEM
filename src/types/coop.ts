export type ObservationStatus = 'แก้ไขเสร็จสิ้น' | 'อยู่ระหว่างดำเนินการ';

export type DefectStatus =
  | 'ยังไม่ได้ดำเนินการแก้ไข'
  | 'อยู่ระหว่างดำเนินการแก้ไข'
  | 'แก้ไขแล้ว'
  | 'แก้ไขเสร็จสิ้น';

export type UserRole = 'Admin' | 'Staff';

export type NavSection =
  | 'dashboard'
  | 'coop-observations'
  | 'farmer-observations'
  | 'defects'
  | 'reports'
  | 'activity-logs'
  | 'users'
  | 'settings';

export type SheetModuleMapping = 'auto' | 'coop' | 'farmer' | 'defects' | 'skip';

export interface SheetSourceRule {
  sheetName: string;
  enabled: boolean;
  module: SheetModuleMapping;
  accountingYearOverride?: string;
}

export interface MultiSheetSettings {
  pullAllSheets: boolean;
  splitPerIssue: boolean;
  sheetRules: SheetSourceRule[];
}

export interface SheetSourceSummary {
  sheetName: string;
  moduleType: 'coop' | 'farmer' | 'defects' | 'system' | 'unsupported';
  accountingYear?: string;
  rowCount: number;
  enabled: boolean;
}

export interface CooperativeObservation {
  ID: string;
  No: number;
  CooperativeName: string;
  LetterInfo?: string;
  AccountingYear: string;
  IssueCount: number;
  ObservationDetails: string;
  CorrectionGuidelines: string;
  Status: ObservationStatus;
  CreatedAt: string;
  UpdatedAt: string;
  CreatedBy: string;
  UpdatedBy: string;
  SourceSheet?: string;
  IsExternalSheet?: boolean;
}

export interface FarmerGroupObservation {
  ID: string;
  No: number;
  FarmerGroupName: string;
  AccountingYear: string;
  AuditOfficeLetterNumber: string;
  AuditOfficeLetterDate: string;
  CorrectionNotificationLetterNumber: string;
  CorrectionNotificationLetterDate: string;
  IssueCount: number;
  ObservationDetails: string;
  CorrectionGuidelines: string;
  Status: ObservationStatus;
  CreatedAt: string;
  UpdatedAt: string;
  CreatedBy: string;
  UpdatedBy: string;
  SourceSheet?: string;
  IsExternalSheet?: boolean;
}

export interface DefectRecord {
  ID: string;
  No: number;
  CooperativeName: string;
  OrderNumber: string;
  OrderDate: string;
  DefectDetails: string;
  CorrectionResults: string;
  DefectStatus: DefectStatus;
  CreatedAt: string;
  UpdatedAt: string;
  CreatedBy: string;
  UpdatedBy: string;
  SourceSheet?: string;
  IsExternalSheet?: boolean;
}

export interface AttachmentRecord {
  ID: string;
  RelatedRecordID: string;
  RecordType: string;
  FileName: string;
  FileID: string;
  FileURL: string;
  UploadedAt: string;
  UploadedBy: string;
}

export interface ActivityLogRecord {
  ID: string;
  RecordID: string;
  RecordType: string;
  Action: string;
  OldValue: string;
  NewValue: string;
  ActionBy: string;
  ActionDate: string;
}

export interface SystemUser {
  ID: string;
  Email: string;
  DisplayName: string;
  Role: UserRole;
  IsActive: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface WorkspaceConfig {
  spreadsheetId: string;
  driveFolderId: string;
  appsScriptUrl?: string;
  multiSheet?: MultiSheetSettings;
}

export interface UserProfile {
  email: string;
  name: string;
  role: UserRole;
  userId?: string;
}

export interface DashboardPayload {
  coopObservations: CooperativeObservation[];
  farmerObservations: FarmerGroupObservation[];
  defects: DefectRecord[];
  attachmentsCount: number;
  sheetSources?: SheetSourceSummary[];
}

export const OBSERVATION_STATUS_OPTIONS: ObservationStatus[] = [
  'อยู่ระหว่างดำเนินการ',
  'แก้ไขเสร็จสิ้น',
];

export const DEFECT_STATUS_OPTIONS: DefectStatus[] = [
  'ยังไม่ได้ดำเนินการแก้ไข',
  'อยู่ระหว่างดำเนินการแก้ไข',
  'แก้ไขแล้ว',
  'แก้ไขเสร็จสิ้น',
];

export const EMBLEM_URL = '/assets/aistudio/_______cd16f664.jpg';
