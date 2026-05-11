from __future__ import annotations

from clickhouse_common import (
    exit_with_clickhouse_error,
    get_clickhouse_config,
    get_client,
    print_connection_target,
)


TABLE_DDL = """
CREATE TABLE IF NOT EXISTS {database}.url_check_log
(
    check_time DateTime,
    url String,
    domain String,
    status_code UInt16,
    content_hash String,
    is_changed UInt8,
    latency_ms UInt32
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(check_time)
ORDER BY (domain, url, check_time)
"""


def main() -> None:
    config = get_clickhouse_config()
    print_connection_target(config)

    try:
        client = get_client(config)
        client.command(f"CREATE DATABASE IF NOT EXISTS {config.database}")
        client.command(TABLE_DDL.format(database=config.database))
    except Exception as exc:
        exit_with_clickhouse_error(exc)

    print(f"Initialized {config.database}.url_check_log")


if __name__ == "__main__":
    main()
