export const DOCK_TOOLS_CHANGED_EVENT = "pptb:dock-tools-changed";
export const DOCK_TAB_SELECTED_EVENT = "pptb:dock-tab-selected";
export const DOCK_MOVE_TAB_EVENT = "pptb:dock-move-tab";
export const DOCK_LOCAL_PAGE_REFRESH_EVENT = "pptb:dock-local-page-refresh";

export function notifyDockToolsChanged(): void {
    window.dispatchEvent(new CustomEvent(DOCK_TOOLS_CHANGED_EVENT));
}

export function isDockLayoutActive(): boolean {
    return document.getElementById("dock-layout-root") !== null;
}

export function selectDockTab(instanceId: string): void {
    window.dispatchEvent(new CustomEvent(DOCK_TAB_SELECTED_EVENT, { detail: instanceId }));
}

export function moveDockTab(instanceId: string, direction: "right" | "bottom"): void {
    window.dispatchEvent(new CustomEvent(DOCK_MOVE_TAB_EVENT, { detail: { instanceId, direction } }));
}

export function refreshDockLocalPage(instanceId: string): void {
    window.dispatchEvent(new CustomEvent(DOCK_LOCAL_PAGE_REFRESH_EVENT, { detail: instanceId }));
}
