import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";

const OBJECT_URL_REVOKE_DELAY_MS = 10_000;

export interface FileTypeFilter {
  name: string;
  extensions: string[];
  mimeType: string;
}

interface SaveFileOptions {
  suggestedName: string;
  filter: FileTypeFilter;
  contents: string | Uint8Array<ArrayBuffer>;
}

// Native save dialog in the desktop app (the chosen path is added to the fs
// scope by the dialog plugin); a regular download in a plain browser.
// Resolves false when the user cancels.
export async function saveFile({ suggestedName, filter, contents }: SaveFileOptions): Promise<boolean> {
  if (isTauri()) {
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: filter.name, extensions: filter.extensions }],
    });
    if (!path) return false;
    if (typeof contents === "string") await writeTextFile(path, contents);
    else await writeFile(path, contents);
    return true;
  }
  const url = URL.createObjectURL(new Blob([contents], { type: filter.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
  return true;
}

export async function openTextFile(filter: FileTypeFilter): Promise<{ name: string; contents: string } | null> {
  if (isTauri()) {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: filter.name, extensions: filter.extensions }],
    });
    if (typeof path !== "string") return null;
    return { name: path.split(/[\\/]/).pop() ?? path, contents: await readTextFile(path) };
  }
  const [file] = await pickFiles({ accept: filter.extensions.map((extension) => `.${extension}`).join(","), multiple: false });
  if (!file) return null;
  return { name: file.name, contents: await file.text() };
}

// A plain file input works in both the WebView and a browser, and hands
// back File objects directly — simplest for binary content like images.
export function pickFiles({ accept, multiple }: { accept: string; multiple: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.click();
  });
}

export function canPickDirectory(): boolean {
  return isTauri();
}

export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const path = await open({ directory: true, multiple: false });
  return typeof path === "string" ? path : null;
}
