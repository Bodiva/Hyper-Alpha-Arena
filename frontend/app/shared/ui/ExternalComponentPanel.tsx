import type { ExternalComponentCatalogResponse } from "@/entities/runtime/api";

interface ExternalComponentPanelProps {
  catalog?: ExternalComponentCatalogResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const modeTone = (mode?: string) => {
  const value = (mode || "").toLowerCase();
  if (value.includes("runner")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value.includes("tool") || value.includes("evidence")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("service") || value.includes("workbench")) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  if (value.includes("disabled") || value.includes("design")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
};

const statusTone = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (value.includes("active")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("poc") || value.includes("optional")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value.includes("design")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
};

const BulletList = ({ title, items, limit }: { title: string; items?: string[]; limit?: number }) => {
  const visibleItems = (items || []).slice(0, limit);
  if (!visibleItems.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-600">
        {visibleItems.map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ExternalComponentPanel = ({ catalog, loading = false, error = null, compact = false }: ExternalComponentPanelProps) => {
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
        External component catalog unavailable: {error}
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        External component catalog has not been loaded.
      </section>
    );
  }

  const components = compact ? catalog.components.slice(0, 4) : catalog.components;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">External Component Integration</h3>
          <p className="mt-1 text-sm text-slate-500">
            {catalog.message || "Safe integration boundaries for OSS runtimes, external APIs, and future providers."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{catalog.total} components</span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {components.map((component) => (
          <article key={component.component_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{component.display_name}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{component.component_id} · {component.source_type}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${modeTone(component.integration_mode)}`}>
                  {component.integration_mode}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(component.status)}`}>
                  {component.status}
                </span>
              </div>
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-600">{component.product_role}</p>
            <code className="mt-2 inline-block rounded bg-white px-2 py-1 text-[11px] text-slate-600 ring-1 ring-slate-100">
              {component.adapter_boundary}
            </code>

            <div className={`mt-3 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
              <BulletList title="Useful Capabilities" items={component.viable_capabilities} limit={compact ? 2 : 4} />
              <BulletList title="Non-goals" items={component.non_goals} limit={compact ? 2 : 4} />
            </div>

            {!compact ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <BulletList title="Risks" items={component.risk_notes} limit={3} />
                <BulletList title="Next Steps" items={component.next_steps} limit={3} />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};

export default ExternalComponentPanel;
