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
  var refreshEl = null;

  // Simple cache with TTL
  var cache = {};
  function cacheGet(key) { var c = cache[key]; if (c && Date.now() < c.expiry) return c.data; return null; }
  function cacheSet(key, data, ttlSec) { cache[key] = { data: data, expiry: Date.now() + (ttlSec || 300) * 1000 }; }

  // Notification state
  var notifState = { unread: 0, list: [], pollTimer: null };

  function startNotifPoll() {
    if (notifState.pollTimer) clearInterval(notifState.pollTimer);
    notifState.pollTimer = setInterval(pollNotifications, 60000);
    pollNotifications();
  }

  function pollNotifications() {
    if (!isLoggedIn()) return;
    apiGet({ action: 'notifications' }).then(function(r) {
      if (r && r.success) {
        var prev = notifState.unread;
        notifState.list = r.data;
        notifState.unread = r.unread;
        if (notifState.unread > prev && prev > 0) {
          toast('You have ' + notifState.unread + ' new notification' + (notifState.unread > 1 ? 's' : ''), '');
        }
      }
    }).catch(function() {});
  }

  function stopNotifPoll() {
    if (notifState.pollTimer) { clearInterval(notifState.pollTimer); notifState.pollTimer = null; }
  }

  function showLoading(show) {
    loadingEl.classList.toggle('hidden', !show);
  }

  function showRefresh(show) {
    if (refreshEl) { refreshEl.remove(); refreshEl = null; }
    if (!show) return;
    refreshEl = document.createElement('div');
    refreshEl.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:50;background:var(--primary);color:white;text-align:center;padding:4px;font-size:12px;animation:fadeIn 0.2s;';
    refreshEl.textContent = 'Refreshing...';
    document.body.appendChild(refreshEl);
    setTimeout(function() { if (refreshEl) { refreshEl.remove(); refreshEl = null; } }, 5000);
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
    showLoading(false);
    app.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'login-wrap';
    wrap.innerHTML =
      '<div class="logo">T</div>' +
      '<h2>Task Management</h2>' +
      '<p>Sign in with your work email &amp; API token</p>' +
      '<div class="login-form">' +
        '<div class="form-group"><label>Web App URL</label><input type="text" inputmode="url" id="api-url" placeholder="https://script.google.com/macros/s/..." value="' + esc(API.base) + '"></div>' +
        '<div class="form-group"><label>Work Email</label><input type="text" inputmode="email" id="api-email" placeholder="you@tufwud.in" value="' + esc(API.email) + '"></div>' +
        '<div class="form-group"><label>API Token</label><input type="text" id="api-token" placeholder="Get from Sheets → Task Manager → Show PWA API Token" value="' + esc(API.token) + '"></div>' +
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
    saveConfig(base.trim(), token.trim(), email.trim());
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
    var notifHtml = '<button id="notif-bell" style="background:none;border:none;color:white;font-size:20px;cursor:pointer;position:relative;padding:4px 8px;">\uD83D\uDD14' +
      (notifState.unread > 0 ? '<span style="position:absolute;top:-2px;right:2px;background:#e53935;color:white;font-size:10px;padding:1px 5px;border-radius:10px;font-weight:600;">' + (notifState.unread > 99 ? '99+' : notifState.unread) + '</span>' : '') +
    '</button>';
    var searchHtml = state.isFullAccess ? '<button id="search-btn" style="background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:4px 8px;">\uD83D\uDD0D</button>' : '';
    header.innerHTML =
      '<button class="back-btn' + (showBack ? ' show' : '') + '" id="back-btn">&larr;</button>' +
      '<h1>' + esc(title) + '</h1>' +
      searchHtml + notifHtml +
      '<button class="logout-btn" id="logout-btn" style="display:none;">Logout</button>';
    return header;
  }

  // ===== TABS =====
  function renderTabs(active) {
    var tabs = document.createElement('div');
    tabs.className = 'tabs';
    var items = [
      { id: 'dashboard', icon: '\u2302', label: 'Dashboard' },
      { id: 'tasks', icon: '\u2630', label: 'Tasks' },
      { id: 'calendar', icon: '\uD83D\uDCC5', label: 'Calendar' },
      { id: 'reports', icon: '\u2261', label: 'Reports' },
      { id: 'profile', icon: '\u263C', label: 'Profile' }
    ];
    tabs.innerHTML = items.map(function(t) {
      var badge = (t.id === 'profile' && notifState.unread > 0) ? '<span class="badge">' + notifState.unread + '</span>' : '';
      return '<button class="tab' + (t.id === active ? ' active' : '') + '" data-view="' + t.id + '">' +
        '<div class="tab-wrap">' + badge + '<span class="tab-icon">' + t.icon + '</span></div><span>' + t.label + '</span></button>';
    }).join('');
    tabs.addEventListener('click', function(e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      var view = btn.getAttribute('data-view');
      state.view = view;
      if (view === 'tasks') loadTasks();
      else if (view === 'reports') loadReports();
      else if (view === 'dashboard') loadDashboard();
      else if (view === 'calendar') renderCalendar();
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

  // ===== NOTIFICATION PANEL =====
  function renderNotifPanel() {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    var content = document.createElement('div');
    content.className = 'modal-content';
    var html = '<div class="flex-between"><h2>Notifications</h2><button class="modal-close" id="notif-close">\u00D7</button></div>';
    if (notifState.unread > 0) html += '<button class="btn btn-sm btn-primary" id="mark-all-read" style="width:100%;margin-bottom:12px;">Mark All Read</button>';
    if (notifState.list.length === 0) html += '<div class="empty-state"><p>No notifications</p></div>';
    notifState.list.forEach(function(n, i) {
      html += '<div class="card" style="padding:10px;margin-bottom:6px;' + (n.read ? 'opacity:0.6;' : 'border-left:3px solid var(--primary);') + '">' +
        '<div class="flex-between"><span class="status-badge ' + (n.type === 'assignment' ? 'open' : 'overdue') + '" style="font-size:10px;">' + esc(n.type) + '</span>' +
        '<span class="text-muted" style="font-size:11px;">' + esc(n.ts) + '</span></div>' +
        '<div style="font-size:13px;margin:4px 0;">' + esc(n.message) + '</div>' +
        (n.taskId ? '<div style="font-size:11px;color:var(--gray);">' + esc(n.taskId) + ' | ' + esc(n.dept) + '</div>' : '') +
      '</div>';
    });
    content.innerHTML = html;
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    document.getElementById('notif-close').addEventListener('click', function() { overlay.remove(); });
    var markBtn = document.getElementById('mark-all-read');
    if (markBtn) markBtn.addEventListener('click', function() {
      apiPost({ action: 'markAllRead' }).then(function() { notifState.unread = 0; overlay.remove(); pollNotifications(); render(); });
    });
  }

  // ===== CALENDAR VIEW =====
  var calendarState = { month: new Date().getMonth() + 1, year: new Date().getFullYear(), data: null };

  function renderCalendar() {
    showLoading(true);
    apiGet({ action: 'calendar', month: calendarState.month, year: calendarState.year }).then(function(r) {
      showLoading(false);
      if (!r || !r.success) { toast('Calendar error', 'error'); return; }
      calendarState.data = r.data;
      state.view = 'calendar';
      app.innerHTML = '';
      var header = renderHeader('Calendar', false);
      app.appendChild(header);

      var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var html = '<div class="card" style="padding:12px;">' +
        '<div class="flex-between" style="margin-bottom:12px;">' +
          '<button class="btn btn-sm btn-outline" id="cal-prev">&larr; ' + monthNames[(calendarState.month - 2 + 12) % 12] + '</button>' +
          '<strong>' + monthNames[calendarState.month - 1] + ' ' + calendarState.year + '</strong>' +
          '<button class="btn btn-sm btn-outline" id="cal-next">' + monthNames[calendarState.month % 12] + ' &rarr;</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:12px;">' +
          ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d){ return '<div style="font-weight:600;padding:4px 0;color:var(--gray);">' + d + '</div>'; }).join('') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:13px;" id="cal-grid">';

      var firstDay = new Date(calendarState.year, calendarState.month - 1, 1).getDay();
      var daysInMonth = new Date(calendarState.year, calendarState.month, 0).getDate();
      for (var i = 0; i < firstDay; i++) html += '<div></div>';
      for (var d = 1; d <= daysInMonth; d++) {
        var tasks = calendarState.data[d] || [];
        var isToday = d === new Date().getDate() && calendarState.month === (new Date().getMonth() + 1) && calendarState.year === new Date().getFullYear();
        var hasOverdue = tasks.some(function(t){ return t.status !== 'Completed' && new Date() > new Date(t.due.split('/').reverse().join('-')) || t.status === 'OVERDUE'; });
        html += '<div class="cal-day' + (isToday ? ' cal-today' : '') + '" data-day="' + d + '" style="padding:4px 0;border-radius:4px;cursor:pointer;' + (isToday ? 'background:var(--primary);color:white;font-weight:600;' : tasks.length > 0 ? 'background:#f0f4ff;' : '') + '">' +
          '<div>' + d + '</div>' +
          (tasks.length > 0 ? '<div style="display:flex;justify-content:center;gap:2px;margin-top:2px;">' +
            (tasks.some(function(t){ return t.status === 'Completed'; }) ? '<span style="width:5px;height:5px;border-radius:50%;background:var(--success);display:inline-block;"></span>' : '') +
            (hasOverdue ? '<span style="width:5px;height:5px;border-radius:50%;background:var(--danger);display:inline-block;"></span>' : '') +
            (!hasOverdue && tasks.some(function(t){ return t.status !== 'Completed'; }) ? '<span style="width:5px;height:5px;border-radius:50%;background:var(--primary);display:inline-block;"></span>' : '') +
          '</div>' : '') +
        '</div>';
      }
      html += '</div></div>';

      html += '<div id="cal-task-list"></div>';

      var main = renderMain(html);
      app.appendChild(main);
      app.appendChild(renderTabs('calendar'));

      // Day click
      main.addEventListener('click', function(e) {
        var dayEl = e.target.closest('.cal-day');
        if (!dayEl) return;
        var day = dayEl.getAttribute('data-day');
        var tasks = calendarState.data[day] || [];
        if (tasks.length === 0) { document.getElementById('cal-task-list').innerHTML = '<div class="text-muted text-center" style="padding:16px;">No tasks due this day</div>'; return; }
        var html = '';
        tasks.forEach(function(t) {
          html += '<div class="task-item border-' + (t.status === 'Completed' ? 'completed' : '') + '" style="cursor:default;">' +
            '<div class="ti-top"><span class="ti-name">' + esc(t.taskName) + '</span><span class="status-badge ' + (t.status === 'Completed' ? 'completed' : 'overdue') + '">' + esc(t.status) + '</span></div>' +
            '<div class="ti-meta"><span>' + esc(t.dept) + '</span>' + (t.priority ? '<span class="priority-badge">' + esc(t.priority) + '</span>' : '') + '</div>' +
          '</div>';
        });
        document.getElementById('cal-task-list').innerHTML = html;
      });

      document.getElementById('cal-prev').addEventListener('click', function() {
        if (calendarState.month === 1) { calendarState.month = 12; calendarState.year--; }
        else calendarState.month--;
        renderCalendar();
      });
      document.getElementById('cal-next').addEventListener('click', function() {
        if (calendarState.month === 12) { calendarState.month = 1; calendarState.year++; }
        else calendarState.month++;
        renderCalendar();
      });
    }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
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
    var cached = cacheGet('dashboard');
    if (cached) { state.dashboard = cached; state.view = 'dashboard'; render(); showRefresh(true); }
    else showLoading(true);

    apiGet({ action: 'dashboard' }).then(function(r) {
      showLoading(false); showRefresh(false);
      if (r && r.success) { cacheSet('dashboard', r.data, 300); state.dashboard = r.data; if (state.view === 'dashboard') render(); }
    }).catch(function(e) { showLoading(false); showRefresh(false); if (!cached) toast('Error: ' + e.message, 'error'); });
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
  var sortState = { by: '', dir: 'asc' };

  function loadTasks(dept, status, search, sortBy, sortDir) {
    dept = dept || state.currentDept;
    if (!dept && state.departments.length > 0) dept = state.departments[0];
    state.currentDept = dept;
    sortBy = sortBy || sortState.by;
    sortDir = sortDir || sortState.dir;

    var cacheKey = 'tasks_' + dept + '_' + (status || '') + '_' + (search || '') + '_' + sortBy + '_' + sortDir;
    var cached = cacheGet(cacheKey);
    if (cached) { state.tasks = cached.data; state.taskTotal = cached.total; state.view = 'tasks'; render(); showRefresh(true); }
    else showLoading(true);

    var params = { action: 'tasks', dept: dept, status: status || '', search: search || '', limit: 200 };
    if (sortBy) { params.sortBy = sortBy; params.sortDir = sortDir; }

    apiGet(params).then(function(r) {
      showLoading(false); showRefresh(false);
      if (r && r.success) { cacheSet(cacheKey, { data: r.data, total: r.total }, 120); state.tasks = r.data; state.taskTotal = r.total; if (state.view === 'tasks') render(); }
      else if (!cached) { toast('Failed: ' + (r && r.error || 'Unknown'), 'error'); }
    }).catch(function(e) { showLoading(false); showRefresh(false); if (!cached) toast('Error: ' + e.message, 'error'); });
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
    '</div>' +
    '<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-sm ' + (sortState.by === 'dueDate' ? 'btn-primary' : 'btn-outline') + ' sort-btn" data-sort="dueDate">Due' + (sortState.by === 'dueDate' ? (sortState.dir === 'asc' ? ' \u2191' : ' \u2193') : '') + '</button>' +
      '<button class="btn btn-sm ' + (sortState.by === 'priority' ? 'btn-primary' : 'btn-outline') + ' sort-btn" data-sort="priority">Priority' + (sortState.by === 'priority' ? (sortState.dir === 'asc' ? ' \u2191' : ' \u2193') : '') + '</button>' +
      '<button class="btn btn-sm ' + (sortState.by === 'status' ? 'btn-primary' : 'btn-outline') + ' sort-btn" data-sort="status">Status' + (sortState.by === 'status' ? (sortState.dir === 'asc' ? ' \u2191' : ' \u2193') : '') + '</button>' +
      '<button class="btn btn-sm ' + (sortState.by === 'createdDate' ? 'btn-primary' : 'btn-outline') + ' sort-btn" data-sort="createdDate">Created' + (sortState.by === 'createdDate' ? (sortState.dir === 'asc' ? ' \u2191' : ' \u2193') : '') + '</button>' +
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
        loadTasks(state.currentDept, document.getElementById('status-filter').value, document.getElementById('task-search').value.trim(), sortState.by, sortState.dir);
      });
    }

    document.getElementById('status-filter').addEventListener('change', function() {
      loadTasks(state.currentDept, this.value, document.getElementById('task-search').value.trim(), sortState.by, sortState.dir);
    });

    var searchTimer;
    document.getElementById('task-search').addEventListener('input', function() {
      clearTimeout(searchTimer);
      var el = this;
      searchTimer = setTimeout(function() { loadTasks(state.currentDept, document.getElementById('status-filter').value, el.value.trim(), sortState.by, sortState.dir); }, 400);
    });

    // Sort buttons
    main.querySelectorAll('.sort-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var field = this.getAttribute('data-sort');
        if (sortState.by === field) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        else { sortState.by = field; sortState.dir = 'asc'; }
        loadTasks(state.currentDept, document.getElementById('status-filter').value, document.getElementById('task-search').value.trim(), sortState.by, sortState.dir);
      });
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

    // Comments section
    html += '<div class="card" id="comments-section">' +
      '<div class="card-header"><h3>Comments</h3></div>' +
      '<div id="comments-list"><div class="text-muted text-center" style="padding:8px;">Loading...</div></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;">' +
        '<input type="text" id="comment-input" placeholder="Add a comment..." style="flex:1;padding:8px 10px;border:1px solid var(--gray-border);border-radius:var(--radius-sm);font-size:13px;">' +
        '<button class="btn btn-sm btn-primary" id="comment-submit">Post</button>' +
      '</div>' +
    '</div>';

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
        if (r && r.success) { toast('Updated to ' + newStatus, 'success'); cache = {}; openTaskDetail(task.dept, task.row); }
        else { toast('Update failed: ' + (r && r.error || 'Unknown'), 'error'); }
      }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
    });

    // Load comments
    apiGet({ action: 'comments', dept: task.dept, row: task.row }).then(function(r) {
      var list = document.getElementById('comments-list');
      if (!list) return;
      if (r && r.success && r.data.length > 0) {
        list.innerHTML = r.data.map(function(c) {
          return '<div style="padding:6px 0;border-bottom:1px solid var(--gray-light);font-size:13px;">' +
            '<div class="flex-between"><strong>' + esc(c.user) + '</strong><span class="text-muted" style="font-size:11px;">' + esc(c.ts) + '</span></div>' +
            '<div style="margin-top:2px;">' + esc(c.text) + '</div></div>';
        }).join('');
      } else {
        list.innerHTML = '<div class="text-muted text-center" style="padding:8px;">No comments yet</div>';
      }
    });

    document.getElementById('comment-submit').addEventListener('click', function() {
      var input = document.getElementById('comment-input');
      var text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      apiPost({ action: 'addComment', dept: task.dept, row: task.row, text: text }).then(function(r) {
        input.disabled = false;
        if (r && r.success) { input.value = ''; openTaskDetail(task.dept, task.row); }
        else { toast('Failed to add comment', 'error'); }
      }).catch(function() { input.disabled = false; toast('Error', 'error'); });
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
    html += '<div class="form-group"><label>Assignor</label><select id="create-assignor"><option value="' + esc(state.user.name) + '">' + esc(state.user.name) + ' (Me)</option>';
    state.employees.forEach(function(e) {
      if (e.name !== state.user.name) html += '<option value="' + esc(e.name) + '">' + esc(e.name) + '</option>';
    });
    html += '</select></div>';
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
        assignor: document.getElementById('create-assignor').value || state.user.name, priority: priority,
        description: desc, dueDate: dueDateStr, recurring: recurring, recurringType: recurType
      }).then(function(r) {
        showLoading(false);
        if (r && r.success) { toast('Created: ' + r.data.taskId, 'success'); state.currentDept = dept; cache = {}; loadTasks(dept); }
        else { toast('Failed: ' + (r && r.error || 'Unknown'), 'error'); }
      }).catch(function(e) { showLoading(false); toast('Error: ' + e.message, 'error'); });
    });
  }

  // ===== REPORTS =====
  function loadReports() {
    var cached = cacheGet('reports');
    if (cached) { state.reports = cached; state.view = 'reports'; render(); showRefresh(true); }
    else showLoading(true);

    apiGet({ action: 'reports', reportType: 'all' }).then(function(r) {
      showLoading(false); showRefresh(false);
      if (r && r.success) { cacheSet('reports', r.data, 300); state.reports = r.data; if (state.view === 'reports') render(); }
    }).catch(function(e) { showLoading(false); showRefresh(false); if (!cached) toast('Error: ' + e.message, 'error'); });
  }

  var yearlyReportState = { year: new Date().getFullYear(), data: null, loading: false };

  function loadYearlyReport(year) {
    year = year || yearlyReportState.year;
    yearlyReportState.year = year;
    yearlyReportState.loading = true;
    apiGet({ action: 'yearlyReport', year: year }).then(function(r) {
      yearlyReportState.loading = false;
      if (r && r.success) { yearlyReportState.data = r.data; if (state.view === 'reports') render(); }
    }).catch(function() { yearlyReportState.loading = false; });
  }

  function renderReports() {
    app.innerHTML = '';
    app.appendChild(renderHeader('Reports', false));

    var html = '';

    // Yearly report toggle
    html += '<div class="card" style="padding:12px;">' +
      '<div class="card-header"><h3>Calendar Year Report</h3></div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">' +
        '<select id="yr-year" style="flex:1;padding:8px;border:1px solid var(--gray-border);border-radius:var(--radius-sm);font-size:14px;">' +
          '<option value="2025"' + (yearlyReportState.year === 2025 ? ' selected' : '') + '>2025</option>' +
          '<option value="2026"' + (yearlyReportState.year === 2026 ? ' selected' : '') + '>2026</option>' +
        '</select>' +
        '<button class="btn btn-sm btn-primary" id="yr-load">Load</button>' +
      '</div>';

    if (yearlyReportState.data) {
      var deptNames = Object.keys(yearlyReportState.data).sort();
      html += '<div class="stats-grid">' +
        '<div class="stat-card blue"><div class="num">' + deptNames.reduce(function(s,n){ return s + yearlyReportState.data[n].total; },0) + '</div><div class="lbl">Total</div></div>' +
        '<div class="stat-card green"><div class="num">' + deptNames.reduce(function(s,n){ return s + yearlyReportState.data[n].completed; },0) + '</div><div class="lbl">Completed</div></div>' +
        '<div class="stat-card red"><div class="num">' + deptNames.reduce(function(s,n){ return s + yearlyReportState.data[n].overdue; },0) + '</div><div class="lbl">Overdue</div></div>' +
        '<div class="stat-card orange"><div class="num">' + yearlyReportState.year + '</div><div class="lbl">Year</div></div>' +
      '</div>';

      deptNames.forEach(function(n) {
        var ds = yearlyReportState.data[n];
        if (ds.total === 0) return;
        var compPct = Math.round(ds.completed / ds.total * 100);
        html += '<div class="card report-card">' +
          '<div class="flex-between"><h4>' + esc(n) + '</h4><span class="text-muted">' + ds.total + ' tasks</span></div>' +
          '<div class="report-stat"><span class="rs-label">Completed</span><span class="rs-value green">' + ds.completed + ' (' + compPct + '%)</span></div>' +
          '<div class="report-stat"><span class="rs-label">Overdue</span><span class="rs-value red">' + ds.overdue + '</span></div>' +
          '<div class="dept-bar mt-8"><span class="name" style="width:auto;text-align:left;">Progress</span><div class="bar-wrap"><div class="bar-fill green" style="width:' + compPct + '%"></div></div><span class="pct">' + compPct + '%</span></div>';

        // Monthly breakdown mini bars
        html += '<div style="margin-top:8px;font-size:11px;">';
        for (var m = 1; m <= 12; m++) {
          var md = ds.byMonth[m];
          if (!md || md.total === 0) continue;
          var mpct = Math.round(md.completed / md.total * 100);
          html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">' +
            '<span style="width:24px;flex-shrink:0;">' + ['','J','F','M','A','M','J','J','A','S','O','N','D'][m] + '</span>' +
            '<div style="flex:1;height:4px;background:var(--gray-light);border-radius:2px;overflow:hidden;">' +
              '<div style="height:100%;width:' + mpct + '%;background:' + (mpct > 50 ? 'var(--success)' : mpct > 25 ? 'var(--warning)' : 'var(--danger)') + ';border-radius:2px;"></div>' +
            '</div>' +
            '<span style="width:32px;text-align:right;">' + md.completed + '/' + md.total + '</span>' +
          '</div>';
        }
        html += '</div></div>';
      });
    } else if (!yearlyReportState.loading) {
      // Current dept report summary (existing)
      html += '</div>';
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
      }
    } else {
      html += '<div class="text-center text-muted" style="padding:20px;">Loading yearly report...</div></div>';
    }

    app.appendChild(renderMain(html));
    app.appendChild(renderTabs('reports'));

    var yrBtn = document.getElementById('yr-load');
    if (yrBtn) yrBtn.addEventListener('click', function() {
      var y = parseInt(document.getElementById('yr-year').value, 10);
      loadYearlyReport(y);
    });
  }

  // ===== INIT =====
  function init() {
    loadConfig();
    if (isLoggedIn()) {
      apiGet({ action: 'ping' }).then(function(r) {
        if (r && r.success) return apiGet({ action: 'me' });
        clearConfig(); render(); return null;
      }).then(function(me) {
        if (me && me.success) { state.user = me.data; loadInitialData(); startNotifPoll(); }
        else { clearConfig(); render(); }
      }).catch(function() { clearConfig(); render(); });
    } else {
      render();
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function() {});
    }

    // Global event delegation for header buttons
    document.addEventListener('click', function(e) {
      var notifBell = e.target.closest('#notif-bell');
      if (notifBell) { e.preventDefault(); renderNotifPanel(); return; }

      var searchBtn = e.target.closest('#search-btn');
      if (searchBtn && state.isFullAccess) {
        e.preventDefault();
        var q = prompt('Search all departments:', '');
        if (q && q.trim()) {
          showLoading(true);
          apiGet({ action: 'searchAll', q: q.trim() }).then(function(r) {
            showLoading(false);
            if (r && r.success && r.data.length > 0) {
              var tasks = r.data;
              state.tasks = tasks.map(function(t) { return { row: t.row, dept: t.dept, taskId: t.taskId, taskName: t.taskName, status: t.status, assignee: t.assignee, assignor: t.assignor, dueLapse: '', priority: '' }; });
              state.taskTotal = tasks.length;
              state.view = 'tasks';
              render();
              toast('Found ' + tasks.length + ' result' + (tasks.length > 1 ? 's' : ''), 'success');
            } else {
              toast('No results found', '');
            }
          }).catch(function() { showLoading(false); toast('Search error', 'error'); });
        }
        return;
      }
    });
  }

  init();
})();
