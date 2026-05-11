export type RouteParams = Record<string, string | number | boolean | undefined | null>;

export interface RouteTarget {
  page: string;
  query?: string;
}

const normalizePath = (pathname: string): string => {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
};

const ALPHA_TRACE_BASE_PATH = "/dashboard";

const mergeQueryStrings = (...queries: Array<string | undefined>): string => {
  const merged = new URLSearchParams();

  queries
    .filter((query): query is string => Boolean(query))
    .forEach((query) => {
      new URLSearchParams(query).forEach((value, key) => {
        merged.set(key, value);
      });
    });

  return merged.toString();
};

const appendQuery = (route: string, query?: string): string => (query ? `${route}?${query}` : route);

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    console.warn(`[AlphaTrace] Failed to decode route segment: ${value}`, error);
    return value;
  }
};

const createTarget = (page: string, routeQuery?: string, hashQuery?: string): RouteTarget => {
  const query = mergeQueryStrings(routeQuery, hashQuery);
  return query ? { page, query } : { page };
};

const resolvePathToRouteTarget = (pathname: string): RouteTarget | null => {
  const normalizedPath = normalizePath(pathname);

  if (normalizedPath === "/dashboard") return { page: "dashboard" };
  if (normalizedPath === "/dashboard-test" || normalizedPath === "/dashboard/test") return { page: "dashboard-test" };
  if (normalizedPath === "/assets") return { page: "asset-research" };
  if (normalizedPath === "/hyper-ai" || normalizedPath === "/hyperai") return { page: "hyper-ai" };
  if (
    normalizedPath === "/research/assistant" ||
    normalizedPath === "/research/research-assistant" ||
    normalizedPath === "/research/hyper-ai" ||
    normalizedPath === "/research/hyperai"
  ) {
    return { page: "research-assistant-lab" };
  }
  if (normalizedPath === "/research/assistant-legacy" || normalizedPath === "/research/hyper-ai-legacy") {
    return { page: "research-hyper-ai" };
  }
  if (
    normalizedPath === "/research/assistant-lab" ||
    normalizedPath === "/research/workbench-lab" ||
    normalizedPath === "/research/chat-lab"
  ) {
    return { page: "research-assistant-lab" };
  }
  if (normalizedPath === "/research/ai-traders" || normalizedPath === "/research/traders") {
    return { page: "research-ai-traders" };
  }
  if (
    normalizedPath === "/research/runtime-config" ||
    normalizedPath === "/research/runtime" ||
    normalizedPath === "/research/capabilities"
  ) {
    return { page: "research-runtime-config" };
  }
  if (normalizedPath === "/research/prompts" || normalizedPath === "/research/prompt-templates") {
    return { page: "research-prompts" };
  }
  if (
    normalizedPath === "/ai-traders" ||
    normalizedPath === "/traders" ||
    normalizedPath === "/trader-management"
  ) {
    return { page: "trader-management" };
  }
  if (
    normalizedPath === "/prompts" ||
    normalizedPath === "/prompt-templates" ||
    normalizedPath === "/prompt-management"
  ) {
    return { page: "prompt-management" };
  }
  if (normalizedPath === "/agent-lab") return { page: "agent-lab" };
  if (normalizedPath === "/strategy-lab") return { page: "strategy-lab" };
  if (normalizedPath === "/strategy-radar") return { page: "strategy-radar" };
  if (normalizedPath === "/leaderboard") return { page: "leaderboard" };
  if (normalizedPath === "/portfolio") return { page: "portfolio-workspace" };
  if (normalizedPath === "/evidence") return { page: "evidence-center" };
  if (normalizedPath === "/data-sources" || normalizedPath === "/data-source" || normalizedPath === "/datasource") {
    return { page: "data-sources" };
  }
  if (normalizedPath === "/data-catalog" || normalizedPath === "/data-center" || normalizedPath === "/catalog") {
    return { page: "data-catalog" };
  }
  if (normalizedPath === "/data-import" || normalizedPath === "/data-imports") {
    return { page: "data-import" };
  }
  if (normalizedPath === "/lixinger" || normalizedPath === "/lixinger-data" || normalizedPath === "/data/lixinger") {
    return { page: "lixinger-data" };
  }
  if (normalizedPath === "/clickhouse" || normalizedPath === "/clickhouse-data" || normalizedPath === "/data/clickhouse") {
    return { page: "data-catalog", query: "tab=clickhouse" };
  }
  if (normalizedPath === "/decision-attribution" || normalizedPath === "/decisions") {
    return { page: "decision-attribution" };
  }
  if (normalizedPath === "/runtime-logs" || normalizedPath === "/logs") return { page: "runtime-logs" };
  if (normalizedPath === "/settings") return { page: "settings-workbench" };

  const assetDetailMatch = normalizedPath.match(/^\/assets\/([^/]+)$/);
  if (assetDetailMatch) {
    const assetId = safeDecodeURIComponent(assetDetailMatch[1]);
    return {
      page: "asset-detail",
      query: new URLSearchParams({ assetId }).toString(),
    };
  }

  const runDetailMatch = normalizedPath.match(/^\/agent-lab\/runs\/([^/]+)$/);
  if (runDetailMatch) {
    const runId = safeDecodeURIComponent(runDetailMatch[1]);
    return {
      page: "agent-run-detail",
      query: new URLSearchParams({ runId }).toString(),
    };
  }

  return null;
};

