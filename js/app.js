/* ═══════════════════════════════════════════
   TaskFlow PWA v3.1
   ═══════════════════════════════════════════ */

// ── Emergency reset: ?reset in URL kills all caches & Service Workers ──
(function() {
  if (location.search.indexOf('reset') !== -1) {
    if ('caches' in window) { caches.keys().then(function(k) { k.forEach(function(c) { caches.delete(c); }); }); }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(r) { r.forEach(function(s) { s.unregister(); }); });
    }
    localStorage.clear();
    console.log('RESET: caches + SW + localStorage cleared');
  }
})();

var STATE = {
  url: '', email: '', token: '', dept: '', depts: [],
  tasks: [], cached: {}, calMonth: null, calYear: null,
  selectedTask: null, activeReport: 'mgmt', activeDept: ''
};
var APP_VERSION = '3.1.0';

// ── API (GET + JSONP — zero CORS issues) ──
function callApi(params, cb) {
  params.token = STATE.token; params.email = STATE.email;
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
  }).join('&');
  var cbName = 'jp' + Date.now() + Math.random().toString(36).slice(2,5);
  var url = STATE.url + '?' + qs + '&callback=' + cbName;

  window[cbName] = function(d) {
    delete window[cbName]; var s = document.getElementById(cbName);
    if (s) s.remove(); cb(null, d);
  };
  var s = document.createElement('script'); s.id = cbName;
  s.src = url;
  s.onerror = function() { delete window[cbName]; s.remove(); cb('Network error', null); };
  document.head.appendChild(s);
}

// ── Auth ──
function login() {
  var url = document.getElementById('login-url').value.trim();
  var email = document.getElementById('login-email').value.trim();
  var token = document.getElementById('login-token').value.trim();
  if (!url || !email || !token) return showError('All fields required');
  STATE.url = url.replace(/\/+$/, ''); STATE.email = email; STATE.token = token;
  var btn = document.getElementById('login-btn'); btn.disabled = true; btn.textContent = 'Connecting...';
  document.getElementById('login-error').style.display = 'none';

  callApi({ action: 'getDashboard' }, function(err, data) {
    btn.disabled = false; btn.textContent = 'Sign In';
    if (err || !data) return showError('Connection failed: ' + (err || 'No response'));
    if (data.error) return showError('Server: ' + data.error);

    localStorage.setItem('tf_url', STATE.url);
    localStorage.setItem('tf_email', STATE.email);
    localStorage.setItem('tf_token', STATE.token);
    STATE.dept = data.userDept || data.dept || '';
    STATE.depts = data.depts || [];
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('user-email').textContent = email.split('@')[0];
    document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
    init();
  });
}

function autoLogin() {
  var url = localStorage.getItem('tf_url');
  var email = localStorage.getItem('tf_email');
  var token = localStorage.getItem('tf_token');
  if (!url || !email || !token) return;
  STATE.url = url; STATE.email = email; STATE.token = token;
  document.getElementById('login-url').value = url;
  document.getElementById('login-email').value = email;
  document.getElementById('login-token').value = token;

  callApi({ action: 'getDashboard' }, function(err, data) {
    if (err || !data || data.error) { logout(); return; }
    STATE.dept = data.userDept || data.dept || '';
    STATE.depts = data.depts || [];
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app').classList.add('active');
    document.getElementById('user-email').textContent = email.split('@')[0];
    document.getElementById('user-avatar').textContent = email.charAt(0).toUpperCase();
    document.getElementById('settings-email').textContent = email;
    init();
  });
}

// ── Init ──
function init() {
  document.getElementById('settings-email').textContent = STATE.email;
  document.getElementById('settings-dept').textContent = STATE.dept || 'All';
  var d = new Date();
  STATE.calMonth = d.getMonth(); STATE.calYear = d.getFullYear();
  initSettings(); loadDashboard();
}

// ── Tab Switching ──
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector('.tab-btn[data-tab="' + name + '"]').classList.add('active');
  if (name === 'dashboard') { STATE.activeDept = ''; loadDashboard(); }
  else if (name === 'tasks') { populateDeptPicker(); loadTasks(); }
  else if (name === 'depts') { STATE.activeDept = ''; loadDepts(); }
  else if (name === 'calendar') renderCalendar();
  else if (name === 'reports') renderReport(STATE.activeReport);
}

function populateDeptPicker() {
  var picker = document.getElementById('dept-picker');
  var opts = document.getElementById('dept-picker-options');
  if (!picker || !opts) return;
  if (STATE.depts.length <= 1) { picker.style.display = 'none'; return; }
  opts.innerHTML = STATE.depts.map(function(d) {
    var active = d === STATE.activeDept;
    return '<button style="padding:6px 14px;border:2px solid ' + (active ? 'var(--primary)' : 'var(--border)') + ';border-radius:16px;background:' + (active ? 'var(--primary-light)' : 'var(--bg-card)') + ';font-size:12px;font-weight:' + (active ? '700' : '500') + ';cursor:pointer;color:' + (active ? 'var(--primary)' : 'var(--text-secondary)') + ';" onclick="selectDept(\'' + esc(d) + '\')">' + esc(d) + '</button>';
  }).join('');
  picker.style.display = STATE.activeDept ? 'block' : 'none';
}

function selectDept(dept) {
  STATE.activeDept = dept;
  populateDeptPicker();
  loadTasks();
}

