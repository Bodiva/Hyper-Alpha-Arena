import type { ReactNode } from "react";

interface StructuredReportViewProps {
  text?: string;
  title?: string;
  className?: string;
  compact?: boolean;
}

type StructuredBlock =
  | { type: "heading"; text: string; level: 2 | 3 | 4 }
  | { type: "paragraph"; text: string }
  | { type: "bullet"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

const SECTION_TITLES = ["Market View", "Bull View", "Bear View", "Risk Review", "Final Decision", "Watch Indicators"];

const isSectionTitle = (line: string): { text: string; level: 2 | 3 | 4 } | null => {
  const markdownHeading = line.match(/^(#{2,4})\s+(.+)$/);
  if (markdownHeading?.[1] && markdownHeading?.[2]) {
    const level = Math.min(Math.max(markdownHeading[1].length, 2), 4) as 2 | 3 | 4;
    return { text: markdownHeading[2].trim(), level };
  }

  const normalized = line.replace(/[:：]\s*$/, "").trim().toLowerCase();
  const matched = SECTION_TITLES.find((sectionTitle) => sectionTitle.toLowerCase() === normalized);
  return matched ? { text: matched, level: 3 } : null;
};

const isTableLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
};

const isTableSeparator = (line: string): boolean => {
  if (!isTableLine(line)) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
};

const splitTableRow = (line: string): string[] => {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
};

const flushParagraph = (blocks: StructuredBlock[], paragraph: string[]): void => {
  const text = paragraph.join("\n").trim();
  if (text) blocks.push({ type: "paragraph", text });
  paragraph.length = 0;
};

const flushList = (blocks: StructuredBlock[], listType: "bullet" | "numbered" | null, listItems: string[]): null => {
  if (listType && listItems.length > 0) {
    blocks.push({ type: listType, items: [...listItems] });
  }
  listItems.length = 0;
  return null;
};

const parseStructuredText = (text: string): StructuredBlock[] => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: StructuredBlock[] = [];
  const paragraph: string[] = [];
  const listItems: string[] = [];
  let listType: "bullet" | "numbered" | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(blocks, paragraph);
      listType = flushList(blocks, listType, listItems);
      index += 1;
      continue;
    }

    if (isTableLine(trimmed) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph(blocks, paragraph);
      listType = flushList(blocks, listType, listItems);
      const headers = splitTableRow(trimmed);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && isTableLine(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const heading = isSectionTitle(trimmed);
    if (heading) {
      flushParagraph(blocks, paragraph);
      listType = flushList(blocks, listType, listItems);
      blocks.push({ type: "heading", text: heading.text, level: heading.level });
      index += 1;
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) {
      flushParagraph(blocks, paragraph);
      if (listType !== "bullet") listType = flushList(blocks, listType, listItems);
      listType = "bullet";
      listItems.push(bullet[1].trim());
      index += 1;
      continue;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered?.[1]) {
      flushParagraph(blocks, paragraph);
      if (listType !== "numbered") listType = flushList(blocks, listType, listItems);
      listType = "numbered";
      listItems.push(numbered[1].trim());
      index += 1;
      continue;
    }

    listType = flushList(blocks, listType, listItems);
    paragraph.push(line);
    index += 1;
  }

  flushParagraph(blocks, paragraph);
  flushList(blocks, listType, listItems);
  return blocks;
};

const renderInline = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|ev_(?:static|qwen)[A-Za-z0-9_-]+|(?<!\*)\*[^*]+\*(?!\*))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${token}-${match.index}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.92em] text-foreground">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("ev_")) {
      nodes.push(
        <code key={key} className="mx-0.5 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[0.88em] font-medium text-blue-700 dark:text-blue-300">
          {token}
        </code>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

const headingClassName = (level: 2 | 3 | 4, compact: boolean): string => {
  if (level === 2) return compact ? "font-semibold text-foreground mt-2" : "font-semibold text-foreground text-base mt-4";
  if (level === 3) return compact ? "font-semibold text-foreground mt-2" : "font-semibold text-foreground text-sm mt-3";
  return compact ? "font-medium text-foreground mt-2" : "font-medium text-foreground text-sm mt-2";
};

const StructuredReportView = ({ text, title, className = "", compact = false }: StructuredReportViewProps) => {
  const content = text?.trim();

  if (!content) {
    return <p className={`text-muted-foreground ${className}`}>暂无内容。</p>;
  }

  const blocks = parseStructuredText(content);
  const paragraphClass = compact ? "text-muted-foreground whitespace-pre-wrap leading-5" : "text-muted-foreground whitespace-pre-wrap leading-6";

  return (
    <div className={`space-y-2 break-words ${className}`}>
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      {blocks.length > 0 ? (
        blocks.map((block, index) => {
          if (block.type === "heading") {
            return (
              <p key={`${block.type}-${index}`} className={headingClassName(block.level, compact)}>
                {renderInline(block.text)}
              </p>
            );
          }

          if (block.type === "bullet") {
            return (
              <ul key={`${block.type}-${index}`} className="list-disc pl-4 text-muted-foreground space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={`${item}-${itemIndex}`} className="leading-5">
                    {renderInline(item)}
                  </li>
                ))}
              </ul>
            );
          }

          if (block.type === "numbered") {
            return (
              <ol key={`${block.type}-${index}`} className="list-decimal pl-4 text-muted-foreground space-y-1">
                {block.items.map((item, itemIndex) => (
                  <li key={`${item}-${itemIndex}`} className="leading-5">
                    {renderInline(item)}
                  </li>
                ))}
              </ol>
            );
          }

          if (block.type === "table") {
            return (
              <div key={`${block.type}-${index}`} className="overflow-x-auto rounded-md border border-border bg-background">
                <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                  <thead className="bg-muted/70 text-foreground">
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th key={`${header}-${headerIndex}`} className="border-b border-r border-border px-2 py-1.5 font-semibold last:border-r-0 align-top">
                          {renderInline(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`row-${rowIndex}`} className="odd:bg-muted/20">
                        {block.headers.map((_, cellIndex) => (
                          <td key={`cell-${rowIndex}-${cellIndex}`} className="border-b border-r border-border px-2 py-1.5 last:border-r-0 align-top leading-5">
                            {renderInline(row[cellIndex] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          return (
            <p key={`${block.type}-${index}`} className={paragraphClass}>
              {renderInline(block.text)}
            </p>
          );
        })
      ) : (
        <p className={paragraphClass}>{renderInline(content)}</p>
      )}
    </div>
  );
};

export default StructuredReportView;
