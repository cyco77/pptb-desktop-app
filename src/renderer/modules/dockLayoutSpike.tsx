import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import DockLayout, { type DropDirection, type LayoutBase, type PanelBase, type TabBase, type TabData, type TabGroup } from "rc-dock";
import "rc-dock/dist/rc-dock.css";
import { DOCK_LOCAL_PAGE_REFRESH_EVENT, DOCK_MOVE_TAB_EVENT, DOCK_TAB_SELECTED_EVENT, DOCK_TOOLS_CHANGED_EVENT } from "./dockLayoutEvents";
import { closeTool, getActiveToolId, getLocalPageRenderer, getOpenTools, refreshDockAppearance, showTabContextMenu, switchToTool } from "./toolManagement";

const DOCK_GROUP = "pptb-tools";

const groups: Record<string, TabGroup> = {
    [DOCK_GROUP]: {
        floatable: false,
        newWindow: false,
        maximizable: false,
    },
};

function ToolSurface({ instanceId }: { instanceId: string }) {
    return <div className="dock-tool-surface" data-tool-instance-id={instanceId} />;
}

function LocalPageSurface({ instanceId }: { instanceId: string }) {
    const panelRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const render = () => {
            const panel = panelRef.current;
            const callback = getLocalPageRenderer(instanceId);
            if (panel && callback) {
                panel.replaceChildren();
                callback(panel);
                // Legacy page renderers replace className; retain the dock height constraint.
                panel.classList.add("dock-local-page");
            }
        };
        const refresh = (event: Event) => {
            if ((event as CustomEvent<string>).detail === instanceId) render();
        };
        render();
        window.addEventListener(DOCK_LOCAL_PAGE_REFRESH_EVENT, refresh);
        return () => window.removeEventListener(DOCK_LOCAL_PAGE_REFRESH_EVENT, refresh);
    }, [instanceId]);
    return <div ref={panelRef} className="dock-local-page" />;
}

function createTabDefinition(instanceId: string, name: string, isDetailTab: boolean): TabData {
    return {
        id: instanceId,
        group: DOCK_GROUP,
        closable: false,
        title: (
            <span
                className="dock-tool-title"
                data-dock-instance-id={instanceId}
                onDoubleClick={() => void switchToTool(instanceId)}
                onMouseDown={(event) => {
                    if (event.button === 1) {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!getOpenTools().get(instanceId)?.isPinned) void closeTool(instanceId);
                    }
                }}
            >
                <span title={name}>{name}</span>
                <button
                    type="button"
                    className="dock-tool-close"
                    aria-label={`Close ${name}`}
                    title="Close"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        void closeTool(instanceId);
                    }}
                    style={{ visibility: getOpenTools().get(instanceId)?.isPinned ? "hidden" : undefined }}
                >
                    ×
                </button>
            </span>
        ),
        content: isDetailTab ? <LocalPageSurface instanceId={instanceId} /> : <ToolSurface instanceId={instanceId} />,
    };
}

function findFirstPanel(box: LayoutBase["dockbox"]): PanelBase | null {
    for (const child of box.children) {
        if ("children" in child) {
            const nested = findFirstPanel(child);
            if (nested) return nested;
        } else {
            return child;
        }
    }
    return null;
}

function reconcileLayout(layout: LayoutBase, instanceIds: string[], activeId: string | null): LayoutBase {
    const validIds = new Set(instanceIds);
    const presentIds = new Set<string>();

    const reconcileBox = (box: LayoutBase["dockbox"]): LayoutBase["dockbox"] => ({
        ...box,
        children: box.children
            .map((child) => {
                if ("children" in child) {
                    const nextBox = reconcileBox(child);
                    return nextBox.children.length > 0 ? nextBox : null;
                }

                const tabs = child.tabs.filter((tab) => {
                    if (!tab.id || !validIds.has(tab.id)) return false;
                    presentIds.add(tab.id);
                    return true;
                });
                if (tabs.length === 0) return null;
                return {
                    ...child,
                    tabs,
                    activeId: tabs.some((tab) => tab.id === child.activeId) ? child.activeId : tabs[0].id,
                } as PanelBase;
            })
            .filter((child): child is NonNullable<typeof child> => child !== null),
    });

    const dockbox = reconcileBox(layout.dockbox);
    const missingIds = instanceIds.filter((id) => !presentIds.has(id));
    if (missingIds.length > 0) {
        const firstPanel = findFirstPanel(dockbox);
        if (firstPanel) {
            firstPanel.tabs.push(...missingIds.map((id) => ({ id })));
            firstPanel.activeId = activeId && missingIds.includes(activeId) ? activeId : missingIds[missingIds.length - 1];
        } else {
            dockbox.children.push({ tabs: missingIds.map((id) => ({ id })), activeId: activeId && missingIds.includes(activeId) ? activeId : missingIds[missingIds.length - 1] });
        }
    }

    return { dockbox };
}

