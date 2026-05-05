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
  if (normalizedPath === "/assets") return { page: "asset-research" };
  if (normalizedPath === "/agent-lab") return { page: "agent-lab" };
  if (normalizedPath === "/strategy-lab") return { page: "strategy-lab" };
  if (normalizedPath === "/leaderboard") return { page: "leaderboard" };
  if (normalizedPath === "/portfolio") return { page: "portfolio-workspace" };
  if (normalizedPath === "/evidence") return { page: "evidence-center" };
  if (normalizedPath === "/data-sources" || normalizedPath === "/data-source" || normalizedPath === "/datasource") {
    return { page: "data-sources" };
  }
  if (normalizedPath === "/data-import" || normalizedPath === "/data-imports") {
    return { page: "data-import" };
  }
  if (normalizedPath === "/decision-attribution" || normalizedPath === "/decisions") {
    return { page: "decision-attribution" };
  }
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
  if (normalizedRoute === "assets") return createTarget("asset-research", undefined, hashQuery);
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
  if (normalizedRoute === "leaderboard") return createTarget("leaderboard", undefined, hashQuery);
  if (normalizedRoute === "portfolio") return createTarget("portfolio-workspace", undefined, hashQuery);
  if (normalizedRoute === "evidence") return createTarget("evidence-center", undefined, hashQuery);
  if (normalizedRoute === "data-sources" || normalizedRoute === "data-source" || normalizedRoute === "datasource") {
    return createTarget("data-sources", undefined, hashQuery);
  }
  if (normalizedRoute === "data-import" || normalizedRoute === "data-imports") {
    return createTarget("data-import", undefined, hashQuery);
  }
  if (normalizedRoute === "decision-attribution" || normalizedRoute === "decisions") {
    return createTarget("decision-attribution", undefined, hashQuery);
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

  const publicRouteByPage: Record<string, string> = {
    dashboard: "dashboard",
    "asset-research": "assets",
    "agent-lab": "agent-lab",
    "strategy-lab": "strategy-lab",
    leaderboard: "leaderboard",
    "portfolio-workspace": "portfolio",
    "evidence-center": "evidence",
    "data-sources": "data-sources",
    "data-import": "data-import",
    "decision-attribution": "decision-attribution",
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
