import type { DataCenterCatalogResponse } from "@/entities/runtime/api";

interface DataCenterPanelProps {
  catalog?: DataCenterCatalogResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const statusTone = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (value === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("optional")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value.includes("planned")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
};

const storeTone = (store?: string) => {
  const value = (store || "").toLowerCase();
  if (value.includes("clickhouse")) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  if (value.includes("mysql")) return "bg-sky-50 text-sky-700 ring-sky-200";
  if (value.includes("static")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
};

const ChipList = ({ items, limit }: { items?: string[]; limit: number }) => {
  const visibleItems = (items || []).slice(0, limit);
  if (!visibleItems.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visibleItems.map((item) => (
        <span key={item} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-100">
          {item}
        </span>
      ))}
    </div>
  );
};

export const DataCenterPanel = ({ catalog, loading = false, error = null, compact = false }: DataCenterPanelProps) => {
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
        Data Center catalog unavailable: {error}
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Data Center catalog has not been loaded.
      </section>
    );
  }

  const connectors = compact ? catalog.connectors.slice(0, 4) : catalog.connectors;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Data Center Control Plane</h3>
          <p className="mt-1 text-sm text-slate-500">
            {catalog.message || "Connector governance, ingestion modes, credential policy, and target store routing."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{catalog.total} connectors</span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {connectors.map((connector) => (
          <article key={connector.connector_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{connector.display_name}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{connector.connector_id} · {connector.connector_type}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(connector.status)}`}>
                  {connector.status}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${storeTone(connector.target_store)}`}>
                  {connector.target_store}
                </span>
              </div>
            </div>

            <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
              <div>
                <span className="font-medium text-slate-700">Ingestion:</span> {connector.ingestion_mode}
              </div>
              <div>
                <span className="font-medium text-slate-700">Credentials:</span> {connector.credential_policy}
              </div>
              <div className="md:col-span-2">
                <span className="font-medium text-slate-700">Freshness:</span> {connector.freshness_policy}
              </div>
            </div>

            <ChipList items={connector.data_domains} limit={compact ? 4 : 8} />
            {!compact && connector.notes ? <p className="mt-2 text-xs leading-5 text-slate-600">{connector.notes}</p> : null}
          </article>
        ))}
      </div>

      {!compact && catalog.policies ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">Data Center Policies</div>
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

export default DataCenterPanel;
