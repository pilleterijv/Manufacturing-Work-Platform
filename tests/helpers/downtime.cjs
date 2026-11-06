exports.selectDowntimeMachine = async function (page, equipment) {
  await page
    .getByLabel("Recording department", { exact: true })
    .selectOption(JSON.stringify([equipment.plant, equipment.department]));
  await page
    .getByLabel("Recording area", { exact: true })
    .selectOption(JSON.stringify(equipment.area));
  await page.getByLabel("Machine", { exact: true }).selectOption(equipment.id);
};
