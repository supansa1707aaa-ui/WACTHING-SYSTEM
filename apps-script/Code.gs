/**
 * ============================================================================
 * CO-OP WATCHING SYSTEM — Google Apps Script Backend API (Code.gs)
 * สำนักงานสหกรณ์จังหวัดชัยนาท
 * ============================================================================
 * คำแนะนำการตั้งค่า:
 * 1. กำหนด SPREADSHEET_ID และ DRIVE_FOLDER_ID ใน Script Properties
 *    (Project Settings -> Script Properties) หรือแทนค่าเริ่มต้นด้านล่าง
 * 2. Deploy -> New deployment -> Type: Web app
 *    - Execute as: Me (บัญชีเจ้าของระบบ)
 *    - Who has access: Anyone (ระบบตรวจสอบสิทธิ์ผ่าน Token & Users Sheet ใน Script)
 * ============================================================================
 */

const CONFIG = {
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '',
  DRIVE_FOLDER_ID: PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID') || '',
  API_SECRET_TOKEN: PropertiesService.getScriptProperties().getProperty('API_SECRET_TOKEN') || ''
};

const SHEETS = {
  COOP_OBSERVATIONS: 'CooperativeObservations',
  FARMER_OBSERVATIONS: 'FarmerGroupObservations',
  DEFECTS: 'Defects',
  ATTACHMENTS: 'Attachments',
  ACTIVITY_LOGS: 'ActivityLogs',
  USERS: 'Users'
};

const HEADERS = {
  CooperativeObservations: [
    'ID', 'No', 'CooperativeName', 'LetterInfo', 'AccountingYear', 'IssueCount',
    'ObservationDetails', 'CorrectionGuidelines', 'Status',
    'CreatedAt', 'UpdatedAt', 'CreatedBy', 'UpdatedBy'
  ],
  FarmerGroupObservations: [
    'ID', 'No', 'FarmerGroupName', 'AccountingYear',
    'AuditOfficeLetterNumber', 'AuditOfficeLetterDate',
    'CorrectionNotificationLetterNumber', 'CorrectionNotificationLetterDate',
    'IssueCount', 'ObservationDetails', 'CorrectionGuidelines', 'Status',
    'CreatedAt', 'UpdatedAt', 'CreatedBy', 'UpdatedBy'
  ],
  Defects: [
    'ID', 'No', 'CooperativeName', 'OrderNumber', 'OrderDate',
    'DefectDetails', 'CorrectionResults', 'DefectStatus',
    'CreatedAt', 'UpdatedAt', 'CreatedBy', 'UpdatedBy'
  ],
  Attachments: [
    'ID', 'RelatedRecordID', 'RecordType', 'FileName',
    'FileID', 'FileURL', 'UploadedAt', 'UploadedBy'
  ],
  ActivityLogs: [
    'ID', 'RecordID', 'RecordType', 'Action',
    'OldValue', 'NewValue', 'ActionBy', 'ActionDate'
  ],
  Users: [
    'ID', 'Email', 'DisplayName', 'Role', 'IsActive', 'CreatedAt', 'UpdatedAt'
  ]
};

const OBSERVATION_STATUSES = ['แก้ไขเสร็จสิ้น', 'อยู่ระหว่างดำเนินการ'];
const DEFECT_STATUSES = [
  'ยังไม่ได้ดำเนินการแก้ไข',
  'อยู่ระหว่างดำเนินการแก้ไข',
  'แก้ไขแล้ว',
  'แก้ไขเสร็จสิ้น'
];

function doGet(e) {
  return handleRequest('GET', e);
}

function doPost(e) {
  return handleRequest('POST', e);
}

