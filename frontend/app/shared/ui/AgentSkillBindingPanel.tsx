import type { AgentSkillBindingCatalogResponse } from "@/entities/runtime/api";

interface AgentSkillBindingPanelProps {
  catalog?: AgentSkillBindingCatalogResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const teamTone = (team?: string) => {
  const value = (team || "").toLowerCase();
  if (value.includes("data")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("analyst")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value.includes("research")) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  if (value.includes("risk")) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (value.includes("portfolio")) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
};

const statusTone = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (value === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("design")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
};

const Chips = ({ items, limit, kind = "default" }: { items?: string[]; limit: number; kind?: "default" | "tool" | "skill" }) => {
  const visibleItems = (items || []).slice(0, limit);
  if (!visibleItems.length) return <span className="text-xs text-slate-400">none</span>;
  const tone =
    kind === "tool"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : kind === "skill"
        ? "bg-blue-50 text-blue-700 ring-blue-100"
        : "bg-white text-slate-600 ring-slate-100";
  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleItems.map((item) => (
        <span key={item} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${tone}`}>
          {item}
        </span>
      ))}
    </div>
  );
};

export const AgentSkillBindingPanel = ({ catalog, loading = false, error = null, compact = false }: AgentSkillBindingPanelProps) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="h-4 w-60 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-28 animate-pulse rounded bg-slate-50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Agent skill bindings unavailable: {error}
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Agent skill binding catalog has not been loaded.
      </section>
    );
  }

  const bindings = compact ? catalog.bindings.slice(0, 5) : catalog.bindings;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Agent Role / Skill Binding Matrix</h3>
          <p className="mt-1 text-sm text-slate-500">
            {catalog.message || "Default mapping from logical agents to dependencies, skills, tools, and output contracts."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{catalog.total} roles</span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[920px] rounded-xl border border-slate-100">
          <div className="grid grid-cols-[1.2fr_1fr_1.4fr_1.4fr_1.6fr] gap-0 border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <div className="p-3">Agent Role</div>
            <div className="p-3">Depends On</div>
            <div className="p-3">Default Skills</div>
            <div className="p-3">Tools</div>
            <div className="p-3">Output Contracts</div>
          </div>
          {bindings.map((binding) => (
            <div key={binding.role_id} className="grid grid-cols-[1.2fr_1fr_1.4fr_1.4fr_1.6fr] border-b border-slate-100 last:border-b-0">
              <div className="p-3">
                <div className="text-sm font-semibold text-slate-900">{binding.display_name}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${teamTone(binding.team)}`}>
                    {binding.team}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(binding.status)}`}>
                    {binding.status}
                  </span>
                </div>
                {!compact && binding.notes ? <p className="mt-2 text-xs leading-5 text-slate-500">{binding.notes}</p> : null}
              </div>
              <div className="p-3">
                <Chips items={binding.depends_on} limit={compact ? 3 : 6} />
              </div>
              <div className="p-3">
                <Chips items={binding.default_skills} limit={compact ? 3 : 6} kind="skill" />
                {!compact && binding.optional_skills?.length ? (
                  <div className="mt-2">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Optional</div>
                    <Chips items={binding.optional_skills} limit={4} kind="skill" />
                  </div>
                ) : null}
              </div>
              <div className="p-3">
                <Chips items={binding.tool_ids} limit={compact ? 3 : 6} kind="tool" />
              </div>
              <div className="p-3">
                <Chips items={binding.output_contracts} limit={compact ? 3 : 7} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {!compact && catalog.policies ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">Binding Policies</div>
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

export default AgentSkillBindingPanel;
