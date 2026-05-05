import type { ArchitectureReviewBundleResponse } from "@/entities/runtime/api";
import AgentSkillPanel from "./AgentSkillPanel";
import DataCenterPanel from "./DataCenterPanel";
import ExternalComponentPanel from "./ExternalComponentPanel";
import IntegrationDecisionPanel from "./IntegrationDecisionPanel";
import ModuleBoundaryPanel from "./ModuleBoundaryPanel";
import RuntimeReadinessPanel from "./RuntimeReadinessPanel";

interface ArchitectureReviewPanelProps {
  review?: ArchitectureReviewBundleResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

export const ArchitectureReviewPanel = ({ review, loading = false, error = null, compact = false }: ArchitectureReviewPanelProps) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-5 w-64 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Architecture review unavailable: {error}
      </section>
    );
  }

  if (!review) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Architecture review bundle has not been loaded.
      </section>
    );
  }

  const summaryCards = [
    ["Layers", review.summary?.layers],
    ["Modules", review.summary?.modules],
    ["External", review.summary?.externalComponents],
    ["Decisions", review.summary?.integrationDecisions],
    ["Data Center", review.summary?.dataCenterConnectors],
    ["Skills", review.summary?.skills],
    ["Readiness", review.summary?.readiness],
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">AlphaTrace Architecture Review</h2>
            <p className="mt-1 text-sm text-slate-500">
              {review.message || "Consolidated runtime boundaries, external integration decisions, and readiness diagnostics."}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">v{review.version}</span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {summaryCards.map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{String(value ?? "-")}</div>
            </div>
          ))}
        </div>

        {!compact && review.policies ? (
          <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
            <div className="text-sm font-semibold text-slate-800">Review Policies</div>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
              {Object.entries(review.policies).map(([key, value]) => (
                <li key={key}>
                  <span className="font-medium text-slate-700">{key}</span>: {value}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <RuntimeReadinessPanel readiness={review.readiness} compact={compact} />
      <ModuleBoundaryPanel catalog={review.moduleBoundaries} compact={compact} />
      <DataCenterPanel catalog={review.dataCenter} compact={compact} />
      <AgentSkillPanel catalog={review.skills} compact={compact} />
      <ExternalComponentPanel catalog={review.externalComponents} compact={compact} />
      <IntegrationDecisionPanel guide={review.integrationDecisions} compact={compact} />
    </section>
  );
};

export default ArchitectureReviewPanel;
