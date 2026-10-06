import { test, expect, drag, draw, renderedNodes, viewportZoom } from "./fixtures";

test.describe("navigation and shortcuts", () => {
  test("zoom keys, ctrl+wheel, fit all and zoom to selection", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await page.keyboard.press("Escape");
    await page.mouse.click(1400, 800);
    await page.keyboard.press("Control+Equal");
    await expect.poll(() => viewportZoom(page)).toBeGreaterThan(1);
    await page.keyboard.press("Control+0");
    await expect.poll(() => viewportZoom(page)).toBeCloseTo(1, 3);

    await page.mouse.move(900, 500);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await expect.poll(() => viewportZoom(page)).toBeGreaterThan(1);

    await page.keyboard.press("Shift+Digit1");
    await expect.poll(() => viewportZoom(page)).toBeCloseTo(1, 3);
    const [rectangle] = await renderedNodes(page);
    await page.mouse.click(rectangle.rect.x + 40, rectangle.rect.y + 1);
    await page.keyboard.press("Shift+Digit2");
    await expect.poll(() => viewportZoom(page)).toBeGreaterThan(1.2);
  });

  test("pan tool, hold-space pan, Tab toggle and wheel pan", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    const before = (await renderedNodes(page))[0].rect;
    await page.keyboard.press("h");
    await drag(page, { x: 1500, y: 750 }, { x: 1400, y: 700 });
    const afterPanTool = (await renderedNodes(page))[0].rect;
    expect(before.x - afterPanTool.x).toBeCloseTo(100, 0);

    await page.keyboard.press("v");
    await page.keyboard.down(" ");
    await drag(page, { x: 1500, y: 750 }, { x: 1550, y: 750 });
    await page.keyboard.up(" ");
    expect((await renderedNodes(page))[0].rect.x - afterPanTool.x).toBeCloseTo(50, 0);
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /^Pan/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Tab");

    const beforeWheel = (await renderedNodes(page))[0].rect.y;
    await page.mouse.move(1000, 500);
    await page.mouse.wheel(0, 200);
    await expect.poll(async () => beforeWheel - (await renderedNodes(page))[0].rect.y).toBeCloseTo(200, 0);
  });

  test("shortcuts dialog, and the chat input releases focus to the canvas", async ({ canvas: page }) => {
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const input = page.getByPlaceholder(/conversation|thread/);
    await input.click();
    await input.type("draft");
    await page.mouse.click(1450, 600);
    await page.keyboard.press("r");
    await expect(page.getByRole("button", { name: /^Rectangle/ })).toHaveAttribute("aria-pressed", "true");
    await expect(input).toHaveValue("draft");
  });
});
