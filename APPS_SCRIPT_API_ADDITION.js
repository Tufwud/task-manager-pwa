// ============================================================
// REST API for PWA Mobile App — with Access Control
// Append this section to the existing script
// Then deploy as Web App: Publish > Deploy > Web App
// Settings: Execute as "Me", Access "Anyone"
// ============================================================

var PWA_API_TOKEN = null;

function getApiToken() {
  if (PWA_API_TOKEN) return PWA_API_TOKEN;
  var props = PropertiesService.getScriptProperties();
  PWA_API_TOKEN = props.getProperty('PWA_API_TOKEN');
  if (!PWA_API_TOKEN) {
    PWA_API_TOKEN = 'tms-' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 10);
    props.setProperty('PWA_API_TOKEN', PWA_API_TOKEN);
  }
  return PWA_API_TOKEN;
}

function resetApiToken() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('PWA_API_TOKEN');
  PWA_API_TOKEN = null;
  return getApiToken();
}

function getUserAccess(email) {
  if (!email) return null;
  var e = email.toLowerCase().trim();
  var up = PERMISSIONS[e];
  if (up) {
    return {
      name: up.name, email: e, dept: up.dept,
      sheet: DEPT_TO_SHEET[up.dept] || up.dept,
      role: up.role, mobile: up.mobile || '',
      isFullAccess: (up.role === 'admin' || up.dept === 'IT' || up.dept === 'Management')
    };
  }
  var domain = e.split('@')[1];
  var domainDept = DOMAIN_ACCESS[domain];
  if (domainDept) {
    return { name: e, email: e, dept: domainDept, sheet: DEPT_TO_SHEET[domainDept] || domainDept, role: 'dept', mobile: '', isFullAccess: false };
  }
  return null;
}

function checkApiAuth(e) {
  var token = e.parameter && e.parameter.token ? e.parameter.token : '';
  return token === getApiToken();
}

