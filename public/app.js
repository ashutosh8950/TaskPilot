function getToken() { return localStorage.getItem("pp_token"); }
function setToken(token) { localStorage.setItem("pp_token", token); }
function clearToken() {
  localStorage.removeItem("pp_token");
  localStorage.removeItem("pp_me");
}

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;

  const response = await fetch("/api" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

let currentUser = null;
let currentPage = "dashboard";
let currentProjectId = null;
let cached = { projects: [], tasks: [], users: [], activity: [] };

function formatDate(v) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString();
}

function isOverdue(dateStr, status) {
  if (!dateStr || status === "done") return false;
  const d = new Date(dateStr + "T23:59:59");
  return d.getTime() < Date.now();
}

function normalizeTask(t) {
  return {
    ...t,
    projectId: t.project_id,
    assigneeId: t.assignee_id,
    due: t.due_date,
  };
}

async function refreshCache() {
  const [projects, tasks, users, activity] = await Promise.all([
    api("GET", "/projects"),
    api("GET", "/tasks"),
    api("GET", "/users"),
    api("GET", "/activity"),
  ]);
  cached.projects = projects;
  cached.tasks = tasks.map(normalizeTask);
  cached.users = users;
  cached.activity = activity;
}

function showToast(message, type) {
  const container = document.getElementById("toast-container");
  if (!container) return alert(message);
  const toast = document.createElement("div");
  toast.className = "toast toast-" + (type || "info");
  toast.innerHTML = "<div class='toast-dot'></div><span>" + message + "</span>";
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function switchAuthTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
  document.getElementById("login-form").classList.toggle("hidden", tab !== "login");
  document.getElementById("signup-form").classList.toggle("hidden", tab !== "signup");
  document.getElementById("auth-headline-login").classList.toggle("hidden", tab !== "login");
  document.getElementById("auth-headline-signup").classList.toggle("hidden", tab !== "signup");
}

function showAuthError(message) {
  const el = document.getElementById("auth-error");
  el.textContent = message;
  el.classList.add("show");
}

async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    const result = await api("POST", "/auth/login", { email, password });
    setToken(result.token);
    localStorage.setItem("pp_me", JSON.stringify(result.user));
    currentUser = result.user;
    await refreshCache();
    initApp();
  } catch (err) {
    showAuthError(err.message);
  }
}

async function doSignup() {
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const role = document.getElementById("signup-role").value;
  try {
    const result = await api("POST", "/auth/register", { name, email, password, role });
    setToken(result.token);
    localStorage.setItem("pp_me", JSON.stringify(result.user));
    currentUser = result.user;
    await refreshCache();
    initApp();
  } catch (err) {
    showAuthError(err.message);
  }
}

function doLogout() {
  clearToken();
  currentUser = null;
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app-screen").classList.remove("visible");
  document.body.classList.remove("is-admin");
}

