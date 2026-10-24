import { test, expect, expectSavedNodes, renderedNodes, savedNodes, storedState } from "./fixtures";
import type { Page } from "@playwright/test";

const CODEBASE_FOLDER = "/Users/demo/Projects/demo";

type AiCall = { program: string; args: string[]; options: { cwd?: string } | null };
const aiCalls = (page: Page) => page.evaluate(() => (window as unknown as { __AI_CALLS: AiCall[] }).__AI_CALLS);
const aiKills = (page: Page) => page.evaluate(() => (window as unknown as { __AI_KILLS: unknown[] }).__AI_KILLS);

// What the whiteboard agent streams back: one operation per line. Includes
// a line that isn't JSON and a connection to a shape that doesn't exist,
// both of which the canvas must skip without giving up on the rest.
const DEMO_OPERATIONS = [
  { op: "plan", title: "Demo flow", direction: "right", lanes: ["Client", "Server", "Data"] },
  { op: "shape", id: "browser", kind: "ellipse", label: "Browser", lane: "Client", color: "blue" },
  { op: "shape", id: "api", kind: "rectangle", label: "Payments API", lane: "Server", note: "src/server/payments.ts" },
  '{"op": "shape", "id": "broken", this is not json',
  { op: "shape", id: "db", kind: "rectangle", label: "Database", lane: "Data", color: "green" },
  { op: "connect", from: "browser", to: "api", label: "POST /pay" },
  { op: "connect", from: "api", to: "ghost" },
  { op: "connect", from: "api", to: "db", style: "dashed" },
  { op: "note", text: "Retries three times", near: "api" },
  { op: "done", summary: "Drew the demo flow across three lanes." },
]
  .map((line) => (typeof line === "string" ? line : JSON.stringify(line)))
  .join("\n");

async function setReply(page: Page, reply: string, delay: number, toolFile?: string) {
  await page.evaluate(
    ({ reply, delay, toolFile }) => {
      const stub = window as unknown as { __AI_RESULT: string; __AI_DELAY: number; __AI_TOOL_FILE?: string };
      stub.__AI_RESULT = reply;
      stub.__AI_DELAY = delay;
      if (toolFile) stub.__AI_TOOL_FILE = toolFile;
    },
    { reply, delay, toolFile },
  );
}

async function askToDraw(page: Page, prompt: string) {
  const input = page.getByPlaceholder(/diagram/);
  await input.fill(prompt);
  await input.press("Enter");
  return input;
}

// The folder picker is desktop-only, so give the open project a codebase
// directly in storage, as the desktop app would have saved it.
async function connectCodebase(page: Page) {
  await page.evaluate((folder) => {
    const index = JSON.parse(localStorage.getItem("canvas-chat:index.json")!);
    index.projects = index.projects.map((project: Record<string, unknown>) => ({ ...project, workingFolder: folder }));
    localStorage.setItem("canvas-chat:index.json", JSON.stringify(index));
  }, CODEBASE_FOLDER);
  await page.reload();
  await page.waitForSelector(".react-flow__pane");
}

// Every labelled shape: the frame drawn around a diagram is a shape too,
// but an unlabelled one.
const shapes = (page: Page) => page.locator(".react-flow__node-shapeElement").filter({ hasText: /\S/ });
const frames = (page: Page) => page.locator(".react-flow__node-shapeElement").filter({ hasNotText: /\S/ });
const lines = (page: Page) => page.locator(".react-flow__node-lineElement");
// Connectors are arrows; the short leaders that tie side-notes to their
// shapes are plain lines.
const isConnector = (node: { data: Record<string, unknown> }) => node.data.kind === "arrow";
const chat = (page: Page) => page.getByRole("complementary", { name: "Chat" });
const conversation = (page: Page) => page.getByRole("log", { name: "Conversation" });

