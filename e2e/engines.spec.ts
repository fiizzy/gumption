import { test, expect } from "@playwright/test";
import { DEFAULT_ELEMENT_STYLE } from "../app/lib/elementStyle";
import { DiagramBuilder } from "../app/lib/diagram/builder";
import { DEVICE_SPECS } from "../app/lib/diagram/mockup";
import { parseOperationLine, type DiagramOperation } from "../app/lib/diagram/operations";
import { layoutDiagram } from "../app/lib/diagram/placement";
import { rankByLongestPath } from "../app/lib/diagram/ranking";
import { layoutScreens } from "../app/lib/diagram/screens";
import { layoutTree } from "../app/lib/diagram/tree";
import { GOLDEN_FIXTURES } from "./golden/fixtures";

// The layout engines are pure functions, so they are checked here in Node
// without a browser: these run alongside the canvas tests.

const BOX = { width: 180, height: 90 };
const SIZE = { ...BOX, annotationBand: 0 };

// A flowchart with a decision, a happy path and a loop back to the check.
const FLOW_SHAPES = ["start", "check", "ok", "fix", "end"];
const FLOW_CONNECTORS = [
  { id: "c1", from: "start", to: "check", label: null },
  { id: "c2", from: "check", to: "ok", label: "yes" },
  { id: "c3", from: "check", to: "fix", label: "no" },
  { id: "c4", from: "ok", to: "end", label: null },
  { id: "c5", from: "fix", to: "check", label: "retry" },
];

test.describe("ranking", () => {
  test("ranks by longest path, finds the loop and follows the affirmative exit as the spine", () => {
    const ranking = rankByLongestPath({ shapeIds: FLOW_SHAPES, connectors: FLOW_CONNECTORS, startCandidateIds: ["start", "end"] });
    expect([...ranking.rankOf.entries()]).toEqual([
      ["start", 0],
      ["check", 1],
      ["ok", 2],
      ["fix", 2],
      ["end", 3],
    ]);
    expect(ranking.rankCount).toBe(4);
    expect([...ranking.backEdgeIds]).toEqual(["c5"]);
    expect([...ranking.spine]).toEqual(["start", "check", "ok", "end"]);
  });

  test("a first-listed exit carries the spine when nothing is labelled, and a pure cycle still ranks", () => {
    const ranking = rankByLongestPath({
      shapeIds: ["a", "b", "c"],
      connectors: [
        { id: "x", from: "a", to: "b", label: null },
        { id: "y", from: "b", to: "c", label: null },
        { id: "z", from: "c", to: "a", label: null },
      ],
    });
    expect([...ranking.rankOf.values()]).toEqual([0, 1, 2]);
    expect([...ranking.backEdgeIds]).toEqual(["z"]);
    expect([...ranking.spine]).toEqual(["a", "b", "c"]);
  });
});