function openModal(id) {
  if (id === "modal-task") populateTaskModal();
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function updateSidebar() {
  document.body.classList.toggle("is-admin", currentUser && currentUser.role === "admin");
  document.getElementById("sidebar-username").textContent = currentUser ? currentUser.name : "";
  document.getElementById("sidebar-userrole").textContent = currentUser ? currentUser.role : "";
  document.getElementById("sidebar-avatar").textContent = currentUser ? currentUser.name.slice(0, 2).toUpperCase() : "";
}

function renderDashboard() {
  const tasks = cached.tasks;
  const overdue = tasks.filter((t) => isOverdue(t.due, t.status));
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "inprogress").length;
  const mine = tasks.filter((t) => t.assigneeId === currentUser.id).length;

  document.getElementById("dash-stats").innerHTML =
    "<div class='stat-card'><div class='stat-label'>Projects</div><div class='stat-value'>" + cached.projects.length + "</div></div>" +
    "<div class='stat-card'><div class='stat-label'>Tasks</div><div class='stat-value'>" + tasks.length + "</div><div class='stat-sub'>" + inProgress + " in progress</div></div>" +
    "<div class='stat-card'><div class='stat-label'>Completed</div><div class='stat-value stat-green'>" + done + "</div></div>" +
    "<div class='stat-card'><div class='stat-label'>Overdue</div><div class='stat-value stat-red'>" + overdue.length + "</div></div>" +
    "<div class='stat-card'><div class='stat-label'>My Tasks</div><div class='stat-value stat-blue'>" + mine + "</div></div>";

  document.getElementById("dash-progress").innerHTML = cached.projects.map((p) => {
    const pt = tasks.filter((t) => t.projectId === p.id);
    const pd = pt.filter((t) => t.status === "done").length;
    const pct = pt.length ? Math.round((pd * 100) / pt.length) : 0;
    return "<div style='margin-bottom:12px'><strong>" + p.name + "</strong><div class='progress-bar-wrap'><div class='progress-bar-fill' style='width:" + pct + "%;background:" + (p.color || "#7c6af7") + "'></div></div><small>" + pct + "% complete</small></div>";
  }).join("") || "<p>No projects yet</p>";

  document.getElementById("dash-activity").innerHTML =
    cached.activity.slice(0, 8).map((a) => "<div class='activity-item'><div class='activity-content'><div class='activity-text'>" + a.text + "</div></div></div>").join("") ||
    "<p>No activity yet</p>";

  document.getElementById("overdue-count-badge").textContent = overdue.length + " task(s)";
  document.getElementById("dash-overdue").innerHTML = overdue.length
    ? "<div class='table-wrap'><table><thead><tr><th>Task</th><th>Due</th><th>Status</th></tr></thead><tbody>" +
      overdue.map((t) => "<tr><td>" + t.title + "</td><td>" + formatDate(t.due) + "</td><td>" + t.status + "</td></tr>").join("") +
      "</tbody></table></div>"
    : "<p>No overdue tasks</p>";
}

function renderTasksPage() {
  const mine = cached.tasks.filter((t) => t.assigneeId === currentUser.id);
  const todo = mine.filter((t) => t.status === "todo");
  const inp = mine.filter((t) => t.status === "inprogress");
  const done = mine.filter((t) => t.status === "done");

  function card(t) {
    return "<div class='task-card'><div class='task-title'>" + t.title + "</div><div class='task-card-meta'><span class='badge badge-" + t.priority + "'>" + t.priority + "</span><span>" + formatDate(t.due) + "</span></div></div>";
  }

  document.getElementById("tasks-kanban").innerHTML =
    "<div class='kanban-col'><div class='kanban-col-header'><div class='kanban-col-title'>To Do</div></div>" + todo.map(card).join("") + "</div>" +
    "<div class='kanban-col'><div class='kanban-col-header'><div class='kanban-col-title'>In Progress</div></div>" + inp.map(card).join("") + "</div>" +
    "<div class='kanban-col'><div class='kanban-col-header'><div class='kanban-col-title'>Done</div></div>" + done.map(card).join("") + "</div>";
}

function renderProjectsPage() {
  const html = cached.projects.map((p) => "<div class='project-card'><div class='project-name'>" + p.name + "</div><div class='project-desc'>" + (p.description || "") + "</div><div>Due: " + formatDate(p.due_date) + "</div></div>").join("");
  document.getElementById("projects-grid").innerHTML = html || "<p>No projects yet</p>";
}

function renderTeamPage() {
  document.getElementById("team-count").textContent = cached.users.length + " people";
  document.getElementById("team-list").innerHTML = cached.users.map((u) => "<div class='member-row'><div class='member-info'><div class='member-name'>" + u.name + "</div><div class='member-email'>" + u.email + "</div></div><span class='badge badge-" + u.role + "'>" + u.role + "</span></div>").join("");
  document.getElementById("team-tasks-dist").innerHTML = "";
}

