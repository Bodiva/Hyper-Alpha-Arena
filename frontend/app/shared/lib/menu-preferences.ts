export const HIDE_AUTOMATION_TRADING_OPS_STORAGE_KEY = "alphatrace.ui.hideAutomationTradingOps";
export const MENU_PREFERENCES_CHANGED_EVENT = "alphatrace:menu-preferences-changed";

export const getHideAutomationTradingOps = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HIDE_AUTOMATION_TRADING_OPS_STORAGE_KEY) === "true";
};

export const setHideAutomationTradingOps = (value: boolean): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HIDE_AUTOMATION_TRADING_OPS_STORAGE_KEY, value ? "true" : "false");
  window.dispatchEvent(new CustomEvent(MENU_PREFERENCES_CHANGED_EVENT, { detail: { hideAutomationTradingOps: value } }));
};
