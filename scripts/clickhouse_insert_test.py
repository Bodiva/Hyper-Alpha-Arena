from __future__ import annotations

from datetime import datetime, timezone

from clickhouse_common import (
    exit_with_clickhouse_error,
    get_clickhouse_config,
    get_client,
    print_connection_target,
)


COLUMNS = [
    "check_time",
    "url",
    "domain",
    "status_code",
    "content_hash",
    "is_changed",
    "latency_ms",
]


def main() -> None:
    config = get_clickhouse_config()
    print_connection_target(config)

    now = datetime.now(timezone.utc).replace(microsecond=0, tzinfo=None)
    rows = [
        (
            now,
            "https://www.akooi.com/",
            "www.akooi.com",
            200,
            "test_hash_home_001",
            0,
            128,
        ),
        (
            now,
            "https://www.akooi.com/docs/",
            "www.akooi.com",
            200,
            "test_hash_docs_001",
            1,
            243,
        ),
    ]

    try:
        client = get_client(config)
        client.insert(
            f"{config.database}.url_check_log",
            rows,
            column_names=COLUMNS,
        )
    except Exception as exc:
        exit_with_clickhouse_error(exc)

    print(f"Inserted {len(rows)} rows into {config.database}.url_check_log")


if __name__ == "__main__":
    main()