async function navigate(page) {
  currentPage = page;
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  const panel = document.getElementById("page-" + page);
  const nav = document.getElementById("nav-" + page);
  if (panel) panel.classList.add("active");
  if (nav) nav.classList.add("active");
  await refreshCache();
  if (page === "dashboard") renderDashboard();
  if (page === "tasks") renderTasksPage();
  if (page === "projects") renderProjectsPage();
  if (page === "team") renderTeamPage();
}

async function saveProject() {
  const name = document.getElementById("project-name").value.trim();
  const description = document.getElementById("project-desc-input").value.trim();
  const color = document.getElementById("project-color").value;
  const due_date = document.getElementById("project-due").value || null;
  const editId = document.getElementById("project-edit-id").value;
  try {
    if (editId) await api("PUT", "/projects/" + editId, { name, description, color, due_date });
    else await api("POST", "/projects", { name, description, color, due_date });
    closeModal("modal-project");
    await navigate("projects");
    showToast("Project saved", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function populateTaskModal() {
  const p = document.getElementById("task-project-select");
  const a = document.getElementById("task-assignee-select");
  p.innerHTML = "<option value=''>-- Select Project --</option>" + cached.projects.map((x) => "<option value='" + x.id + "'>" + x.name + "</option>").join("");
  a.innerHTML = "<option value=''>-- Unassigned --</option>" + cached.users.map((u) => "<option value='" + u.id + "'>" + u.name + "</option>").join("");
}

async function saveTask() {
  const payload = {
    title: document.getElementById("task-title-input").value.trim(),
    description: document.getElementById("task-desc-input").value.trim(),
    project_id: document.getElementById("task-project-select").value,
    assignee_id: document.getElementById("task-assignee-select").value || null,
    priority: document.getElementById("task-priority").value,
    due_date: document.getElementById("task-due-input").value || null,
    status: document.getElementById("task-status-select").value,
  };
  const editId = document.getElementById("task-edit-id").value;
  try {
    if (editId) await api("PUT", "/tasks/" + editId, payload);
    else await api("POST", "/tasks", payload);
    closeModal("modal-task");
    await navigate("tasks");
    showToast("Task saved", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function initApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").classList.add("visible");
  updateSidebar();
  navigate("dashboard");
}

function setTaskFilter() {}
function navigateToProject(id) { currentProjectId = id; navigate("projects"); }
function renderProjectDetail() {}
function openTaskModalForProject() { openModal("modal-task"); }
function editCurrentProject() {}
function openEditProject() {}
function deleteProject() { showToast("Delete from project list not wired in simplified UI", "info"); }
function openTaskDetail() {}
async function quickUpdateStatus(taskId, status) { await api("PATCH", "/tasks/" + taskId + "/status", { status }); await navigate(currentPage); }
function openEditTask() {}
function deleteTaskFromDetail() {}
async function toggleRole(uid) { await api("PUT", "/users/" + uid + "/role"); await navigate("team"); }
async function removeMember(uid) { await api("DELETE", "/users/" + uid); await navigate("team"); }
async function inviteMember() {
  const name = document.getElementById("invite-name").value.trim();
  const email = document.getElementById("invite-email").value.trim();
  const role = document.getElementById("invite-role").value;
  const password = document.getElementById("invite-password").value || "pass123";
  await api("POST", "/auth/register", { name, email, role, password });
  closeModal("modal-invite");
  await navigate("team");
}
function saveSettings() { showToast("Settings saved", "success"); }
function resetAllData() { clearToken(); location.reload(); }

document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal(overlay.id);
  });
});

(async function boot() {
  const token = getToken();
  if (!token) return;
  try {
    const me = JSON.parse(localStorage.getItem("pp_me") || "null");
    await refreshCache();
    currentUser = me ? cached.users.find((u) => u.id === me.id) : null;
    if (!currentUser) throw new Error("No user");
    initApp();
  } catch (_err) {
    clearToken();
  }
})();
