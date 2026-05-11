import { Badge } from "@/components/ui/badge";
import type { AgentDecision } from "@/entities/agent/model";
import EvidenceBadges from "@/shared/ui/EvidenceBadges";
import StructuredReportView from "@/shared/ui/StructuredReportView";

interface FinalDecisionViewProps {
  decision: AgentDecision;
  actionLabel: string;
  horizonLabel: string;
  confidenceLabel: string;
  onEvidenceSelect?: (evidenceId: string) => void;
}

const TECHNICAL_NOTE_PATTERNS = [
  /TradingAgents/i,
  /database-backed/i,
  /invalid evidence/i,
  /Invalid evidence/i,
  /未接入/i,
  /stub/i,
  /Final Decision was not provided/i,
  /Risk Review was not provided/i,
  /was not explicitly separated/i,
  /structured Qwen output/i,
  /Qwen output/i,
  /parser fallback/i,
  /Rule-based evidence support/i,
  /Evidence semantic support/i,
];

const normalizeLine = (value: string): string => value.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();

const extractSection = (text: string, names: string[]): string => {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:#{2,4}\\s*)?(?:\\*\\*)?(?:${escaped})(?:\\*\\*)?\\s*[:：]?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:#{2,4}\\s*)?(?:\\*\\*)?(?:action|confidence|thesis|risks|watchIndicators|watch indicators|evidenceIds|evidence used)(?:\\*\\*)?\\s*[:：]?|$)`, "i");
  return text.match(pattern)?.[1]?.trim() ?? "";
};

const stripDecisionMetadata = (text: string): string => {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\*\*)?(?:action|confidence|evidenceIds|evidence used)(?:\*\*)?\s*[:：]/i.test(line.trim()))
    .filter((line) => !TECHNICAL_NOTE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .replace(/\b(ev|ck)_[a-z0-9_]{16,}\b/gi, "")
    .replace(/`(?:ev_|ck_|marketContext\.|toolContext\.)[^`]+`/g, "")
    .trim();
};

const buildThesis = (decision: AgentDecision): string => {
  const thesisSection = extractSection(decision.thesis, ["thesis", "核心逻辑"]);
  const thesis = stripDecisionMetadata(thesisSection || decision.thesis);
  if (thesis && !TECHNICAL_NOTE_PATTERNS.some((pattern) => pattern.test(thesis))) return thesis;
  const summary = stripDecisionMetadata(decision.summary ?? "");
  return summary || "本次任务缺少可直接展示的结构化最终结论，建议先按观察状态处理，并结合证据、风险复核和图谱节点继续确认。";
};

const splitRiskText = (text: string): string[] => {
  const normalized = text.replace(/```[\s\S]*?```/g, "").trim();
  const bulletLines = normalized
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line && !/^#{1,6}\s/.test(line) && !/^>?\s*注[:：]?/.test(line))
    .filter((line) => !TECHNICAL_NOTE_PATTERNS.some((pattern) => pattern.test(line)));

  const candidates = bulletLines.length > 1 ? bulletLines : normalized.split(/[；;。]\s*/).map((item) => item.trim());
  return candidates
    .map((item) => item.replace(/^(?:\*\*)?(?:risks?|主要风险)(?:\*\*)?\s*[:：]?/i, "").trim())
    .map((item) => item.replace(/\b(ev|ck)_[a-z0-9_]{16,}\b/gi, "").trim())
    .filter((item) => item.length > 8);
};

const buildRisks = (decision: AgentDecision): { risks: string[]; technicalNotes: string[] } => {
  const technicalNotes: string[] = [];
  const risks: string[] = [];

  decision.risks.forEach((risk) => {
    if (TECHNICAL_NOTE_PATTERNS.some((pattern) => pattern.test(risk))) {
      technicalNotes.push(risk);
      return;
    }
    risks.push(...splitRiskText(risk));
  });

  if (!risks.length) {
    const riskSection = extractSection(decision.thesis, ["risks", "主要风险"]);
    risks.push(...splitRiskText(riskSection));
  }

  return {
    risks: Array.from(new Set(risks)).slice(0, 5),
    technicalNotes: Array.from(new Set(technicalNotes)),
  };
};

const buildWatchIndicators = (decision: AgentDecision): string[] => {
  const polluted = (decision.observationIndicators ?? []).some((item) => /thesis|risks|confidence|action|final decision/i.test(item));
  const source = polluted || !decision.observationIndicators?.length
    ? extractSection(decision.thesis, ["watchIndicators", "watch indicators", "观察指标"])
    : decision.observationIndicators.join("\n");

  return Array.from(
    new Set(
      source
        .split(/\r?\n|[；;]/)
        .map(normalizeLine)
        .filter((line) => line.length > 4 && !/^(?:action|confidence|thesis|risks|evidenceIds)/i.test(line))
        .filter((line) => !TECHNICAL_NOTE_PATTERNS.some((pattern) => pattern.test(line))),
    ),
  ).slice(0, 6);
};

const FinalDecisionView = ({ decision, actionLabel, horizonLabel, confidenceLabel, onEvidenceSelect }: FinalDecisionViewProps) => {
  const thesis = buildThesis(decision);
  const { risks, technicalNotes } = buildRisks(decision);
  const watchIndicators = buildWatchIndicators(decision);

  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded border bg-muted/20 p-2">
          <p className="text-muted-foreground">操作建议</p>
          <p className="font-semibold text-foreground">{actionLabel}</p>
        </div>
        <div className="rounded border bg-muted/20 p-2">
          <p className="text-muted-foreground">周期</p>
          <p className="font-semibold text-foreground">{horizonLabel}</p>
        </div>
        <div className="rounded border bg-muted/20 p-2">
          <p className="text-muted-foreground">置信度</p>
          <p className="font-semibold text-foreground">{confidenceLabel}</p>
        </div>
      </div>

      <section className="space-y-1">
        <p className="font-medium">核心逻辑</p>
        <div className="rounded border bg-background p-2 max-h-72 overflow-auto">
          <StructuredReportView text={thesis} compact />
        </div>
      </section>

      <section className="space-y-1">
        <p className="font-medium">主要风险</p>
        {risks.length ? (
          <ul className="list-disc pl-4 text-muted-foreground space-y-1">
            {risks.map((risk, index) => (
              <li key={`${risk}-${index}`}>
                <StructuredReportView text={risk} compact />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">暂无明确风险项。</p>
        )}
      </section>

      <section className="space-y-1">
        <p className="font-medium">观察指标</p>
        {watchIndicators.length ? (
          <ul className="list-disc pl-4 text-muted-foreground space-y-1">
            {watchIndicators.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">暂无观察指标。</p>
        )}
      </section>

      <section className="space-y-1">
        <p className="font-medium">使用证据</p>
        <EvidenceBadges evidenceIds={decision.evidenceIds} onSelect={onEvidenceSelect} />
      </section>

      {technicalNotes.length ? (
        <details className="rounded border bg-muted/20 p-2">
          <summary className="cursor-pointer font-medium">技术说明</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {technicalNotes.map((note) => (
              <Badge key={note} variant="outline">{note}</Badge>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
};

export default FinalDecisionView;
