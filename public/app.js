// ══════════════════════════════════════════════════
//  API CLIENT
// ══════════════════════════════════════════════════
function getToken(){ return localStorage.getItem('pp_token'); }
function setToken(t){ localStorage.setItem('pp_token', t); }
function clearToken(){ localStorage.removeItem('pp_token'); localStorage.removeItem('pp_user'); }

async function api(method, path, body){
  const opts = { method, headers:{'Content-Type':'application/json'} };
  const tok = getToken();
  if(tok) opts.headers['Authorization'] = 'Bearer '+tok;
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch('/api'+path, opts);
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Request failed');
  return data;
}

// ── In-memory cache ──
let _projects=[], _tasks=[], _users=[], _activity=[];
function mapTask(t){ return {...t, projectId:t.project_id, assigneeId:t.assignee_id, due:t.due_date?t.due_date.slice(0,10):null}; }

async function refreshCache(){
  const [projects,tasks,users,activity] = await Promise.all([
    api('GET','/projects'), api('GET','/tasks'),
    api('GET','/users'),    api('GET','/activity')
  ]);
  _projects = projects;
  _tasks    = tasks.map(mapTask);
  _users    = users;
  _activity = activity;
}

// ── Helpers ──
function fmtDate(d){ if(!d) return '—'; return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function isOverdue(due){ if(!due) return false; const d=new Date(due+'T23:59:59'); return d < new Date() && d.toDateString()!==new Date().toDateString(); }
function initials(name){ return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }
const COLORS=['#7c6af7','#2dd98f','#f5a623','#f05252','#38bdf8','#fb923c','#ec4899','#14b8a6'];
function avatarColor(name){ let h=0; for(let c of name||'A') h=(h*31+c.charCodeAt(0))%COLORS.length; return COLORS[h]; }
function timeAgo(iso){ const diff=(Date.now()-new Date(iso).getTime())/1000; if(diff<60) return 'Just now'; if(diff<3600) return Math.floor(diff/60)+'m ago'; if(diff<86400) return Math.floor(diff/3600)+'h ago'; return Math.floor(diff/86400)+'d ago'; }

// ── State ──
let currentUser=null, currentPage='dashboard', currentProjectId=null, taskFilter='all';

// ══════════════════════════════════════════════════
//  AUTH UI
// ══════════════════════════════════════════════════
function switchAuthTab(tab){
  document.getElementById('tab-login').classList.toggle('active',tab==='login');
  document.getElementById('tab-signup').classList.toggle('active',tab==='signup');
  document.getElementById('login-form').classList.toggle('hidden',tab!=='login');
  document.getElementById('signup-form').classList.toggle('hidden',tab!=='signup');
  document.getElementById('auth-headline-login').classList.toggle('hidden',tab!=='login');
  document.getElementById('auth-headline-signup').classList.toggle('hidden',tab!=='signup');
  document.getElementById('auth-error').classList.remove('show');
}
function showAuthError(msg){ const el=document.getElementById('auth-error'); el.textContent=msg; el.classList.add('show'); }

async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-password').value;
  try {
    const {token,user} = await api('POST','/auth/login',{email,password:pass});
    setToken(token);
    currentUser=user;
    await refreshCache();
    initApp();
  } catch(e){ showAuthError(e.message); }
}

async function doSignup(){
  const name=document.getElementById('signup-name').value.trim();
  const email=document.getElementById('signup-email').value.trim();
  const pass=document.getElementById('signup-password').value;
  const role=document.getElementById('signup-role').value;
  try {
    const {token,user} = await api('POST','/auth/register',{name,email,password:pass,role});
    setToken(token);
    currentUser=user;
    await refreshCache();
    initApp();
    showToast('Account created successfully!','success');
  } catch(e){ showAuthError(e.message); }
}

function doLogout(){
  clearToken();
  currentUser=null;
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('app-screen').classList.remove('visible');
  document.body.classList.remove('is-admin');
}

