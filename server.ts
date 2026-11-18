import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { parseSheetAuto } from './src/utils/csvImportParser.ts';
import type { MultiSheetSettings } from './src/types/coop.ts';

dotenv.config();

const PORT = 3000;

const SHEET_NAMES = {
  COOP: 'CooperativeObservations',
  FARMER: 'FarmerGroupObservations',
  DEFECTS: 'Defects',
  ATTACHMENTS: 'Attachments',
  LOGS: 'ActivityLogs',
  USERS: 'Users',
} as const;

const SHEET_HEADERS: Record<string, string[]> = {
  CooperativeObservations: [
    'ID',
    'No',
    'CooperativeName',
    'LetterInfo',
    'AccountingYear',
    'IssueCount',
    'ObservationDetails',
    'CorrectionGuidelines',
    'Status',
    'CreatedAt',
    'UpdatedAt',
    'CreatedBy',
    'UpdatedBy',
  ],
  FarmerGroupObservations: [
    'ID',
    'No',
    'FarmerGroupName',
    'AccountingYear',
    'AuditOfficeLetterNumber',
    'AuditOfficeLetterDate',
    'CorrectionNotificationLetterNumber',
    'CorrectionNotificationLetterDate',
    'IssueCount',
    'ObservationDetails',
    'CorrectionGuidelines',
    'Status',
    'CreatedAt',
    'UpdatedAt',
    'CreatedBy',
    'UpdatedBy',
  ],
  Defects: [
    'ID',
    'No',
    'CooperativeName',
    'OrderNumber',
    'OrderDate',
    'DefectDetails',
    'CorrectionResults',
    'DefectStatus',
    'CreatedAt',
    'UpdatedAt',
    'CreatedBy',
    'UpdatedBy',
  ],
  Attachments: [
    'ID',
    'RelatedRecordID',
    'RecordType',
    'FileName',
    'FileID',
    'FileURL',
    'UploadedAt',
    'UploadedBy',
  ],
  ActivityLogs: [
    'ID',
    'RecordID',
    'RecordType',
    'Action',
    'OldValue',
    'NewValue',
    'ActionBy',
    'ActionDate',
  ],
  Users: [
    'ID',
    'Email',
    'DisplayName',
    'Role',
    'IsActive',
    'CreatedAt',
    'UpdatedAt',
  ],
};

const OBSERVATION_STATUSES = ['แก้ไขเสร็จสิ้น', 'อยู่ระหว่างดำเนินการ'];
const DEFECT_STATUSES = [
  'ยังไม่ได้ดำเนินการแก้ไข',
  'อยู่ระหว่างดำเนินการแก้ไข',
  'แก้ไขแล้ว',
  'แก้ไขเสร็จสิ้น',
];

interface AuthedUser {
  email: string;
  name: string;
  accessToken: string;
  role: 'Admin' | 'Staff';
  userId?: string;
}

interface AuthedRequest extends Request {
  user?: AuthedUser;
  spreadsheetId?: string;
  driveFolderId?: string;
  sheetConfig?: MultiSheetSettings;
}

function genId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function isValidIsoDate(val: string): boolean {
  if (!val) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
}

async function googleFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(url, { ...init, headers });
  return res;
}

async function resolveGoogleIdentity(accessToken: string): Promise<{ email: string; name: string }> {
  // Validate token via Google tokeninfo / userinfo
  const userInfoRes = await googleFetch('https://www.googleapis.com/oauth2/v3/userinfo', accessToken);
  if (userInfoRes.ok) {
    const info = (await userInfoRes.json()) as { email?: string; name?: string };
    if (info.email) {
      return {
        email: info.email.trim().toLowerCase(),
        name: info.name || info.email.split('@')[0],
      };
    }
  }

  const tokenInfoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!tokenInfoRes.ok) {
    throw new Error('TOKEN_INVALID');
  }
  const tInfo = (await tokenInfoRes.json()) as { email?: string };
  if (!tInfo.email) {
    throw new Error('TOKEN_NO_EMAIL');
  }
  return {
    email: tInfo.email.trim().toLowerCase(),
    name: tInfo.email.split('@')[0],
  };
}

async function getSpreadsheetMeta(spreadsheetId: string, accessToken: string) {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties`,
    accessToken
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ไม่สามารถเข้าถึง Google Sheets ได้ (${res.status}): ${text}`);
  }
  return (await res.json()) as {
    spreadsheetId: string;
    properties: { title: string };
    sheets: Array<{ properties: { sheetId: number; title: string } }>;
  };
}

async function ensureAllSheetsExist(spreadsheetId: string, accessToken: string) {
  const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  const existingTitles = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  const addRequests: Array<Record<string, unknown>> = [];

  for (const name of Object.keys(SHEET_HEADERS)) {
    if (!existingTitles.has(name)) {
      addRequests.push({
        addSheet: {
          properties: {
            title: name,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      });
    }
  }

  if (addRequests.length > 0) {
    const batchRes = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: addRequests }),
      }
    );
    if (!batchRes.ok) {
      const errText = await batchRes.text();
      throw new Error(`ไม่สามารถสร้างแผ่นงานใน Google Sheets ได้: ${errText}`);
    }
  }

  // Ensure headers on all 6 sheets
  const updatedMeta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  const sheetIdMap = new Map(updatedMeta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));

  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    const readRes = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!1:1`)}`,
      accessToken
    );
    let needHeader = true;
    if (readRes.ok) {
      const readData = (await readRes.json()) as { values?: string[][] };
      if (readData.values && readData.values[0] && readData.values[0].length >= headers.length) {
        needHeader = false;
      }
    }
    if (needHeader) {
      await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A1`)}?valueInputOption=USER_ENTERED`,
        accessToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [headers] }),
        }
      );

      const sheetId = sheetIdMap.get(sheetName);
      if (sheetId !== undefined) {
        await googleFetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
          accessToken,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [
                {
                  repeatCell: {
                    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: headers.length },
                    cell: {
                      userEnteredFormat: {
                        backgroundColor: { red: 0.043, green: 0.231, blue: 0.173 },
                        textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                      },
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)',
                  },
                },
              ],
            }),
          }
        );
      }
    }
  }
}

async function readSheetRows(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<Array<Record<string, string | number>>> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}`,
    accessToken
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`อ่านข้อมูลแผ่นงาน ${sheetName} ไม่สำเร็จ: ${txt}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values || [];
  if (values.length <= 1) return [];
  const headers = values[0] && values[0].length > 0 ? values[0] : SHEET_HEADERS[sheetName];
  const rows: Array<Record<string, string | number>> = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || !row[0]) continue;
    const obj: Record<string, string | number> = {};
    headers.forEach((h, idx) => {
      const val = row[idx] !== undefined ? row[idx] : '';
      if (h === 'No' || h === 'IssueCount') {
        obj[h] = val === '' ? 0 : Number(val);
      } else {
        obj[h] = val;
      }
    });
    rows.push(obj);
  }
  return rows;
}

async function ensureAndReadPrimaryRows(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<Array<Record<string, string | number>>> {
  try {
    return await readSheetRows(spreadsheetId, sheetName, accessToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Unable to parse range') || msg.includes('400')) {
      await ensureAllSheetsExist(spreadsheetId, accessToken);
      return await readSheetRows(spreadsheetId, sheetName, accessToken);
    }
    throw err;
  }
}

function matrixToTypedObjects(
  values: string[][],
  defaultHeaders: string[],
  sourceSheet: string
): Array<Record<string, string | number | boolean>> {
  if (!values || values.length <= 1) return [];
  const headers = values[0] && values[0].length > 0 ? values[0] : defaultHeaders;
  const rows: Array<Record<string, string | number | boolean>> = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || !row[0]) continue;
    const obj: Record<string, string | number | boolean> = {};
    headers.forEach((h, idx) => {
      const val = row[idx] !== undefined ? row[idx] : '';
      if (h === 'No' || h === 'IssueCount') {
        obj[h] = val === '' ? 0 : Number(val);
      } else {
        obj[h] = val;
      }
    });
    obj.SourceSheet = sourceSheet;
    obj.IsExternalSheet = false;
    rows.push(obj);
  }
  return rows;
}

async function readAllSpreadsheetTabsRaw(
  spreadsheetId: string,
  accessToken: string
): Promise<{
  spreadsheetTitle: string;
  tabs: string[];
  sheets: Array<{ sheetName: string; matrix: string[][] }>;
}> {
  const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  const tabs = meta.sheets.map((s) => s.properties.title);
  const sheets: Array<{ sheetName: string; matrix: string[][] }> = [];

  const chunkSize = 25;
  for (let i = 0; i < tabs.length; i += chunkSize) {
    const chunkTabs = tabs.slice(i, i + chunkSize);
    const params = new URLSearchParams();
    chunkTabs.forEach((tab) => {
      const escaped = tab.replace(/'/g, "''");
      params.append('ranges', `'${escaped}'`);
    });
    const batchRes = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
      accessToken
    );
    if (!batchRes.ok) {
      const txt = await batchRes.text();
      throw new Error(`ไม่สามารถอ่านข้อมูลแผ่นงานได้: ${txt}`);
    }
    const batchJson = (await batchRes.json()) as {
      valueRanges?: Array<{ range?: string; values?: string[][] }>;
    };
    const valueRanges = batchJson.valueRanges || [];
    chunkTabs.forEach((tabName, idx) => {
      sheets.push({
        sheetName: tabName,
        matrix: valueRanges[idx]?.values || [],
      });
    });
  }

  return {
    spreadsheetTitle: meta.properties.title,
    tabs,
    sheets,
  };
}

