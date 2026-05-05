import type { IntegrationDecisionGuideResponse } from "@/entities/runtime/api";

interface IntegrationDecisionPanelProps {
  guide?: IntegrationDecisionGuideResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const gateTone = (gate?: string) => {
  const value = (gate || "").toLowerCase();
  if (value.includes("active") || value.includes("ready")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("required") || value.includes("selection")) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (value.includes("design")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-blue-50 text-blue-700 ring-blue-200";
};

const Checklist = ({ title, items, tone = "slate", limit }: { title: string; items?: string[]; tone?: "slate" | "green" | "red" | "blue"; limit?: number }) => {
  const visibleItems = (items || []).slice(0, limit);
  if (!visibleItems.length) return null;
  const dotClass = tone === "green" ? "bg-emerald-500" : tone === "red" ? "bg-rose-500" : tone === "blue" ? "bg-blue-500" : "bg-slate-400";
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-600">
        {visibleItems.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const IntegrationDecisionPanel = ({ guide, loading = false, error = null, compact = false }: IntegrationDecisionPanelProps) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-24 animate-pulse rounded bg-slate-50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Integration decision guide unavailable: {error}
      </section>
    );
  }

  if (!guide) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Integration decision guide has not been loaded.
      </section>
    );
  }

  const decisions = compact ? guide.decisions.slice(0, 4) : guide.decisions;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Integration Decision Guide</h3>
          <p className="mt-1 text-sm text-slate-500">
            {guide.message || "Proceed/stop criteria for integrating external runtimes, workbenches, tools, and data providers."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{guide.total} decisions</span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {decisions.map((decision) => (
          <article key={decision.component_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{decision.component_id}</h4>
                <p className="mt-1 text-xs leading-5 text-slate-600">{decision.recommended_path}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${gateTone(decision.current_gate)}`}>
                {decision.current_gate}
              </span>
            </div>

            <div className={`mt-3 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
              <Checklist title="Proceed when" items={decision.proceed_when} tone="green" limit={compact ? 2 : 4} />
              <Checklist title="Stop if" items={decision.stop_if} tone="red" limit={compact ? 2 : 4} />
              {!compact ? <Checklist title="AlphaTrace Contracts" items={decision.alpha_trace_contracts} tone="blue" limit={5} /> : null}
              {!compact ? <Checklist title="Validation Required" items={decision.validation_required} limit={5} /> : null}
            </div>
          </article>
        ))}
      </div>

      {!compact && guide.policies ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">Policies</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
            {Object.entries(guide.policies).map(([key, value]) => (
              <li key={key}>
                <span className="font-medium text-slate-700">{key}</span>: {value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export default IntegrationDecisionPanel;