// ══════════════════════════════════════════════════
//  APP INIT
// ══════════════════════════════════════════════════
function initApp(){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-screen').classList.add('visible');
  document.body.classList.toggle('is-admin', currentUser.role==='admin');
  const av=document.getElementById('sidebar-avatar');
  av.textContent=initials(currentUser.name);
  av.style.background=avatarColor(currentUser.name);
  document.getElementById('sidebar-username').textContent=currentUser.name;
  document.getElementById('sidebar-userrole').textContent=currentUser.role==='admin'?'Admin':'Member';
  const h=new Date().getHours();
  const g=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  document.getElementById('dash-greeting').textContent=g+', '+currentUser.name.split(' ')[0];
  refreshSidebarProjects();
  navigate('dashboard');
}

function refreshSidebarProjects(){
  const el=document.getElementById('sidebar-projects');
  el.innerHTML=_projects.map(p=>`
    <div class="project-nav-item ${currentProjectId===p.id?'active':''}" onclick="navigateToProject('${p.id}')">
      <div class="project-dot" style="background:${p.color}"></div>
      <div class="project-nav-name">${p.name}</div>
    </div>`).join('')||'<div style="padding:6px 14px;font-size:0.75rem;color:var(--text3);">No projects yet</div>';
}

// ══════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════
async function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  currentPage=page;
  const el=document.getElementById('page-'+page); if(el) el.classList.add('active');
  const nav=document.getElementById('nav-'+page); if(nav) nav.classList.add('active');
  await refreshCache();
  refreshSidebarProjects();
  if(page==='dashboard')  renderDashboard();
  if(page==='tasks')      renderTasksPage();
  if(page==='projects')   renderProjectsPage();
  if(page==='team')       renderTeamPage();
  updateTaskCount();
}

async function navigateToProject(id){
  currentProjectId=id;
  await refreshCache();
  refreshSidebarProjects();
  renderProjectDetail(id);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-project-detail').classList.add('active');
  currentPage='project-detail';
  updateTaskCount();
}

function updateTaskCount(){
  const n=_tasks.filter(t=>t.assigneeId===currentUser.id&&t.status!=='done').length;
  document.getElementById('my-task-count').textContent=n;
}

// ══════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════
function renderDashboard(){
  const tasks=_tasks, projects=_projects;
  const myTasks=tasks.filter(t=>t.assigneeId===currentUser.id);
  const overdue=tasks.filter(t=>isOverdue(t.due)&&t.status!=='done');
  const done=tasks.filter(t=>t.status==='done');
  const inprog=tasks.filter(t=>t.status==='inprogress');

  document.getElementById('dash-stats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total Projects</div><div class="stat-value stat-accent">${projects.length}</div><div class="stat-sub">Active workspaces</div></div>
    <div class="stat-card"><div class="stat-label">All Tasks</div><div class="stat-value">${tasks.length}</div><div class="stat-sub">${inprog.length} in progress</div></div>
    <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value stat-green">${done.length}</div><div class="stat-sub">${tasks.length>0?Math.round(done.length/tasks.length*100):0}% done rate</div></div>
    <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value stat-red">${overdue.length}</div><div class="stat-sub">Need attention</div></div>
    <div class="stat-card"><div class="stat-label">My Tasks</div><div class="stat-value stat-blue">${myTasks.length}</div><div class="stat-sub">${myTasks.filter(t=>t.status!=='done').length} pending</div></div>`;

  document.getElementById('dash-progress').innerHTML=projects.map(p=>{
    const pt=tasks.filter(t=>t.projectId===p.id);
    const pd=pt.filter(t=>t.status==='done').length;
    const pct=pt.length>0?Math.round(pd/pt.length*100):0;
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:7px;"><div style="width:9px;height:9px;border-radius:50%;background:${p.color};flex-shrink:0;"></div><span style="font-size:0.85rem;font-weight:500;">${p.name}</span></div>
        <span style="font-family:'Space Mono',monospace;font-size:0.72rem;color:var(--text2);">${pct}%</span>
      </div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%;background:${p.color};"></div></div>
      <div style="font-size:0.72rem;color:var(--text3);margin-top:3px;">${pd}/${pt.length} tasks &nbsp;·&nbsp; Due ${fmtDate(p.due_date)}</div>
    </div>`;
  }).join('')||'<div class="empty-state"><p>No projects yet</p></div>';

  document.getElementById('dash-activity').innerHTML=_activity.slice(0,8).map(a=>`
    <div class="activity-item">
      <div class="activity-dot-wrap"><div class="activity-dot" style="background:var(--accent);"></div></div>
      <div class="activity-content"><div class="activity-text">${a.text}</div><div class="activity-time">${timeAgo(a.created_at)}</div></div>
    </div>`).join('')||'<p style="color:var(--text3);font-size:0.82rem;padding:10px 4px;">No activity yet</p>';

  document.getElementById('overdue-count-badge').textContent=overdue.length+' task'+(overdue.length!==1?'s':'');
  document.getElementById('dash-overdue').innerHTML=overdue.length?`
    <div class="table-wrap"><table>
      <thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Due</th><th>Priority</th></tr></thead>
      <tbody>${overdue.map(t=>{
        const p=_projects.find(x=>x.id===t.projectId);
        const u=_users.find(x=>x.id===t.assigneeId);
        return `<tr style="cursor:pointer;" onclick="openTaskDetail('${t.id}')">
          <td><span style="font-weight:500;">${t.title}</span></td>
          <td><span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${p?p.color:'#666'};display:inline-block;"></span>${p?p.name:'—'}</span></td>
          <td>${u?`<span style="display:flex;align-items:center;gap:5px;"><span class="mini-avatar" style="background:${avatarColor(u.name)}">${initials(u.name)}</span>${u.name}</span>`:'—'}</td>
          <td><span class="badge badge-overdue">${fmtDate(t.due)}</span></td>
          <td><span class="badge badge-${t.priority}">${t.priority}</span></td>
        </tr>`;
      }).join('')}</tbody></table></div>`
  :'<div class="empty-state" style="padding:28px;"><p style="color:var(--green);font-size:0.85rem;">No overdue tasks. Great work!</p></div>';
}

