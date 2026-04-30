import type { ReactNode } from "react";

interface MarkdownBlockProps {
  text?: string;
  className?: string;
  compact?: boolean;
  maxLines?: number;
}

type Block =
  | { type: "paragraph"; text: string }
  | { type: "bullet"; items: string[] }
  | { type: "numbered"; items: string[] };

const flushParagraph = (blocks: Block[], paragraph: string[]) => {
  const text = paragraph.join("\n").trim();
  if (text) blocks.push({ type: "paragraph", text });
  paragraph.length = 0;
};

const flushList = (blocks: Block[], listType: "bullet" | "numbered" | null, items: string[]): null => {
  if (listType && items.length > 0) blocks.push({ type: listType, items: [...items] });
  items.length = 0;
  return null;
};

const parseBlocks = (text: string): Block[] => {
  const blocks: Block[] = [];
  const paragraph: string[] = [];
  const listItems: string[] = [];
  let listType: "bullet" | "numbered" | null = null;

  text.replace(/\r\n/g, "\n").split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph(blocks, paragraph);
      listType = flushList(blocks, listType, listItems);
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) {
      flushParagraph(blocks, paragraph);
      if (listType !== "bullet") listType = flushList(blocks, listType, listItems);
      listType = "bullet";
      listItems.push(bullet[1]);
      return;
    }

    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered?.[1]) {
      flushParagraph(blocks, paragraph);
      if (listType !== "numbered") listType = flushList(blocks, listType, listItems);
      listType = "numbered";
      listItems.push(numbered[1]);
      return;
    }

    listType = flushList(blocks, listType, listItems);
    paragraph.push(line.trimEnd());
  });

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
      nodes.push(<strong key={key} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(<code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.92em] text-foreground">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("ev_")) {
      nodes.push(<code key={key} className="mx-0.5 rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[0.88em] font-medium text-blue-700 dark:text-blue-300">{token}</code>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key} className="italic">{token.slice(1, -1)}</em>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
};

const limitTextLines = (text: string, maxLines?: number): { text: string; truncated: boolean } => {
  if (!maxLines || maxLines <= 0) return { text, truncated: false };
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: `${lines.slice(0, maxLines).join("\n")}\n...`, truncated: true };
};

const MarkdownBlock = ({ text, className = "", compact = false, maxLines }: MarkdownBlockProps) => {
  const content = text?.trim();
  if (!content) return <p className={`text-muted-foreground ${className}`}>暂无内容。</p>;

  const limited = limitTextLines(content, maxLines);
  const blocks = parseBlocks(limited.text);
  const paragraphClass = compact ? "text-muted-foreground whitespace-pre-wrap leading-5" : "text-muted-foreground whitespace-pre-wrap leading-6";

  return (
    <div className={`space-y-2 break-words ${className}`}>
      {blocks.map((block, index) => {
        if (block.type === "bullet") {
          return (
            <ul key={`${block.type}-${index}`} className="list-disc pl-4 text-muted-foreground space-y-1">
              {block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>)}
            </ul>
          );
        }

        if (block.type === "numbered") {
          return (
            <ol key={`${block.type}-${index}`} className="list-decimal pl-4 text-muted-foreground space-y-1">
              {block.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>)}
            </ol>
          );
        }

        return (
          <p key={`${block.type}-${index}`} className={paragraphClass}>
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
};

export default MarkdownBlock;

