import { test } from "@playwright/test";

test.describe("smoke critical path", () => {
  test("bootstrap placeholder", async () => {
    test.skip(true, "Smoke implementation starts in the next phase.");
  });
});