test.describe("the whiteboard agent", () => {
  test("streams the diagram in, binds the arrows, reports done, and undoes as one step", async ({ canvas: page }) => {
    await setReply(page, DEMO_OPERATIONS, 1600);
    const input = await askToDraw(page, "Client, API and database");
    await expect(input).toHaveValue("");

    // The sign goes up before the first shape lands, and stays while more arrive.
    await expect(page.getByRole("status", { name: "Working…" })).toBeVisible();
    await expect(shapes(page).first()).toBeVisible();
    await expect(page.getByRole("status", { name: "Working…" })).toBeVisible();

    await expect(shapes(page)).toHaveCount(3);
    // Two connectors plus a leader for each of the two side-notes on the API.
    await expect(lines(page)).toHaveCount(4);
    await expect(conversation(page)).toContainText("Client, API and database");
    await expect(conversation(page)).toContainText("Drew the demo flow across three lanes.");
    await expect(conversation(page)).toContainText("3 shapes, 2 connections");
    await expect(conversation(page)).toContainText("2 steps skipped");
    await expect(page.getByRole("status", { name: "Done" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Done" })).toHaveCount(0, { timeout: 5000 });

    const texts = (await renderedNodes(page)).filter((node) => node.type === "textElement").map((node) => node.text);
    expect(texts).toEqual(
      expect.arrayContaining(["Demo flow", "Client", "Server", "Data", "POST /pay", "src/server/\npayments.ts", "Retries three\ntimes"]),
    );
    // The file path is a side-note beside the shape (wrapped after the
    // slash), not a line inside it.
    await expect(shapes(page).filter({ hasText: "Payments API" })).not.toContainText("src/server/payments.ts");
    const saved = await savedNodes(page);
    const savedLines = saved.filter((node) => node.type === "lineElement");
    expect(savedLines).toHaveLength(4);
    expect(savedLines.every((line) => line.data.startBinding && line.data.endBinding)).toBe(true);
    const apiNode = saved.find((node) => node.data.label === "Payments API")!;
    const noteNode = saved.find((node) => node.data.text === "src/server/\npayments.ts")!;
    const leaders = savedLines.filter((line) => !isConnector(line));
    expect(leaders).toHaveLength(2);
    expect(leaders.every((line) => line.data.endBinding.elementId === apiNode.id)).toBe(true);
    expect(leaders.some((line) => line.data.startBinding.elementId === noteNode.id)).toBe(true);
    // The note sits below the shape and to its right, clear of the arrows.
    expect(noteNode.position.y).toBeGreaterThan(apiNode.position.y + apiNode.data.height);
    expect(noteNode.position.x).toBeGreaterThan(apiNode.position.x + apiNode.data.width / 2);
    const connectors = savedLines.filter(isConnector);
    expect(connectors).toHaveLength(2);
    expect(connectors.map((line) => line.data.strokeStyle).sort()).toEqual(["dashed", "solid"]);
    const browser = saved.find((node) => node.data.label === "Browser")!;
    expect(browser.data.shapeKind).toBe("ellipse");
    expect(browser.data.backgroundColor).not.toBe("transparent");
    const [call] = await aiCalls(page);
    expect(call.program).toBe("whiteboard");
    expect(call.args).toContain("--tools=");
    expect(call.options?.cwd).toBeUndefined();

    // The whole streamed drawing is a single undo step.
    await conversation(page).getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
    await expect(conversation(page)).toContainText("undone");
    await page.mouse.click(1400, 700);
    await page.keyboard.press("Control+Shift+z");
    await expect(shapes(page)).toHaveCount(3);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  });

  test("Stop ends the run and keeps what was drawn so far", async ({ canvas: page }) => {
    await setReply(page, DEMO_OPERATIONS, 8000);
    // Pan far off before asking: the view must come back to the working
    // sign the moment the request is sent, not when the first shape lands.
    await page.mouse.move(1000, 500);
    await page.mouse.wheel(0, 4000);
    await askToDraw(page, "Something slow");
    await expect(page.getByRole("status", { name: "Working…" })).toBeInViewport();
    expect(await shapes(page).count()).toBe(0);
    await expect(shapes(page).first()).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(conversation(page)).toContainText("Stopped.");
    await expect(page.getByRole("status", { name: "Stopped" })).toBeVisible();
    expect(await aiKills(page)).toHaveLength(1);
    const drawnCount = await shapes(page).count();
    expect(drawnCount).toBeGreaterThanOrEqual(1);
    expect(drawnCount).toBeLessThan(3);
    await page.waitForTimeout(800);
    expect(await shapes(page).count()).toBe(drawnCount);
  });

  test("a connected codebase runs read-only inside that folder and shows what is being read", async ({ canvas: page }) => {
    await connectCodebase(page);
    await expect(page.getByPlaceholder("Ask about this codebase, or describe a diagram…")).toBeVisible();
    await expect(chat(page)).toContainText("demo");
    await setReply(page, DEMO_OPERATIONS, 2400, "README.md");
    await askToDraw(page, "Architecture overview");
    await expect(chat(page)).toContainText("Reading README.md");
    await expect(shapes(page)).toHaveCount(3);
    const [call] = await aiCalls(page);
    expect(call.program).toBe("whiteboard-codebase");
    expect(call.args).toEqual(expect.arrayContaining(["--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch"]));
    expect(call.options?.cwd).toBe(CODEBASE_FOLDER);
    expect(call.args[call.args.indexOf("-p") + 1]).toBe("Architecture overview");
  });

  test("a reply with nothing to draw is reported in the agent's words in full, copyable, and can be retried", async ({ canvas: page }) => {
    const longReason = "Name the parts you want to see. " + "This explanation runs on for quite a while so that it has to wrap onto several lines instead of being cut off. ".repeat(3) + "END-OF-MESSAGE";
    await setReply(page, `I can't tell what to draw from that.\n${JSON.stringify({ op: "done", summary: longReason })}`, 400);
    await askToDraw(page, "???");
    const alert = chat(page).getByRole("alert");
    await expect(alert).toContainText("Unable to draw that.");
    await expect(alert).toContainText("END-OF-MESSAGE");
    expect((await alert.boundingBox())!.height).toBeGreaterThan(60);
    await alert.getByRole("button", { name: "Details" }).click();
    await alert.getByRole("button", { name: "Copy details" }).click();
    await expect(alert.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(longReason);
    expect(await renderedNodes(page)).toHaveLength(0);
    await expect(page.getByRole("status", { name: "Working…" })).toHaveCount(0);

    await setReply(page, DEMO_OPERATIONS, 400);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(shapes(page)).toHaveCount(3);
    const calls = await aiCalls(page);
    expect(calls).toHaveLength(2);
    expect(calls[1].args[calls[1].args.indexOf("-p") + 1]).toBe("???");
  });

  test("suggestions fill the composer, and / focuses it", async ({ canvas: page }) => {
    const input = page.getByPlaceholder(/diagram/);
    await page.getByRole("button", { name: "A square connected to a circle" }).click();
    await expect(input).toHaveValue("A square connected to a circle");
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(input).not.toBeFocused();
    await page.keyboard.press("/");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("A square connected to a circle");
  });

  test("the agent's words land in the chat, pictograms land on the canvas, and the next turn carries the conversation", async ({ canvas: page }) => {
    const reply = [
      "I'll draw the shopper and the two services.",
      JSON.stringify({ op: "plan", title: "Shop", direction: "right", lanes: ["People", "Services"] }),
      JSON.stringify({ op: "shape", id: "shopper", kind: "pictogram", icon: "person", label: "Shopper", lane: "People" }),
      JSON.stringify({ op: "shape", id: "ghost", kind: "pictogram", icon: "unicorn", label: "Unknown icon", lane: "People" }),
      JSON.stringify({ op: "shape", id: "api", kind: "rectangle", label: "Shop API", lane: "Services" }),
      JSON.stringify({ op: "connect", from: "shopper", to: "api", label: "browses" }),
      JSON.stringify({ op: "done", summary: "Drew the shop." }),
      "Ask me to add payments if you want the full flow.",
    ].join("\n");
    await setReply(page, reply, 400);
    await askToDraw(page, "Who uses the shop?");
    await expect(page.locator(".react-flow__node-pictogramElement")).toHaveCount(1);
    await expect(page.locator(".react-flow__node-pictogramElement")).toContainText("Shopper");
    // An icon the library lacks falls back to a plain box.
    await expect(shapes(page).filter({ hasText: "Unknown icon" })).toHaveCount(1);
    await expect(conversation(page)).toContainText("I'll draw the shopper and the two services.");
    await expect(conversation(page)).toContainText("Ask me to add payments if you want the full flow.");
    await expect(conversation(page)).toContainText("Drew the shop.");
    await expectSavedNodes(page, (nodes) => nodes.some((node) => node.type === "pictogramElement"), "saved with the pictogram");
    const saved = await savedNodes(page);
    const arrow = saved.find((node) => node.type === "lineElement" && node.data.kind === "arrow")!;
    const pictogram = saved.find((node) => node.type === "pictogramElement")!;
    expect(arrow.data.startBinding.elementId).toBe(pictogram.id);

    await setReply(page, DEMO_OPERATIONS, 300);
    await askToDraw(page, "Add payments");
    await expect(shapes(page)).toHaveCount(5);
    const calls = await aiCalls(page);
    const secondPrompt = calls[1].args[calls[1].args.indexOf("-p") + 1];
    expect(secondPrompt).toContain("Person: Who uses the shop?");
    expect(secondPrompt).toContain("I'll draw the shopper and the two services.");
    expect(secondPrompt).toContain('shopper "Shopper" (pictogram person, People)');
    expect(secondPrompt).toContain("shopper -> api");
    expect(secondPrompt.trim().endsWith("Add payments")).toBe(true);
    // The whole conversation reloads with the project.
    await expect
      .poll(() => page.evaluate(() => Object.values(localStorage).some((value) => value.includes("Drew the demo flow across three lanes."))), { message: "conversation saved" })
      .toBe(true);
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await expect(conversation(page)).toContainText("Who uses the shop?");
    await expect(conversation(page)).toContainText("Drew the demo flow across three lanes.");
  });

  test("chat cards from older projects open as notes", async ({ canvas: page }) => {
    // Seeded as a separate project: unloading flushes the open project's
    // autosave, which would overwrite a seed written over it.
    await page.evaluate(() => {
      const index = JSON.parse(localStorage.getItem("canvas-chat:index.json")!);
      const projectId = "legacy-project";
      const now = Date.now();
      index.projects.unshift({ id: projectId, title: "Older project", createdAt: now, updatedAt: now + 1, workingFolder: null });
      index.lastOpenedProjectId = projectId;
      localStorage.setItem("canvas-chat:index.json", JSON.stringify(index));
      localStorage.setItem(
        `canvas-chat:${projectId}.json`,
        JSON.stringify({
          type: "canvas-chat",
          version: 1,
          viewport: null,
          nodes: [
            {
              id: "old-card",
              type: "conversation",
              position: { x: 100, y: 100 },
              data: { prompt: "What is a canvas?", response: "A surface to draw on.", width: 380 },
            },
          ],
        }),
      );
    });
    await page.reload();
    await page.waitForSelector(".react-flow__node");
    const [note] = await renderedNodes(page);
    expect(note.type).toBe("textElement");
    expect(note.text).toContain("What is a canvas?");
    expect(note.text).toContain("A surface to draw on.");
    expect((await storedState(page)).index.projects.find((project) => project.id === "legacy-project")?.workingFolder).toBeNull();
  });
});

const VERSION_TOO_OLD_ERROR =
  'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Claude Code 2.1.5 does not support this model; version 2.1.251 or newer is required. Run \'claude update\', or update the Claude desktop app, then try again.","details":{"error_code":"claude_code_version_too_old"}},"request_id":"req_011CgLAX6buHAPytXzApQVbX"}';

async function setClaudeVersionOutput(page: Page, output: string) {
  await page.evaluate((value) => localStorage.setItem("test:claude-version", value), output);
}

test.describe("Claude Code readiness and failures", () => {
  test("the model picker passes Claude Code's alias and remembers the choice", async ({ canvas: page }) => {
    await page.getByRole("button", { name: "Model" }).click();
    await page.getByRole("option", { name: /Opus/ }).click();
    await setReply(page, DEMO_OPERATIONS, 300);
    await askToDraw(page, "Draw with Opus");
    await expect(shapes(page)).toHaveCount(3);
    const [call] = await aiCalls(page);
    expect(call.program).toBe("whiteboard-model");
    expect(call.args).toEqual(expect.arrayContaining(["--model", "opus"]));
    expect(call.args.indexOf("--model")).toBeLessThan(call.args.indexOf("--append-system-prompt"));
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await expect(page.getByRole("button", { name: "Model" })).toContainText("Opus");
  });

  test("warns before drawing when Claude Code is out of date, with the matching update command", async ({ canvas: page }) => {
    await setClaudeVersionOutput(page, "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js\n2.1.5 (Claude Code)");
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    const banner = chat(page).getByRole("status");
    await expect(banner).toContainText("Claude Code 2.1.5 needs an update");
    await expect(banner).toContainText("2.1.251 or newer");
    await expect(banner.locator("code")).toHaveText("npm install -g @anthropic-ai/claude-code@latest");
    await banner.getByRole("button", { name: "Copy command" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm install -g @anthropic-ai/claude-code@latest");

    await setClaudeVersionOutput(page, "/usr/local/bin/claude\n2.1.310 (Claude Code)");
    await banner.getByRole("button", { name: "Check again" }).click();
    await expect(chat(page).getByRole("status")).toHaveCount(0);
  });

  test("warns when Claude Code is not installed, with the installer and the setup guide", async ({ canvas: page }) => {
    await setClaudeVersionOutput(page, "");
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    const banner = chat(page).getByRole("status");
    await expect(banner).toContainText("Claude Code isn't installed");
    await expect(banner.locator("code")).toHaveText("curl -fsSL https://claude.ai/install.sh | bash");
    await expect(banner.getByRole("button", { name: "Setup guide" })).toBeVisible();
  });

  test("a failed run names the fix, shows the command, and keeps the raw error behind Details", async ({ canvas: page }) => {
    await page.evaluate((error) => ((window as unknown as { __AI_ERROR: string }).__AI_ERROR = error), VERSION_TOO_OLD_ERROR);
    await askToDraw(page, "Architecture overview");
    const alert = chat(page).getByRole("alert");
    await expect(alert).toContainText("Claude Code 2.1.5 needs an update");
    await expect(alert).toContainText("2.1.251 or newer");
    await expect(alert.locator("code")).toHaveText("claude update");
    await expect(alert).not.toContainText("req_011CgLAX6buHAPytXzApQVbX");
    await alert.getByRole("button", { name: "Details" }).click();
    await expect(alert).toContainText("req_011CgLAX6buHAPytXzApQVbX");
    await alert.getByRole("button", { name: "Copy details" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(VERSION_TOO_OLD_ERROR);
    expect(await renderedNodes(page)).toHaveLength(0);
  });
});

test.describe("pictograms", () => {
  test("selecting a pictogram opens the library on the right; search and pick swaps the picture", async ({ canvas: page }) => {
    const reply = [
      JSON.stringify({ op: "plan", title: "Shop", direction: "right", lanes: ["People", "Services"] }),
      JSON.stringify({ op: "shape", id: "shopper", kind: "pictogram", icon: "person", label: "Shopper", lane: "People" }),
      JSON.stringify({ op: "shape", id: "api", kind: "rectangle", label: "Shop API", lane: "Services" }),
      JSON.stringify({ op: "connect", from: "shopper", to: "api" }),
      JSON.stringify({ op: "done", summary: "Drew the shop." }),
    ].join("\n");
    await setReply(page, reply, 200);
    await askToDraw(page, "Who uses the shop?");
    const pictogram = page.locator(".react-flow__node-pictogramElement");
    await expect(pictogram).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Pictogram library" })).toHaveCount(0);

    await pictogram.click();
    const library = page.getByRole("region", { name: "Pictogram library" });
    await expect(library).toBeVisible();
    const box = (await library.boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(1600 - 40);
    await expect(library.getByRole("button", { name: "person" })).toHaveAttribute("aria-pressed", "true");
    await expect(library.getByRole("button")).toHaveCount(83);
    await expect(library.getByRole("region", { name: "Transport & Places" })).toBeVisible();

    await library.getByRole("searchbox").fill("sql");
    await expect(library.getByRole("button")).toHaveCount(1);
    await library.getByRole("button", { name: "database" }).click();
    await expectSavedNodes(page, (nodes) => nodes.some((node) => node.type === "pictogramElement" && node.data.icon === "database"), "icon swapped");
    await expect(library.getByRole("button", { name: "database" })).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");
    await page.mouse.click(1400, 900);
    await expect(library).toHaveCount(0);
  });
});
