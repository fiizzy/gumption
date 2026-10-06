import { test, expect, renderedNodes, expectSavedNodes, stylePanelButton } from "./fixtures";
import type { Page } from "@playwright/test";

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByPlaceholder(/conversation|thread/);
  await input.fill(prompt);
  await input.press("Enter");
}

const conversationCards = (page: Page) => page.locator(".react-flow__node-conversation");

test.describe("chat cards", () => {
  test("reply, follow-up branching with parent context", async ({ canvas: page }) => {
    await page.evaluate(() => ((window as unknown as { __AI_DELAY: number }).__AI_DELAY = 1200));
    await sendPrompt(page, "What is a canvas?");
    await expect(conversationCards(page)).toContainText("Thinking");
    await expect(conversationCards(page)).toContainText("Mock reply: What is a canvas?");
    await sendPrompt(page, "Tell me more");
    await expect(conversationCards(page)).toHaveCount(2);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    const calls = await page.evaluate(() => (window as unknown as { __AI_CALLS: { args: string[] }[] }).__AI_CALLS);
    expect(calls[1].args[1]).toContain("Earlier in this thread");
  });

  test("no working folder means a plain chat with tools off", async ({ canvas: page }) => {
    await sendPrompt(page, "Hello");
    await expect(conversationCards(page)).toContainText("Mock reply");
    const call = await page.evaluate(() => (window as unknown as { __AI_CALLS: { program: string; args: string[]; options: unknown }[] }).__AI_CALLS[0]);
    expect(call.program).toBe("claude-code");
    expect(call.args).toContain("--tools=");
  });

  test("copy button copies the reply, which pastes onto the canvas as text", async ({ canvas: page }) => {
    await sendPrompt(page, "Copy me");
    const copyButton = conversationCards(page).getByRole("button", { name: "Copy" });
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(conversationCards(page).getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Mock reply: Copy me");

    await page.mouse.click(1300, 300);
    await page.keyboard.press("Control+v");
    await expectSavedNodes(
      page,
      (nodes) => nodes.some((node) => node.type === "textElement" && node.data.text === "Mock reply: Copy me"),
      "pasted reply became a text element",
    );
  });

  test("the header selects; only the chevron collapses", async ({ canvas: page }) => {
    await sendPrompt(page, "Collapse test");
    await expect(conversationCards(page)).toContainText("Mock reply");
    await page.keyboard.press("Escape");
    await page.mouse.click(1400, 700);
    const card = conversationCards(page);
    await card.locator(".drag-handle").click({ position: { x: 60, y: 14 } });
    await expect(card).toHaveClass(/selected/);
    await expectSavedNodes(page, ([node]) => node?.data.minimized === false, "header click does not collapse");
    await card.getByTitle("Collapse").click();
    await expectSavedNodes(page, ([node]) => node?.data.minimized === true, "chevron collapses");
  });

  test("delete + undo restores a card; a reply landing after undo survives redo", async ({ canvas: page }) => {
    await sendPrompt(page, "First");
    await sendPrompt(page, "Second");
    await expect(conversationCards(page)).toHaveCount(2);
    await expect(conversationCards(page).last()).toContainText("Mock reply: Second");
    await page.keyboard.press("Escape");
    await page.mouse.click(1400, 700);
    await conversationCards(page).last().locator(".drag-handle").click({ position: { x: 60, y: 14 } });
    await page.keyboard.press("Delete");
    await expect(conversationCards(page)).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await expect(conversationCards(page)).toHaveCount(2);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    await page.evaluate(() => ((window as unknown as { __AI_DELAY: number }).__AI_DELAY = 1200));
    await sendPrompt(page, "Slow question");
    await page.mouse.click(1400, 700);
    await page.keyboard.press("Control+z");
    await expect(conversationCards(page)).toHaveCount(2);
    await page.waitForTimeout(1500);
    await page.keyboard.press("Control+Shift+z");
    await expect(conversationCards(page).filter({ hasText: "Slow question" })).toContainText("Mock reply: Slow question");
  });

  test("card color from the style panel", async ({ canvas: page }) => {
    await sendPrompt(page, "Color me");
    await expect(conversationCards(page)).toContainText("Mock reply");
    await page.keyboard.press("Escape");
    await page.mouse.click(1400, 700);
    await conversationCards(page).locator(".drag-handle").click({ position: { x: 60, y: 14 } });
    await stylePanelButton(page, "Green").click();
    await expectSavedNodes(page, ([node]) => node?.data.color === "#86efac", "card tint saved");
    expect((await renderedNodes(page))[0].selected).toBe(true);
  });
});
