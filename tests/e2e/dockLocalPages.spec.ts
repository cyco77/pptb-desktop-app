import { expect, test } from "./fixtures";

async function expectScrollable(window: import("playwright").Page, selector: string, ensureOverflow = false): Promise<void> {
    const scrollArea = window.locator(selector);
    await expect(scrollArea).toBeVisible();
    const metrics = await scrollArea.evaluate((element, addContent) => {
        if (addContent && element.scrollHeight <= element.clientHeight) {
            const spacer = document.createElement("div");
            spacer.style.height = "1200px";
            spacer.style.flexShrink = "0";
            element.appendChild(spacer);
        }
        return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY };
    }, ensureOverflow);
    expect(metrics.scrollHeight, JSON.stringify(metrics)).toBeGreaterThan(metrics.clientHeight);
    await scrollArea.evaluate((element) => {
        element.scrollTop = 120;
    });
    await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
}

test("Settings, MCP and Consent Review render in rc-dock tabs", async ({ electronApp, window }) => {
    await expect(window.locator("body[data-pptb-initialized='true']")).toBeVisible();

    await window.locator("#settings-activity-btn").click();
    await expect(window.locator("#dock-layout-root .dock-tab").filter({ hasText: "Settings" })).toBeVisible();
    await expect(window.locator("#dock-layout-root #settings-tab-scroll-area")).toBeVisible();
    await expectScrollable(window, "#dock-layout-root #settings-tab-scroll-area");
    const settingsInput = window.locator("#dock-layout-root #sidebar-proxy-no-proxy-input");
    await window.locator("#dock-layout-root #sidebar-proxy-mode-select").selectOption("manual");
    await settingsInput.fill("dock-persistence-test");

    await window.locator("#mcp-btn").click();
    await expect(window.locator("#dock-layout-root .dock-tab").filter({ hasText: "MCP Server" })).toBeVisible();
    await expect(window.locator("#dock-layout-root #mcp-tab")).toBeVisible();
    await expectScrollable(window, "#dock-layout-root #mcp-tab");

    await window.locator("#consent-review-activity-btn").click();
    await expect(window.locator("#dock-layout-root .dock-tab").filter({ hasText: "Consent Review" })).toBeVisible();
    await expect(window.locator("#dock-layout-root #consent-review-tab-scroll-area")).toBeVisible();
    await expectScrollable(window, "#dock-layout-root #consent-review-tab-scroll-area", true);

    await window.locator("#dock-layout-root .dock-tab").filter({ hasText: "Settings" }).click();
    await expect(window.locator("#dock-layout-root #settings-tab-scroll-area")).toBeVisible();
    await expect(settingsInput).toHaveValue("dock-persistence-test");
    await expect(window.locator("#tool-panel-header")).toBeHidden();

    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("show-context-menu");
        ipcMain.handle("show-context-menu", async (_event, request: { items: Array<{ id?: string }> }) => (request.items.some((item) => item.id === "dock-right") ? "dock-right" : null));
    });
    await window.locator("#dock-layout-root .dock-tab").filter({ hasText: "Settings" }).click({ button: "right" });
    await expect(window.locator("#dock-layout-root .dock-panel")).toHaveCount(2);
    await expect(window.locator("#dock-layout-root #settings-tab-scroll-area")).toBeVisible();

    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("show-context-menu");
        ipcMain.handle("show-context-menu", async (_event, request: { items: Array<{ id?: string }> }) => (request.items.some((item) => item.id === "dock-bottom") ? "dock-bottom" : null));
    });
    await window.locator("#dock-layout-root .dock-tab").filter({ hasText: "Consent Review" }).click({ button: "right" });
    await expect(window.locator("#dock-layout-root .dock-panel")).toHaveCount(3);
    await expect(window.locator("#dock-layout-root #consent-review-tab-scroll-area")).toBeVisible();
});
