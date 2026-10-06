import { test, expect, drag, draw, renderedNodes, expectSavedNodes, savedNodes, flowToPage, type StoredNode } from "./fixtures";

const lineOf = (nodes: StoredNode[]) => nodes.find((node) => node.type === "lineElement")!;

async function lineEndOnPage(page: Parameters<typeof flowToPage>[0], line: StoredNode, index: 0 | 1) {
  const point = line.data.points[index];
  return flowToPage(page, { x: line.position.x + point.x, y: line.position.y + point.y });
}

test.describe("bound arrows", () => {
  test("an arrow drawn between shapes binds and follows them", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await draw(page, "o", { x: 900, y: 250 }, { x: 1080, y: 400 });
    await draw(page, "a", { x: 762, y: 315 }, { x: 898, y: 325 });
    await expectSavedNodes(page, (nodes) => !!lineOf(nodes)?.data.startBinding && !!lineOf(nodes).data.endBinding, "bound at both ends");

    await page.keyboard.press("Escape");
    await page.mouse.click(620, 251);
    await drag(page, { x: 660, y: 330 }, { x: 660, y: 480 });
    const line = (await renderedNodes(page)).find((node) => node.type === "lineElement")!;
    expect(line.rect.y + line.rect.h).toBeGreaterThan(430);
  });

  test("endpoints rebind, unbind, and dragging the line detaches it", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
    await draw(page, "r", { x: 1000, y: 250 }, { x: 1150, y: 380 });
    await draw(page, "d", { x: 1000, y: 550 }, { x: 1150, y: 700 });
    await draw(page, "a", { x: 762, y: 315 }, { x: 998, y: 315 });
    await expectSavedNodes(page, (nodes) => !!lineOf(nodes)?.data.endBinding, "arrow saved");
    const [rectangleA, , diamond] = (await savedNodes(page)).filter((node) => node.type === "shapeElement");

    await drag(page, await lineEndOnPage(page, lineOf(await savedNodes(page)), 1), { x: 1075, y: 560 });
    await expectSavedNodes(page, (nodes) => lineOf(nodes).data.endBinding?.elementId === diamond.id, "rebound to diamond");
    expect(lineOf(await savedNodes(page)).data.startBinding?.elementId).toBe(rectangleA.id);

    await drag(page, await lineEndOnPage(page, lineOf(await savedNodes(page)), 1), { x: 850, y: 800 });
    await expectSavedNodes(page, (nodes) => lineOf(nodes).data.endBinding === null, "unbound in empty space");

    const line = lineOf(await savedNodes(page));
    const start = await lineEndOnPage(page, line, 0);
    const end = await lineEndOnPage(page, line, 1);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    await drag(page, middle, { x: middle.x + 60, y: middle.y + 60 });
    await expectSavedNodes(page, (nodes) => lineOf(nodes).data.startBinding === null, "detached by dragging the line");
  });

  test("dragging between anchor handles creates a bound arrow (clicking does not)", async ({ canvas: page }) => {
    await draw(page, "r", { x: 560, y: 600 }, { x: 700, y: 700 });
    await draw(page, "o", { x: 1000, y: 300 }, { x: 1150, y: 400 });
    // Clicking the two top midpoints in turn must only select.
    await page.mouse.click(630, 600);
    await page.mouse.click(1075, 300);
    expect((await renderedNodes(page)).filter((node) => node.type === "lineElement")).toHaveLength(0);

    await page.mouse.click(630, 600);
    await drag(page, { x: 630, y: 600 }, { x: 1000, y: 350 }, { steps: 20 });
    await expectSavedNodes(
      page,
      (nodes) => lineOf(nodes)?.data.kind === "arrow" && !!lineOf(nodes).data.startBinding && !!lineOf(nodes).data.endBinding,
      "anchor drag created a bound arrow",
    );
  });
});