function showAllDepts() {
  STATE.activeDept = '';
  switchTab('depts');
}

// ── Dashboard (fast — stats + today/overdue only) ──
function loadDashboard() {
  var el = document.getElementById('dash-stats');
  el.innerHTML = '<div class="skeleton skeleton-stat"></div><div class="skeleton skeleton-stat"></div><div class="skeleton skeleton-stat"></div><div class="skeleton skeleton-stat"></div>';
  var dueEl = document.getElementById('dash-due-today');
  var overEl = document.getElementById('dash-overdue');
  var compEl = document.getElementById('dash-completed');
  var cached = getCache('dash');
  if (cached) renderDash(cached, el, dueEl, overEl, compEl);

  callApi({ action: 'getDashboard' }, function(err, data) {
    if (err || !data || data.error) {
      if (!cached) el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><h3>Could not load</h3></div>';
      return;
    }
    if (data.depts) STATE.depts = data.depts;
    if (data.userDept) STATE.dept = data.userDept;
    document.getElementById('settings-dept').textContent = STATE.dept || 'All';
    setCache('dash', data);
    renderDash(data, el, dueEl, overEl, compEl);
    if (!STATE._staff) loadStaffList();
  });
}

function renderDash(data, el, dueEl, overEl, compEl) {
  var s = data.stats || {};
  el.innerHTML =
    '<div class="stat-card primary"><div class="stat-value">' + (s.total||0) + '</div><div class="stat-label">Total</div></div>' +
    '<div class="stat-card orange"><div class="stat-value">' + (s.inProgress||0) + '</div><div class="stat-label">In Progress</div></div>' +
    '<div class="stat-card accent"><div class="stat-value">' + (s.overdue||0) + '</div><div class="stat-label">Overdue</div></div>' +
    '<div class="stat-card green"><div class="stat-value">' + (s.completed||0) + '</div><div class="stat-label">Completed</div></div>';
  dueEl.innerHTML = taskListItems(data.dueToday||[]);
  overEl.innerHTML = taskListItems(data.overdue||[]);
  compEl.innerHTML = taskListItems(data.completedYest||[]);
}

function taskListItems(arr) {
  if (!arr || !arr.length) return '<div class="empty-state" style="padding:12px 0"><p style="font-size:13px">None</p></div>';
  return arr.map(function(t) {
    return '<div class="list-item" onclick="openTask(\'' + esc(t.id) + '\')">' +
      '<span class="item-id">' + esc(t.id) + '</span>' +
      '<span class="item-name">' + esc(t.task) + '</span>' +
      '<span class="item-status status-' + (t.status||'').replace(/ /g,'.') + '">' + esc(t.status) + '</span></div>';
  }).join('');
}

// ── Tasks (loaded on-demand when tab is opened) ──
function loadTasks() {
  var el = document.getElementById('task-list');
  var picker = document.getElementById('dept-picker');
  // Show dept picker for multi-dept users when no specific dept selected
  if (STATE.depts.length > 1 && !STATE.activeDept) {
    if (picker) picker.style.display = 'block';
    el.innerHTML = '<div class="empty-state" style="padding:20px 0"><div class="empty-icon">📂</div><h3>Select a department</h3><p>Choose a department to view its tasks</p></div>';
    document.getElementById('filter-count').textContent = '';
    return;
  }
  if (picker) picker.style.display = 'none';
  el.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';
  var cacheKey = 'tasks_' + (STATE.activeDept || 'all');
  var cached = getCache(cacheKey);
  if (cached) { STATE.tasks = cached; renderTasks(); populateFilterStaff(); return; }
  var p = STATE.activeDept ? { action: 'getDeptTasks', dept: STATE.activeDept } : { action: 'getTasks' };
  callApi(p, function(err, data) {
    if (err || !data || data.error) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>Could not load</h3></div>';
      return;
    }
    var tasks = [];
    if (data.tasks) tasks = data.tasks;
    else if (data.departments) data.departments.forEach(function(d) { tasks = tasks.concat(d.tasks || []); });
    STATE.tasks = tasks;
    if (data.depts) STATE.depts = data.depts;
    setCache(cacheKey, STATE.tasks);
    if (!STATE.tasks.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>No tasks found</h3></div>';
      return;
    }
    renderTasks();
    populateFilterStaff();
  });
}

