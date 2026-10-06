import { test, expect, drag, draw, renderedNodes, expectSavedNodes, savedNodes } from "./fixtures";

// Drawing happens right of x≈480 — the style panel docks over the left edge.
test.describe("drawing tools", () => {
  test("draws rectangle, ellipse and diamond, returning to select", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    let nodes = await renderedNodes(page);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ type: "shapeElement", selected: true });
    expect(nodes[0].rect.w).toBeCloseTo(200, 0);
    expect(nodes[0].rect.h).toBeCloseTo(130, 0);
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");

    await draw(page, "4", { x: 900, y: 250 }, { x: 1080, y: 400 });
    await page.getByRole("button", { name: /^Diamond/ }).click();
    await drag(page, { x: 640, y: 550 }, { x: 800, y: 700 });
    nodes = await renderedNodes(page);
    expect(nodes.filter((node) => node.type === "shapeElement")).toHaveLength(3);
    await expectSavedNodes(
      page,
      (saved) => ["rectangle", "ellipse", "diamond"].every((kind) => saved.some((node) => node.data.shapeKind === kind)),
      "all three shape kinds are saved",
    );
  });

  test("shift constrains shapes to squares", async ({ canvas: page }) => {
    await page.keyboard.press("r");
    await drag(page, { x: 800, y: 600 }, { x: 900, y: 640 }, { modifiers: ["Shift"] });
    const [square] = await renderedNodes(page);
    expect(square.rect.w).toBeCloseTo(square.rect.h, 0);
  });

  test("tool lock keeps the tool active", async ({ canvas: page }) => {
    await page.keyboard.press("q");
    await draw(page, "r", { x: 600, y: 600 }, { x: 650, y: 650 });
    await drag(page, { x: 700, y: 600 }, { x: 750, y: 650 });
    await expect(page.getByRole("button", { name: /^Rectangle/ })).toHaveAttribute("aria-pressed", "true");
    expect(await renderedNodes(page)).toHaveLength(2);
  });

  test("text tool, double-click text, and empty text is discarded", async ({ canvas: page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(560, 800);
    await page.keyboard.type("Hello canvas");
    await page.keyboard.press("Escape");
    await page.mouse.dblclick(1200, 700);
    await page.keyboard.type("Second");
    await page.mouse.click(1300, 850);
    await page.mouse.dblclick(1300, 500);
    await page.keyboard.press("Escape");
    const texts = (await renderedNodes(page)).filter((node) => node.type === "textElement");
    expect(texts.map((node) => node.text.trim()).sort()).toEqual(["Hello canvas", "Second"]);
  });

  test("typing immediately after placing text keeps every keystroke", async ({ canvas: page }) => {
    await page.keyboard.press("t");
    await page.mouse.click(620, 480);
    await page.keyboard.type("Export me");
    await page.keyboard.press("Escape");
    await expectSavedNodes(page, (nodes) => nodes.some((node) => node.data.text === "Export me"), "text saved intact");
    await expect(page.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("labels shapes by double-clicking inside them", async ({ canvas: page }) => {
    await draw(page, "o", { x: 900, y: 250 }, { x: 1080, y: 400 });
    await page.keyboard.press("Escape");
    await page.mouse.dblclick(990, 325);
    await page.keyboard.type("Ellipse label");
    await page.keyboard.press("Escape");
    // Enter re-opens the selected shape's label.
    await page.mouse.click(990, 251);
    await page.keyboard.press("Enter");
    await page.keyboard.type(" v2");
    await page.keyboard.press("Escape");
    await expectSavedNodes(page, (nodes) => nodes[0]?.data.label === "Ellipse label v2", "label saved with regular spaces");
    expect((await savedNodes(page)).filter((node) => node.type === "textElement")).toHaveLength(0);
  });
});
