/* ═══════════════════════════════════════════
   Task Manager PWA — App
   ═══════════════════════════════════════════ */

// ── State ──
var STATE = {
  url: '',
  email: '',
  token: '',
  user: null,
  dept: '',
  depts: [],
  tasks: [],
  cached: {},
  calMonth: null,
  calYear: null,
  selectedTask: null,
  activeReport: 'workload'
};

// ── API Call ──
function callApi(params, callback) {
  var url = STATE.url;
  params.token = STATE.token;
  params.email = STATE.email;

  var body = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
  }).join('&');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', url, true);
  xhr.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) {
        var text = xhr.responseText || '';
        try { callback(null, JSON.parse(text)); }
        catch(e) { callback('Invalid response (not JSON): ' + text.substring(0, 200), null); }
      } else {
        callback('Error ' + xhr.status + ': ' + xhr.statusText, null);
      }
    }
  };
  xhr.onerror = function() { callback('Network error — check URL and token', null); };
  xhr.timeout = 30000;
  xhr.ontimeout = function() { callback('Request timed out', null); };
  xhr.send(body);
}

function callApiGet(params, callback) {
  var url = STATE.url + '?' + Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
  }).join('&') + '&callback=jsonpCallback';

  var script = document.createElement('script');
  script.src = url;
  window.jsonpCallback = function(data) { callback(null, data); delete window.jsonpCallback; document.head.removeChild(script); };
  window.jsonpError = function() { callback('JSONP error', null); delete window.jsonpError; document.head.removeChild(script); };
  script.onerror = window.jsonpError;
  document.head.appendChild(script);
}

// ── Auth ──
function login() {
  var url = document.getElementById('login-url').value.trim();
  var email = document.getElementById('login-email').value.trim();
  var token = document.getElementById('login-token').value.trim();

  if (!url || !email || !token) {
    showError('All fields are required');
    return;
  }

  STATE.url = url.replace(/\/+$/, '');
  STATE.email = email;
  STATE.token = token;

  document.getElementById('login-btn').disabled = true;
  document.getElementById('login-btn').textContent = 'Signing in...';
  document.getElementById('login-error').style.display = 'none';

  callApi({ action: 'getDashboard' }, function(err, data) {
    document.getElementById('login-btn').disabled = false;
    document.getElementById('login-btn').textContent = 'Sign In';

    if (err || !data) {
      showError('Connection failed: ' + (err || 'No response'));
      return;
    }
    if (data.error) {
      showError('Server: ' + data.error);
      return;
    }

    localStorage.setItem('tm_url', STATE.url);
    localStorage.setItem('tm_email', STATE.email);
    localStorage.setItem('tm_token', STATE.token);

    STATE.user = data.user || email;
    STATE.dept = data.dept || '';

    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.add('active');

    document.getElementById('user-email').textContent = email.split('@')[0];
    document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();

    init();
  });
}

function logout() {
  localStorage.removeItem('tm_url');
  localStorage.removeItem('tm_email');
  localStorage.removeItem('tm_token');
  STATE.url = ''; STATE.email = ''; STATE.token = '';
  STATE.cached = {};
  STATE.tasks = [];

  document.getElementById('app').classList.remove('active');
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('login-token').value = '';
}

function autoLogin() {
  var url = localStorage.getItem('tm_url');
  var email = localStorage.getItem('tm_email');
  var token = localStorage.getItem('tm_token');
  if (url && email && token) {
    STATE.url = url;
    STATE.email = email;
    STATE.token = token;
    document.getElementById('login-url').value = url;
    document.getElementById('login-email').value = email;
    document.getElementById('login-token').value = token;
    callApi({ action: 'getDashboard' }, function(err, data) {
      if (err || !data || data.error) {
        logout();
        return;
      }
      STATE.user = data.user || email;
      STATE.dept = data.dept || '';
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('app').classList.add('active');
      document.getElementById('user-email').textContent = email.split('@')[0];
      document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
      document.getElementById('settings-email').textContent = email;
      document.getElementById('settings-token').textContent = token;
      document.getElementById('settings-url').textContent = url;
      init();
    });
  }
}

function copyToken() {
  var t = document.getElementById('settings-token').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(t).then(function() {
      showPopup('info', 'Copied', 'Token copied to clipboard');
    });
  }
}

function refreshVersion() {
  document.getElementById('settings-refreshed').textContent = new Date().toLocaleTimeString();
  showPopup('info', 'Refreshed', 'Checking for update...');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration('/task-manager-pwa/').then(function(reg) {
      if (reg) { reg.update(); setTimeout(function() { location.reload(); }, 1000); }
    });
  }
}

