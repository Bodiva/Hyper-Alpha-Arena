# AlphaTrace Mobile Market View Layout

## Scope

Task 41 adds a narrow-screen AlphaTrace layout for the new workspace only. It does not modify the legacy Hyper Alpha Arena mobile layout or old business pages.

## Implementation

- `ResearchWorkspaceNav` now includes a mobile-only bottom navigation with four focused entries:
  - Home
  - Market
  - Agent
  - Portfolio
- `DashboardPage` now includes a mobile-only `Mobile Market View` card.
- The mobile market card provides static research entry points for:
  - ETF / Index observation
  - Fund NAV tracking
  - Futures structure observation
  - Agent viewpoint entry

## Boundaries

- No real-time market data is connected.
- No external data provider is connected.
- No trading workflow is added.
- No old Sidebar or legacy mobile layout is replaced.

## Validation

- Desktop layout remains unchanged except for shared new workspace nav internals.
- Narrow screens get a compact market entry and bottom navigation.
- Navigation uses existing `/dashboard#<route>` AlphaTrace hash routing.