test.describe("layered placement", () => {
  test("keeps the spine straight, exits a decision sideways and loops around the outside", () => {
    const ranking = rankByLongestPath({ shapeIds: FLOW_SHAPES, connectors: FLOW_CONNECTORS, startCandidateIds: ["start"] });
    const layout = layoutDiagram({
      direction: "down",
      contentOrigin: { x: 100, y: 100 },
      leadingLimit: -Infinity,
      laneCount: ranking.rankCount,
      defaultShapeSize: BOX,
      shapes: FLOW_SHAPES.map((id) => ({ id, laneIndex: ranking.rankOf.get(id)!, ...SIZE, branchesSideways: id === "check" })),
      connectors: FLOW_CONNECTORS,
      pinnedFirst: ranking.spine,
      loopsOutside: true,
    });
    const box = (id: string) => layout.shapeBoxes.get(id)!;
    const spineX = box("start").x;
    expect([box("check").x, box("ok").x, box("end").x]).toEqual([spineX, spineX, spineX]);
    expect(box("fix").x).toBeGreaterThan(spineX);
    expect(box("fix").y).toBe(box("ok").y);

    const branch = layout.connectorPaths.get("c3")!;
    expect(branch[0].x).toBe(box("check").x + box("check").width);
    expect(branch[branch.length - 1].y).toBe(box("fix").y);

    // The loop from the branch cannot reach the outer side without cutting
    // across the spine, so it goes around the far side instead.
    const loop = layout.connectorPaths.get("c5")!;
    expect(Math.max(...loop.map((point) => point.x))).toBeGreaterThan(box("fix").x + box("fix").width);
    const loopEnd = loop[loop.length - 1];
    expect(loopEnd.x).toBe(box("check").x + box("check").width);
    expect(Math.min(...loop.map((point) => point.x))).toBeGreaterThan(spineX);
    for (const id of FLOW_SHAPES) {
      const shape = box(id);
      const crossesShape = loop.slice(1).some((point, index) => {
        const previous = loop[index];
        const isVertical = previous.x === point.x;
        if (!isVertical) return false;
        const insideX = point.x > shape.x && point.x < shape.x + shape.width;
        const spansY = Math.min(previous.y, point.y) < shape.y + shape.height && Math.max(previous.y, point.y) > shape.y;
        return insideX && spansY;
      });
      expect(crossesShape, `loop runs through ${id}`).toBe(false);
    }
  });

  test("swimlanes without a spine behave as before: connected shapes sit level", () => {
    const layout = layoutDiagram({
      direction: "right",
      contentOrigin: { x: 0, y: 0 },
      leadingLimit: -Infinity,
      laneCount: 2,
      defaultShapeSize: BOX,
      shapes: [
        { id: "a", laneIndex: 0, ...SIZE },
        { id: "b", laneIndex: 1, ...SIZE },
        { id: "c", laneIndex: 1, ...SIZE },
      ],
      connectors: [{ id: "ac", from: "a", to: "c" }],
    });
    expect(layout.shapeBoxes.get("a")!.y).toBe(layout.shapeBoxes.get("c")!.y);
    expect(layout.connectorPaths.get("ac")!.length).toBe(2);
  });
});

test.describe("tree layout", () => {
  const SHAPES = ["home", "about", "products", "contact", "p1", "p2", "login"].map((id) => ({ id, width: 150, height: 52 }));
  const CONNECTORS = [
    { id: "h1", from: "home", to: "about" },
    { id: "h2", from: "home", to: "products" },
    { id: "h3", from: "home", to: "contact" },
    { id: "pr1", from: "products", to: "p1" },
    { id: "pr2", from: "products", to: "p2" },
    { id: "x", from: "about", to: "contact" },
  ];

  test("spreads the top level, stacks deeper pages, rails extra roots and routes cross-links outside", () => {
    const layout = layoutTree({ direction: "down", contentOrigin: { x: 0, y: 0 }, shapes: SHAPES, connectors: CONNECTORS, stackFromDepth: 1 });
    const box = (id: string) => layout.shapeBoxes.get(id)!;
    const centerX = (id: string) => box(id).x + box(id).width / 2;
    const centerY = (id: string) => box(id).y + box(id).height / 2;
    expect(box("about").y).toBe(box("products").y);
    expect(box("contact").y).toBe(box("about").y);
    expect(box("about").x).toBeLessThan(box("products").x);
    expect(box("products").x).toBeLessThan(box("contact").x);
    expect(centerX("home")).toBeCloseTo((centerX("about") + centerX("contact")) / 2, 5);
    expect(box("p1").x).toBe(box("products").x + 36);
    expect(box("p2").x).toBe(box("p1").x);
    expect(box("p1").y).toBeGreaterThan(box("products").y + box("products").height);
    expect(box("p2").y).toBeGreaterThan(box("p1").y + box("p1").height);
    expect(box("login").x).toBeGreaterThan(box("contact").x + box("contact").width);
    expect(box("login").y).toBe(box("home").y);
    expect([...layout.crossLinkIds]).toEqual(["x"]);
    // Out of the side, down the corridor beside its subtree, along a rail
    // under the tree, and back up beside the target: never through a box.
    const crossLink = layout.connectorPaths.get("x")!;
    expect(crossLink[0]).toEqual({ x: box("about").x + box("about").width, y: centerY("about") });
    expect(crossLink[1].x).toBeLessThan(box("products").x);
    const treeBottom = Math.max(...SHAPES.map((shape) => box(shape.id).y + box(shape.id).height));
    expect(Math.max(...crossLink.map((point) => point.y))).toBeGreaterThan(treeBottom);
    expect(crossLink[crossLink.length - 1]).toEqual({ x: box("contact").x + box("contact").width, y: centerY("contact") });
    const homeBus = layout.buses.find((bus) => bus.parentId === "home")!;
    expect(homeBus.bar![0].x).toBeCloseTo(centerX("about"), 5);
    expect(homeBus.bar![1].x).toBeCloseTo(centerX("contact"), 5);
    const productsBus = layout.buses.find((bus) => bus.parentId === "products")!;
    expect(productsBus.bar).toBeNull();
    expect(layout.connectorPaths.get("pr1")![1].x).toBe(box("p1").x);
  });

  test("direction right spreads every level to the side", () => {
    const layout = layoutTree({ direction: "right", contentOrigin: { x: 0, y: 0 }, shapes: SHAPES, connectors: CONNECTORS, stackFromDepth: 1 });
    const box = (id: string) => layout.shapeBoxes.get(id)!;
    expect(box("about").x).toBe(box("products").x);
    expect(box("about").x).toBeGreaterThan(box("home").x + box("home").width);
    expect(box("p1").x).toBeGreaterThan(box("products").x + box("products").width);
    expect(box("p1").x).toBe(box("p2").x);
  });
});

