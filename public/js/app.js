// ══════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function safeIdAttribute(value) {
  return isValidUuid(value) ? String(value) : '';
}

function fmtDate(d) { if(!d) return '—'; return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function isOverdue(due) { if(!due) return false; return new Date(due) < new Date() && new Date(due).toDateString() !== new Date().toDateString(); }
function initials(name) { if(!name) return '?'; return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
const COLORS = ['#7c6af7','#2dd98f','#f5a623','#f05252','#38bdf8','#fb923c','#ec4899','#14b8a6'];
function avatarColor(name) { let h=0; for(let c of name||'A') h=(h*31+c.charCodeAt(0))%COLORS.length; return COLORS[h]; }
function safeLabelColor(color) { return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#7c6af7'; }
function priorityBadgeClass(priority) {
  return ({ low: 'badge-low', medium: 'badge-medium', high: 'badge-high' })[priority] || 'badge-medium';
}
function renderLabelChips(labels) {
  const safeLabels = Array.isArray(labels) ? labels : [];
  const visible = safeLabels.slice(0, 3).map(label =>
    `<span class="label-chip" style="background:${safeLabelColor(label.color)};">${escapeHtml(label.name)}</span>`
  ).join('');
  const remaining = safeLabels.length > 3 ? `<span class="label-chip label-chip-more">+${safeLabels.length - 3}</span>` : '';
  return visible + remaining;
}

function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if(diff < 60) return 'Just now';
  if(diff < 3600) return Math.floor(diff/60) + 'm ago';
  if(diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

// ══════════════════════════════════════════════════
//  API LAYER
// ══════════════════════════════════════════════════

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('token');
      currentUser = null;
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app-screen').classList.remove('visible');
      document.body.classList.remove('is-admin');
      showToast('Session expired. Please log in again.', 'error');
      return null;
    }
    if (res.status === 503) {
      showToast('Service temporarily unavailable. Please try again shortly.', 'error');
    }
    return res;
  } catch(err) {
    showToast('Network error. Please check your connection.', 'error');
    return null;
  }
}

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════

let currentUser = null;
let currentPage = 'dashboard';
let currentProjectId = null;
let taskFilter = 'assigned';
let currentTaskPage = 1;
let taskSearchTimer = null;
let projectSearchTimer = null;
let cachedMembers = [];
let cachedProjects = [];
let cachedLabels = [];
let currentTaskDetailId = null;

// ══════════════════════════════════════════════════
//  AUTH UI
// ══════════════════════════════════════════════════

function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab==='login');
  document.getElementById('tab-signup').classList.toggle('active', tab==='signup');
  document.getElementById('login-form').classList.toggle('hidden', tab!=='login');
  document.getElementById('signup-form').classList.toggle('hidden', tab!=='signup');
  document.getElementById('auth-headline-login').classList.toggle('hidden', tab!=='login');
  document.getElementById('auth-headline-signup').classList.toggle('hidden', tab!=='signup');
  document.getElementById('auth-error').classList.remove('show');
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('show');
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  if (!email || !pass) { showAuthError('Email and password are required'); return; }
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    await initApp();
  } catch(e) { showAuthError(e.message); }
}

async function doSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;
  if (!name || !email || !pass) { showAuthError('All fields are required'); return; }
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    await initApp();
    showToast('Account created successfully!', 'success');
  } catch(e) { showAuthError(e.message); }
}

function doLogout() {
  localStorage.removeItem('token');
  currentUser = null;
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').classList.remove('visible');
  document.body.classList.remove('is-admin');
}

// ══════════════════════════════════════════════════
//  APP INIT
// ══════════════════════════════════════════════════

async function initApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('visible');

  if(currentUser.role === 'admin') {
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }

  // Sidebar user
  const av = document.getElementById('sidebar-avatar');
  av.textContent = initials(currentUser.name);
  av.style.background = avatarColor(currentUser.name);
  document.getElementById('sidebar-username').textContent = currentUser.name;
  document.getElementById('sidebar-userrole').textContent = currentUser.role === 'admin' ? 'Admin' : 'Member';

  // Dashboard greeting
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dash-greeting').textContent = g + ', ' + currentUser.name.split(' ')[0];

  await fetchMembers();
  await refreshSidebarProjects();
  await fetchLabels();
  await navigate('dashboard');
}

async function fetchMembers() {
  const res = await apiFetch('/api/members');
  if (!res) return;
  cachedMembers = await res.json();
}

async function refreshSidebarProjects() {
  const res = await apiFetch('/api/projects');
  if (!res) return;
  cachedProjects = await res.json();
  const el = document.getElementById('sidebar-projects');
  el.innerHTML = cachedProjects.map(p => `
    <div class="project-nav-item ${currentProjectId===p.id?'active':''}" data-project-id="${safeIdAttribute(p.id)}">
      <div class="project-dot" style="background:${escapeHtml(p.color)}"></div>
      <div class="project-nav-name">${escapeHtml(p.name)}</div>
    </div>
  `).join('') || '<div style="padding:6px 14px;font-size:0.75rem;color:var(--text3);">No projects yet</div>';
}

async function fetchLabels() {
  const res = await apiFetch('/api/labels');
  if (!res) return;
  cachedLabels = await res.json();
  renderLabelManagement();
}

function renderLabelManagement() {
  const list = document.getElementById('labels-management-list');
  if (!list) return;
  list.innerHTML = cachedLabels.map(label => `
    <div class="label-management-row">
      <span class="label-chip" style="background:${safeLabelColor(label.color)};">${escapeHtml(label.name)}</span>
      <button class="btn-icon btn-danger-icon" data-action="delete-label" data-label-id="${safeIdAttribute(label.id)}" title="Delete label">×</button>
    </div>
  `).join('') || '<p class="muted-text">No labels yet.</p>';
}

