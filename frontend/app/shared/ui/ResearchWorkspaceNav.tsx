import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { navigateTo, parseAlphaTraceRoute } from "@/shared/lib/navigation";

interface NavItem {
  key: string;
  labelEn: string;
  labelZh: string;
  path: string;
}

interface ResearchWorkspaceNavProps {
  className?: string;
  hideImport?: boolean;
}

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
      <div className={`hidden ${className ?? ""}`} aria-hidden="true" />

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
