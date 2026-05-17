const RETIRED_EVIDENCE_ID_PATTERN = /`?\b(?:ev_static|ev_stub)_[A-Za-z0-9_-]+\b`?/g;

export const isRetiredEvidenceId = (evidenceId?: string | null): boolean => {
  const value = String(evidenceId ?? "");
  return value.startsWith("ev_static_") || value.startsWith("ev_stub_");
};

export const filterRetiredEvidenceIds = (evidenceIds?: string[] | null): string[] =>
  (evidenceIds ?? []).filter((id) => id && !isRetiredEvidenceId(id));

export const stripRetiredEvidenceIdsFromText = (text: string): string =>
  text
    .replace(RETIRED_EVIDENCE_ID_PATTERN, "")
    .replace(/\(\s*[，,、\s]+\)/g, "")
    .replace(/（\s*[，,、\s]+）/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/（\s*）/g, "")
    .replace(/\s+([，,。；;])/g, "$1")
    .replace(/([（(])\s*[，,、]\s*/g, "$1")
    .replace(/[，,、]\s*([）)])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
