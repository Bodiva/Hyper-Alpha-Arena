import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, Server, TerminalSquare } from "lucide-react";

import { getAgentRuntimeLogsAsync, getAgentRuntimeWorkersAsync, type AgentRuntimeLogResponse, type AgentRuntimeWorkersResponse } from "@/entities/agent/api";
import { shouldUseMockData } from "@/shared/api/api-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LogFilter = "alphatrace" | "errors" | "warnings" | "all";

interface ParsedLogLine {
  id: string;
  raw: string;
  level: "ERROR" | "WARNING" | "INFO" | "DEBUG" | "UNKNOWN";
  timestamp?: string;
  source: "alphatrace" | "legacy" | "global";
}

const ALPHATRACE_PATTERNS = [
  "alphatrace",
  "alpha-trace",
  "agent run",
  "agent_run",
  "runtime",
  "qwen",
  "tradingagents",
  "langalpha",
  "bocha",
];

const HIDDEN_NOISE_PATTERNS = [
  "GET /api/health",
  "GET /health",
  "OPTIONS /",
  "StaticFiles",
];

const LEVEL_PATTERNS: Array<[ParsedLogLine["level"], RegExp]> = [
  ["ERROR", /\b(ERROR|CRITICAL|Traceback|Exception|failed|failure)\b/i],
  ["WARNING", /\b(WARNING|WARN|deprecated|missing|unavailable)\b/i],
  ["INFO", /\b(INFO|Started|Completed|success|ready)\b/i],
  ["DEBUG", /\b(DEBUG)\b/i],
];

const extractTimestamp = (line: string): string | undefined => {
  const match = line.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?/);
  return match?.[0];
};

const classifyLevel = (line: string): ParsedLogLine["level"] => {
  for (const [level, pattern] of LEVEL_PATTERNS) {
    if (pattern.test(line)) return level;
  }
  return "UNKNOWN";
};

const classifySource = (line: string): ParsedLogLine["source"] => {
  const lower = line.toLowerCase();
  if (ALPHATRACE_PATTERNS.some((pattern) => lower.includes(pattern))) return "alphatrace";
  if (HIDDEN_NOISE_PATTERNS.some((pattern) => line.includes(pattern))) return "legacy";
  return "global";
};

const parseLogLines = (lines: string[]): ParsedLogLine[] =>
  lines.map((line, index) => ({
    id: `${index}-${line.slice(0, 48)}`,
    raw: line,
    level: classifyLevel(line),
    timestamp: extractTimestamp(line),
    source: classifySource(line),
  }));

const levelBadgeVariant = (level: ParsedLogLine["level"]): "default" | "secondary" | "destructive" | "outline" => {
  if (level === "ERROR") return "destructive";
  if (level === "WARNING") return "secondary";
  if (level === "INFO") return "default";
  return "outline";
};

const LogLevelIcon = ({ level }: { level: ParsedLogLine["level"] }) => {
  if (level === "ERROR") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (level === "WARNING") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (level === "INFO") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <TerminalSquare className="h-4 w-4 text-muted-foreground" />;
};

export default function RuntimeLogsPage() {
  const [logs, setLogs] = useState<AgentRuntimeLogResponse | null>(null);
  const [workers, setWorkers] = useState<AgentRuntimeWorkersResponse | null>(null);
  const [filter, setFilter] = useState<LogFilter>("alphatrace");
  const [query, setQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiMode = shouldUseMockData() ? "mock" : "real";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextLogs, nextWorkers] = await Promise.all([
        getAgentRuntimeLogsAsync(800),
        getAgentRuntimeWorkersAsync().catch(() => null),
      ]);
      setLogs(nextLogs);
      setWorkers(nextWorkers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "日志加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const parsedLines = useMemo(() => parseLogLines(logs?.lines ?? []), [logs?.lines]);

  const stats = useMemo(() => {
    return parsedLines.reduce(
      (acc, line) => {
        acc.total += 1;
        acc.byLevel[line.level] += 1;
        acc.bySource[line.source] += 1;
        return acc;
      },
      {
        total: 0,
        byLevel: { ERROR: 0, WARNING: 0, INFO: 0, DEBUG: 0, UNKNOWN: 0 },
        bySource: { alphatrace: 0, legacy: 0, global: 0 },
      },
    );
  }, [parsedLines]);

  const filteredLines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return parsedLines.filter((line) => {
      if (filter === "alphatrace" && line.source !== "alphatrace") return false;
      if (filter === "errors" && line.level !== "ERROR") return false;
      if (filter === "warnings" && line.level !== "WARNING") return false;
      if (normalizedQuery && !line.raw.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
  }, [filter, parsedLines, query]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">投研运行日志</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            面向投研 AgentRun 的运行日志、Agent worker 状态与后端 runtime 文件尾部监控。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <span className="text-muted-foreground">10s 自动刷新</span>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">日志状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl font-semibold">{logs?.exists ? "可用" : "缺失"}</div>
            <Badge variant={apiMode === "real" ? "default" : "outline"}>{apiMode === "real" ? "实时接口" : "离线模式"}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">可见行数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{filteredLines.length}</div>
            <p className="text-xs text-muted-foreground">Raw {stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">错误</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-red-500">{stats.byLevel.ERROR}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">警告</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-amber-500">{stats.byLevel.WARNING}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Worker</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{workers?.activeCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">active / {workers?.registeredCount ?? 0} registered</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4" />
              Research Runtime Log Tail
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {logs?.source ? <Badge variant="outline">source: {logs.source}</Badge> : null}
              <span className="max-w-[36rem] truncate">Path: {logs?.path ?? "-"}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="rounded border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p> : null}
          {logs?.message ? <p className="rounded border bg-muted/30 p-2 text-sm text-muted-foreground">{logs.message}</p> : null}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={filter} onValueChange={(value) => setFilter(value as LogFilter)}>
              <TabsList>
                <TabsTrigger value="alphatrace">AlphaTrace</TabsTrigger>
                <TabsTrigger value="errors">错误</TabsTrigger>
                <TabsTrigger value="warnings">警告</TabsTrigger>
                <TabsTrigger value="all">全部</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索日志内容"
                className="pl-9"
              />
            </div>
          </div>

          {!logs?.exists && logs?.candidates?.length ? (
            <details className="rounded border bg-muted/20 p-3 text-sm">
              <summary className="cursor-pointer font-medium">已检查的日志文件候选</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {logs.candidates.map((candidate) => (
                  <li key={candidate} className="break-all font-mono">
                    {candidate}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <ScrollArea className="h-[34rem] rounded border bg-slate-950">
            {filteredLines.length ? (
              <div className="space-y-1 p-3">
                {filteredLines.map((line) => (
                  <div key={line.id} className="grid gap-2 rounded px-2 py-1.5 text-xs text-slate-100 hover:bg-white/5 md:grid-cols-[1rem_6rem_7rem_1fr]">
                    <LogLevelIcon level={line.level} />
                    <Badge variant={levelBadgeVariant(line.level)} className="w-fit">
                      {line.level}
                    </Badge>
                    <span className="font-mono text-slate-400">{line.timestamp ?? line.source}</span>
                    <span className="whitespace-pre-wrap break-words font-mono leading-relaxed">{line.raw}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-[20rem] items-center justify-center p-6 text-sm text-slate-400">
                当前过滤条件下暂无日志。
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