export const parseAlphaTraceRoute = (value?: string): RouteTarget | null => {
  if (!value) return null;

  let routeValue = value.trim();
  const hashIndex = routeValue.indexOf("#");
  if (hashIndex !== -1) {
    routeValue = routeValue.slice(hashIndex + 1);
  }
  if (routeValue.startsWith("#")) {
    routeValue = routeValue.slice(1);
  }
  routeValue = routeValue.replace(/^\/+/, "");
  if (!routeValue) return null;

  const queryIndex = routeValue.indexOf("?");
  const routePart = queryIndex === -1 ? routeValue : routeValue.slice(0, queryIndex);
  const hashQuery = queryIndex === -1 ? "" : routeValue.slice(queryIndex + 1);
  const normalizedRoute = routePart.replace(/^\/+|\/+$/g, "");
  const segments = normalizedRoute.split("/").filter(Boolean);

  if (normalizedRoute === "dashboard") return createTarget("dashboard", undefined, hashQuery);
  if (normalizedRoute === "dashboard-test" || normalizedRoute === "dashboard/test") {
    return createTarget("dashboard-test", undefined, hashQuery);
  }
  if (normalizedRoute === "assets") return createTarget("asset-research", undefined, hashQuery);
  if (normalizedRoute === "hyper-ai" || normalizedRoute === "hyperai") {
    return createTarget("hyper-ai", undefined, hashQuery);
  }
  if (
    normalizedRoute === "research/assistant" ||
    normalizedRoute === "research/research-assistant" ||
    normalizedRoute === "research/hyper-ai" ||
    normalizedRoute === "research/hyperai"
  ) {
    return createTarget("research-assistant-lab", undefined, hashQuery);
  }
  if (normalizedRoute === "research/assistant-legacy" || normalizedRoute === "research/hyper-ai-legacy") {
    return createTarget("research-hyper-ai", undefined, hashQuery);
  }
  if (
    normalizedRoute === "research/assistant-lab" ||
    normalizedRoute === "research/workbench-lab" ||
    normalizedRoute === "research/chat-lab"
  ) {
    return createTarget("research-assistant-lab", undefined, hashQuery);
  }
  if (normalizedRoute === "research/ai-traders" || normalizedRoute === "research/traders") {
    return createTarget("research-ai-traders", undefined, hashQuery);
  }
  if (
    normalizedRoute === "research/runtime-config" ||
    normalizedRoute === "research/runtime" ||
    normalizedRoute === "research/capabilities"
  ) {
    return createTarget("research-runtime-config", undefined, hashQuery);
  }
  if (normalizedRoute === "research/prompts" || normalizedRoute === "research/prompt-templates") {
    return createTarget("research-prompts", undefined, hashQuery);
  }
  if (
    normalizedRoute === "ai-traders" ||
    normalizedRoute === "traders" ||
    normalizedRoute === "trader-management"
  ) {
    return createTarget("trader-management", undefined, hashQuery);
  }
  if (
    normalizedRoute === "prompts" ||
    normalizedRoute === "prompt-templates" ||
    normalizedRoute === "prompt-management"
  ) {
    return createTarget("prompt-management", undefined, hashQuery);
  }
  if (segments[0] === "assets" && segments[1]) {
    return createTarget(
      "asset-detail",
      new URLSearchParams({ assetId: safeDecodeURIComponent(segments[1]) }).toString(),
      hashQuery,
    );
  }
  if (normalizedRoute === "agent-lab") return createTarget("agent-lab", undefined, hashQuery);
  if (segments[0] === "agent-lab" && segments[1] === "runs" && segments[2]) {
    return createTarget(
      "agent-run-detail",
      new URLSearchParams({ runId: safeDecodeURIComponent(segments[2]) }).toString(),
      hashQuery,
    );
  }
  if (normalizedRoute === "strategy-lab") return createTarget("strategy-lab", undefined, hashQuery);
  if (normalizedRoute === "strategy-radar") return createTarget("strategy-radar", undefined, hashQuery);
  if (normalizedRoute === "leaderboard") return createTarget("leaderboard", undefined, hashQuery);
  if (normalizedRoute === "portfolio") return createTarget("portfolio-workspace", undefined, hashQuery);
  if (normalizedRoute === "evidence") return createTarget("evidence-center", undefined, hashQuery);
  if (normalizedRoute === "data-sources" || normalizedRoute === "data-source" || normalizedRoute === "datasource") {
    return createTarget("data-sources", undefined, hashQuery);
  }
  if (normalizedRoute === "data-catalog" || normalizedRoute === "data-center" || normalizedRoute === "catalog") {
    return createTarget("data-catalog", undefined, hashQuery);
  }
  if (normalizedRoute === "data-import" || normalizedRoute === "data-imports") {
    return createTarget("data-import", undefined, hashQuery);
  }
  if (normalizedRoute === "lixinger" || normalizedRoute === "lixinger-data" || normalizedRoute === "data/lixinger") {
    return createTarget("lixinger-data", undefined, hashQuery);
  }
  if (normalizedRoute === "clickhouse" || normalizedRoute === "clickhouse-data" || normalizedRoute === "data/clickhouse") {
    return createTarget("data-catalog", "tab=clickhouse", hashQuery);
  }
  if (normalizedRoute === "decision-attribution" || normalizedRoute === "decisions") {
    return createTarget("decision-attribution", undefined, hashQuery);
  }
  if (normalizedRoute === "runtime-logs" || normalizedRoute === "logs") {
    return createTarget("runtime-logs", undefined, hashQuery);
  }
  if (normalizedRoute === "settings") return createTarget("settings-workbench", undefined, hashQuery);

  const pathTarget = resolvePathToRouteTarget(`/${normalizedRoute}`);
  if (pathTarget) {
    return createTarget(pathTarget.page, pathTarget.query, hashQuery);
  }

  return null;
};

