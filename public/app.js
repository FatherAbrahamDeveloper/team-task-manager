const taskForm = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const taskList = document.querySelector("#task-list");
const taskFilter = document.querySelector("#task-filter");

const totalCount = document.querySelector("#total-count");
const pendingCount = document.querySelector("#pending-count");
const completedCount = document.querySelector("#completed-count");

const formHeading = document.querySelector("#form-heading");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit");
const taskSubtitle = document.querySelector("#task-subtitle");

let tasks = [];
let editingId = null;
let loading = false;

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function showError(message) {
  alert(message);
}

function setLoading(value) {
  loading = value;
  submitButton.disabled = value;
  submitButton.textContent = value
    ? "Please wait..."
    : editingId
      ? "Save changes"
      : "+ Add task";
}

async function loadTasks() {
  try {
    taskList.replaceChildren(
      createTextElement("div", "empty-state", "Loading tasks...")
    );

    tasks = await apiRequest("/api/tasks");
    renderTasks();
  } catch (error) {
    console.error(error);
    taskList.replaceChildren(
      createTextElement(
        "div",
        "empty-state",
        "Could not load tasks. Check that the backend server is running."
      )
    );
    showError(error.message);
  }
}

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function updateSummary() {
  totalCount.textContent = tasks.length;
  completedCount.textContent = tasks.filter(
    (task) => task.completed
  ).length;

  pendingCount.textContent = tasks.filter(
    (task) => !task.completed
  ).length;
}

function renderTasks() {
  updateSummary();
  taskList.replaceChildren();

  const filter = taskFilter.value;

  const visibleTasks = tasks.filter((task) => {
    if (filter === "pending") return !task.completed;
    if (filter === "completed") return task.completed;
    return true;
  });

  taskSubtitle.textContent =
    `${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"} shown`;

  if (visibleTasks.length === 0) {
    const message = filter === "pending"
      ? "You have no pending tasks."
      : filter === "completed"
        ? "You have not completed any tasks yet."
        : "No tasks yet. Add your first task above.";

    taskList.append(
      createTextElement("div", "empty-state", message)
    );
    return;
  }

  visibleTasks.forEach((task) => {
    const card = document.createElement("article");
    card.className = `task-card${task.completed ? " is-completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `Complete ${task.title}`);

    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;

      try {
        const updated = await apiRequest(
          `/api/tasks/${encodeURIComponent(task.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ completed: checkbox.checked })
          }
        );

        replaceTask(updated);
        renderTasks();
      } catch (error) {
        checkbox.checked = task.completed;
        checkbox.disabled = false;
        showError(error.message);
      }
    });

    const content = document.createElement("div");
    content.className = "task-content";

    content.append(
      createTextElement("h3", "task-title", task.title)
    );

    if (task.description) {
      content.append(
        createTextElement(
          "p",
          "task-description",
          task.description
        )
      );
    }

    content.append(
      createTextElement(
        "span",
        "task-meta",
        task.completed ? "Completed" : "Pending"
      )
    );

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editButton = createTextElement(
      "button", "small-button", "Edit"
    );
    editButton.type = "button";
    editButton.addEventListener("click", () => startEditing(task.id));

    const deleteButton = createTextElement(
      "button", "small-button delete", "Delete"
    );
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    actions.append(editButton, deleteButton);
    card.append(checkbox, content, actions);
    taskList.append(card);
  });
}

function replaceTask(updatedTask) {
  tasks = tasks.map((task) =>
    task.id === updatedTask.id ? updatedTask : task
  );
}

function resetForm() {
  editingId = null;
  taskForm.reset();
  formHeading.textContent = "Add a new task";
  submitButton.textContent = "+ Add task";
  cancelEditButton.classList.add("hidden");
}

function startEditing(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  editingId = id;
  titleInput.value = task.title;
  descriptionInput.value = task.description || "";

  formHeading.textContent = "Edit task";
  submitButton.textContent = "Save changes";
  cancelEditButton.classList.remove("hidden");

  titleInput.focus();
  document.querySelector(".panel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  if (!window.confirm(`Delete "${task.title}"?`)) return;

  try {
    await apiRequest(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    tasks = tasks.filter((item) => item.id !== id);

    if (editingId === id) resetForm();

    renderTasks();
  } catch (error) {
    showError(error.message);
  }
}

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (loading) return;

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();

  if (!title) {
    titleInput.focus();
    return;
  }

  setLoading(true);

  try {
    if (editingId) {
      const updated = await apiRequest(
        `/api/tasks/${encodeURIComponent(editingId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title, description })
        }
      );

      replaceTask(updated);
    } else {
      const created = await apiRequest("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title, description })
      });

      tasks.unshift(created);
    }

    resetForm();
    renderTasks();
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

cancelEditButton.addEventListener("click", resetForm);
taskFilter.addEventListener("change", renderTasks);

loadTasks();