function clearCache() {
  STATE.cached = {};
  localStorage.removeItem('tm_cache');
  showPopup('info', 'Cache Cleared', 'Local cache cleared. Reloading...');
  setTimeout(function() { location.reload(); }, 800);
}

// ── Init ──
function init() {
  document.getElementById('settings-email').textContent = STATE.email;
  document.getElementById('settings-token').textContent = STATE.token;
  document.getElementById('settings-url').textContent = STATE.url;
  if (STATE.dept) {
    document.getElementById('settings-dept').textContent = STATE.dept;
  }

  var deptLabel = STATE.dept ? ' — ' + STATE.dept : '';
  document.getElementById('dash-dept').textContent = deptLabel;
  document.getElementById('tasks-dept').textContent = deptLabel;
  document.getElementById('cal-dept').textContent = deptLabel;
  document.getElementById('reports-dept').textContent = deptLabel;
  document.getElementById('notif-dept').textContent = deptLabel;

  var now = new Date();
  STATE.calMonth = now.getMonth();
  STATE.calYear = now.getFullYear();

  loadDashboard();
  loadTasks();
  loadStaffList();
}

// ── Tab Switching ──
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });

  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector('.tab-btn[data-tab="' + name + '"]').classList.add('active');

  if (name === 'dashboard') loadDashboard();
  else if (name === 'tasks') renderTasks();
  else if (name === 'calendar') renderCalendar();
  else if (name === 'reports') renderReport(STATE.activeReport);
  else if (name === 'notifications') loadNotifications();
}

// ── Dashboard ──
function loadDashboard() {
  var statsEl = document.getElementById('dash-stats');
  var dueEl = document.getElementById('dash-due-today');
  var overdueEl = document.getElementById('dash-overdue');
  var compEl = document.getElementById('dash-completed');

  statsEl.innerHTML = '<div class="loading-center"><span class="spinner"></span> Loading...</div>';
  dueEl.innerHTML = '';
  overdueEl.innerHTML = '';
  compEl.innerHTML = '';

  var cached = getCache('dashboard');
  if (cached) { renderDashboard(cached, statsEl, dueEl, overdueEl, compEl); }

  callApi({ action: 'getDashboard' }, function(err, data) {
    if (err || !data) {
      if (!cached) statsEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><h3>Could not load</h3><p>' + (err || 'No data') + '</p></div>';
      return;
    }
    setCache('dashboard', data);
    renderDashboard(data, statsEl, dueEl, overdueEl, compEl);
  });
}

function renderDashboard(data, statsEl, dueEl, overdueEl, compEl) {
  var stats = data.stats || {};
  statsEl.innerHTML =
    '<div class="stat-card blue"><div class="stat-value">' + (stats.total || 0) + '</div><div class="stat-label">Total Tasks</div></div>' +
    '<div class="stat-card orange"><div class="stat-value">' + (stats.inProgress || 0) + '</div><div class="stat-label">In Progress</div></div>' +
    '<div class="stat-card red"><div class="stat-value">' + (stats.overdue || 0) + '</div><div class="stat-label">Overdue</div></div>' +
    '<div class="stat-card green"><div class="stat-value">' + (stats.completed || 0) + '</div><div class="stat-label">Completed</div></div>';

  dueEl.innerHTML = renderTaskList(data.dueToday || []);
  overdueEl.innerHTML = renderTaskList(data.overdue || []);
  compEl.innerHTML = renderTaskList(data.completedYest || []);
}

function renderTaskList(tasks) {
  if (!tasks || tasks.length === 0) return '<div class="empty-state" style="padding:16px 0"><p>None</p></div>';
  return tasks.map(function(t) {
    return '<div class="list-item" onclick="openTask(\'' + t.id + '\')">' +
      '<span class="item-id">' + escapeHtml(t.id || '') + '</span>' +
      '<span class="item-name">' + escapeHtml(t.task || '') + '</span>' +
      '<span class="item-status status-' + (t.status || '').replace(/ /g,'.') + '">' + escapeHtml(t.status || '') + '</span>' +
    '</div>';
  }).join('');
}

// ── Tasks ──
function loadTasks() {
  var cached = getCache('tasks');
  if (cached) { STATE.tasks = cached; renderTasks(); }

  callApi({ action: 'getTasks' }, function(err, data) {
    if (err || !data) {
      if (!cached) document.getElementById('task-list').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>Could not load tasks</h3></div>';
      return;
    }
    var tasks = data.tasks || data || [];
    STATE.tasks = tasks;
    setCache('tasks', tasks);
    renderTasks();

    if (STATE.dept && data.depts) STATE.depts = data.depts;
    loadStaffList();
  });
}

