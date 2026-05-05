from __future__ import annotations

import hashlib
import io
import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional
from uuid import uuid4

import pandas as pd

from schemas.alpha_trace_data_source import FileImportPreviewRow, FileImportResponse
from services.clickhouse_business_store import (
    ClickHouseStoreError,
    get_clickhouse_business_store,
    get_etf_import_table_name,
)


class EtfFileImportError(ValueError):
    pass


_SYMBOL_COLUMNS = {
    "symbol",
    "ticker",
    "code",
    "asset_code",
    "fund_code",
    "etf_code",
    "ts_code",
    "seccode",
    "security_code",
    "证券代码",
    "基金代码",
    "指数代码",
    "代码",
}

_NAME_COLUMNS = {
    "name",
    "asset_name",
    "fund_name",
    "etf_name",
    "security_name",
    "证券简称",
    "证券名称",
    "基金简称",
    "基金名称",
    "指数简称",
    "指数名称",
    "名称",
}

_DATE_COLUMNS = {
    "date",
    "trade_date",
    "trading_date",
    "nav_date",
    "biz_date",
    "calendar_date",
    "交易日期",
    "日期",
    "净值日期",
}

ETF_INDEX_VALUATION_COLUMNS = [
    "import_id",
    "source_name",
    "file_name",
    "file_sha256",
    "row_number",
    "index_code",
    "index_name",
    "trade_date",
    "close_price",
    "pe_etf_weighted",
    "pe_market_cap_weighted",
    "pe_equal_weighted",
    "pb_etf_weighted",
    "pb_market_cap_weighted",
    "pb_equal_weighted",
    "dividend_yield_pct",
    "roe_pct",
    "ps",
    "constituent_avg_rolling_net_profit_100m",
    "constituent_avg_market_cap_100m",
    "index_total_float_market_cap_100m",
    "index_total_market_cap_100m",
    "data_category",
    "imported_at",
]

ETF_INDEX_VALUATION_METRIC_COLUMNS = [
    "close_price",
    "pe_etf_weighted",
    "pe_market_cap_weighted",
    "pe_equal_weighted",
    "pb_etf_weighted",
    "pb_market_cap_weighted",
    "pb_equal_weighted",
    "dividend_yield_pct",
    "roe_pct",
    "ps",
    "constituent_avg_rolling_net_profit_100m",
    "constituent_avg_market_cap_100m",
    "index_total_float_market_cap_100m",
    "index_total_market_cap_100m",
]

_FLOAT_COLUMNS = {
    "close_price": {"收盘价", "close_price", "close"},
    "pe_etf_weighted": {"PE_ETF加权", "pe_etf_weighted"},
    "pe_market_cap_weighted": {"PE_市值加权", "pe_market_cap_weighted"},
    "pe_equal_weighted": {"PE_等权", "pe_equal_weighted"},
    "pb_etf_weighted": {"PB_ETF加权", "pb_etf_weighted"},
    "pb_market_cap_weighted": {"PB_市值加权", "pb_market_cap_weighted"},
    "pb_equal_weighted": {"PB_等权", "pb_equal_weighted"},
    "dividend_yield_pct": {"股息收益率 %", "股息收益率%", "dividend_yield_pct"},
    "roe_pct": {"ROE %", "ROE%", "roe_pct"},
    "ps": {"PS", "ps"},
    "constituent_avg_rolling_net_profit_100m": {
        "成分股平均滚动净利润(亿)",
        "constituent_avg_rolling_net_profit_100m",
    },
    "constituent_avg_market_cap_100m": {"成分股平均市值(亿)", "constituent_avg_market_cap_100m"},
    "index_total_float_market_cap_100m": {"指数总流通市值(亿)", "index_total_float_market_cap_100m"},
    "index_total_market_cap_100m": {"指数总市值(亿)", "index_total_market_cap_100m"},
}


@dataclass(frozen=True)
class ParsedImportRows:
    columns: list[str]
    rows: list[dict[str, Any]]


def _normalize_column_name(value: Any) -> str:
    return str(value).strip()


def _lookup_key(value: str) -> str:
    return value.strip().lower().replace(" ", "").replace("-", "_")