test.describe("screens layout", () => {
  test("stacks elements in a frame, pins the tab bar to the bottom and routes the flow between screens", () => {
    const device = DEVICE_SPECS.phone;
    const layout = layoutScreens({
      contentOrigin: { x: 0, y: 0 },
      device,
      screenCount: 2,
      elements: [
        { id: "nav", screenIndex: 0, width: device.frameWidth, height: device.navbarHeight, isFullWidth: true, isBottomBar: false },
        { id: "title", screenIndex: 0, width: device.columnWidth, height: 28, isFullWidth: false, isBottomBar: false },
        { id: "go", screenIndex: 0, width: device.columnWidth, height: 44, isFullWidth: false, isBottomBar: false },
        { id: "tabs", screenIndex: 0, width: device.frameWidth, height: device.tabbarHeight, isFullWidth: true, isBottomBar: true },
        { id: "nav2", screenIndex: 1, width: device.frameWidth, height: device.navbarHeight, isFullWidth: true, isBottomBar: false },
      ],
      connectors: [{ id: "flow", from: { screenIndex: 0, elementId: "go" }, to: { screenIndex: 1, elementId: null } }],
    });
    const [first, second] = layout.frames;
    const box = (id: string) => layout.elementBoxes.get(id)!;
    expect(first.height).toBe(device.minFrameHeight);
    expect(box("nav")).toEqual({ x: 0, y: 0, width: device.frameWidth, height: device.navbarHeight });
    expect(box("title").x).toBe(device.padding);
    expect(box("title").y).toBe(device.navbarHeight + device.padding);
    expect(box("go").y).toBe(box("title").y + 28 + device.elementGap);
    expect(box("tabs").y + box("tabs").height).toBe(first.y + first.height);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    const path = layout.connectorPaths.get("flow")!;
    expect(path[0]).toEqual({ x: box("go").x + box("go").width, y: box("go").y + 22 });
    expect(path[path.length - 1]).toEqual({ x: second.x, y: second.y + 40 });
    expect(path.every((point, index) => index === 0 || point.x === path[index - 1].x || point.y === path[index - 1].y)).toBe(true);
  });

  test("a long screen grows its frame", () => {
    const device = DEVICE_SPECS.phone;
    const layout = layoutScreens({
      contentOrigin: { x: 0, y: 0 },
      device,
      screenCount: 1,
      elements: Array.from({ length: 8 }, (_, index) => ({ id: `card-${index}`, screenIndex: 0, width: device.columnWidth, height: 96, isFullWidth: false, isBottomBar: false })),
      connectors: [],
    });
    expect(layout.frames[0].height).toBeGreaterThan(device.minFrameHeight);
  });
});