// ── Tasks (uses STATE.tasks from dashboard, no API call) ──
function renderTasks() {
  var el = document.getElementById('task-list');
  var st = document.getElementById('filter-status').value;
  var pr = document.getElementById('filter-priority').value;
  var as = document.getElementById('filter-assignee').value;
  var df = document.getElementById('filter-date-from').value;
  var dt = document.getElementById('filter-date-to').value;
  var sq = document.getElementById('filter-search').value.trim().toLowerCase();
  var fl = STATE.tasks.filter(function(t) {
    if (st && t.status !== st) return false;
    if (pr && t.priority !== pr) return false;
    if (as && t.assignee !== as) return false;
    if (df) { var d1 = new Date(t.dueDate); if (d1 < new Date(df)) return false; }
    if (dt) { var d2 = new Date(t.dueDate); if (d2 > new Date(dt + 'T23:59:59')) return false; }
    if (sq && (t.task||'').toLowerCase().indexOf(sq) === -1 && (t.id||'').toLowerCase().indexOf(sq) === -1) return false;
    return true;
  });
  document.getElementById('filter-count').textContent = fl.length + ' of ' + STATE.tasks.length;
  if (!fl.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><h3>No tasks match</h3><p>Try different filters</p></div>';
    return;
  }
  el.innerHTML = fl.map(function(t) {
    return '<div class="task-item priority-' + (t.priority||'Medium') + '" onclick="openTask(\'' + esc(t.id) + '\')">' +
      '<div class="task-top"><span class="task-id">' + esc(t.id) + '</span><span class="task-name">' + esc(t.task) + '</span></div>' +
      '<div class="task-bottom">' +
        '<span class="label status-' + (t.status||'To.Do').replace(/ /g,'.') + '">' + esc(t.status||'To Do') + '</span>' +
        (t.overdue ? ' <span class="overdue">⚠️ OVERDUE</span>' : '') +
        (t.interDept ? ' <span style="background:#f3e5f5;color:#6c5ce7;padding:1px 8px;border-radius:6px;font-weight:600;font-size:10px;">↔ INTER-DEPT</span>' : '') +
        ' <span>' + esc(t.assignor||'') + ' → ' + esc(t.assignee||'') + '</span>' +
        (t.dept ? ' <span>📁 ' + esc(t.dept) + '</span>' : '') +
        (t.dueDate ? ' <span>📅 ' + fmtDate(t.dueDate) + '</span>' : '') +
      '</div></div>';
  }).join('');
}

function clearFilters() {
  ['filter-status','filter-priority','filter-assignee','filter-date-from','filter-date-to','filter-search'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  if (STATE.activeDept) { STATE.activeDept = ''; loadTasks(); return; }
  renderTasks();
}

function populateFilterStaff() {
  var sel = document.getElementById('filter-assignee');
  var cur = sel.value;
  var s = new Set();
  STATE.tasks.forEach(function(t) { if (t.assignee) s.add(t.assignee); });
  sel.innerHTML = '<option value="">Assignee</option>' + Array.from(s).sort().map(function(n) {
    return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
  }).join('');
}

// ── Departments ──
function loadDepts() {
  var el = document.getElementById('dept-list');
  el.innerHTML = '<div class="loading-center"><span class="spinner"></span> Loading departments...</div>';
  callApi({ action: 'getDeptSummary' }, function(err, data) {
    if (err || !data || data.error || !data.departments) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div><h3>Could not load</h3></div>';
      return;
    }
    renderDeptCards(data.departments);
  });
}

