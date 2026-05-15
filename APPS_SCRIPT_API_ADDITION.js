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
      name: up.name,
      email: e,
      dept: up.dept,
      sheet: DEPT_TO_SHEET[up.dept] || up.dept,
      role: up.role,
      mobile: up.mobile || '',
      isFullAccess: (up.role === 'admin' || up.dept === 'IT' || up.dept === 'Management')
    };
  }
  var domain = e.split('@')[1];
  var domainDept = DOMAIN_ACCESS[domain];
  if (domainDept) {
    return {
      name: e,
      email: e,
      dept: domainDept,
      sheet: DEPT_TO_SHEET[domainDept] || domainDept,
      role: 'dept',
      mobile: '',
      isFullAccess: false
    };
  }
  return null;
}

function checkApiAuth(e) {
  var token = e.parameter && e.parameter.token ? e.parameter.token : '';
  return token === getApiToken();
}

function doGet(e) {
  var callback = e.parameter && e.parameter.callback ? e.parameter.callback : null;

  function json(data) {
    var out = ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
    if (callback) {
      out = ContentService.createTextOutput(callback + '(' + JSON.stringify(data) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return out;
  }

  function err(msg, code) {
    return json({ success: false, error: msg, code: code || 400 });
  }

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
        return json({ success: true, data: depts, isFullAccess: user.isFullAccess });
      }

      case 'employees': {
        var employees = [];
        var staffNames = getActiveStaffNames();
        for (var i = 0; i < staffNames.length; i++) {
          var name = staffNames[i];
          var dept = getStaffDept(name);
          var mobile = '';
          var empEmail = '';
          for (var em in PERMISSIONS) {
            if (PERMISSIONS[em].name === name) {
              mobile = PERMISSIONS[em].mobile || '';
              empEmail = em;
              break;
            }
          }
          employees.push({ name: name, dept: dept || '', mobile: mobile, email: empEmail });
        }
        return json({ success: true, data: employees });
      }

      case 'tasks': {
        var dept = e.parameter.dept || user.sheet;
        if (!user.isFullAccess && dept !== user.sheet) return err('Access denied: you can only view your own department', 403);

        var status = e.parameter.status || '';
        var search = e.parameter.search || '';
        var offset = parseInt(e.parameter.offset, 10) || 0;
        var limit = Math.min(parseInt(e.parameter.limit, 10) || 200, 500);

        var sheet = ss.getSheetByName(dept);
        if (!sheet) return err('Department sheet not found: ' + dept);

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
          success: true,
          data: {
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

      default:
        return err('Unknown action: ' + action);
    }
  } catch (e) {
    return err('Server error: ' + e.toString(), 500);
  }
}

function doPost(e) {
  function json(data) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }

  function err(msg, code) {
    return json({ success: false, error: msg, code: code || 400 });
  }

  var postData = {};
  if (e.postData && e.postData.contents) {
    try {
      postData = JSON.parse(e.postData.contents);
    } catch (e2) {
      return err('Invalid JSON body');
    }
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
        if (!user.isFullAccess && dept !== user.sheet) return err('Access denied: cannot create tasks in other departments', 403);

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

        // Find first empty row in column B (task names)
        // ARRAYFORMULA inflates getLastRow() to 5000, so we scan for actual empty cell
        var maxFormulaRow = sheet.getLastRow();
        var bValues = sheet.getRange(2, 2, maxFormulaRow + 100, 1).getValues();
        var newRow = bValues.length + 2; // fallback: append at end
        for (var br = 0; br < bValues.length; br++) {
          if (!bValues[br][0] || bValues[br][0].toString().trim() === '') {
            newRow = br + 2;
            break;
          }
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

        var data = sheet.getRange(newRow, 1, 1, 21).getValues()[0];
        return json({
          success: true,
          data: { row: newRow, dept: dept, taskId: (data[0] || '').toString().trim(), taskName: taskName, status: 'Open' }
        });
      }

      case 'updateTask': {
        var dept = postData.dept || '';
        var row = parseInt(postData.row, 10) || 0;
        if (!dept || !row) return err('dept and row required');
        if (!user.isFullAccess && dept !== user.sheet) return err('Access denied', 403);

        var sheet = ss.getSheetByName(dept);
        if (!sheet) return err('Department not found: ' + dept);

        var updates = postData.updates || {};
        var fieldMap = {
          taskName: 2, priority: 3, status: 4, assignor: 5,
          assignee: 6, dueDate: 11, completedDate: 12,
          recurring: 13, recurringType: 14,
          description: 18, remarks: 17, rescheduleDate: 19, rescheduleReason: 20
        };

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

        return json({ success: true, message: 'Task updated' });
      }

      default:
        return err('Unknown action: ' + action);
    }
  } catch (e) {
    return err('Server error: ' + e.toString(), 500);
  }
}

// Show API token in modal dialog
function showApiToken() {
  var token = getApiToken();
  var html = '<html><body style="font-family:sans-serif;padding:20px;">';
  html += '<h2>PWA API Configuration</h2>';
  html += '<p><strong>API Token:</strong></p>';
  html += '<input type="text" value="' + token + '" style="width:100%;padding:8px;font-size:14px;" readonly onclick="this.select()">';
  html += '<p style="color:#666;font-size:12px;margin-top:20px;">';
  html += 'Use this token with your email in the PWA login screen.<br>';
  html += 'Keep it secret.<br>';
  html += 'Run <strong>Reset PWA API Token</strong> to generate a new one.';
  html += '</p></body></html>';
  var ui = HtmlService.createHtmlOutput(html).setWidth(450).setHeight(250);
  SpreadsheetApp.getUi().showModalDialog(ui, 'PWA API Token');
}

function resetPwaApiToken() {
  var newToken = resetApiToken();
  SpreadsheetApp.getUi().alert('Token Reset', 'New API Token:\n\n' + newToken + '\n\nUpdate your PWA login.', SpreadsheetApp.getUi().ButtonSet.OK);
}

// ===== MENU UPDATE =====
// Add these items to the existing `onOpen()` function
// before the final .addToUi():
//
//   .addSeparator()
//   .addItem('Show PWA API Token', 'showApiToken')
//   .addItem('Reset PWA API Token', 'resetPwaApiToken');
// ============================================================