export const routeTargetToAlphaTraceHash = (target: RouteTarget): string => {
  const query = new URLSearchParams(target.query ?? "");

  if (target.page === "asset-detail") {
    const assetId = query.get("assetId");
    query.delete("assetId");
    return appendQuery(assetId ? `assets/${encodeURIComponent(assetId)}` : "assets", query.toString());
  }

  if (target.page === "agent-run-detail") {
    const runId = query.get("runId");
    query.delete("runId");
    return appendQuery(runId ? `agent-lab/runs/${encodeURIComponent(runId)}` : "agent-lab", query.toString());
  }

  if (target.page === "clickhouse-data") {
    query.set("tab", query.get("tab") ?? "clickhouse");
    return appendQuery("data-catalog", query.toString());
  }

  const publicRouteByPage: Record<string, string> = {
    dashboard: "dashboard",
    "dashboard-test": "dashboard-test",
    "asset-research": "assets",
    "research-hyper-ai": "research/assistant-legacy",
    "research-assistant-lab": "research/assistant",
    "research-ai-traders": "research/ai-traders",
    "research-prompts": "research/prompts",
    "hyper-ai": "hyper-ai",
    "trader-management": "trader-management",
    "prompt-management": "prompt-management",
    "agent-lab": "agent-lab",
    "strategy-lab": "strategy-lab",
    "strategy-radar": "strategy-radar",
    leaderboard: "leaderboard",
    "portfolio-workspace": "portfolio",
    "evidence-center": "evidence",
    "data-sources": "data-sources",
    "data-catalog": "data-catalog",
    "data-import": "data-import",
    "lixinger-data": "lixinger",
    "clickhouse-data": "clickhouse-data",
    "decision-attribution": "decision-attribution",
    "runtime-logs": "runtime-logs",
    "settings-workbench": "settings",
  };

  return appendQuery(publicRouteByPage[target.page] ?? target.page, query.toString());
};

const safeWindow = (): Window | null => (typeof window === "undefined" ? null : window);

export const buildRoute = (path: string, params?: RouteParams): string => {
  const [pathnameRaw, existingQuery = ""] = path.split("?");
  const pathname = pathnameRaw || "/";
  const query = new URLSearchParams(existingQuery);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      query.set(key, String(value));
    });
  }

  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
};

export const createHashUrl = (path: string, params?: RouteParams): string => {
  const route = buildRoute(path, params);
  const routeTarget = parseAlphaTraceRoute(route);
  if (!routeTarget) {
    const hash = route.replace(/^\/+/, "");
    return `${ALPHA_TRACE_BASE_PATH}#${hash}`;
  }
  return `${ALPHA_TRACE_BASE_PATH}#${routeTargetToAlphaTraceHash(routeTarget)}`;
};

export const navigateTo = (path: string, params?: RouteParams): void => {
  const win = safeWindow();
  if (!win) return;

  win.history.pushState(null, "", createHashUrl(path, params));
  win.dispatchEvent(new Event("hashchange"));
};

export const goBackOrDashboard = (): void => {
  const win = safeWindow();
  if (!win) return;

  if (win.history.length > 1) {
    win.history.back();
    return;
  }

  navigateTo("/dashboard");
};

export const getCurrentHashQueryParams = (): URLSearchParams => {
  const win = safeWindow();
  if (!win) return new URLSearchParams();
  const hash = win.location.hash.startsWith("#") ? win.location.hash.slice(1) : win.location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(hash.slice(queryIndex + 1));
};

export const getHashQueryParam = (key: string): string | undefined => {
  const value = getCurrentHashQueryParams().get(key);
  return value ?? undefined;
};
