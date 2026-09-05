# KOKET Dashboard Design QA

## Comparison target

- Source visual truth: [Figma · KOKET 운영 대시보드 · 완성본](https://www.figma.com/design/Lhe6mnYDwr1MbCjeGYm27r/%EB%8C%80%EC%8B%9C%EB%B3%B4%EB%93%9C-%EA%B5%AC%EC%84%B1?node-id=195-10)
- Source nodes: `195:11` 핵심 현황, `195:182` 회원·활성·리텐션, `195:494` 상품·공급, `195:811` 찜·거래·채팅·후기, `195:1108` 퍼널
- Implementation screenshots:
  - `qa/core-browser-final.jpg`
  - `qa/members-browser-final.jpg`
  - `qa/supply-browser-final.jpg`
  - `qa/engagement-browser-final.jpg`
  - `qa/funnels-browser-final.jpg`
- Browser viewport: 1363 × 936 CSS px, device scale factor 1
- Source natural sizes: core 1440 × 1396, members 1440 × 2325, supply 1440 × 2336, engagement 1440 × 1866, funnels 1440 × 1900
- Implementation capture sizes: core 1348 × 1472, members 1348 × 2882, supply 1348 × 2412, engagement 1348 × 3152, funnel viewport 1363 × 936
- Density normalization: source and implementation both judged at 1× CSS density; source frames were proportionally fit to the implementation width for visual comparison.
- State: desktop, light theme, example-data fallback, default date range 2026-07-28–2026-08-03.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- Fonts and typography: Noto Sans KR-first stack, weights, hierarchy, line height, and compact Korean labels match the source. No clipped KPI or chart-end labels were found.
- Spacing and layout rhythm: 72px top bar, 56px navigation, 40px page gutters, five-column KPI grid, two-column chart grid, 12px card radii, and section spacing match the source proportions.
- Colors and visual tokens: orange, blue-gray, light-gray background, green positive state, and red negative state are consistently mapped to shared CSS tokens.
- Image and asset fidelity: the source contains no photo or illustration assets. The K mark is reproduced as the same typographic brand tile; charts use the application chart renderer rather than raster placeholders.
- Copy and content: Figma labels are preserved where they match the live schema. Product categories use the current app's six labels: 교재, 전자기기, 생활, 의류, 스포츠, 기타.
- Responsive behavior: no horizontal overflow at the tested desktop viewport. Tablet and mobile grids collapse without hiding controls.
- Accessibility and interaction: navigation is button-based with an active state, the date control exposes `aria-expanded`, date inputs have labels, and reduced-motion preferences are respected.

## Full-view comparison evidence

- Core: header, tab bar, title, reading-order notice, five KPI cards, two-by-two chart grid, value labels, and interpretation strips align with the Figma hierarchy.
- Members: the Figma layout is preserved through the retention and dormant sections; platform and app-version cards are appended as requested without changing the earlier hierarchy.
- Supply: KPI and chart order match Figma. The status panel uses the available live RPC snapshot rather than inventing unavailable historical rows.
- Engagement: the first six chart cards match Figma; trade-place, time-of-day, hourly, weekday, and operations cards are appended from the implemented RPC fields.
- Funnels: the visible header, three KPI cards, funnel geometry, stage labels, drop-off labels, and reading panel match the Figma frame.

## Focused region comparison evidence

- KPI region: numeric typography, delta badges, notes, and five-column sizing were inspected at readable scale.
- Chart labels: every vertical/horizontal bar has an end label and every line has a final-point value label.
- Funnel region: widths narrow consistently, drop-off values sit outside the funnel, and the right-side interpretation card keeps source alignment.
- No additional image-focused crop was needed because the design has no raster content and the full-resolution Figma captures kept all UI text legible.

## Comparison history

1. Earlier P2: the connection explanation occupied a full row and shifted the KPI grid below the Figma position.
   - Fix: removed the extra row and kept data-source status in the existing `예시 데이터` / `실데이터` chip.
   - Post-fix evidence: `qa/core-browser-final.jpg` aligns the KPI row directly below the reading-order notice.
2. Earlier P2: chart animations could be captured midway, making lines and bars appear incomplete.
   - Fix: disabled chart animation for deterministic administrator reporting and screenshots.
   - Post-fix evidence: final browser captures show complete lines, bars, and labels.
3. Earlier P2: the member activity card showed DAU only even though Figma contains DAU/WAU/MAU controls and the RPC exposes all three series.
   - Fix: added a working DAU/WAU/MAU segmented control.
   - Post-fix evidence: browser interaction changed the card to `WAU 기준 · 기간별 고유 사용자` and rendered seven WAU points.

## Primary interactions tested

- Switched among all five dashboard tabs.
- Opened and closed the date-range popover and applied the selected range.
- Switched the active-member chart from DAU to WAU.
- Confirmed example-data fallback after the server returned the expected no-environment configuration response.
- Checked browser console logs: no warnings or errors from `terminal.local`.

## Follow-up polish

- P3: the Figma file shows a historical weekly product-status composition, while the current RPC exposes a current status snapshot. Adding a weekly status series to the RPC would allow an exact historical version of that panel without fabricated values.
- P3: the displayed refresh timestamp intentionally uses current Asia/Seoul time instead of the static timestamp in the mock.

## Implementation checklist

- [x] Five Figma dashboard tabs implemented
- [x] Platform/app-version and trade place/time visualizations added
- [x] Supabase service-role key kept server-side
- [x] Loading, live, example-data, and empty numeric states supported
- [x] Production build passed
- [x] Sites worker tests passed (4/4)
- [x] Browser interaction and console checks passed

final result: passed
