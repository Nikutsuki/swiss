import { expect, test } from "@playwright/test";

test.describe("Monolith Drop session", () => {
  test("session page offers create flow when not signed into a room", async ({ page }) => {
    await page.goto("/session");
    await expect(page.getByRole("heading", { name: "Start a transfer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create session" })).toBeVisible();
  });
});

test.describe("Large file performance (manual)", () => {
  test("P2P large-file benchmark", async () => {
    test.skip(
      !process.env.MONOLITH_DROP_E2E_P2P,
      "Set MONOLITH_DROP_E2E_P2P=1 with stack running; upload ≥100MB and compare throughput vs baseline (see README benchmarks).",
    );
  });
});