// --------------------------------------------------
//  TASKS PAGE
// --------------------------------------------------
function setTaskFilter(f,el){
  taskFilter=f;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderTasksPage();
}
function renderTasksPage(){
  let tasks=_tasks.filter(t=>t.assigneeId===currentUser.id);
  const search=document.getElementById('task-search').value.toLowerCase();
  if(search) tasks=tasks.filter(t=>t.title.toLowerCase().includes(search)||(t.description||'').toLowerCase().includes(search));
  const overdue=tasks.filter(t=>isOverdue(t.due)&&t.status!=='done');
  const todo=tasks.filter(t=>t.status==='todo'&&!isOverdue(t.due));
  const inprog=tasks.filter(t=>t.status==='inprogress'&&!isOverdue(t.due));
  const done=tasks.filter(t=>t.status==='done');
  const adjustedCols=taskFilter==='all'?[
    {label:'To Do',tasks:[...overdue,...todo],color:'var(--text2)'},
    {label:'In Progress',tasks:inprog,color:'var(--blue)'},
    {label:'Done',tasks:done,color:'var(--green)'}
  ]:taskFilter==='overdue'?[{label:'Overdue',tasks:overdue,color:'var(--red)'}]
  :taskFilter==='todo'?[{label:'To Do',tasks:[...overdue,...todo],color:'var(--text2)'}]
  :taskFilter==='inprogress'?[{label:'In Progress',tasks:inprog,color:'var(--blue)'}]
  :[{label:'Done',tasks:done,color:'var(--green)'}];
  document.getElementById('tasks-kanban').innerHTML=adjustedCols.map(col=>`
    <div class="kanban-col">
      <div class="kanban-col-header"><div class="kanban-col-title" style="color:${col.color}">${col.label}</div><div class="kanban-count">${col.tasks.length}</div></div>
      ${col.tasks.length?col.tasks.map(t=>renderTaskCard(t)).join(''):'<div style="color:var(--text3);font-size:0.8rem;padding:12px 0;text-align:center;">Empty</div>'}
    </div>`).join('');
}
function renderTaskCard(t){
  const p=_projects.find(x=>x.id===t.projectId);
  const od=isOverdue(t.due)&&t.status!=='done';
  return `<div class="task-card" onclick="openTaskDetail('${t.id}')">
    <div class="task-card-top"><div class="task-title">${t.title}</div><span class="badge badge-${t.priority}">${t.priority}</span></div>
    <div class="task-card-meta">
      ${p?`<span style="display:flex;align-items:center;gap:5px;font-size:0.73rem;color:var(--text2);"><span style="width:7px;height:7px;border-radius:50%;background:${p.color};display:inline-block;"></span>${p.name}</span>`:''}
      ${t.due?`<span class="task-due ${od?'overdue':''}">${fmtDate(t.due)}${od?' (overdue)':''}</span>`:''}
    </div></div>`;
}

