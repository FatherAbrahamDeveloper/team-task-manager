
const STORAGE_KEY = "taskflow-tasks-v1";

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

let tasks = loadTasks();
let editingId = null;

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (!Array.isArray(saved)) {
      return [];
    }

    return saved.filter((task) =>
      task &&
      typeof task.id === "string" &&
      typeof task.title === "string" &&
      typeof task.completed === "boolean"
    );
  } catch (error) {
    console.error("Could not load saved tasks:", error);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    return true;
  } catch (error) {
    console.error("Could not save tasks:", error);
    alert("Tasks could not be saved in this browser.");
    return false;
  }
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
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

    checkbox.addEventListener("change", () => {
      updateTask(task.id, { completed: checkbox.checked });
    });

    const content = document.createElement("div");
    content.className = "task-content";

    const title = createTextElement("h3", "task-title", task.title);
    content.append(title);

    if (task.description) {
      content.append(
        createTextElement(
          "p",
          "task-description",
          task.description
        )
      );
    }

    const status = task.completed ? "Completed" : "Pending";
    content.append(
      createTextElement("span", "task-meta", status)
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

function updateTask(id, changes) {
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return;

  const previous = tasks[index];
  tasks[index] = { ...previous, ...changes };

  if (!saveTasks()) {
    tasks[index] = previous;
  }

  renderTasks();
}

function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  if (!window.confirm(`Delete "${task.title}"?`)) return;

  const previousTasks = tasks;
  tasks = tasks.filter((item) => item.id !== id);

  if (!saveTasks()) {
    tasks = previousTasks;
    return;
  }

  if (editingId === id) resetForm();
  renderTasks();
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();

  if (!title) {
    titleInput.focus();
    return;
  }

  if (editingId) {
    const index = tasks.findIndex((task) => task.id === editingId);
    if (index === -1) {
      resetForm();
      renderTasks();
      return;
    }

    const previous = tasks[index];

    tasks[index] = {
      ...previous,
      title,
      description
    };

    if (!saveTasks()) {
      tasks[index] = previous;
      return;
    }
  } else {
    const newTask = {
      id: createId(),
      title,
      description,
      completed: false,
      createdAt: new Date().toISOString()
    };

    tasks.unshift(newTask);

    if (!saveTasks()) {
      tasks = tasks.filter((task) => task.id !== newTask.id);
      return;
    }
  }

  resetForm();
  renderTasks();
});

cancelEditButton.addEventListener("click", resetForm);
taskFilter.addEventListener("change", renderTasks);

renderTasks();