test.describe("the protocol and the builder", () => {
  const operations = (lines: Record<string, unknown>[]): DiagramOperation[] =>
    lines.flatMap((line) => parseOperationLine(JSON.stringify(line)).flatMap((parsed) => (parsed.kind === "operation" ? [parsed.operation] : [])));

  test("reads kinds and their synonyms, screens as lanes, and mockup pieces", () => {
    const [plan, button, screenPlan] = operations([
      { op: "plan", kind: "Flowchart", title: "T" },
      { op: "shape", id: "b", kind: "button", label: "Continue", screen: "Welcome" },
      { op: "plan", kind: "screens", device: "desktop", screens: ["Welcome", "Home"] },
    ]);
    expect(plan).toEqual({ op: "plan", kind: "flow", title: "T", direction: null, device: null, lanes: [], rows: [] });
    expect(button).toMatchObject({ op: "shape", kind: "button", lane: "Welcome" });
    expect(screenPlan).toMatchObject({ kind: "screens", device: "desktop", lanes: ["Welcome", "Home"] });
  });

  test("a flowchart without a plan ranks itself, and a screen flow connects to a screen by name", () => {
    const flow = new DiagramBuilder({ x: 0, y: 0 }, DEFAULT_ELEMENT_STYLE);
    for (const operation of operations([
      { op: "shape", id: "s", kind: "ellipse", label: "Start" },
      { op: "shape", id: "d", kind: "diamond", label: "Valid?" },
      { op: "shape", id: "e", kind: "ellipse", label: "End" },
      { op: "connect", from: "s", to: "d" },
      { op: "connect", from: "d", to: "e", label: "yes" },
    ])) {
      expect(flow.apply(operation).ok).toBe(true);
    }
    const flowChange = flow.materialize();
    expect(flow.describe()).toContain("Kind: flow");
    const shapes = flowChange.upserted.filter((node) => node.type === "shapeElement" && node.data.label);
    const centers = shapes.map((node) => node.position.x + (node.data.width as number) / 2);
    expect(new Set(centers).size).toBe(1);

    const screens = new DiagramBuilder({ x: 0, y: 0 }, DEFAULT_ELEMENT_STYLE);
    for (const operation of operations([
      { op: "plan", kind: "screens", device: "phone", screens: ["Welcome", "Home"] },
      { op: "shape", id: "nav", kind: "navbar", label: "Welcome", screen: "Welcome" },
      { op: "shape", id: "go", kind: "button", label: "Continue", screen: "Welcome", color: "blue" },
      { op: "shape", id: "tabs", kind: "tabbar", label: "Home, Search, Profile", screen: "Home" },
      { op: "connect", from: "go", to: "Home", label: "Tap Continue" },
    ])) {
      expect(screens.apply(operation).ok).toBe(true);
    }
    const change = screens.materialize();
    expect(screens.describe()).toContain("Screens: Welcome, Home");
    const arrow = change.upserted.find((node) => node.type === "lineElement" && node.data.kind === "arrow")!;
    expect(arrow.data.startBinding).not.toBeNull();
    expect(arrow.data.endBinding).not.toBeNull();
    const tabIcons = change.upserted.filter((node) => node.type === "pictogramElement");
    expect(tabIcons.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("radial, sequence and grid engines", () => {
  test("a mind map balances its branches across both sides and curves every link", async () => {
    const { layoutRadial } = await import("../app/lib/diagram/radial");
    const ids = ["topic", "a", "b", "c", "d", "a1", "a2", "b1"];
    const layout = layoutRadial({
      contentOrigin: { x: 0, y: 0 },
      shapes: ids.map((id) => ({ id })),
      connectors: [
        { id: "ta", from: "topic", to: "a" },
        { id: "tb", from: "topic", to: "b" },
        { id: "tc", from: "topic", to: "c" },
        { id: "td", from: "topic", to: "d" },
        { id: "aa1", from: "a", to: "a1" },
        { id: "aa2", from: "a", to: "a2" },
        { id: "bb1", from: "b", to: "b1" },
      ],
      sizeForDepth: (depth) => (depth === 0 ? { width: 200, height: 64 } : { width: 140, height: 40 }),
    });
    const box = (id: string) => layout.shapeBoxes.get(id)!;
    const topic = box("topic");
    expect(box("a").x).toBeGreaterThan(topic.x + topic.width);
    expect(box("b").x).toBeGreaterThan(topic.x + topic.width);
    expect(box("c").x + box("c").width).toBeLessThan(topic.x);
    expect(box("d").x + box("d").width).toBeLessThan(topic.x);
    expect(box("a1").x).toBeGreaterThan(box("a").x + box("a").width);
    expect(layout.depthOf.get("a1")).toBe(2);
    expect(layout.branchOf.get("a1")).toBe(0);
    const link = layout.connectorPaths.get("ta")!;
    expect(link).toHaveLength(2);
    expect(link[0]).toEqual({ x: topic.x + topic.width, y: topic.y + topic.height / 2 });
    expect(link[link.length - 1]).toEqual({ x: box("a").x, y: box("a").y + box("a").height / 2 });
  });

  test("a sequence puts one message per row, hooks self-calls, and boxes a fragment around its messages", async () => {
    const { layoutSequence } = await import("../app/lib/diagram/sequence");
    const layout = layoutSequence({
      contentOrigin: { x: 0, y: 0 },
      participants: ["user", "web", "api"].map((id) => ({ id, width: 150, height: 52 })),
      messages: [
        { id: "m1", from: "user", to: "web" },
        { id: "m2", from: "web", to: "api" },
        { id: "m3", from: "api", to: "api" },
        { id: "m4", from: "api", to: "web" },
      ],
      fragments: [{ id: "loop", messageIds: ["m2", "m3"] }],
    });
    const path = (id: string) => layout.messagePaths.get(id)!;
    expect(path("m1")[0].y).toBeLessThan(path("m2")[0].y);
    expect(path("m2")[0].y).toBeLessThan(path("m3")[0].y);
    expect(path("m1")[0].x).toBe(75);
    expect(path("m1")[1].x).toBe(315);
    expect(path("m3")).toHaveLength(4);
    expect(path("m3")[3].x).toBe(path("m3")[0].x);
    const fragment = layout.fragmentBoxes[0].box;
    expect(fragment.y).toBeLessThan(path("m2")[0].y);
    expect(fragment.y + fragment.height).toBeGreaterThan(path("m3")[2].y);
    expect(fragment.y + fragment.height).toBeLessThan(path("m4")[0].y);
    expect(fragment.x).toBeLessThan(315);
    expect(fragment.x + fragment.width).toBeGreaterThan(555);
    expect(layout.lifelines[0].bottom.y).toBeGreaterThan(path("m4")[0].y);
  });

  test("a grid stacks cards in cells, sizes rows to the tallest stack and rules the headers", async () => {
    const { layoutGrid } = await import("../app/lib/diagram/grid");
    const layout = layoutGrid({
      contentOrigin: { x: 0, y: 0 },
      columnCount: 2,
      rowCount: 2,
      hasColumnHeaders: true,
      hasRowHeaders: true,
      cardWidth: 170,
      cards: [
        { id: "a", columnIndex: 0, rowIndex: 0, height: 52 },
        { id: "b", columnIndex: 0, rowIndex: 0, height: 52 },
        { id: "c", columnIndex: 1, rowIndex: 1, height: 72 },
      ],
    });
    const box = (id: string) => layout.cardBoxes.get(id)!;
    expect(box("a").x).toBe(box("b").x);
    expect(box("b").y).toBe(box("a").y + 52 + 10);
    expect(box("a").y).toBeGreaterThan(layout.columnHeaderBoxes[0].y + layout.columnHeaderBoxes[0].height);
    expect(box("a").x).toBeGreaterThan(layout.rowHeaderBoxes[0].x + layout.rowHeaderBoxes[0].width);
    expect(layout.cellBoxes[0][0].height).toBe(52 * 2 + 10 + 14 * 2);
    expect(box("c").y).toBe(layout.cellBoxes[1][1].y + 14);
    expect(layout.separators.length).toBe(4);
  });

  test("the builder groups members behind a box, orders them together, and reads rows and columns", () => {
    const builder = new DiagramBuilder({ x: 0, y: 0 }, DEFAULT_ELEMENT_STYLE);
    for (const operation of operations([
      { op: "plan", kind: "swimlane", lanes: ["A", "B"] },
      { op: "shape", id: "x", kind: "rectangle", label: "X", lane: "B" },
      { op: "shape", id: "y", kind: "rectangle", label: "Y", lane: "B" },
      { op: "shape", id: "z", kind: "rectangle", label: "Z", lane: "B" },
      { op: "shape", id: "s", kind: "rectangle", label: "S", lane: "A" },
      { op: "connect", from: "s", to: "y" },
      { op: "group", id: "g", label: "Pair", members: ["x", "z"], color: "blue" },
    ])) {
      expect(builder.apply(operation).ok).toBe(true);
    }
    const change = builder.materialize();
    const byLabel = (label: string) => change.upserted.find((node) => node.type === "shapeElement" && node.data.label === label)!;
    const [x, y, z] = ["X", "Y", "Z"].map((label) => byLabel(label).position.y);
    expect(y < Math.min(x, z) || y > Math.max(x, z)).toBe(true);
    const groupBox = change.upserted.find((node) => node.type === "shapeElement" && node.data.label === "" && node.data.backgroundColor !== "transparent")!;
    expect(groupBox.position.y).toBeLessThan(Math.min(x, z));
    expect(change.upserted.some((node) => node.type === "textElement" && node.data.text === "Pair")).toBe(true);
    expect(builder.describe()).toContain('Groups: g "Pair" [x, z]');

    const board = new DiagramBuilder({ x: 0, y: 0 }, DEFAULT_ELEMENT_STYLE);
    for (const operation of operations([
      { op: "plan", kind: "kanban", columns: ["Todo", "Done"], rows: ["Team A"] },
      { op: "shape", id: "c1", kind: "rectangle", label: "Card", note: "Ana", column: "Done", row: "Team A" },
    ])) {
      expect(board.apply(operation).ok).toBe(true);
    }
    const boardChange = board.materialize();
    const card = boardChange.upserted.find((node) => node.type === "shapeElement" && node.data.label === "Card")!;
    expect(card.data.note).toBe("Ana");
    expect(board.describe()).toContain("Kind: grid");
    expect(board.describe()).toContain("Columns: Todo, Done");
    expect(board.describe()).toContain("Rows: Team A");
  });

  const operations = (lines: Record<string, unknown>[]): DiagramOperation[] =>
    lines.flatMap((line) => parseOperationLine(JSON.stringify(line)).flatMap((parsed) => (parsed.kind === "operation" ? [parsed.operation] : [])));
});

test.describe("side-notes and pictogram ports", () => {
  test("lines meet a pictogram at its picture, and a spread of lines stays on the picture", () => {
    const layout = layoutDiagram({
      direction: "right",
      contentOrigin: { x: 0, y: 0 },
      leadingLimit: -Infinity,
      laneCount: 2,
      defaultShapeSize: { width: 180, height: 90 },
      shapes: [
        { id: "person", laneIndex: 0, width: 180, height: 116, annotationBand: 0, portInsets: { left: 44, right: 44, top: 0, bottom: 24 } },
        { id: "a", laneIndex: 1, width: 180, height: 90, annotationBand: 0 },
        { id: "b", laneIndex: 1, width: 180, height: 90, annotationBand: 0 },
      ],
      connectors: [
        { id: "pa", from: "person", to: "a" },
        { id: "pb", from: "person", to: "b" },
      ],
    });
    const person = layout.shapeBoxes.get("person")!;
    for (const id of ["pa", "pb"]) {
      const start = layout.connectorPaths.get(id)![0];
      expect(start.x).toBe(person.x + person.width - 44);
      expect(start.y).toBeGreaterThan(person.y);
      expect(start.y).toBeLessThan(person.y + 92);
    }
  });

  test("a shape's notes become one block hung on a straight tick that crosses no text", () => {
    const builder = new DiagramBuilder({ x: 0, y: 0 }, DEFAULT_ELEMENT_STYLE);
    for (const line of [
      { op: "plan", kind: "swimlane", lanes: ["A"] },
      { op: "shape", id: "api", kind: "rectangle", label: "API", lane: "A", note: "src/server/api.ts" },
      { op: "note", text: "Retries three times", near: "api" },
      { op: "note", text: "Idempotent", near: "api" },
    ]) {
      for (const parsed of parseOperationLine(JSON.stringify(line))) if (parsed.kind === "operation") expect(builder.apply(parsed.operation).ok).toBe(true);
    }
    const change = builder.materialize();
    const texts = change.upserted.filter((node) => node.type === "textElement");
    expect(texts).toHaveLength(2);
    const block = texts.find((node) => node.data.text.includes("Idempotent"))!;
    expect(block.data.text).toBe("src/server/api.ts\nRetries three\ntimes\nIdempotent");
    const shape = change.upserted.find((node) => node.type === "shapeElement" && node.data.label === "API")!;
    const ticks = change.upserted.filter((node) => node.type === "lineElement");
    expect(ticks).toHaveLength(1);
    const [top, bottom] = ticks[0].data.points;
    expect(top.x).toBe(bottom.x);
    expect(ticks[0].position.y).toBe(shape.position.y + (shape.data.height as number));
    expect(ticks[0].position.y + bottom.y).toBe(block.position.y);
  });
});

test.describe("every golden drawing keeps its labels and groups clean", () => {
  type Rect = { x: number; y: number; width: number; height: number };
  const overlaps = (first: Rect, second: Rect) =>
    first.x < second.x + second.width && second.x < first.x + first.width && first.y < second.y + second.height && second.y < first.y + first.height;
  const contains = (outer: Rect, inner: Rect) =>
    outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
  const crosses = (start: { x: number; y: number }, end: { x: number; y: number }, box: Rect) => {
    // Straight runs only need a cheap check: sample along the run.
    const steps = Math.max(2, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 2));
    for (let step = 0; step <= steps; step += 1) {
      const x = start.x + ((end.x - start.x) * step) / steps;
      const y = start.y + ((end.y - start.y) * step) / steps;
      if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) return true;
    }
    return false;
  };

  for (const fixture of GOLDEN_FIXTURES) {
    test(fixture.name, () => {
      const builder = new DiagramBuilder({ x: 0, y: 0 }, DEFAULT_ELEMENT_STYLE);
      for (const line of fixture.operations) {
        for (const parsed of parseOperationLine(JSON.stringify(line))) if (parsed.kind === "operation" && parsed.operation.op !== "done") builder.apply(parsed.operation);
      }
      const nodes = builder.materialize().upserted;
      const labelTexts = new Set(fixture.operations.filter((operation) => operation.op === "connect" && operation.label).map((operation) => operation.label as string));
      const rectOf = (node: (typeof nodes)[number]): Rect => {
        const data = node.data as { width: number; height?: number; text?: string; fontSize?: number };
        const height = data.height ?? (data.text ?? "").split("\n").length * (data.fontSize ?? 14) * 1.25;
        return { x: node.position.x, y: node.position.y, width: data.width, height };
      };
      const labels = nodes.filter((node) => node.type === "textElement" && labelTexts.has(node.data.text as string));
      const groups = nodes.filter((node) => node.type === "shapeElement" && node.data.label === "" && node.data.fillStyle === "solid");
      const solids = nodes.filter(
        (node) => (node.type === "shapeElement" && !groups.includes(node) && node.data.label !== "") || node.type === "pictogramElement" || (node.type === "textElement" && !labels.includes(node)),
      );

      for (const label of labels) {
        const box = rectOf(label);
        for (const solid of solids) expect(overlaps(box, rectOf(solid)), `label "${label.data.text}" covers "${(solid.data.label ?? solid.data.text) as string}"`).toBe(false);
        for (const other of labels) if (other !== label) expect(overlaps(box, rectOf(other)), `labels "${label.data.text}" and "${other.data.text}" overlap`).toBe(false);
        if (label.data.knockout) continue;
        for (const line of nodes.filter((node) => node.type === "lineElement")) {
          const points = (line.data.points as { x: number; y: number }[]).map((point) => ({ x: point.x + line.position.x, y: point.y + line.position.y }));
          const struck = points.slice(1).some((end, index) => crosses(points[index], end, box));
          expect(struck, `a line strikes label "${label.data.text}"`).toBe(false);
        }
      }
      for (const first of groups) {
        for (const second of groups) {
          if (first === second) continue;
          const [a, b] = [rectOf(first), rectOf(second)];
          expect(!overlaps(a, b) || contains(a, b) || contains(b, a), "two group boxes overlap").toBe(true);
        }
      }
    });
  }
});

test.describe("every golden drawing can be picked up again from its artboard", () => {
  for (const fixture of GOLDEN_FIXTURES) {
    test(fixture.name, () => {
      const builder = new DiagramBuilder({ x: 100, y: 100 }, DEFAULT_ELEMENT_STYLE);
      for (const line of fixture.operations) {
        for (const parsed of parseOperationLine(JSON.stringify(line))) if (parsed.kind === "operation" && parsed.operation.op !== "done") builder.apply(parsed.operation);
      }
      const drawn = builder.materialize().upserted;
      const frame = drawn.find((node) => node.type === "shapeElement" && node.data.artboard)!;
      expect(frame, "the drawing has an artboard").toBeDefined();
      const artboard = frame.data.artboard as { name: string; memberIds: string[]; diagram: unknown };
      expect(new Set(artboard.memberIds)).toEqual(new Set(drawn.filter((node) => node !== frame).map((node) => node.id)));

      // Picked up again after the artboard was moved: everything comes back
      // with the same ids, shifted by exactly the move, and nothing is lost.
      const moveBy = { x: 340, y: -120 };
      const restored = DiagramBuilder.restore(artboard.diagram as never, artboard.memberIds, { x: frame.position.x + moveBy.x, y: frame.position.y + moveBy.y }, DEFAULT_ELEMENT_STYLE);
      const change = restored.materialize();
      expect(change.removedIds).toEqual([]);
      const before = new Map(drawn.map((node) => [node.id, node]));
      expect(new Set(change.upserted.map((node) => node.id))).toEqual(new Set(before.keys()));
      for (const node of change.upserted) {
        const original = before.get(node.id)!;
        expect(node.position.x - original.position.x, `${node.type} moved across`).toBeCloseTo(moveBy.x, 0);
        expect(node.position.y - original.position.y, `${node.type} moved down`).toBeCloseTo(moveBy.y, 0);
      }

      // A change applies in place: removing a shape takes only its nodes.
      const firstShape = fixture.operations.find((operation) => operation.op === "shape")!;
      expect(restored.apply({ op: "remove", id: firstShape.id as string }).ok).toBe(true);
      const afterRemove = restored.materialize();
      expect(afterRemove.removedIds.length).toBeGreaterThan(0);
      expect(afterRemove.removedIds).not.toContain(frame.id);
    });
  }
});