function DockLayoutSpike() {
    const dockRef = useRef<DockLayout>(null);
    const [revision, setRevision] = useState(0);
    const [layout, setLayout] = useState<LayoutBase>({ dockbox: { mode: "horizontal", children: [] } });
    const tools = Array.from(getOpenTools().values());
    const toolIds = tools.map((tool) => tool.instanceId);
    const toolKey = toolIds.join("\u0000");
    const tabs = Object.fromEntries(tools.map((tool) => [tool.instanceId, createTabDefinition(tool.instanceId, tool.tool?.name ?? tool.toolId, Boolean(tool.isDetailTab))]));

    useEffect(() => {
        const onToolsChanged = () => setRevision((value) => value + 1);
        window.addEventListener(DOCK_TOOLS_CHANGED_EVENT, onToolsChanged);
        return () => window.removeEventListener(DOCK_TOOLS_CHANGED_EVENT, onToolsChanged);
    }, []);

    useEffect(() => {
        const observer = new MutationObserver(() => {
            window.api.send("tool-window:dock-drag-state-changed", document.body.classList.contains("dock-dragging"));
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setLayout((current) => reconcileLayout(dockRef.current?.saveLayout() ?? current, toolIds, tools[tools.length - 1]?.instanceId ?? null));
    }, [toolKey, revision]);

    useEffect(() => {
        const selectTab = (event: Event) => {
            const id = (event as CustomEvent<string>).detail;
            const dock = dockRef.current;
            const tab = dock?.find(id);
            if (dock && tab && "id" in tab) dock.dockMove(tab as TabData, null, "front");
        };
        const moveTab = (event: Event) => {
            const { instanceId, direction } = (event as CustomEvent<{ instanceId: string; direction: "right" | "bottom" }>).detail;
            const dock = dockRef.current;
            const tab = dock?.find(instanceId);
            const target = dock?.find((item) => "tabs" in item && (item as PanelBase).tabs.some((other) => other.id !== instanceId));
            if (dock && tab && target && "tabs" in target && "id" in tab) dock.dockMove(tab as TabData, target, direction);
        };
        window.addEventListener(DOCK_TAB_SELECTED_EVENT, selectTab);
        window.addEventListener(DOCK_MOVE_TAB_EVENT, moveTab);
        return () => {
            window.removeEventListener(DOCK_TAB_SELECTED_EVENT, selectTab);
            window.removeEventListener(DOCK_MOVE_TAB_EVENT, moveTab);
        };
    }, []);

    const reportBounds = () => {
        requestAnimationFrame(() => {
            const bounds = Array.from(document.querySelectorAll<HTMLElement>("#dock-layout-root .dock-tabpane-active .dock-tool-surface"))
                .map((surface) => {
                    const rect = surface.getBoundingClientRect();
                    return {
                        instanceId: surface.dataset.toolInstanceId ?? "",
                        x: Math.round(rect.left),
                        y: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    };
                })
                .filter((item) => item.instanceId && item.width > 0 && item.height > 0);
            window.api.send("tool-window:dock-bounds-changed", bounds);
        });
    };

    useLayoutEffect(() => {
        const root = document.getElementById("dock-layout-root");
        if (!root) return;
        const observer = new ResizeObserver(reportBounds);
        observer.observe(root);
        root.querySelectorAll<HTMLElement>(".dock-tool-surface").forEach((surface) => observer.observe(surface));
        reportBounds();
        const frame = requestAnimationFrame(() => void refreshDockAppearance());
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [layout, toolKey]);

    const onLayoutChange = (nextLayout: LayoutBase, currentTabId?: string, direction?: DropDirection) => {
        if (direction === "float" || direction === "new-window") return;
        setLayout(nextLayout);
        if (currentTabId && direction === "active" && currentTabId !== getActiveToolId()) {
            void switchToTool(currentTabId);
        }
        reportBounds();
    };

    if (tools.length === 0) return null;

    return (
        <DockLayout
            ref={dockRef}
            layout={layout}
            groups={groups}
            loadTab={(tab: TabBase) => tabs[tab.id ?? ""]}
            dropMode="edge"
            onLayoutChange={onLayoutChange}
            style={{ position: "absolute", inset: 0 }}
        />
    );
}

export function initDockLayoutSpike(): void {
    const mount = document.getElementById("dock-layout-root");
    if (!mount) return;

    mount.addEventListener("contextmenu", (event) => {
        const tab = (event.target as Element).closest<HTMLElement>(".dock-tab");
        if (!tab || !mount.contains(tab)) return;
        const title = tab.querySelector<HTMLElement>("[data-dock-instance-id]");
        const instanceId = title?.dataset.dockInstanceId;
        if (!instanceId) return;
        event.preventDefault();
        event.stopPropagation();
        void showTabContextMenu(instanceId, event.clientX, event.clientY);
    });
    mount.addEventListener("dragstart", () => window.api.send("tool-window:dock-drag-state-changed", true));
    mount.addEventListener("dragend", () => window.api.send("tool-window:dock-drag-state-changed", false));
    createRoot(mount).render(<DockLayoutSpike />);
}
