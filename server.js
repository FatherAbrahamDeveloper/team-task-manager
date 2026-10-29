
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "tasks.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readTasks() {
  await ensureDataFile();

  const contents = await fs.readFile(DATA_FILE, "utf8");
  const tasks = JSON.parse(contents);

  if (!Array.isArray(tasks)) {
    throw new Error("Task data must be a JSON array.");
  }

  return tasks;
}

async function writeTasks(tasks) {
  await ensureDataFile();

  // Write to a temporary file before replacing the data file.
  const temporaryFile = `${DATA_FILE}.tmp`;

  await fs.writeFile(
    temporaryFile,
    JSON.stringify(tasks, null, 2) + "\n",
    "utf8"
  );

  await fs.rename(temporaryFile, DATA_FILE);
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(data));
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  const maxSize = 100_000;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > maxSize) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");

  if (!text) {
    return {};
  }

  try {
    const data = JSON.parse(text);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      const error = new Error("Request body must be a JSON object.");
      error.statusCode = 400;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.statusCode) throw error;

    const invalidJson = new Error("Invalid JSON request body.");
    invalidJson.statusCode = 400;
    throw invalidJson;
  }
}

function validateTaskFields(body, isNewTask) {
  const result = {};

  if (isNewTask || Object.hasOwn(body, "title")) {
    if (typeof body.title !== "string") {
      return { error: "Title must be a string." };
    }

    const title = body.title.trim();

    if (!title) {
      return { error: "Task title is required." };
    }

    if (title.length > 120) {
      return { error: "Title must be 120 characters or fewer." };
    }

    result.title = title;
  }

  if (isNewTask || Object.hasOwn(body, "description")) {
    if (body.description === undefined && isNewTask) {
      result.description = "";
    } else if (typeof body.description !== "string") {
      return { error: "Description must be a string." };
    } else {
      const description = body.description.trim();

      if (description.length > 500) {
        return { error: "Description must be 500 characters or fewer." };
      }

      result.description = description;
    }
  }

  if (Object.hasOwn(body, "completed")) {
    if (typeof body.completed !== "boolean") {
      return { error: "Completed must be true or false." };
    }

    result.completed = body.completed;
  }

  return { value: result };
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/tasks" && req.method === "GET") {
    const tasks = await readTasks();
    return sendJson(res, 200, tasks);
  }

  if (pathname === "/api/tasks" && req.method === "POST") {
    const body = await readRequestBody(req);
    const validation = validateTaskFields(body, true);

    if (validation.error) {
      return sendJson(res, 400, { error: validation.error });
    }

    const tasks = await readTasks();

    const task = {
      id: crypto.randomUUID(),
      ...validation.value,
      completed: false,
      createdAt: new Date().toISOString()
    };

    tasks.unshift(task);
    await writeTasks(tasks);

    return sendJson(res, 201, task);
  }

  const match = pathname.match(/^\/api\/tasks\/([^/]+)$/);

  if (match) {
    const id = decodeURIComponent(match[1]);
    const tasks = await readTasks();
    const index = tasks.findIndex((task) => task.id === id);

    if (index === -1) {
      return sendJson(res, 404, { error: "Task not found." });
    }

    if (req.method === "PATCH") {
      const body = await readRequestBody(req);
      const validation = validateTaskFields(body, false);

      if (validation.error) {
        return sendJson(res, 400, { error: validation.error });
      }

      if (Object.keys(validation.value).length === 0) {
        return sendJson(res, 400, {
          error: "Provide at least one field to update."
        });
      }

      tasks[index] = {
        ...tasks[index],
        ...validation.value
      };

      await writeTasks(tasks);

      return sendJson(res, 200, tasks[index]);
    }

    if (req.method === "DELETE") {
      const [deletedTask] = tasks.splice(index, 1);
      await writeTasks(tasks);

      return sendJson(res, 200, {
        message: "Task deleted successfully.",
        task: deletedTask
      });
    }
  }

  return sendJson(res, 404, { error: "API endpoint not found." });
}

async function serveStaticFile(res, pathname) {
  // Only expose the public directory, not server.js or data files.
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    res.writeHead(400);
    return res.end("Bad request");
  }

  const filePath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);

  if (
    filePath !== PUBLIC_DIR &&
    !filePath.startsWith(PUBLIC_DIR + path.sep)
  ) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const contents = await fs.readFile(filePath);
    const contentType =
      MIME_TYPES[path.extname(filePath)] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff"
    });

    res.end(contents);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      res.writeHead(404);
      return res.end("File not found");
    }

    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = requestUrl.pathname;

    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end("Method not allowed");
    }

    return await serveStaticFile(res, pathname);
  } catch (error) {
    console.error(error);

    if (res.headersSent) {
      return res.end();
    }

    const statusCode = error.statusCode || 500;

    if (req.url.startsWith("/api/")) {
      return sendJson(res, statusCode, {
        error: statusCode === 500
          ? "An internal server error occurred."
          : error.message
      });
    }

    res.writeHead(statusCode, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    res.end(statusCode === 500 ? "Internal server error" : error.message);
  }
});

server.listen(PORT, () => {
  console.log(`TaskFlow running at http://localhost:${PORT}`);
});
