# KOKET dashboard: existing component contract

This repair preserves the deployed dashboard and its reusable components. It adds data states and source explanations, not a visual redesign.

## Tokens and typography

`src/styles.css` is the existing source of truth: Noto Sans KR / platform Korean sans-serif, `--text` #1e1e1e, `--muted` #667085, `--line` #e2e6ec, `--soft` #f7f8fa, `--orange` #ffb84d, `--orange-ink` #8a4b00. Reuse current spacing, neutral card borders, chart colors and responsive breakpoints. No new fonts, colors or motion are required.

## Components and states

Reuse `KpiCard`, `FunnelBlock`, `ChartCard`, `MetricTable`, `EmptyNotice` and the existing date picker. Keep the signed administrator login and API protection. The current page is the state harness for these primitives.

- Business-record funnels appear before click-event funnels and name their start date and snapshot semantics.
- No event records means unavailable, never a measured zero conversion.
- Incomplete observation windows are visibly provisional. A missing next step is called not-yet-reached, not confirmed abandonment.
- Zero denominators render an em dash. No invented duration or comparison values in live mode.
- Counts, units and percentages are written as text; color and bar width are supplementary.
- Existing responsive cards and text wrapping remain in use; keyboard navigation and focus styles are preserved.

## Verification and scope

Verify populated business data, empty events and provisional event cohorts in the browser and unit tests. Existing unrelated dashboard layout and performance are outside this data repair. No new development runtime or telemetry is introduced.
