import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, FileUp, FolderOpen, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  importLocalEtfFileAsync,
  listImportedFileBatchesAsync,
  listImportedFileRowsAsync,
  listLocalEtfImportFilesAsync,
  uploadEtfFileImportAsync,
  type FileImportResponse,
  type ImportedFileBatch,
  type ImportedFileRow,
  type LocalImportFile,
} from "@/entities/data-source/api";
import ResearchWorkspaceNav from "@/shared/ui/ResearchWorkspaceNav";

const MAX_DISPLAY_COLUMNS = 12;

const WIDE_SCHEMA_COLUMNS = [
  { key: "rowNumber", label: "row_number" },
  { key: "assetSymbol", label: "index_code" },
  { key: "assetName", label: "index_name" },
  { key: "tradeDate", label: "trade_date" },
  { key: "close_price", label: "close_price" },
  { key: "pe_etf_weighted", label: "pe_etf_weighted" },
  { key: "pe_market_cap_weighted", label: "pe_market_cap_weighted" },
  { key: "pe_equal_weighted", label: "pe_equal_weighted" },
  { key: "pb_etf_weighted", label: "pb_etf_weighted" },
  { key: "pb_market_cap_weighted", label: "pb_market_cap_weighted" },
  { key: "pb_equal_weighted", label: "pb_equal_weighted" },
  { key: "dividend_yield_pct", label: "dividend_yield_pct" },
  { key: "roe_pct", label: "roe_pct" },
  { key: "ps", label: "ps" },
  { key: "constituent_avg_rolling_net_profit_100m", label: "constituent_avg_rolling_net_profit_100m" },
  { key: "constituent_avg_market_cap_100m", label: "constituent_avg_market_cap_100m" },
  { key: "index_total_float_market_cap_100m", label: "index_total_float_market_cap_100m" },
  { key: "index_total_market_cap_100m", label: "index_total_market_cap_100m" },
] as const;

const MAPPABLE_SCHEMA_FIELDS = WIDE_SCHEMA_COLUMNS.filter((column) => column.key !== "rowNumber");

type WideRow = FileImportResponse["previewRows"][number] | ImportedFileRow;

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  return String(value);
};

const getWideRowValue = (row: WideRow, key: string): unknown => {
  if (key === "rowNumber") return row.rowNumber;
  if (key === "assetSymbol") return row.assetSymbol;
  if (key === "assetName") return row.assetName;
  if (key === "tradeDate") return row.tradeDate;
  return row.payload[key];
};

