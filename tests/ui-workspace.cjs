// Regression drivers explicitly open the secondary tools/panels they exercise.
async function expandTools(page) {
  await page.locator("nav").waitFor();
  const button = page.locator("nav").getByRole("button", { name: "More tools and history", exact: true });
  if (await button.isVisible()) await button.click();
}
async function assignmentPanels(page) {
  const summary = page.getByText("Assignment panels and saved dashboard layout", { exact: true });
  await summary.waitFor();
  if ((await summary.locator("..").getAttribute("open")) === null) await summary.click();
}
async function planningTools(page) {
  await page.locator("details.plan-tools").first().waitFor();
  for (const summary of await page.locator("details.plan-tools:not([open]) > summary").all())
    await summary.click();
}
module.exports = { expandTools, assignmentPanels, planningTools };
