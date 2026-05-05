import type { AgentSkillCatalogResponse } from "@/entities/runtime/api";

interface AgentSkillPanelProps {
  catalog?: AgentSkillCatalogResponse | null;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

const statusTone = (status?: string) => {
  const value = (status || "").toLowerCase();
  if (value === "active") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("design")) return "bg-slate-50 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
};

const typeTone = (type?: string) => {
  const value = (type || "").toLowerCase();
  if (value.includes("retrieval")) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value.includes("reasoning") || value.includes("decision")) return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value.includes("risk")) return "bg-rose-50 text-rose-700 ring-rose-200";
  if (value.includes("external")) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
};

const ChipList = ({ label, items, limit }: { label: string; items?: string[]; limit: number }) => {
  const visibleItems = (items || []).slice(0, limit);
  if (!visibleItems.length) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {visibleItems.map((item) => (
          <span key={item} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-100">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

export const AgentSkillPanel = ({ catalog, loading = false, error = null, compact = false }: AgentSkillPanelProps) => {
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
        Agent skill catalog unavailable: {error}
      </section>
    );
  }

  if (!catalog) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Agent skill catalog has not been loaded.
      </section>
    );
  }

  const skills = compact ? catalog.skills.slice(0, 5) : catalog.skills;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Agent Skill Catalog</h3>
          <p className="mt-1 text-sm text-slate-500">
            {catalog.message || "Product-level skills that bind agents to tools, data domains, model requirements, and output contracts."}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{catalog.total} skills</span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {skills.map((skill) => (
          <article key={skill.skill_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{skill.display_name}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{skill.skill_id}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${typeTone(skill.skill_type)}`}>
                  {skill.skill_type}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusTone(skill.status)}`}>
                  {skill.status}
                </span>
              </div>
            </div>

            <div className={`mt-3 grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
              <ChipList label="Allowed Agents" items={skill.allowed_agents} limit={compact ? 3 : 6} />
              <ChipList label="Tools" items={skill.tool_ids} limit={compact ? 3 : 6} />
              {!compact ? <ChipList label="Data Domains" items={skill.data_domains} limit={8} /> : null}
              {!compact ? <ChipList label="Output Contracts" items={skill.output_contracts} limit={8} /> : null}
            </div>

            {!compact && skill.model_requirements?.length ? (
              <div className="mt-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Model Requirements</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {skill.model_requirements.map((item) => (
                    <code key={item} className="rounded bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-100">
                      {item}
                    </code>
                  ))}
                </div>
              </div>
            ) : null}

            {!compact && skill.notes ? <p className="mt-3 text-xs leading-5 text-slate-600">{skill.notes}</p> : null}
          </article>
        ))}
      </div>

      {!compact && catalog.policies ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-3">
          <div className="text-sm font-semibold text-slate-800">Skill Policies</div>
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

export default AgentSkillPanel;
