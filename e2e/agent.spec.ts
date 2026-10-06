import { test, expect, storedState, expectSavedNodes, draw } from "./fixtures";
import type { Page } from "@playwright/test";

const WORKING_FOLDER = "C:\\Projects\\demo";

type AiCall = { program: string; args: string[]; options: { cwd?: string } | null };
const aiCalls = (page: Page) => page.evaluate(() => (window as unknown as { __AI_CALLS: AiCall[] }).__AI_CALLS);

// The folder picker is desktop-only, so give the open project a working
// folder directly in storage, as the desktop app would have saved it.
async function giveProjectAFolder(page: Page, fileAccess = "ask") {
  await page.evaluate(
    ({ folder, access }) => {
      const index = JSON.parse(localStorage.getItem("canvas-chat:index.json")!);
      index.projects = index.projects.map((project: Record<string, unknown>) => ({ ...project, workingFolder: folder, fileAccess: access }));
      localStorage.setItem("canvas-chat:index.json", JSON.stringify(index));
    },
    { folder: WORKING_FOLDER, access: fileAccess },
  );
  await page.reload();
  await page.waitForSelector(".react-flow__pane");
}

test.describe("Claude in a working folder", () => {
  test("asks once per project; cancelling keeps the message; the choice reaches the CLI", async ({ canvas: page }) => {
    await giveProjectAFolder(page);
    const input = page.getByPlaceholder(/conversation|thread/);
    await input.fill("Summarise the README");
    await input.press("Enter");
    const modal = page.getByRole("dialog", { name: "Allow Claude to use this folder?" });
    await expect(modal).toContainText(WORKING_FOLDER);

    await modal.getByRole("button", { name: "Close" }).click();
    await expect(input).toHaveValue("Summarise the README");
    expect(await aiCalls(page)).toHaveLength(0);

    await input.press("Enter");
    await modal.getByRole("button", { name: /Read only/ }).click();
    await expect(input).toHaveValue("");
    await expect(page.locator(".react-flow__node-conversation")).toContainText("Mock reply: Summarise the README");
    const [firstCall] = await aiCalls(page);
    expect(firstCall.program).toBe("claude-code-readonly");
    expect(firstCall.options?.cwd).toBe(WORKING_FOLDER);
    expect(firstCall.args).toContain("Bash,Edit,Write,NotebookEdit");
    await expect.poll(async () => (await storedState(page)).index.projects[0].fileAccess).toBe("readOnly");

    // Remembered: the next message goes straight through.
    await input.fill("And the licence?");
    await input.press("Enter");
    await expect(page.getByRole("dialog", { name: "Allow Claude to use this folder?" })).toHaveCount(0);
    await expect.poll(async () => (await aiCalls(page)).length).toBe(2);
  });

  test("read & edit runs the agent command", async ({ canvas: page }) => {
    await giveProjectAFolder(page);
    const input = page.getByPlaceholder(/conversation|thread/);
    await input.fill("Fix the typo");
    await input.press("Enter");
    await page.getByRole("button", { name: /Read & edit files/ }).click();
    await expect.poll(async () => (await aiCalls(page)).length).toBe(1);
    const [call] = await aiCalls(page);
    expect(call.program).toBe("claude-code-agent");
    expect(call.args).toEqual(expect.arrayContaining(["--permission-mode", "acceptEdits", "--disallowedTools", "Bash"]));
    expect(call.options?.cwd).toBe(WORKING_FOLDER);
  });

  test("chat only runs as a plain chat, away from the folder", async ({ canvas: page }) => {
    await giveProjectAFolder(page, "none");
    const input = page.getByPlaceholder(/conversation|thread/);
    await input.fill("Just chat");
    await input.press("Enter");
    await expect.poll(async () => (await aiCalls(page)).length).toBe(1);
    const [chatCall] = await aiCalls(page);
    expect(chatCall.program).toBe("claude-code");
    expect(chatCall.options?.cwd).toBeUndefined();
  });
});

test.describe("streaming replies", () => {
  test("shows the thinking indicator, streams text in, and grows the card up to a cap", async ({ canvas: page }) => {
    const longReply = Array.from({ length: 60 }, (_, index) => `Line ${index + 1} of a long streamed answer.`).join("\n\n");
    await page.evaluate((reply) => {
      const stub = window as unknown as { __AI_RESULT: string; __AI_DELAY: number };
      stub.__AI_RESULT = reply;
      stub.__AI_DELAY = 1600;
    }, longReply);
    const input = page.getByPlaceholder(/conversation|thread/);
    await input.fill("Tell me a lot");
    await input.press("Enter");
    const card = page.locator(".react-flow__node-conversation");
    await expect(card.getByRole("status")).toBeVisible();
    // Part of the reply is visible while it's still streaming.
    await expect(card).toContainText("Line 1 of a long streamed answer.");
    await expect(card.getByRole("status")).toBeVisible();
    await expect(card.getByRole("status")).toHaveCount(0, { timeout: 5000 });

    const height = (await card.boundingBox())!.height;
    expect(height).toBeGreaterThan(400);
    expect(height).toBeLessThanOrEqual(642);
    await expectSavedNodes(page, ([node]) => node?.data.response === longReply && node.data.loading === false, "full reply saved");
  });
});

test.describe("canvas text fonts and chrome", () => {
  test("text font is chosen from a dropdown; new text uses the clearer handwriting", async ({ canvas: page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(700, 500);
    await page.keyboard.type("Readable");
    await page.keyboard.press("Escape");
    await expectSavedNodes(page, ([node]) => node?.data.fontFamily === "casual", "new text uses the clear handwriting");
    await page.locator(".react-flow__node-textElement").click();
    await page.getByRole("toolbar", { name: "Element style" }).getByRole("button", { name: "Font" }).click();
    await page.getByRole("option", { name: "Serif" }).click();
    await expectSavedNodes(page, ([node]) => node?.data.fontFamily === "serif", "font changed to serif");
  });

  test("flat chrome: no joystick, no shadows on toolbars", async ({ canvas: page }) => {
    await draw(page, "r", { x: 700, y: 300 }, { x: 800, y: 380 });
    expect(await page.locator("[class*='shadow']").count()).toBe(0);
    const toolbarShadow = await page.getByRole("toolbar", { name: "Tools" }).evaluate((element) => getComputedStyle(element).boxShadow);
    expect(toolbarShadow).toBe("none");
    await expect(page.locator(".cursor-grab.fixed")).toHaveCount(0);
  });
});
