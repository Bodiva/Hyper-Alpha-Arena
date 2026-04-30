import { Button } from "@/components/ui/button";

interface EvidenceBadgesProps {
  evidenceIds?: string[];
  onSelect?: (evidenceId: string) => void;
  maxVisible?: number;
  className?: string;
}

const uniqueIds = (ids?: string[]): string[] => Array.from(new Set((ids ?? []).filter(Boolean)));

const EvidenceBadges = ({ evidenceIds, onSelect, maxVisible, className = "" }: EvidenceBadgesProps) => {
  const ids = uniqueIds(evidenceIds);
  const visible = typeof maxVisible === "number" ? ids.slice(0, maxVisible) : ids;
  const hiddenCount = ids.length - visible.length;

  if (!ids.length) return <span className={`text-muted-foreground ${className}`}>暂无证据引用</span>;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {visible.map((id) =>
        onSelect ? (
          <Button key={id} type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px] font-mono" onClick={() => onSelect(id)}>
            {id}
          </Button>
        ) : (
          <code key={id} className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
            {id}
          </code>
        ),
      )}
      {hiddenCount > 0 ? <span className="text-[11px] text-muted-foreground">+{hiddenCount}</span> : null}
    </div>
  );
};

export default EvidenceBadges;