document.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget) {
    const action = actionTarget.dataset.action;
    const projectId = actionTarget.dataset.projectId;
    const taskId = actionTarget.dataset.taskId;
    const userId = actionTarget.dataset.userId;
    const labelId = actionTarget.dataset.labelId;
    const commentId = actionTarget.dataset.commentId;

    if (action === 'switch-auth') switchAuthTab(actionTarget.dataset.tab);
    if (action === 'login') doLogin();
    if (action === 'signup') doSignup();
    if (action === 'navigate') navigate(actionTarget.dataset.page);
    if (action === 'logout') doLogout();
    if (action === 'open-modal') openModal(actionTarget.dataset.modalId);
    if (action === 'open-task-for-project') openTaskModalForProject();
    if (action === 'edit-current-project') editCurrentProject();
    if (action === 'save-settings') saveSettings();
    if (action === 'reset-data') resetAllData();
    if (action === 'close-modal') closeModal(actionTarget.dataset.modalId);
    if (action === 'save-project') saveProject();
    if (action === 'save-task') saveTask();
    if (action === 'invite-member') inviteMember();
    if (action === 'copy-password') copyTemporaryPassword();
    if (action === 'save-task-labels' && taskId) saveTaskLabels(taskId);
    if (action === 'add-comment' && taskId) addComment(taskId);
    if (action === 'edit-comment' && commentId && taskId) editComment(commentId, taskId);
    if (action === 'delete-comment' && commentId && taskId) deleteComment(commentId, taskId);
    if (action === 'create-label') createLabel();
    if (action === 'delete-label' && labelId) deleteLabel(labelId);

    if (action === 'edit-project' && projectId) editProject(projectId);
    if (action === 'delete-project' && projectId) deleteProject(projectId);
    if (action === 'edit-task' && taskId) editTask(taskId);
    if (action === 'delete-task' && taskId) deleteTask(taskId);
    if (action === 'view-task' && taskId) openTaskDetail(taskId);
    if (action === 'toggle-role' && userId) toggleRole(userId);
    if (action === 'delete-member' && userId) deleteMember(userId);
    return;
  }

  const taskFilterButton = event.target.closest('[data-task-filter]');
  if (taskFilterButton) {
    setTaskFilter(taskFilterButton.dataset.taskFilter);
    return;
  }

  const taskPageButton = event.target.closest('[data-task-page]');
  if (taskPageButton && !taskPageButton.disabled) {
    currentTaskPage += taskPageButton.dataset.taskPage === 'next' ? 1 : -1;
    renderTasksPage();
    return;
  }

  const projectCard = event.target.closest('.project-card[data-project-id]');
  if (projectCard) {
    const projectId = projectCard.dataset.projectId;
    if (projectId) navigateToProject(projectId);
    return;
  }

  const projectNav = event.target.closest('[data-project-id].project-nav-item');
  if (projectNav) {
    const projectId = projectNav.dataset.projectId;
    if (projectId) navigateToProject(projectId);
    return;
  }

  const taskCard = event.target.closest('[data-task-id].task-card');
  if (taskCard) {
    const taskId = taskCard.dataset.taskId;
    if (taskId) openTaskDetail(taskId);
  }
});

document.addEventListener('change', event => {
  const statusSelect = event.target.closest('[data-task-status-id]');
  if (statusSelect && statusSelect.dataset.taskStatusId) {
    quickUpdateStatus(statusSelect.dataset.taskStatusId, statusSelect.value);
    return;
  }
  if (event.target.matches('#task-status-filter, #task-priority-filter, #task-sort-filter')) {
    currentTaskPage = 1;
    renderTasksPage();
  }
});

document.getElementById('task-search').addEventListener('input', () => {
  clearTimeout(taskSearchTimer);
  taskSearchTimer = setTimeout(() => {
    currentTaskPage = 1;
    renderTasksPage();
  }, 300);
});

document.getElementById('project-search').addEventListener('input', () => {
  clearTimeout(projectSearchTimer);
  projectSearchTimer = setTimeout(renderProjectsPage, 300);
});

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════

async function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  currentPage = page;
  const el = document.getElementById('page-' + page);
  if(el) el.classList.add('active');
  const nav = document.getElementById('nav-' + page);
  if(nav) nav.classList.add('active');

  if(page === 'dashboard') await renderDashboard();
  if(page === 'tasks') await renderTasksPage();
  if(page === 'projects') await renderProjectsPage();
  if(page === 'team') await renderTeamPage();

  await updateTaskCount();
}

async function navigateToProject(id) {
  currentProjectId = id;
  await refreshSidebarProjects();
  await renderProjectDetail(id);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-project-detail').classList.add('active');
  currentPage = 'project-detail';
}

async function updateTaskCount() {
  const res = await apiFetch('/api/tasks');
  if (!res) return;
  const tasks = await res.json();
  const count = tasks.filter(t => t.assignee_id === currentUser.id && t.status !== 'done').length;
  document.getElementById('my-task-count').textContent = count;
}

// ══════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════

