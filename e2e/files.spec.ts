import fs from "node:fs";
import { test, expect, draw, renderedNodes, savedNodes, expectSavedNodes, samplePng } from "./fixtures";
import type { Page } from "@playwright/test";

async function buildScene(page: Page) {
  await draw(page, "r", { x: 560, y: 250 }, { x: 760, y: 380 });
  await draw(page, "a", { x: 762, y: 315 }, { x: 960, y: 315 });
  await page.keyboard.press("t");
  await page.mouse.click(620, 480);
  await page.keyboard.type("Export me");
  await page.keyboard.press("Escape");
  await page.mouse.click(1400, 700);
}

test.describe("files, export and images", () => {
  test("save to file, clear (undoable), reopen, and reject invalid files", async ({ canvas: page }, testInfo) => {
    await buildScene(page);
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
    expect(download.suggestedFilename()).toBe("Untitled project.canvaschat");
    const savedPath = testInfo.outputPath("saved.canvaschat");
    await download.saveAs(savedPath);
    const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
    expect(saved.type).toBe("canvas-chat");
    expect(saved.nodes).toHaveLength(3);
    expect(saved.nodes.every((node: Record<string, unknown>) => node.selected === undefined && node.measured === undefined)).toBe(true);

    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "Clear canvas" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Clear canvas" }).click();
    expect(await renderedNodes(page)).toHaveLength(0);
    await page.keyboard.press("Control+z");
    expect(await renderedNodes(page)).toHaveLength(3);
    await page.keyboard.press("Control+Shift+z");

    let [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.keyboard.press("Control+o")]);
    await chooser.setFiles(savedPath);
    await expect(page.locator(".react-flow__node")).toHaveCount(3);

    const badPath = testInfo.outputPath("bad.canvaschat");
    fs.writeFileSync(badPath, '{"hello":1}');
    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: "Open…" }).click();
    [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("dialog").getByRole("button", { name: "Open file" }).click(),
    ]);
    await chooser.setFiles(badPath);
    await expect(page.getByRole("alert").filter({ hasText: "isn't a Canvas Chat document" })).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
  });

  test("exports PNG and SVG without selection handles", async ({ canvas: page }, testInfo) => {
    await buildScene(page);
    await page.keyboard.press("Control+Shift+E");
    let [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("dialog").getByRole("button", { name: "Export PNG" }).click(),
    ]);
    const png = fs.readFileSync(await download.path());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.keyboard.press("Control+Shift+E");
    await page.getByRole("dialog").getByRole("button", { name: "SVG" }).click();
    [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("dialog").getByRole("button", { name: "Export SVG" }).click(),
    ]);
    const svg = fs.readFileSync(await download.path(), "utf8");
    fs.writeFileSync(testInfo.outputPath("export.svg"), svg);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Export me");
    expect(svg).not.toContain("react-flow__handle");
    expect(svg).not.toContain("react-flow__resize-control");
  });

  test("inserts images by picker, paste and drop; rejects non-images", async ({ canvas: page }) => {
    const png = await samplePng(page);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Insert image — 9" }).click(),
    ]);
    await chooser.setFiles({ name: "picked.png", mimeType: "image/png", buffer: png });
    await expect(page.locator(".react-flow__node-imageElement")).toHaveCount(1);
    const [image] = await renderedNodes(page);
    expect([Math.round(image.rect.w), Math.round(image.rect.h)]).toEqual([480, 300]);

    const base64 = png.toString("base64");
    await page.mouse.move(1300, 600);
    await page.evaluate((encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    }, base64);
    await expect(page.locator(".react-flow__node-imageElement")).toHaveCount(2);

    const imageTransfer = await page.evaluateHandle((encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
      return data;
    }, base64);
    await page.dispatchEvent(".react-flow__pane", "dragover", { dataTransfer: imageTransfer, clientX: 700, clientY: 700 });
    await page.dispatchEvent(".react-flow__pane", "drop", { dataTransfer: imageTransfer, clientX: 700, clientY: 700 });
    await expect(page.locator(".react-flow__node-imageElement")).toHaveCount(3);

    const textTransfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(["hi"], "notes.txt", { type: "text/plain" }));
      return data;
    });
    await page.dispatchEvent(".react-flow__pane", "drop", { dataTransfer: textTransfer, clientX: 700, clientY: 700 });
    await expect(page.getByRole("alert").filter({ hasText: "Only image files" })).toBeVisible();
    await expectSavedNodes(page, (nodes) => nodes.filter((node) => node.type === "imageElement").length === 3, "images saved");
    expect((await savedNodes(page)).every((node) => node.data.src.startsWith("data:image/"))).toBe(true);
  });
});