def _clean_scalar(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        if pd.isna(value):
            return None
        return value.isoformat()
    return value


def _clean_record(record: dict[str, Any]) -> dict[str, Any]:
    return {str(key): _clean_scalar(value) for key, value in record.items()}


def _read_csv(content: bytes, sep: Optional[str] = None) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            if sep is None:
                return pd.read_csv(io.BytesIO(content), dtype=str, encoding=encoding)
            return pd.read_csv(io.BytesIO(content), dtype=str, sep=sep, encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise EtfFileImportError("Unable to decode CSV file with utf-8 or gb18030.")


def _read_dataframe(filename: str, content: bytes) -> pd.DataFrame:
    suffix = Path(filename).suffix.lower()
    if suffix in {".csv", ".txt"}:
        return _read_csv(content)
    if suffix == ".tsv":
        return _read_csv(content, sep="\t")
    if suffix in {".jsonl", ".ndjson"}:
        return pd.read_json(io.BytesIO(content), lines=True)
    if suffix == ".json":
        return pd.read_json(io.BytesIO(content))
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(io.BytesIO(content), dtype=str)
    if suffix == ".parquet":
        return pd.read_parquet(io.BytesIO(content))
    raise EtfFileImportError(f"Unsupported file type: {suffix or 'unknown'}")


def parse_etf_file(filename: str, content: bytes) -> ParsedImportRows:
    dataframe = _read_dataframe(filename, content)
    if dataframe.empty:
        raise EtfFileImportError("The uploaded file has no rows.")

    dataframe.columns = [_normalize_column_name(column) for column in dataframe.columns]
    records = [_clean_record(record) for record in dataframe.to_dict(orient="records")]
    return ParsedImportRows(columns=list(dataframe.columns), rows=records)


def _first_matching_value(record: dict[str, Any], candidates: set[str]) -> str:
    for key, value in record.items():
        if _lookup_key(key) in candidates and value not in (None, ""):
            return str(value).strip()
    return ""


def _first_matching_date(record: dict[str, Any]) -> Optional[str]:
    raw = _first_matching_value(record, _DATE_COLUMNS)
    if not raw:
        return None
    parsed = pd.to_datetime(raw, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, pd.Timestamp)):
        return value.isoformat()
    return str(value)


def _to_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and math.isnan(value):
            return None
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "--", "nan", "NaN", "NULL", "null"}:
        return None
    text = text.replace(",", "").replace("%", "")
    try:
        return float(text)
    except ValueError:
        return None


def _first_matching_float(record: dict[str, Any], candidates: set[str]) -> Optional[float]:
    for key, value in record.items():
        if _lookup_key(key) in {_lookup_key(candidate) for candidate in candidates}:
            return _to_float(value)
    return None


def _metric_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {column: row.get(column) for column in ETF_INDEX_VALUATION_METRIC_COLUMNS}


def _build_clickhouse_rows(
    *,
    import_id: str,
    source_name: str,
    filename: str,
    file_sha256: str,
    data_category: str,
    records: Iterable[dict[str, Any]],
    imported_at: str,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, record in enumerate(records, start=1):
        rows.append(
            {
                "import_id": import_id,
                "source_name": source_name,
                "file_name": filename,
                "file_sha256": file_sha256,
                "row_number": index,
                "index_code": _first_matching_value(record, _SYMBOL_COLUMNS),
                "index_name": _first_matching_value(record, _NAME_COLUMNS),
                "trade_date": _first_matching_date(record),
                **{
                    column: _first_matching_float(record, candidates)
                    for column, candidates in _FLOAT_COLUMNS.items()
                },
                "data_category": data_category,
                "imported_at": imported_at,
            }
        )
    return rows


def _to_preview_rows(rows: list[dict[str, Any]], records: list[dict[str, Any]], limit: int) -> list[FileImportPreviewRow]:
    preview: list[FileImportPreviewRow] = []
    for row, payload in zip(rows[:limit], records[:limit]):
        preview.append(
            FileImportPreviewRow(
                rowNumber=int(row["row_number"]),
                assetSymbol=str(row["index_code"]),
                assetName=str(row["index_name"]),
                tradeDate=row["trade_date"],
                payload=_metric_payload(row),
            )
        )
    return preview


def import_etf_file_to_clickhouse(
    *,
    filename: str,
    content: bytes,
    source_name: str = "ETF File Upload",
    data_category: str = "MARKET_DATA",
    dry_run: bool = False,
    preview_limit: int = 5,
) -> FileImportResponse:
    max_rows = int(os.getenv("ALPHA_TRACE_FILE_IMPORT_MAX_ROWS", "100000"))
    parsed = parse_etf_file(filename, content)
    if len(parsed.rows) > max_rows:
        raise EtfFileImportError(f"File contains {len(parsed.rows)} rows, exceeding limit {max_rows}.")

    import_id = f"etf_import_{uuid4().hex}"
    file_sha256 = hashlib.sha256(content).hexdigest()
    imported_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    table_name = get_etf_import_table_name()
    clickhouse_rows = _build_clickhouse_rows(
        import_id=import_id,
        source_name=source_name,
        filename=Path(filename).name,
        file_sha256=file_sha256,
        data_category=data_category,
        records=parsed.rows,
        imported_at=imported_at,
    )

    if not dry_run:
        store = get_clickhouse_business_store()
        table_name = store.ensure_etf_import_table(table_name)
        import json

        json_lines = "\n".join(json.dumps(row, ensure_ascii=False, default=_json_default) for row in clickhouse_rows)
        store.insert_json_each_row(table_name, json_lines)

    return FileImportResponse(
        importId=import_id,
        sourceName=source_name,
        fileName=Path(filename).name,
        tableName=table_name,
        status="SUCCESS",
        dryRun=dry_run,
        recordsFetched=len(parsed.rows),
        recordsSucceeded=len(parsed.rows),
        recordsFailed=0,
        columns=ETF_INDEX_VALUATION_COLUMNS,
        previewRows=_to_preview_rows(clickhouse_rows, parsed.rows, preview_limit),
        message="File parsed successfully." if dry_run else "File imported into ClickHouse.",
    )


__all__ = [
    "ClickHouseStoreError",
    "ETF_INDEX_VALUATION_COLUMNS",
    "ETF_INDEX_VALUATION_METRIC_COLUMNS",
    "EtfFileImportError",
    "import_etf_file_to_clickhouse",
    "parse_etf_file",
]
