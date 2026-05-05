import type { AgentArtifact } from "@/entities/runtime/api";

interface AgentArtifactPreviewCardProps {
  artifact: AgentArtifact;
  compact?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  web_url: "Web",
  json: "JSON",
  text: "Text",
  table: "Table",
  chart: "Chart",
  file: "File",
  html_preview: "HTML",
  image: "Image",
};

const asDisplayText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const AgentArtifactPreviewCard = ({ artifact, compact = false }: AgentArtifactPreviewCardProps) => {
  const typeLabel = TYPE_LABEL[artifact.artifact_type] || artifact.artifact_type;
  const sourceUrl = artifact.source_url || (typeof artifact.preview_payload?.url === "string" ? artifact.preview_payload.url : "");
  const content =
    artifact.artifact_type === "text"
      ? asDisplayText(artifact.preview_payload?.content || artifact.summary)
      : artifact.artifact_type === "json"
        ? asDisplayText(artifact.preview_payload)
        : "";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{typeLabel}</span>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500">{artifact.status}</span>
            {artifact.source_tool ? <span className="text-xs text-slate-500">{artifact.source_tool}</span> : null}
          </div>
          <h4 className="mt-2 truncate text-sm font-semibold text-slate-900">{artifact.title}</h4>
          {artifact.summary ? (
            <p className={`mt-1 text-sm leading-6 text-slate-600 ${compact ? "line-clamp-2" : ""}`}>{artifact.summary}</p>
          ) : null}
        </div>
        {sourceUrl ? (
          <a
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open
          </a>
        ) : null}
      </div>

      {content && !compact ? (
        <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
          {content}
        </pre>
      ) : null}

      {artifact.storage_uri && !sourceUrl ? (
        <p className="mt-3 break-all rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{artifact.storage_uri}</p>
      ) : null}
    </article>
  );
};

export default AgentArtifactPreviewCard;