// --------------------------------------------------
//  PROJECTS PAGE
// --------------------------------------------------
function renderProjectsPage(){
  const el=document.getElementById('projects-grid');
  if(!_projects.length){
    el.innerHTML=`<div class="empty-state" style="grid-column:1/-1;"><h3>No projects yet</h3><p>Create your first project to get started</p><button class="btn btn-primary btn-sm admin-only" onclick="openModal('modal-project')">Create Project</button></div>`;
    return;
  }
  el.innerHTML=_projects.map(p=>{
    const pt=_tasks.filter(t=>t.projectId===p.id);
    const done=pt.filter(t=>t.status==='done').length;
    const pct=pt.length?Math.round(done/pt.length*100):0;
    const od=pt.filter(t=>isOverdue(t.due)&&t.status!=='done').length;
    const members=[...new Set(pt.map(t=>t.assigneeId).filter(Boolean))].map(id=>_users.find(u=>u.id===id)).filter(Boolean);
    return `<div class="project-card" onclick="navigateToProject('${p.id}')">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${p.color};border-radius:var(--radius) var(--radius) 0 0;"></div>
      <div class="project-card-header"><div class="project-icon" style="background:${p.color};">${initials(p.name)}</div>
        <div><div class="project-name">${p.name}</div><div style="font-size:0.72rem;color:var(--text3);">Due ${fmtDate(p.due_date)}</div></div>
      </div>
      <div class="project-desc">${p.description||'No description'}</div>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%;background:${p.color};"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:0.73rem;color:var(--text2);">${pct}% complete</span>${od>0?`<span class="badge badge-overdue">${od} overdue</span>`:''}</div>
      <div class="project-stats"><span>${pt.length} tasks</span><span>${done} done</span><span>${pt.filter(t=>t.status==='inprogress').length} in progress</span></div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <div class="member-stack">${members.slice(0,4).map(u=>`<div class="mini-avatar" style="background:${avatarColor(u.name)}" title="${u.name}">${initials(u.name)}</div>`).join('')}</div>
        <div class="td-actions" onclick="event.stopPropagation();">
          <button class="btn btn-ghost btn-sm admin-only" onclick="openEditProject('${p.id}')">Edit</button>
          <button class="btn btn-danger btn-sm admin-only" onclick="deleteProject('${p.id}')">Delete</button>
        </div>
      </div></div>`;
  }).join('');
}

