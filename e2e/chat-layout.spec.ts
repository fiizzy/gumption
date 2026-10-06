import { test, expect, drag, renderedNodes, savedNodes, expectSavedNodes } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByPlaceholder(/conversation|thread/);
  await input.fill(prompt);
  await input.press("Enter");
  await expect(page.locator(".react-flow__node-conversation").filter({ hasText: `Mock reply: ${prompt}` })).toHaveCount(1);
}

async function stopBranching(page: Page) {
  await page.getByRole("button", { name: "Stop branching" }).click();
}

// Thread A (3 cards), a standalone chat, thread B (2 cards).
async function buildThreads(page: Page) {
  await sendPrompt(page, "Thread A first");
  await sendPrompt(page, "Thread A second");
  await sendPrompt(page, "Thread A third");
  await stopBranching(page);
  await sendPrompt(page, "Standalone chat");
  await stopBranching(page);
  await sendPrompt(page, "Thread B first");
  await sendPrompt(page, "Thread B second");
  await stopBranching(page);
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  return page.getByRole("dialog", { name: "Settings", exact: true });
}

const cards = (page: Page) => page.locator(".react-flow__node-conversation");
// Matched by reply text — a prompt also appears in its follow-up's "branched from" chip.
const card = (page: Page, prompt: string) => cards(page).filter({ hasText: `Mock reply: ${prompt}` });

// Bring every chat into view (Shift+1), the way a user would before clicking.
async function fitView(page: Page) {
  await page.mouse.click(1500, 900);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Digit1");
  await page.waitForTimeout(700);
}

// Hover a card and open its thread settings menu.
async function openThreadMenu(page: Page, target: Locator) {
  await target.hover();
  await target.getByRole("button", { name: "Thread settings" }).click();
  return target.getByRole("dialog", { name: "Thread settings" });
}

