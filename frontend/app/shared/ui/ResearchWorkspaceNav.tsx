import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { goBackOrDashboard, navigateTo, parseAlphaTraceRoute } from "@/shared/lib/navigation";

interface NavItem {
  key: string;
  labelEn: string;
  labelZh: string;
  path: string;
}

interface ResearchWorkspaceNavProps {
  className?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", labelEn: "Dashboard", labelZh: "总览", path: "/dashboard" },
  { key: "strategy-radar", labelEn: "Radar", labelZh: "雷达", path: "/strategy-radar" },
  { key: "asset-research", labelEn: "Assets", labelZh: "资产", path: "/assets" },
  { key: "agent-lab", labelEn: "Agents", labelZh: "Agent", path: "/agent-lab" },
  { key: "strategy-lab", labelEn: "Strategies", labelZh: "策略", path: "/strategy-lab" },
  { key: "evidence-center", labelEn: "Evidence", labelZh: "证据", path: "/evidence" },
  { key: "decision-attribution", labelEn: "Decisions", labelZh: "归因", path: "/decision-attribution" },
  { key: "portfolio-workspace", labelEn: "Portfolio", labelZh: "组合", path: "/portfolio" },
  { key: "leaderboard", labelEn: "Rank", labelZh: "排行", path: "/leaderboard" },
  { key: "data-sources", labelEn: "Sources", labelZh: "数据源", path: "/data-sources" },
  { key: "data-import", labelEn: "Import", labelZh: "导入", path: "/data-import" },
  { key: "settings-workbench", labelEn: "Settings", labelZh: "设置", path: "/settings" },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  { key: "dashboard", labelEn: "Home", labelZh: "总览", path: "/dashboard" },
  { key: "asset-research", labelEn: "Assets", labelZh: "资产", path: "/assets" },
  { key: "agent-lab", labelEn: "Agent", labelZh: "Agent", path: "/agent-lab" },
  { key: "portfolio-workspace", labelEn: "Portfolio", labelZh: "组合", path: "/portfolio" },
];

const getCurrentHashPage = (): string => {
  if (typeof window === "undefined") return "dashboard";
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return "dashboard";
  const alphaTraceTarget = parseAlphaTraceRoute(hash);
  if (alphaTraceTarget) return alphaTraceTarget.page;
  const idx = hash.indexOf("?");
  return idx === -1 ? hash : hash.slice(0, idx);
};

export default function ResearchWorkspaceNav({ className }: ResearchWorkspaceNavProps) {
  const { i18n } = useTranslation();
  const [currentPage, setCurrentPage] = useState<string>(getCurrentHashPage());
  const isZh = i18n.language?.startsWith("zh");

  useEffect(() => {
    const syncCurrentPage = () => setCurrentPage(getCurrentHashPage());
    window.addEventListener("hashchange", syncCurrentPage);
    window.addEventListener("popstate", syncCurrentPage);
    return () => {
      window.removeEventListener("hashchange", syncCurrentPage);
      window.removeEventListener("popstate", syncCurrentPage);
    };
  }, []);

  const normalizedCurrentPage = useMemo(() => {
    if (currentPage === "asset-detail") return "asset-research";
    if (currentPage === "agent-run-detail") return "agent-lab";
    return currentPage;
  }, [currentPage]);

  return (
    <>
      <div className={`rounded-md border bg-card px-3 py-2 shadow-sm ${className ?? ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={normalizedCurrentPage === item.key ? "default" : "ghost"}
                className="h-8 px-3 text-xs"
                onClick={() => navigateTo(item.path)}
              >
                {isZh ? item.labelZh : item.labelEn}
              </Button>
            ))}
          </div>
          {normalizedCurrentPage !== "dashboard" ? (
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={goBackOrDashboard}
              >
                {isZh ? "返回" : "Back"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => navigateTo("/dashboard")}
              >
                Dashboard
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="md:hidden h-16" aria-hidden="true" />
      <div className="md:hidden fixed inset-x-3 bottom-3 z-40 rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur">
        <div className="grid grid-cols-4 gap-1">
          {MOBILE_NAV_ITEMS.map((item) => (
            <Button
              key={item.key}
              size="sm"
              variant={normalizedCurrentPage === item.key ? "default" : "ghost"}
              className="h-10 px-1 text-[11px]"
              onClick={() => navigateTo(item.path)}
            >
              {isZh ? item.labelZh : item.labelEn}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}
