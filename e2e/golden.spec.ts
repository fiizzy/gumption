import { test, expect } from "./fixtures";
import { GOLDEN_FIXTURES } from "./golden/fixtures";

// Renders every golden diagram through the stubbed agent and saves a
// screenshot under e2e/golden/output for visual judgment. The assertions
// are the floor: every operation applied, nothing skipped, no page errors.

// Outside test-results, which Playwright empties at the start of every run.
const GOLDEN_OUTPUT_DIRECTORY = "e2e/golden/output";
const STREAM_DELAY = 300;

for (const fixture of GOLDEN_FIXTURES) {
  test(`golden: ${fixture.name}`, async ({ canvas: page }) => {
    const reply = fixture.operations.map((operation) => JSON.stringify(operation)).join("\n");
    await page.evaluate(
      ({ reply, delay }) => {
        const stub = window as unknown as { __AI_RESULT: string; __AI_DELAY: number };
        stub.__AI_RESULT = reply;
        stub.__AI_DELAY = delay;
      },
      { reply, delay: STREAM_DELAY },
    );
    const input = page.getByPlaceholder(/diagram/);
    await input.fill(fixture.prompt);
    await input.press("Enter");
    const conversation = page.getByRole("log", { name: "Conversation" });
    const summary = fixture.operations.find((operation) => operation.op === "done")!.summary as string;
    await expect(conversation).toContainText(summary);
    await expect(conversation).not.toContainText("skipped");
    const shapeCount = fixture.operations.filter((operation) => operation.op === "shape").length;
    const drawn = await page.locator(".react-flow__node").count();
    expect(drawn).toBeGreaterThanOrEqual(shapeCount);
    await page.getByRole("complementary", { name: "Chat" }).getByRole("button", { name: "Hide chat" }).click();
    await page.keyboard.press("Shift+Digit1");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${GOLDEN_OUTPUT_DIRECTORY}/${fixture.name}.png`, fullPage: false });
  });
}
