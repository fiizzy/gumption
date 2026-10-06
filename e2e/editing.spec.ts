import { test, expect, drag, draw, renderedNodes, expectSavedNodes, stylePanelButton } from "./fixtures";

test.describe("selection and editing", () => {
  test("transparent shapes are click-through; strokes and fills are hit targets", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await page.keyboard.press("Escape");
    await page.mouse.click(660, 315);
    expect((await renderedNodes(page)).some((node) => node.selected)).toBe(false);
    await page.mouse.click(620, 251);
    expect((await renderedNodes(page))[0].selected).toBe(true);

    await stylePanelButton(page, "Blue").nth(1).click();
    await page.keyboard.press("Escape");
    await page.mouse.click(660, 315);
    expect((await renderedNodes(page))[0].selected).toBe(true);
  });

  test("style panel applies every property and becomes the default", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await stylePanelButton(page, "Red").first().click();
    await stylePanelButton(page, "Blue").nth(1).click();
    await stylePanelButton(page, "Cross-hatch").click();
    await stylePanelButton(page, "Extra bold").click();
    await stylePanelButton(page, "Dashed").click();
    await stylePanelButton(page, "Clean").click();
    await page.getByLabel("Opacity").fill("60");
    await expectSavedNodes(
      page,
      ([rectangle]) =>
        rectangle?.data.strokeColor === "#e03131" &&
        rectangle.data.backgroundColor === "#339af059" &&
        rectangle.data.fillStyle === "cross-hatch" &&
        rectangle.data.strokeWidth === 4 &&
        rectangle.data.strokeStyle === "dashed" &&
        rectangle.data.sloppiness === "clean" &&
        rectangle.data.opacity === 60,
      "all style properties saved",
    );
    // The slider keeps focus, but tool shortcuts must still work.
    await draw(page, "o", { x: 900, y: 250 }, { x: 1060, y: 380 });
    await expectSavedNodes(
      page,
      (nodes) => nodes.some((node) => node.data.shapeKind === "ellipse" && node.data.strokeColor === "#e03131"),
      "new ellipse inherits the current style",
    );
  });

  test("duplicate, nudge, layers, delete", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await page.keyboard.press("Control+d");
    let nodes = await renderedNodes(page);
    const copy = nodes.find((node) => node.selected)!;
    expect(nodes).toHaveLength(2);
    expect(copy.rect.x).toBeCloseTo(570, 0);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    const moved = (await renderedNodes(page)).find((node) => node.selected)!;
    expect([moved.rect.x, moved.rect.y]).toEqual([copy.rect.x + 1, copy.rect.y + 10]);

    await page.keyboard.press("Control+Shift+BracketLeft");
    nodes = await renderedNodes(page);
    expect(nodes.find((node) => node.selected)!.z).toBeLessThan(nodes.find((node) => !node.selected)!.z);
    await page.keyboard.press("Control+BracketRight");
    nodes = await renderedNodes(page);
    expect(nodes.find((node) => node.selected)!.z).toBeGreaterThan(nodes.find((node) => !node.selected)!.z);

    await page.keyboard.press("Delete");
    expect(await renderedNodes(page)).toHaveLength(1);
  });

  test("copy, paste at cursor, cut, and pasting outside text", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await draw(page, "o", { x: 900, y: 250 }, { x: 1060, y: 380 });
    await page.keyboard.press("Control+a");
    expect((await renderedNodes(page)).every((node) => node.selected)).toBe(true);
    await page.keyboard.press("Control+c");
    await page.mouse.move(1100, 650);
    await page.keyboard.press("Control+v");
    let nodes = await renderedNodes(page);
    const pasted = nodes.filter((node) => node.selected);
    expect(nodes).toHaveLength(4);
    const pastedCenterX = pasted.reduce((sum, node) => sum + node.rect.x + node.rect.w / 2, 0) / pasted.length;
    expect(Math.abs(pastedCenterX - 1100)).toBeLessThan(120);

    await page.keyboard.press("Control+x");
    expect(await renderedNodes(page)).toHaveLength(2);

    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/plain", "pasted from outside");
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });
    nodes = await renderedNodes(page);
    expect(nodes.some((node) => node.type === "textElement" && node.text.includes("pasted from outside"))).toBe(true);
  });

  test("shift-click and marquee selection; style applies to all", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await draw(page, "r", { x: 1000, y: 250 }, { x: 1150, y: 380 });
    await page.keyboard.press("Escape");
    await page.mouse.click(620, 251);
    await page.keyboard.down("Shift");
    await page.mouse.click(1040, 251);
    await page.keyboard.up("Shift");
    expect((await renderedNodes(page)).filter((node) => node.selected)).toHaveLength(2);
    await stylePanelButton(page, "Green").first().click();
    await expectSavedNodes(page, (nodes) => nodes.every((node) => node.data.strokeColor === "#2f9e44"), "both restyled");

    await page.keyboard.press("Escape");
    await drag(page, { x: 520, y: 200 }, { x: 1200, y: 420 });
    expect((await renderedNodes(page)).filter((node) => node.selected)).toHaveLength(2);
  });

  test("resizing shapes and scaling text from a corner", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await drag(page, { x: 760, y: 380 }, { x: 800, y: 420 });
    await expectSavedNodes(page, ([shape]) => shape?.data.width >= 230 && shape.data.height >= 160, "rectangle resized");

    await page.keyboard.press("Escape");
    await page.mouse.dblclick(620, 820);
    await page.keyboard.type("Scale me");
    await page.keyboard.press("Escape");
    let text = (await renderedNodes(page)).find((node) => node.type === "textElement")!;
    await page.mouse.click(text.rect.x + 30, text.rect.y + text.rect.h / 2);
    text = (await renderedNodes(page)).find((node) => node.type === "textElement")!;
    await drag(page, { x: text.rect.x + text.rect.w, y: text.rect.y + text.rect.h }, { x: text.rect.x + text.rect.w * 2, y: text.rect.y + text.rect.h * 2 });
    await expectSavedNodes(page, (nodes) => nodes.some((node) => node.type === "textElement" && node.data.fontSize >= 36), "font scaled");
  });

  test("undo/redo of a move, and a whole label edit as one step", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await page.keyboard.press("Escape");
    await page.mouse.click(620, 251);
    await drag(page, { x: 660, y: 330 }, { x: 660, y: 480 });
    const movedY = (await renderedNodes(page))[0].rect.y;
    expect(movedY).toBeGreaterThan(380);
    await page.keyboard.press("Control+z");
    expect((await renderedNodes(page))[0].rect.y).toBeCloseTo(250, 0);
    await page.keyboard.press("Control+Shift+z");
    expect((await renderedNodes(page))[0].rect.y).toBeCloseTo(movedY, 0);

    await page.keyboard.press("Enter");
    await page.keyboard.type("Label");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+z");
    expect((await renderedNodes(page))[0].text.trim()).toBe("");
    await expectSavedNodes(page, (nodes) => nodes.length === 1 && nodes[0].data.label === "", "label edit undone in one step");
  });
});
