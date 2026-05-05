# Qwen Structured JSON Output Enhancement

## Scope

Task 42 adds a conservative structured-output parser to QwenRunner. It does not remove the current Markdown section parser and does not change the async submit, SSE, JSON store, or Qwen multi-agent call flow.

## Parser Strategy

1. Try to extract a JSON object from the Qwen response.
2. Support raw JSON and fenced ```json blocks.
3. Map structured keys to existing report sections:
   - `marketView` / `market_view` -> Market View
   - `bullView` / `bull_view` -> Bull View
   - `bearView` / `bear_view` -> Bear View
   - `riskReview` / `risk_review` -> Risk Review
   - `finalDecision` / `final_decision` -> Final Decision
   - `watchIndicators` / `watch_indicators` -> Watch Indicators
4. Convert nested JSON into readable Markdown-like text for existing frontend report rendering.
5. If JSON parsing fails or does not contain known keys, fall back to the existing Markdown section parser.

## Prompt Boundary

The Qwen step prompt now allows structured JSON as a supported output shape, but still permits structured Markdown. This avoids breaking current report readability while allowing future model responses to be parsed more deterministically.

## Out of Scope

- No TradingAgents integration.
- No new endpoint.
- No frontend state change.
- No external data source.
- No real database writes.
