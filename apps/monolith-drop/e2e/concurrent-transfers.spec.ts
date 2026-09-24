import { test } from "@playwright/test";

test.describe("Concurrent transfers (P2P)", () => {
  test("three simultaneous uploads with open data channel", async () => {
    test.skip(
      !process.env.MONOLITH_DROP_E2E_P2P,
      "Set MONOLITH_DROP_E2E_P2P=1 with full stack and two browsers; queue three files and confirm three rows in [data-testid=outgoing-transfer-list].",
    );
  });
});