async function renderDashboard() {
  const [tasksRes, projectsRes, activitiesRes] = await Promise.all([
    apiFetch('/api/tasks'),
    apiFetch('/api/projects'),
    apiFetch('/api/activities')
  ]);
  if (!tasksRes || !projectsRes || !activitiesRes) return;

  const tasks    = await tasksRes.json();
  const projects = await projectsRes.json();
  const activities = await activitiesRes.json();

  const myTasks  = tasks.filter(t => t.assignee_id === currentUser.id);
  const overdue  = tasks.filter(t => isOverdue(t.due_date) && t.status !== 'done');
  const done     = tasks.filter(t => t.status === 'done');
  const inprog   = tasks.filter(t => t.status === 'inprogress');

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Projects</div>
      <div class="stat-value stat-accent">${projects.length}</div>
      <div class="stat-sub">Active workspaces</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">All Tasks</div>
      <div class="stat-value">${tasks.length}</div>
      <div class="stat-sub">${inprog.length} in progress</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Completed</div>
      <div class="stat-value stat-green">${done.length}</div>
      <div class="stat-sub">${tasks.length > 0 ? Math.round(done.length/tasks.length*100) : 0}% done rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Overdue</div>
      <div class="stat-value stat-red">${overdue.length}</div>
      <div class="stat-sub">Need attention</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">My Tasks</div>
      <div class="stat-value stat-blue">${myTasks.length}</div>
      <div class="stat-sub">${myTasks.filter(t=>t.status!=='done').length} pending</div>
    </div>
  `;

  // Progress overview
  const progressHTML = projects.map(p => {
    const ptasks = tasks.filter(t=>t.project_id===p.id);
    const pdone  = ptasks.filter(t=>t.status==='done').length;
    const pct    = ptasks.length > 0 ? Math.round(pdone/ptasks.length*100) : 0;
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <div style="width:9px;height:9px;border-radius:50%;background:${escapeHtml(p.color)};flex-shrink:0;"></div>
            <span style="font-size:0.85rem;font-weight:500;">${escapeHtml(p.name)}</span>
          </div>
          <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2);">${pct}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${pct}%;background:${escapeHtml(p.color)};"></div>
        </div>
        <div style="font-size:0.72rem;color:var(--text3);margin-top:3px;">${pdone}/${ptasks.length} tasks &nbsp;·&nbsp; Due ${fmtDate(p.due_date)}</div>
      </div>
    `;
  }).join('') || '<div class="empty-state"><p>No projects yet</p></div>';
  document.getElementById('dash-progress').innerHTML = progressHTML;

  // Activity
  const acts = activities.slice(0,8);
  document.getElementById('dash-activity').innerHTML = acts.length ? acts.map(a => `
    <div class="activity-item">
      <div class="activity-dot-wrap">
        <div class="activity-dot" style="background:var(--accent);"></div>
      </div>
      <div class="activity-content">
        <div class="activity-text">${escapeHtml(a.text)}</div>
        <div class="activity-time">${timeAgo(a.created_at)}</div>
      </div>
    </div>
  `).join('') : '<p style="color:var(--text3);font-size:0.82rem;padding:10px 4px;">No activity yet</p>';

  // Overdue
  document.getElementById('overdue-count-badge').textContent = overdue.length + ' task' + (overdue.length!==1?'s':'');
  document.getElementById('dash-overdue').innerHTML = overdue.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Task</th><th>Project</th><th>Assignee</th><th>Due</th><th>Priority</th>
        </tr></thead>
        <tbody>
          ${overdue.map(t => {
            const p = projects.find(p=>p.id===t.project_id);
            const u = cachedMembers.find(u=>u.id===t.assignee_id);
            return `<tr style="cursor:pointer;" data-task-id="${safeIdAttribute(t.id)}" data-action="view-task">
              <td><span style="font-weight:500;">${escapeHtml(t.title)}</span></td>
              <td><span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${p?escapeHtml(p.color):'#666'};display:inline-block;"></span>${p?escapeHtml(p.name):'—'}</span></td>
              <td>${u ? `<span style="display:flex;align-items:center;gap:5px;"><span class="mini-avatar" style="background:${avatarColor(u.name)}">${escapeHtml(initials(u.name))}</span>${escapeHtml(u.name)}</span>` : '—'}</td>
              <td><span class="badge badge-overdue">${fmtDate(t.due_date)}</span></td>
              <td><span class="badge ${priorityBadgeClass(t.priority)}">${escapeHtml(t.priority)}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '<div class="empty-state" style="padding:28px;"><p style="color:var(--green);font-size:0.85rem;">No overdue tasks. Great work!</p></div>';
}

// ══════════════════════════════════════════════════
//  TASKS PAGE
// ══════════════════════════════════════════════════

function setTaskFilter(filter) {
  taskFilter = filter;
  currentTaskPage = 1;
  document.querySelectorAll('[data-task-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.taskFilter === filter);
  });
  renderTasksPage();
}

async function renderTasksPage() {
  const params = new URLSearchParams({
    page: String(currentTaskPage),
    limit: '20'
  });
  const search = document.getElementById('task-search').value.trim();
  const status = document.getElementById('task-status-filter').value;
  const priority = document.getElementById('task-priority-filter').value;
  const [sort, order] = document.getElementById('task-sort-filter').value.split(':');
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  params.set('sort', sort);
  params.set('order', order);
  if (taskFilter === 'assigned') params.set('assigneeId', currentUser.id);
  if (taskFilter === 'created') params.set('createdBy', currentUser.id);

  const res = await apiFetch(`/api/tasks?${params}`);
  if (!res) return;
  const tasks = await res.json();
  const total = Number.parseInt(res.headers.get('X-Total-Count') || '0', 10);
  const pageCount = Math.max(1, Math.ceil(total / 20));
  if (currentTaskPage > pageCount) {
    currentTaskPage = pageCount;
    return renderTasksPage();
  }
  document.getElementById('task-page-label').textContent = `Page ${currentTaskPage} of ${pageCount}`;
  document.querySelector('[data-task-page="previous"]').disabled = currentTaskPage <= 1;
  document.querySelector('[data-task-page="next"]').disabled = currentTaskPage >= pageCount;

  const todo     = tasks.filter(t => t.status==='todo' && !(isOverdue(t.due_date)));
  const inprog   = tasks.filter(t => t.status==='inprogress' && !(isOverdue(t.due_date)));
  const done     = tasks.filter(t => t.status==='done');
  const overdue  = tasks.filter(t => isOverdue(t.due_date) && t.status!=='done');

  const cols = taskFilter === 'all' ? [
    { label:'To Do',       tasks: [...overdue, ...todo], color:'var(--text2)' },
    { label:'In Progress', tasks: inprog,                color:'var(--blue)' },
    { label:'Done',        tasks: done,                  color:'var(--green)' }
  ] : [
    { label:'To Do',       tasks: [...overdue, ...todo], color:'var(--text2)' },
    { label:'In Progress', tasks: inprog,                color:'var(--blue)' },
    { label:'Done',        tasks: done,                  color:'var(--green)' }
  ];

  document.getElementById('tasks-kanban').innerHTML = cols.map(col => `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div class="kanban-col-title" style="color:${col.color}">${col.label}</div>
        <div class="kanban-count">${col.tasks.length}</div>
      </div>
      ${col.tasks.length ? col.tasks.map(t => renderTaskCard(t)).join('') : '<div style="color:var(--text3);font-size:0.8rem;padding:12px 0;text-align:center;">Empty</div>'}
    </div>
  `).join('');
}

function renderTaskCard(t) {
  const p = cachedProjects.find(p=>p.id===t.project_id);
  const od = isOverdue(t.due_date) && t.status !== 'done';
  return `
    <div class="task-card" data-task-id="${safeIdAttribute(t.id)}" data-action="view-task">
      <div class="task-card-top">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <span class="badge ${priorityBadgeClass(t.priority)}">${escapeHtml(t.priority)}</span>
      </div>
      <div class="task-card-meta">
        ${renderLabelChips(t.labels)}
        ${p ? `<span style="display:flex;align-items:center;gap:5px;font-size:0.73rem;color:var(--text2);"><span style="width:7px;height:7px;border-radius:50%;background:${escapeHtml(p.color)};display:inline-block;"></span>${escapeHtml(p.name)}</span>` : ''}
        ${t.due_date ? `<span class="task-due ${od?'overdue':''}">${fmtDate(t.due_date)}${od?' (overdue)':''}</span>` : ''}
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════
//  PROJECTS PAGE
// ══════════════════════════════════════════════════

async function renderProjectsPage() {
  const search = document.getElementById('project-search').value.trim();
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  const projectUrl = params.size ? `/api/projects?${params}` : '/api/projects';
  const [projRes, taskRes] = await Promise.all([apiFetch(projectUrl), apiFetch('/api/tasks')]);
  if (!projRes || !taskRes) return;
  const projects = await projRes.json();
  const tasks = await taskRes.json();
  cachedProjects = projects;

  const el = document.getElementById('projects-grid');

  if(!projects.length) {
    el.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7a1 1 0 011-1h4l2 3h10a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7z"/></svg>
        </div>
        <p>No projects yet. Create your first project to get started!</p>
      </div>`;
    return;
  }

  el.innerHTML = projects.map(p => {
    const ptasks = tasks.filter(t=>t.project_id===p.id);
    const pdone  = ptasks.filter(t=>t.status==='done').length;
    const pct    = ptasks.length > 0 ? Math.round(pdone/ptasks.length*100) : 0;
    const creator = cachedMembers.find(u=>u.id===p.created_by);
    return `
      <div class="project-card" data-project-id="${safeIdAttribute(p.id)}">
        <div class="project-card-header" style="background:${escapeHtml(p.color)}20;border-left:4px solid ${escapeHtml(p.color)};">
          <div class="project-card-title">${escapeHtml(p.name)}</div>
          ${currentUser.role==='admin'?`<div class="project-card-actions">
            <button class="btn-icon" data-action="edit-project" data-project-id="${safeIdAttribute(p.id)}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="btn-icon btn-danger-icon" data-action="delete-project" data-project-id="${safeIdAttribute(p.id)}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
          </div>`:''}
        </div>
        <div class="project-card-body">
          <p class="project-card-desc">${escapeHtml(p.description||'No description')}</p>
          <div class="progress-bar-wrap" style="margin:10px 0 6px;">
            <div class="progress-bar-fill" style="width:${pct}%;background:${escapeHtml(p.color)};"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text3);">
            <span>${pdone}/${ptasks.length} tasks · ${pct}%</span>
            <span>Due ${fmtDate(p.due_date)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════
//  PROJECT DETAIL
// ══════════════════════════════════════════════════

async function renderProjectDetail(id) {
  const [projRes, taskRes] = await Promise.all([
    apiFetch('/api/projects/' + id),
    apiFetch('/api/tasks?projectId=' + id)
  ]);
  if (!projRes || !taskRes) return;
  const p = await projRes.json();
  const tasks = await taskRes.json();

  document.getElementById('detail-project-name').textContent = p.name;
  const todo = tasks.filter(t=>t.status==='todo');
  const inprog = tasks.filter(t=>t.status==='inprogress');
  const done = tasks.filter(t=>t.status==='done');
  const pct = tasks.length > 0 ? Math.round(done.length/tasks.length*100) : 0;

  const content = document.getElementById('project-detail-content');
  content.innerHTML = `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-body">
        <p style="color:var(--text2);font-size:0.85rem;margin-bottom:12px;">${escapeHtml(p.description||'No description')}</p>
        <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:0.8rem;color:var(--text3);">
          <span>Due: ${fmtDate(p.due_date)}</span>
          <span>Tasks: ${tasks.length}</span>
          <span>Progress: ${pct}%</span>
        </div>
        <div class="progress-bar-wrap" style="margin-top:10px;">
          <div class="progress-bar-fill" style="width:${pct}%;background:${escapeHtml(p.color)};"></div>
        </div>
      </div>
    </div>
    <div class="kanban-board">
      ${renderKanbanCol('To Do', todo, 'var(--text2)')}
      ${renderKanbanCol('In Progress', inprog, 'var(--blue)')}
      ${renderKanbanCol('Done', done, 'var(--green)')}
    </div>
  `;
}

function renderKanbanCol(label, tasks, color) {
  return `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <div class="kanban-col-title" style="color:${color}">${label}</div>
        <div class="kanban-count">${tasks.length}</div>
      </div>
      ${tasks.length ? tasks.map(t => renderTaskCard(t)).join('') : '<div style="color:var(--text3);font-size:0.8rem;padding:12px 0;text-align:center;">Empty</div>'}
    </div>
  `;
}

// ══════════════════════════════════════════════════
//  TEAM PAGE
// ══════════════════════════════════════════════════

async function renderTeamPage() {
  await fetchMembers();
  const taskRes = await apiFetch('/api/tasks');
  if (!taskRes) return;
  const tasks = await taskRes.json();

  document.getElementById('team-count').textContent = cachedMembers.length + ' people';

  document.getElementById('team-list').innerHTML = cachedMembers.map(u => `
    <div class="team-member-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="mini-avatar" style="background:${avatarColor(u.name)};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.7rem;font-weight:600;">${escapeHtml(initials(u.name))}</div>
        <div>
          <div style="font-size:0.85rem;font-weight:500;">${escapeHtml(u.name)}</div>
          <div style="font-size:0.73rem;color:var(--text3);">${escapeHtml(u.email)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="badge badge-${u.role==='admin'?'high':'medium'}" style="font-size:0.7rem;">${escapeHtml(u.role)}</span>
        ${currentUser.role==='admin' && u.id !== currentUser.id ? `
          <button class="btn-icon" data-action="toggle-role" data-user-id="${safeIdAttribute(u.id)}" title="Toggle role"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></button>
          <button class="btn-icon btn-danger-icon" data-action="delete-member" data-user-id="${safeIdAttribute(u.id)}" title="Remove"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        ` : ''}
      </div>
    </div>
  `).join('');

  // Task distribution
  document.getElementById('team-tasks-dist').innerHTML = cachedMembers.map(u => {
    const ut = tasks.filter(t=>t.assignee_id===u.id);
    const udone = ut.filter(t=>t.status==='done').length;
    const pct = ut.length > 0 ? Math.round(udone/ut.length*100) : 0;
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:0.82rem;font-weight:500;">${escapeHtml(u.name)}</span>
          <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2);">${udone}/${ut.length}</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${pct}%;background:${avatarColor(u.name)};"></div>
        </div>
      </div>
    `;
  }).join('') || '<p style="color:var(--text3);">No members</p>';
}

// ══════════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════════

function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'modal-task') populateTaskModal();
  if (id === 'modal-project') {
    if (!document.getElementById('project-edit-id').value) {
      document.getElementById('project-modal-title').textContent = 'New Project';
      document.getElementById('project-name').value = '';
      document.getElementById('project-desc-input').value = '';
      document.getElementById('project-color').value = '#7c6af7';
      document.getElementById('project-due').value = '';
    }
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (id === 'modal-temp-password') document.getElementById('temp-password-value').value = '';
  if (id === 'modal-task-detail') currentTaskDetailId = null;
  // Reset form IDs
  if (id === 'modal-project') document.getElementById('project-edit-id').value = '';
  if (id === 'modal-task') document.getElementById('task-edit-id').value = '';
}

function populateTaskModal() {
  // Populate project dropdown
  const projSelect = document.getElementById('task-project-select');
  projSelect.innerHTML = cachedProjects.map(p => `<option value="${safeIdAttribute(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  if (currentProjectId) projSelect.value = currentProjectId;

  // Populate assignee dropdown
  const assignSelect = document.getElementById('task-assignee-select');
  assignSelect.innerHTML = '<option value="">Unassigned</option>' +
    cachedMembers.map(u => `<option value="${safeIdAttribute(u.id)}">${escapeHtml(u.name)}</option>`).join('');

  if (!document.getElementById('task-edit-id').value) {
    document.getElementById('task-modal-title').textContent = 'New Task';
    document.getElementById('task-title-input').value = '';
    document.getElementById('task-desc-input').value = '';
    document.getElementById('task-priority').value = 'medium';
    document.getElementById('task-status-select').value = 'todo';
    document.getElementById('task-due-input').value = '';
  }
}

function openTaskModalForProject() {
  document.getElementById('task-edit-id').value = '';
  openModal('modal-task');
  document.getElementById('task-project-select').value = currentProjectId;
}

// ══════════════════════════════════════════════════
//  CRUD — PROJECTS
// ══════════════════════════════════════════════════

async function saveProject() {
  const id = document.getElementById('project-edit-id').value;
  const name = document.getElementById('project-name').value.trim();
  const description = document.getElementById('project-desc-input').value.trim();
  const color = document.getElementById('project-color').value;
  const due = document.getElementById('project-due').value;
  if (!name) { showToast('Project name is required', 'error'); return; }
  try {
    const url = id ? '/api/projects/' + id : '/api/projects';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify({ name, description, color, due }) });
    if (!res) return;
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    closeModal('modal-project');
    showToast(id ? 'Project updated!' : 'Project created!', 'success');
    await refreshSidebarProjects();
    if (currentPage === 'dashboard') await renderDashboard();
    if (currentPage === 'projects') await renderProjectsPage();
    if (currentPage === 'project-detail') await renderProjectDetail(currentProjectId);
  } catch(e) { showToast(e.message, 'error'); }
}

async function editProject(id) {
  const res = await apiFetch('/api/projects/' + id);
  if (!res) return;
  const p = await res.json();
  document.getElementById('project-edit-id').value = p.id;
  document.getElementById('project-modal-title').textContent = 'Edit Project';
  document.getElementById('project-name').value = p.name;
  document.getElementById('project-desc-input').value = p.description || '';
  document.getElementById('project-color').value = p.color || '#7c6af7';
  document.getElementById('project-due').value = p.due_date || '';
  openModal('modal-project');
}

function editCurrentProject() {
  if (currentProjectId) editProject(currentProjectId);
}

async function deleteProject(id) {
  if (!confirm('Are you sure you want to delete this project? All tasks in it will be deleted.')) return;
  const res = await apiFetch('/api/projects/' + id, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) { const e = await res.json(); showToast(e.error, 'error'); return; }
  showToast('Project deleted', 'success');
  await refreshSidebarProjects();
  if (currentPage === 'project-detail') await navigate('projects');
  else if (currentPage === 'projects') await renderProjectsPage();
  else if (currentPage === 'dashboard') await renderDashboard();
}

// ══════════════════════════════════════════════════
//  CRUD — TASKS
// ══════════════════════════════════════════════════

async function saveTask() {
  const id = document.getElementById('task-edit-id').value;
  const title = document.getElementById('task-title-input').value.trim();
  const description = document.getElementById('task-desc-input').value.trim();
  const projectId = document.getElementById('task-project-select').value;
  const assigneeId = document.getElementById('task-assignee-select').value;
  const priority = document.getElementById('task-priority').value;
  const status = document.getElementById('task-status-select').value;
  const due = document.getElementById('task-due-input').value;
  if (!title) { showToast('Task title is required', 'error'); return; }
  try {
    const url = id ? '/api/tasks/' + id : '/api/tasks';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body: JSON.stringify({ title, description, projectId, assigneeId, priority, status, due }) });
    if (!res) return;
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    closeModal('modal-task');
    showToast(id ? 'Task updated!' : 'Task created!', 'success');
    if (currentPage === 'dashboard') await renderDashboard();
    if (currentPage === 'tasks') await renderTasksPage();
    if (currentPage === 'project-detail') await renderProjectDetail(currentProjectId);
    await updateTaskCount();
  } catch(e) { showToast(e.message, 'error'); }
}

async function openTaskDetail(taskId) {
  const [res, commentsRes] = await Promise.all([
    apiFetch('/api/tasks/' + taskId),
    apiFetch('/api/tasks/' + taskId + '/comments')
  ]);
  if (!res || !commentsRes) return;
  const t = await res.json();
  const comments = await commentsRes.json();
  const p = cachedProjects.find(p=>p.id===t.project_id);
  const assignee = cachedMembers.find(u=>u.id===t.assignee_id);
  const od = isOverdue(t.due_date) && t.status !== 'done';
  const canEdit = currentUser.role === 'admin' || t.created_by === currentUser.id || t.assignee_id === currentUser.id;
  const taskLabels = Array.isArray(t.labels) ? t.labels : [];
  currentTaskDetailId = taskId;

  document.getElementById('task-detail-title').textContent = t.title;
  document.getElementById('task-detail-body').innerHTML = `
    <div style="padding:0 4px;">
      ${t.description ? `<p style="color:var(--text2);font-size:0.85rem;margin-bottom:16px;">${escapeHtml(t.description)}</p>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.82rem;">
        <div><span style="color:var(--text3);">Status</span>
          <div style="margin-top:4px;">
            <select data-task-status-id="${safeIdAttribute(t.id)}" style="padding:6px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:0.8rem;" ${!canEdit?'disabled':''}>
              <option value="todo" ${t.status==='todo'?'selected':''}>To Do</option>
              <option value="inprogress" ${t.status==='inprogress'?'selected':''}>In Progress</option>
              <option value="done" ${t.status==='done'?'selected':''}>Done</option>
            </select>
          </div>
        </div>
        <div><span style="color:var(--text3);">Priority</span><div style="margin-top:4px;"><span class="badge ${priorityBadgeClass(t.priority)}">${escapeHtml(t.priority)}</span></div></div>
        <div><span style="color:var(--text3);">Project</span><div style="margin-top:4px;">${p ? escapeHtml(p.name) : '—'}</div></div>
        <div><span style="color:var(--text3);">Assignee</span><div style="margin-top:4px;">${assignee ? escapeHtml(assignee.name) : 'Unassigned'}</div></div>
        <div><span style="color:var(--text3);">Due Date</span><div style="margin-top:4px;${od?'color:var(--red);':''}">${fmtDate(t.due_date)}${od?' (overdue)':''}</div></div>
      </div>
      <div class="task-detail-section">
        <div class="section-title">Labels</div>
        <div class="label-chip-list">${renderLabelChips(taskLabels) || '<span class="muted-text">No labels</span>'}</div>
        ${canEdit ? `<div class="label-select-list">${cachedLabels.map(label => `
          <label class="label-option">
            <input type="checkbox" data-task-label-id="${safeIdAttribute(label.id)}" ${taskLabels.some(taskLabel => taskLabel.id === label.id) ? 'checked' : ''} />
            <span class="label-chip" style="background:${safeLabelColor(label.color)};">${escapeHtml(label.name)}</span>
          </label>
        `).join('') || '<span class="muted-text">Create labels in Settings.</span>'}</div>
        <button class="btn btn-secondary btn-sm" data-action="save-task-labels" data-task-id="${safeIdAttribute(taskId)}">Save Labels</button>` : ''}
      </div>
      <div class="task-detail-section">
        <div class="section-title">Comments</div>
        <div class="comment-list">${comments.length ? comments.map(comment => {
          const canEditComment = comment.author_id === currentUser.id;
          const canDeleteComment = canEditComment || currentUser.role === 'admin';
          return `<div class="comment-item">
            <div class="comment-meta"><span>${escapeHtml(comment.author_name || 'Deleted user')}</span><span>${timeAgo(comment.created_at)}</span></div>
            <div class="comment-body" data-comment-body-id="${safeIdAttribute(comment.id)}">${escapeHtml(comment.body)}</div>
            ${(canEditComment || canDeleteComment) ? `<div class="comment-actions">
              ${canEditComment ? `<button class="btn btn-ghost btn-sm" data-action="edit-comment" data-comment-id="${safeIdAttribute(comment.id)}" data-task-id="${safeIdAttribute(taskId)}">Edit</button>` : ''}
              ${canDeleteComment ? `<button class="btn btn-danger btn-sm" data-action="delete-comment" data-comment-id="${safeIdAttribute(comment.id)}" data-task-id="${safeIdAttribute(taskId)}">Delete</button>` : ''}
            </div>` : ''}
          </div>`;
        }).join('') : '<p class="muted-text">No comments yet.</p>'}</div>
        <textarea id="new-comment-body" class="comment-input" maxlength="2000" placeholder="Add a comment..."></textarea>
        <button class="btn btn-primary btn-sm" data-action="add-comment" data-task-id="${safeIdAttribute(taskId)}">Add Comment</button>
      </div>
    </div>
  `;
  document.getElementById('task-detail-footer').innerHTML = canEdit ? `
    <button class="btn btn-ghost" data-action="edit-task" data-task-id="${safeIdAttribute(t.id)}">Edit</button>
    <button class="btn btn-danger btn-sm" data-action="delete-task" data-task-id="${safeIdAttribute(t.id)}">Delete</button>
  ` : '';
  openModal('modal-task-detail');
}

async function saveTaskLabels(taskId) {
  const labelIds = [...document.querySelectorAll('[data-task-label-id]:checked')]
    .map(input => input.dataset.taskLabelId)
    .filter(isValidUuid);
  const res = await apiFetch('/api/tasks/' + taskId + '/labels', {
    method: 'PUT',
    body: JSON.stringify({ labelIds })
  });
  if (!res) return;
  if (!res.ok) { const error = await res.json(); showToast(error.error, 'error'); return; }
  showToast('Labels updated', 'success');
  await openTaskDetail(taskId);
  if (currentPage === 'dashboard') await renderDashboard();
  if (currentPage === 'tasks') await renderTasksPage();
  if (currentPage === 'project-detail') await renderProjectDetail(currentProjectId);
}

async function addComment(taskId) {
  const input = document.getElementById('new-comment-body');
  const body = input ? input.value : '';
  const res = await apiFetch('/api/tasks/' + taskId + '/comments', {
    method: 'POST',
    body: JSON.stringify({ body })
  });
  if (!res) return;
  if (!res.ok) { const error = await res.json(); showToast(error.error, 'error'); return; }
  await openTaskDetail(taskId);
}

async function editComment(commentId, taskId) {
  const bodyElement = document.querySelector(`[data-comment-body-id="${safeIdAttribute(commentId)}"]`);
  const body = bodyElement ? prompt('Edit comment', bodyElement.textContent) : null;
  if (body === null) return;
  const res = await apiFetch('/api/comments/' + commentId, {
    method: 'PUT',
    body: JSON.stringify({ body })
  });
  if (!res) return;
  if (!res.ok) { const error = await res.json(); showToast(error.error, 'error'); return; }
  await openTaskDetail(taskId);
}

async function deleteComment(commentId, taskId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  const res = await apiFetch('/api/comments/' + commentId, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) { const error = await res.json(); showToast(error.error, 'error'); return; }
  await openTaskDetail(taskId);
}

async function createLabel() {
  const nameInput = document.getElementById('label-name');
  const colorInput = document.getElementById('label-color');
  const name = nameInput ? nameInput.value.trim() : '';
  const color = colorInput ? colorInput.value : '';
  if (!name) { showToast('Label name is required', 'error'); return; }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) { showToast('Label color must be a six-digit hex color', 'error'); return; }
  const res = await apiFetch('/api/labels', {
    method: 'POST',
    body: JSON.stringify({ name, color })
  });
  if (!res) return;
  if (!res.ok) { const error = await res.json(); showToast(error.error, 'error'); return; }
  if (nameInput) nameInput.value = '';
  await fetchLabels();
}

async function deleteLabel(labelId) {
  if (!confirm('Are you sure you want to delete this label?')) return;
  const res = await apiFetch('/api/labels/' + labelId, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) { const error = await res.json(); showToast(error.error, 'error'); return; }
  await fetchLabels();
  const taskDetailModal = document.getElementById('modal-task-detail');
  if (currentTaskDetailId && taskDetailModal && taskDetailModal.classList.contains('open')) {
    await openTaskDetail(currentTaskDetailId);
  }
}

async function editTask(taskId) {
  closeModal('modal-task-detail');
  const res = await apiFetch('/api/tasks/' + taskId);
  if (!res) return;
  const t = await res.json();
  document.getElementById('task-edit-id').value = t.id;
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  openModal('modal-task');
  document.getElementById('task-title-input').value = t.title;
  document.getElementById('task-desc-input').value = t.description || '';
  document.getElementById('task-project-select').value = t.project_id;
  document.getElementById('task-assignee-select').value = t.assignee_id || '';
  document.getElementById('task-priority').value = t.priority;
  document.getElementById('task-status-select').value = t.status;
  document.getElementById('task-due-input').value = t.due_date || '';
}

async function deleteTask(id) {
  if (!confirm('Are you sure you want to delete this task?')) return;
  const res = await apiFetch('/api/tasks/' + id, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) { const e = await res.json(); showToast(e.error, 'error'); return; }
  closeModal('modal-task-detail');
  showToast('Task deleted', 'success');
  if (currentPage === 'dashboard') await renderDashboard();
  if (currentPage === 'tasks') await renderTasksPage();
  if (currentPage === 'project-detail') await renderProjectDetail(currentProjectId);
  await updateTaskCount();
}

async function quickUpdateStatus(taskId, newStatus) {
  const res = await apiFetch('/api/tasks/' + taskId + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
  if (!res) return;
  if (!res.ok) { const e = await res.json(); showToast(e.error, 'error'); return; }
  if (currentPage === 'dashboard') await renderDashboard();
  if (currentPage === 'tasks') await renderTasksPage();
  if (currentPage === 'project-detail') await renderProjectDetail(currentProjectId);
  await updateTaskCount();
}

// ══════════════════════════════════════════════════
//  CRUD — MEMBERS
// ══════════════════════════════════════════════════

async function inviteMember() {
  const name = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();
  const role = document.getElementById('invite-role').value;
  const password = document.getElementById('invite-password').value;
  if (!name || !email) { showToast('Name and email are required', 'error'); return; }
  try {
    const res = await apiFetch('/api/members', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
    if (!res) return;
    if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
    const data = await res.json();
    closeModal('modal-invite');
    document.getElementById('invite-name').value = '';
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-password').value = '';
    if (data.temporaryPassword) {
      document.getElementById('temp-password-value').value = data.temporaryPassword;
      openModal('modal-temp-password');
    } else {
      showToast('Member added!', 'success');
    }
    await fetchMembers();
    if (currentPage === 'team') await renderTeamPage();
  } catch(e) { showToast(e.message, 'error'); }
}

async function copyTemporaryPassword() {
  const value = document.getElementById('temp-password-value').value.trim();
  try {
    await navigator.clipboard.writeText(value);
    showToast('Temporary password copied to clipboard.', 'success');
  } catch (error) {
    showToast('Temporary password ready to copy manually.', 'info');
  }
}

async function toggleRole(userId) {
  const member = cachedMembers.find(m => m.id === userId);
  if (!member) return;
  const newRole = member.role === 'admin' ? 'member' : 'admin';
  const res = await apiFetch('/api/members/' + userId + '/role', { method: 'PUT', body: JSON.stringify({ role: newRole }) });
  if (!res) return;
  if (!res.ok) { const e = await res.json(); showToast(e.error, 'error'); return; }
  showToast('Role updated', 'success');
  await fetchMembers();
  if (currentPage === 'team') await renderTeamPage();
}

async function deleteMember(userId) {
  if (!confirm('Are you sure you want to remove this member?')) return;
  const res = await apiFetch('/api/members/' + userId, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) { const e = await res.json(); showToast(e.error, 'error'); return; }
  showToast('Member removed', 'success');
  await fetchMembers();
  if (currentPage === 'team') await renderTeamPage();
}

// ══════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════

function saveSettings() { showToast('Settings saved', 'success'); }

document.getElementById('change-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-new-password').value;
  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res) return;
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Unable to update password');
    document.getElementById('change-password-form').reset();
    showToast(result.message, 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
});

function resetAllData() {
  showToast('Reset is not available in production mode', 'error');
}

// ══════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════

function showToast(msg, type='info') {
  const container = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<div class="toast-dot"></div><span>${escapeHtml(msg)}</span>`;
  container.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(20px)'; t.style.transition='all 0.3s'; setTimeout(()=>t.remove(), 300); }, 3000);
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target===o) closeModal(o.id); });
});

// Keyboard support
document.addEventListener('keydown', e => {
  if(e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>closeModal(m.id));
  if(e.key==='Enter') {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    if(loginForm && !loginForm.classList.contains('hidden')) {
      if(document.activeElement.id==='login-email'||document.activeElement.id==='login-password') doLogin();
    }
    if(signupForm && !signupForm.classList.contains('hidden')) {
      if(document.activeElement.id==='signup-name'||document.activeElement.id==='signup-email'||document.activeElement.id==='signup-password') doSignup();
    }
  }
});

// ══════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════

(async function() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const res = await apiFetch('/api/auth/me');
      if (res && res.ok) {
        currentUser = await res.json();
        await initApp();
      }
    } catch(e) {
      showToast('Unable to restore your session. Please try again.', 'error');
    }
  }
})();
