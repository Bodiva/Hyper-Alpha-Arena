export const COLLAPSE_WORKSPACE_SIDEBAR_EVENT = "alphatrace:collapse-workspace-sidebar";

export const collapseWorkspaceSidebar = () => {
  window.dispatchEvent(new Event(COLLAPSE_WORKSPACE_SIDEBAR_EVENT));
};
