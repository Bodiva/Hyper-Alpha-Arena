import type { ClickHouseSchemaCatalogResponse } from "@/entities/runtime/api";

interface ClickHouseSchemaPanelProps {
  catalog?: ClickHouseSchemaCatalogResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const domainTone = (domain?: string) => {
  const value = (domain || "").toLowerCase();
  if (value.includes("runtime")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value.includes("evidence")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("decision")) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  if (value.includes("market")) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (value.includes("leaderboard")) return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
};

const statusTone = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (value === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("planned")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
};

export const ClickHouseSchemaPanel = ({ catalog, loading = false, error = null, compact = false }: ClickHouseSchemaPanelProps) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-64 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-24 animate-pulse rounded bg-slate-50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        ClickHouse schema catalog unavailable: {error}
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        ClickHouse schema catalog has not been loaded.
      </section>
    );
  }

  const tables = compact ? catalog.tables.slice(0, 4) : catalog.tables;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">ClickHouse Business Analytics Schemas</h3>
          <p className="mt-1 text-sm text-slate-500">
            {catalog.message || "Planned structured business/analytics projections. This is a catalog, not a live DB connector."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{catalog.total} tables</span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {tables.map((table) => (
          <article key={table.table_name} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="font-mono text-sm font-semibold text-slate-900">{table.table_name}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{table.source_contracts.join(" / ")}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${domainTone(table.domain)}`}>
                  {table.domain}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(table.status)}`}>
                  {table.status}
                </span>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
              <div>
                <span className="font-medium text-slate-700">Partition:</span> {table.partition_by}
              </div>
              <div>
                <span className="font-medium text-slate-700">TTL:</span> {table.ttl_policy}
              </div>
              <div className="md:col-span-2">
                <span className="font-medium text-slate-700">Order:</span> {table.order_by.join(", ")}
              </div>
            </div>

            {!compact ? (
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100 bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Column</th>
                      <th className="px-2 py-1.5 font-semibold">Type</th>
                      <th className="px-2 py-1.5 font-semibold">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {table.columns.slice(0, 8).map((column) => (
                      <tr key={`${table.table_name}:${column.name}`}>
                        <td className="px-2 py-1.5 font-mono">{column.name}</td>
                        <td className="px-2 py-1.5 font-mono">{column.type}</td>
                        <td className="px-2 py-1.5">{column.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!compact && table.notes ? <p className="mt-2 text-xs leading-5 text-slate-600">{table.notes}</p> : null}
          </article>
        ))}
      </div>

      {!compact && catalog.policies ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">Schema Policies</div>
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

export default ClickHouseSchemaPanel;
