document.addEventListener("DOMContentLoaded", () => {
  const taskList = document.getElementById("taskList");
  const taskForm = document.getElementById("taskForm");
  const sortBy = document.getElementById("sortBy");
  const showCompleted = document.getElementById("showCompleted");
  const modal = document.getElementById("taskModal");
  const openModalBtn = document.getElementById("openModalBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const toast = document.getElementById("toast");
  const undoBtn = document.getElementById("undoBtn");

  let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
  let deletedTask = null;

  // Save tasks to localStorage
  function saveTasks() {
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }

  // Render tasks
  function renderTasks() {
    taskList.innerHTML = "";
    let filteredTasks = tasks.filter(task => showCompleted.checked || !task.done);

    filteredTasks.sort((a, b) => {
      if (sortBy.value === "dueDate") return new Date(a.dueDate) - new Date(b.dueDate);
      if (sortBy.value === "priority") return priorityValue(b.priority) - priorityValue(a.priority);
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    filteredTasks.forEach((task, index) => {
      const li = document.createElement("li");
      li.classList.add(`priority-${task.priority}`);
      if (task.done) li.classList.add("done");

      li.innerHTML = `
        <div style="flex: 1">
          <strong>${task.title}</strong>
          <div class="meta-block">
            Due: ${task.dueDate} ${task.dueTime} | Priority: ${task.priority}
          </div>
          <div class="desc">${task.description}</div>
          <div class="date-created">Created: ${new Date(task.createdAt).toLocaleString()}</div>
        </div>
        <div>
          <input type="checkbox" class="checkbox-done" ${task.done ? "checked" : ""}>
          <button class="btn btn-edit">Edit</button>
          <button class="btn btn-delete">Delete</button>
        </div>
      `;

      // Checkbox toggle
      li.querySelector(".checkbox-done").addEventListener("change", () => {
        task.done = !task.done;
        saveTasks();
        renderTasks();
      });

      // Edit button
      li.querySelector(".btn-edit").addEventListener("click", () => {
        document.getElementById("title").value = task.title;
        document.getElementById("description").value = task.description;
        document.getElementById("dueDate").value = task.dueDate;
        document.getElementById("dueTime").value = task.dueTime;
        document.getElementById("priority").value = task.priority;

        tasks.splice(index, 1);
        saveTasks();
        renderTasks();
        openModal();
      });

      // Delete button
      li.querySelector(".btn-delete").addEventListener("click", () => {
        // Show a confirmation dialog before deleting
        const confirmDelete = confirm(`Are you sure you want to delete "${task.title}"?`);
        if (!confirmDelete) return; // Stop if user clicks "Cancel"

        deletedTask = { task, index };
        tasks.splice(index, 1);
        saveTasks();
        renderTasks();
        showToast();
      });

      taskList.appendChild(li);
    });
  }

  // Priority order
  function priorityValue(priority) {
    return priority === "High" ? 3 : priority === "Mid" ? 2 : 1;
  }

  // Handle form submission
  taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newTask = {
      title: document.getElementById("title").value,
      description: document.getElementById("description").value,
      dueDate: document.getElementById("dueDate").value,
      dueTime: document.getElementById("dueTime").value,
      priority: document.getElementById("priority").value,
      createdAt: new Date().toISOString(),
      done: false
    };
    tasks.push(newTask);
    saveTasks();
    renderTasks();
    taskForm.reset();
    closeModal();
  });

  // Modal controls
  function openModal() { modal.style.display = "block"; }
  function closeModal() { modal.style.display = "none"; }
  openModalBtn.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  window.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // Toast controls
  function showToast() {
    toast.style.display = "block";
    setTimeout(() => toast.style.display = "none", 3000);
  }
  undoBtn.addEventListener("click", () => {
    if (deletedTask) {
      tasks.splice(deletedTask.index, 0, deletedTask.task);
      saveTasks();
      renderTasks();
      deletedTask = null;
      toast.style.display = "none";
    }
  });

  // Re-render when sort or checkbox changes
  sortBy.addEventListener("change", renderTasks);
  showCompleted.addEventListener("change", renderTasks);

  // Initial render
  renderTasks();
});

