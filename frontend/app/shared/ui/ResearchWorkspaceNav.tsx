import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { navigateTo, parseAlphaTraceRoute } from "@/shared/lib/navigation";
import { BRAND_OWNER, PRODUCT_NAME } from "@/shared/lib/product-branding";

interface NavItem {
  key: string;
  label: string;
  path: string;
}

interface ResearchWorkspaceNavProps {
  className?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard" },
  { key: "asset-research", label: "Assets", path: "/assets" },
  { key: "agent-lab", label: "Agents", path: "/agent-lab" },
  { key: "strategy-lab", label: "Strategies", path: "/strategy-lab" },
  { key: "evidence-center", label: "Evidence", path: "/evidence" },
  { key: "decision-attribution", label: "Decisions", path: "/decision-attribution" },
  { key: "portfolio-workspace", label: "Portfolio", path: "/portfolio" },
  { key: "leaderboard", label: "Leaderboard", path: "/leaderboard" },
  { key: "data-sources", label: "Data Sources", path: "/data-sources" },
  { key: "settings-workbench", label: "Settings", path: "/settings" },
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
  const [currentPage, setCurrentPage] = useState<string>(getCurrentHashPage());

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
    <div className={`rounded-lg border bg-muted/20 p-3 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-medium">{PRODUCT_NAME} · {BRAND_OWNER}</p>
        <p className="text-[11px] text-muted-foreground">统一新工作台入口</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={normalizedCurrentPage === item.key ? "default" : "outline"}
            onClick={() => navigateTo(item.path)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