async function readAllConfiguredSheetsData(
  spreadsheetId: string,
  accessToken: string,
  sheetConfig?: MultiSheetSettings
) {
  const { sheets } = await readAllSpreadsheetTabsRaw(spreadsheetId, accessToken);
  const pullAllSheets = sheetConfig?.pullAllSheets !== false;
  const splitPerIssue = sheetConfig?.splitPerIssue !== false;
  const rulesMap = new Map((sheetConfig?.sheetRules || []).map((r) => [r.sheetName, r]));

  const isSheetEnabled = (name: string, defaultEnabled: boolean): boolean => {
    const rule = rulesMap.get(name);
    if (rule) {
      if (!rule.enabled || rule.module === 'skip') return false;
      return true;
    }
    return defaultEnabled;
  };

  const sheetMap = new Map(sheets.map((s) => [s.sheetName, s.matrix]));

  const coopPrimary =
    sheetMap.has(SHEET_NAMES.COOP) && isSheetEnabled(SHEET_NAMES.COOP, true)
      ? matrixToTypedObjects(sheetMap.get(SHEET_NAMES.COOP)!, SHEET_HEADERS.CooperativeObservations, SHEET_NAMES.COOP)
      : [];
  const farmerPrimary =
    sheetMap.has(SHEET_NAMES.FARMER) && isSheetEnabled(SHEET_NAMES.FARMER, true)
      ? matrixToTypedObjects(sheetMap.get(SHEET_NAMES.FARMER)!, SHEET_HEADERS.FarmerGroupObservations, SHEET_NAMES.FARMER)
      : [];
  const defectsPrimary =
    sheetMap.has(SHEET_NAMES.DEFECTS) && isSheetEnabled(SHEET_NAMES.DEFECTS, true)
      ? matrixToTypedObjects(sheetMap.get(SHEET_NAMES.DEFECTS)!, SHEET_HEADERS.Defects, SHEET_NAMES.DEFECTS)
      : [];
  const attachments = sheetMap.has(SHEET_NAMES.ATTACHMENTS)
    ? matrixToTypedObjects(sheetMap.get(SHEET_NAMES.ATTACHMENTS)!, SHEET_HEADERS.Attachments, SHEET_NAMES.ATTACHMENTS)
    : [];

  const coopObservations = [...coopPrimary];
  const farmerObservations = [...farmerPrimary];
  const defects = [...defectsPrimary];

  const primarySet = new Set<string>([
    SHEET_NAMES.COOP,
    SHEET_NAMES.FARMER,
    SHEET_NAMES.DEFECTS,
    SHEET_NAMES.ATTACHMENTS,
    SHEET_NAMES.LOGS,
    SHEET_NAMES.USERS,
  ]);

  const sheetSources: Array<{
    sheetName: string;
    moduleType: 'coop' | 'farmer' | 'defects' | 'system' | 'unsupported';
    accountingYear?: string;
    rowCount: number;
    enabled: boolean;
  }> = [];

  if (sheetMap.has(SHEET_NAMES.COOP)) {
    sheetSources.push({
      sheetName: SHEET_NAMES.COOP,
      moduleType: 'coop',
      rowCount: coopPrimary.length,
      enabled: isSheetEnabled(SHEET_NAMES.COOP, true),
    });
  }
  if (sheetMap.has(SHEET_NAMES.FARMER)) {
    sheetSources.push({
      sheetName: SHEET_NAMES.FARMER,
      moduleType: 'farmer',
      rowCount: farmerPrimary.length,
      enabled: isSheetEnabled(SHEET_NAMES.FARMER, true),
    });
  }
  if (sheetMap.has(SHEET_NAMES.DEFECTS)) {
    sheetSources.push({
      sheetName: SHEET_NAMES.DEFECTS,
      moduleType: 'defects',
      rowCount: defectsPrimary.length,
      enabled: isSheetEnabled(SHEET_NAMES.DEFECTS, true),
    });
  }

  let coopNo = coopObservations.length + 1;
  let farmerNo = farmerObservations.length + 1;
  let defectNo = defects.length + 1;
  const nowIso = new Date().toISOString();

  sheets.forEach((sheet, sIdx) => {
    if (primarySet.has(sheet.sheetName)) return;

    const rule = rulesMap.get(sheet.sheetName);
    const forcedModule =
      rule?.module && rule.module !== 'auto' && rule.module !== 'skip'
        ? rule.module
        : undefined;

    const parsed = parseSheetAuto(sheet.sheetName, sheet.matrix, {
      accountingYearOverride: rule?.accountingYearOverride,
      splitPerIssue,
      forcedModule,
    });

    const enabled = isSheetEnabled(sheet.sheetName, pullAllSheets);

    sheetSources.push({
      sheetName: sheet.sheetName,
      moduleType: parsed.moduleType,
      accountingYear: parsed.accountingYear,
      rowCount: parsed.rowCount,
      enabled,
    });

    if (!enabled || parsed.rowCount === 0) return;

    parsed.coopRows.forEach((r, rIdx) => {
      const dupInPrimary = coopPrimary.some(
        (p) =>
          String(p.CooperativeName).trim() === r.CooperativeName.trim() &&
          String(p.AccountingYear).trim() === r.AccountingYear.trim() &&
          String(p.ObservationDetails).trim() === r.ObservationDetails.trim()
      );
      if (dupInPrimary) return;
      coopObservations.push({
        ID: `EXT-COOP-${sIdx}-${rIdx + 1}`,
        No: coopNo++,
        CooperativeName: r.CooperativeName,
        LetterInfo: r.LetterInfo,
        AccountingYear: r.AccountingYear,
        IssueCount: r.IssueCount,
        ObservationDetails: r.ObservationDetails,
        CorrectionGuidelines: r.CorrectionGuidelines,
        Status: r.Status,
        CreatedAt: nowIso,
        UpdatedAt: nowIso,
        CreatedBy: `Sheet: ${sheet.sheetName}`,
        UpdatedBy: `Sheet: ${sheet.sheetName}`,
        SourceSheet: sheet.sheetName,
        IsExternalSheet: true,
      });
    });

    parsed.farmerRows.forEach((r, rIdx) => {
      const dupInPrimary = farmerPrimary.some(
        (p) =>
          String(p.FarmerGroupName).trim() === r.FarmerGroupName.trim() &&
          String(p.AccountingYear).trim() === r.AccountingYear.trim() &&
          String(p.ObservationDetails).trim() === r.ObservationDetails.trim()
      );
      if (dupInPrimary) return;
      farmerObservations.push({
        ID: `EXT-FARM-${sIdx}-${rIdx + 1}`,
        No: farmerNo++,
        FarmerGroupName: r.FarmerGroupName,
        AccountingYear: r.AccountingYear,
        AuditOfficeLetterNumber: r.AuditOfficeLetterNumber,
        AuditOfficeLetterDate: r.AuditOfficeLetterDate,
        CorrectionNotificationLetterNumber: r.CorrectionNotificationLetterNumber,
        CorrectionNotificationLetterDate: r.CorrectionNotificationLetterDate,
        IssueCount: r.IssueCount,
        ObservationDetails: r.ObservationDetails,
        CorrectionGuidelines: r.CorrectionGuidelines,
        Status: r.Status,
        CreatedAt: nowIso,
        UpdatedAt: nowIso,
        CreatedBy: `Sheet: ${sheet.sheetName}`,
        UpdatedBy: `Sheet: ${sheet.sheetName}`,
        SourceSheet: sheet.sheetName,
        IsExternalSheet: true,
      });
    });

    parsed.defectRows.forEach((r, rIdx) => {
      const dupInPrimary = defectsPrimary.some(
        (p) =>
          String(p.CooperativeName).trim() === r.CooperativeName.trim() &&
          String(p.OrderNumber).trim() === r.OrderNumber.trim() &&
          String(p.DefectDetails).trim() === r.DefectDetails.trim()
      );
      if (dupInPrimary) return;
      defects.push({
        ID: `EXT-DEF-${sIdx}-${rIdx + 1}`,
        No: defectNo++,
        CooperativeName: r.CooperativeName,
        OrderNumber: r.OrderNumber,
        OrderDate: r.OrderDate,
        DefectDetails: r.DefectDetails,
        CorrectionResults: r.CorrectionResults,
        DefectStatus: r.DefectStatus,
        CreatedAt: nowIso,
        UpdatedAt: nowIso,
        CreatedBy: `Sheet: ${sheet.sheetName}`,
        UpdatedBy: `Sheet: ${sheet.sheetName}`,
        SourceSheet: sheet.sheetName,
        IsExternalSheet: true,
      });
    });
  });

  return {
    coopObservations,
    farmerObservations,
    defects,
    attachments,
    sheetSources,
  };
}

async function appendSheetObject(
  spreadsheetId: string,
  sheetName: string,
  obj: Record<string, string | number>,
  accessToken: string
) {
  const headers = SHEET_HEADERS[sheetName];
  const row = headers.map((h) => (obj[h] !== undefined ? String(obj[h]) : ''));
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`บันทึกข้อมูลลงแผ่นงาน ${sheetName} ไม่สำเร็จ: ${txt}`);
  }
}

async function appendSheetObjects(
  spreadsheetId: string,
  sheetName: string,
  objs: Array<Record<string, string | number>>,
  accessToken: string
) {
  if (objs.length === 0) return;
  const headers = SHEET_HEADERS[sheetName];
  const chunkSize = 200;
  for (let i = 0; i < objs.length; i += chunkSize) {
    const chunk = objs.slice(i, i + chunkSize);
    const values = chunk.map((obj) => headers.map((h) => (obj[h] !== undefined ? String(obj[h]) : '')));
    const res = await googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`บันทึกข้อมูลลงแผ่นงาน ${sheetName} ไม่สำเร็จ: ${txt}`);
    }
  }
}

async function updateSheetRowById(
  spreadsheetId: string,
  sheetName: string,
  id: string,
  updater: (oldObj: Record<string, string | number>) => Record<string, string | number>,
  accessToken: string
): Promise<{ oldObj: Record<string, string | number>; newObj: Record<string, string | number> }> {
  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}`,
    accessToken
  );
  if (!res.ok) {
    throw new Error(`ไม่สามารถอ่านแผ่นงาน ${sheetName} เพื่อแก้ไขข้อมูล`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values || [];
  const headers = values[0] && values[0].length > 0 ? values[0] : SHEET_HEADERS[sheetName];
  let targetRowNumber = -1;
  let oldObj: Record<string, string | number> = {};

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      targetRowNumber = i + 1;
      headers.forEach((h, idx) => {
        const val = values[i][idx] !== undefined ? values[i][idx] : '';
        oldObj[h] = h === 'No' || h === 'IssueCount' ? Number(val || 0) : val;
      });
      break;
    }
  }

  if (targetRowNumber === -1) {
    throw new Error(`NOT_FOUND:ไม่พบรายการที่ต้องการแก้ไข (ID: ${id})`);
  }

  const newObj = updater(oldObj);
  const row = headers.map((h) => (newObj[h] !== undefined ? String(newObj[h]) : ''));
  const putRes = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A${targetRowNumber}`)}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!putRes.ok) {
    const txt = await putRes.text();
    throw new Error(`แก้ไขข้อมูลใน Google Sheets ไม่สำเร็จ: ${txt}`);
  }
  return { oldObj, newObj };
}

