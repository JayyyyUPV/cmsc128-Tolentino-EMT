document.addEventListener("DOMContentLoaded", () => {
  const taskList = document.getElementById("taskList");
  const taskForm = document.getElementById("taskForm");
  const sortBy = document.getElementById("sortBy");
  const showCompleted = document.getElementById("showCompleted");
  const modal = document.getElementById("taskModal");
  const openModalBtn = document.getElementById("openModalBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const listSelect = document.getElementById("listSelect");
  const createListBtn = document.getElementById("createListBtn");
  const shareListBtn = document.getElementById("shareListBtn");
  const shareModal = document.getElementById("shareModal");
  const closeShareModal = document.getElementById("closeShareModal");
  const shareModalTitle = document.getElementById("shareModalTitle");
  const shareMembers = document.getElementById("shareMembers");
  const shareEmpty = document.getElementById("shareEmpty");
  const shareUsername = document.getElementById("shareUsername");
  const shareForm = document.getElementById("shareForm");
  const createListModal = document.getElementById("createListModal");
  const closeCreateListModal = document.getElementById("closeCreateListModal");
  const createListForm = document.getElementById("createListForm");
  const createListName = document.getElementById("createListName");

  let tasks = [];
  let editingTaskId = null;
  let currentListId = null; // null = Personal; number = collab list id
  let lists = [];
  let listMeta = new Map(); // id -> { is_owner, name }

  // Helpers
  function priorityValue(priority) {
    return priority === "High" ? 3 : priority === "Mid" ? 2 : 1;
  }
  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d) ? null : d;
  }
  function formatDateMMDDYYYY(value) {
    const d = parseDate(value);
    if (!d) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  }
  function formatDateTimeMMDDYYYY(value) {
    const d = parseDate(value);
    if (!d) return "";
    const mmddyyyy = formatDateMMDDYYYY(value);
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${mmddyyyy} ${hh}:${min}`;
  }
  function openModal() { modal.style.display = "block"; }
  function closeModal() { modal.style.display = "none"; editingTaskId = null; taskForm.reset(); }
  // Shared modal alert (non-blocking system dialog replacement)
  function showCustomAlert(message, options = {}) {
    const modalEl = document.getElementById('customAlert');
    const msg = document.getElementById('customAlertMsg');
    const okBtn = document.getElementById('customAlertOk');
    const cancelBtn = document.getElementById('customAlertCancel');
    msg.textContent = message;
    modalEl.style.display = 'flex';
    cancelBtn.style.display = options.confirm ? '' : 'none';
    okBtn.onclick = cancelBtn.onclick = null;
    return new Promise((resolve) => {
      okBtn.onclick = () => { modalEl.style.display = 'none'; resolve(true); };
      cancelBtn.onclick = () => { modalEl.style.display = 'none'; resolve(false); };
    });
  }

  // API Helpers
  async function apiGet(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
    return res.json();
  }
  async function apiJSON(url, method, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) {
      const ct = res.headers.get('Content-Type') || '';
      const msg = ct.includes('application/json') ? (await res.json()).error || res.statusText : res.statusText;
      throw new Error(msg);
    }
    const ct = res.headers.get('Content-Type') || '';
    return ct.includes('application/json') ? res.json() : {};
  }

  // Lists
  //load em lists
  async function loadLists() {
    try {
      const data = await apiGet('/lists');
      lists = data || [];
    } catch (_) {
      lists = [];
    }
    renderListOptions();
  }
  function renderListOptions() {
    listSelect.innerHTML = '';
    const optPersonal = document.createElement('option');
    optPersonal.value = '';
    optPersonal.textContent = 'Personal';
    listSelect.appendChild(optPersonal);
    listMeta.clear();
    for (const l of lists) {
      const opt = document.createElement('option');
      opt.value = String(l.id);
      opt.textContent = l.name;
      listSelect.appendChild(opt);
      listMeta.set(l.id, { is_owner: !!l.is_owner, name: l.name });
    }
    // Keep current selection if possible
    if (currentListId && lists.find(x => x.id === currentListId)) {
      listSelect.value = String(currentListId);
    } else {
      currentListId = null;
      listSelect.value = '';
    }
    updateShareButtonState();
  }
  function updateShareButtonState() {
    if (!currentListId) {
      shareListBtn.disabled = true;
      return;
    }
    const meta = listMeta.get(currentListId) || { is_owner: false };
    shareListBtn.disabled = !meta.is_owner;
  }

  // Tasks
  async function loadTasks() {
    try {
      const url = currentListId ? `/tasks?list_id=${currentListId}` : '/tasks';
      const data = await apiGet(url);
      tasks = (data || []).map(t => ({ ...t, done: t.done ? Boolean(t.done) : Boolean(t.done) }));
      renderTasks();
    } catch (err) {
      console.error(err);
      await showCustomAlert('Failed to load tasks.');
    }
  }
  function renderTasks() {
    taskList.innerHTML = '';
    let filtered = tasks.filter(t => showCompleted.checked || !t.done);
    filtered.sort((a, b) => {
      if (sortBy.value === 'dueDate') {
        const da = parseDate(a.dueDate);
        const db = parseDate(b.dueDate);
        return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
      }
      if (sortBy.value === 'priority') return priorityValue(b.priority) - priorityValue(a.priority);
      const ca = parseDate(a.createdAt);
      const cb = parseDate(b.createdAt);
      return (ca ? ca.getTime() : 0) - (cb ? cb.getTime() : 0);
    });
    for (const task of filtered) {
      const li = document.createElement('li');
      li.classList.add(`priority-${task.priority}`);
      if (task.done) li.classList.add('done');
      li.innerHTML = `
        <div style="flex: 1">
          <strong>${task.title}</strong>
          <div class="meta-block">Due: ${formatDateMMDDYYYY(task.dueDate)} ${task.dueTime || ''} | Priority: ${task.priority}</div>
          <div class="desc">${task.description || ''}</div>
          <div class="date-created">Created: ${formatDateTimeMMDDYYYY(task.createdAt)}</div>
        </div>
        <div>
          <input type="checkbox" class="checkbox-done" ${task.done ? 'checked' : ''}>
          <button class="btn btn-edit">Edit</button>
          <button class="btn btn-delete">Delete</button>
        </div>
      `;
      li.querySelector('.checkbox-done').addEventListener('change', async (e) => {
        try {
          await apiJSON(`/tasks/${task.id}`, 'PATCH', { done: e.target.checked ? 1 : 0 });
          task.done = e.target.checked;
          renderTasks();
        } catch (err) {
          console.error(err);
          await showCustomAlert('Failed to update task.');
        }
      });
      li.querySelector('.btn-edit').addEventListener('click', () => {
        editingTaskId = task.id;
        document.getElementById('title').value = task.title || '';
        document.getElementById('description').value = task.description || '';
        document.getElementById('dueDate').value = task.dueDate || '';
        document.getElementById('dueTime').value = task.dueTime || '';
        document.getElementById('priority').value = task.priority || 'Low';
        openModal();
      });
      li.querySelector('.btn-delete').addEventListener('click', async () => {
        const ok = await showCustomAlert(`Delete "${task.title}"?`, { confirm: true });
        if (!ok) return;
        try {
          await apiJSON(`/tasks/${task.id}`, 'DELETE');
          await loadTasks();
        } catch (err) {
          console.error(err);
          await showCustomAlert('Failed to delete task.');
        }
      });
      taskList.appendChild(li);
    }
  }

  // Form submit
  taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('title').value,
      description: document.getElementById('description').value,
      dueDate: document.getElementById('dueDate').value,
      dueTime: document.getElementById('dueTime').value,
      priority: document.getElementById('priority').value,
    };
    if (currentListId) payload.list_id = currentListId;
    try {
      if (editingTaskId) {
        await apiJSON(`/tasks/${editingTaskId}`, 'PATCH', payload);
      } else {
        await apiJSON('/tasks', 'POST', payload);
      }
      closeModal();
      await loadTasks();
    } catch (err) {
      console.error(err);
      await showCustomAlert('Failed to save task.');
    }
  });

  // Modal controls
  openModalBtn.addEventListener('click', () => { editingTaskId = null; taskForm.reset(); openModal(); });
  closeModalBtn.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
    if (e.target === shareModal) closeShareModalFn();
    if (e.target === createListModal) closeCreateListModalFn();
  });

  // List switching
  listSelect.addEventListener('change', async () => {
    currentListId = listSelect.value ? parseInt(listSelect.value, 10) : null;
    updateShareButtonState();
    await loadTasks();
  });

  // Create list (modal)
  createListBtn.addEventListener('click', () => {
    openCreateListModal();
  });
  closeCreateListModal.addEventListener('click', closeCreateListModalFn);
  createListForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = createListName.value.trim();
    if (!name) return;
    try {
      const res = await apiJSON('/lists', 'POST', { name });
      await loadLists();
      currentListId = res.id;
      listSelect.value = String(currentListId);
      updateShareButtonState();
      await loadTasks();
      closeCreateListModalFn();
    } catch (err) {
      console.error(err);
      await showCustomAlert('Failed to create list.');
    }
  });

  // Re-render when sort or checkbox changes
  sortBy.addEventListener('change', renderTasks);
  showCompleted.addEventListener('change', renderTasks);

  // Init
  (async function init() {
    await loadLists();
    await loadTasks();
  })();

  // --- Sharing modal ---
  function openShareModal() {
    shareModal.style.display = "block";
  }
  function closeShareModalFn() {
    shareModal.style.display = "none";
    shareUsername.value = '';
    shareMembers.innerHTML = '';
  }
  function openCreateListModal() {
    createListModal.style.display = "block";
    createListName.focus();
  }
  function closeCreateListModalFn() {
    createListModal.style.display = "none";
    createListName.value = '';
  }
  async function loadMembers(listId) {
    const data = await apiGet(`/lists/${listId}/members`);
    return data || [];
  }
  function renderMembers(members, isOwner) {
    shareMembers.innerHTML = '';
    if (!members.length) {
      shareEmpty.style.display = '';
      return;
    }
    shareEmpty.style.display = 'none';
    for (const m of members) {
      const li = document.createElement('li');
      const isListOwner = m.is_owner === 1 || m.is_owner === true;
      li.innerHTML = `
        <div>
          <strong>${m.username}</strong>
          ${isListOwner ? '<span class="share-pill">Owner</span>' : ''}
        </div>
      `;
      if (isOwner && !isListOwner) {
        const btn = document.createElement('button');
        btn.textContent = 'Remove';
        btn.className = 'btn btn-delete';
        btn.addEventListener('click', async () => {
          const ok = await showCustomAlert(`Remove ${m.username} from this list?`, { confirm: true });
          if (!ok) return;
          try {
            await apiJSON(`/lists/${currentListId}/members/${m.user_id}`, 'DELETE');
            await refreshShareModal();
          } catch (err) {
            console.error(err);
            await showCustomAlert('Failed to remove user.');
          }
        });
        li.appendChild(btn);
      }
      shareMembers.appendChild(li);
    }
  }
  async function refreshShareModal() {
    if (!currentListId) return;
    const meta = listMeta.get(currentListId) || {};
    shareModalTitle.textContent = meta.name ? meta.name : 'List';
    try {
      const members = await loadMembers(currentListId);
      renderMembers(members, meta.is_owner);
    } catch (err) {
      console.error(err);
      await showCustomAlert('Failed to load members.');
    }
  }

  shareListBtn.addEventListener('click', async () => {
    if (!currentListId) return;
    await refreshShareModal();
    openShareModal();
  });
  closeShareModal.addEventListener('click', closeShareModalFn);
  window.addEventListener('click', (e) => { if (e.target === shareModal) closeShareModalFn(); });
  shareForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentListId) return;
    const username = shareUsername.value.trim();
    if (!username) return;
    try {
      await apiJSON(`/lists/${currentListId}/members`, 'POST', { username });
      shareUsername.value = '';
      await refreshShareModal();
    } catch (err) {
      console.error(err);
      await showCustomAlert('Failed to add user.');
    }
  });
});
