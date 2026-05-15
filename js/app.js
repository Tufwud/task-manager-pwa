(function(){
  'use strict';

  var API = { base: '', token: '', email: '' };

  function loadConfig() {
    API.base = localStorage.getItem('tms_api_base') || '';
    API.token = localStorage.getItem('tms_api_token') || '';
    API.email = localStorage.getItem('tms_api_email') || '';
  }
  function saveConfig(base, token, email) {
    API.base = base.replace(/\/+$/, '');
    API.token = token;
    API.email = email;
    localStorage.setItem('tms_api_base', API.base);
    localStorage.setItem('tms_api_token', API.token);
    localStorage.setItem('tms_api_email', API.email);
  }
  function clearConfig() {
    ['tms_api_base','tms_api_token','tms_api_email'].forEach(function(k) { localStorage.removeItem(k); });
    API.base = ''; API.token = ''; API.email = '';
  }
  function isLoggedIn() { return !!(API.base && API.token && API.email); }

  var state = {
    view: 'dashboard',
    user: null,
    departments: [],
    isFullAccess: false,
    employees: [],
    currentDept: '',
    tasks: [],
    taskTotal: 0,
    taskDetail: null,
    dashboard: null,
    reports: null
  };

  var app = document.getElementById('app');
  var loadingEl = document.getElementById('loading');

  function showLoading(show) {
    loadingEl.classList.toggle('hidden', !show);
  }

  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 3000);
  }

  function apiGet(params) {
    params.token = API.token;
    params.email = API.email;
    var qs = Object.keys(params).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API.base + '?' + qs).then(function(r) { return r.json(); });
  }

  function apiPost(body) {
    body.token = API.token;
    body.email = API.email;
    return fetch(API.base, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    }).then(function(r) { return r.text().then(function(t) { try { return JSON.parse(t); } catch(e) { return { error: 'Invalid response', raw: t }; } }); });
  }

  function getStatusClass(s) {
    return ({ 'Open':'open','In Progress':'in-progress','Completed':'completed','On Hold':'on-hold','Cancelled':'cancelled','Rescheduled':'rescheduled','Transferred':'transferred' })[s] || 'default';
  }
  function getPriorityClass(p) { return (p||'').toLowerCase(); }
  function esc(str) { var d = document.createElement('div'); d.appendChild(document.createTextNode(str||'')); return d.innerHTML; }

  function render() {
    if (!isLoggedIn()) { renderLogin(); return; }
    switch (state.view) {
      case 'login': renderLogin(); break;
      case 'dashboard': renderDashboard(); break;
      case 'tasks': renderTasks(); break;
      case 'taskDetail': renderTaskDetail(); break;
      case 'taskCreate': renderTaskCreate(); break;
      case 'reports': renderReports(); break;
      case 'profile': renderProfile(); break;
      default: renderDashboard();
    }
  }

  // ===== LOGIN =====
  function renderLogin() {
    app.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'login-wrap';
    wrap.innerHTML =
      '<div class="logo">T</div>' +
      '<h2>Task Management</h2>' +
      '<p>Sign in with your work email &amp; API token</p>' +
      '<div class="login-form">' +
        '<div class="form-group"><label>Web App URL</label><input type="url" id="api-url" placeholder="https://script.google.com/macros/s/..." value="' + esc(API.base) + '"></div>' +
        '<div class="form-group"><label>Work Email</label><input type="email" id="api-email" placeholder="you@tufwud.in" value="' + esc(API.email) + '"></div>' +
        '<div class="form-group"><label>API Token</label><input type="password" id="api-token" placeholder="Get from Sheets → Task Manager → Show PWA API Token" value="' + esc(API.token) + '"></div>' +
        '<button class="btn btn-primary btn-full" id="login-btn">Sign In</button>' +
        '<div class="help">API Token: Open your Task Management sheet,<br>go to <b>Task Manager &gt; Show PWA API Token</b></div>' +
      '</div>';
    app.appendChild(wrap);
    document.getElementById('login-btn').addEventListener('click', doLogin);
    document.getElementById('api-token').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
    document.getElementById('api-email').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });
  }

  function doLogin() {
    var base = document.getElementById('api-url').value.trim();
    var email = document.getElementById('api-email').value.trim();
    var token = document.getElementById('api-token').value.trim();
    if (!base || !token || !email) { toast('All fields required', 'error'); return; }
    showLoading(true);
    saveConfig(base, token, email);
    apiGet({ action: 'ping' }).then(function(r) {
      if (r && r.success) {
        return apiGet({ action: 'me' });
      }
      showLoading(false);
      toast('Connection failed: ' + (r && r.error || 'Invalid response'), 'error');
      clearConfig();
    }).then(function(me) {
      if (!me) return;
      showLoading(false);
      if (me && me.success) {
        state.user = me.data;
        toast('Welcome, ' + state.user.name, 'success');
        loadInitialData();
      } else {
        toast('User not found: ' + (me && me.error || 'Check your email'), 'error');
        clearConfig();
      }
    }).catch(function(e) {
      showLoading(false);
      toast('Network error: ' + e.message, 'error');
      clearConfig();
    });
  }

  // ===== INITIAL DATA LOAD =====
  function loadInitialData() {
    showLoading(true);
    Promise.all([
      apiGet({ action: 'departments' }),
      apiGet({ action: 'employees' }),
      apiGet({ action: 'dashboard' })
    ]).then(function(results) {
      showLoading(false);
      var deptRes = results[0], empRes = results[1], dashRes = results[2];
      if (deptRes && deptRes.success) { state.departments = deptRes.data; state.isFullAccess = deptRes.isFullAccess; }
      if (empRes && empRes.success) state.employees = empRes.data;
      if (dashRes && dashRes.success) state.dashboard = dashRes.data;
      state.currentDept = state.departments[0] || '';
      state.view = 'dashboard';
      render();
    }).catch(function(e) {
      showLoading(false);
      toast('Failed to load data: ' + e.message, 'error');
    });
  }

  // ===== HEADER =====
  function renderHeader(title, showBack) {
    var header = document.createElement('div');
    header.className = 'header';
    header.innerHTML =
      '<button class="back-btn' + (showBack ? ' show' : '') + '" id="back-btn">&larr;</button>' +
      '<h1>' + esc(title) + '</h1>' +
      '<div style="font-size:11px;opacity:0.8;white-space:nowrap;">' + (state.user ? esc(state.user.name.split(' ')[0]) : '') + '</div>';
    return header;
  }

  // ===== TABS =====
  function renderTabs(active) {
    var tabs = document.createElement('div');
    tabs.className = 'tabs';
    var items = [
      { id: 'dashboard', icon: '\u2302', label: 'Dashboard' },
      { id: 'tasks', icon: '\u2630', label: 'Tasks' },
      { id: 'reports', icon: '\u2261', label: 'Reports' },
      { id: 'profile', icon: '\u263C', label: 'Profile' }
    ];
    tabs.innerHTML = items.map(function(t) {
      return '<button class="tab' + (t.id === active ? ' active' : '') + '" data-view="' + t.id + '">' +
        '<span class="tab-icon">' + t.icon + '</span><span>' + t.label + '</span></button>';
    }).join('');
    tabs.addEventListener('click', function(e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      var view = btn.getAttribute('data-view');
      state.view = view;
      if (view === 'tasks') loadTasks();
      else if (view === 'reports') loadReports();
      else if (view === 'dashboard') loadDashboard();
      else if (view === 'profile') render();
    });
    return tabs;
  }

  function renderMain(html) {
    var main = document.createElement('div');
    main.className = 'main';
    main.innerHTML = html;
    return main;
  }

  // ===== PROFILE =====
  function renderProfile() {
    app.innerHTML = '';
    app.appendChild(renderHeader('Profile', false));
    var u = state.user;
    var html = '<div class="card">' +
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<div style="width:64px;height:64px;border-radius:50%;background:var(--primary);color:white;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:600;margin-bottom:8px;">' + esc(u.name.charAt(0).toUpperCase()) + '</div>' +
        '<h2 style="font-size:18px;">' + esc(u.name) + '</h2>' +
        '<div class="text-muted">' + esc(u.email) + '</div>' +
      '</div>' +
      '<div class="card-row"><span class="label">Department</span><span class="value">' + esc(u.dept) + '</span></div>' +
      '<div class="card-row"><span class="label">Role</span><span class="value">' + esc(u.role === 'admin' ? 'Administrator' : u.role === 'dept' ? 'Department User' : u.role) + '</span></div>' +
      '<div class="card-row"><span class="label">Access Level</span><span class="value">' + (state.isFullAccess ? 'All Departments' : esc(u.sheet) + ' only') + '</span></div>' +
      (u.mobile ? '<div class="card-row"><span class="label">Mobile</span><span class="value">' + esc(u.mobile) + '</span></div>' : '') +
    '</div>' +
    '<div class="card">' +
      '<div class="card-header"><h3>Settings</h3></div>' +
      '<div style="text-align:center;padding:8px 0;">' +
        '<p class="text-muted mb-8" style="font-size:11px;">API: ' + esc(API.base.replace(/^https:\/\//,'').substring(0,40)) + '...</p>' +
        '<button class="btn btn-danger btn-full" id="logout-btn">Sign Out</button>' +
      '</div>' +
    '</div>';
    var main = renderMain(html);
    app.appendChild(main);
    app.appendChild(renderTabs('profile'));
    document.getElementById('logout-btn').addEventListener('click', function() {
      clearConfig(); state.user = null; state.view = 'login'; render();
    });
  }

  // ===== DASHBOARD =====
  function loadDashboard() {
    showLoading(true);
    apiGet({ action: 'dashboard' }).then(function(r) {
      showLoading(false);
      if (r && r.success) { state.dashboard = r.data; state.view = 'dashboard'; render(); }
    }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
  }

  function renderDashboard() {
    var d = state.dashboard, t = d ? d.totals : null;
    app.innerHTML = '';
    app.appendChild(renderHeader('Dashboard', false));

    var html = '';
    if (t) {
      html += '<div class="stats-grid">' +
        '<div class="stat-card blue"><div class="num">' + t.total + '</div><div class="lbl">Total</div></div>' +
        '<div class="stat-card orange"><div class="num">' + t.overdue + '</div><div class="lbl">Overdue</div></div>' +
        '<div class="stat-card green"><div class="num">' + t.completed + '</div><div class="lbl">Completed</div></div>' +
        '<div class="stat-card"><div class="num" style="color:#757575">' + (t.inProgress + t.open) + '</div><div class="lbl">Active</div></div>' +
      '</div>';

      if (d.departments) {
        var deptNames = Object.keys(d.departments).sort();
        var maxTotal = 0;
        deptNames.forEach(function(n) { if (d.departments[n].total > maxTotal) maxTotal = d.departments[n].total; });

        // Task count bars
        html += '<div class="card"><div class="card-header"><h3>Task Count</h3></div>';
        deptNames.forEach(function(n) {
          var ds = d.departments[n];
          if (ds.total === 0) return;
          var pct = maxTotal > 0 ? Math.round(ds.total / maxTotal * 100) : 0;
          html += '<div class="dept-bar"><span class="name">' + esc(n) + '</span><div class="bar-wrap"><div class="bar-fill blue" style="width:' + pct + '%"></div></div><span class="pct">' + ds.total + '</span></div>';
        });
        html += '</div>';

        // Overdue (only if has overdue or is full access)
        var hasOverdue = deptNames.some(function(n) { return d.departments[n].overdue > 0; });
        if (hasOverdue) {
          html += '<div class="card"><div class="card-header"><h3>Overdue</h3></div>';
          deptNames.forEach(function(n) {
            var ds = d.departments[n];
            if (ds.overdue === 0) return;
            var pct = ds.total > 0 ? Math.round(ds.overdue / ds.total * 100) : 0;
            html += '<div class="dept-bar"><span class="name">' + esc(n) + '</span><div class="bar-wrap"><div class="bar-fill red" style="width:' + pct + '%"></div></div><span class="pct">' + ds.overdue + '/' + ds.total + '</span></div>';
          });
          html += '</div>';
        }

        // Completion rate
        html += '<div class="card"><div class="card-header"><h3>Completion Rate</h3></div>';
        deptNames.forEach(function(n) {
          var ds = d.departments[n];
          if (ds.total === 0) return;
          var pct = Math.round(ds.completed / ds.total * 100);
          html += '<div class="dept-bar"><span class="name">' + esc(n) + '</span><div class="bar-wrap"><div class="bar-fill green" style="width:' + pct + '%"></div></div><span class="pct">' + pct + '%</span></div>';
        });
        html += '</div>';
      }
    } else {
      html += '<div class="empty-state"><div class="empty-icon">\u2302</div><p>No dashboard data</p></div>';
    }

    var main = renderMain(html);
    app.appendChild(main);
    app.appendChild(renderTabs('dashboard'));

    var touchStartY = 0;
    main.addEventListener('touchstart', function(e) { touchStartY = e.touches[0].screenY; });
    main.addEventListener('touchend', function(e) {
      if (e.changedTouches[0].screenY - touchStartY > 100 && main.scrollTop <= 0) loadDashboard();
    });
  }

  // ===== TASKS =====
  function loadTasks(dept, status, search) {
    dept = dept || state.currentDept;
    if (!dept && state.departments.length > 0) dept = state.departments[0];
    state.currentDept = dept;
    showLoading(true);
    apiGet({ action: 'tasks', dept: dept, status: status || '', search: search || '', limit: 200 }).then(function(r) {
      showLoading(false);
      if (r && r.success) { state.tasks = r.data; state.taskTotal = r.total; state.view = 'tasks'; render(); }
      else { toast('Failed: ' + (r && r.error || 'Unknown'), 'error'); }
    }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
  }

  function renderTasks() {
    app.innerHTML = '';
    app.appendChild(renderHeader('Tasks', false));

    var html = '<div class="card" style="padding:12px">';
    if (state.isFullAccess) {
      html += '<select class="dept-select" id="dept-select">';
      state.departments.forEach(function(d) { html += '<option value="' + esc(d) + '"' + (d === state.currentDept ? ' selected' : '') + '>' + esc(d) + '</option>'; });
      html += '</select>';
    } else {
      html += '<div style="padding:8px 0;font-weight:600;color:var(--primary);">' + esc(state.currentDept) + '</div>';
    }
    html += '<div class="task-search">' +
      '<input type="search" id="task-search" placeholder="Search..." value="">' +
      '<select id="status-filter"><option value="">All</option><option value="Open">Open</option><option value="In Progress">In Progress</option><option value="Completed">Completed</option><option value="On Hold">On Hold</option></select>' +
    '</div></div>';

    if (state.tasks.length === 0) {
      html += '<div class="empty-state"><div class="empty-icon">\u2714</div><p>No tasks found</p></div>';
    } else {
      html += '<div style="margin-bottom:8px;font-size:12px;color:var(--gray);">' + state.taskTotal + ' task' + (state.taskTotal !== 1 ? 's' : '') + '</div>';
      state.tasks.forEach(function(task) {
        var sClass = getStatusClass(task.status);
        var isOverdue = task.dueLapse === 'OVERDUE';
        var borderClass = isOverdue ? 'border-overdue' : 'border-' + sClass;
        html += '<div class="task-item ' + borderClass + '" data-row="' + task.row + '" data-dept="' + esc(task.dept || state.currentDept) + '">' +
          '<div class="ti-top"><span class="ti-name">' + esc(task.taskName) + '</span><span class="status-badge ' + sClass + '">' + esc(task.status) + '</span></div>' +
          '<div class="ti-id">' + esc(task.taskId) + '</div>' +
          '<div class="ti-meta">' +
            '<span>' + esc(task.assignee || '-') + '</span>' +
            (task.priority ? '<span class="priority-badge ' + getPriorityClass(task.priority) + '">' + esc(task.priority) + '</span>' : '') +
            (task.dueDate ? '<span>\uD83D\uDCC5 ' + esc(task.dueDate) + '</span>' : '') +
            (isOverdue ? '<span class="status-badge overdue">OVERDUE</span>' : '') +
          '</div></div>';
      });
    }

    var main = renderMain(html);
    app.appendChild(main);

    var fab = document.createElement('button');
    fab.className = 'fab'; fab.textContent = '+';
    fab.addEventListener('click', function() { state.view = 'taskCreate'; render(); });
    app.appendChild(fab);

    app.appendChild(renderTabs('tasks'));

    // Events
    var deptSelect = document.getElementById('dept-select');
    if (deptSelect) {
      deptSelect.addEventListener('change', function() {
        state.currentDept = this.value;
        loadTasks(state.currentDept, document.getElementById('status-filter').value, document.getElementById('task-search').value.trim());
      });
    }

    document.getElementById('status-filter').addEventListener('change', function() {
      loadTasks(state.currentDept, this.value, document.getElementById('task-search').value.trim());
    });

    var searchTimer;
    document.getElementById('task-search').addEventListener('input', function() {
      clearTimeout(searchTimer);
      var el = this;
      searchTimer = setTimeout(function() { loadTasks(state.currentDept, document.getElementById('status-filter').value, el.value.trim()); }, 400);
    });

    main.addEventListener('click', function(e) {
      var item = e.target.closest('.task-item');
      if (!item) return;
      openTaskDetail(item.getAttribute('data-dept'), parseInt(item.getAttribute('data-row'), 10));
    });
  }

  // ===== TASK DETAIL =====
  function openTaskDetail(dept, row) {
    showLoading(true);
    apiGet({ action: 'task', dept: dept, row: row }).then(function(r) {
      showLoading(false);
      if (r && r.success) { state.taskDetail = r.data; state.view = 'taskDetail'; render(); }
      else { toast('Failed: ' + (r && r.error || 'Unknown'), 'error'); }
    }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
  }

  function renderTaskDetail() {
    var task = state.taskDetail;
    if (!task) { state.view = 'tasks'; render(); return; }

    app.innerHTML = '';
    app.appendChild(renderHeader('Task Details', true));

    var sClass = getStatusClass(task.status);
    var isOverdue = task.dueLapse === 'OVERDUE';

    var html = '<div class="card">' +
      '<div class="flex-between mb-8"><span class="ti-id">' + esc(task.taskId) + '</span><span class="status-badge ' + sClass + '">' + esc(task.status) + '</span></div>' +
      '<h2 style="font-size:18px;margin-bottom:8px;">' + esc(task.taskName) + '</h2>' +
      (task.priority ? '<span class="priority-badge ' + getPriorityClass(task.priority) + '">' + esc(task.priority) + '</span> ' : '') +
      (isOverdue ? '<span class="status-badge overdue">OVERDUE</span>' : '') +
    '</div>';

    html += '<div class="card">';
    html += '<div class="detail-field"><div class="df-label">Assignee</div><div class="df-value">' + esc(task.assignee || '-') + '</div></div>';
    html += '<div class="detail-field"><div class="df-label">Department</div><div class="df-value">' + esc(task.dept) + (task.assigneeDept && task.assigneeDept !== task.dept ? ' \u2192 ' + esc(task.assigneeDept) : '') + '</div></div>';
    html += '<div class="detail-field"><div class="df-label">Assignor</div><div class="df-value">' + esc(task.assignor || '-') + '</div></div>';
    html += '<div class="detail-field"><div class="df-label">Created / Due</div><div class="df-value">' + esc(task.createdDate || '-') + ' \u2192 ' + esc(task.dueDate || '-') + '</div></div>';
    if (task.completedDate) html += '<div class="detail-field"><div class="df-label">Completed</div><div class="df-value">' + esc(task.completedDate) + '</div></div>';
    html += '<div class="detail-field"><div class="df-label">Recurring</div><div class="df-value">' + esc(task.recurring) + (task.recurringType ? ' (' + esc(task.recurringType) + ')' : '') + '</div></div>';
    if (task.interDept) html += '<div class="detail-field"><div class="df-label">Inter-Dept</div><div class="df-value">' + esc(task.interDept) + '</div></div>';
    if (task.description) html += '<div class="detail-field"><div class="df-label">Description</div><div class="df-value long">' + esc(task.description) + '</div></div>';
    if (task.remarks) html += '<div class="detail-field"><div class="df-label">Remarks</div><div class="df-value long">' + esc(task.remarks) + '</div></div>';
    if (task.rescheduleReason) html += '<div class="detail-field"><div class="df-label">Reschedule</div><div class="df-value long">' + esc(task.rescheduleReason) + '</div></div>';
    html += '</div>';

    // Status update buttons (only if user can edit)
    if (task.canEdit) {
      html += '<div class="card"><div class="card-header"><h3>Update Status</h3></div><div class="btn-group">';
      ['Open','In Progress','Completed','On Hold','Cancelled'].forEach(function(s) {
        if (s !== task.status) html += '<button class="btn btn-sm btn-outline status-update-btn" data-status="' + esc(s) + '">' + esc(s) + '</button>';
      });
      html += '</div></div>';
    }

    var main = renderMain(html);
    app.appendChild(main);

    // Back button
    document.getElementById('back-btn').addEventListener('click', function() { state.view = 'tasks'; render(); });

    main.addEventListener('click', function(e) {
      var btn = e.target.closest('.status-update-btn');
      if (!btn) return;
      var newStatus = btn.getAttribute('data-status');
      var updates = { status: newStatus };
      if (newStatus === 'Completed') {
        var now = new Date();
        updates.completedDate = ('0'+now.getDate()).slice(-2) + '/' + ('0'+(now.getMonth()+1)).slice(-2) + '/' + now.getFullYear();
      }
      showLoading(true);
      apiPost({ action: 'updateTask', dept: task.dept, row: task.row, updates: updates }).then(function(r) {
        showLoading(false);
        if (r && r.success) { toast('Updated to ' + newStatus, 'success'); openTaskDetail(task.dept, task.row); }
        else { toast('Update failed: ' + (r && r.error || 'Unknown'), 'error'); }
      }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
    });
  }

  // ===== TASK CREATE =====
  function renderTaskCreate() {
    app.innerHTML = '';
    app.appendChild(renderHeader('New Task', true));

    var html = '<div class="card">';
    if (state.isFullAccess) {
      html += '<div class="form-group"><label>Department *</label><select id="create-dept">';
      state.departments.forEach(function(d) { html += '<option value="' + esc(d) + '"' + (d === state.currentDept ? ' selected' : '') + '>' + esc(d) + '</option>'; });
      html += '</select></div>';
    }
    html += '<div class="form-group"><label>Task Name *</label><input type="text" id="create-name" placeholder="Enter task name"></div>';
    html += '<div class="form-row">' +
      '<div class="form-group"><label>Assignee *</label><select id="create-assignee"><option value="">Select...</option>' +
      state.employees.map(function(e) { return '<option value="' + esc(e.name) + '">' + esc(e.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="form-group"><label>Priority</label><select id="create-priority"><option value="Low">Low</option><option value="Medium" selected>Medium</option><option value="High">High</option><option value="Urgent">Urgent</option></select></div>' +
    '</div>';
    html += '<div class="form-group"><label>Due Date</label><input type="date" id="create-duedate"></div>';
    html += '<div class="form-row">' +
      '<div class="form-group"><label>Recurring</label><select id="create-recurring"><option value="No">No</option><option value="Yes">Yes</option></select></div>' +
      '<div class="form-group" id="recurtype-group" style="display:none;"><label>Type</label><select id="create-recurtype"><option value="">N/A</option><option value="Daily">Daily</option><option value="Weekly">Weekly</option><option value="Monthly">Monthly</option><option value="Quarterly">Quarterly</option></select></div>' +
    '</div>';
    html += '<div class="form-group"><label>Description</label><textarea id="create-desc" rows="3" placeholder="Optional"></textarea></div>';
    html += '<button class="btn btn-primary btn-full" id="create-submit">Create Task</button>';
    html += '</div>';

    var main = renderMain(html);
    app.appendChild(main);

    document.getElementById('back-btn').addEventListener('click', function() { state.view = 'tasks'; render(); });

    document.getElementById('create-recurring').addEventListener('change', function() {
      document.getElementById('recurtype-group').style.display = this.value === 'Yes' ? 'block' : 'none';
    });

    document.getElementById('create-submit').addEventListener('click', function() {
      var dept = state.isFullAccess ? document.getElementById('create-dept').value : state.currentDept;
      var taskName = document.getElementById('create-name').value.trim();
      var assignee = document.getElementById('create-assignee').value;
      var priority = document.getElementById('create-priority').value;
      var dueDate = document.getElementById('create-duedate').value;
      var recurring = document.getElementById('create-recurring').value;
      var recurType = document.getElementById('create-recurtype').value;
      var desc = document.getElementById('create-desc').value.trim();

      if (!taskName) { toast('Task Name required', 'error'); return; }
      if (!assignee) { toast('Assignee required', 'error'); return; }

      var dueDateStr = dueDate ? dueDate.split('-').reverse().join('/') : '';
      showLoading(true);
      apiPost({
        action: 'createTask', dept: dept, taskName: taskName, assignee: assignee,
        assignor: state.user ? state.user.name : 'Mobile App', priority: priority,
        description: desc, dueDate: dueDateStr, recurring: recurring, recurringType: recurType
      }).then(function(r) {
        showLoading(false);
        if (r && r.success) { toast('Created: ' + r.data.taskId, 'success'); state.currentDept = dept; loadTasks(dept); }
        else { toast('Failed: ' + (r && r.error || 'Unknown'), 'error'); }
      }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
    });
  }

  // ===== REPORTS =====
  function loadReports() {
    showLoading(true);
    apiGet({ action: 'reports', reportType: 'all' }).then(function(r) {
      showLoading(false);
      if (r && r.success) { state.reports = r.data; state.view = 'reports'; render(); }
    }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
  }

  function renderReports() {
    app.innerHTML = '';
    app.appendChild(renderHeader('Reports', false));

    var html = '';
    if (state.reports) {
      var deptNames = Object.keys(state.reports).sort();
      var grandTotal = 0, grandCompleted = 0, grandOverdue = 0;
      deptNames.forEach(function(n) { grandTotal += state.reports[n].total; grandCompleted += state.reports[n].completed; grandOverdue += state.reports[n].overdue; });

      html += '<div class="stats-grid">' +
        '<div class="stat-card blue"><div class="num">' + grandTotal + '</div><div class="lbl">Total</div></div>' +
        '<div class="stat-card green"><div class="num">' + grandCompleted + '</div><div class="lbl">Completed</div></div>' +
        '<div class="stat-card red"><div class="num">' + grandOverdue + '</div><div class="lbl">Overdue</div></div>' +
        '<div class="stat-card orange"><div class="num">' + (grandTotal > 0 ? Math.round(grandCompleted/grandTotal*100) : 0) + '%</div><div class="lbl">Completion</div></div>' +
      '</div>';

      deptNames.forEach(function(n) {
        var ds = state.reports[n];
        if (ds.total === 0) return;
        var compPct = Math.round(ds.completed / ds.total * 100);
        html += '<div class="card report-card">' +
          '<div class="flex-between"><h4>' + esc(n) + '</h4><span class="text-muted">' + ds.total + ' tasks</span></div>' +
          '<div class="report-stat"><span class="rs-label">Completed</span><span class="rs-value green">' + ds.completed + ' (' + compPct + '%)</span></div>' +
          '<div class="report-stat"><span class="rs-label">Overdue</span><span class="rs-value red">' + ds.overdue + '</span></div>' +
          '<div class="report-stat"><span class="rs-label">In Progress</span><span class="rs-value">' + (ds.inProgress || 0) + '</span></div>' +
          '<div class="dept-bar mt-8"><span class="name" style="width:auto;text-align:left;">Progress</span><div class="bar-wrap"><div class="bar-fill green" style="width:' + compPct + '%"></div></div><span class="pct">' + compPct + '%</span></div>' +
        '</div>';
      });
    } else {
      html += '<div class="empty-state"><p>No report data</p></div>';
    }

    app.appendChild(renderMain(html));
    app.appendChild(renderTabs('reports'));
  }

  // ===== INIT =====
  function init() {
    loadConfig();
    if (isLoggedIn()) {
      // Verify session is still valid
      apiGet({ action: 'ping' }).then(function(r) {
        if (r && r.success) {
          return apiGet({ action: 'me' });
        }
        clearConfig(); render(); return null;
      }).then(function(me) {
        if (me && me.success) { state.user = me.data; loadInitialData(); }
        else { clearConfig(); render(); }
      }).catch(function() { clearConfig(); render(); });
    } else {
      render();
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function() {});
    }
  }

  init();
})();