function renderTasks() {
  var listEl = document.getElementById('task-list');
  var status = document.getElementById('filter-status').value;
  var priority = document.getElementById('filter-priority').value;
  var assignee = document.getElementById('filter-assignee').value;
  var dateFrom = document.getElementById('filter-date-from').value;
  var dateTo = document.getElementById('filter-date-to').value;
  var search = document.getElementById('filter-search').value.trim().toLowerCase();

  var filtered = STATE.tasks.filter(function(t) {
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (assignee && t.assignee !== assignee) return false;
    if (dateFrom) { var d = new Date(t.dueDate); if (d < new Date(dateFrom)) return false; }
    if (dateTo) { var d2 = new Date(t.dueDate); if (d2 > new Date(dateTo + 'T23:59:59')) return false; }
    if (search && (t.task || '').toLowerCase().indexOf(search) === -1 && (t.id || '').toLowerCase().indexOf(search) === -1) return false;
    return true;
  });

  document.getElementById('filter-count').textContent = filtered.length + ' of ' + STATE.tasks.length + ' tasks';

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>No tasks match</h3><p>Try changing your filters</p></div>';
    return;
  }

  listEl.innerHTML = filtered.map(function(t) {
    return '<div class="task-item priority-' + (t.priority || 'Medium') + '" onclick="openTask(\'' + escapeHtml(t.id) + '\')">' +
      '<div class="task-top">' +
        '<span class="task-id">' + escapeHtml(t.id || '') + '</span>' +
        '<span class="task-name">' + escapeHtml(t.task || '') + '</span>' +
      '</div>' +
      '<div class="task-bottom">' +
        '<span class="label status-' + (t.status || '').replace(/ /g,'.') + '">' + escapeHtml(t.status || 'To Do') + '</span>' +
        (t.overdue ? '<span class="overdue">⚠️ OVERDUE</span>' : '') +
        '<span class="assignee">' + escapeHtml(t.assignee || '') + '</span>' +
        '<span>' + escapeHtml(t.priority || '') + '</span>' +
        (t.dueDate ? '<span>Due: ' + formatDate(t.dueDate) + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function clearFilters() {
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-priority').value = '';
  document.getElementById('filter-assignee').value = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-search').value = '';
  renderTasks();
}

// ── Task Detail Sheet ──
function openTask(taskId) {
  var task = STATE.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  STATE.selectedTask = task;

  document.getElementById('sheet-title').textContent = task.task || 'Task';
  document.getElementById('sheet-meta').textContent = 'ID: ' + task.id + ' • ' + (task.dept || '');
  document.getElementById('sheet-status').value = task.status || 'To Do';

  var details = [
    { label: 'Task ID', value: task.id },
    { label: 'Priority', value: task.priority },
    { label: 'Status', value: task.status },
    { label: 'Assignee', value: task.assignee },
    { label: 'Department', value: task.dept },
    { label: 'Assignor', value: task.assignor },
    { label: 'Created', value: formatDate(task.createdDate) },
    { label: 'Due', value: formatDate(task.dueDate) },
    { label: 'Completed', value: formatDate(task.completedDate) },
    { label: 'Recurring', value: task.recurring || 'No' },
    { label: 'Overdue', value: task.overdue ? '⚠️ Yes' : 'No' }
  ];

  document.getElementById('sheet-details').innerHTML = details.map(function(d) {
    if (!d.value) return '';
    return '<div class="detail-row"><span class="detail-label">' + d.label + '</span><span class="detail-value">' + escapeHtml(String(d.value)) + '</span></div>';
  }).join('');

  document.getElementById('sheet-overlay').classList.add('open');
  document.getElementById('task-sheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('sheet-overlay').classList.remove('open');
  document.getElementById('task-sheet').classList.remove('open');
}

function updateTaskStatus() {
  var task = STATE.selectedTask;
  if (!task) return;
  var newStatus = document.getElementById('sheet-status').value;

  callApi({ action: 'updateTask', taskId: task.id, status: newStatus }, function(err, data) {
    if (err) { showPopup('error', 'Update Failed', err); return; }
    showPopup('success', 'Status Updated', task.id + ' → ' + newStatus);
    closeSheet();
    STATE.cached = {};
    loadTasks();
    loadDashboard();
  });
}

// ── Create Task ──
function showCreateTask() {
  document.getElementById('create-task-name').value = '';
  document.getElementById('create-priority').value = 'Medium';
  document.getElementById('create-assignee').value = '';
  document.getElementById('create-due-date').value = '';
  document.getElementById('create-description').value = '';

  var deptSel = document.getElementById('create-dept');
  deptSel.innerHTML = '<option value="">Department (auto)</option>';
  if (STATE.depts && STATE.depts.length > 0) {
    STATE.depts.forEach(function(d) {
      deptSel.innerHTML += '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>';
    });
  }

  var staffList = document.getElementById('staff-list');
  var staffSet = new Set();
  STATE.tasks.forEach(function(t) { if (t.assignee) staffSet.add(t.assignee); });
  staffList.innerHTML = Array.from(staffSet).sort().map(function(s) {
    return '<option value="' + escapeHtml(s) + '">';
  }).join('');

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('create-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('create-modal').classList.remove('open');
}

function submitTask() {
  var taskName = document.getElementById('create-task-name').value.trim();
  var assignee = document.getElementById('create-assignee').value.trim();
  var priority = document.getElementById('create-priority').value;
  var dueDate = document.getElementById('create-due-date').value;
  var description = document.getElementById('create-description').value.trim();
  var dept = document.getElementById('create-dept').value;

  if (!taskName || !assignee) {
    showPopup('error', 'Required Fields', 'Task Name and Assignee are required');
    return;
  }

  document.getElementById('create-submit').disabled = true;
  document.getElementById('create-submit').textContent = 'Creating...';

  var params = {
    action: 'createTask',
    task: taskName,
    assignee: assignee,
    priority: priority,
    description: description
  };
  if (dueDate) params.dueDate = dueDate;
  if (dept) params.dept = dept;

  callApi(params, function(err, data) {
    document.getElementById('create-submit').disabled = false;
    document.getElementById('create-submit').textContent = 'Create Task';

    if (err) { showPopup('error', 'Failed', err); return; }

    showPopup('success', 'Task Initiated', taskName + ' created');
    closeModal();

    STATE.cached = {};
    loadTasks();
    loadDashboard();
    switchTab('tasks');
  });
}

// ── Staff List for Filter ──
function loadStaffList() {
  var sel = document.getElementById('filter-assignee');
  var currentVal = sel.value;

  var staff = new Set();
  STATE.tasks.forEach(function(t) { if (t.assignee) staff.add(t.assignee); });
  var sorted = Array.from(staff).sort();

  sel.innerHTML = '<option value="">Assignee</option>' + sorted.map(function(s) {
    return '<option value="' + escapeHtml(s) + '"' + (s === currentVal ? ' selected' : '') + '>' + escapeHtml(s) + '</option>';
  }).join('');
}

// ── Calendar ──
function renderCalendar() {
  var month = STATE.calMonth;
  var year = STATE.calYear;

  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-title').textContent = months[month] + ' ' + year;

  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var daysInPrev = new Date(year, month, 0).getDate();
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate();

  var grid = document.getElementById('cal-grid');
  var html = '<div class="cal-day-header">Sun</div><div class="cal-day-header">Mon</div><div class="cal-day-header">Tue</div><div class="cal-day-header">Wed</div><div class="cal-day-header">Thu</div><div class="cal-day-header">Fri</div><div class="cal-day-header">Sat</div>';

  var tasksByDate = getTasksByDate();

  for (var p = firstDay - 1; p >= 0; p--) {
    html += '<div class="cal-day other-month"><span class="day-num">' + (daysInPrev - p) + '</span></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateKey = year + '-' + month + '-' + d;
    var isToday = (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d);
    var dayTasks = tasksByDate[dateKey] || [];
    var hasTasks = dayTasks.length > 0;
    var hasOverdue = dayTasks.some(function(t) { return t.overdue; });
    var dueToday = dayTasks.some(function(t) { return t.status !== 'Completed' && t.status !== 'Cancelled'; });

    html += '<div class="cal-day' + (isToday ? ' today' : '') + '" onclick="showCalendarDay(' + d + ')">' +
      '<span class="day-num">' + d + '</span>' +
      (hasTasks ? '<span class="dot' + (dueToday ? ' due-today' : ' has-tasks') + '"></span>' : '') +
    '</div>';
  }

  var remaining = 42 - (firstDay + daysInMonth);
  for (var n = 1; n <= remaining; n++) {
    html += '<div class="cal-day other-month"><span class="day-num">' + n + '</span></div>';
  }

  grid.innerHTML = html;
  document.getElementById('cal-tasks').innerHTML = '';
}

function getTasksByDate() {
  var map = {};
  STATE.tasks.forEach(function(t) {
    if (t.dueDate) {
      var d = new Date(t.dueDate);
      var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
  });
  return map;
}

function showCalendarDay(day) {
  var dateKey = STATE.calYear + '-' + STATE.calMonth + '-' + day;
  var tasksByDate = getTasksByDate();
  var tasks = tasksByDate[dateKey] || [];

  var el = document.getElementById('cal-tasks');
  if (tasks.length === 0) {
    el.innerHTML = '<div class="empty-state"><p>No tasks due on this day</p></div>';
    return;
  }

  el.innerHTML = '<h4 style="font-size:14px;font-weight:600;margin-bottom:8px;">' + day + ' ' + document.getElementById('cal-title').textContent + '</h4>' +
    tasks.map(function(t) {
      return '<div class="cal-task-item" onclick="openTask(\'' + escapeHtml(t.id) + '\')">' +
        '<span class="cal-task-id">' + escapeHtml(t.id) + '</span>' +
        '<span class="cal-task-name">' + escapeHtml(t.task) + '</span>' +
        '<span class="cal-task-status">' + escapeHtml(t.status) + (t.overdue ? ' ⚠️' : '') + '</span>' +
      '</div>';
    }).join('');
}

function calPrev() {
  STATE.calMonth--;
  if (STATE.calMonth < 0) { STATE.calMonth = 11; STATE.calYear--; }
  renderCalendar();
}

function calNext() {
  STATE.calMonth++;
  if (STATE.calMonth > 11) { STATE.calMonth = 0; STATE.calYear++; }
  renderCalendar();
}

// ── Reports ──
function renderReport(type) {
  STATE.activeReport = type;
  document.querySelectorAll('.report-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.report === type);
  });

  var container = document.getElementById('report-container');
  container.innerHTML = '<div class="loading-center"><span class="spinner"></span> Loading report...</div>';

  var cached = getCache('report_' + type);
  if (cached) { renderReportData(type, cached, container); }

  callApi({ action: 'getReports', reportType: type }, function(err, data) {
    if (err || !data) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><h3>Could not load report</h3><p>' + (err || 'No data') + '</p></div>';
      return;
    }
    setCache('report_' + type, data);
    renderReportData(type, data, container);
  });
}

function renderReportData(type, data, container) {
  if (type === 'workload') renderWorkloadReport(data, container);
  else if (type === 'dept') renderDeptReport(data, container);
  else if (type === 'trend') renderTrendReport(data, container);
  else if (type === 'priority') renderPriorityReport(data, container);
  else if (type === 'aging') renderAgingReport(data, container);
}

function renderWorkloadReport(data, container) {
  var items = data.workload || data.users || data;
  if (!items || (Array.isArray(items) && items.length === 0)) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><h3>No data</h3></div>';
    return;
  }
  var maxVal = 0;
  if (Array.isArray(items)) items.forEach(function(u) { if (u.count > maxVal) maxVal = u.count; });
  else { items = Object.keys(items).map(function(k) { return { name: k, count: items[k] }; }); maxVal = Math.max.apply(null, items.map(function(u) { return u.count; })); }
  maxVal = maxVal || 1;

  var html = '<div class="chart-container"><h4>Tasks per User</h4><div class="bar-chart">';
  items.forEach(function(u) {
    var pct = (u.count / maxVal) * 100;
    var color = u.count > 10 ? '#ea4335' : u.count > 5 ? '#e65100' : '#1a73e8';
    html += '<div class="bar" style="height:' + pct + '%;background:' + color + ';" title="' + escapeHtml(u.name) + ': ' + u.count + '"><span class="bar-value">' + u.count + '</span><span class="bar-label">' + escapeHtml(u.name || '').substring(0, 6) + '</span></div>';
  });
  html += '</div></div>';

  html += '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>User</th><th>Tasks</th><th>Completed</th><th>Overdue</th><th>Rate</th></tr>';
  items.forEach(function(u) {
    var rate = u.total > 0 ? Math.round((u.completed / u.total) * 100) + '%' : '-';
    html += '<tr><td>' + escapeHtml(u.name) + '</td><td>' + (u.total || u.count || 0) + '</td><td>' + (u.completed || 0) + '</td><td>' + (u.overdue || 0) + '</td><td>' + rate + '</td></tr>';
  });
  html += '</table></div>';
  html += '<button class="csv-export-btn" onclick="exportCSV(\'workload\')">⬇ Export CSV</button>';
  container.innerHTML = html;
}

function renderDeptReport(data, container) {
  var items = data.departments || data.depts || data;
  if (!items || (Array.isArray(items) && items.length === 0)) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><h3>No data</h3></div>';
    return;
  }
  if (!Array.isArray(items)) {
    items = Object.keys(items).map(function(k) { return { name: k, total: items[k].total || items[k].count || items[k], completed: items[k].completed || 0, overdue: items[k].overdue || 0 }; });
  }

  var maxVal = Math.max.apply(null, items.map(function(d) { return d.total || 0; })) || 1;

  var html = '<div class="chart-container"><h4>Department Performance</h4><div class="bar-chart">';
  items.forEach(function(d) {
    var pct = (d.total / maxVal) * 100;
    var compPct = d.total > 0 ? (d.completed / d.total) * 100 : 0;
    html += '<div class="bar" style="height:' + pct + '%;background:' + (compPct > 80 ? '#34a853' : compPct > 50 ? '#fbbc04' : '#ea4335') + ';" title="' + escapeHtml(d.name) + ': ' + d.total + '"><span class="bar-value">' + d.total + '</span><span class="bar-label">' + escapeHtml((d.name || '').substring(0, 8)) + '</span></div>';
  });
  html += '</div></div>';

  html += '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>Department</th><th>Total</th><th>Completed</th><th>Overdue</th><th>Completion Rate</th></tr>';
  items.forEach(function(d) {
    var rate = d.total > 0 ? Math.round((d.completed / d.total) * 100) + '%' : '-';
    html += '<tr><td>' + escapeHtml(d.name) + '</td><td>' + (d.total || 0) + '</td><td>' + (d.completed || 0) + '</td><td>' + (d.overdue || 0) + '</td><td>' + rate + '</td></tr>';
  });
  html += '</table></div>';
  html += '<button class="csv-export-btn" onclick="exportCSV(\'dept\')">⬇ Export CSV</button>';
  container.innerHTML = html;
}

function renderTrendReport(data, container) {
  var weeks = data.weeks || data.trend || data;
  if (!weeks || (Array.isArray(weeks) && weeks.length === 0)) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><h3>No trend data</h3></div>';
    return;
  }
  if (!Array.isArray(weeks)) {
    weeks = Object.keys(weeks).map(function(k) { return { week: k, created: weeks[k].created || weeks[k].tasks || weeks[k].total || 0, completed: weeks[k].completed || 0 }; }).slice(-12);
  }

  var maxVal = Math.max.apply(null, weeks.map(function(w) { return Math.max(w.created || 0, w.completed || 0); })) || 1;

  var html = '<div class="chart-container"><h4>12-Week Trend (Created vs Completed)</h4>';
  weeks.forEach(function(w) {
    var hC = (w.created / maxVal) * 100;
    var hD = (w.completed / maxVal) * 100;
    html += '<div style="display:flex;align-items:flex-end;gap:2px;margin-bottom:6px;height:40px;">';
    html += '<div style="width:10px;height:' + hC + '%;background:#1a73e8;border-radius:2px 2px 0 0;min-height:2px;" title="Created: ' + (w.created || 0) + '"></div>';
    html += '<div style="width:10px;height:' + hD + '%;background:#34a853;border-radius:2px 2px 0 0;min-height:2px;" title="Completed: ' + (w.completed || 0) + '"></div>';
    html += '<span style="font-size:9px;color:var(--text-secondary);margin-left:4px;">' + escapeHtml(w.week || w.label || '') + '</span>';
    html += '</div>';
  });
  html += '<div style="display:flex;gap:16px;font-size:12px;color:var(--text-secondary);margin-top:8px;"><span>🔵 Created</span><span>🟢 Completed</span></div></div>';

  html += '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>Week</th><th>Created</th><th>Completed</th><th>Completion %</th></tr>';
  weeks.forEach(function(w) {
    var rate = w.created > 0 ? Math.round((w.completed / w.created) * 100) + '%' : '-';
    html += '<tr><td>' + escapeHtml(w.week || w.label || '-') + '</td><td>' + (w.created || 0) + '</td><td>' + (w.completed || 0) + '</td><td>' + rate + '</td></tr>';
  });
  html += '</table></div>';
  html += '<button class="csv-export-btn" onclick="exportCSV(\'trend\')">⬇ Export CSV</button>';
  container.innerHTML = html;
}

function renderPriorityReport(data, container) {
  var items = data.distribution || data.priorities || data;
  if (!items || (Array.isArray(items) && items.length === 0)) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">🥧</div><h3>No data</h3></div>';
    return;
  }
  if (!Array.isArray(items)) {
    items = Object.keys(items).map(function(k) { return { label: k, count: items[k] }; });
  }

  var total = items.reduce(function(s, i) { return s + (i.count || 0); }, 0) || 1;
  var colors = { 'Urgent': '#ea4335', 'High': '#e65100', 'Medium': '#fbbc04', 'Low': '#34a853' };

  var html = '<div class="chart-container"><h4>Priority Distribution</h4><div class="pie-chart">';
  var conicGrad = items.map(function(i, idx) {
    var pct = (i.count / total) * 360;
    var color = colors[i.label] || ['#1a73e8','#34a853','#fbbc04','#ea4335','#9334e6','#ff6d01'][idx % 6];
    return color + ' ' + (items.slice(0, idx).reduce(function(s, j) { return s + (j.count / total) * 360; }, 0)) + 'deg ' + (items.slice(0, idx + 1).reduce(function(s, j) { return s + (j.count / total) * 360; }, 0)) + 'deg';
  }).join(', ');
  html += '<div class="pie-canvas" style="background:conic-gradient(' + conicGrad + ');"></div>';
  html += '<div class="pie-legend">';
  items.forEach(function(i) {
    var color = colors[i.label] || '#1a73e8';
    var pct = Math.round((i.count / total) * 100);
    html += '<div class="legend-item"><span class="legend-dot" style="background:' + color + ';"></span> ' + escapeHtml(i.label) + ': ' + i.count + ' (' + pct + '%)</div>';
  });
  html += '</div></div></div>';

  html += '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>Priority</th><th>Count</th><th>%</th></tr>';
  items.forEach(function(i) {
    var pct = Math.round((i.count / total) * 100);
    html += '<tr><td>' + escapeHtml(i.label) + '</td><td>' + i.count + '</td><td>' + pct + '%</td></tr>';
  });
  html += '</table></div>';
  html += '<button class="csv-export-btn" onclick="exportCSV(\'priority\')">⬇ Export CSV</button>';
  container.innerHTML = html;
}

