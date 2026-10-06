import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import type { CanvasDocument } from "./serialization";
import type { FileAccess } from "../types";

const FILE_ACCESS_LEVELS: FileAccess[] = ["ask", "readWrite", "readOnly", "none"];

export interface ProjectSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workingFolder: string | null;
  fileAccess: FileAccess;
}

export interface ProjectIndex {
  projects: ProjectSummary[];
  lastOpenedProjectId: string | null;
}

const PROJECTS_DIRECTORY = "projects";
const INDEX_FILE_NAME = "index.json";
const TEMPORARY_SUFFIX = ".tmp";
const LOCAL_STORAGE_PREFIX = "canvas-chat:";
const SAFE_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+\.json$/;
const APP_DATA = { baseDir: BaseDirectory.AppData };

interface StorageBackend {
  read(fileName: string): Promise<string | null>;
  write(fileName: string, contents: string): Promise<void>;
  remove(fileName: string): Promise<void>;
}

function createTauriBackend(): StorageBackend {
  let directoryReady: Promise<void> | null = null;
  const ensureDirectory = () => {
    directoryReady ??= mkdir(PROJECTS_DIRECTORY, { ...APP_DATA, recursive: true });
    return directoryReady;
  };
  const pathFor = (fileName: string) => `${PROJECTS_DIRECTORY}/${fileName}`;

  return {
    async read(fileName) {
      await ensureDirectory();
      const path = pathFor(fileName);
      if (!(await exists(path, APP_DATA))) return null;
      return readTextFile(path, APP_DATA);
    },
    // Write-then-rename so a crash mid-write can never leave a truncated
    // project file behind — the rename either happens or it doesn't.
    async write(fileName, contents) {
      await ensureDirectory();
      const path = pathFor(fileName);
      const temporaryPath = path + TEMPORARY_SUFFIX;
      await writeTextFile(temporaryPath, contents, APP_DATA);
      await rename(temporaryPath, path, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
    },
    async remove(fileName) {
      await ensureDirectory();
      const path = pathFor(fileName);
      if (await exists(path, APP_DATA)) await remove(path, APP_DATA);
    },
  };
}

// Used when running outside the desktop shell (e.g. `next dev` in a plain
// browser) so the app stays fully usable there.
function createLocalStorageBackend(): StorageBackend {
  const keyFor = (fileName: string) => LOCAL_STORAGE_PREFIX + fileName;
  return {
    async read(fileName) {
      return window.localStorage.getItem(keyFor(fileName));
    },
    async write(fileName, contents) {
      try {
        window.localStorage.setItem(keyFor(fileName), contents);
      } catch {
        throw new Error("Browser storage is full — remove some images or projects, or use the desktop app.");
      }
    },
    async remove(fileName) {
      window.localStorage.removeItem(keyFor(fileName));
    },
  };
}

let backend: StorageBackend | null = null;
function getBackend(): StorageBackend {
  backend ??= isTauri() ? createTauriBackend() : createLocalStorageBackend();
  return backend;
}

// Serializes writes per file — two overlapping autosaves of the same
// project would otherwise race on the shared temporary file.
const pendingWrites = new Map<string, Promise<void>>();
function queueWrite(fileName: string, contents: string): Promise<void> {
  const previous = pendingWrites.get(fileName) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => getBackend().write(fileName, contents));
  pendingWrites.set(fileName, next);
  void next.finally(() => {
    if (pendingWrites.get(fileName) === next) pendingWrites.delete(fileName);
  });
  return next;
}

function documentFileName(projectId: string): string {
  const fileName = `${projectId}.json`;
  if (!SAFE_FILE_NAME_PATTERN.test(fileName)) throw new Error(`Invalid project id: ${projectId}`);
  return fileName;
}

function normalizeIndex(value: unknown): ProjectIndex {
  const empty: ProjectIndex = { projects: [], lastOpenedProjectId: null };
  if (typeof value !== "object" || value === null) return empty;
  const record = value as Record<string, unknown>;
  const projects = Array.isArray(record.projects)
    ? record.projects.flatMap((entry): ProjectSummary[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const project = entry as Record<string, unknown>;
        if (typeof project.id !== "string" || !SAFE_FILE_NAME_PATTERN.test(`${project.id}.json`)) return [];
        const now = Date.now();
        return [
          {
            id: project.id,
            title: typeof project.title === "string" && project.title.trim() ? project.title : "Untitled project",
            createdAt: typeof project.createdAt === "number" ? project.createdAt : now,
            updatedAt: typeof project.updatedAt === "number" ? project.updatedAt : now,
            workingFolder: typeof project.workingFolder === "string" ? project.workingFolder : null,
            fileAccess: FILE_ACCESS_LEVELS.includes(project.fileAccess as FileAccess) ? (project.fileAccess as FileAccess) : "ask",
          },
        ];
      })
    : [];
  const lastOpenedProjectId =
    typeof record.lastOpenedProjectId === "string" ? record.lastOpenedProjectId : null;
  return { projects, lastOpenedProjectId };
}

export async function loadProjectIndex(): Promise<ProjectIndex> {
  const contents = await getBackend().read(INDEX_FILE_NAME);
  if (!contents) return { projects: [], lastOpenedProjectId: null };
  try {
    return normalizeIndex(JSON.parse(contents));
  } catch {
    return { projects: [], lastOpenedProjectId: null };
  }
}

export function saveProjectIndex(index: ProjectIndex): Promise<void> {
  return queueWrite(INDEX_FILE_NAME, JSON.stringify(index));
}

// Returns the raw parsed JSON; callers validate it with parseCanvasDocument.
export async function loadProjectDocument(projectId: string): Promise<unknown | null> {
  const contents = await getBackend().read(documentFileName(projectId));
  if (!contents) return null;
  return JSON.parse(contents);
}

export function saveProjectDocument(projectId: string, document: CanvasDocument): Promise<void> {
  return queueWrite(documentFileName(projectId), JSON.stringify(document));
}

export async function deleteProjectDocument(projectId: string): Promise<void> {
  const fileName = documentFileName(projectId);
  await pendingWrites.get(fileName)?.catch(() => {});
  await getBackend().remove(fileName);
}
