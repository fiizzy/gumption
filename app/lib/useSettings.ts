import { useCallback, useEffect, useState } from "react";
import type { ResponseStyle } from "../types";

export type { ResponseStyle };
export type ChatStyle = "standard" | "terminal";
export const GRID_COLUMN_OPTIONS = [3, 4, 5] as const;
export type GridColumns = (typeof GRID_COLUMN_OPTIONS)[number] | null;

export interface Settings {
  chatStyle: ChatStyle;
  stackThreads: boolean;
  // null = chats stay where they are placed.
  gridColumns: GridColumns;
  responseStyle: ResponseStyle;
}

export const DEFAULT_SETTINGS: Settings = {
  chatStyle: "standard",
  stackThreads: false,
  gridColumns: null,
  responseStyle: "concise",
};

const SETTINGS_STORAGE_KEY = "canvas-chat:settings";

function readStoredSettings(): Settings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}") as Partial<Settings>;
    return {
      chatStyle: stored.chatStyle === "terminal" ? "terminal" : "standard",
      stackThreads: stored.stackThreads === true,
      gridColumns: GRID_COLUMN_OPTIONS.find((option) => option === stored.gridColumns) ?? null,
      responseStyle: stored.responseStyle === "detailed" ? "detailed" : "concise",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// App-wide preferences (not per project). Read after mount so the static
// export's server render and the first client render agree; written on
// change rather than from an effect, so the defaults can never overwrite
// stored values before they've been read.
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(readStoredSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Preferences are a convenience; nothing to do if storage is unavailable.
      }
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