function renderAgingReport(data, container) {
  var buckets = data.aging || data.buckets || data;
  if (!buckets || (Array.isArray(buckets) && buckets.length === 0)) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">⏰</div><h3>No overdue tasks</h3><p>All caught up!</p></div>';
    return;
  }
  if (!Array.isArray(buckets)) {
    buckets = Object.keys(buckets).map(function(k) { return { label: k, count: buckets[k] }; });
  }

  var maxVal = Math.max.apply(null, buckets.map(function(b) { return b.count; })) || 1;
  var colors = ['#34a853', '#fbbc04', '#e65100', '#ea4335'];

  var html = '<div class="chart-container"><h4>Overdue Aging</h4><div class="bar-chart">';
  buckets.forEach(function(b, idx) {
    var pct = (b.count / maxVal) * 100;
    html += '<div class="bar" style="height:' + pct + '%;background:' + (colors[idx] || '#ea4335') + ';" title="' + escapeHtml(b.label) + ': ' + b.count + '"><span class="bar-value">' + b.count + '</span><span class="bar-label">' + escapeHtml((b.label || '').substring(0, 8)) + '</span></div>';
  });
  html += '</div></div>';

  html += '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>Bucket</th><th>Count</th></tr>';
  buckets.forEach(function(b) {
    html += '<tr><td>' + escapeHtml(b.label) + '</td><td>' + (b.count || 0) + '</td></tr>';
  });
  html += '</table></div>';
  html += '<button class="csv-export-btn" onclick="exportCSV(\'aging\')">⬇ Export CSV</button>';
  container.innerHTML = html;
}