// --------------------------------------------------
//  PROJECT DETAIL
// --------------------------------------------------
function renderProjectDetail(id){
  const p=_projects.find(x=>x.id===id);
  if(!p){ navigate('projects'); return; }
  document.getElementById('detail-project-name').textContent=p.name;
  const tasks=_tasks.filter(t=>t.projectId===id);
  const todo=tasks.filter(t=>t.status==='todo');
  const inp=tasks.filter(t=>t.status==='inprogress');
  const done=tasks.filter(t=>t.status==='done');
  const pct=tasks.length?Math.round(done.length/tasks.length*100):0;
  const overdue=tasks.filter(t=>isOverdue(t.due)&&t.status!=='done');
  document.getElementById('project-detail-content').innerHTML=`
    <div class="stats-grid" style="margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">Progress</div><div class="stat-value stat-accent">${pct}%</div><div class="progress-bar-wrap" style="margin-top:8px;"><div class="progress-bar-fill" style="width:${pct}%;background:${p.color};"></div></div></div>
      <div class="stat-card"><div class="stat-label">Total Tasks</div><div class="stat-value">${tasks.length}</div><div class="stat-sub">${done.length} completed</div></div>
      <div class="stat-card"><div class="stat-label">In Progress</div><div class="stat-value stat-blue">${inp.length}</div></div>
      <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value stat-red">${overdue.length}</div></div>
    </div>
    <div class="kanban-board">${[
      {label:'To Do',tasks:[...overdue.filter(t=>t.status==='todo'),...todo.filter(t=>!isOverdue(t.due))],color:'var(--text2)'},
      {label:'In Progress',tasks:inp,color:'var(--blue)'},
      {label:'Done',tasks:done,color:'var(--green)'}
    ].map(col=>`<div class="kanban-col">
      <div class="kanban-col-header"><div class="kanban-col-title" style="color:${col.color}">${col.label}</div><div class="kanban-count">${col.tasks.length}</div></div>
      ${col.tasks.map(t=>{
        const u=_users.find(x=>x.id===t.assigneeId);
        const od=isOverdue(t.due)&&t.status!=='done';
        return `<div class="task-card" onclick="openTaskDetail('${t.id}')">
          <div class="task-card-top"><div class="task-title">${t.title}</div><span class="badge badge-${t.priority}">${t.priority}</span></div>
          <div class="task-card-meta">${u?`<span class="task-assignee"><span class="mini-avatar" style="background:${avatarColor(u.name)}">${initials(u.name)}</span>${u.name}</span>`:''}${t.due?`<span class="task-due ${od?'overdue':''}">${fmtDate(t.due)}</span>`:''}</div>
        </div>`;
      }).join('')||'<div style="color:var(--text3);font-size:0.8rem;padding:12px 0;text-align:center;">Empty</div>'}
    </div>`).join('')}</div>`;
}
function openTaskModalForProject(){ openModal('modal-task'); if(currentProjectId) setTimeout(()=>document.getElementById('task-project-select').value=currentProjectId,50); }
function editCurrentProject(){ openEditProject(currentProjectId); }

// --------------------------------------------------
//  TEAM PAGE
// --------------------------------------------------
function renderTeamPage(){
  const users=_users, tasks=_tasks;
  document.getElementById('team-count').textContent=users.length+' people';
  document.getElementById('team-list').innerHTML=users.map(u=>{
    const ut=tasks.filter(t=>t.assigneeId===u.id);
    return `<div class="member-row">
      <div class="user-avatar" style="background:${avatarColor(u.name)};width:36px;height:36px;">${initials(u.name)}</div>
      <div class="member-info"><div class="member-name">${u.name}</div><div class="member-email">${u.email}</div></div>
      <span class="badge badge-${u.role}">${u.role}</span>
      <span style="font-size:0.75rem;color:var(--text3);margin-left:8px;">${ut.length} tasks</span>
      ${currentUser.role==='admin'&&u.id!==currentUser.id?`<div class="member-actions">
        <button class="btn btn-ghost btn-sm" onclick="toggleRole('${u.id}')">Toggle Role</button>
        <button class="btn btn-danger btn-sm" onclick="removeMember('${u.id}')">Remove</button>
      </div>`:''}
    </div>`;
  }).join('');
  document.getElementById('team-tasks-dist').innerHTML=users.map(u=>{
    const ut=tasks.filter(t=>t.assigneeId===u.id);
    const done=ut.filter(t=>t.status==='done').length;
    const inp=ut.filter(t=>t.status==='inprogress').length;
    const todo=ut.filter(t=>t.status==='todo').length;
    return `<div style="margin-bottom:18px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
        <div class="mini-avatar" style="background:${avatarColor(u.name)}">${initials(u.name)}</div>
        <span style="font-size:0.85rem;font-weight:500;">${u.name}</span>
        <span style="font-size:0.72rem;color:var(--text3);margin-left:auto;">${ut.length} total</span>
      </div>
      <div style="display:flex;gap:3px;height:8px;border-radius:99px;overflow:hidden;">
        <div style="flex:${done};background:var(--green);min-width:${done>0?'4px':'0'};"></div>
        <div style="flex:${inp};background:var(--blue);min-width:${inp>0?'4px':'0'};"></div>
        <div style="flex:${todo};background:var(--surface3);min-width:${todo>0?'4px':'0'};"></div>
      </div>
      <div style="display:flex;gap:12px;margin-top:5px;">
        <span style="font-size:0.68rem;color:var(--green);">${done} done</span>
        <span style="font-size:0.68rem;color:var(--blue);">${inp} active</span>
        <span style="font-size:0.68rem;color:var(--text3);">${todo} todo</span>
      </div>
    </div>`;
  }).join('');
}

