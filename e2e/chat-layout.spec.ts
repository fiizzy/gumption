import { test, expect, drag, renderedNodes, savedNodes, expectSavedNodes } from "./fixtures";
import type { Page } from "@playwright/test";

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
  await page.getByRole("button", { name: "Settings" }).click();
  return page.getByRole("dialog", { name: "Settings" });
}

const cards = (page: Page) => page.locator(".react-flow__node-conversation");

// Bring every chat into view (Shift+1), the way a user would before clicking.
async function fitView(page: Page) {
  await page.mouse.click(1500, 900);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+Digit1");
  await page.waitForTimeout(700);
}

test.describe("chat styles and layout", () => {
  test("response style toggle reaches the prompt and shows on the card", async ({ canvas: page }) => {
    await page.getByRole("radio", { name: "Detailed" }).click();
    await sendPrompt(page, "Explain deeply");
    await expect(cards(page)).toContainText("Detailed");
    const systemPrompt = await page.evaluate(() => {
      const call = (window as unknown as { __AI_CALLS: { args: string[] }[] }).__AI_CALLS[0];
      return call.args[call.args.length - 1];
    });
    expect(systemPrompt).toContain("thorough");
    await expectSavedNodes(page, ([node]) => node?.data.responseStyle === "detailed", "style saved on the card");
  });

  test("terminal style restyles cards and input, and settings persist", async ({ canvas: page }) => {
    await sendPrompt(page, "Hello");
    const settings = await openSettings(page);
    await settings.getByRole("button", { name: "Terminal" }).click();
    await expect(cards(page)).toContainText("you@canvas:~$ Hello");
    await expect(cards(page).locator(".font-mono").first()).toBeVisible();
    await page.reload();
    await page.waitForSelector(".react-flow__node-conversation");
    await expect(cards(page)).toContainText("you@canvas:~$");
  });

  test("stacking threads into decks, expanding and re-stacking", async ({ canvas: page }) => {
    await buildThreads(page);
    const settings = await openSettings(page);
    await settings.getByRole("switch", { name: "Stack threads" }).click();
    await page.keyboard.press("Escape");
    await expect(cards(page)).toHaveCount(3);
    await fitView(page);
    await expect(page.getByRole("button", { name: "3 in thread" })).toBeVisible();
    await expect(page.getByRole("button", { name: "2 in thread" })).toBeVisible();
    // The deck shows the thread's latest card.
    await expect(cards(page).filter({ hasText: "3 in thread" })).toContainText("Thread A third");

    await page.getByRole("button", { name: "3 in thread" }).click();
    await expect(cards(page)).toHaveCount(5);
    await page.getByRole("button", { name: "Stack", exact: true }).first().click();
    await expect(cards(page)).toHaveCount(3);
  });

  test("dragging a deck moves its whole thread; select-all never touches hidden cards", async ({ canvas: page }) => {
    await buildThreads(page);
    await expectSavedNodes(page, (nodes) => nodes.length === 6, "threads saved");
    const before = await savedNodes(page);
    const settings = await openSettings(page);
    await settings.getByRole("switch", { name: "Stack threads" }).click();
    await page.keyboard.press("Escape");
    await fitView(page);

    const deck = cards(page).filter({ hasText: "3 in thread" });
    const header = (await deck.locator(".drag-handle").boundingBox())!;
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
    await expectSavedNodes(page, (nodes) => nodes.length === 3, "only the 3 visible cards were deleted");
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
});
