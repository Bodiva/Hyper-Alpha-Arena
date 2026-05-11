from __future__ import annotations

from clickhouse_common import (
    exit_with_clickhouse_error,
    get_clickhouse_config,
    get_client,
    print_connection_target,
)


QUERY = """
SELECT
    domain,
    count() AS total,
    avg(latency_ms) AS avg_latency
FROM {database}.url_check_log
GROUP BY domain
ORDER BY total DESC
"""


def main() -> None:
    config = get_clickhouse_config()
    print_connection_target(config)

    try:
        client = get_client(config)
        result = client.query(QUERY.format(database=config.database))
    except Exception as exc:
        exit_with_clickhouse_error(exc)

    print("domain\ttotal\tavg_latency")
    for row in result.result_rows:
        print(f"{row[0]}\t{row[1]}\t{float(row[2]):.2f}")


if __name__ == "__main__":
    main()