async function toggleRole(uid){
  try{
    const u=await api('PUT','/users/'+uid+'/role');
    await refreshCache();
    renderTeamPage();
    showToast('Role updated','success');
  }catch(e){ showToast(e.message,'error'); }
}
async function removeMember(uid){
  if(!confirm('Remove this member?')) return;
  try{
    await api('DELETE','/users/'+uid);
    await refreshCache();
    renderTeamPage();
    showToast('Member removed','info');
  }catch(e){ showToast(e.message,'error'); }
}
async function inviteMember(){
  const name=document.getElementById('invite-name').value.trim();
  const email=document.getElementById('invite-email').value.trim();
  const role=document.getElementById('invite-role').value;
  const pass=document.getElementById('invite-password').value||'pass123';
  try{
    await api('POST','/auth/register',{name,email,password:pass,role});
    await refreshCache();
    closeModal('modal-invite');
    renderTeamPage();
    showToast(name+' added to team!','success');
    ['invite-name','invite-email','invite-password'].forEach(id=>document.getElementById(id).value='');
  }catch(e){ showToast(e.message,'error'); }
}

// --------------------------------------------------
//  PROJECT CRUD
// --------------------------------------------------
async function saveProject(){
  const name=document.getElementById('project-name').value.trim();
  const description=document.getElementById('project-desc-input').value.trim();
  const color=document.getElementById('project-color').value;
  const due_date=document.getElementById('project-due').value||null;
  const editId=document.getElementById('project-edit-id').value;
  if(!name){ showToast('Project name is required','error'); return; }
  try{
    if(editId){ await api('PUT','/projects/'+editId,{name,description,color,due_date}); }
    else{ await api('POST','/projects',{name,description,color,due_date}); }
    await refreshCache();
    closeModal('modal-project');
    refreshSidebarProjects();
    if(currentPage==='projects') renderProjectsPage();
    renderDashboard();
    showToast(`Project "${name}" ${editId?'updated':'created'}!`,'success');
    document.getElementById('project-name').value='';
    document.getElementById('project-desc-input').value='';
    document.getElementById('project-due').value='';
    document.getElementById('project-edit-id').value='';
    document.getElementById('project-modal-title').textContent='New Project';
  }catch(e){ showToast(e.message,'error'); }
}
function openEditProject(id){
  const p=_projects.find(x=>x.id===id); if(!p) return;
  document.getElementById('project-modal-title').textContent='Edit Project';
  document.getElementById('project-edit-id').value=p.id;
  document.getElementById('project-name').value=p.name;
  document.getElementById('project-desc-input').value=p.description||'';
  document.getElementById('project-color').value=p.color||'#7c6af7';
  document.getElementById('project-due').value=p.due_date?p.due_date.slice(0,10):'';
  openModal('modal-project');
}
async function deleteProject(id){
  if(!confirm('Delete this project and all its tasks?')) return;
  try{
    await api('DELETE','/projects/'+id);
    await refreshCache();
    refreshSidebarProjects();
    if(currentPage==='project-detail') navigate('projects');
    else renderProjectsPage();
    renderDashboard();
    showToast('Project deleted','info');
  }catch(e){ showToast(e.message,'error'); }
}

