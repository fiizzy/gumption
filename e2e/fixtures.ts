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
// stream-json events (in a handful of chunks over `window.__AI_DELAY` ms),
// the way the real CLI does. `isTauri()` stays false, so the app persists
// to localStorage — each test gets a fresh browser context, hence fresh
// storage. Set `__AI_RESULT` to the text Claude should stream back,
// `__AI_ERROR` to make the run fail with that text, `__AI_TOOL_FILE` to have
// it "read" a file first, and watch `__AI_CALLS` and `__AI_KILLS` for what
// the app asked of it. The launch-time `claude --version` check answers with
// the localStorage entry `test:claude-version` (path and version lines; empty
// means not installed), defaulting to a current native install.
function installTauriStub() {
  type SpawnArguments = { program: string; args: string[]; options: unknown; onEvent: { id: number } };
  type StubWindow = Window &
    Record<string, unknown> & {
      __AI_DELAY: number;
      __AI_RESULT?: string;
      __AI_ERROR?: string;
      __AI_TOOL_FILE?: string;
      __AI_CALLS: SpawnArguments[];
      __AI_KILLS: { pid: number }[];
    };
  const stubWindow = window as unknown as StubWindow;
  stubWindow.__AI_DELAY = 300;
  stubWindow.__AI_CALLS = [];
  stubWindow.__AI_KILLS = [];
  const chunkCount = 8;
  const defaultVersionOutput = "/usr/local/bin/claude\n2.1.310 (Claude Code)";
  const killedPids = new Set<number>();
  let nextPid = 4242;
  const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
    invoke: async (command: string, args: SpawnArguments & { pid: number }) => {
      if (command === "plugin:shell|kill") {
        stubWindow.__AI_KILLS.push({ pid: args.pid });
        killedPids.add(args.pid);
        return;
      }
      if (command !== "plugin:shell|spawn") throw new Error(`not running in Tauri: ${command}`);
      const pid = nextPid++;
      if (args.program === "claude-version") {
        const versionOutput = localStorage.getItem("test:claude-version") ?? defaultVersionOutput;
        setTimeout(() => {
          let eventIndex = 0;
          const sendVersion = (message: unknown) =>
            (stubWindow[`_${args.onEvent.id}`] as ((raw: unknown) => void) | undefined)?.({ index: eventIndex++, message });
          versionOutput.split("\n").filter(Boolean).forEach((line) => sendVersion({ event: "Stdout", payload: line }));
          sendVersion({ event: "Terminated", payload: { code: versionOutput ? 0 : 127, signal: null } });
        }, 0);
        return pid;
      }
      stubWindow.__AI_CALLS.push(args);
      const prompt = args.args[args.args.indexOf("-p") + 1].split("\n").pop()!.slice(0, 60);
      const reply = stubWindow.__AI_RESULT || `Mock reply: ${prompt}`;
      const toolFile = stubWindow.__AI_TOOL_FILE;
      let index = 0;
      const send = (message: unknown) =>
        (stubWindow[`_${args.onEvent.id}`] as ((raw: unknown) => void) | undefined)?.({ index: index++, message });
      const emit = (event: unknown) => send({ event: "Stdout", payload: `${JSON.stringify(event)}\n` });
      const chunkLength = Math.ceil(reply.length / chunkCount);
      const stepDelay = stubWindow.__AI_DELAY / chunkCount;
      void (async () => {
        emit({ type: "stream_event", event: { type: "message_start" } });
        if (stubWindow.__AI_ERROR) {
          await sleep(stepDelay);
          emit({ type: "result", is_error: true, result: stubWindow.__AI_ERROR });
          send({ event: "Terminated", payload: { code: 1, signal: null } });
          return;
        }
        if (toolFile) {
          emit({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "Read" } } });
          emit({
            type: "stream_event",
            event: { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: JSON.stringify({ file_path: toolFile }) } },
          });
          await sleep(stepDelay * 2);
          emit({ type: "stream_event", event: { type: "message_start" } });
        }
        for (let start = 0; start < reply.length; start += chunkLength) {
          await sleep(stepDelay);
          if (killedPids.has(pid)) break;
          emit({
            type: "stream_event",
            event: { type: "content_block_delta", delta: { type: "text_delta", text: reply.slice(start, start + chunkLength) } },
          });
        }
        if (killedPids.has(pid)) {
          send({ event: "Terminated", payload: { code: null, signal: 9 } });
          return;
        }
        emit({ type: "result", is_error: false, result: reply });
        send({ event: "Terminated", payload: { code: 0, signal: null } });
      })();
      return pid;
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
    await expect(page.getByRole("button", { name: "Switch project" })).toContainText(/\S/);
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
