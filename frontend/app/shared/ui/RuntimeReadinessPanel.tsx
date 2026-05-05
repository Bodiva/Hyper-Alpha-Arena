import type { RuntimeReadinessResponse } from "@/entities/runtime/api";

interface RuntimeReadinessPanelProps {
  readiness?: RuntimeReadinessResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  degraded: "Degraded",
  action_required: "Action Required",
  unknown: "Unknown",
};

const STATUS_CLASS: Record<string, string> = {
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  degraded: "bg-amber-50 text-amber-700 ring-amber-200",
  action_required: "bg-rose-50 text-rose-700 ring-rose-200",
  unknown: "bg-slate-50 text-slate-600 ring-slate-200",
};

const statusClass = (status?: string) => STATUS_CLASS[status || "unknown"] || STATUS_CLASS.unknown;
const statusLabel = (status?: string) => STATUS_LABEL[status || "unknown"] || status || "Unknown";

const sectionStatus = (value: unknown): string => {
  if (!value || typeof value !== "object") return "unknown";
  const status = (value as { status?: unknown }).status;
  return typeof status === "string" ? status : "unknown";
};

export const RuntimeReadinessPanel = ({ readiness, loading = false, error = null, compact = false }: RuntimeReadinessPanelProps) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-16 animate-pulse rounded bg-slate-50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Runtime readiness unavailable: {error}
      </section>
    );
  }

  if (!readiness) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Runtime readiness has not been loaded.
      </section>
    );
  }

  const sections = Object.entries(readiness.sections || {});
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Runtime Readiness</h3>
          <p className="mt-1 text-sm text-slate-500">{readiness.message || "Sanitized runtime health across providers and orchestrators."}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(readiness.overallStatus)}`}>
          {statusLabel(readiness.overallStatus)}
        </span>
      </div>

      <div className={`mt-4 grid gap-2 ${compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
        {sections.map(([key, value]) => {
          const status = sectionStatus(value);
          return (
            <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{key}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusClass(status)}`}>
                  {statusLabel(status)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {readiness.actionItems?.length ? (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3">
          <div className="text-sm font-semibold text-amber-800">Action Items</div>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {readiness.actionItems.slice(0, compact ? 3 : 6).map((item) => (
              <li key={`${item.area}-${item.severity}-${item.message}`} className="leading-5">
                <span className="font-medium">{item.area}</span>: {item.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default RuntimeReadinessPanel;
