import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CanvasNode, Viewport } from "../types";
import {
  deleteProjectDocument,
  loadProjectDocument,
  loadProjectIndex,
  saveProjectDocument,
  saveProjectIndex,
  type ProjectIndex,
  type ProjectSummary,
} from "./projectStore";
import { createCanvasDocument, parseCanvasDocument, type CanvasDocument } from "./serialization";
import { hasSameContent } from "./useCanvasHistory";

const AUTOSAVE_DELAY_MS = 400;
export const DEFAULT_PROJECT_TITLE = "Untitled project";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Options {
  getSnapshot: () => { nodes: CanvasNode[]; viewport: Viewport };
  applyDocument: (document: CanvasDocument) => void;
  isRequestInFlight: (nodeId: string) => boolean;
  onError: (message: string) => void;
}

// Owns the project list and which project's canvas is loaded, and keeps
// the open canvas autosaved. The canvas itself (nodes, viewport, history)
// stays in CanvasChat; this hook reads it through `getSnapshot` and swaps
// it through `applyDocument`.
export function useProjects(options: Options) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [index, setIndex] = useState<ProjectIndex>({ projects: [], lastOpenedProjectId: null });
  const indexRef = useRef(index);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingContentChangeRef = useRef(false);
  const lastSavedNodesRef = useRef<CanvasNode[]>([]);

  const reportError = useCallback((prefix: string, error: unknown) => {
    optionsRef.current.onError(`${prefix}: ${errorMessage(error)}`);
  }, []);

  const persistIndex = useCallback(
    (nextIndex: ProjectIndex) => {
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      saveProjectIndex(nextIndex).catch((error) => reportError("Couldn't save the project list", error));
    },
    [reportError],
  );

  const touchProject = useCallback(
    (projectId: string, patch: Partial<ProjectSummary> = {}) => {
      persistIndex({
        ...indexRef.current,
        projects: indexRef.current.projects.map((project) =>
          project.id === projectId ? { ...project, ...patch, updatedAt: Date.now() } : project,
        ),
      });
    },
    [persistIndex],
  );

  const saveCurrentNow = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const projectId = currentProjectIdRef.current;
    if (!projectId) return;
    const { nodes, viewport } = optionsRef.current.getSnapshot();
    const hadContentChange = hasPendingContentChangeRef.current;
    hasPendingContentChangeRef.current = false;
    lastSavedNodesRef.current = nodes;
    try {
      await saveProjectDocument(projectId, createCanvasDocument(nodes, viewport));
      if (hadContentChange) touchProject(projectId);
    } catch (error) {
      reportError("Couldn't save the canvas", error);
    }
  }, [reportError, touchProject]);

  const scheduleSave = useCallback(() => {
    if (!currentProjectIdRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void saveCurrentNow(), AUTOSAVE_DELAY_MS);
  }, [saveCurrentNow]);

  // Called on every node-state change; only real content edits (not
  // selection or measurement churn) schedule a save and bump "updated".
  const notifyNodesChanged = useCallback(
    (nodes: CanvasNode[]) => {
      if (hasSameContent(lastSavedNodesRef.current, nodes)) return;
      hasPendingContentChangeRef.current = true;
      scheduleSave();
    },
    [scheduleSave],
  );

  const loadAndApply = useCallback(async (projectId: string) => {
    const rawDocument = await loadProjectDocument(projectId);
    const document = rawDocument
      ? parseCanvasDocument(rawDocument, { isRequestInFlight: optionsRef.current.isRequestInFlight })
      : createCanvasDocument([], null);
    lastSavedNodesRef.current = document.nodes;
    hasPendingContentChangeRef.current = false;
    optionsRef.current.applyDocument(document);
  }, []);

  const switchTo = useCallback(
    async (projectId: string) => {
      await loadAndApply(projectId);
      currentProjectIdRef.current = projectId;
      setCurrentProjectId(projectId);
    },
    [loadAndApply],
  );

  const openProject = useCallback(
    async (projectId: string) => {
      if (projectId === currentProjectIdRef.current) return;
      await saveCurrentNow();
      try {
        await switchTo(projectId);
        persistIndex({ ...indexRef.current, lastOpenedProjectId: projectId });
      } catch (error) {
        reportError("Couldn't open that project", error);
      }
    },
    [persistIndex, reportError, saveCurrentNow, switchTo],
  );

  const createProject = useCallback(
    async (title: string, workingFolder: string | null) => {
      await saveCurrentNow();
      const now = Date.now();
      const project: ProjectSummary = {
        id: crypto.randomUUID(),
        title,
        createdAt: now,
        updatedAt: now,
        workingFolder,
      };
      try {
        await saveProjectDocument(project.id, createCanvasDocument([], null));
        persistIndex({
          projects: [project, ...indexRef.current.projects],
          lastOpenedProjectId: project.id,
        });
        await switchTo(project.id);
      } catch (error) {
        reportError("Couldn't create the project", error);
      }
    },
    [persistIndex, reportError, saveCurrentNow, switchTo],
  );

  const renameProject = useCallback(
    (projectId: string, title: string) => touchProject(projectId, { title }),
    [touchProject],
  );

  const setWorkingFolder = useCallback(
    (projectId: string, workingFolder: string | null) => touchProject(projectId, { workingFolder }),
    [touchProject],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      const isCurrent = projectId === currentProjectIdRef.current;
      if (isCurrent) {
        // Drop the pending autosave and detach first, so nothing writes
        // the deleted project's file back into existence afterwards.
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        currentProjectIdRef.current = null;
      }
      try {
        await deleteProjectDocument(projectId);
      } catch (error) {
        reportError("Couldn't delete the project file", error);
      }
      const remainingProjects = indexRef.current.projects.filter((project) => project.id !== projectId);
      persistIndex({ ...indexRef.current, projects: remainingProjects });
      if (!isCurrent) return;
      const [mostRecent] = [...remainingProjects].sort((first, second) => second.updatedAt - first.updatedAt);
      if (mostRecent) await openProject(mostRecent.id);
      else await createProject(DEFAULT_PROJECT_TITLE, null);
    },
    [createProject, openProject, persistIndex, reportError],
  );

  // Writes an AI reply into a project that isn't the one currently open
  // (the user switched away while it was generating).
  const updateStoredNode = useCallback(
    async (projectId: string, nodeId: string, patchData: (node: CanvasNode) => CanvasNode["data"]) => {
      try {
        const rawDocument = await loadProjectDocument(projectId);
        if (!rawDocument) return;
        const document = parseCanvasDocument(rawDocument, { isRequestInFlight: () => true });
        const nodes = document.nodes.map((node) =>
          node.id === nodeId ? ({ ...node, data: patchData(node) } as CanvasNode) : node,
        );
        await saveProjectDocument(projectId, createCanvasDocument(nodes, document.viewport));
        touchProject(projectId);
      } catch (error) {
        reportError("Couldn't save a reply to its project", error);
      }
    },
    [reportError, touchProject],
  );

  // React's dev-mode double-invoked effects would otherwise create two
  // default projects on a first launch.
  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    void (async () => {
      try {
        const loadedIndex = await loadProjectIndex();
        indexRef.current = loadedIndex;
        setIndex(loadedIndex);
        const [mostRecent] = [...loadedIndex.projects].sort((first, second) => second.updatedAt - first.updatedAt);
        const projectToOpen =
          loadedIndex.projects.find((project) => project.id === loadedIndex.lastOpenedProjectId) ?? mostRecent;
        if (projectToOpen) {
          await switchTo(projectToOpen.id);
        } else {
          await createProject(DEFAULT_PROJECT_TITLE, null);
        }
      } catch (error) {
        reportError("Couldn't load your projects", error);
      } finally {
        setIsReady(true);
      }
    })();
  }, [createProject, reportError, switchTo]);

  // Flush the pending autosave before the window goes away.
  useEffect(() => {
    const flushOnUnload = () => void saveCurrentNow();
    window.addEventListener("beforeunload", flushOnUnload);
    let removeCloseListener: (() => void) | undefined;
    let isDisposed = false;
    if (isTauri()) {
      getCurrentWindow()
        .onCloseRequested(async () => {
          await saveCurrentNow();
        })
        .then((unlisten) => {
          if (isDisposed) unlisten();
          else removeCloseListener = unlisten;
        })
        .catch(() => {});
    }
    return () => {
      isDisposed = true;
      window.removeEventListener("beforeunload", flushOnUnload);
      removeCloseListener?.();
    };
  }, [saveCurrentNow]);

  const currentProject = index.projects.find((project) => project.id === currentProjectId) ?? null;

  return {
    projects: index.projects,
    currentProject,
    currentProjectId,
    currentProjectIdRef,
    isReady,
    openProject,
    createProject,
    renameProject,
    setWorkingFolder,
    deleteProject,
    notifyNodesChanged,
    scheduleSave,
    saveCurrentNow,
    updateStoredNode,
  };
}
