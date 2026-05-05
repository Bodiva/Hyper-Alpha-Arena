import type { BackendModuleBoundaryCatalogResponse } from "@/entities/runtime/api";

interface ModuleBoundaryPanelProps {
  catalog?: BackendModuleBoundaryCatalogResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const toneForBoundary = (boundaryType?: string) => {
  const value = (boundaryType || "").toLowerCase();
  if (value === "alphatrace_owned") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value === "legacy_boundary") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (value.includes("external")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value === "infrastructure_target") return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
};

const statusTone = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (["active", "ready"].includes(value)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["active_with_json_fallback", "opt_in_poc"].includes(value)) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (["quarantined_for_alphatrace", "design_only"].includes(value)) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
};

export const ModuleBoundaryPanel = ({ catalog, loading = false, error = null, compact = false }: ModuleBoundaryPanelProps) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-52 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-24 animate-pulse rounded bg-slate-50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Module boundary catalog unavailable: {error}
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Module boundary catalog has not been loaded.
      </section>
    );
  }

  const modules = compact ? catalog.modules.slice(0, 6) : catalog.modules;
  const summary = Object.entries(catalog.summary || {});

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Backend Module Boundaries</h3>
          <p className="mt-1 text-sm text-slate-500">
            {catalog.message || "AlphaTrace-owned, legacy, infrastructure, and external runtime boundaries."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{catalog.total} modules</span>
      </div>

      {summary.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.map(([key, count]) => (
            <span key={key} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${toneForBoundary(key)}`}>
              {key}: {count}
            </span>
          ))}
        </div>
      ) : null}

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
        {modules.map((module) => (
          <article key={module.module_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{module.display_name}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{module.module_id}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${toneForBoundary(module.boundary_type)}`}>
                  {module.boundary_type}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(module.status)}`}>
                  {module.status}
                </span>
              </div>
            </div>
            {module.notes ? <p className="mt-2 text-xs leading-5 text-slate-600">{module.notes}</p> : null}
            {!compact && module.directories?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {module.directories.slice(0, 4).map((directory) => (
                  <code key={directory} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-100">
                    {directory}
                  </code>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {!compact && catalog.policies ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">Policies</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
            {Object.entries(catalog.policies).map(([key, value]) => (
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

export default ModuleBoundaryPanel;