test.describe("chat styles and layout", () => {
  test("response style dropdown reaches the prompt and shows on the card", async ({ canvas: page }) => {
    await page.getByRole("button", { name: "Response style" }).click();
    await page.getByRole("option", { name: /Detailed/ }).click();
    await sendPrompt(page, "Explain deeply");
    await expect(cards(page)).toContainText("detailed");
    const systemPrompt = await page.evaluate(() => {
      const call = (window as unknown as { __AI_CALLS: { args: string[] }[] }).__AI_CALLS[0];
      return call.args[call.args.length - 1];
    });
    expect(systemPrompt).toContain("thorough");
    await expectSavedNodes(page, ([node]) => node?.data.responseStyle === "detailed", "style saved on the card");
  });

  test("terminal is the default style; standard can be chosen and persists", async ({ canvas: page }) => {
    await sendPrompt(page, "Hello");
    await expect(cards(page)).toContainText("you@canvas:~$ Hello");
    const settings = await openSettings(page);
    await settings.getByRole("button", { name: "Standard" }).click();
    await expect(cards(page)).not.toContainText("you@canvas");
    await page.reload();
    await page.waitForSelector(".react-flow__node-conversation");
    await expect(cards(page)).toContainText("You");
    await expect(cards(page)).not.toContainText("you@canvas");
  });

  test("expand modal follows the chat style", async ({ canvas: page }) => {
    await sendPrompt(page, "Show me in full");
    await cards(page).getByRole("button", { name: "Open full content" }).click();
    const modal = page.getByRole("dialog", { name: "Full conversation" });
    await expect(modal).toContainText("claude@canvas");
    await expect(modal).toContainText("you@canvas:~$ Show me in full");
  });

  test("per-thread stacking with deck arrows and thread color", async ({ canvas: page }) => {
    await buildThreads(page);
    await fitView(page);
    const menu = await openThreadMenu(page, card(page, "Thread A second"));
    await menu.getByRole("switch", { name: "Stack thread" }).click();
    await page.keyboard.press("Escape");
    await page.mouse.click(1500, 900);
    // Thread A collapses to one deck; the standalone chat and thread B stay.
    await expect(cards(page)).toHaveCount(4);
    const deck = card(page, "Thread A third");
    await expect(deck).toContainText("3 / 3");

    await deck.hover();
    await deck.getByRole("button", { name: "Previous card in thread" }).click();
    await expect(card(page, "Thread A second")).toContainText("2 / 3");
    await card(page, "Thread A second").getByRole("button", { name: "Next card in thread" }).click();
    await expect(card(page, "Thread A third")).toContainText("3 / 3");

    const deckMenu = await openThreadMenu(page, card(page, "Thread A third"));
    await deckMenu.getByRole("button", { name: "Green" }).click();
    await expectSavedNodes(
      page,
      (nodes) => nodes.filter((node) => String(node.data.prompt ?? "").startsWith("Thread A")).every((node) => node.data.color === "#86efac"),
      "thread color applied to every card in the thread",
    );
    await deckMenu.getByRole("switch", { name: "Stack thread" }).click();
    await expect(cards(page)).toHaveCount(6);
  });

  test("dragging a deck moves its whole thread; select-all never touches hidden cards", async ({ canvas: page }) => {
    await buildThreads(page);
    await expectSavedNodes(page, (nodes) => nodes.length === 6, "threads saved");
    const before = await savedNodes(page);
    await fitView(page);
    const menu = await openThreadMenu(page, card(page, "Thread A second"));
    await menu.getByRole("switch", { name: "Stack thread" }).click();
    await fitView(page);

    const header = (await card(page, "Thread A third").locator(".drag-handle").boundingBox())!;
    await drag(page, { x: header.x + 80, y: header.y + 12 }, { x: header.x + 180, y: header.y + 62 });
    await expectSavedNodes(
      page,
      (nodes) =>
        ["Thread A first", "Thread A second", "Thread A third"].every((prompt) => {
          const previous = before.find((node) => node.data.prompt === prompt)!;
          const current = nodes.find((node) => node.data.prompt === prompt)!;
          return current.position.x - previous.position.x > 80 && current.position.y - previous.position.y > 30;
        }),
      "every card in the thread moved by the drag offset",
    );

    await page.mouse.click(1500, 900);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await expectSavedNodes(page, (nodes) => nodes.length === 2, "only the 4 visible cards were deleted");
    await page.keyboard.press("Control+z");
    await expectSavedNodes(page, (nodes) => nodes.length === 6, "undo restores them");
  });

  test("arranging chats in a grid, and undo skips the automatic layout", async ({ canvas: page }) => {
    await buildThreads(page);
    const settings = await openSettings(page);
    await settings.getByRole("button", { name: "3×3" }).click();
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => {
        const rows = new Set(
          (await renderedNodes(page)).filter((node) => node.type === "conversation").map((node) => Math.round(node.rect.y)),
        );
        return rows.size;
      })
      .toBe(2);
    const columns = new Set(
      (await renderedNodes(page)).filter((node) => node.type === "conversation").map((node) => Math.round(node.rect.x)),
    );
    expect(columns.size).toBe(3);
    await fitView(page);

    // Deleting a card re-flows the grid; one undo brings the card back.
    await cards(page).first().locator(".drag-handle").click({ position: { x: 60, y: 12 } });
    await page.keyboard.press("Delete");
    await expect(cards(page)).toHaveCount(5);
    await page.keyboard.press("Control+z");
    await expect(cards(page)).toHaveCount(6);
  });

  test("thread lines can be dimmed and hidden", async ({ canvas: page }) => {
    await sendPrompt(page, "Parent");
    await sendPrompt(page, "Child");
    const edge = page.locator(".react-flow__edge path").first();
    await expect(edge).toHaveCSS("opacity", "0.2");
    const settings = await openSettings(page);
    await settings.getByLabel("Thread line opacity").fill("0.5");
    await expect(edge).toHaveCSS("opacity", "0.5");
    await settings.getByRole("switch", { name: "Show thread lines" }).click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  });
});