function WideSchemaTable({ rows }: { rows: WideRow[] }) {
  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {WIDE_SCHEMA_COLUMNS.map((column) => (
              <TableHead key={column.key} className="min-w-[130px] whitespace-nowrap">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.rowNumber}>
              {WIDE_SCHEMA_COLUMNS.map((column) => (
                <TableCell key={column.key} className="whitespace-nowrap">
                  {formatCellValue(getWideRowValue(row, column.key))}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function DataImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState("ETF File Upload");
  const [dataCategory, setDataCategory] = useState("MARKET_DATA");
  const [dryRun, setDryRun] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<FileImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localFiles, setLocalFiles] = useState<LocalImportFile[]>([]);
  const [localBasePath, setLocalBasePath] = useState("");
  const [isLoadingLocalFiles, setIsLoadingLocalFiles] = useState(false);
  const [importBatches, setImportBatches] = useState<ImportedFileBatch[]>([]);
  const [selectedImport, setSelectedImport] = useState<ImportedFileBatch | null>(null);
  const [importRows, setImportRows] = useState<ImportedFileRow[]>([]);
  const [isLoadingImportedData, setIsLoadingImportedData] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});

  const visibleColumns = useMemo(() => result?.columns.slice(0, MAX_DISPLAY_COLUMNS) ?? [], [result]);
  const sourceColumns = result?.sourceColumns ?? [];

  const updateFieldMapping = (targetColumn: string, sourceColumn: string) => {
    setFieldMapping((current) => {
      const next = { ...current };
      if (sourceColumn === "__unmapped__") {
        delete next[targetColumn];
      } else {
        next[targetColumn] = sourceColumn;
      }
      return next;
    });
  };

  const loadLocalFiles = async () => {
    setIsLoadingLocalFiles(true);
    try {
      const response = await listLocalEtfImportFilesAsync();
      setLocalFiles(response.items);
      setLocalBasePath(response.basePath);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingLocalFiles(false);
    }
  };

  const loadImportedData = async () => {
    setIsLoadingImportedData(true);
    try {
      const response = await listImportedFileBatchesAsync();
      setImportBatches(response.items);
      if (!selectedImport && response.items.length > 0) {
        setSelectedImport(response.items[0]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoadingImportedData(false);
    }
  };

  useEffect(() => {
    loadLocalFiles();
    loadImportedData();
  }, []);

  useEffect(() => {
    if (!selectedImport) {
      setImportRows([]);
      return;
    }

    let cancelled = false;
    setIsLoadingImportedData(true);
    listImportedFileRowsAsync(selectedImport.importId)
      .then((response) => {
        if (!cancelled) setImportRows(response.items);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingImportedData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedImport]);

  const handleImport = async () => {
    if (!file) {
      setError("请选择一个文件。");
      return;
    }

    setIsImporting(true);
    setError(null);
    setResult(null);
    try {
      const response = await uploadEtfFileImportAsync({
        file,
        sourceName,
        dataCategory,
        dryRun,
        previewLimit: 8,
        fieldMapping,
      });
      setResult(response);
      setFieldMapping(response.fieldMapping ?? {});
      if (!response.dryRun) {
        await loadImportedData();
        setSelectedImport({
          importId: response.importId,
          sourceName: response.sourceName,
          fileName: response.fileName,
          rows: response.recordsSucceeded,
          assetSymbol: response.previewRows[0]?.assetSymbol ?? "",
          assetName: response.previewRows[0]?.assetName ?? "",
          minTradeDate: response.previewRows[0]?.tradeDate ?? null,
          maxTradeDate: response.previewRows[0]?.tradeDate ?? null,
          importedAt: new Date().toISOString(),
        });
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportLocalFile = async (relativePath: string) => {
    setIsImporting(true);
    setError(null);
    setResult(null);
    try {
      const response = await importLocalEtfFileAsync({
        relativePath,
        sourceName: "data/test ETF Files",
        dataCategory,
        dryRun,
        previewLimit: 8,
        fieldMapping,
      });
      setResult(response);
      setFieldMapping(response.fieldMapping ?? {});
      if (!response.dryRun) {
        await loadImportedData();
        setSelectedImport({
          importId: response.importId,
          sourceName: response.sourceName,
          fileName: response.fileName,
          rows: response.recordsSucceeded,
          assetSymbol: response.previewRows[0]?.assetSymbol ?? "",
          assetName: response.previewRows[0]?.assetName ?? "",
          minTradeDate: response.previewRows[0]?.tradeDate ?? null,
          maxTradeDate: response.previewRows[0]?.tradeDate ?? null,
          importedAt: new Date().toISOString(),
        });
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <ResearchWorkspaceNav />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">上传 ETF 数据文件</CardTitle>
                <CardDescription>上传后可预览并保存结构化数据</CardDescription>
              </div>
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="etf-file">文件</Label>
              <Input
                id="etf-file"
                type="file"
                accept=".csv,.tsv,.txt,.json,.jsonl,.ndjson,.xlsx,.xls,.parquet"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setResult(null);
                  setError(null);
                  setFieldMapping({});
                }}
              />
              {file ? (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="source-name">数据源名称</Label>
              <Input
                id="source-name"
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                placeholder="ETF File Upload"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="data-category">数据分类</Label>
              <Input
                id="data-category"
                value={dataCategory}
                onChange={(event) => setDataCategory(event.target.value)}
                placeholder="MARKET_DATA"
              />
            </div>

            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
                className="h-4 w-4"
              />
              仅解析预览，不保存
            </label>

            <Button onClick={handleImport} disabled={!file || isImporting}>
              {isImporting ? (
                <RefreshCw className="h-4 w-4 animate-spin" data-icon="inline-start" />
              ) : (
                <FileUp className="h-4 w-4" data-icon="inline-start" />
              )}
              {dryRun ? "解析预览" : "导入"}
            </Button>

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">导入结果</CardTitle>
            <CardDescription>按标准字段解析指数估值指标</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!result ? (
              <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
                上传文件后这里会显示导入结果和前几行预览。
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">状态</p>
                    <div className="mt-1 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{result.status}</span>
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">读取行数</p>
                    <p className="mt-1 text-sm font-medium">{result.recordsFetched}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">成功行数</p>
                    <p className="mt-1 text-sm font-medium">{result.recordsSucceeded}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">失败行数</p>
                    <p className="mt-1 text-sm font-medium">{result.recordsFailed}</p>
                  </div>
                </div>

                <div className="rounded-md border p-3 text-xs text-muted-foreground">
                  <p>importId: {result.importId}</p>
                  <p>tableName: {result.tableName}</p>
                  <p>fileName: {result.fileName}</p>
                  <p>message: {result.message}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {visibleColumns.map((column) => (
                    <Badge key={column} variant="outline">
                      {column}
                    </Badge>
                  ))}
                  {result.columns.length > MAX_DISPLAY_COLUMNS ? (
                    <Badge variant="secondary">+{result.columns.length - MAX_DISPLAY_COLUMNS}</Badge>
                  ) : null}
                </div>

                {sourceColumns.length > 0 ? (
                  <div className="rounded-md border p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">字段映射</p>
                        <p className="text-xs text-muted-foreground">默认按同名字段和已知中文表头匹配。</p>
                      </div>
                      <Badge variant="secondary">{sourceColumns.length} 个文件列</Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {MAPPABLE_SCHEMA_FIELDS.map((field) => (
                        <div key={field.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                          <span className="truncate text-xs font-medium" title={field.label}>
                            {field.label}
                          </span>
                          <Select
                            value={fieldMapping[field.key] ?? "__unmapped__"}
                            onValueChange={(value) => updateFieldMapping(field.key, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="未映射" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unmapped__">未映射</SelectItem>
                              {sourceColumns.map((sourceColumn) => (
                                <SelectItem key={`${field.key}-${sourceColumn}`} value={sourceColumn}>
                                  {sourceColumn}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <WideSchemaTable rows={result.previewRows} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">项目 data/test 文件</CardTitle>
              <CardDescription>{localBasePath || "后端未返回本地导入目录"}</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={loadLocalFiles} disabled={isLoadingLocalFiles}>
              <RefreshCw className={isLoadingLocalFiles ? "h-4 w-4 animate-spin" : "h-4 w-4"} data-icon="inline-start" />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {localFiles.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              当前未发现可导入文件。
            </div>
          ) : (
            <div className="overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>文件</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localFiles.map((localFile) => (
                    <TableRow key={localFile.relativePath}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          <span>{localFile.relativePath}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatBytes(localFile.sizeBytes)}</TableCell>
                      <TableCell>{new Date(localFile.modifiedAt).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isImporting}
                          onClick={() => handleImportLocalFile(localFile.relativePath)}
                        >
                          {dryRun ? "预览" : "导入"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">已导入数据</CardTitle>
              <CardDescription>点击导入批次查看前 100 行</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={loadImportedData} disabled={isLoadingImportedData}>
              <RefreshCw className={isLoadingImportedData ? "h-4 w-4 animate-spin" : "h-4 w-4"} data-icon="inline-start" />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 xl:grid-cols-5">
          <div className="xl:col-span-2 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文件</TableHead>
                  <TableHead>行数</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importBatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      暂无导入记录。
                    </TableCell>
                  </TableRow>
                ) : (
                  importBatches.map((batch) => (
                    <TableRow key={batch.importId}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{batch.fileName}</span>
                          <span className="text-xs text-muted-foreground">
                            {batch.assetSymbol || "-"} · {batch.assetName || "-"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {batch.minTradeDate || "-"} ~ {batch.maxTradeDate || "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{batch.rows}</TableCell>
                      <TableCell>
                        <Button size="sm" variant={selectedImport?.importId === batch.importId ? "default" : "outline"} onClick={() => setSelectedImport(batch)}>
                          查看数据
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="xl:col-span-3">
            {!selectedImport ? (
              <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
                请选择一个导入批次。
              </div>
            ) : importRows.length === 0 ? (
              <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
                {isLoadingImportedData ? "正在读取..." : "暂无数据。"}
              </div>
            ) : (
              <WideSchemaTable rows={importRows} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
