import type { DataApiCatalogResponse } from "@/entities/data-source/api";

interface DataApiCatalogPanelProps {
  catalog?: DataApiCatalogResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const statusTone = (status?: string) => {
  const normalized = (status || "").toLowerCase();
  if (["ready", "active"].includes(normalized)) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (["optional", "ready_or_fallback", "degraded"].includes(normalized)) return "bg-amber-50 text-amber-700 ring-amber-200";
  if (["planned", "design_only", "disabled"].includes(normalized)) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-rose-50 text-rose-700 ring-rose-200";
};

export const DataApiCatalogPanel = ({ catalog, loading = false, error = null, compact = false }: DataApiCatalogPanelProps) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-44 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-24 animate-pulse rounded bg-slate-50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Data API catalog unavailable: {error}
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Data API catalog has not been loaded.
      </section>
    );
  }

  const providers = compact ? catalog.providers.slice(0, 4) : catalog.providers;
  const resources = compact ? catalog.resources.slice(0, 5) : catalog.resources;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Data API Catalog</h3>
          <p className="mt-1 text-sm text-slate-500">
            {catalog.message || "Product-owned data API and provider boundaries."}
          </p>
        </div>
        <div className="flex gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">{catalog.total} resources</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">{catalog.providerTotal} providers</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-semibold text-slate-800">Providers</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {providers.map((provider) => (
            <div key={provider.provider_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{provider.display_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{provider.provider_type}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(provider.status)}`}>
                  {provider.status}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{provider.notes}</p>
            </div>
          ))}
        </div>
      </div>

      {!compact ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-slate-800">Resources</div>
          <div className="mt-2 overflow-hidden rounded-xl border border-slate-100">
            {resources.map((resource) => (
              <div key={resource.resource_id} className="border-b border-slate-100 p-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800">{resource.display_name}</div>
                  <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{resource.path}</code>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {resource.domain} · {resource.provider_id} · {resource.store_type}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default DataApiCatalogPanel;
