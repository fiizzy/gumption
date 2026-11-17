import { test, expect, renderedNodes } from "./fixtures";
import type { Page } from "@playwright/test";

const BROKEN_INSTALL_OUTPUT = "/usr/local/bin/claude";
const REINSTALL_COMMAND = "npm install -g @anthropic-ai/claude-code@latest";

const tour = (page: Page) => page.getByRole("dialog", { name: /Describe it|Three ways|Connect Claude Code/ });

// Opens the app the way a first launch sees it: the stub stops seeding the
// tour flag, and `claude --version` answers with the given output.
async function openFirstLaunch(page: Page, claudeVersionOutput?: string) {
  await page.evaluate((output) => {
    localStorage.setItem("test:first-launch", "1");
    localStorage.removeItem("canvas-chat:onboarding");
    if (output !== undefined) localStorage.setItem("test:claude-version", output);
  }, claudeVersionOutput);
  await page.reload();
  await page.waitForSelector(".react-flow__pane");
}

test.describe("Welcome tour", () => {
  test("steps through on the first launch, ends connected, and stays away afterwards", async ({ canvas: page }) => {
    await expect(tour(page)).toHaveCount(0);
    await openFirstLaunch(page);

    const dialog = tour(page);
    await expect(dialog).toContainText("Describe it. Watch it get sketched.");
    await expect(dialog.locator("svg[data-scene='answer'] path").first()).toBeVisible();

    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(dialog).toContainText("Three ways to use it");
    await expect(dialog).toContainText("Ask about a codebase");

    await page.keyboard.press("ArrowRight");
    await expect(dialog).toContainText("Connect Claude Code");
    await expect(dialog.getByRole("status")).toContainText("Claude Code 2.1.310 is connected.");
    await expect(dialog.getByRole("button", { name: "Explore with a sample" })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Start drawing" }).click();
    await expect(tour(page)).toHaveCount(0);

    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await expect(tour(page)).toHaveCount(0);
  });

  test("names the fix when Claude Code is installed but cannot start, and offers a sample instead", async ({ canvas: page }) => {
    await openFirstLaunch(page, BROKEN_INSTALL_OUTPUT);
    const dialog = tour(page);
    await dialog.getByRole("tab", { name: "Step 3 of 3" }).click();

    const status = dialog.getByRole("status");
    await expect(status).toContainText("Claude Code is installed but won't start");
    await expect(status.locator("code")).toHaveText(REINSTALL_COMMAND);
    await expect(status.getByRole("button", { name: "Check again" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Connect later" })).toBeVisible();

    await dialog.getByRole("button", { name: "Explore with a sample" }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect.poll(async () => (await renderedNodes(page)).length).toBeGreaterThan(10);
    const texts = (await renderedNodes(page)).map((node) => node.text);
    expect(texts.some((text) => text.includes("Token valid?"))).toBe(true);

    const chat = page.getByRole("complementary", { name: "Chat" });
    await expect(chat).toContainText("Password reset flow");
    await expect(chat.getByRole("button", { name: "Change" })).toBeVisible();
    // The readiness notice beside the composer carries the same fix.
    await expect(chat.getByRole("status")).toContainText("won't start");
  });

  test("warns in the tour when Claude Code is not installed, and Escape leaves it", async ({ canvas: page }) => {
    await openFirstLaunch(page, "");
    const dialog = tour(page);
    await dialog.getByRole("tab", { name: "Step 3 of 3" }).click();
    await expect(dialog.getByRole("status")).toContainText("Claude Code isn't installed");
    await expect(dialog.getByRole("status").locator("code")).toHaveText("curl -fsSL https://claude.ai/install.sh | bash");
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("canvas-chat:onboarding"))).toBe("1");
  });

  test("comes back from the menu", async ({ canvas: page }) => {
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "Welcome tour" }).click();
    await expect(tour(page)).toContainText("Describe it. Watch it get sketched.");
    await tour(page).getByRole("button", { name: "Skip" }).click();
    await expect(tour(page)).toHaveCount(0);
  });
});
