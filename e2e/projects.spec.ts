import { test, expect, draw, renderedNodes, storedState, expectSavedNodes } from "./fixtures";
import type { Page } from "@playwright/test";

const projectMenu = (page: Page) => page.getByRole("button", { name: "Switch project" });
const openProjectMenu = async (page: Page) => {
  await projectMenu(page).click();
  return page.getByRole("menu", { name: "Projects" });
};

test.describe("projects and persistence", () => {
  test("canvas, viewport and theme survive a reload", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await page.keyboard.press("Escape");
    await page.mouse.move(1000, 500);
    await page.mouse.wheel(0, 200);
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect.poll(async () => (await renderedNodes(page))[0].rect.y).toBeCloseTo(50, 0);
    await expectSavedNodes(page, (nodes) => nodes.length === 1, "saved");
    await page.waitForTimeout(600);

    await page.reload();
    await page.waitForSelector(".react-flow__node");
    const [rectangle] = await renderedNodes(page);
    expect(rectangle.type).toBe("shapeElement");
    expect(rectangle.rect.y).toBeCloseTo(50, 0);
    await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Undo (Ctrl+Z)" })).toBeDisabled();
  });

  test("create, switch, rename and delete projects from the project menu; each keeps its own canvas", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });

    let menu = await openProjectMenu(page);
    await menu.getByRole("menuitem", { name: "New project…" }).click();
    await page.getByPlaceholder("Untitled project").fill("Research");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(projectMenu(page)).toHaveText("Research");
    expect(await renderedNodes(page)).toHaveLength(0);

    await draw(page, "o", { x: 900, y: 450 }, { x: 1000, y: 520 });
    menu = await openProjectMenu(page);
    await expect(menu.getByRole("menuitemradio", { name: "Research" })).toHaveAttribute("aria-checked", "true");
    await menu.getByRole("menuitemradio", { name: "Untitled project" }).click();
    await expect(projectMenu(page)).toHaveText("Untitled project");
    await expect(page.locator(".react-flow__node-shapeElement")).toHaveCount(1);
    expect((await renderedNodes(page))[0].text).toBe("");
    menu = await openProjectMenu(page);
    await menu.getByRole("menuitemradio", { name: "Research" }).click();
    await expect(page.locator(".react-flow__node-shapeElement")).toHaveCount(1);

    menu = await openProjectMenu(page);
    await menu.getByRole("menuitem", { name: "Rename project…" }).click();
    const titleInput = page.getByRole("textbox", { name: "Project title" });
    await expect(titleInput).toBeFocused();
    await titleInput.fill("Deep research");
    await titleInput.press("Enter");
    await expect(projectMenu(page)).toHaveText("Deep research");
    await expect.poll(async () => (await storedState(page)).index.projects.map((project) => project.title).sort()).toEqual(["Deep research", "Untitled project"]);

    menu = await openProjectMenu(page);
    await menu.getByRole("menuitem", { name: "Delete project…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
    await expect(projectMenu(page)).toHaveText("Untitled project");
    await expect(page.locator(".react-flow__node-shapeElement")).toHaveCount(1);
    const state = await storedState(page);
    expect(state.index.projects.map((project) => project.title)).toEqual(["Untitled project"]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith(".json")).length)).toBe(2);

    menu = await openProjectMenu(page);
    await menu.getByRole("menuitem", { name: "Delete project…" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
    await expect.poll(async () => (await storedState(page)).index.projects.length).toBe(1);
    expect(await renderedNodes(page)).toHaveLength(0);
  });

  test("codebase folders are desktop-only (no picker in the browser)", async ({ canvas: page }) => {
    const menu = await openProjectMenu(page);
    await expect(menu.getByRole("menuitem", { name: /codebase/i })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "New project…" }).click();
    await expect(page.getByText("Codebase (optional)")).toHaveCount(0);
  });

  test("the chat panel floats over the canvas, collapses to a rail and comes back", async ({ canvas: page }) => {
    const chat = page.getByRole("complementary", { name: "Chat" });
    // The canvas is full-bleed underneath the panel, not pushed aside by it.
    expect((await page.locator(".react-flow").boundingBox())!.x).toBe(0);
    await expect(chat.getByPlaceholder(/diagram/)).toBeVisible();
    await page.getByRole("button", { name: "Hide chat" }).click();
    await expect(chat.getByPlaceholder(/diagram/)).toHaveCount(0);
    await expect(projectMenu(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Show chat" }).first().click();
    await expect(chat.getByPlaceholder(/diagram/)).toBeVisible();
  });
});
