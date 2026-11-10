const assert = require("node:assert/strict");
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 820, height: 1180 },
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    await page.goto(process.env.APP_URL || "http://localhost:3000");
    await page
      .getByText("Install on iPad or iPhone:", { exact: false })
      .waitFor();
    await page
      .getByRole("button", { name: "Dismiss installation help" })
      .click();
    await page
      .getByRole("button", { name: "Install app / Help", exact: true })
      .click();
    const help = page.getByRole("dialog");
    await help.waitFor();
    assert(
      await help
        .getByText("Open in Safari. Tap Share", { exact: false })
        .isVisible(),
    );
    assert(
      await help
        .getByText("Codespace must be running", { exact: false })
        .isVisible(),
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    require("node:fs").mkdirSync("docs/screenshots/install-help", {
      recursive: true,
    });
    await page.screenshot({
      path: "docs/screenshots/install-help/ipad-instructions.png",
    });
    await page.keyboard.press("Escape");
    assert.equal(await help.isVisible(), false);
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt");
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });
    // Banner was dismissed; help must remain accessible regardless of prompt availability.
    await page
      .getByRole("button", { name: "Install app / Help", exact: true })
      .click();
    await page.getByRole("button", { name: "Close installation help" }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "Install app", exact: true })
      .waitFor({ state: "hidden" });
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt");
      event.prompt = async () => {
        throw Error("unavailable");
      };
      event.userChoice = Promise.resolve({ outcome: "dismissed" });
      window.dispatchEvent(event);
    });
    await page
      .getByRole("button", { name: "Install app", exact: true })
      .click();
    await help.waitFor();
    assert(await help.getByRole("status").isVisible());
    await context.close();
    console.log(
      "PASS: iPad guidance, dismissed-banner recovery, dialog keyboard/close and rejected install prompt.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
