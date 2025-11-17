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

  let tasks = [];
  let editingTaskId = null;
  let currentListId = null; // null = Personal; number = collab list id
  let lists = [];
  let listMeta = new Map(); // id -> { is_owner }

  // Helpers
  function priorityValue(priority) {
    return priority === "High" ? 3 : priority === "Mid" ? 2 : 1;
  }
  function openModal() { modal.style.display = "block"; }
  function closeModal() { modal.style.display = "none"; editingTaskId = null; taskForm.reset(); }

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
      listMeta.set(l.id, { is_owner: !!l.is_owner });
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
      alert('Failed to load tasks.');
    }
  }
  function renderTasks() {
    taskList.innerHTML = '';
    let filtered = tasks.filter(t => showCompleted.checked || !t.done);
    filtered.sort((a, b) => {
      if (sortBy.value === 'dueDate') return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
      if (sortBy.value === 'priority') return priorityValue(b.priority) - priorityValue(a.priority);
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    for (const task of filtered) {
      const li = document.createElement('li');
      li.classList.add(`priority-${task.priority}`);
      if (task.done) li.classList.add('done');
      li.innerHTML = `
        <div style="flex: 1">
          <strong>${task.title}</strong>
          <div class="meta-block">Due: ${task.dueDate || ''} ${task.dueTime || ''} | Priority: ${task.priority}</div>
          <div class="desc">${task.description || ''}</div>
          <div class="date-created">Created: ${task.createdAt ? new Date(task.createdAt).toLocaleString() : ''}</div>
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
          alert('Failed to update task.');
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
        if (!confirm(`Delete "${task.title}"?`)) return;
        try {
          await apiJSON(`/tasks/${task.id}`, 'DELETE');
          await loadTasks();
        } catch (err) {
          console.error(err);
          alert('Failed to delete task.');
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
      alert('Failed to save task.');
    }
  });

  // Modal controls
  openModalBtn.addEventListener('click', () => { editingTaskId = null; taskForm.reset(); openModal(); });
  closeModalBtn.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // List switching
  listSelect.addEventListener('change', async () => {
    currentListId = listSelect.value ? parseInt(listSelect.value, 10) : null;
    updateShareButtonState();
    await loadTasks();
  });

  // Create list
  createListBtn.addEventListener('click', async () => {
    const name = prompt('Name your collaborative list:');
    if (!name) return;
    try {
      const res = await apiJSON('/lists', 'POST', { name });
      await loadLists();
      currentListId = res.id;
      listSelect.value = String(currentListId);
      updateShareButtonState();
      await loadTasks();
    } catch (err) {
      console.error(err);
      alert('Failed to create list.');
    }
  });

  // Share list (add member)
  shareListBtn.addEventListener('click', async () => {
    if (!currentListId) return;
    const username = prompt('Enter username to add to this list:');
    if (!username) return;
    try {
      await apiJSON(`/lists/${currentListId}/members`, 'POST', { username });
      alert('User added to list.');
    } catch (err) {
      console.error(err);
      alert('Failed to add user to list.');
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
});
