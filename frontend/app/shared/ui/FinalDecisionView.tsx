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

const TECHNICAL_NOTE_PATTERNS = [/TradingAgents/i, /database-backed/i, /invalid evidence/i, /Invalid evidence/i, /未接入/i, /stub/i];

const normalizeLine = (value: string): string => value.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();

const extractSection = (text: string, names: string[]): string => {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:#{2,4}\\s*)?(?:\\*\\*)?(?:${escaped})(?:\\*\\*)?\\s*[:：]?\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:#{2,4}\\s*)?(?:\\*\\*)?(?:action|confidence|thesis|risks|watchIndicators|watch indicators|evidenceIds|evidence used)(?:\\*\\*)?\\s*[:：]?|$)`, "i");
  return text.match(pattern)?.[1]?.trim() ?? "";
};

const stripDecisionMetadata = (text: string): string => {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\*\*)?(?:action|confidence|evidenceIds|evidence used)(?:\*\*)?\s*[:：]/i.test(line.trim()))
    .join("\n")
    .trim();
};

const buildThesis = (decision: AgentDecision): string => {
  const thesisSection = extractSection(decision.thesis, ["thesis", "核心逻辑"]);
  return stripDecisionMetadata(thesisSection || decision.thesis);
};

const splitRiskText = (text: string): string[] => {
  const normalized = text.replace(/```[\s\S]*?```/g, "").trim();
  const bulletLines = normalized
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line && !/^#{1,6}\s/.test(line) && !/^>?\s*注[:：]?/.test(line));

  const candidates = bulletLines.length > 1 ? bulletLines : normalized.split(/[；;。]\s*/).map((item) => item.trim());
  return candidates
    .map((item) => item.replace(/^(?:\*\*)?(?:risks?|主要风险)(?:\*\*)?\s*[:：]?/i, "").trim())
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
        .filter((line) => line.length > 4 && !/^(?:action|confidence|thesis|risks|evidenceIds)/i.test(line)),
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
          <p className="text-muted-foreground">Action</p>
          <p className="font-semibold text-foreground">{actionLabel}</p>
        </div>
        <div className="rounded border bg-muted/20 p-2">
          <p className="text-muted-foreground">Horizon</p>
          <p className="font-semibold text-foreground">{horizonLabel}</p>
        </div>
        <div className="rounded border bg-muted/20 p-2">
          <p className="text-muted-foreground">Confidence</p>
          <p className="font-semibold text-foreground">{confidenceLabel}</p>
        </div>
      </div>

      <section className="space-y-1">
        <p className="font-medium">Thesis</p>
        <div className="rounded border bg-background p-2 max-h-72 overflow-auto">
          <StructuredReportView text={thesis} compact />
        </div>
      </section>

      <section className="space-y-1">
        <p className="font-medium">Key Risks</p>
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
        <p className="font-medium">Watch Indicators</p>
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
        <p className="font-medium">Evidence Used</p>
        <EvidenceBadges evidenceIds={decision.evidenceIds} onSelect={onEvidenceSelect} />
      </section>

      {technicalNotes.length ? (
        <details className="rounded border bg-muted/20 p-2">
          <summary className="cursor-pointer font-medium">Technical Notes</summary>
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