// ===== NOTIFICATIONS SHEET =====
function ensureNotificationsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName('_Notifications');
  if (!s) {
    s = ss.insertSheet('_Notifications');
    s.getRange(1, 1, 1, 7).setValues([['Timestamp', 'User Email', 'Type', 'Message', 'Task ID', 'Dept', 'Read']]);
    s.getRange(1, 1, 1, 7).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function writeNotification(userEmail, type, message, taskId, dept) {
  try {
    var s = ensureNotificationsSheet();
    s.appendRow([new Date(), userEmail, type, message, taskId || '', dept || '', 'No']);
  } catch (e) { Logger.log('writeNotification error: ' + e.toString()); }
}

// ===== COMMENTS SHEET =====
function ensureCommentsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName('_Comments');
  if (!s) {
    s = ss.insertSheet('_Comments');
    s.getRange(1, 1, 1, 7).setValues([['Timestamp', 'User Email', 'User Name', 'Dept', 'Task Row', 'Task Dept', 'Comment']]);
    s.getRange(1, 1, 1, 7).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function doGet(e) {
  var callback = e.parameter && e.parameter.callback ? e.parameter.callback : null;

  function json(data) {
    var out = ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
    if (callback) out = ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return out;
  }

  function err(msg, code) { return json({ success: false, error: msg, code: code || 400 }); }

  if (!checkApiAuth(e)) return err('Invalid or missing API token', 401);

  var email = (e.parameter && e.parameter.email || '').toLowerCase().trim();
  var user = getUserAccess(email);
  if (!user) return err('User not found. Check your email.', 403);

  var action = e.parameter && e.parameter.action ? e.parameter.action : '';

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case 'ping':
        return json({ success: true, message: 'pong', version: '1.0' });

      case 'me':
        return json({ success: true, data: user });

      case 'departments': {
        var depts = user.isFullAccess ? ALL_DEPTS : [user.sheet];
        return json({ success: true, data: depts, isFullAccess: user.isFullAccess, userDept: user.sheet });
      }

      case 'employees': {
        var employees = [];
        var staffNames = getActiveStaffNames();
        for (var i = 0; i < staffNames.length; i++) {
          var name = staffNames[i];
          var dept = getStaffDept(name);
          var mobile = '', empEmail = '';
          for (var em in PERMISSIONS) {
            if (PERMISSIONS[em].name === name) { mobile = PERMISSIONS[em].mobile || ''; empEmail = em; break; }
          }
          employees.push({ name: name, dept: dept || '', mobile: mobile, email: empEmail });
        }
        return json({ success: true, data: employees });
      }

      case 'tasks': {
        var dept = e.parameter.dept || user.sheet;
        if (!user.isFullAccess && dept !== user.sheet) return err('Access denied', 403);
        var status = e.parameter.status || '';
        var search = e.parameter.search || '';
        var offset = parseInt(e.parameter.offset, 10) || 0;
        var limit = Math.min(parseInt(e.parameter.limit, 10) || 200, 500);
        var sortBy = e.parameter.sortBy || '';
        var sortDir = e.parameter.sortDir || 'asc';

        var sheet = ss.getSheetByName(dept);
        if (!sheet) return err('Department not found: ' + dept);
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) return json({ success: true, data: [], total: 0, dept: dept });

        var data = sheet.getRange(2, 1, lastRow - 1, 21).getValues();
        var tasks = [];

        for (var r = 0; r < data.length; r++) {
          var row = r + 2;
          var rowData = data[r];
          var taskName = (rowData[1] || '').toString().trim();
          if (!taskName) continue;
          var statusVal = (rowData[3] || '').toString().trim();
          if (status && status !== statusVal) continue;
          if (search) {
            var s = search.toLowerCase();
            var haystack = (taskName + ' ' + (rowData[0] || '') + ' ' + (rowData[5] || '')).toLowerCase();
            if (haystack.indexOf(s) === -1) continue;
          }
          tasks.push({
            row: row, taskId: (rowData[0] || '').toString().trim(), taskName: taskName,
            priority: (rowData[2] || '').toString().trim(), status: statusVal,
            assignor: (rowData[4] || '').toString().trim(), assignee: (rowData[5] || '').toString().trim(),
            email: (rowData[6] || '').toString().trim(), assigneeDept: (rowData[7] || '').toString().trim(),
            mobile: (rowData[8] || '').toString().trim(),
            createdDate: rowData[9] ? Utilities.formatDate(new Date(rowData[9]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            dueDate: rowData[10] ? Utilities.formatDate(new Date(rowData[10]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            completedDate: rowData[11] ? Utilities.formatDate(new Date(rowData[11]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            recurring: (rowData[12] || '').toString().trim(), recurringType: (rowData[13] || '').toString().trim(),
            interDept: (rowData[14] || '').toString().trim(), dueLapse: (rowData[15] || '').toString().trim(),
            remarks: (rowData[16] || '').toString().trim(), description: (rowData[17] || '').toString().trim(),
            rescheduleDate: rowData[18] ? Utilities.formatDate(new Date(rowData[18]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            rescheduleReason: (rowData[19] || '').toString().trim()
          });
        }

        // Sort
        if (sortBy === 'dueDate' || sortBy === 'createdDate' || sortBy === 'priority' || sortBy === 'status') {
          tasks.sort(function(a, b) {
            var va = a[sortBy] || '', vb = b[sortBy] || '';
            if (sortBy === 'priority') {
              var order = { 'Urgent': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
              va = order[va] !== undefined ? order[va] : 99;
              vb = order[vb] !== undefined ? order[vb] : 99;
            } else if (sortBy === 'dueDate' || sortBy === 'createdDate') {
              if (va && vb) { va = va.split('/').reverse().join(''); vb = vb.split('/').reverse().join(''); }
            }
            if (va < vb) return sortDir === 'desc' ? 1 : -1;
            if (va > vb) return sortDir === 'desc' ? -1 : 1;
            return 0;
          });
        }

        return json({ success: true, data: tasks.slice(offset, offset + limit), total: tasks.length, dept: dept });
      }

      case 'task': {
        var dept = e.parameter.dept || user.sheet;
        var row = parseInt(e.parameter.row, 10) || 0;
        if (!dept || !row) return err('dept and row required');
        if (!user.isFullAccess && dept !== user.sheet) return err('Access denied', 403);
        var sheet = ss.getSheetByName(dept);
        if (!sheet) return err('Department not found: ' + dept);
        var data = sheet.getRange(row, 1, 1, 21).getValues()[0];
        if (!data || !(data[1] || '').toString().trim()) return err('Task not found at row ' + row);
        return json({
          success: true, data: {
            row: row, dept: dept, taskId: (data[0] || '').toString().trim(), taskName: (data[1] || '').toString().trim(),
            priority: (data[2] || '').toString().trim(), status: (data[3] || '').toString().trim(),
            assignor: (data[4] || '').toString().trim(), assignee: (data[5] || '').toString().trim(),
            email: (data[6] || '').toString().trim(), assigneeDept: (data[7] || '').toString().trim(),
            mobile: (data[8] || '').toString().trim(),
            createdDate: data[9] ? Utilities.formatDate(new Date(data[9]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            dueDate: data[10] ? Utilities.formatDate(new Date(data[10]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            completedDate: data[11] ? Utilities.formatDate(new Date(data[11]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            recurring: (data[12] || '').toString().trim(), recurringType: (data[13] || '').toString().trim(),
            interDept: (data[14] || '').toString().trim(), dueLapse: (data[15] || '').toString().trim(),
            remarks: (data[16] || '').toString().trim(), description: (data[17] || '').toString().trim(),
            rescheduleDate: data[18] ? Utilities.formatDate(new Date(data[18]), Session.getScriptTimeZone(), 'dd/MM/yyyy') : '',
            rescheduleReason: (data[19] || '').toString().trim(),
            canEdit: user.isFullAccess || dept === user.sheet
          }
        });
      }

      case 'dashboard': {
        var result = { departments: {}, totals: { total: 0, open: 0, inProgress: 0, completed: 0, overdue: 0, onHold: 0, cancelled: 0 } };
        var depts = user.isFullAccess ? ALL_DEPTS : [user.sheet];
        for (var d = 0; d < depts.length; d++) {
          var dept = depts[d];
          var sheet = ss.getSheetByName(dept);
          if (!sheet || sheet.getLastRow() < 2) continue;
          var data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 15).getValues();
          var deptStats = { total: 0, open: 0, inProgress: 0, completed: 0, overdue: 0, onHold: 0, cancelled: 0 };
          for (var r = 0; r < data.length; r++) {
            if (!(data[r][0] || '').toString().trim()) continue;
            deptStats.total++;
            var s = (data[r][2] || '').toString().trim();
            var lapse = (data[r][14] || '').toString().trim();
            if (s === 'Open') deptStats.open++;
            else if (s === 'In Progress') deptStats.inProgress++;
            else if (s === 'Completed') deptStats.completed++;
            else if (s === 'On Hold') deptStats.onHold++;
            else if (s === 'Cancelled') deptStats.cancelled++;
            if (lapse === 'OVERDUE') deptStats.overdue++;
          }
          result.departments[dept] = deptStats;
          result.totals.total += deptStats.total;
          result.totals.open += deptStats.open;
          result.totals.inProgress += deptStats.inProgress;
          result.totals.completed += deptStats.completed;
          result.totals.overdue += deptStats.overdue;
          result.totals.onHold += deptStats.onHold;
          result.totals.cancelled += deptStats.cancelled;
        }
        return json({ success: true, data: result, isFullAccess: user.isFullAccess, userDept: user.sheet });
      }

      case 'statuses':
        return json({ success: true, data: ['Open', 'In Progress', 'Completed', 'On Hold', 'Rescheduled', 'Cancelled', 'Transferred'] });

      case 'priorities':
        return json({ success: true, data: ['Low', 'Medium', 'High', 'Urgent'] });

      case 'reports': {
        var depts = user.isFullAccess ? ALL_DEPTS : [user.sheet];
        var reportData = {};
        for (var d = 0; d < depts.length; d++) {
          var dept = depts[d];
          var sheet = ss.getSheetByName(dept);
          if (!sheet || sheet.getLastRow() < 2) continue;
          var data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 15).getValues();
          var deptData = { total: 0, completed: 0, overdue: 0, inProgress: 0, open: 0 };
          for (var r = 0; r < data.length; r++) {
            if (!(data[r][0] || '').toString().trim()) continue;
            deptData.total++;
            var s = (data[r][2] || '').toString().trim();
            var lapse = (data[r][14] || '').toString().trim();
            if (s === 'Completed') deptData.completed++;
            if (s === 'In Progress') deptData.inProgress++;
            if (s === 'Open') deptData.open++;
            if (lapse === 'OVERDUE') deptData.overdue++;
          }
          reportData[dept] = deptData;
        }
        return json({ success: true, data: reportData, isFullAccess: user.isFullAccess, userDept: user.sheet });
      }

      // === NEW: Calendar view ===
      case 'calendar': {
        var dept = e.parameter.dept || '';
        var month = parseInt(e.parameter.month, 10) || (new Date().getMonth() + 1);
        var year = parseInt(e.parameter.year, 10) || new Date().getFullYear();
        var depts = [];
        if (dept && (user.isFullAccess || dept === user.sheet)) depts.push(dept);
        else depts = user.isFullAccess ? ALL_DEPTS : [user.sheet];

        var result = {};
        for (var d = 0; d < depts.length; d++) {
          var sheet = ss.getSheetByName(depts[d]);
          if (!sheet || sheet.getLastRow() < 2) continue;
          var data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 15).getValues();
          for (var r = 0; r < data.length; r++) {
            if (!(data[r][0] || '').toString().trim()) continue;
            var due = data[r][9]; // Col K = Due Date (0-indexed col 9 in our range)
            if (!due || typeof due !== 'object') continue;
            var dDate = new Date(due);
            if (dDate.getMonth() + 1 !== month || dDate.getFullYear() !== year) continue;
            var key = dDate.getDate();
            if (!result[key]) result[key] = [];
            result[key].push({
              taskName: (data[r][0] || '').toString().trim(), status: (data[r][2] || '').toString().trim(),
              dept: depts[d], due: Utilities.formatDate(dDate, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
              priority: (data[r][1] || '').toString().trim()
            });
          }
        }
        return json({ success: true, data: result, month: month, year: year });
      }

      // === NEW: Search all departments ===
      case 'searchAll': {
        if (!user.isFullAccess) return err('Access denied: admin only', 403);
        var q = (e.parameter.q || '').toLowerCase().trim();
        if (!q) return json({ success: true, data: [] });
        var results = [];
        for (var d = 0; d < ALL_DEPTS.length; d++) {
          var sheet = ss.getSheetByName(ALL_DEPTS[d]);
          if (!sheet || sheet.getLastRow() < 2) continue;
          var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
          for (var r = 0; r < data.length; r++) {
            if (!(data[r][1] || '').toString().trim()) continue;
            var haystack = ((data[r][1] || '') + ' ' + (data[r][0] || '') + ' ' + (data[r][5] || '') + ' ' + (data[r][4] || '')).toLowerCase();
            if (haystack.indexOf(q) !== -1) {
              results.push({
                row: r + 2, dept: ALL_DEPTS[d], taskId: (data[r][0] || '').toString().trim(),
                taskName: (data[r][1] || '').toString().trim(), status: (data[r][3] || '').toString().trim(),
                assignee: (data[r][5] || '').toString().trim(), assignor: (data[r][4] || '').toString().trim()
              });
            }
          }
        }
        return json({ success: true, data: results, total: results.length });
      }

      // === NEW: Notifications ===
      case 'notifications': {
        var s = ss.getSheetByName('_Notifications');
        if (!s || s.getLastRow() < 2) return json({ success: true, data: [] });
        var data = s.getRange(2, 1, s.getLastRow() - 1, 7).getValues();
        var notifs = [];
        for (var r = data.length - 1; r >= 0; r--) {
          if ((data[r][1] || '').toString().toLowerCase().trim() !== email) continue;
          notifs.push({
            ts: data[r][0] ? Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : '',
            type: (data[r][2] || '').toString().trim(),
            message: (data[r][3] || '').toString().trim(),
            taskId: (data[r][4] || '').toString().trim(),
            dept: (data[r][5] || '').toString().trim(),
            read: (data[r][6] || '').toString().trim() === 'Yes'
          });
        }
        var unread = notifs.filter(function(n){ return !n.read; }).length;
        return json({ success: true, data: notifs.slice(0, 50), unread: unread });
      }

      // === NEW: Comments ===
      case 'comments': {
        var dept = e.parameter.dept || '';
        var row = e.parameter.row || '';
        if (!dept || !row) return json({ success: true, data: [] });
        var s = ensureCommentsSheet();
        if (s.getLastRow() < 2) return json({ success: true, data: [] });
        var data = s.getRange(2, 1, s.getLastRow() - 1, 7).getValues();
        var comments = [];
        for (var r = 0; r < data.length; r++) {
          if ((data[r][3] || '').toString().trim() === dept && (data[r][4] || '').toString() === String(row)) {
            comments.push({
              ts: data[r][0] ? Utilities.formatDate(new Date(data[r][0]), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : '',
              user: (data[r][2] || '').toString().trim(),
              text: (data[r][6] || '').toString().trim()
            });
          }
        }
        return json({ success: true, data: comments });
      }

      // === NEW: Yearly Report ===
      case 'yearlyReport': {
        var year = parseInt(e.parameter.year, 10) || new Date().getFullYear();
        var depts = user.isFullAccess ? ALL_DEPTS : [user.sheet];
        var report = {};
        for (var d = 0; d < depts.length; d++) {
          var sheet = ss.getSheetByName(depts[d]);
          if (!sheet || sheet.getLastRow() < 2) continue;
          var data = sheet.getRange(2, 2, sheet.getLastRow() - 1, 11).getValues();
          var deptData = { total: 0, completed: 0, overdue: 0, byMonth: {} };
          for (var m = 1; m <= 12; m++) deptData.byMonth[m] = { total: 0, completed: 0 };
          for (var r = 0; r < data.length; r++) {
            if (!(data[r][0] || '').toString().trim()) continue;
            var created = data[r][8];
            var cYear = created && typeof created === 'object' ? created.getFullYear() : 0;
            if (cYear !== year) continue;
            var s = (data[r][2] || '').toString().trim();
            var lapse = (data[r][14] || '').toString().trim();
            var cMonth = created && typeof created === 'object' ? created.getMonth() + 1 : 1;
            deptData.total++;
            deptData.byMonth[cMonth].total++;
            if (s === 'Completed') { deptData.completed++; deptData.byMonth[cMonth].completed++; }
            if (lapse === 'OVERDUE') deptData.overdue++;
          }
          report[depts[d]] = deptData;
        }
        return json({ success: true, data: report, year: year, isFullAccess: user.isFullAccess, userDept: user.sheet });
      }

      default:
        return err('Unknown action: ' + action);
    }
  } catch (e) {
    return err('Server error: ' + e.toString(), 500);
  }
}

function doPost(e) {
  function json(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
  function err(msg, code) { return json({ success: false, error: msg, code: code || 400 }); }

  var postData = {};
  if (e.postData && e.postData.contents) {
    try { postData = JSON.parse(e.postData.contents); } catch (e2) { return err('Invalid JSON body'); }
  }

  var token = postData.token || (e.parameter && e.parameter.token) || '';
  if (token !== getApiToken()) return err('Invalid or missing API token', 401);

  var email = (postData.email || '').toLowerCase().trim();
  var user = getUserAccess(email);
  if (!user) return err('User not found', 403);

  var action = postData.action || '';

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case 'createTask': {
        var dept = postData.dept || user.sheet;
        if (!user.isFullAccess && dept !== user.sheet) return err('Access denied', 403);
        var taskName = (postData.taskName || '').toString().trim();
        var assignee = (postData.assignee || '').toString().trim();
        var assignor = (postData.assignor || user.name || 'Mobile App').toString().trim();
        var priority = (postData.priority || 'Medium').toString().trim();
        var description = (postData.description || '').toString().trim();
        var dueDate = postData.dueDate || '';
        var recurring = (postData.recurring || 'No').toString().trim();
        var recurringType = (postData.recurringType || '').toString().trim();
        if (!dept) return err('dept is required');
        if (!taskName) return err('taskName is required');
        if (!assignee) return err('assignee is required');

        var sheet = ss.getSheetByName(dept);
        if (!sheet) return err('Department sheet not found: ' + dept);

        // Find first empty row
        var maxRow = sheet.getLastRow();
        var bValues = sheet.getRange(2, 2, Math.max(maxRow + 100, 500), 1).getValues();
        var newRow = 2;
        for (var br = 0; br < bValues.length; br++) {
          if (!bValues[br][0] || bValues[br][0].toString().trim() === '') { newRow = br + 2; break; }
        }

        sheet.getRange(newRow, 2).setValue(taskName);
        sheet.getRange(newRow, 3).setValue(priority);
        sheet.getRange(newRow, 4).setValue('Open');
        sheet.getRange(newRow, 5).setValue(assignor);
        sheet.getRange(newRow, 6).setValue(assignee);
        sheet.getRange(newRow, 13).setValue(recurring);
        if (recurring === 'Yes' && recurringType) sheet.getRange(newRow, 14).setValue(recurringType);
        if (description) sheet.getRange(newRow, 18).setValue(description);
        if (dueDate) {
          var pts = dueDate.split('/');
          if (pts.length === 3) sheet.getRange(newRow, 11).setValue(new Date(parseInt(pts[2], 10), parseInt(pts[1], 10) - 1, parseInt(pts[0], 10)));
        }
        SpreadsheetApp.flush();
        Utilities.sleep(1500);
        autoGenerateTaskId(sheet, newRow);

        // Notify assignee
        var assigneeEmail = sheet.getRange(newRow, 7).getValue();
        if (assigneeEmail) writeNotification(assigneeEmail, 'assignment', 'New task assigned: ' + taskName, sheet.getRange(newRow, 1).getValue(), dept);

        var data = sheet.getRange(newRow, 1, 1, 21).getValues()[0];
        return json({ success: true, data: { row: newRow, dept: dept, taskId: (data[0] || '').toString().trim(), taskName: taskName, status: 'Open' } });
      }

      case 'updateTask': {
        var dept = postData.dept || '';
        var row = parseInt(postData.row, 10) || 0;
        if (!dept || !row) return err('dept and row required');
        if (!user.isFullAccess && dept !== user.sheet) return err('Access denied', 403);
        var sheet = ss.getSheetByName(dept);
        if (!sheet) return err('Department not found: ' + dept);
        var updates = postData.updates || {};
        var fieldMap = { taskName: 2, priority: 3, status: 4, assignor: 5, assignee: 6, dueDate: 11, completedDate: 12, recurring: 13, recurringType: 14, description: 18, remarks: 17, rescheduleDate: 19, rescheduleReason: 20 };

        for (var field in updates) {
          if (fieldMap[field] && updates.hasOwnProperty(field)) {
            var col = fieldMap[field];
            var value = updates[field];
            if ((field === 'dueDate' || field === 'completedDate' || field === 'rescheduleDate') && value) {
              var pts = value.split('/');
              if (pts.length === 3) value = new Date(parseInt(pts[2], 10), parseInt(pts[1], 10) - 1, parseInt(pts[0], 10));
            }
            sheet.getRange(row, col).setValue(value);
          }
        }

        // Notify assignee on status change
        if (updates.status) {
          var taskName = sheet.getRange(row, 2).getValue();
          var assigneeEmail = sheet.getRange(row, 7).getValue();
          if (assigneeEmail) writeNotification(assigneeEmail, 'status', 'Task "' + taskName + '" status changed to ' + updates.status, sheet.getRange(row, 1).getValue(), dept);
        }

        return json({ success: true, message: 'Task updated' });
      }

      // === NEW: Add comment ===
      case 'addComment': {
        var dept = postData.dept || '';
        var row = postData.row || '';
        var text = (postData.text || '').toString().trim();
        if (!dept || !row || !text) return err('dept, row, and text required');
        var s = ensureCommentsSheet();
        s.appendRow([new Date(), email, user.name, dept, String(row), dept, text]);
        return json({ success: true, message: 'Comment added' });
      }

      // === NEW: Mark notification read ===
      case 'markRead': {
        var index = parseInt(postData.index, 10);
        var s = ss.getSheetByName('_Notifications');
        if (!s || index < 0) return json({ success: true });
        var rowNum = index + 2; // +2 for header + 0-index
        if (rowNum <= s.getLastRow()) {
          s.getRange(rowNum, 7).setValue('Yes');
        }
        return json({ success: true });
      }

      // === NEW: Mark all notifications read ===
      case 'markAllRead': {
        var s = ss.getSheetByName('_Notifications');
        if (s && s.getLastRow() > 1) {
          var data = s.getRange(2, 1, s.getLastRow() - 1, 7).getValues();
          for (var r = 0; r < data.length; r++) {
            if ((data[r][1] || '').toString().toLowerCase().trim() === email && (data[r][6] || '').toString().trim() !== 'Yes') {
              s.getRange(r + 2, 7).setValue('Yes');
            }
          }
        }
        return json({ success: true });
      }

      default:
        return err('Unknown action: ' + action);
    }
  } catch (e) {
    return err('Server error: ' + e.toString(), 500);
  }
}

function showApiToken() {
  var token = getApiToken();
  var html = '<html><body style="font-family:sans-serif;padding:20px;"><h2>PWA API Configuration</h2><p><strong>API Token:</strong></p>';
  html += '<input type="text" value="' + token + '" style="width:100%;padding:8px;font-size:14px;" readonly onclick="this.select()">';
  html += '<p style="color:#666;font-size:12px;margin-top:20px;">Use this token with your email in the PWA login screen. Keep it secret.</p>';
  html += '<p>Run <strong>Reset PWA API Token</strong> to generate a new one.</p></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(450).setHeight(250), 'PWA API Token');
}

function resetPwaApiToken() {
  var newToken = resetApiToken();
  SpreadsheetApp.getUi().alert('Token Reset', 'New API Token:\n\n' + newToken + '\n\nUpdate your PWA login.', SpreadsheetApp.getUi().ButtonSet.OK);
}

// ===== MENU UPDATE =====
// Add these to existing `onOpen()` before .addToUi():
//   .addSeparator()
//   .addItem('Show PWA API Token', 'showApiToken')
//   .addItem('Reset PWA API Token', 'resetPwaApiToken');
// ============================================================