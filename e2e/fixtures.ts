import { test as base, expect, type Page } from "@playwright/test";

export { expect };

export interface Point {
  x: number;
  y: number;
}

export interface RenderedNode {
  id: string;
  type: string;
  selected: boolean;
  rect: { x: number; y: number; w: number; h: number };
  text: string;
  z: number;
}

// Stubs Tauri's IPC so the shell "claude" call returns a canned reply after
// `window.__AI_DELAY` ms. `isTauri()` stays false, so the app persists to
// localStorage — each test gets a fresh browser context, hence fresh storage.
const TAURI_STUB = `
  window.__AI_DELAY = 300;
  window.__AI_CALLS = [];
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: (callback) => { const id = Math.floor(Math.random() * 1e9); window["_" + id] = callback; return id; },
    invoke: async (command, args) => {
      if (command === "plugin:shell|execute") {
        window.__AI_CALLS.push(args);
        await new Promise((resolve) => setTimeout(resolve, window.__AI_DELAY));
        const prompt = args.args[1].split("\\n").pop().slice(0, 60);
        return { code: 0, signal: null, stdout: JSON.stringify({ is_error: false, result: "Mock reply: " + prompt }), stderr: "" };
      }
      throw new Error("not running in Tauri: " + command);
    },
  };
`;

export const test = base.extend<{ canvas: Page }>({
  canvas: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(TAURI_STUB);
    await page.goto("/");
    await page.waitForSelector(".react-flow__pane");
    await expect(page.getByRole("navigation", { name: "Projects" }).locator('[aria-current="page"]')).toBeVisible();
    await use(page);
    expect(pageErrors, "uncaught page errors").toEqual([]);
  },
});

export async function drag(page: Page, from: Point, to: Point, { steps = 12, modifiers = [] as string[] } = {}) {
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

export async function draw(page: Page, toolKey: string, from: Point, to: Point) {
  await page.keyboard.press(toolKey);
  await drag(page, from, to);
}

export function renderedNodes(page: Page): Promise<RenderedNode[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node")).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.id ?? "",
        type: [...element.classList].find((name) => name.startsWith("react-flow__node-"))?.replace("react-flow__node-", "") ?? "",
        selected: element.classList.contains("selected"),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        text: element.innerText,
        z: Number(element.style.zIndex),
      };
    }),
  );
}

export interface StoredNode {
  id: string;
  type: string;
  position: Point;
  zIndex?: number;
  data: Record<string, any>;
}

export interface StoredState {
  index: { projects: { id: string; title: string; workingFolder: string | null }[]; lastOpenedProjectId: string | null };
  documents: Record<string, { nodes: StoredNode[]; viewport: unknown } | null>;
}

export function storedState(page: Page): Promise<StoredState> {
  return page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem("canvas-chat:index.json") ?? "null");
    const documents: Record<string, unknown> = {};
    for (const project of index?.projects ?? []) {
      documents[project.id] = JSON.parse(localStorage.getItem(`canvas-chat:${project.id}.json`) ?? "null");
    }
    return { index, documents } as StoredState;
  });
}

// Autosave is debounced; poll until the open project's saved nodes satisfy `predicate`.
export async function expectSavedNodes(page: Page, predicate: (nodes: StoredNode[]) => boolean, message: string) {
  await expect
    .poll(async () => {
      const state = await storedState(page);
      const document = state.documents[state.index?.lastOpenedProjectId ?? ""];
      return document ? predicate(document.nodes) : false;
    }, { message })
    .toBe(true);
}

export async function savedNodes(page: Page): Promise<StoredNode[]> {
  const state = await storedState(page);
  return state.documents[state.index.lastOpenedProjectId ?? ""]?.nodes ?? [];
}

export async function flowToPage(page: Page, point: Point): Promise<Point> {
  return page.evaluate(({ x, y }) => {
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport")!;
    const [translateX, translateY, zoom] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/
      .exec(viewport.style.transform)!
      .slice(1)
      .map(Number);
    const rect = document.querySelector(".react-flow")!.getBoundingClientRect();
    return { x: rect.left + translateX + x * zoom, y: rect.top + translateY + y * zoom };
  }, point);
}

export function viewportZoom(page: Page): Promise<number> {
  return page.evaluate(() =>
    Number(/scale\(([-\d.]+)\)/.exec(document.querySelector<HTMLElement>(".react-flow__viewport")!.style.transform)![1]),
  );
}

export function stylePanelButton(page: Page, label: string) {
  return page.getByRole("toolbar", { name: "Element style" }).getByRole("button", { name: label, exact: true });
}

// A small PNG generated in the page, for image insert tests.
export async function samplePng(page: Page, width = 960, height = 600): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([canvasWidth, canvasHeight]) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#4dabf7";
      context.fillRect(0, 0, canvasWidth, canvasHeight);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [width, height],
  );
  return Buffer.from(base64, "base64");
}