// ── Notifications ──
function loadNotifications() {
  var el = document.getElementById('notif-list');
  el.innerHTML = '<div class="loading-center"><span class="spinner"></span> Loading...</div>';

  var cached = getCache('notifications');
  if (cached) { renderNotifications(cached, el); }

  callApi({ action: 'getNotifications' }, function(err, data) {
    if (err || !data) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><h3>No notifications</h3></div>';
      return;
    }
    var items = data.notifications || data;
    setCache('notifications', items);
    renderNotifications(items, el);
  });
}

function renderNotifications(items, el) {
  if (!items || (items.length || 0) === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><h3>No notifications</h3><p>You\'re all caught up</p></div>';
    return;
  }
  el.innerHTML = items.map(function(n) {
    return '<div class="notif-item' + (n.unread ? ' unread' : '') + '" onclick="openTask(\'' + escapeHtml(n.taskId || '') + '\')">' +
      '<div class="notif-time">' + escapeHtml(n.time || '') + '</div>' +
      '<div class="notif-text">' + escapeHtml(n.text || n.message || '') + '</div>' +
    '</div>';
  }).join('');
}

// ── Comments (in task sheet) ──
function loadComments(taskId) {
  if (!taskId) return;
  callApi({ action: 'getComments', taskId: taskId }, function(err, data) {
    var el = document.getElementById('sheet-comments');
    if (!el) return;
    var items = data.comments || data || [];
    el.innerHTML = items.map(function(c) {
      return '<div class="comment-item"><div class="comment-meta"><span class="comment-author">' + escapeHtml(c.author || '') + '</span> • ' + escapeHtml(c.time || '') + '</div><div>' + escapeHtml(c.text || '') + '</div></div>';
    }).join('');
  });
}

