import { expect, test } from "./fixtures";

test.use({ multiConnectionData: true });

async function modalWithConnectionSlots(electronApp: import("playwright").ElectronApplication): Promise<import("playwright").Page> {
    let modal: import("playwright").Page | undefined;
    await expect.poll(async () => {
        for (const page of electronApp.windows()) {
            if (await page.locator("#connection-slot-rail").count()) {
                modal = page;
                return true;
            }
        }
        return false;
    }).toBe(true);
    return modal!;
}

test("Dock tabs and panels reflect saved category and environment color settings", async ({ window, electronApp }) => {
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible();
    await window.evaluate(async () => {
        await window.toolboxAPI.connections.update("e2e-dev-connection", { categoryColor: "#123456", environmentColor: "#abcdef" });
        await window.toolboxAPI.connections.update("e2e-test-connection", { environmentColor: "#abcdef" });
    });
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("set-active-connection");
        ipcMain.handle("set-active-connection", async () => undefined);
    });
    await expect.poll(() => window.evaluate(async () => (await window.toolboxAPI.connections.getById("e2e-dev-connection"))?.categoryColor)).toBe("#123456");

    await window.locator('#sidebar-tools-list .tool-item-pptb[data-tool-id="e2e-api-four-connections"]').click();
    const modal = await modalWithConnectionSlots(electronApp);
    await modal.locator("#confirm-multi-connection-btn").click();

    const dockTab = window.locator("#dock-layout-root .dock-tab").filter({ hasText: "E2E API Four Connections" });
    const dockPanel = dockTab.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' dock-panel ')][1]");
    await expect(dockTab).toBeVisible();
    await window.locator('#connection-slot-squares [data-slot-index="1"]').click();
    let picker: import("playwright").Page | undefined;
    await expect.poll(async () => {
        for (const page of electronApp.windows()) {
            if (await page.locator("#connections-list-container").count()) {
                picker = page;
                return true;
            }
        }
        return false;
    }).toBe(true);
    await picker!.locator('.connection-item[data-connection-id="e2e-dev-connection"]').click();
    await picker!.locator("#connect-selected-connection-btn").click();
    await expect.poll(() => window.evaluate(async () => window.toolboxAPI.getToolConnectionSlots("e2e-api-four-connections"))).toContain("e2e-dev-connection");
    await expect.poll(() => dockTab.evaluate((tab) => (tab as HTMLElement).style.borderBottom)).toContain("5px solid rgb(18, 52, 86)");
    await expect.poll(() => dockPanel.evaluate((panel) => (panel as HTMLElement).style.border)).toContain("5px solid rgb(171, 205, 239)");

    await window.locator("#settings-activity-btn").click();
    await window.locator("#sidebar-category-color-thickness").fill("8");
    await window.locator("#sidebar-environment-color-thickness").fill("3");
    await window.locator("#sidebar-save-settings-btn").click();
    await expect.poll(() => dockTab.evaluate((tab) => tab.style.borderBottom)).toContain("8px solid rgb(18, 52, 86)");
    await dockTab.click();
    await expect.poll(() => dockPanel.evaluate((panel) => panel.style.border)).toContain("3px solid rgb(171, 205, 239)");

    await window.locator("#settings-activity-btn").click();
    await window.locator("#sidebar-show-category-color-check").uncheck();
    await window.locator("#sidebar-show-environment-color-check").uncheck();
    await window.locator("#sidebar-save-settings-btn").click();
    await expect.poll(() => dockTab.evaluate((tab) => tab.style.borderBottom)).toBe("");
    await expect.poll(() => dockPanel.evaluate((panel) => panel.style.border)).toBe("");
});