// --------------------------------------------------
//  TASK CRUD
// --------------------------------------------------
function populateTaskModal(){
  const pSel=document.getElementById('task-project-select');
  pSel.innerHTML='<option value="">-- Select Project --</option>'+_projects.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const aSel=document.getElementById('task-assignee-select');
  aSel.innerHTML='<option value="">-- Unassigned --</option>'+_users.map(u=>`<option value="${u.id}">${u.name} (${u.role})</option>`).join('');
}
function openModal(id){ if(id==='modal-task') populateTaskModal(); document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

async function saveTask(){
  const title=document.getElementById('task-title-input').value.trim();
  const description=document.getElementById('task-desc-input').value.trim();
  const project_id=document.getElementById('task-project-select').value;
  const assignee_id=document.getElementById('task-assignee-select').value||null;
  const priority=document.getElementById('task-priority').value;
  const due_date=document.getElementById('task-due-input').value||null;
  const status=document.getElementById('task-status-select').value;
  const editId=document.getElementById('task-edit-id').value;
  if(!title){ showToast('Task title is required','error'); return; }
  if(!project_id){ showToast('Please select a project','error'); return; }
  try{
    if(editId){ await api('PUT','/tasks/'+editId,{title,description,project_id,assignee_id,priority,status,due_date}); }
    else{ await api('POST','/tasks',{title,description,project_id,assignee_id,priority,status,due_date}); }
    await refreshCache();
    closeModal('modal-task');
    ['task-title-input','task-desc-input','task-due-input','task-edit-id'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('task-modal-title').textContent='New Task';
    document.getElementById('task-status-select').value='todo';
    document.getElementById('task-priority').value='medium';
    if(currentPage==='dashboard') renderDashboard();
    if(currentPage==='tasks') renderTasksPage();
    if(currentPage==='project-detail') renderProjectDetail(currentProjectId);
    updateTaskCount();
    showToast(`Task "${title}" ${editId?'updated':'created'}!`,'success');
  }catch(e){ showToast(e.message,'error'); }
}

function openTaskDetail(id){
  const t=_tasks.find(x=>x.id===id); if(!t) return;
  const p=_projects.find(x=>x.id===t.projectId);
  const u=_users.find(x=>x.id===t.assigneeId);
  const od=isOverdue(t.due)&&t.status!=='done';
  const canEdit=currentUser.role==='admin'||t.assigneeId===currentUser.id||t.created_by===currentUser.id;
  document.getElementById('task-detail-title').textContent=t.title;
  document.getElementById('task-detail-body').innerHTML=`
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <span class="badge badge-${t.status}">${t.status==='inprogress'?'In Progress':t.status==='done'?'Done':'To Do'}</span>
      <span class="badge badge-${t.priority}">${t.priority} priority</span>
      ${od?'<span class="badge badge-overdue">Overdue</span>':''}
    </div>
    ${t.description?`<p style="font-size:0.85rem;color:var(--text2);margin-bottom:16px;line-height:1.6;">${t.description}</p>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.82rem;">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;">
        <div style="color:var(--text3);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Project</div>
        <div style="display:flex;align-items:center;gap:6px;">${p?`<span style="width:9px;height:9px;border-radius:50%;background:${p.color};"></span>${p.name}`:'�'}</div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;">
        <div style="color:var(--text3);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Assignee</div>
        <div style="display:flex;align-items:center;gap:6px;">${u?`<span class="mini-avatar" style="background:${avatarColor(u.name)}">${initials(u.name)}</span>${u.name}`:'Unassigned'}</div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;">
        <div style="color:var(--text3);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Due Date</div>
        <div class="${od?'badge badge-overdue':''}" style="display:inline;">${t.due?fmtDate(t.due):'�'}</div>
      </div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;">
        <div style="color:var(--text3);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:4px;">Created</div>
        ${fmtDate(t.created_at)}
      </div>
    </div>
    ${canEdit?`<div style="margin-top:16px;"><div class="field"><label>Change Status</label>
      <select id="detail-status-select" onchange="quickUpdateStatus('${t.id}',this.value)">
        <option value="todo" ${t.status==='todo'?'selected':''}>To Do</option>
        <option value="inprogress" ${t.status==='inprogress'?'selected':''}>In Progress</option>
        <option value="done" ${t.status==='done'?'selected':''}>Done</option>
      </select></div></div>`:''}`;
  document.getElementById('task-detail-footer').innerHTML=canEdit?`
    <button class="btn btn-danger btn-sm" onclick="deleteTaskFromDetail('${t.id}')">Delete</button>
    <div style="flex:1;"></div>
    <button class="btn btn-ghost" onclick="closeModal('modal-task-detail')">Close</button>
    <button class="btn btn-primary btn-sm" onclick="openEditTask('${t.id}')">Edit Task</button>`
  :`<button class="btn btn-ghost" onclick="closeModal('modal-task-detail')">Close</button>`;
  openModal('modal-task-detail');
}

async function quickUpdateStatus(taskId,status){
  try{
    await api('PATCH','/tasks/'+taskId+'/status',{status});
    await refreshCache();
    closeModal('modal-task-detail');
    if(currentPage==='dashboard') renderDashboard();
    if(currentPage==='tasks') renderTasksPage();
    if(currentPage==='project-detail') renderProjectDetail(currentProjectId);
    updateTaskCount();
    showToast('Status updated','success');
  }catch(e){ showToast(e.message,'error'); }
}

function openEditTask(id){
  const t=_tasks.find(x=>x.id===id); if(!t) return;
  closeModal('modal-task-detail');
  populateTaskModal();
  document.getElementById('task-modal-title').textContent='Edit Task';
  document.getElementById('task-edit-id').value=t.id;
  document.getElementById('task-title-input').value=t.title;
  document.getElementById('task-desc-input').value=t.description||'';
  document.getElementById('task-priority').value=t.priority;
  document.getElementById('task-due-input').value=t.due||'';
  document.getElementById('task-status-select').value=t.status;
  setTimeout(()=>{ document.getElementById('task-project-select').value=t.projectId||''; document.getElementById('task-assignee-select').value=t.assigneeId||''; },50);
  openModal('modal-task');
}

async function deleteTaskFromDetail(id){
  const t=_tasks.find(x=>x.id===id);
  if(!confirm('Delete this task?')) return;
  try{
    await api('DELETE','/tasks/'+id);
    await refreshCache();
    closeModal('modal-task-detail');
    if(currentPage==='dashboard') renderDashboard();
    if(currentPage==='tasks') renderTasksPage();
    if(currentPage==='project-detail') renderProjectDetail(currentProjectId);
    updateTaskCount();
    showToast('Task deleted','info');
  }catch(e){ showToast(e.message,'error'); }
}

// --------------------------------------------------
//  SETTINGS
// --------------------------------------------------
function saveSettings(){ showToast('Settings saved','success'); }
function resetAllData(){ if(!confirm('Reset all data?')) return; clearToken(); location.reload(); }

// --------------------------------------------------
//  TOAST
// --------------------------------------------------
function showToast(msg,type='info'){
  const container=document.getElementById('toast-container');
  const t=document.createElement('div');
  t.className=`toast toast-${type}`;
  t.innerHTML=`<div class="toast-dot"></div><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateX(20px)'; t.style.transition='all 0.3s'; setTimeout(()=>t.remove(),300); },3000);
}

// --------------------------------------------------
//  BOOT
// --------------------------------------------------
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{ if(e.target===o) closeModal(o.id); });
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') document.querySelectorAll('.modal-overlay.open').forEach(m=>closeModal(m.id));
  if(e.key==='Enter'&&!document.getElementById('login-form').classList.contains('hidden')){
    if(document.activeElement.id==='login-email'||document.activeElement.id==='login-password') doLogin();
  }
});

(async function boot(){
  const tok=getToken();
  if(tok){
    try{
      await refreshCache();
      const me=await api('GET','/users').then(users=>{
        const saved=JSON.parse(localStorage.getItem('pp_me')||'null');
        return saved?_users.find(u=>u.id===saved.id)||null:null;
      });
      // re-decode user from token
      const payload=JSON.parse(atob(tok.split('.')[1]));
      currentUser=_users.find(u=>u.id===payload.id)||null;
      if(currentUser){ initApp(); return; }
    }catch(e){ clearToken(); }
  }
})();
