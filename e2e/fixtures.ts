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

// Stubs Tauri's IPC so the streamed "claude" process replies with canned
// stream-json events (in a few chunks over `window.__AI_DELAY` ms), the way
// the real CLI does. `isTauri()` stays false, so the app persists to
// localStorage — each test gets a fresh browser context, hence fresh storage.
function installTauriStub() {
  type StubWindow = Window & Record<string, unknown> & {
    __AI_DELAY: number;
    __AI_RESULT?: string;
    __AI_CALLS: { program: string; args: string[]; options: unknown; onEvent: { id: number } }[];
  };
  const stubWindow = window as unknown as StubWindow;
  stubWindow.__AI_DELAY = 300;
  stubWindow.__AI_CALLS = [];
  const chunkCount = 4;
  stubWindow.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: (callback: unknown) => {
      const id = Math.floor(Math.random() * 1e9);
      stubWindow[`_${id}`] = callback;
      return id;
    },
    unregisterCallback: (id: number) => {
      delete stubWindow[`_${id}`];
    },
    invoke: async (command: string, args: StubWindow["__AI_CALLS"][number]) => {
      if (command !== "plugin:shell|spawn") throw new Error(`not running in Tauri: ${command}`);
      stubWindow.__AI_CALLS.push(args);
      const prompt = args.args[args.args.indexOf("-p") + 1].split("\n").pop()!.slice(0, 60);
      const reply = stubWindow.__AI_RESULT || `Mock reply: ${prompt}`;
      let index = 0;
      const send = (message: unknown) =>
        (stubWindow[`_${args.onEvent.id}`] as ((raw: unknown) => void) | undefined)?.({ index: index++, message });
      const emit = (event: unknown) => send({ event: "Stdout", payload: `${JSON.stringify(event)}\n` });
      const chunkLength = Math.ceil(reply.length / chunkCount);
      void (async () => {
        emit({ type: "stream_event", event: { type: "message_start" } });
        for (let start = 0; start < reply.length; start += chunkLength) {
          await new Promise((resolve) => setTimeout(resolve, stubWindow.__AI_DELAY / chunkCount));
          emit({
            type: "stream_event",
            event: { type: "content_block_delta", delta: { type: "text_delta", text: reply.slice(start, start + chunkLength) } },
          });
        }
        emit({ type: "result", is_error: false, result: reply });
        send({ event: "Terminated", payload: { code: 0, signal: null } });
      })();
      return 4242;
    },
  };
}

export const test = base.extend<{ canvas: Page }>({
  canvas: async ({ page }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(installTauriStub);
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
  index: { projects: { id: string; title: string; workingFolder: string | null; fileAccess: string }[]; lastOpenedProjectId: string | null };
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