function renderDeptCards(depts) {
  var el = document.getElementById('dept-list');
  if (!depts || !depts.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div><h3>No departments found</h3></div>';
    return;
  }
  el.innerHTML = depts.map(function(d) {
    return '<div class="dept-card" onclick="showDeptTasks(\'' + esc(d.dept) + '\')" style="background:var(--bg-card);border-radius:var(--radius);padding:16px;margin-bottom:10px;box-shadow:var(--shadow-sm);border:1px solid var(--border);cursor:pointer;transition:var(--transition);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<div style="font-size:16px;font-weight:700;">📁 ' + esc(d.dept) + '</div>' +
        '<div style="font-size:22px;font-weight:800;color:var(--primary);">' + d.total + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        (d.inProgress ? '<span style="background:#fff3e0;color:#e17055;padding:3px 12px;border-radius:10px;font-size:11px;font-weight:600;">🔵 ' + d.inProgress + ' Active</span>' : '') +
        (d.overdue ? '<span style="background:#ffeef0;color:var(--danger);padding:3px 12px;border-radius:10px;font-size:11px;font-weight:600;">🔴 ' + d.overdue + ' Overdue</span>' : '') +
        (d.completed ? '<span style="background:#e8f8f5;color:var(--success);padding:3px 12px;border-radius:10px;font-size:11px;font-weight:600;">🟢 ' + d.completed + ' Done</span>' : '') +
        (d.urgent ? '<span style="background:#fff0f0;color:#d63031;padding:3px 12px;border-radius:10px;font-size:11px;font-weight:600;">⚡ ' + d.urgent + ' Urgent</span>' : '') +
        (!d.inProgress && !d.overdue && !d.completed && !d.urgent ? '<span style="color:var(--text-light);font-size:12px;">No tasks</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function showDeptTasks(dept) {
  STATE.activeDept = dept;
  switchTab('tasks');
  loadTasks();
}

// ── Task Sheet ──
function openTask(id) {
  var t = STATE.tasks.find(function(x) { return x.id === id; });
  if (!t) return;
  STATE.selectedTask = t;
  document.getElementById('sheet-title').textContent = t.task || 'Task';
  document.getElementById('sheet-meta').textContent = 'ID: ' + t.id + ' • ' + (t.dept||'');

  // Detail grid
  var items = [
    ['Task ID', t.id], ['Priority', t.priority], ['Status', t.status],
    ['Assignee', t.assignee], ['Department', t.dept], ['Assignor', t.assignor],
    ['Email', t.email], ['Mobile', t.mobile],
    ['Created', t.createdDate ? fmtDate(t.createdDate) : ''],
    ['Due', t.dueDate ? fmtDate(t.dueDate) : ''],
    ['Completed', t.completedDate ? fmtDate(t.completedDate) : ''],
    ['Recurring', t.recurring || 'No'],
    ['Inter-Dept', t.interDept ? '↔ Yes' : 'No']
  ];
  document.getElementById('sheet-details').innerHTML = items.map(function(i) {
    if (!i[1]) return '';
    return '<div class="detail-item"><div class="dl">' + i[0] + '</div><div class="dv">' + esc(String(i[1])) + '</div></div>';
  }).join('');

  // Populate editable fields
  document.getElementById('sheet-status').value = t.status || 'To Do';
  document.getElementById('sheet-priority').value = t.priority || 'Medium';
  document.getElementById('sheet-due-date').value = t.dueDate || '';
  document.getElementById('sheet-reschedule-date').value = t.rescheduleDate || t.dueDate || '';
  document.getElementById('sheet-reschedule-reason').value = t.rescheduleReason || '';
  document.getElementById('sheet-recurring').value = t.recurring || 'No';
  document.getElementById('sheet-recurring-type').value = t.recurringType || '';
  document.getElementById('sheet-remarks').value = t.remarks || '';
  document.getElementById('sheet-description').value = t.description || '';

  document.getElementById('sheet-overlay').classList.add('open');
  document.getElementById('task-sheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('sheet-overlay').classList.remove('open');
  document.getElementById('task-sheet').classList.remove('open');
}

function updateTaskAll() {
  var t = STATE.selectedTask;
  if (!t) return;
  var params = { action: 'updateTask', taskId: t.id };
  var status = document.getElementById('sheet-status').value;
  var priority = document.getElementById('sheet-priority').value;
  var dueDate = document.getElementById('sheet-due-date').value;
  var rescheduleDate = document.getElementById('sheet-reschedule-date').value;
  var rescheduleReason = document.getElementById('sheet-reschedule-reason').value.trim();
  var recurring = document.getElementById('sheet-recurring').value;
  var recurringType = document.getElementById('sheet-recurring-type').value;
  var remarks = document.getElementById('sheet-remarks').value.trim();
  var description = document.getElementById('sheet-description').value.trim();

  // Only send changed values
  if (status !== t.status) params.status = status;
  if (priority !== t.priority) params.priority = priority;
  if (dueDate !== t.dueDate) params.dueDate = dueDate;
  if (rescheduleDate && rescheduleDate !== t.dueDate) params.rescheduleDate = rescheduleDate;
  if (rescheduleReason) params.rescheduleReason = rescheduleReason;
  if (recurring !== (t.recurring || 'No')) params.recurring = recurring;
  if (recurringType !== (t.recurringType || '')) params.recurringType = recurringType;
  if (remarks !== (t.remarks || '')) params.remarks = remarks;
  if (description !== (t.description || '')) params.description = description;

  // Always send at least status if nothing else changed
  if (Object.keys(params).length < 2) params.status = status;

  callApi(params, function(err, data) {
    if (err || (data && data.error)) return popup('error', 'Failed', err || data.error);
    popup('success', 'Saved', t.id + ' updated');
    closeSheet(); STATE.cached = {}; loadDashboard();
  });
}

// ── Create Task ──
function loadStaffList(cb) {
  if (STATE._staff && STATE._staff.length) { if (cb) cb(STATE._staff); return; }
  callApi({ action: 'getStaffList' }, function(err, data) {
    if (err || !data || !data.staff) { if (cb) cb([]); return; }
    STATE._staff = data.staff;
    if (data.depts) STATE.depts = data.depts;
    if (cb) cb(data.staff);
  });
}

function showCreateTask() {
  document.getElementById('create-task-name').value = '';
  document.getElementById('create-priority').value = 'Medium';
  document.getElementById('create-due-date').value = '';
  document.getElementById('create-description').value = '';
  document.getElementById('create-staff-info').style.display = 'none';
  document.getElementById('create-staff-info').innerHTML = '';
  document.getElementById('create-recurring').value = 'No';
  document.getElementById('create-recurring-type').value = '';
  document.getElementById('create-assignor').innerHTML = '<option value="">Loading staff...</option>';
  document.getElementById('create-assignee').innerHTML = '<option value="">Loading staff...</option>';
  document.getElementById('create-dept').innerHTML = '<option value="">Loading...</option>';

  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('create-modal').classList.add('open');

  loadStaffList(function(staff) {
    if (!staff || !staff.length) {
      popup('error', 'Failed', 'Staff list empty — check Staff Directory sheet');
      return;
    }
    // Pre-fill assignor by looking up current user email
    var currentEmail = STATE.email || '';
    var currentName = currentEmail.split('@')[0];
    var me = staff.find(function(s) { return s.email === currentEmail || s.aliasEmail === currentEmail; });
    if (me) currentName = me.name;

    var ds = document.getElementById('create-dept');
    ds.innerHTML = '<option value="">Department (auto-detect)</option>';
    var depts = {};
    staff.forEach(function(s) { if (s.dept) depts[s.dept] = true; });
    Object.keys(depts).sort().forEach(function(d) { ds.innerHTML += '<option value="' + esc(d) + '">' + esc(d) + '</option>'; });

    var ao = document.getElementById('create-assignor');
    var ae = document.getElementById('create-assignee');
    ao.innerHTML = '<option value="">Assignor *</option>';
    ae.innerHTML = '<option value="">Assignee *</option>';
    staff.forEach(function(s) {
      ao.innerHTML += '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>';
      ae.innerHTML += '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>';
    });
    for (var i = 0; i < ao.options.length; i++) {
      if (ao.options[i].value === currentName) { ao.value = currentName; break; }
    }
  });
}

function lookupStaffDept() {
  var name = document.getElementById('create-assignee').value;
  var info = document.getElementById('create-staff-info');
  if (!name) { info.style.display = 'none'; return; }

  var match = (STATE._staff || STATE.staffList || []).find(function(s) { return s.name === name; });
  if (!match) { info.style.display = 'none'; return; }
  showStaffInfo(match, info);
}

function showStaffInfo(s, info) {
  info.style.display = 'block';
  info.innerHTML = '📁 ' + esc(s.dept) + ' • ' + esc(s.email) + (s.mobile ? ' • 📞 ' + esc(s.mobile) : '');
  var ds = document.getElementById('create-dept');
  if (s.dept) {
    for (var i = 0; i < ds.options.length; i++) {
      if (ds.options[i].value === s.dept) { ds.value = s.dept; break; }
    }
  }
  if (STATE.dept && s.dept && s.dept !== STATE.dept) {
    info.innerHTML += '<br><span style="color:var(--danger);font-weight:600;">↔ Inter-Dept: ' + esc(s.dept) + ' ≠ ' + esc(STATE.dept) + '</span>';
  }
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('create-modal').classList.remove('open');
}

function submitTask() {
  var tn = document.getElementById('create-task-name').value.trim();
  var ao = document.getElementById('create-assignor').value;
  var as = document.getElementById('create-assignee').value;
  var pr = document.getElementById('create-priority').value;
  var dd = document.getElementById('create-due-date').value;
  var ds = document.getElementById('create-description').value.trim();
  var dp = document.getElementById('create-dept').value;
  if (!tn || !as || !ao) return popup('error', 'Required', 'Task name, assignor and assignee required');
  var btn = document.getElementById('create-submit'); btn.disabled = true; btn.textContent = 'Creating...';
  var rc = document.getElementById('create-recurring').value;
  var rt = document.getElementById('create-recurring-type').value;
  var st = document.getElementById('create-status').value;
  var p = { action: 'createTask', task: tn, assignee: as, priority: pr, status: st, description: ds, assignor: ao, recurring: rc };
  if (rt) p.recurringType = rt;
  if (dd) p.dueDate = dd; if (dp) p.dept = dp;
  callApi(p, function(err, data) {
    btn.disabled = false; btn.textContent = 'Create Task';
    if (err || (data && data.error)) return popup('error', 'Failed', err || data.error);
    popup('success', 'Task Initiated', tn);
    closeModal(); STATE.cached = {}; loadDashboard();
  });
}

// ── Calendar ──
function renderCalendar() {
  var m = STATE.calMonth, y = STATE.calYear;
  var ms = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-title').textContent = ms[m] + ' ' + y;
  var fd = new Date(y,m,1).getDay(), dim = new Date(y,m+1,0).getDate();
  var dip = new Date(y,m,0).getDate();
  var today = new Date();
  var grid = document.getElementById('cal-grid');
  var html = 'Sun|Mon|Tue|Wed|Thu|Fri|Sat'.split('|').map(function(d){return'<div class="cal-day-header">'+d+'</div>'}).join('');
  for (var p = fd - 1; p >= 0; p--) html += '<div class="cal-day other-month"><span class="day-num">' + (dip-p) + '</span></div>';
  for (var d = 1; d <= dim; d++) {
    var dt = y + '-' + m + '-' + d;
    var isT = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
    var dayT = getTasksForDate(dt);
    var hasT = dayT.length > 0, hasO = dayT.some(function(t){return t.overdue});
    html += '<div class="cal-day' + (isT?' today':'') + '" onclick="showCalDay('+d+')"><span class="day-num">' + d + '</span>' +
      (hasT ? '<span class="dot' + (hasO?' overdue-dot':' has-tasks') + '"></span>' : '') + '</div>';
  }
  for (var n = 1; n <= 42 - (fd + dim); n++) html += '<div class="cal-day other-month"><span class="day-num">' + n + '</span></div>';
  grid.innerHTML = html;
  document.getElementById('cal-tasks').innerHTML = '';
}

function getTasksForDate(dateKey) {
  return STATE.tasks.filter(function(t) {
    if (!t.dueDate) return false;
    var d = new Date(t.dueDate);
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() === dateKey;
  });
}

function showCalDay(day) {
  var dk = STATE.calYear + '-' + STATE.calMonth + '-' + day;
  var tasks = getTasksForDate(dk);
  var el = document.getElementById('cal-tasks');
  if (!tasks.length) { el.innerHTML = '<div class="empty-state"><p>No tasks due this day</p></div>'; return; }
  el.innerHTML = '<h4 style="font-size:14px;font-weight:700;margin-bottom:8px;">' + day + ' ' + document.getElementById('cal-title').textContent + '</h4>' +
    tasks.map(function(t) {
      return '<div class="cal-task-item" onclick="openTask(\'' + esc(t.id) + '\')">' +
        '<span class="cal-task-id">' + esc(t.id) + '</span>' +
        '<span class="cal-task-name">' + esc(t.task) + '</span>' +
        '<span class="cal-task-status">' + esc(t.status) + (t.overdue ? ' ⚠️' : '') + '</span></div>';
    }).join('');
}

function calPrev() { STATE.calMonth--; if (STATE.calMonth<0){STATE.calMonth=11;STATE.calYear--} renderCalendar(); }
function calNext() { STATE.calMonth++; if (STATE.calMonth>11){STATE.calMonth=0;STATE.calYear++} renderCalendar(); }

// ── Reports ──
function renderReport(type) {
  STATE.activeReport = type;
  document.querySelectorAll('.report-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.report === type);
  });
  var el = document.getElementById('report-container');
  el.innerHTML = '<div class="loading-center"><span class="spinner"></span> Loading...</div>';
  var cached = getCache('rpt_' + type);
  if (cached) { renderReportData(type, cached, el); return; }
  var action = type === 'mgmt' ? 'getManagementReports' : 'getReports';
  var p = type === 'mgmt' ? { action: action } : { action: action, reportType: type };
  callApi(p, function(err, data) {
    if (err || !data || data.error) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📈</div><h3>Could not load</h3></div>';
      return;
    }
    setCache('rpt_' + type, data);
    renderReportData(type, data, el);
  });
}

function renderReportData(type, data, el) {
  if (type === 'mgmt') return renderMgmtReport(data, el);
  else if (type === 'workload') renderWorkload(data, el);
  else if (type === 'dept') renderDeptReport(data, el);
  else if (type === 'trend') renderTrend(data, el);
  else if (type === 'priority') renderPriority(data, el);
  else if (type === 'aging') renderAging(data, el);
}

function renderMgmtReport(data, el) {
  var s = data.summary || {};
  var depts = data.departments || [];
  var w = data.weekly || {}; var mo = data.monthly || {};
  el.innerHTML =
    '<div class="mgmt-summary">' +
      '<div class="mgmt-stat"><div class="mgmt-value primary">'+(s.total||0)+'</div><div class="mgmt-label">Total Tasks</div></div>' +
      '<div class="mgmt-stat"><div class="mgmt-value orange">'+(s.open||0)+'</div><div class="mgmt-label">Open</div></div>' +
      '<div class="mgmt-stat"><div class="mgmt-value green">'+(s.completed||0)+'</div><div class="mgmt-label">Completed</div></div>' +
      '<div class="mgmt-stat"><div class="mgmt-value red">'+(s.overdue||0)+'</div><div class="mgmt-label">Overdue</div></div>' +
    '</div>' +
    '<div class="chart-container"><div style="display:flex;gap:16px;font-size:13px;font-weight:600;margin-bottom:12px;">' +
      '<span>📅 This Week: <strong>'+(w.created||0)+'</strong> created, <strong>'+(w.completed||0)+'</strong> completed</span>' +
      '<span>📅 This Month: <strong>'+(mo.created||0)+'</strong> created, <strong>'+(mo.completed||0)+'</strong> completed</span>' +
    '</div></div>' +
    '<div class="chart-container"><h4>Department Performance</h4><table class="report-table">' +
    '<tr><th>Department</th><th>Total</th><th>Completed</th><th>Rate</th><th>Overdue</th></tr>' +
    depts.map(function(d) {
      return '<tr><td><strong>'+esc(d.name)+'</strong></td><td>'+d.total+'</td><td>'+d.completed+'</td><td>'+d.rate+'%</td><td style="color:'+(d.overdue>0?'var(--danger)':'')+'">'+d.overdue+'</td></tr>';
    }).join('') +
    '</table></div>' +
    '<button class="csv-export-btn" onclick="exportCSV(\'mgmt\')">⬇ Export CSV</button>';
}

function renderWorkload(data, el) {
  var items = data.workload || data.users || data;
  if (!Array.isArray(items)) {
    if (typeof items === 'object') items = Object.keys(items).map(function(k){return{name:k,total:items[k],completed:0,overdue:0}});
  }
  items = items || [];
  var max = Math.max.apply(null, items.map(function(u){return u.total||u.count||0}))||1;
  var html = '<div class="chart-container"><h4>Tasks per User</h4><div class="bar-chart">' +
    items.map(function(u) {
      var v = u.total||u.count||0;
      var pct = (v/max)*100;
      var c = v > 10 ? '#e17055' : v > 5 ? '#fdcb6e' : '#6c5ce7';
      return '<div class="bar" style="height:'+pct+'%;background:'+c+';" title="'+esc(u.name)+': '+v+'">' +
        '<span class="bar-value">'+v+'</span><span class="bar-label">'+esc((u.name||'').substring(0,8))+'</span></div>';
    }).join('') + '</div></div>' +
    '<div class="chart-container"><h4>Detail</h4><table class="report-table">' +
    '<tr><th>User</th><th>Tasks</th><th>Completed</th><th>Overdue</th><th>Rate</th></tr>' +
    items.map(function(u) {
      var r = u.total > 0 ? Math.round((u.completed/u.total)*100)+'%' : '-';
      return '<tr><td>'+esc(u.name)+'</td><td>'+(u.total||u.count||0)+'</td><td>'+(u.completed||0)+'</td><td>'+(u.overdue||0)+'</td><td>'+r+'</td></tr>';
    }).join('') + '</table></div>';
  el.innerHTML = html + '<button class="csv-export-btn" onclick="exportCSV(\'workload\')">⬇ Export CSV</button>';
}

function renderDeptReport(data, el) {
  var items = data.departments || data.depts || data;
  if (!Array.isArray(items)) items = [];
  var max = Math.max.apply(null, items.map(function(d){return d.total||0}))||1;
  var html = '<div class="chart-container"><h4>Department Performance</h4><div class="bar-chart">' +
    items.map(function(d) {
      var pct = ((d.total||0)/max)*100;
      var r = d.total > 0 ? (d.completed/d.total)*100 : 0;
      var c = r > 80 ? '#00b894' : r > 50 ? '#fdcb6e' : '#e17055';
      return '<div class="bar" style="height:'+pct+'%;background:'+c+';" title="'+esc(d.name)+'">' +
        '<span class="bar-value">'+(d.total||0)+'</span><span class="bar-label">'+esc((d.name||'').substring(0,8))+'</span></div>';
    }).join('') + '</div></div>' +
    '<div class="chart-container"><h4>Detail</h4><table class="report-table">' +
    '<tr><th>Department</th><th>Total</th><th>Completed</th><th>Overdue</th><th>Rate</th></tr>' +
    items.map(function(d) {
      var r = d.total > 0 ? Math.round((d.completed/d.total)*100)+'%' : '-';
      return '<tr><td>'+esc(d.name)+'</td><td>'+(d.total||0)+'</td><td>'+(d.completed||0)+'</td><td>'+(d.overdue||0)+'</td><td>'+r+'</td></tr>';
    }).join('') + '</table></div>';
  el.innerHTML = html + '<button class="csv-export-btn" onclick="exportCSV(\'dept\')">⬇ Export CSV</button>';
}

function renderTrend(data, el) {
  var w = data.trend || data.weeks || data;
  if (!Array.isArray(w)) { w = Object.keys(w||{}).map(function(k){return{week:k,created:(w[k]||{}).created||0,completed:(w[k]||{}).completed||0}}).slice(-12); }
  var max = Math.max.apply(null, w.map(function(x){return Math.max(x.created||0,x.completed||0)}))||1;
  var html = '<div class="chart-container"><h4>12-Week Trend</h4>' +
    w.map(function(x) {
      var hc = ((x.created||0)/max)*100, hd = ((x.completed||0)/max)*100;
      return '<div style="display:flex;align-items:flex-end;gap:3px;margin-bottom:6px;height:44px;">' +
        '<div style="width:12px;height:'+hc+'%;background:#6c5ce7;border-radius:3px 3px 0 0;min-height:2px;" title="Created: '+(x.created||0)+'"></div>' +
        '<div style="width:12px;height:'+hd+'%;background:#00b894;border-radius:3px 3px 0 0;min-height:2px;" title="Completed: '+(x.completed||0)+'"></div>' +
        '<span style="font-size:9px;color:var(--text-secondary);margin-left:2px;">'+esc(x.week||'')+'</span></div>';
    }).join('') +
    '<div style="display:flex;gap:16px;font-size:12px;color:var(--text-secondary);margin-top:8px;"><span>🟣 Created</span><span>🟢 Completed</span></div></div>' +
    '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>Week</th><th>Created</th><th>Completed</th><th>%</th></tr>' +
    w.map(function(x) {
      var r = x.created > 0 ? Math.round((x.completed/x.created)*100)+'%' : '-';
      return '<tr><td>'+esc(x.week||'-')+'</td><td>'+(x.created||0)+'</td><td>'+(x.completed||0)+'</td><td>'+r+'</td></tr>';
    }).join('') + '</table></div>';
  el.innerHTML = html + '<button class="csv-export-btn" onclick="exportCSV(\'trend\')">⬇ Export CSV</button>';
}

function renderPriority(data, el) {
  var items = data.distribution || data.priorities || data;
  if (!Array.isArray(items)) items = Object.keys(items||{}).map(function(k){return{label:k,count:items[k]}});
  var total = items.reduce(function(s,i){return s+(i.count||0)},0)||1;
  var colors = {Urgent:'#e17055',High:'#fdcb6e',Medium:'#6c5ce7',Low:'#00b894'};
  var conic = items.map(function(i,idx){
    var pct = (i.count/total)*360;
    var c = colors[i.label]||['#6c5ce7','#00b894','#fdcb6e','#e17055','#a29bfe','#00cec9'][idx%6];
    var start = items.slice(0,idx).reduce(function(s,j){return s+(j.count/total)*360},0);
    var end = items.slice(0,idx+1).reduce(function(s,j){return s+(j.count/total)*360},0);
    return c+' '+start+'deg '+end+'deg';
  }).join(', ');
  var html = '<div class="chart-container"><h4>Priority Distribution</h4><div class="pie-chart">' +
    '<div class="pie-canvas" style="background:conic-gradient('+conic+');"></div>' +
    '<div class="pie-legend">' +
    items.map(function(i){
      var c = colors[i.label]||'#6c5ce7';
      var p = Math.round((i.count/total)*100);
      return '<div class="legend-item"><span class="legend-dot" style="background:'+c+';"></span> '+esc(i.label)+': '+i.count+' ('+p+'%)</div>';
    }).join('') + '</div></div></div>' +
    '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>Priority</th><th>Count</th><th>%</th></tr>' +
    items.map(function(i){
      var p = Math.round((i.count/total)*100);
      return '<tr><td>'+esc(i.label)+'</td><td>'+i.count+'</td><td>'+p+'%</td></tr>';
    }).join('') + '</table></div>';
  el.innerHTML = html + '<button class="csv-export-btn" onclick="exportCSV(\'priority\')">⬇ Export CSV</button>';
}

function renderAging(data, el) {
  var b = data.aging || data.buckets || data;
  if (!Array.isArray(b)) b = Object.keys(b||{}).map(function(k){return{label:k,count:b[k]}});
  if (!b.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">⏰</div><h3>No overdue tasks</h3></div>'; return; }
  var max = Math.max.apply(null, b.map(function(x){return x.count}))||1;
  var cs = ['#00b894','#fdcb6e','#e17055','#d63031'];
  var html = '<div class="chart-container"><h4>Overdue Aging</h4><div class="bar-chart">' +
    b.map(function(x,i){
      var pct = (x.count/max)*100;
      return '<div class="bar" style="height:'+pct+'%;background:'+(cs[i]||'#e17055')+';" title="'+esc(x.label)+': '+x.count+'">' +
        '<span class="bar-value">'+x.count+'</span><span class="bar-label">'+esc((x.label||'').substring(0,10))+'</span></div>';
    }).join('') + '</div></div>' +
    '<div class="chart-container"><h4>Detail</h4><table class="report-table"><tr><th>Bucket</th><th>Count</th></tr>' +
    b.map(function(x){return'<tr><td>'+esc(x.label)+'</td><td>'+(x.count||0)+'</td></tr>'}).join('') + '</table></div>';
  el.innerHTML = html + '<button class="csv-export-btn" onclick="exportCSV(\'aging\')">⬇ Export CSV</button>';
}

// ── CSV Export ──
function exportCSV(type) {
  var tables = document.getElementById('report-container').querySelectorAll('.report-table');
  if (!tables.length) return popup('error','No Data','Nothing to export');
  var csv = [];
  tables.forEach(function(t) {
    t.querySelectorAll('tr').forEach(function(r) {
      csv.push(Array.from(r.querySelectorAll('th,td')).map(function(c){return'"'+(c.textContent||'').replace(/"/g,'""')+'"'}).join(','));
    });
  });
  var b = new Blob([csv.join('\n')],{type:'text/csv;charset=utf-8;'});
  var a = document.createElement('a'); a.href = URL.createObjectURL(b);
  a.download = type+'-report.csv'; a.click();
  URL.revokeObjectURL(a.href);
  popup('success','Exported',type+' report downloaded');
}

// ── Version & Cache ──
function initSettings() {
  document.getElementById('settings-version').textContent = 'v' + APP_VERSION;
  document.getElementById('settings-commit').textContent = '72d76c1';
}

function refreshVersion() {
  document.getElementById('settings-refreshed').textContent = new Date().toLocaleTimeString();
  popup('info','Refreshed','Checking for update...');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(function(r) { if (r) { r.update(); setTimeout(function(){location.reload()},1000); } });
  }
}

function clearAllCache() {
  STATE.cached = {};
  localStorage.clear();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      regs.forEach(function(r) { r.unregister(); });
    });
    caches.keys().then(function(keys) {
      keys.forEach(function(k) { caches.delete(k); });
    });
  }
  popup('info','Cleared','Cache cleared, reloading...');
  setTimeout(function(){location.reload()},800);
}

// ── Cache ──
function getCache(key) {
  if (STATE.cached[key]) return STATE.cached[key];
  try {
    var s = localStorage.getItem('tf_cache_'+key);
    if (s) { var p = JSON.parse(s); if (Date.now()-p.ts<120000) { STATE.cached[key]=p.data; return p.data; } }
  } catch(e){}
  return null;
}

function setCache(key, data) {
  STATE.cached[key] = data;
  try { localStorage.setItem('tf_cache_'+key, JSON.stringify({data:data,ts:Date.now()})); } catch(e){}
}

// ── Helpers ──
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function fmtDate(d) { if(!d)return''; var dt=new Date(d); if(isNaN(dt.getTime()))return String(d); return ('0'+dt.getDate()).slice(-2)+'/'+('0'+(dt.getMonth()+1)).slice(-2)+'/'+dt.getFullYear(); }

function popup(type, title, subtitle) {
  var icons = {success:'✅',error:'❌',info:'ℹ️'};
  var box = document.createElement('div');
  box.className='popup-box '+type;
  box.innerHTML='<span class="popup-icon">'+(icons[type]||'ℹ️')+'</span><span>'+(title?'<strong>'+esc(title)+'</strong> ':'')+esc(subtitle||'')+'</span>';
  document.getElementById('popup-overlay').appendChild(box);
  setTimeout(function(){
    box.style.opacity='0'; box.style.transform='translateY(-10px)'; box.style.transition='.3s ease';
    setTimeout(function(){if(box.parentNode)box.parentNode.removeChild(box)},300);
  },2500);
}

function showError(msg) {
  var el = document.getElementById('login-error');
  el.textContent = msg; el.style.display = 'block';
}

// ── Init Events ──
document.addEventListener('DOMContentLoaded', function() {
  ['filter-status','filter-priority','filter-assignee','filter-date-from','filter-date-to'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', renderTasks);
  });
  document.getElementById('filter-search').addEventListener('input', renderTasks);
  document.querySelectorAll('.report-btn').forEach(function(b) {
    b.addEventListener('click', function() { renderReport(this.dataset.report); });
  });
  autoLogin();
});
