import { test, expect, draw, renderedNodes, storedState, expectSavedNodes } from "./fixtures";

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

  test("create, switch, rename and delete projects; replies land in their own project", async ({ canvas: page }) => {
    const sidebar = page.getByRole("navigation", { name: "Projects" });
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });

    await page.getByTitle("New project").click();
    await page.getByPlaceholder("Untitled project").fill("Research");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(sidebar.locator('[aria-current="page"]')).toContainText("Research");
    expect(await renderedNodes(page)).toHaveLength(0);

    await page.evaluate(() => ((window as unknown as { __AI_DELAY: number }).__AI_DELAY = 1200));
    const input = page.getByPlaceholder(/conversation|thread/);
    await input.fill("Question in Research");
    await input.press("Enter");
    await sidebar.getByTitle("Untitled project", { exact: true }).click();
    await expect(page.locator(".react-flow__node-shapeElement")).toHaveCount(1);
    await page.waitForTimeout(1500);
    expect(await renderedNodes(page)).toHaveLength(1);
    await sidebar.getByTitle("Research", { exact: true }).click();
    await expect(page.locator(".react-flow__node-conversation")).toContainText("Mock reply: Question in Research");

    await sidebar.getByTitle("Research", { exact: true }).hover();
    await page.getByRole("button", { name: "Rename Research" }).click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Deep research");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await storedState(page)).index.projects.map((project) => project.title).sort()).toEqual(["Deep research", "Untitled project"]);

    await sidebar.getByTitle("Deep research", { exact: true }).hover();
    await page.getByRole("button", { name: "Delete Deep research" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
    await expect(page.locator(".react-flow__node-shapeElement")).toHaveCount(1);
    const state = await storedState(page);
    expect(state.index.projects.map((project) => project.title)).toEqual(["Untitled project"]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith(".json")).length)).toBe(2);

    await sidebar.getByTitle("Untitled project", { exact: true }).hover();
    await page.getByRole("button", { name: "Delete Untitled project" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete project" }).click();
    await expect.poll(async () => (await storedState(page)).index.projects.length).toBe(1);
    expect(await renderedNodes(page)).toHaveLength(0);
  });

  test("working folders are desktop-only (no picker in the browser)", async ({ canvas: page }) => {
    await page.getByTitle("New project").click();
    await expect(page.getByText("Working folder")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Projects" }).getByTitle("Untitled project", { exact: true }).hover();
    await expect(page.getByRole("button", { name: /working folder/i })).toHaveCount(0);
  });
});