async function deleteSheetRowById(
  spreadsheetId: string,
  sheetName: string,
  id: string,
  accessToken: string,
  resequenceNoColumn = true
): Promise<Record<string, string | number>> {
  const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
  const sheetMeta = meta.sheets.find((s) => s.properties.title === sheetName);
  if (!sheetMeta) {
    throw new Error(`ไม่พบแผ่นงาน ${sheetName}`);
  }
  const sheetId = sheetMeta.properties.sheetId;

  const res = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheetName)}`,
    accessToken
  );
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values || [];
  const headers = SHEET_HEADERS[sheetName];
  let targetZeroIndex = -1;
  let oldObj: Record<string, string | number> = {};

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      targetZeroIndex = i;
      headers.forEach((h, idx) => {
        const val = values[i][idx] !== undefined ? values[i][idx] : '';
        oldObj[h] = h === 'No' || h === 'IssueCount' ? Number(val || 0) : val;
      });
      break;
    }
  }

  if (targetZeroIndex === -1) {
    throw new Error(`NOT_FOUND:ไม่พบรายการที่ต้องการลบ (ID: ${id})`);
  }

  const delRes = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: targetZeroIndex,
                endIndex: targetZeroIndex + 1,
              },
            },
          },
        ],
      }),
    }
  );
  if (!delRes.ok) {
    const txt = await delRes.text();
    throw new Error(`ลบข้อมูลใน Google Sheets ไม่สำเร็จ: ${txt}`);
  }

  if (resequenceNoColumn && headers[1] === 'No') {
    const remainingCount = values.length - 2; // minus header and deleted row
    if (remainingCount > 0) {
      const seqValues = Array.from({ length: remainingCount }, (_, idx) => [String(idx + 1)]);
      await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!B2:B${remainingCount + 1}`)}?valueInputOption=USER_ENTERED`,
        accessToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: seqValues }),
        }
      );
    }
  }

  return oldObj;
}

async function appendActivityLog(
  spreadsheetId: string,
  recordId: string,
  recordType: string,
  action: string,
  oldValue: unknown,
  newValue: unknown,
  actionBy: string,
  accessToken: string
) {
  const logObj = {
    ID: genId('LOG'),
    RecordID: recordId,
    RecordType: recordType,
    Action: action,
    OldValue: oldValue ? (typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue)) : '',
    NewValue: newValue ? (typeof newValue === 'string' ? newValue : JSON.stringify(newValue)) : '',
    ActionBy: actionBy,
    ActionDate: new Date().toISOString(),
  };
  await appendSheetObject(spreadsheetId, SHEET_NAMES.LOGS, logObj, accessToken);
}

async function appendActivityLogsBatch(
  spreadsheetId: string,
  entries: Array<{
    recordId: string;
    recordType: string;
    action: string;
    oldValue: unknown;
    newValue: unknown;
    actionBy: string;
  }>,
  accessToken: string
) {
  if (entries.length === 0) return;
  const actionDate = new Date().toISOString();
  const logObjs = entries.map((e) => ({
    ID: genId('LOG'),
    RecordID: e.recordId,
    RecordType: e.recordType,
    Action: e.action,
    OldValue: e.oldValue ? (typeof e.oldValue === 'string' ? e.oldValue : JSON.stringify(e.oldValue)) : '',
    NewValue: e.newValue ? (typeof e.newValue === 'string' ? e.newValue : JSON.stringify(e.newValue)) : '',
    ActionBy: e.actionBy,
    ActionDate: actionDate,
  }));
  await appendSheetObjects(spreadsheetId, SHEET_NAMES.LOGS, logObjs, accessToken);
}

async function resolveUserRole(
  spreadsheetId: string,
  identity: { email: string; name: string },
  accessToken: string
): Promise<{ role: 'Admin' | 'Staff'; userId: string }> {
  let users: Array<Record<string, string | number>> = [];
  try {
    users = await readSheetRows(spreadsheetId, SHEET_NAMES.USERS, accessToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    // If connecting an existing multi-sheet spreadsheet that doesn't have the Users sheet yet, treat verified Google owner/editor as Admin
    if (msg.includes('Unable to parse range') || msg.includes('400')) {
      return { role: 'Admin', userId: 'OWNER' };
    }
    throw err;
  }
  if (users.length === 0) {
    const now = new Date().toISOString();
    const newAdmin = {
      ID: genId('USR'),
      Email: identity.email,
      DisplayName: identity.name,
      Role: 'Admin',
      IsActive: 'TRUE',
      CreatedAt: now,
      UpdatedAt: now,
    };
    await appendSheetObject(spreadsheetId, SHEET_NAMES.USERS, newAdmin, accessToken);
    return { role: 'Admin', userId: newAdmin.ID };
  }

  const matched = users.find(
    (u) => String(u.Email || '').trim().toLowerCase() === identity.email
  );
  if (!matched) {
    throw new Error('FORBIDDEN:บัญชีของท่านยังไม่ได้รับสิทธิ์เข้าใช้งานระบบ กรุณาติดต่อผู้ดูแลระบบ (Admin)');
  }
  if (String(matched.IsActive).toUpperCase() !== 'TRUE') {
    throw new Error('FORBIDDEN:บัญชีของท่านถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ (Admin)');
  }

  return {
    role: matched.Role === 'Admin' ? 'Admin' : 'Staff',
    userId: String(matched.ID),
  };
}

function handleApiError(res: Response, err: unknown) {
  const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบ';
  if (msg === 'TOKEN_INVALID' || msg === 'TOKEN_NO_EMAIL') {
    return res.status(401).json({ success: false, error: 'เซสชัน Google หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
  }
  if (msg.startsWith('FORBIDDEN:')) {
    return res.status(403).json({ success: false, error: msg.replace('FORBIDDEN:', '') });
  }
  if (msg.startsWith('NOT_FOUND:')) {
    return res.status(404).json({ success: false, error: msg.replace('NOT_FOUND:', '') });
  }
  if (msg.startsWith('VALIDATION:')) {
    return res.status(400).json({ success: false, error: msg.replace('VALIDATION:', '') });
  }
  return res.status(500).json({ success: false, error: msg });
}

async function requireAuthToken(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนทำรายการ' });
    }
    const identity = await resolveGoogleIdentity(token);
    req.user = {
      email: identity.email,
      name: identity.name,
      accessToken: token,
      role: 'Staff',
    };
    req.spreadsheetId = String(req.headers['x-spreadsheet-id'] || req.query.spreadsheetId || '').trim();
    req.driveFolderId = String(req.headers['x-drive-folder-id'] || req.query.driveFolderId || '').trim();
    const rawSheetCfg = String(req.headers['x-sheet-config'] || '').trim();
    if (rawSheetCfg) {
      try {
        req.sheetConfig = JSON.parse(decodeURIComponent(rawSheetCfg)) as MultiSheetSettings;
      } catch {
        // ignore malformed sheet config header
      }
    }
    next();
  } catch (err) {
    handleApiError(res, err);
  }
}

async function requireSpreadsheetAndRole(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'ไม่ได้รับอนุญาต' });
    }
    if (!req.spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'ยังไม่ได้ตั้งค่า Google Spreadsheet ID กรุณาตั้งค่าการเชื่อมต่อฐานข้อมูลก่อนใช้งาน',
      });
    }
    const resolved = await resolveUserRole(req.spreadsheetId, req.user, req.user.accessToken);
    req.user.role = resolved.role;
    req.user.userId = resolved.userId;
    next();
  } catch (err) {
    handleApiError(res, err);
  }
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({
      success: false,
      error: 'การดำเนินการนี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น',
    });
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', service: 'CO-OP WATCHING SYSTEM' });
  });

  // Serve Google Apps Script source file for documentation/copy
  app.get('/apps-script/Code.gs', (_req, res) => {
    const filePath = path.resolve(process.cwd(), 'apps-script', 'Code.gs');
    if (fs.existsSync(filePath)) {
      res.type('text/plain; charset=utf-8').send(fs.readFileSync(filePath, 'utf-8'));
    } else {
      res.status(404).send('// Code.gs not found');
    }
  });

  // Bootstrap / Create new Spreadsheet + Drive Folder OR Initialize existing Spreadsheet
  app.post('/api/workspace/bootstrap', requireAuthToken, async (req: AuthedRequest, res: Response) => {
    try {
      const accessToken = req.user!.accessToken;
      let { spreadsheetId, driveFolderId, createNewSpreadsheet, createNewFolder } = req.body as {
        spreadsheetId?: string;
        driveFolderId?: string;
        createNewSpreadsheet?: boolean;
        createNewFolder?: boolean;
      };

      let spreadsheetTitle = '';
      if (createNewSpreadsheet) {
        const createRes = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets', accessToken, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: {
              title: 'CO-OP WATCHING SYSTEM - ฐานข้อมูลสำนักงานสหกรณ์จังหวัดชัยนาท',
              locale: 'th_TH',
            },
            sheets: Object.keys(SHEET_HEADERS).map((title) => ({
              properties: { title, gridProperties: { frozenRowCount: 1 } },
            })),
          }),
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`ไม่สามารถสร้าง Google Spreadsheet ใหม่ได้: ${errText}`);
        }
        const created = (await createRes.json()) as {
          spreadsheetId: string;
          properties: { title: string };
        };
        spreadsheetId = created.spreadsheetId;
        spreadsheetTitle = created.properties.title;
      }

      if (!spreadsheetId) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุ Spreadsheet ID หรือเลือกสร้างใหม่' });
      }

      await ensureAllSheetsExist(spreadsheetId, accessToken);
      const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
      spreadsheetTitle = meta.properties.title;

      // Ensure current user is registered as Admin if Users sheet is empty
      const roleRes = await resolveUserRole(spreadsheetId, req.user!, accessToken);

      let folderName = '';
      if (createNewFolder) {
        const folderRes = await googleFetch('https://www.googleapis.com/drive/v3/files', accessToken, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'CO-OP WATCHING SYSTEM - เอกสารแนบ (ชัยนาท)',
            mimeType: 'application/vnd.google-apps.folder',
          }),
        });
        if (!folderRes.ok) {
          const errText = await folderRes.text();
          throw new Error(`ไม่สามารถสร้างโฟลเดอร์ Google Drive ใหม่ได้: ${errText}`);
        }
        const createdFolder = (await folderRes.json()) as { id: string; name: string };
        driveFolderId = createdFolder.id;
        folderName = createdFolder.name;
      } else if (driveFolderId) {
        const fRes = await googleFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFolderId)}?fields=id,name,mimeType`,
          accessToken
        );
        if (fRes.ok) {
          const fData = (await fRes.json()) as { id: string; name: string };
          folderName = fData.name;
        }
      }

      res.json({
        success: true,
        message: 'เตรียมฐานข้อมูล Google Sheets และ Google Drive สำเร็จ',
        data: {
          spreadsheetId,
          spreadsheetTitle,
          driveFolderId: driveFolderId || '',
          folderName,
          role: roleRes.role,
          sheets: meta.sheets.map((s) => s.properties.title),
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Real connection verification
  app.post('/api/workspace/test', requireAuthToken, async (req: AuthedRequest, res: Response) => {
    try {
      const accessToken = req.user!.accessToken;
      const spreadsheetId = String(req.body.spreadsheetId || req.spreadsheetId || '').trim();
      const driveFolderId = String(req.body.driveFolderId || req.driveFolderId || '').trim();

      if (!spreadsheetId) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุ Spreadsheet ID' });
      }

      const meta = await getSpreadsheetMeta(spreadsheetId, accessToken);
      const existingTitles = meta.sheets.map((s) => s.properties.title);
      const requiredSheets = Object.keys(SHEET_HEADERS);
      const missingSheets = requiredSheets.filter((s) => !existingTitles.includes(s));

      let driveStatus: { connected: boolean; folderName?: string; error?: string } = {
        connected: false,
        error: 'ยังไม่ได้ระบุ Google Drive Folder ID',
      };

      if (driveFolderId) {
        const fRes = await googleFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFolderId)}?fields=id,name,mimeType,capabilities`,
          accessToken
        );
        if (fRes.ok) {
          const fData = (await fRes.json()) as { id: string; name: string; mimeType: string };
          if (fData.mimeType !== 'application/vnd.google-apps.folder') {
            driveStatus = { connected: false, error: 'ID ที่ระบุไม่ใช่โฟลเดอร์ Google Drive' };
          } else {
            driveStatus = { connected: true, folderName: fData.name };
          }
        } else {
          driveStatus = { connected: false, error: `ไม่สามารถเข้าถึงโฟลเดอร์ Drive (${fRes.status})` };
        }
      }

      res.json({
        success: true,
        data: {
          spreadsheetConnected: true,
          spreadsheetTitle: meta.properties.title,
          existingSheets: existingTitles,
          missingSheets,
          driveStatus,
          userEmail: req.user!.email,
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Inspect all sheets/tabs in any Spreadsheet to configure multi-sheet display mapping
  app.post('/api/workspace/inspect-sheets', requireAuthToken, async (req: AuthedRequest, res: Response) => {
    try {
      const targetId = String(req.body.spreadsheetId || req.spreadsheetId || '').trim();
      if (!targetId) throw new Error('VALIDATION:กรุณาระบุ Google Spreadsheet ID');

      const { spreadsheetTitle, sheets } = await readAllSpreadsheetTabsRaw(targetId, req.user!.accessToken);
      const primarySet = new Set<string>([
        SHEET_NAMES.COOP,
        SHEET_NAMES.FARMER,
        SHEET_NAMES.DEFECTS,
        SHEET_NAMES.ATTACHMENTS,
        SHEET_NAMES.LOGS,
        SHEET_NAMES.USERS,
      ]);

      const inspected = sheets.map((s) => {
        const parsed = parseSheetAuto(s.sheetName, s.matrix);
        const firstNonEmpty = s.matrix.find((row) => row.some((c) => String(c || '').trim() !== '')) || [];
        return {
          sheetName: s.sheetName,
          isPrimarySystemSheet: primarySet.has(s.sheetName),
          detectedModule: parsed.moduleType,
          accountingYear: parsed.accountingYear || '',
          rowCount: primarySet.has(s.sheetName)
            ? Math.max(0, s.matrix.filter((r) => r && r[0]).length - 1)
            : parsed.rowCount,
          headers: firstNonEmpty.filter(Boolean).slice(0, 8),
        };
      });

      res.json({
        success: true,
        data: {
          spreadsheetTitle,
          sheets: inspected,
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Current authenticated profile & role
  app.get('/api/me', requireAuthToken, requireSpreadsheetAndRole, (req: AuthedRequest, res: Response) => {
    res.json({
      success: true,
      data: {
        email: req.user!.email,
        name: req.user!.name,
        role: req.user!.role,
        userId: req.user!.userId,
      },
    });
  });

  // Dashboard real-time aggregation across all configured Google Sheets tabs
  app.get('/api/dashboard', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const accessToken = req.user!.accessToken;
      const spreadsheetId = req.spreadsheetId!;

      const payload = await readAllConfiguredSheetsData(spreadsheetId, accessToken, req.sheetConfig);

      res.json({
        success: true,
        data: {
          coopObservations: payload.coopObservations,
          farmerObservations: payload.farmerObservations,
          defects: payload.defects,
          attachmentsCount: payload.attachments.length,
          sheetSources: payload.sheetSources,
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 1.1 Cooperative Observations CRUD
  app.get('/api/coop-observations', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const payload = await readAllConfiguredSheetsData(req.spreadsheetId!, req.user!.accessToken, req.sheetConfig);
      res.json({ success: true, data: payload.coopObservations });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/coop-observations', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const CooperativeName = String(body.CooperativeName || '').trim();
      const LetterInfo = String(body.LetterInfo || '').trim();
      const AccountingYear = String(body.AccountingYear || '').trim();
      const IssueCount = Number(body.IssueCount);
      const ObservationDetails = String(body.ObservationDetails || '').trim();
      const CorrectionGuidelines = String(body.CorrectionGuidelines || '').trim();
      const Status = String(body.Status || '').trim();

      if (!CooperativeName) throw new Error('VALIDATION:กรุณาระบุชื่อสหกรณ์');
      if (!AccountingYear) throw new Error('VALIDATION:กรุณาระบุปีบัญชี');
      if (!Number.isInteger(IssueCount) || IssueCount < 1) {
        throw new Error('VALIDATION:จำนวนประเด็นต้องเป็นจำนวนเต็มมากกว่า 0');
      }
      if (!ObservationDetails) throw new Error('VALIDATION:กรุณาระบุข้อสังเกตที่ตรวจพบ');
      if (!CorrectionGuidelines) throw new Error('VALIDATION:กรุณาระบุแนวทางการแก้ไข');
      if (!OBSERVATION_STATUSES.includes(Status)) {
        throw new Error('VALIDATION:สถานะการดำเนินการไม่ถูกต้อง');
      }

      const existing = await ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.COOP, req.user!.accessToken);
      const duplicate = existing.some(
        (r) =>
          String(r.CooperativeName).trim() === CooperativeName &&
          String(r.AccountingYear).trim() === AccountingYear &&
          String(r.ObservationDetails).trim() === ObservationDetails
      );
      if (duplicate) {
        throw new Error('VALIDATION:พบข้อมูลข้อสังเกตของสหกรณ์ ปีบัญชี และรายละเอียดนี้ซ้ำในระบบ');
      }

      const now = new Date().toISOString();
      const record = {
        ID: genId('COOP'),
        No: existing.length + 1,
        CooperativeName,
        LetterInfo,
        AccountingYear,
        IssueCount,
        ObservationDetails,
        CorrectionGuidelines,
        Status,
        CreatedAt: now,
        UpdatedAt: now,
        CreatedBy: req.user!.email,
        UpdatedBy: req.user!.email,
      };

      await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.COOP, record, req.user!.accessToken);
      await appendActivityLog(
        req.spreadsheetId!,
        record.ID,
        SHEET_NAMES.COOP,
        'CREATE',
        null,
        record,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: record });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Batch import Cooperative Observations (from attached CSV, uploaded CSV, or existing Google Sheet)
  app.post('/api/coop-observations/import', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const items = (req.body as { rows?: Array<Record<string, unknown>> }).rows;
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('VALIDATION:ไม่พบรายการข้อมูลที่ต้องการนำเข้า');
      }

      const existing = await ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.COOP, req.user!.accessToken);
      let nextNo = existing.length + 1;
      const inserted: Array<Record<string, string | number>> = [];
      let skippedDuplicates = 0;
      const now = new Date().toISOString();

      for (const item of items) {
        const CooperativeName = String(item.CooperativeName || '').trim();
        const LetterInfo = String(item.LetterInfo || '').trim();
        const AccountingYear = String(item.AccountingYear || '').trim();
        const IssueCount = Number(item.IssueCount || 1);
        const ObservationDetails = String(item.ObservationDetails || '').trim();
        const CorrectionGuidelines = String(item.CorrectionGuidelines || '').trim();
        const Status = OBSERVATION_STATUSES.includes(String(item.Status))
          ? String(item.Status)
          : 'อยู่ระหว่างดำเนินการ';

        if (!CooperativeName || !ObservationDetails) continue;

        const isDup =
          existing.some(
            (r) =>
              String(r.CooperativeName).trim() === CooperativeName &&
              String(r.AccountingYear).trim() === AccountingYear &&
              String(r.ObservationDetails).trim() === ObservationDetails
          ) ||
          inserted.some(
            (r) =>
              String(r.CooperativeName).trim() === CooperativeName &&
              String(r.AccountingYear).trim() === AccountingYear &&
              String(r.ObservationDetails).trim() === ObservationDetails
          );

        if (isDup) {
          skippedDuplicates++;
          continue;
        }

        const record = {
          ID: genId('COOP'),
          No: nextNo++,
          CooperativeName,
          LetterInfo,
          AccountingYear,
          IssueCount: Number.isInteger(IssueCount) && IssueCount > 0 ? IssueCount : 1,
          ObservationDetails,
          CorrectionGuidelines: CorrectionGuidelines || '-',
          Status,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: req.user!.email,
          UpdatedBy: req.user!.email,
        };

        inserted.push(record);
      }

      if (inserted.length > 0) {
        await appendSheetObjects(req.spreadsheetId!, SHEET_NAMES.COOP, inserted, req.user!.accessToken);
        await appendActivityLogsBatch(
          req.spreadsheetId!,
          inserted.map((record) => ({
            recordId: String(record.ID),
            recordType: SHEET_NAMES.COOP,
            action: 'IMPORT',
            oldValue: null,
            newValue: record,
            actionBy: req.user!.email,
          })),
          req.user!.accessToken
        );
      }

      res.json({
        success: true,
        message: `นำเข้าข้อมูลสำเร็จ ${inserted.length} รายการ${
          skippedDuplicates > 0 ? ` (ข้ามข้อมูลซ้ำ ${skippedDuplicates} รายการ)` : ''
        }`,
        data: { insertedCount: inserted.length, skippedDuplicates, inserted },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Read ALL sheets/tabs from any existing Google Spreadsheet via values:batchGet
  app.post('/api/workspace/read-all-sheets', requireAuthToken, async (req: AuthedRequest, res: Response) => {
    try {
      const { sourceSpreadsheetId } = req.body as { sourceSpreadsheetId?: string };
      const targetId = String(sourceSpreadsheetId || '').trim();
      if (!targetId) throw new Error('VALIDATION:กรุณาระบุ Spreadsheet ID ต้นทาง');

      const meta = await getSpreadsheetMeta(targetId, req.user!.accessToken);
      const tabs = meta.sheets.map((s) => s.properties.title);
      const sheets: Array<{ sheetName: string; matrix: string[][] }> = [];

      const chunkSize = 25;
      for (let i = 0; i < tabs.length; i += chunkSize) {
        const chunkTabs = tabs.slice(i, i + chunkSize);
        const params = new URLSearchParams();
        chunkTabs.forEach((tab) => {
          const escaped = tab.replace(/'/g, "''");
          params.append('ranges', `'${escaped}'`);
        });
        const batchRes = await googleFetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(targetId)}/values:batchGet?${params.toString()}`,
          req.user!.accessToken
        );
        if (!batchRes.ok) {
          const txt = await batchRes.text();
          throw new Error(`ไม่สามารถอ่านข้อมูลทุกแผ่นงานได้: ${txt}`);
        }
        const batchJson = (await batchRes.json()) as {
          valueRanges?: Array<{ range?: string; values?: string[][] }>;
        };
        const valueRanges = batchJson.valueRanges || [];
        chunkTabs.forEach((tabName, idx) => {
          sheets.push({
            sheetName: tabName,
            matrix: valueRanges[idx]?.values || [],
          });
        });
      }

      res.json({
        success: true,
        data: {
          spreadsheetTitle: meta.properties.title,
          tabs,
          sheets,
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Batch import across ALL target sheets (CooperativeObservations, FarmerGroupObservations, Defects)
  app.post('/api/workspace/import-all-sheets', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as {
        coopRows?: Array<Record<string, unknown>>;
        farmerRows?: Array<Record<string, unknown>>;
        defectRows?: Array<Record<string, unknown>>;
      };

      const coopItems = Array.isArray(body.coopRows) ? body.coopRows : [];
      const farmerItems = Array.isArray(body.farmerRows) ? body.farmerRows : [];
      const defectItems = Array.isArray(body.defectRows) ? body.defectRows : [];

      if (coopItems.length === 0 && farmerItems.length === 0 && defectItems.length === 0) {
        throw new Error('VALIDATION:ไม่พบรายการข้อมูลที่ต้องการนำเข้าจากทุกแผ่นงาน');
      }

      const [existingCoop, existingFarmer, existingDefects] = await Promise.all([
        coopItems.length > 0 ? ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.COOP, req.user!.accessToken) : Promise.resolve([]),
        farmerItems.length > 0 ? ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.FARMER, req.user!.accessToken) : Promise.resolve([]),
        defectItems.length > 0 ? ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.DEFECTS, req.user!.accessToken) : Promise.resolve([]),
      ]);

      const now = new Date().toISOString();
      let skippedDuplicates = 0;

      // 1) CooperativeObservations
      const coopInserted: Array<Record<string, string | number>> = [];
      let nextCoopNo = existingCoop.length + 1;
      for (const item of coopItems) {
        const CooperativeName = String(item.CooperativeName || '').trim();
        const LetterInfo = String(item.LetterInfo || '').trim();
        const AccountingYear = String(item.AccountingYear || '').trim();
        const IssueCount = Number(item.IssueCount || 1);
        const ObservationDetails = String(item.ObservationDetails || '').trim();
        const CorrectionGuidelines = String(item.CorrectionGuidelines || '').trim();
        const Status = OBSERVATION_STATUSES.includes(String(item.Status))
          ? String(item.Status)
          : 'อยู่ระหว่างดำเนินการ';

        if (!CooperativeName || !ObservationDetails) continue;
        const isDup =
          existingCoop.some(
            (r) =>
              String(r.CooperativeName).trim() === CooperativeName &&
              String(r.AccountingYear).trim() === AccountingYear &&
              String(r.ObservationDetails).trim() === ObservationDetails
          ) ||
          coopInserted.some(
            (r) =>
              String(r.CooperativeName).trim() === CooperativeName &&
              String(r.AccountingYear).trim() === AccountingYear &&
              String(r.ObservationDetails).trim() === ObservationDetails
          );
        if (isDup) {
          skippedDuplicates++;
          continue;
        }
        coopInserted.push({
          ID: genId('COOP'),
          No: nextCoopNo++,
          CooperativeName,
          LetterInfo,
          AccountingYear,
          IssueCount: Number.isInteger(IssueCount) && IssueCount > 0 ? IssueCount : 1,
          ObservationDetails,
          CorrectionGuidelines: CorrectionGuidelines || '-',
          Status,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: req.user!.email,
          UpdatedBy: req.user!.email,
        });
      }

      // 2) FarmerGroupObservations
      const farmerInserted: Array<Record<string, string | number>> = [];
      let nextFarmerNo = existingFarmer.length + 1;
      for (const item of farmerItems) {
        const FarmerGroupName = String(item.FarmerGroupName || '').trim();
        const AccountingYear = String(item.AccountingYear || '').trim();
        const AuditOfficeLetterNumber = String(item.AuditOfficeLetterNumber || '').trim();
        const AuditOfficeLetterDate = isValidIsoDate(String(item.AuditOfficeLetterDate || ''))
          ? String(item.AuditOfficeLetterDate || '').trim()
          : '';
        const CorrectionNotificationLetterNumber = String(item.CorrectionNotificationLetterNumber || '').trim();
        const CorrectionNotificationLetterDate = isValidIsoDate(String(item.CorrectionNotificationLetterDate || ''))
          ? String(item.CorrectionNotificationLetterDate || '').trim()
          : '';
        const IssueCount = Number(item.IssueCount || 1);
        const ObservationDetails = String(item.ObservationDetails || '').trim();
        const CorrectionGuidelines = String(item.CorrectionGuidelines || '').trim();
        const Status = OBSERVATION_STATUSES.includes(String(item.Status))
          ? String(item.Status)
          : 'อยู่ระหว่างดำเนินการ';

        if (!FarmerGroupName || !ObservationDetails) continue;
        const isDup =
          existingFarmer.some(
            (r) =>
              String(r.FarmerGroupName).trim() === FarmerGroupName &&
              String(r.AccountingYear).trim() === AccountingYear &&
              String(r.AuditOfficeLetterNumber).trim() === AuditOfficeLetterNumber &&
              String(r.ObservationDetails).trim() === ObservationDetails
          ) ||
          farmerInserted.some(
            (r) =>
              String(r.FarmerGroupName).trim() === FarmerGroupName &&
              String(r.AccountingYear).trim() === AccountingYear &&
              String(r.AuditOfficeLetterNumber).trim() === AuditOfficeLetterNumber &&
              String(r.ObservationDetails).trim() === ObservationDetails
          );
        if (isDup) {
          skippedDuplicates++;
          continue;
        }
        farmerInserted.push({
          ID: genId('FARM'),
          No: nextFarmerNo++,
          FarmerGroupName,
          AccountingYear,
          AuditOfficeLetterNumber,
          AuditOfficeLetterDate,
          CorrectionNotificationLetterNumber,
          CorrectionNotificationLetterDate,
          IssueCount: Number.isInteger(IssueCount) && IssueCount > 0 ? IssueCount : 1,
          ObservationDetails,
          CorrectionGuidelines: CorrectionGuidelines || '-',
          Status,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: req.user!.email,
          UpdatedBy: req.user!.email,
        });
      }

      // 3) Defects
      const defectInserted: Array<Record<string, string | number>> = [];
      let nextDefectNo = existingDefects.length + 1;
      for (const item of defectItems) {
        const CooperativeName = String(item.CooperativeName || '').trim();
        const OrderNumber = String(item.OrderNumber || '').trim() || '-';
        const rawDate = String(item.OrderDate || '').trim();
        const OrderDate = rawDate && isValidIsoDate(rawDate) ? rawDate : now.slice(0, 10);
        const DefectDetails = String(item.DefectDetails || '').trim();
        const CorrectionResults = String(item.CorrectionResults || '').trim();
        const DefectStatus = DEFECT_STATUSES.includes(String(item.DefectStatus))
          ? String(item.DefectStatus)
          : 'ยังไม่ได้ดำเนินการแก้ไข';

        if (!CooperativeName || !DefectDetails) continue;
        const isDup =
          existingDefects.some(
            (r) =>
              String(r.CooperativeName).trim() === CooperativeName &&
              String(r.OrderNumber).trim() === OrderNumber &&
              String(r.DefectDetails).trim() === DefectDetails
          ) ||
          defectInserted.some(
            (r) =>
              String(r.CooperativeName).trim() === CooperativeName &&
              String(r.OrderNumber).trim() === OrderNumber &&
              String(r.DefectDetails).trim() === DefectDetails
          );
        if (isDup) {
          skippedDuplicates++;
          continue;
        }
        defectInserted.push({
          ID: genId('DEF'),
          No: nextDefectNo++,
          CooperativeName,
          OrderNumber,
          OrderDate,
          DefectDetails,
          CorrectionResults,
          DefectStatus,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: req.user!.email,
          UpdatedBy: req.user!.email,
        });
      }

      await Promise.all([
        appendSheetObjects(req.spreadsheetId!, SHEET_NAMES.COOP, coopInserted, req.user!.accessToken),
        appendSheetObjects(req.spreadsheetId!, SHEET_NAMES.FARMER, farmerInserted, req.user!.accessToken),
        appendSheetObjects(req.spreadsheetId!, SHEET_NAMES.DEFECTS, defectInserted, req.user!.accessToken),
      ]);

      const logEntries = [
        ...coopInserted.map((r) => ({
          recordId: String(r.ID),
          recordType: SHEET_NAMES.COOP,
          action: 'IMPORT',
          oldValue: null,
          newValue: r,
          actionBy: req.user!.email,
        })),
        ...farmerInserted.map((r) => ({
          recordId: String(r.ID),
          recordType: SHEET_NAMES.FARMER,
          action: 'IMPORT',
          oldValue: null,
          newValue: r,
          actionBy: req.user!.email,
        })),
        ...defectInserted.map((r) => ({
          recordId: String(r.ID),
          recordType: SHEET_NAMES.DEFECTS,
          action: 'IMPORT',
          oldValue: null,
          newValue: r,
          actionBy: req.user!.email,
        })),
      ];

      if (logEntries.length > 0) {
        await appendActivityLogsBatch(req.spreadsheetId!, logEntries, req.user!.accessToken);
      }

      const totalInserted = coopInserted.length + farmerInserted.length + defectInserted.length;
      res.json({
        success: true,
        message: `นำเข้าข้อมูลทุก Sheets สำเร็จ ${totalInserted} รายการ${
          skippedDuplicates > 0 ? ` (ข้ามข้อมูลซ้ำ ${skippedDuplicates} รายการ)` : ''
        }`,
        data: {
          coopInserted: coopInserted.length,
          farmerInserted: farmerInserted.length,
          defectInserted: defectInserted.length,
          totalInserted,
          skippedDuplicates,
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // List tabs and read raw 2D matrix from any existing Google Spreadsheet
  app.post('/api/coop-observations/read-raw-sheet', requireAuthToken, async (req: AuthedRequest, res: Response) => {
    try {
      const { sourceSpreadsheetId, sheetName } = req.body as {
        sourceSpreadsheetId?: string;
        sheetName?: string;
      };
      const targetId = String(sourceSpreadsheetId || '').trim();
      if (!targetId) throw new Error('VALIDATION:กรุณาระบุ Spreadsheet ID ต้นทาง');

      const meta = await getSpreadsheetMeta(targetId, req.user!.accessToken);
      const tabs = meta.sheets.map((s) => s.properties.title);
      const selectedTab = sheetName && tabs.includes(sheetName) ? sheetName : tabs[0];

      const valuesRes = await googleFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(targetId)}/values/${encodeURIComponent(selectedTab)}`,
        req.user!.accessToken
      );
      if (!valuesRes.ok) {
        const txt = await valuesRes.text();
        throw new Error(`ไม่สามารถอ่านแผ่นงาน "${selectedTab}" ได้: ${txt}`);
      }
      const valuesJson = (await valuesRes.json()) as { values?: string[][] };

      res.json({
        success: true,
        data: {
          spreadsheetTitle: meta.properties.title,
          tabs,
          selectedTab,
          matrix: valuesJson.values || [],
        },
      });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.put('/api/coop-observations/:id', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const body = req.body as Record<string, unknown>;
      const CooperativeName = String(body.CooperativeName || '').trim();
      const LetterInfo = String(body.LetterInfo || '').trim();
      const AccountingYear = String(body.AccountingYear || '').trim();
      const IssueCount = Number(body.IssueCount);
      const ObservationDetails = String(body.ObservationDetails || '').trim();
      const CorrectionGuidelines = String(body.CorrectionGuidelines || '').trim();
      const Status = String(body.Status || '').trim();

      if (!CooperativeName) throw new Error('VALIDATION:กรุณาระบุชื่อสหกรณ์');
      if (!AccountingYear) throw new Error('VALIDATION:กรุณาระบุปีบัญชี');
      if (!Number.isInteger(IssueCount) || IssueCount < 1) {
        throw new Error('VALIDATION:จำนวนประเด็นต้องเป็นจำนวนเต็มมากกว่า 0');
      }
      if (!ObservationDetails) throw new Error('VALIDATION:กรุณาระบุข้อสังเกตที่ตรวจพบ');
      if (!CorrectionGuidelines) throw new Error('VALIDATION:กรุณาระบุแนวทางการแก้ไข');
      if (!OBSERVATION_STATUSES.includes(Status)) {
        throw new Error('VALIDATION:สถานะการดำเนินการไม่ถูกต้อง');
      }

      if (id.startsWith('EXT-')) {
        await ensureAllSheetsExist(req.spreadsheetId!, req.user!.accessToken);
        const existingPrimary = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.COOP, req.user!.accessToken);
        const now = new Date().toISOString();
        const promoted = {
          ID: genId('COOP'),
          No: existingPrimary.length + 1,
          CooperativeName,
          LetterInfo,
          AccountingYear,
          IssueCount,
          ObservationDetails,
          CorrectionGuidelines,
          Status,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: req.user!.email,
          UpdatedBy: req.user!.email,
        };
        await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.COOP, promoted, req.user!.accessToken);
        await appendActivityLog(
          req.spreadsheetId!,
          promoted.ID,
          SHEET_NAMES.COOP,
          'UPDATE',
          { sourceId: id },
          promoted,
          req.user!.email,
          req.user!.accessToken
        );
        return res.json({ success: true, message: 'บันทึกการแก้ไขข้อมูลสำเร็จ', data: promoted });
      }

      const existing = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.COOP, req.user!.accessToken);
      const duplicate = existing.some(
        (r) =>
          String(r.ID) !== id &&
          String(r.CooperativeName).trim() === CooperativeName &&
          String(r.AccountingYear).trim() === AccountingYear &&
          String(r.ObservationDetails).trim() === ObservationDetails
      );
      if (duplicate) {
        throw new Error('VALIDATION:พบข้อมูลข้อสังเกตของสหกรณ์ ปีบัญชี และรายละเอียดนี้ซ้ำในระบบ');
      }

      const { oldObj, newObj } = await updateSheetRowById(
        req.spreadsheetId!,
        SHEET_NAMES.COOP,
        id,
        (old) => ({
          ...old,
          CooperativeName,
          LetterInfo,
          AccountingYear,
          IssueCount,
          ObservationDetails,
          CorrectionGuidelines,
          Status,
          UpdatedAt: new Date().toISOString(),
          UpdatedBy: req.user!.email,
        }),
        req.user!.accessToken
      );

      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.COOP,
        'UPDATE',
        oldObj,
        newObj,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: newObj });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.delete('/api/coop-observations/:id', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const oldObj = await deleteSheetRowById(req.spreadsheetId!, SHEET_NAMES.COOP, id, req.user!.accessToken, true);
      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.COOP,
        'DELETE',
        oldObj,
        null,
        req.user!.email,
        req.user!.accessToken
      );
      res.json({ success: true, message: 'ลบข้อมูลข้อสังเกตของสหกรณ์สำเร็จ' });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 1.2 Farmer Group Observations CRUD
  app.get('/api/farmer-observations', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const payload = await readAllConfiguredSheetsData(req.spreadsheetId!, req.user!.accessToken, req.sheetConfig);
      res.json({ success: true, data: payload.farmerObservations });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/farmer-observations', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const FarmerGroupName = String(body.FarmerGroupName || '').trim();
      const AccountingYear = String(body.AccountingYear || '').trim();
      const AuditOfficeLetterNumber = String(body.AuditOfficeLetterNumber || '').trim();
      const AuditOfficeLetterDate = String(body.AuditOfficeLetterDate || '').trim();
      const CorrectionNotificationLetterNumber = String(body.CorrectionNotificationLetterNumber || '').trim();
      const CorrectionNotificationLetterDate = String(body.CorrectionNotificationLetterDate || '').trim();
      const IssueCount = Number(body.IssueCount);
      const ObservationDetails = String(body.ObservationDetails || '').trim();
      const CorrectionGuidelines = String(body.CorrectionGuidelines || '').trim();
      const Status = String(body.Status || '').trim();

      if (!FarmerGroupName) throw new Error('VALIDATION:กรุณาระบุชื่อกลุ่มเกษตรกร');
      if (!AccountingYear) throw new Error('VALIDATION:กรุณาระบุปีบัญชี');
      if (!isValidIsoDate(AuditOfficeLetterDate) || !isValidIsoDate(CorrectionNotificationLetterDate)) {
        throw new Error('VALIDATION:รูปแบบวันที่หนังสือไม่ถูกต้อง (YYYY-MM-DD)');
      }
      if (!Number.isInteger(IssueCount) || IssueCount < 1) {
        throw new Error('VALIDATION:จำนวนประเด็นต้องเป็นจำนวนเต็มมากกว่า 0');
      }
      if (!ObservationDetails) throw new Error('VALIDATION:กรุณาระบุข้อสังเกตที่ตรวจพบ');
      if (!CorrectionGuidelines) throw new Error('VALIDATION:กรุณาระบุแนวทางการแก้ไข');
      if (!OBSERVATION_STATUSES.includes(Status)) {
        throw new Error('VALIDATION:สถานะการดำเนินการไม่ถูกต้อง');
      }

      const existing = await ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.FARMER, req.user!.accessToken);
      const duplicate = existing.some(
        (r) =>
          String(r.FarmerGroupName).trim() === FarmerGroupName &&
          String(r.AccountingYear).trim() === AccountingYear &&
          String(r.AuditOfficeLetterNumber).trim() === AuditOfficeLetterNumber &&
          String(r.ObservationDetails).trim() === ObservationDetails
      );
      if (duplicate) {
        throw new Error('VALIDATION:พบข้อมูลข้อสังเกตของกลุ่มเกษตรกรนี้ซ้ำในระบบ');
      }

      const now = new Date().toISOString();
      const record = {
        ID: genId('FARM'),
        No: existing.length + 1,
        FarmerGroupName,
        AccountingYear,
        AuditOfficeLetterNumber,
        AuditOfficeLetterDate,
        CorrectionNotificationLetterNumber,
        CorrectionNotificationLetterDate,
        IssueCount,
        ObservationDetails,
        CorrectionGuidelines,
        Status,
        CreatedAt: now,
        UpdatedAt: now,
        CreatedBy: req.user!.email,
        UpdatedBy: req.user!.email,
      };

      await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.FARMER, record, req.user!.accessToken);
      await appendActivityLog(
        req.spreadsheetId!,
        record.ID,
        SHEET_NAMES.FARMER,
        'CREATE',
        null,
        record,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: record });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.put('/api/farmer-observations/:id', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const body = req.body as Record<string, unknown>;
      const FarmerGroupName = String(body.FarmerGroupName || '').trim();
      const AccountingYear = String(body.AccountingYear || '').trim();
      const AuditOfficeLetterNumber = String(body.AuditOfficeLetterNumber || '').trim();
      const AuditOfficeLetterDate = String(body.AuditOfficeLetterDate || '').trim();
      const CorrectionNotificationLetterNumber = String(body.CorrectionNotificationLetterNumber || '').trim();
      const CorrectionNotificationLetterDate = String(body.CorrectionNotificationLetterDate || '').trim();
      const IssueCount = Number(body.IssueCount);
      const ObservationDetails = String(body.ObservationDetails || '').trim();
      const CorrectionGuidelines = String(body.CorrectionGuidelines || '').trim();
      const Status = String(body.Status || '').trim();

      if (!FarmerGroupName) throw new Error('VALIDATION:กรุณาระบุชื่อกลุ่มเกษตรกร');
      if (!AccountingYear) throw new Error('VALIDATION:กรุณาระบุปีบัญชี');
      if (!isValidIsoDate(AuditOfficeLetterDate) || !isValidIsoDate(CorrectionNotificationLetterDate)) {
        throw new Error('VALIDATION:รูปแบบวันที่หนังสือไม่ถูกต้อง (YYYY-MM-DD)');
      }
      if (!Number.isInteger(IssueCount) || IssueCount < 1) {
        throw new Error('VALIDATION:จำนวนประเด็นต้องเป็นจำนวนเต็มมากกว่า 0');
      }
      if (!ObservationDetails) throw new Error('VALIDATION:กรุณาระบุข้อสังเกตที่ตรวจพบ');
      if (!CorrectionGuidelines) throw new Error('VALIDATION:กรุณาระบุแนวทางการแก้ไข');
      if (!OBSERVATION_STATUSES.includes(Status)) {
        throw new Error('VALIDATION:สถานะการดำเนินการไม่ถูกต้อง');
      }

      if (id.startsWith('EXT-')) {
        await ensureAllSheetsExist(req.spreadsheetId!, req.user!.accessToken);
        const existingPrimary = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.FARMER, req.user!.accessToken);
        const now = new Date().toISOString();
        const promoted = {
          ID: genId('FARM'),
          No: existingPrimary.length + 1,
          FarmerGroupName,
          AccountingYear,
          AuditOfficeLetterNumber,
          AuditOfficeLetterDate,
          CorrectionNotificationLetterNumber,
          CorrectionNotificationLetterDate,
          IssueCount,
          ObservationDetails,
          CorrectionGuidelines,
          Status,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: req.user!.email,
          UpdatedBy: req.user!.email,
        };
        await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.FARMER, promoted, req.user!.accessToken);
        await appendActivityLog(
          req.spreadsheetId!,
          promoted.ID,
          SHEET_NAMES.FARMER,
          'UPDATE',
          { sourceId: id },
          promoted,
          req.user!.email,
          req.user!.accessToken
        );
        return res.json({ success: true, message: 'บันทึกการแก้ไขข้อมูลสำเร็จ', data: promoted });
      }

      const existing = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.FARMER, req.user!.accessToken);
      const duplicate = existing.some(
        (r) =>
          String(r.ID) !== id &&
          String(r.FarmerGroupName).trim() === FarmerGroupName &&
          String(r.AccountingYear).trim() === AccountingYear &&
          String(r.AuditOfficeLetterNumber).trim() === AuditOfficeLetterNumber &&
          String(r.ObservationDetails).trim() === ObservationDetails
      );
      if (duplicate) {
        throw new Error('VALIDATION:พบข้อมูลข้อสังเกตของกลุ่มเกษตรกรนี้ซ้ำในระบบ');
      }

      const { oldObj, newObj } = await updateSheetRowById(
        req.spreadsheetId!,
        SHEET_NAMES.FARMER,
        id,
        (old) => ({
          ...old,
          FarmerGroupName,
          AccountingYear,
          AuditOfficeLetterNumber,
          AuditOfficeLetterDate,
          CorrectionNotificationLetterNumber,
          CorrectionNotificationLetterDate,
          IssueCount,
          ObservationDetails,
          CorrectionGuidelines,
          Status,
          UpdatedAt: new Date().toISOString(),
          UpdatedBy: req.user!.email,
        }),
        req.user!.accessToken
      );

      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.FARMER,
        'UPDATE',
        oldObj,
        newObj,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: newObj });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.delete('/api/farmer-observations/:id', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const oldObj = await deleteSheetRowById(req.spreadsheetId!, SHEET_NAMES.FARMER, id, req.user!.accessToken, true);
      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.FARMER,
        'DELETE',
        oldObj,
        null,
        req.user!.email,
        req.user!.accessToken
      );
      res.json({ success: true, message: 'ลบข้อมูลข้อสังเกตของกลุ่มเกษตรกรสำเร็จ' });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // 2. Defects CRUD
  app.get('/api/defects', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const payload = await readAllConfiguredSheetsData(req.spreadsheetId!, req.user!.accessToken, req.sheetConfig);
      res.json({ success: true, data: payload.defects });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/defects', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const CooperativeName = String(body.CooperativeName || '').trim();
      const OrderNumber = String(body.OrderNumber || '').trim();
      const OrderDate = String(body.OrderDate || '').trim();
      const DefectDetails = String(body.DefectDetails || '').trim();
      const CorrectionResults = String(body.CorrectionResults || '').trim();
      const DefectStatus = String(body.DefectStatus || '').trim();

      if (!CooperativeName) throw new Error('VALIDATION:กรุณาระบุชื่อสหกรณ์');
      if (!OrderNumber) throw new Error('VALIDATION:กรุณาระบุเลขที่คำสั่ง');
      if (!OrderDate || !isValidIsoDate(OrderDate)) {
        throw new Error('VALIDATION:กรุณาระบุวันที่ออกคำสั่งให้ถูกต้อง (YYYY-MM-DD)');
      }
      if (!DefectDetails) throw new Error('VALIDATION:กรุณาระบุรายละเอียดประเด็นข้อบกพร่อง');
      if (!DEFECT_STATUSES.includes(DefectStatus)) {
        throw new Error('VALIDATION:สถานะข้อบกพร่องไม่ถูกต้อง');
      }

      const existing = await ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.DEFECTS, req.user!.accessToken);
      const duplicate = existing.some(
        (r) =>
          String(r.CooperativeName).trim() === CooperativeName &&
          String(r.OrderNumber).trim() === OrderNumber &&
          String(r.DefectDetails).trim() === DefectDetails
      );
      if (duplicate) {
        throw new Error('VALIDATION:พบข้อมูลข้อบกพร่องของสหกรณ์และเลขที่คำสั่งนี้ซ้ำในระบบ');
      }

      const now = new Date().toISOString();
      const record = {
        ID: genId('DEF'),
        No: existing.length + 1,
        CooperativeName,
        OrderNumber,
        OrderDate,
        DefectDetails,
        CorrectionResults,
        DefectStatus,
        CreatedAt: now,
        UpdatedAt: now,
        CreatedBy: req.user!.email,
        UpdatedBy: req.user!.email,
      };

      await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.DEFECTS, record, req.user!.accessToken);
      await appendActivityLog(
        req.spreadsheetId!,
        record.ID,
        SHEET_NAMES.DEFECTS,
        'CREATE',
        null,
        record,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: record });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.put('/api/defects/:id', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const body = req.body as Record<string, unknown>;
      const CooperativeName = String(body.CooperativeName || '').trim();
      const OrderNumber = String(body.OrderNumber || '').trim();
      const OrderDate = String(body.OrderDate || '').trim();
      const DefectDetails = String(body.DefectDetails || '').trim();
      const CorrectionResults = String(body.CorrectionResults || '').trim();
      const DefectStatus = String(body.DefectStatus || '').trim();

      if (!CooperativeName) throw new Error('VALIDATION:กรุณาระบุชื่อสหกรณ์');
      if (!OrderNumber) throw new Error('VALIDATION:กรุณาระบุเลขที่คำสั่ง');
      if (!OrderDate || !isValidIsoDate(OrderDate)) {
        throw new Error('VALIDATION:กรุณาระบุวันที่ออกคำสั่งให้ถูกต้อง (YYYY-MM-DD)');
      }
      if (!DefectDetails) throw new Error('VALIDATION:กรุณาระบุรายละเอียดประเด็นข้อบกพร่อง');
      if (!DEFECT_STATUSES.includes(DefectStatus)) {
        throw new Error('VALIDATION:สถานะข้อบกพร่องไม่ถูกต้อง');
      }

      if (id.startsWith('EXT-')) {
        await ensureAllSheetsExist(req.spreadsheetId!, req.user!.accessToken);
        const existingPrimary = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.DEFECTS, req.user!.accessToken);
        const now = new Date().toISOString();
        const promoted = {
          ID: genId('DEF'),
          No: existingPrimary.length + 1,
          CooperativeName,
          OrderNumber,
          OrderDate,
          DefectDetails,
          CorrectionResults,
          DefectStatus,
          CreatedAt: now,
          UpdatedAt: now,
          CreatedBy: req.user!.email,
          UpdatedBy: req.user!.email,
        };
        await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.DEFECTS, promoted, req.user!.accessToken);
        await appendActivityLog(
          req.spreadsheetId!,
          promoted.ID,
          SHEET_NAMES.DEFECTS,
          'UPDATE',
          { sourceId: id },
          promoted,
          req.user!.email,
          req.user!.accessToken
        );
        return res.json({ success: true, message: 'บันทึกการแก้ไขข้อมูลสำเร็จ', data: promoted });
      }

      const existing = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.DEFECTS, req.user!.accessToken);
      const duplicate = existing.some(
        (r) =>
          String(r.ID) !== id &&
          String(r.CooperativeName).trim() === CooperativeName &&
          String(r.OrderNumber).trim() === OrderNumber &&
          String(r.DefectDetails).trim() === DefectDetails
      );
      if (duplicate) {
        throw new Error('VALIDATION:พบข้อมูลข้อบกพร่องของสหกรณ์และเลขที่คำสั่งนี้ซ้ำในระบบ');
      }

      const { oldObj, newObj } = await updateSheetRowById(
        req.spreadsheetId!,
        SHEET_NAMES.DEFECTS,
        id,
        (old) => ({
          ...old,
          CooperativeName,
          OrderNumber,
          OrderDate,
          DefectDetails,
          CorrectionResults,
          DefectStatus,
          UpdatedAt: new Date().toISOString(),
          UpdatedBy: req.user!.email,
        }),
        req.user!.accessToken
      );

      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.DEFECTS,
        'UPDATE',
        oldObj,
        newObj,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: newObj });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.delete('/api/defects/:id', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const oldObj = await deleteSheetRowById(req.spreadsheetId!, SHEET_NAMES.DEFECTS, id, req.user!.accessToken, true);
      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.DEFECTS,
        'DELETE',
        oldObj,
        null,
        req.user!.email,
        req.user!.accessToken
      );
      res.json({ success: true, message: 'ลบข้อมูลข้อบกพร่องสำเร็จ' });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Attachments (Google Drive private PDF management)
  app.get('/api/attachments', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      let rows: Array<Record<string, string | number>> = [];
      try {
        rows = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.ATTACHMENTS, req.user!.accessToken);
      } catch {
        rows = [];
      }
      const relatedRecordId = req.query.relatedRecordId ? String(req.query.relatedRecordId) : '';
      const filtered = relatedRecordId ? rows.filter((r) => String(r.RelatedRecordID) === relatedRecordId) : rows;
      res.json({ success: true, data: filtered });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/attachments', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const driveFolderId = req.driveFolderId || String(req.body.driveFolderId || '').trim();
      if (!driveFolderId) {
        throw new Error('VALIDATION:กรุณากำหนด Google Drive Folder ID ในหน้าตั้งค่าก่อนแนบเอกสาร');
      }
      const { relatedRecordID, recordType, fileName, base64Data, mimeType } = req.body as {
        relatedRecordID?: string;
        recordType?: string;
        fileName?: string;
        base64Data?: string;
        mimeType?: string;
      };

      if (!relatedRecordID) throw new Error('VALIDATION:ไม่พบรหัสอ้างอิงของรายการ');
      if (!fileName || !base64Data) throw new Error('VALIDATION:กรุณาเลือกไฟล์ PDF ที่ต้องการอัปโหลด');
      if (mimeType && mimeType !== 'application/pdf' && !fileName.toLowerCase().endsWith('.pdf')) {
        throw new Error('VALIDATION:รองรับเฉพาะไฟล์เอกสาร PDF เท่านั้น');
      }

      const fileBuffer = Buffer.from(base64Data, 'base64');
      const boundary = 'coop_boundary_' + Date.now().toString(16);
      const metadata = JSON.stringify({
        name: fileName,
        parents: [driveFolderId],
        mimeType: 'application/pdf',
      });

      const part1 = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
        'utf-8'
      );
      const part3 = Buffer.from(`\r\n--${boundary}--`, 'utf-8');
      const multipartBody = Buffer.concat([part1, fileBuffer, part3]);

      const uploadRes = await googleFetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        req.user!.accessToken,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`อัปโหลดไฟล์ไปยัง Google Drive ไม่สำเร็จ: ${errText}`);
      }

      const driveFile = (await uploadRes.json()) as { id: string; name: string; webViewLink?: string };
      const att = {
        ID: genId('ATT'),
        RelatedRecordID: relatedRecordID,
        RecordType: recordType || SHEET_NAMES.FARMER,
        FileName: driveFile.name,
        FileID: driveFile.id,
        FileURL: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`,
        UploadedAt: new Date().toISOString(),
        UploadedBy: req.user!.email,
      };

      await ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.ATTACHMENTS, req.user!.accessToken);
      await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.ATTACHMENTS, att, req.user!.accessToken);
      await appendActivityLog(
        req.spreadsheetId!,
        relatedRecordID,
        att.RecordType,
        'UPLOAD_ATTACHMENT',
        null,
        att,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'อัปโหลดเอกสาร PDF สำเร็จ', data: att });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Private proxy for PDF preview & download (no public Drive link needed!)
  app.get('/api/attachments/:fileId/content', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      const fileId = req.params.fileId;
      const mode = req.query.mode === 'download' ? 'attachment' : 'inline';
      const fileName = String(req.query.name || 'document.pdf').replace(/["\r\n]/g, '');

      const driveRes = await googleFetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        req.user!.accessToken
      );

      if (!driveRes.ok) {
        return res.status(driveRes.status).json({
          success: false,
          error: 'ไม่สามารถเปิดไฟล์เอกสารจาก Google Drive ได้ (ตรวจสอบสิทธิ์การเข้าถึงไฟล์)',
        });
      }

      const arrayBuf = await driveRes.arrayBuffer();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${mode}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.delete('/api/attachments/:id', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const oldObj = await deleteSheetRowById(
        req.spreadsheetId!,
        SHEET_NAMES.ATTACHMENTS,
        id,
        req.user!.accessToken,
        false
      );

      if (oldObj.FileID) {
        await googleFetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(oldObj.FileID))}`,
          req.user!.accessToken,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trashed: true }),
          }
        );
      }

      await appendActivityLog(
        req.spreadsheetId!,
        String(oldObj.RelatedRecordID || id),
        String(oldObj.RecordType || SHEET_NAMES.ATTACHMENTS),
        'DELETE_ATTACHMENT',
        oldObj,
        null,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'ลบไฟล์แนบเรียบร้อยแล้ว' });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Activity Logs (Read-only)
  app.get('/api/logs', requireAuthToken, requireSpreadsheetAndRole, async (req: AuthedRequest, res: Response) => {
    try {
      let rows: Array<Record<string, string | number>> = [];
      try {
        rows = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.LOGS, req.user!.accessToken);
      } catch {
        rows = [];
      }
      const recordId = req.query.recordId ? String(req.query.recordId) : '';
      const filtered = recordId ? rows.filter((r) => String(r.RecordID) === recordId) : rows;
      res.json({ success: true, data: filtered.reverse() });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Users Management (Admin only)
  app.get('/api/users', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      let rows: Array<Record<string, string | number>> = [];
      try {
        rows = await readSheetRows(req.spreadsheetId!, SHEET_NAMES.USERS, req.user!.accessToken);
      } catch {
        rows = [];
      }
      res.json({ success: true, data: rows });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.post('/api/users', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const Email = String(req.body.Email || '').trim().toLowerCase();
      const DisplayName = String(req.body.DisplayName || '').trim();
      const Role = req.body.Role === 'Admin' ? 'Admin' : 'Staff';
      const IsActive = req.body.IsActive === 'FALSE' ? 'FALSE' : 'TRUE';

      if (!Email || !Email.includes('@')) throw new Error('VALIDATION:กรุณาระบุอีเมลที่ถูกต้อง');
      if (!DisplayName) throw new Error('VALIDATION:กรุณาระบุชื่อ-สกุลเจ้าหน้าที่');

      const existing = await ensureAndReadPrimaryRows(req.spreadsheetId!, SHEET_NAMES.USERS, req.user!.accessToken);
      if (existing.some((u) => String(u.Email).trim().toLowerCase() === Email)) {
        throw new Error('VALIDATION:อีเมลนี้มีอยู่ในระบบแล้ว');
      }

      const now = new Date().toISOString();
      const userObj = {
        ID: genId('USR'),
        Email,
        DisplayName,
        Role,
        IsActive,
        CreatedAt: now,
        UpdatedAt: now,
      };
      await appendSheetObject(req.spreadsheetId!, SHEET_NAMES.USERS, userObj, req.user!.accessToken);
      await appendActivityLog(
        req.spreadsheetId!,
        userObj.ID,
        SHEET_NAMES.USERS,
        'CREATE_USER',
        null,
        userObj,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'เพิ่มผู้ใช้งานสำเร็จ', data: userObj });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.put('/api/users/:id', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const DisplayName = String(req.body.DisplayName || '').trim();
      const Role = req.body.Role === 'Admin' ? 'Admin' : 'Staff';
      const IsActive = req.body.IsActive === 'FALSE' ? 'FALSE' : 'TRUE';

      if (!DisplayName) throw new Error('VALIDATION:กรุณาระบุชื่อ-สกุลเจ้าหน้าที่');

      const { oldObj, newObj } = await updateSheetRowById(
        req.spreadsheetId!,
        SHEET_NAMES.USERS,
        id,
        (old) => ({
          ...old,
          DisplayName,
          Role,
          IsActive,
          UpdatedAt: new Date().toISOString(),
        }),
        req.user!.accessToken
      );

      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.USERS,
        'UPDATE_USER',
        oldObj,
        newObj,
        req.user!.email,
        req.user!.accessToken
      );

      res.json({ success: true, message: 'อัปเดตข้อมูลผู้ใช้งานสำเร็จ', data: newObj });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  app.delete('/api/users/:id', requireAuthToken, requireSpreadsheetAndRole, requireAdmin, async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      if (id === req.user!.userId) {
        throw new Error('VALIDATION:ไม่สามารถลบบัญชีของตนเองที่กำลังใช้งานอยู่ได้');
      }
      const oldObj = await deleteSheetRowById(req.spreadsheetId!, SHEET_NAMES.USERS, id, req.user!.accessToken, false);
      await appendActivityLog(
        req.spreadsheetId!,
        id,
        SHEET_NAMES.USERS,
        'DELETE_USER',
        oldObj,
        null,
        req.user!.email,
        req.user!.accessToken
      );
      res.json({ success: true, message: 'ลบผู้ใช้งานเรียบร้อยแล้ว' });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Optional Apps Script Test/Proxy Route (avoids browser CORS issues with Apps Script Web App URL)
  app.post('/api/apps-script-test', requireAuthToken, async (req: AuthedRequest, res: Response) => {
    try {
      const webAppUrl = String(req.body.webAppUrl || '').trim();
      if (!webAppUrl || !webAppUrl.startsWith('https://script.google.com/')) {
        return res.status(400).json({
          success: false,
          error: 'กรุณาระบุ Apps Script Web App URL ที่ขึ้นต้นด้วย https://script.google.com/',
        });
      }
      const resp = await fetch(`${webAppUrl}?action=health`);
      const text = await resp.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return res.status(502).json({
          success: false,
          error: 'Apps Script Web App ไม่ได้ตอบกลับเป็น JSON (กรุณาตรวจสอบการตั้งค่า Deploy: Who has access)',
        });
      }
      res.json({ success: true, data: parsed });
    } catch (err) {
      handleApiError(res, err);
    }
  });

  // Vite / Static serving
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(process.cwd(), 'dist'));
  if (isProd) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CO-OP WATCHING SYSTEM Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