function handleRequest(method, e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const params = (e && e.parameter) || {};
    let body = {};
    if (method === 'POST' && e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    const action = body.action || params.action || 'health';
    const spreadsheetId = body.spreadsheetId || params.spreadsheetId || CONFIG.SPREADSHEET_ID;
    const driveFolderId = body.driveFolderId || params.driveFolderId || CONFIG.DRIVE_FOLDER_ID;
    const userEmail = (body.userEmail || params.userEmail || '').trim().toLowerCase();

    if (CONFIG.API_SECRET_TOKEN) {
      const providedSecret = body.apiSecret || params.apiSecret || '';
      if (providedSecret !== CONFIG.API_SECRET_TOKEN) {
        return jsonResponse({ success: false, error: 'ไม่ได้รับอนุญาตให้เข้าถึง API (Invalid API Secret)' }, 401);
      }
    }

    if (action === 'health') {
      return jsonResponse({
        success: true,
        message: 'CO-OP WATCHING SYSTEM Apps Script API พร้อมใช้งาน',
        timestamp: new Date().toISOString()
      });
    }

    if (!spreadsheetId) {
      return jsonResponse({ success: false, error: 'กรุณากำหนด Spreadsheet ID ก่อนใช้งาน' }, 400);
    }

    const ss = SpreadsheetApp.openById(spreadsheetId);

    if (action === 'initializeSheets') {
      ensureAllSheets(ss);
      return jsonResponse({ success: true, message: 'เตรียมแผ่นงานทั้ง 6 แผ่นงานเรียบร้อยแล้ว' });
    }

    // ตรวจสอบสิทธิ์ผู้ใช้งานจากชีท Users
    const authUser = authorizeUser(ss, userEmail);
    if (!authUser) {
      return jsonResponse({ success: false, error: 'บัญชีผู้ใช้งานไม่มีสิทธิ์เข้าถึงระบบ กรุณาติดต่อผู้ดูแลระบบ' }, 403);
    }

    switch (action) {
      case 'getDashboardSummary':
        return jsonResponse({ success: true, data: buildDashboardSummary(ss) });

      case 'listRecords': {
        const sheetName = resolveSheetName(body.type || params.type);
        const records = readSheetObjects(ss, sheetName);
        return jsonResponse({ success: true, data: records });
      }

      case 'createRecord': {
        const type = body.type;
        const payload = body.data || {};
        const created = createRecord(ss, type, payload, authUser.Email);
        return jsonResponse({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: created });
      }

      case 'updateRecord': {
        const type = body.type;
        const id = body.id;
        const payload = body.data || {};
        const updated = updateRecord(ss, type, id, payload, authUser.Email);
        return jsonResponse({ success: true, message: 'บันทึกข้อมูลสำเร็จ', data: updated });
      }

      case 'deleteRecord': {
        if (authUser.Role !== 'Admin') {
          return jsonResponse({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบข้อมูลได้' }, 403);
        }
        deleteRecord(ss, body.type, body.id, authUser.Email);
        return jsonResponse({ success: true, message: 'ลบข้อมูลสำเร็จ' });
      }

      case 'uploadAttachment': {
        if (!driveFolderId) {
          return jsonResponse({ success: false, error: 'ยังไม่ได้กำหนด Google Drive Folder ID' }, 400);
        }
        const att = uploadPdfToDrive(ss, driveFolderId, body, authUser.Email);
        return jsonResponse({ success: true, message: 'แนบเอกสาร PDF สำเร็จ', data: att });
      }

      case 'listAttachments': {
        const allAtt = readSheetObjects(ss, SHEETS.ATTACHMENTS);
        const relatedId = body.relatedRecordId || params.relatedRecordId;
        const filtered = relatedId ? allAtt.filter(r => r.RelatedRecordID === relatedId) : allAtt;
        return jsonResponse({ success: true, data: filtered });
      }

      case 'deleteAttachment': {
        if (authUser.Role !== 'Admin') {
          return jsonResponse({ success: false, error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลบไฟล์แนบได้' }, 403);
        }
        deleteAttachment(ss, body.id, authUser.Email);
        return jsonResponse({ success: true, message: 'ลบไฟล์แนบสำเร็จ' });
      }

      case 'listLogs': {
        const logs = readSheetObjects(ss, SHEETS.ACTIVITY_LOGS).reverse();
        const recordId = body.recordId || params.recordId;
        const filtered = recordId ? logs.filter(l => l.RecordID === recordId) : logs;
        return jsonResponse({ success: true, data: filtered });
      }

      default:
        return jsonResponse({ success: false, error: 'ไม่พบคำสั่งที่ระบุ: ' + action }, 400);
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || 'เกิดข้อผิดพลาดภายใน Google Apps Script' }, 500);
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function ensureAllSheets(ss) {
  Object.keys(HEADERS).forEach(function (sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    const headerRow = HEADERS[sheetName];
    const currentLastCol = sheet.getLastColumn();
    if (sheet.getLastRow() === 0 || currentLastCol < headerRow.length) {
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      sheet.getRange(1, 1, 1, headerRow.length)
        .setBackground('#0B3B2C')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
}

function authorizeUser(ss, email) {
  if (!email) return null;
  const usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (!usersSheet) return null;
  const users = readSheetObjects(ss, SHEETS.USERS);
  if (users.length === 0) {
    const now = new Date().toISOString();
    const adminRow = {
      ID: generateId('USR'),
      Email: email,
      DisplayName: email.split('@')[0],
      Role: 'Admin',
      IsActive: 'TRUE',
      CreatedAt: now,
      UpdatedAt: now
    };
    appendRowObject(ss, SHEETS.USERS, adminRow);
    return adminRow;
  }
  const found = users.find(function (u) {
    return String(u.Email || '').trim().toLowerCase() === email && String(u.IsActive).toUpperCase() === 'TRUE';
  });
  return found || null;
}

function resolveSheetName(type) {
  if (type === 'coop') return SHEETS.COOP_OBSERVATIONS;
  if (type === 'farmer') return SHEETS.FARMER_OBSERVATIONS;
  if (type === 'defect') return SHEETS.DEFECTS;
  throw new Error('ประเภทข้อมูลไม่ถูกต้อง');
}

function readSheetObjects(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function appendRowObject(ss, sheetName, obj) {
  const sheet = ss.getSheetByName(sheetName);
  const headers = HEADERS[sheetName];
  const row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; });
  sheet.appendRow(row);
}

function createRecord(ss, type, payload, actorEmail) {
  const sheetName = resolveSheetName(type);
  const existing = readSheetObjects(ss, sheetName);
  const now = new Date().toISOString();
  const nextNo = existing.length + 1;
  let record;

  if (type === 'coop') {
    validateCoopPayload(payload, existing, null);
    record = {
      ID: generateId('COOP'),
      No: nextNo,
      CooperativeName: String(payload.CooperativeName).trim(),
      LetterInfo: String(payload.LetterInfo || '').trim(),
      AccountingYear: String(payload.AccountingYear).trim(),
      IssueCount: Number(payload.IssueCount),
      ObservationDetails: String(payload.ObservationDetails).trim(),
      CorrectionGuidelines: String(payload.CorrectionGuidelines).trim(),
      Status: payload.Status,
      CreatedAt: now,
      UpdatedAt: now,
      CreatedBy: actorEmail,
      UpdatedBy: actorEmail
    };
  } else if (type === 'farmer') {
    validateFarmerPayload(payload, existing, null);
    record = {
      ID: generateId('FARM'),
      No: nextNo,
      FarmerGroupName: String(payload.FarmerGroupName).trim(),
      AccountingYear: String(payload.AccountingYear).trim(),
      AuditOfficeLetterNumber: String(payload.AuditOfficeLetterNumber || '').trim(),
      AuditOfficeLetterDate: String(payload.AuditOfficeLetterDate || '').trim(),
      CorrectionNotificationLetterNumber: String(payload.CorrectionNotificationLetterNumber || '').trim(),
      CorrectionNotificationLetterDate: String(payload.CorrectionNotificationLetterDate || '').trim(),
      IssueCount: Number(payload.IssueCount),
      ObservationDetails: String(payload.ObservationDetails).trim(),
      CorrectionGuidelines: String(payload.CorrectionGuidelines).trim(),
      Status: payload.Status,
      CreatedAt: now,
      UpdatedAt: now,
      CreatedBy: actorEmail,
      UpdatedBy: actorEmail
    };
  } else if (type === 'defect') {
    validateDefectPayload(payload, existing, null);
    record = {
      ID: generateId('DEF'),
      No: nextNo,
      CooperativeName: String(payload.CooperativeName).trim(),
      OrderNumber: String(payload.OrderNumber).trim(),
      OrderDate: String(payload.OrderDate).trim(),
      DefectDetails: String(payload.DefectDetails).trim(),
      CorrectionResults: String(payload.CorrectionResults || '').trim(),
      DefectStatus: payload.DefectStatus,
      CreatedAt: now,
      UpdatedAt: now,
      CreatedBy: actorEmail,
      UpdatedBy: actorEmail
    };
  }

  appendRowObject(ss, sheetName, record);
  logActivity(ss, record.ID, sheetName, 'CREATE', '', JSON.stringify(record), actorEmail);
  return record;
}

function updateRecord(ss, type, id, payload, actorEmail) {
  if (!id) throw new Error('ไม่พบรหัส ID ของรายการ');
  const sheetName = resolveSheetName(type);
  const sheet = ss.getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  let rowIndex = -1;
  let oldObj = null;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      rowIndex = i + 1;
      oldObj = {};
      headers.forEach(function (h, idx) { oldObj[h] = values[i][idx]; });
      break;
    }
  }
  if (rowIndex === -1) throw new Error('ไม่พบข้อมูลรายการที่ต้องการแก้ไข (ID: ' + id + ')');

  const existing = readSheetObjects(ss, sheetName);
  const now = new Date().toISOString();
  let updated;

  if (type === 'coop') {
    validateCoopPayload(payload, existing, id);
    updated = Object.assign({}, oldObj, {
      CooperativeName: String(payload.CooperativeName).trim(),
      LetterInfo: String(payload.LetterInfo || '').trim(),
      AccountingYear: String(payload.AccountingYear).trim(),
      IssueCount: Number(payload.IssueCount),
      ObservationDetails: String(payload.ObservationDetails).trim(),
      CorrectionGuidelines: String(payload.CorrectionGuidelines).trim(),
      Status: payload.Status,
      UpdatedAt: now,
      UpdatedBy: actorEmail
    });
  } else if (type === 'farmer') {
    validateFarmerPayload(payload, existing, id);
    updated = Object.assign({}, oldObj, {
      FarmerGroupName: String(payload.FarmerGroupName).trim(),
      AccountingYear: String(payload.AccountingYear).trim(),
      AuditOfficeLetterNumber: String(payload.AuditOfficeLetterNumber || '').trim(),
      AuditOfficeLetterDate: String(payload.AuditOfficeLetterDate || '').trim(),
      CorrectionNotificationLetterNumber: String(payload.CorrectionNotificationLetterNumber || '').trim(),
      CorrectionNotificationLetterDate: String(payload.CorrectionNotificationLetterDate || '').trim(),
      IssueCount: Number(payload.IssueCount),
      ObservationDetails: String(payload.ObservationDetails).trim(),
      CorrectionGuidelines: String(payload.CorrectionGuidelines).trim(),
      Status: payload.Status,
      UpdatedAt: now,
      UpdatedBy: actorEmail
    });
  } else if (type === 'defect') {
    validateDefectPayload(payload, existing, id);
    updated = Object.assign({}, oldObj, {
      CooperativeName: String(payload.CooperativeName).trim(),
      OrderNumber: String(payload.OrderNumber).trim(),
      OrderDate: String(payload.OrderDate).trim(),
      DefectDetails: String(payload.DefectDetails).trim(),
      CorrectionResults: String(payload.CorrectionResults || '').trim(),
      DefectStatus: payload.DefectStatus,
      UpdatedAt: now,
      UpdatedBy: actorEmail
    });
  }

  const rowValues = headers.map(function (h) { return updated[h] !== undefined ? updated[h] : ''; });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  logActivity(ss, id, sheetName, 'UPDATE', JSON.stringify(oldObj), JSON.stringify(updated), actorEmail);
  return updated;
}

function deleteRecord(ss, type, id, actorEmail) {
  if (!id) throw new Error('ไม่พบรหัส ID ของรายการ');
  const sheetName = resolveSheetName(type);
  const sheet = ss.getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  let rowIndex = -1;
  let oldObj = null;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      rowIndex = i + 1;
      oldObj = {};
      headers.forEach(function (h, idx) { oldObj[h] = values[i][idx]; });
      break;
    }
  }
  if (rowIndex === -1) throw new Error('ไม่พบข้อมูลที่ต้องการลบ');

  sheet.deleteRow(rowIndex);
  resequenceNo(sheet);
  logActivity(ss, id, sheetName, 'DELETE', JSON.stringify(oldObj), '', actorEmail);
}

function resequenceNo(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const nums = [];
  for (let i = 1; i < lastRow; i++) {
    nums.push([i]);
  }
  sheet.getRange(2, 2, nums.length, 1).setValues(nums);
}

function uploadPdfToDrive(ss, driveFolderId, body, actorEmail) {
  const folder = DriveApp.getFolderById(driveFolderId);
  const fileName = String(body.fileName || 'document.pdf');
  const base64Data = String(body.base64Data || '');
  if (!base64Data) throw new Error('ไม่พบเนื้อหาไฟล์ PDF');

  const decoded = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(decoded, 'application/pdf', fileName);
  const file = folder.createFile(blob);
  // คงสิทธิ์การเข้าถึงแบบส่วนตัวตามระเบียบเอกสารราชการ (ไม่ตั้งเป็นสาธารณะ)
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);

  const att = {
    ID: generateId('ATT'),
    RelatedRecordID: String(body.relatedRecordID),
    RecordType: String(body.recordType || 'FarmerGroupObservations'),
    FileName: file.getName(),
    FileID: file.getId(),
    FileURL: file.getUrl(),
    UploadedAt: new Date().toISOString(),
    UploadedBy: actorEmail
  };

  appendRowObject(ss, SHEETS.ATTACHMENTS, att);
  logActivity(ss, att.RelatedRecordID, att.RecordType, 'UPLOAD_ATTACHMENT', '', JSON.stringify(att), actorEmail);
  return att;
}

function deleteAttachment(ss, attachmentId, actorEmail) {
  const sheet = ss.getSheetByName(SHEETS.ATTACHMENTS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  let rowIndex = -1;
  let oldObj = null;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(attachmentId)) {
      rowIndex = i + 1;
      oldObj = {};
      headers.forEach(function (h, idx) { oldObj[h] = values[i][idx]; });
      break;
    }
  }
  if (rowIndex === -1) throw new Error('ไม่พบไฟล์แนบที่ต้องการลบ');

  if (oldObj.FileID) {
    try {
      DriveApp.getFileById(oldObj.FileID).setTrashed(true);
    } catch (e) {}
  }
  sheet.deleteRow(rowIndex);
  logActivity(ss, oldObj.RelatedRecordID, oldObj.RecordType, 'DELETE_ATTACHMENT', JSON.stringify(oldObj), '', actorEmail);
}

function buildDashboardSummary(ss) {
  const coop = readSheetObjects(ss, SHEETS.COOP_OBSERVATIONS);
  const farmer = readSheetObjects(ss, SHEETS.FARMER_OBSERVATIONS);
  const defects = readSheetObjects(ss, SHEETS.DEFECTS);

  const coopNames = {};
  coop.forEach(function (r) { if (r.CooperativeName) coopNames[r.CooperativeName] = true; });
  defects.forEach(function (r) { if (r.CooperativeName) coopNames[r.CooperativeName] = true; });

  const farmerNames = {};
  farmer.forEach(function (r) { if (r.FarmerGroupName) farmerNames[r.FarmerGroupName] = true; });

  const allObs = coop.concat(farmer);
  return {
    totalCooperatives: Object.keys(coopNames).length,
    totalFarmerGroups: Object.keys(farmerNames).length,
    totalCoopObservations: coop.length,
    totalFarmerObservations: farmer.length,
    completedObservations: allObs.filter(function (r) { return r.Status === 'แก้ไขเสร็จสิ้น'; }).length,
    inProgressObservations: allObs.filter(function (r) { return r.Status === 'อยู่ระหว่างดำเนินการ'; }).length,
    totalDefects: defects.length,
    completedDefects: defects.filter(function (r) { return r.DefectStatus === 'แก้ไขเสร็จสิ้น'; }).length,
    inProgressDefects: defects.filter(function (r) { return r.DefectStatus !== 'แก้ไขเสร็จสิ้น'; }).length
  };
}

function validateCoopPayload(p, existing, excludeId) {
  if (!p.CooperativeName || !String(p.CooperativeName).trim()) throw new Error('กรุณาระบุชื่อสหกรณ์');
  if (!p.AccountingYear || !String(p.AccountingYear).trim()) throw new Error('กรุณาระบุปีบัญชี');
  if (!p.IssueCount || isNaN(Number(p.IssueCount)) || Number(p.IssueCount) < 1) throw new Error('จำนวนประเด็นต้องเป็นตัวเลขมากกว่า 0');
  if (!p.ObservationDetails || !String(p.ObservationDetails).trim()) throw new Error('กรุณาระบุข้อสังเกตที่ตรวจพบ');
  if (!p.CorrectionGuidelines || !String(p.CorrectionGuidelines).trim()) throw new Error('กรุณาระบุแนวทางการแก้ไข');
  if (OBSERVATION_STATUSES.indexOf(p.Status) === -1) throw new Error('สถานะการดำเนินการไม่ถูกต้อง');

  const dup = existing.some(function (r) {
    return r.ID !== excludeId &&
      String(r.CooperativeName).trim() === String(p.CooperativeName).trim() &&
      String(r.AccountingYear).trim() === String(p.AccountingYear).trim() &&
      String(r.ObservationDetails).trim() === String(p.ObservationDetails).trim();
  });
  if (dup) throw new Error('พบข้อมูลข้อสังเกตของสหกรณ์และปีบัญชีนี้ซ้ำในระบบ');
}

function validateFarmerPayload(p, existing, excludeId) {
  if (!p.FarmerGroupName || !String(p.FarmerGroupName).trim()) throw new Error('กรุณาระบุชื่อกลุ่มเกษตรกร');
  if (!p.AccountingYear || !String(p.AccountingYear).trim()) throw new Error('กรุณาระบุปีบัญชี');
  if (!p.IssueCount || isNaN(Number(p.IssueCount)) || Number(p.IssueCount) < 1) throw new Error('จำนวนประเด็นต้องเป็นตัวเลขมากกว่า 0');
  if (!p.ObservationDetails || !String(p.ObservationDetails).trim()) throw new Error('กรุณาระบุข้อสังเกตที่ตรวจพบ');
  if (!p.CorrectionGuidelines || !String(p.CorrectionGuidelines).trim()) throw new Error('กรุณาระบุแนวทางการแก้ไข');
  if (OBSERVATION_STATUSES.indexOf(p.Status) === -1) throw new Error('สถานะการดำเนินการไม่ถูกต้อง');
}

function validateDefectPayload(p, existing, excludeId) {
  if (!p.CooperativeName || !String(p.CooperativeName).trim()) throw new Error('กรุณาระบุชื่อสหกรณ์');
  if (!p.OrderNumber || !String(p.OrderNumber).trim()) throw new Error('กรุณาระบุเลขที่คำสั่ง');
  if (!p.OrderDate || !String(p.OrderDate).trim()) throw new Error('กรุณาระบุวันที่ออกคำสั่ง');
  if (!p.DefectDetails || !String(p.DefectDetails).trim()) throw new Error('กรุณาระบุรายละเอียดประเด็นข้อบกพร่อง');
  if (DEFECT_STATUSES.indexOf(p.DefectStatus) === -1) throw new Error('สถานะข้อบกพร่องไม่ถูกต้อง');

  const dup = existing.some(function (r) {
    return r.ID !== excludeId &&
      String(r.CooperativeName).trim() === String(p.CooperativeName).trim() &&
      String(r.OrderNumber).trim() === String(p.OrderNumber).trim() &&
      String(r.DefectDetails).trim() === String(p.DefectDetails).trim();
  });
  if (dup) throw new Error('พบข้อมูลข้อบกพร่องเลขที่คำสั่งนี้ซ้ำในระบบ');
}

function logActivity(ss, recordId, recordType, action, oldValue, newValue, actorEmail) {
  const row = {
    ID: generateId('LOG'),
    RecordID: recordId,
    RecordType: recordType,
    Action: action,
    OldValue: oldValue,
    NewValue: newValue,
    ActionBy: actorEmail,
    ActionDate: new Date().toISOString()
  };
  appendRowObject(ss, SHEETS.ACTIVITY_LOGS, row);
}

function generateId(prefix) {
  return prefix + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
}

function jsonResponse(payload, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(Object.assign({ statusCode: statusCode || 200 }, payload)))
    .setMimeType(ContentService.MimeType.JSON);
}