function addComment(taskId) {
  var input = document.getElementById('comment-input');
  if (!input) return;
  var text = input.value.trim();
  if (!text || !taskId) return;
  input.value = '';
  callApi({ action: 'addComment', taskId: taskId, text: text }, function(err, data) {
    if (err) { showPopup('error', 'Comment Failed', err); return; }
    loadComments(taskId);
    showPopup('info', 'Comment Added', '');
  });
}

// ── CSV Export ──
function exportCSV(type) {
  var container = document.getElementById('report-container');
  var tables = container.querySelectorAll('.report-table');
  if (tables.length === 0) { showPopup('error', 'No Data', 'Nothing to export'); return; }

  var csv = [];
  tables.forEach(function(table) {
    var rows = table.querySelectorAll('tr');
    rows.forEach(function(row) {
      var cells = row.querySelectorAll('th, td');
      var rowData = Array.from(cells).map(function(c) { return '"' + (c.textContent || '').replace(/"/g, '""') + '"'; }).join(',');
      csv.push(rowData);
    });
  });

  var blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = type + '-report.csv';
  link.click();
  URL.revokeObjectURL(link.href);
  showPopup('success', 'Exported', type + ' report downloaded');
}

// ── Cache ──
function getCache(key) {
  if (STATE.cached[key]) return STATE.cached[key];
  try {
    var stored = localStorage.getItem('tm_cache_' + key);
    if (stored) {
      var parsed = JSON.parse(stored);
      if (Date.now() - parsed.ts < 120000) { // 2 min TTL
        STATE.cached[key] = parsed.data;
        return parsed.data;
      }
    }
  } catch(e) {}
  return null;
}

function setCache(key, data) {
  STATE.cached[key] = data;
  try {
    localStorage.setItem('tm_cache_' + key, JSON.stringify({ data: data, ts: Date.now() }));
  } catch(e) {}
}

// ── Helpers ──
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function formatDate(d) {
  if (!d) return '';
  var date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return ('0' + date.getDate()).slice(-2) + '/' + ('0' + (date.getMonth() + 1)).slice(-2) + '/' + date.getFullYear();
}

function showPopup(type, title, subtitle) {
  var overlay = document.getElementById('popup-overlay');
  var icons = { success: '✅', error: '❌', info: 'ℹ️' };
  var box = document.createElement('div');
  box.className = 'popup-box ' + type;
  box.innerHTML = '<span class="popup-icon">' + (icons[type] || 'ℹ️') + '</span><span>' + (title ? '<strong>' + escapeHtml(title) + '</strong> ' : '') + escapeHtml(subtitle || '') + '</span>';
  overlay.appendChild(box);
  setTimeout(function() {
    box.style.opacity = '0';
    box.style.transform = 'translateY(-10px)';
    box.style.transition = '.3s ease';
    setTimeout(function() { if (box.parentNode) box.parentNode.removeChild(box); }, 300);
  }, 2500);
}

function showError(msg) {
  var el = document.getElementById('login-error');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Filter Event Listeners ──
document.addEventListener('DOMContentLoaded', function() {
  ['filter-status','filter-priority','filter-assignee','filter-date-from','filter-date-to','filter-search'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', renderTasks);
    if (id === 'filter-search') document.getElementById(id).addEventListener('input', renderTasks);
  });

  document.querySelectorAll('.report-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { renderReport(this.dataset.report); });
  });

  autoLogin();
});
