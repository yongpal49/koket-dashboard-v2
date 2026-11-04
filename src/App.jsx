import { formatMetric as format, metricChange as delta, normalizeRetentionWeeks, metricShare } from "./utils/metrics.js";
import { useEffect, useMemo, useState } from "react";
import {
  AdaptiveDistribution,
  ChartCard,
  DataModeContext,
  Donut,
  HorizontalBars,
  ReadRateBars,
  RetentionHeatmap,
  StackedBars,
  TrendLines,
  VerticalBars,
  chartColors,
} from "./components/Charts.jsx";
import { loadDashboard } from "./data/dashboardService.js";
import { DateRangePicker } from "./components/DateRangePicker.jsx";
import { recentRange } from "./utils/dateRange.js";
import { checkAdminSession, loginAdmin, logoutAdmin } from "./data/authService.js";
import { funnelDuration, funnelStatus, stageCount, stageGap } from "./utils/funnels.js";
import { ACCOUNT_STATUS_LABELS, ITEM_STATUS_LABELS, TRADE_STATUS_LABELS, NOTIFICATION_LABELS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS, EVENT_LABELS, displayLabel, dormitoryLabel } from "../shared/dashboard-labels.js";


const TABS = [
  { id: "core", label: "핵심 현황" },
  { id: "members", label: "회원·활성·리텐션" },
  { id: "supply", label: "상품·공급" },
  { id: "engagement", label: "찜·거래·채팅·후기" },
  { id: "funnels", label: "퍼널" },
];

const PAGE_META = {
  core: ["핵심 현황", "서비스 상태를 30초 안에 파악하는 경영 요약 화면", "핵심 카드 → 추이 → 원인 비교 → 운영 행동"],
  members: ["회원·활성·리텐션", "사람이 들어오고, 활동하고, 다시 돌아오는지 확인", "회원 카드 → 가입 추이 → 활동·구성 → 리텐션"],
  supply: ["상품·공급", "거래의 출발점인 매물과 실제 판매까지의 흐름 확인", "공급 카드 → 추이 → 상태 비교 → 판매 속도"],
  engagement: ["찜·거래·채팅·후기", "관심이 대화와 예약, 거래, 신뢰로 이어지는 과정 확인", "관심 카드 → 추이 → 카테고리 → 장소·시간"],
  funnels: ["퍼널", "가입·등록·거래의 단계별 전환과 이탈 원인 확인", "핵심 카드 → 퍼널 → 병목 비교 → 개선 행동"],
};


function KpiCard({ label, value, unit, current, previous, percentagePoint = false, inverse = false, note, changeText }) {
  const change = delta(current, previous, percentagePoint, inverse);
  return (
    <article className="kpi-card">
      <span className="kpi-label">{label}</span>
      <strong>{value ?? format(current, unit)}</strong>
      <div className="kpi-foot">
        <b className={changeText ? "neutral" : change.tone}>{changeText ?? change.text}</b>
        <span>{note}</span>
      </div>
    </article>
  );
}

function PageIntro({ page, refreshedAt }) {
  const [title, subtitle, order] = PAGE_META[page];
  return (
    <>
      <div className="page-title-row">
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        <span>마지막 갱신 {refreshedAt}</span>
      </div>
      <div className="reading-order"><b>보는 순서</b><span>{order}</span></div>
    </>
  );
}

function EmptyNotice({ mode }) {
  if (mode !== "live") return null;
  return <div className="live-notice">실제 저장 데이터 기준. 0은 집계 결과 0건, –는 기록 부족 또는 계산 불가입니다. 지표별 조회 기간과 현재 상태 기준은 각 차트 설명·집계 안내를 참고해주세요.</div>;
}

function MetricTable({ rows, columns, rowKey, emptyText = "해당 기간 기록 없음" }) {
  if (!Array.isArray(rows)) return <div className="chart-empty">새 집계 항목은 서버 업데이트 후 표시됩니다.</div>;
  if (!rows.length) return <div className="chart-empty">{emptyText}</div>;
  return <div className="metric-table-wrap"><table className="metric-table">
    <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row[rowKey]}>{columns.map(column => <td key={column.key} className={column.numeric ? "numeric" : ""}>{column.numeric ? format(row[column.key], column.unit || "") : row[column.key]}</td>)}</tr>)}</tbody>
  </table></div>;
}

function CorePage({ data, mode }) {
  const c = data.kpis.current;
  const p = data.kpis.previous;
  const mix = data.guest_member_mix.map((row) => ({ ...row, actor_type: row.actor_type === "guest" ? "게스트" : "회원" }));
  return (
    <>
      <EmptyNotice mode={mode} />
      <div className="kpi-grid five">
        <KpiCard label="선택 기간 거래 완료" current={c.completed_trades} previous={p.completed_trades} unit="건" note="선택 기간 완료 거래" />
        <KpiCard label="전체 거래 전환율" current={c.trade_conversion_rate} previous={p.trade_conversion_rate} unit="%" percentagePoint note="상품 조회 후 7일 · 잠정값" />
        <KpiCard label="판매 성사율" current={c.sale_success_rate} previous={p.sale_success_rate} unit="%" percentagePoint note="상품 등록 후 30일 · 잠정값" />
        <KpiCard label="게스트 → 회원" current={c.guest_conversion_rate} previous={p.guest_conversion_rate} unit="%" percentagePoint note="로그인 요구 후 30일" />
        <KpiCard label="상품 등록 완료율" current={c.registration_completion_rate} previous={p.registration_completion_rate} unit="%" percentagePoint note="등록 시작 후 24시간 · 잠정값" />
      </div>
      <div className="chart-grid">
        <ChartCard title="선택 기간 거래 완료 추이" subtitle="선택 기간 · 일별 완료 거래" insight="금·일 거래 완료가 높음">
          <VerticalBars data={data.completed_trades_daily} xKey="date" valueKey="value" suffix="건" accentLast />
        </ChartCard>
        <ChartCard title="거래·판매 전환 추이" subtitle="종료일 기준 최근 8주 · 진행 중인 주 포함" insight="거래·판매 전환율 모두 상승">
          <TrendLines data={data.weekly_conversion_trend} xKey="week_start" lines={[{ key: "trade_conversion_rate", name: "거래", suffix: "%", color: chartColors.orange }, { key: "sale_success_rate", name: "판매", suffix: "%", color: chartColors.slate }]} />
        </ChartCard>
        <ChartCard title="게스트·회원 구성" subtitle="선택 기간에 행동 이벤트가 기록된 사용자" insight="회원 비중이 안정적으로 유지되는지 확인">
          <Donut data={mix} nameKey="actor_type" valueKey="actors" centerLabel="게스트" />
        </ChartCard>
        <ChartCard title="로그인 요구 화면별 회원 전환 건수" subtitle="로그인 요구 후 30일 내 가입 · 잠정값" insight="채팅 시작에서 회원 전환이 가장 높음">
          <HorizontalBars data={data.login_required_conversion_by_feature} yKey="feature" valueKey="converted_guests" suffix="명" />
        </ChartCard>
      </div>
    </>
  );
}

function MembersPage({ data, mode }) {
  const [activityMetric, setActivityMetric] = useState("dau");
  const c = data.kpis.current;
  const p = data.kpis.previous;
  const status = data.account_status_distribution.map((r) => ({ ...r, status: displayLabel(ACCOUNT_STATUS_LABELS, r.status) }));
  const activity = data.activity_status_distribution.map((r) => ({ ...r, status: r.status === "active" ? "활성 회원" : r.status === "dormant" ? "휴면 회원" : r.status }));
  const platforms = data.platform_distribution.map((r) => ({ ...r, platform: r.platform === "android" ? "Android" : r.platform === "ios" ? "iOS" : r.platform === "web" ? "Web" : r.platform === "pwa" ? "PWA" : r.platform }));
  const statusTotal = status.reduce((sum, row) => sum + Number(row.members || 0), 0);
  const remainingAccounts = data.account_status_distribution.filter((row) => !["withdrawn", "탈퇴", "탈퇴 처리"].includes(row.status)).reduce((sum, row) => sum + Number(row.members || 0), 0);
  const retentionRows = data.retention_cohorts.map((row) => ({
    ...row,
    weeks: normalizeRetentionWeeks(row.weeks),
  }));
  const activitySeries = activityMetric === "dau" ? data.dau_trend : activityMetric === "wau" ? data.wau_trend : data.mau_trend;
  const activityXKey = activityMetric === "dau" ? "date" : activityMetric === "wau" ? "week_start" : "month_start";
  const dormitories = (data.dormitory_distribution || []).map(row => ({ ...row, label: dormitoryLabel(row.dormitory_code) }));
  const dormPublic = (data.dormitory_public_distribution || [])
    .map(row => ({ ...row, label: row.visibility === "public" ? "공개" : "비공개" }))
    .sort((a, b) => (a.visibility === "public") - (b.visibility === "public"));
  const dormPublicTotal = dormPublic.reduce((sum, row) => sum + Number(row.members || 0), 0);
  const dormPublicMembers = dormPublic.find(row => row.visibility === "public")?.members || 0;
  return (
    <>
      <EmptyNotice mode={mode} />
      <div className="kpi-grid five">
        <KpiCard label="신규 게스트" current={c.new_guests} previous={p.new_guests} unit="명" note="선택 기간 첫 방문" />
        <KpiCard label="신규 회원" current={c.new_members} previous={p.new_members} unit="명" note="선택 기간 가입 완료" />
        <KpiCard label="회원 수" current={c.total_members} previous={p.total_members} unit="명" note="기간 말 · 탈퇴·관리자 제외" />
        <KpiCard label="선택 기간 활성 회원률" current={c.active_member_rate} previous={p.active_member_rate} unit="%" percentagePoint note="활성 회원 ÷ 전체 회원" />
        <KpiCard label="4주 리텐션" current={c.week_4_retention_rate} previous={p.week_4_retention_rate} unit="%" percentagePoint note="4주 후 재방문" />
      </div>
      <div className="chart-grid">
        <ChartCard title="날짜별 누적 가입 회원" subtitle={<>단위: 명 · 관리자 제외, 탈퇴 가입 이력 포함 · <span style={{ display: "inline-block" }}>현재 회원 수와 다를 수 있음</span></>}>
          {Array.isArray(data.members_daily) ? <TrendLines data={data.members_daily} xKey="date" showCountAxis lines={[{ key: "cumulative_members", name: "누적 가입 회원", suffix: "명", color: chartColors.orange }]} /> : <div className="chart-empty">날짜별 가입 추이를 불러올 수 없습니다. 서버 업데이트 후 다시 조회해주세요.</div>}
        </ChartCard>
        <ChartCard title="일별 신규 가입 회원" subtitle="선택 기간 · KST 가입일 기준(명) · 오늘은 조회 시점까지 집계">
          {Array.isArray(data.members_daily) ? <VerticalBars data={data.members_daily} xKey="date" valueKey="new_members" valueName="신규 가입 회원" suffix="명" showCountAxis accentLast /> : <div className="chart-empty">날짜별 가입 추이를 불러올 수 없습니다. 서버 업데이트 후 다시 조회해주세요.</div>}
        </ChartCard>
        <ChartCard title="활성 사용자 추이" subtitle={`${activityMetric.toUpperCase()} 기준 · 기간별 고유 사용자`} insight="단기 방문과 지속 성장 흐름을 구분">
          <div className="activity-chart">
            <TrendLines data={activitySeries} xKey={activityXKey} height={220} lines={[{ key: "value", name: activityMetric.toUpperCase(), suffix: "명", color: chartColors.orange }]} />
            <div className="metric-tabs" aria-label="활성 사용자 집계 단위">{["dau", "wau", "mau"].map((metric) => <button key={metric} type="button" className={activityMetric === metric ? "active" : ""} onClick={() => setActivityMetric(metric)}>{metric.toUpperCase()}</button>)}</div>
          </div>
        </ChartCard>
        <ChartCard title="학과별 회원 수" subtitle="선택 종료일 이전 가입 · 현재 남은 계정" insight="회원이 적은 학과의 홍보 우선순위를 확인">
          <HorizontalBars data={data.department_distribution} yKey="department_code" valueKey="members" suffix="명" />
        </ChartCard>
        <ChartCard title="회원 상태 구성" subtitle="현재 상태 · 탈퇴 처리 중은 미탈퇴 계정에 포함" insight="회원 기반의 건강도를 상태 비중으로 판단">
          <Donut data={status} nameKey="status" valueKey="members" centerValue={format(metricShare(remainingAccounts, statusTotal), "%")} centerLabel="미탈퇴 계정" />
        </ChartCard>
        <ChartCard title="회원 탈퇴율 추이" subtitle="최근 7개 완료주 · 주간 탈퇴율" insight="정책이나 사용성 문제의 조기 신호를 확인">
          <TrendLines data={data.withdrawals_weekly} xKey="week_start" lines={[{ key: "withdrawal_rate", name: "탈퇴율", suffix: "%", color: chartColors.orange }]} />
        </ChartCard>
        <ChartCard title="가입 주차별 리텐션" subtitle="가입 주차 · 4주 재방문 코호트" insight="온보딩과 업데이트 전후의 재방문 변화를 비교">
          <RetentionHeatmap rows={retentionRows} />
        </ChartCard>
        <ChartCard title="활성·휴면 회원" subtitle="최근 활동일 기준" insight={`휴면 회원 ${format(activity.find((x) => x.status.includes("휴면"))?.members, "명")} · 재활성화율 ${format(data.reactivation?.reactivation_rate, "%")}`}>
          <Donut data={activity} nameKey="status" valueKey="members" centerValue={format(data.reactivation?.reactivation_rate, "%")} centerLabel="재활성화" />
        </ChartCard>
        <ChartCard title="휴면 기간별 구성" subtitle="마지막 활동 이후 경과일" insight="90일 이상 휴면군을 우선 복귀 대상으로 관리">
          <Donut data={data.dormant_period_distribution} nameKey="bucket" valueKey="members" centerValue={format(data.dormant_period_distribution.reduce((s, x) => s + Number(x.members || 0), 0), "명")} centerLabel="휴면 회원" />
        </ChartCard>
        <ChartCard title="플랫폼 분포" subtitle="선택 기간 의미 있는 활동 사용자" insight="Android 출시 이후 플랫폼별 활동 비중 확인">
          <Donut data={platforms} nameKey="platform" valueKey="actors" centerValue={format(platforms.reduce((s, x) => s + Number(x.actors || 0), 0), "명")} centerLabel="활동 사용자" />
        </ChartCard>
        <ChartCard title="앱 버전별 활성 사용자" subtitle="플랫폼·앱 버전별 고유 사용자" insight="낮은 버전 사용자의 업데이트 필요 규모를 확인">
          <HorizontalBars data={data.app_version_distribution.map((r) => ({ ...r, label: `${({ android: "Android", ios: "iOS", web: "Web", pwa: "PWA" })[r.platform] || r.platform} ${r.app_version}` }))} yKey="label" valueKey="actors" suffix="명" />
        </ChartCard>
        <ChartCard title="생활관 선택 분포" subtitle="현재 미탈퇴 회원 · 본인 선택값 · 거주 인증 아님">
          <HorizontalBars data={dormitories} yKey="label" valueKey="members" suffix="명" height={Math.max(260, dormitories.length * 34 + 36)} />
        </ChartCard>
        <ChartCard title="프로필 생활관 공개 설정" subtitle="현재 미탈퇴 회원 · 상품의 생활관 공개와 별개">
          <Donut data={dormPublic} nameKey="label" valueKey="members" centerValue={format(metricShare(dormPublicMembers, dormPublicTotal), "%")} centerLabel="공개 비율" />
        </ChartCard>
      </div>
    </>
  );
}

function SupplyPage({ data, mode }) {
  const c = data.kpis.current;
  const p = data.kpis.previous;
  const statusRows = data.item_status_snapshot.map((row) => ({ ...row, status: displayLabel(ITEM_STATUS_LABELS, row.status) }));
  const status = Object.fromEntries(statusRows.map((r) => [r.status, r.items]));
  const ageKeys = ["0–7일", "8–14일", "15–29일", "30일 이상"];
  const ageByCategory = [...new Set(data.unsold_item_age_by_category.map((r) => r.category_name))].map((name) => ({ category_name: name, ...Object.fromEntries(ageKeys.map((bucket) => [bucket, data.unsold_item_age_by_category.find((r) => r.category_name === name && r.bucket === bucket)?.items || 0])) }));
  const itemDormitories = (data.item_dormitory_distribution || []).map(row => ({ ...row, label: dormitoryLabel(row.dormitory_code, true) }));
  const categoryViews = (data.views_by_category || []).map(row => ({ ...row, chart_label: `${row.category_name} · 상품 ${format(row.items, "건")}` }));
  return (
    <>
      <EmptyNotice mode={mode} />
      <div className="kpi-grid five">
        <KpiCard label="신규 등록" current={c.new_items} previous={p.new_items} unit="건" note="선택 기간 등록 완료" />
        <KpiCard label="등록 사용자" current={c.unique_sellers} previous={p.unique_sellers} unit="명" note="선택 기간 고유 판매자" />
        <KpiCard label="1인당 평균 등록" current={c.average_items_per_seller} previous={p.average_items_per_seller} unit="개" note="선택 기간" />
        <KpiCard label="판매 완료" current={c.completed_sales} previous={p.completed_sales} unit="건" note="선택 기간" />
        <KpiCard label="판매 평균 소요" current={c.average_days_to_sell} previous={p.average_days_to_sell} unit="일" inverse note="등록 후 판매까지" />
      </div>
      <div className="chart-grid">
        <ChartCard title="신규 등록·등록자 추이" subtitle="최근 7개 완료주 · 주차별 등록" insight="신규 판매자 증가와 다량 등록을 구분">
          <TrendLines data={data.new_items_and_sellers_weekly} xKey="week_start" lines={[{ key: "new_items", name: "상품", suffix: "건", color: chartColors.orange }, { key: "unique_sellers", name: "판매자", suffix: "명", color: chartColors.slate }]} />
        </ChartCard>
        <ChartCard title="상품 상태 구성" subtitle="현재 시점 판매 중·예약·완료·숨김" insight="어느 거래 상태에 상품이 쌓이는지 확인">
          <StackedBars data={[{ name: "전체", ...status }]} xKey="name" horizontal keys={statusRows.map((r, i) => ({ key: r.status, name: r.status, color: [chartColors.orange, "#f8d48e", chartColors.slate, "#dfe5ee"][i] }))} />
        </ChartCard>
        <ChartCard title="카테고리별 상품 수" subtitle="현재 판매 중 · DB 카테고리명 기준" insight="카테고리별 공급 부족과 과잉을 비교">
          <HorizontalBars data={data.selling_items_by_category} yKey="category_name" valueKey="items" suffix="건" />
        </ChartCard>
        <ChartCard title="사용자별 등록 수 분포" subtitle="선택 기간 등록자 · 사용자 기준" insight="소수 판매자 의존과 이상 등록 여부를 확인">
          <VerticalBars data={data.items_per_seller_distribution} xKey="bucket" valueKey="sellers" suffix="명" accentLast={false} />
        </ChartCard>
        <ChartCard title="미판매 상품 경과일" subtitle="현재 판매 중 상품 · 등록 후 경과 기간" insight="30일 이상 노후 상품의 가격·노출 점검 필요">
          <VerticalBars data={data.unsold_item_age_distribution} xKey="bucket" valueKey="items" suffix="건" />
        </ChartCard>
        <ChartCard title="카테고리별 노후 상품" subtitle="미판매 상품 · 등록 경과일 구성" insight="노후 상품 비중이 높은 카테고리를 우선 개선">
          <StackedBars data={ageByCategory} xKey="category_name" horizontal keys={ageKeys.map((key, i) => ({ key, name: key, color: [chartColors.orange, "#f8d48e", chartColors.slate, "#b3bfd0"][i] }))} />
        </ChartCard>
        <ChartCard title="상품에 공개된 생활관" subtitle="현재 남은 상품 · 숨김 포함 · 판매자 프로필과 별개">
          <AdaptiveDistribution data={itemDormitories} labelKey="label" valueKey="items" unit="건" summaryLabel="현재 상품" height={Math.max(240, itemDormitories.length * 38 + 36)} />
        </ChartCard>
        <ChartCard title="상품 누적 조회수" subtitle="현재 남은 상품 · 숨김 포함 · 순 방문자 수 및 선택 기간 조회수 아님">
          <div className="snapshot-chart-layout">
            <div className="snapshot-chart-total"><span>누적 열람</span><strong>{format(data.view_count_snapshot?.total_views, "회")}</strong><small>조회수 보유 {format(data.view_count_snapshot?.items_with_counts, "건")} / 상품 {format(data.view_count_snapshot?.items, "건")}</small></div>
            <HorizontalBars data={categoryViews} yKey="chart_label" valueKey="views" suffix="회" height={Math.max(220, categoryViews.length * 44 + 44)} highlightFirst={false} />
          </div>
        </ChartCard>
        <ChartCard title="판매 소요시간 분포" subtitle="선택 기간 판매 완료 · 등록부터 소요시간" insight="평균선 오른쪽의 장기 판매 상품을 함께 확인" className="wide">
          <VerticalBars data={data.sale_duration_distribution} xKey="bucket" valueKey="items" suffix="건" accentLast={false} height={290} />
        </ChartCard>
      </div>
    </>
  );
}

function EngagementPage({ data, operations, mode }) {
  const c = data.kpis.current;
  const p = data.kpis.previous;
  const reservationData = data.reservation_status_weekly.map((row) => ({ ...row, status: displayLabel(TRADE_STATUS_LABELS, row.status) }));
  const weeks = [...new Set(reservationData.map((r) => r.week_start))];
  const statuses = [...new Set(reservationData.map((r) => r.status))];
  const reservationRows = weeks.map((week) => ({ week_start: week, ...Object.fromEntries(statuses.map((status) => [status, reservationData.filter((r) => r.week_start === week && r.status === status).reduce((sum, row) => sum + Number(row.trades || 0), 0)])) }));
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
  const timeLabel = { "00_05": "새벽", "06_11": "오전", "12_17": "오후", "18_23": "저녁" };
  const notificationRows = (operations.notification_read_performance || []).map(row => ({ ...row, label: displayLabel(NOTIFICATION_LABELS, row.notification_type) }));
  const reportStatusRows = (operations.report_status_distribution || []).map(row => ({ ...row, label: displayLabel(REPORT_STATUS_LABELS, row.report_status) }));
  const reportTypeRows = (operations.report_type_distribution || []).map(row => ({ ...row, label: displayLabel(REPORT_TYPE_LABELS, row.report_type) }));
  return (
    <>
      <EmptyNotice mode={mode} />
      <div className="kpi-grid five">
        <KpiCard label="찜 사용자" current={c.favorite_users} previous={p.favorite_users} unit="명" note="고유 찜 사용자" />
        <KpiCard label="활성 채팅방" current={c.active_chat_rooms} previous={p.active_chat_rooms} unit="개" note="메시지 발생 방" />
        <KpiCard label="예약 생성" current={c.reservations} previous={p.reservations} unit="건" note="거래 예약" />
        <KpiCard label="완료 거래" current={c.completed_trades} previous={p.completed_trades} unit="건" note="선택 기간" />
        <KpiCard label="후기 작성률" current={c.review_rate} previous={p.review_rate} unit="%" percentagePoint note="완료 거래 후 7일" />
      </div>
      <div className="chart-grid">
        <ChartCard title="찜 사용자·찜 상품 추이" subtitle="최근 7개 완료주 · 주별 고유 사용자·상품" insight="사용자 관심이 상품 전체로 확산되는지 확인">
          <TrendLines data={data.weekly_trends} xKey="week_start" lines={[{ key: "favorite_users", name: "사용자", suffix: "명", color: chartColors.orange }, { key: "favorite_items", name: "상품", suffix: "개", color: chartColors.slate }]} />
        </ChartCard>
        <ChartCard title="채팅방·메시지 추이" subtitle="최근 7개 완료주 · 주별 고유 방·메시지" insight="새 문의와 기존 대화 활성도를 구분">
          <TrendLines data={data.weekly_trends} xKey="week_start" lines={[{ key: "active_chat_rooms", name: "채팅방", suffix: "개", color: chartColors.orange }, { key: "messages", name: "메시지", suffix: "건", color: chartColors.slate }]} />
        </ChartCard>
        <ChartCard title="카테고리별 완료 거래" subtitle="선택 기간 완료 거래 · 카테고리 기준" insight="실제 거래가 강한 분야를 확인">
          <HorizontalBars data={data.completed_trades_by_category} yKey="category_name" valueKey="trades" suffix="건" />
        </ChartCard>
        <ChartCard title="카테고리별 찜" subtitle="선택 기간 생성 · 고유 찜" insight="수요는 높지만 거래가 막힌 카테고리를 발견">
          <HorizontalBars data={data.favorites_by_category} yKey="category_name" valueKey="favorites" suffix="건" />
        </ChartCard>
        <ChartCard title="주차별 예약 상태" subtitle="최근 5개 완료주 생성 예약 · 현재 상태별 건수" insight="요청·확정·완료·취소 흐름으로 거래 품질 판단">
          <StackedBars data={reservationRows} xKey="week_start" horizontal keys={statuses.map((key, i) => ({ key, name: key, color: [chartColors.orange, chartColors.slate, "#8fb69a", "#e96f67", "#b6a6cc", "#72afbe", "#c9a87c"][i % 7] }))} />
        </ChartCard>
        <ChartCard title="총 완료 거래 추이" subtitle="최근 7개 완료주 · 완료 거래" insight="최종 거래 성과가 꾸준히 성장하는지 확인">
          <TrendLines data={data.weekly_trends} xKey="week_start" lines={[{ key: "completed_trades", name: "완료 거래", suffix: "건", color: chartColors.orange }]} />
        </ChartCard>
        <ChartCard title="거래 장소 분포" subtitle="선택 기간 완료 거래 · 약속 장소" insight="거래가 집중되는 장소의 안전성과 안내 수요 확인">
          <HorizontalBars data={data.trade_place_distribution} yKey="meeting_place" valueKey="trades" suffix="건" />
        </ChartCard>
        <ChartCard title="거래 시간대" subtitle="선택 기간 완료 거래 · 예정 시각" insight="거래가 몰리는 시간대에 운영 안내를 집중">
          <VerticalBars data={data.trade_time_of_day_distribution.map((row) => ({ ...row, time_bucket: timeLabel[row.time_bucket] || row.time_bucket }))} xKey="time_bucket" valueKey="trades" suffix="건" accentLast={false} />
        </ChartCard>
        <ChartCard title="시간별 거래 완료" subtitle="완료 거래의 예정 시각 · 시간별 건수" insight="오후 3–5시에 거래가 가장 활발">
          <TrendLines data={data.trade_hour_distribution.map((r) => ({ ...r, label: `${r.hour}시` }))} xKey="label" lines={[{ key: "trades", name: "완료 거래", suffix: "건", color: chartColors.orange }]} />
        </ChartCard>
        <ChartCard title="요일별 거래 완료" subtitle="완료 거래의 예정 날짜 · 요일별 건수" insight="금요일 거래 집중 여부를 주차별로 확인">
          <VerticalBars data={data.trade_weekday_distribution.map((r) => ({ ...r, day: weekdays[Number(r.iso_weekday) - 1] }))} xKey="day" valueKey="trades" suffix="건" />
        </ChartCard>
        <ChartCard title="알림 유형별 생성·읽음" subtitle="선택 기간 생성된 알림 · 현재 읽음 상태" className="wide">
          <ReadRateBars data={notificationRows} />
        </ChartCard>
        <ChartCard title="신고 상태별 접수 건수" subtitle="선택 기간 접수된 신고 · 현재 처리 상태">
          <AdaptiveDistribution data={reportStatusRows} labelKey="label" valueKey="reports" unit="건" summaryLabel="선택 기간 접수" />
        </ChartCard>
        <ChartCard title="신고 대상별 접수 건수" subtitle="선택 기간 접수 · 상품·채팅·사용자·후기">
          <HorizontalBars data={reportTypeRows} yKey="label" valueKey="reports" suffix="건" height={Math.max(240, reportTypeRows.length * 48 + 48)} />
        </ChartCard>
        <section className="operations-card wide">
          <div className="section-title"><div><h3>운영 점검</h3><p>예약 이행·신고·알림 성과를 같은 기간으로 확인</p></div><span>관리자 전용</span></div>
          <div className="ops-grid">
            <div><span>예약 이행률</span><strong>{format(operations.reservation_fulfillment?.fulfillment_rate, "%")}</strong><small>{format(operations.reservation_fulfillment?.completed_trades, "건")} 완료</small></div>
            <div><span>예약 취소율</span><strong>{format(operations.reservation_fulfillment?.cancel_or_no_show_rate, "%")}</strong><small>{format(operations.reservation_fulfillment?.cancelled_or_verified_no_show_trades, "건")}</small></div>
            <div><span>신고 적체</span><strong>{format(operations.reports?.current_backlog, "건")}</strong><small>기간 접수 {format(operations.reports?.received_in_period, "건")}</small></div>
            <div><span>신고 처리 중앙값</span><strong>{format(operations.reports?.resolution_sla?.median_hours, "시간")}</strong><small>P90 {format(operations.reports?.resolution_sla?.p90_hours, "시간")}</small></div>
          </div>
        </section>
      </div>
    </>
  );
}

const FUNNEL_LABELS = EVENT_LABELS;

function FunnelBlock({ title, subtitle, funnel, insight, duration, previous, month }) {
  const stages = funnel.stages || [];
  if (!stages.length) return <section className="funnel-card"><header><h3>{title}</h3><p>{subtitle}</p></header><div className="chart-empty">{funnelStatus(funnel)}</div></section>;
  const getCount = stageCount;
  const stageLabel = (stage) => funnel.stage_definitions?.find(row => row.stage === stage)?.label || FUNNEL_LABELS[stage] || stage;
  const maxDrop = stages.slice(1).reduce((best, row, i) => {
    const prev = getCount(stages[i]);
    const drop = prev ? 100 - (getCount(row) / prev) * 100 : 0;
    return drop > best.drop ? { drop, from: stages[i].stage, to: row.stage } : best;
  }, { drop: 0, from: "", to: "" });
  return (
    <section className="funnel-card">
      <header><h3>{title}</h3><p>{subtitle}</p><p>{funnelStatus(funnel)}</p></header>
      <div className="funnel-layout">
        <div className="funnel-steps">
          {stages.map((row, index) => {
            const width = 100 - index * (stages.length === 5 ? 8 : 10);
            const next = stages[index + 1];
            const drop = next ? stageGap(row, next) : null;
            return (
              <div className="funnel-row" key={row.stage}>
                <div className="funnel-step" style={{ width: `${width}%` }}><b>{stageLabel(row.stage)}</b><span>{format(getCount(row), funnel.data_source === "business_records" ? "건" : row.attempts != null ? "회" : "명")} · {format(row.rate_from_start, "%")}</span></div>
                {index < stages.length - 1 && <small>미도달 {format(drop, "%")}</small>}
              </div>
            );
          })}
        </div>
        <aside className="funnel-aside">
          <b>읽는 법</b>
          <dl><div><dt>최대 미도달</dt><dd>{maxDrop.from ? `${stageLabel(maxDrop.from)} → ${stageLabel(maxDrop.to)}` : "없음"}</dd></div><div><dt>평균 최종 단계 도달</dt><dd>{funnel.average_completion_seconds !== undefined ? funnelDuration(funnel.average_completion_seconds) : duration}</dd></div><div><dt>전주 대비</dt><dd>{previous}</dd></div><div><dt>전월 대비</dt><dd>{month}</dd></div></dl>
          <p>{insight}</p>
          {funnel.quality?.completed_without_reservation_evidence > 0 && <p>예약 이력이 확인되지 않은 완료 거래 {funnel.quality.completed_without_reservation_evidence}건은 연속 퍼널의 완료 단계에서 제외했습니다.</p>}
          {funnel.quality?.excluded_ambiguous_starts > 0 && <p>사용자를 확정할 수 없는 시작 기록 {funnel.quality.excluded_ambiguous_starts}건은 제외했습니다.</p>}
          {funnel.quality?.excluded_unlinked_starts > 0 && <p>사용자·세션·상품 연결 정보가 부족한 시작 기록 {funnel.quality.excluded_unlinked_starts}건은 제외했습니다.</p>}
        </aside>
      </div>
    </section>
  );
}

function FunnelsPage({ data, mode }) {
  const rates = [data.guest_to_member, data.item_registration, data.trade_completion].map((f) => f.stages?.at(-1)?.rate_from_start ?? null);
  const operational = data.operational_trade;
  const operationalStages = operational?.stages || [];
  const observation = (funnel, label) => funnel.rates_are_provisional ? `${label} · 관찰 중 포함, 잠정값` : label;
  return (
    <>
      <EmptyNotice mode={mode} />
      {operational && <>
        <div className="kpi-grid three">
          <KpiCard label="거래 요청" value={format(stageCount(operationalStages[0]), "건")} note="선택 기간에 요청한 거래" changeText="거래 기록 기준" />
          <KpiCard label="예약 확정 도달률" value={format(operationalStages[1]?.rate_from_start, "%")} note="거래 요청 대비 · 조회 시점까지" changeText="거래 기록 기준" />
          <KpiCard label="거래 완료 도달률" value={format(operationalStages[2]?.rate_from_start, "%")} note="요청→예약 확정→완료 순서" changeText="거래 기록 기준" />
        </div>
        <div className="funnel-list"><FunnelBlock title="거래 진행 퍼널" subtitle="선택 기간에 요청된 거래 · 동일 거래의 확정→완료→후기 기록 연결" funnel={operational} duration="완료 기록 없음" previous="비교값 없음" month="비교값 없음" insight="현재까지 도달한 단계입니다. 진행 중인 거래는 나중에 다음 단계로 이동할 수 있습니다. 최종 단계는 후기 작성이며, 위 완료율 카드는 거래 완료 단계 기준입니다." /></div>
      </>}
      {mode === "live" && <div className="live-notice">아래 클릭 퍼널은 앱에서 수집된 행동 이벤트가 필요합니다. 기존 거래 기록으로 과거 클릭·방문을 추정하지 않습니다.</div>}
      <div className="kpi-grid three">
        <KpiCard label="회원 전환 완료율" value={format(rates[0], "%")} current={rates[0]} previous={52.1} percentagePoint changeText={mode === "live" ? "비교값 없음" : undefined} note={observation(data.guest_to_member, "30일 관찰")} />
        <KpiCard label="상품 등록 완료율" value={format(rates[1], "%")} current={rates[1]} previous={57.7} percentagePoint changeText={mode === "live" ? "비교값 없음" : undefined} note={observation(data.item_registration, "24시간 관찰")} />
        <KpiCard label="조회→거래 완료 전환율" value={format(rates[2], "%")} current={rates[2]} previous={2.8} percentagePoint changeText={mode === "live" ? "비교값 없음" : undefined} note={observation(data.trade_completion, "7일 관찰")} />
      </div>
      <div className="funnel-list">
        <ChartCard title="수집된 행동 이벤트" subtitle="선택 기간 발생 건수 · 관리자·탈퇴 계정 제외 · 전환율과 별개">
          <MetricTable rows={data.event_distribution?.map(row => ({ ...row, label: displayLabel(EVENT_LABELS, row.event_name) }))} rowKey="event_name" emptyText="선택 기간에 수집된 행동 이벤트가 없습니다." columns={[{ key: "label", label: "행동" }, { key: "event_name", label: "이벤트 코드" }, { key: "events", label: "발생", numeric: true, unit: "건" }]} />
        </ChartCard>
        <FunnelBlock title="회원 전환 퍼널" subtitle="로그인 요구 후 30일 · 같은 기기의 가입 흐름" funnel={data.guest_to_member} duration={mode === "live" ? "기록 부족" : "2.8일"} previous={mode === "live" ? "비교값 없음" : "+2.4%p"} month={mode === "live" ? "비교값 없음" : "+6.7%p"} insight="로그인 필요 화면에서 가입 시작으로 넘어가는 흐름을 우선 확인" />
        <FunnelBlock title="상품 등록 퍼널" subtitle="세션별 첫 등록 시작 후 24시간 · 같은 세션의 폼 복귀는 중복 제외" funnel={data.item_registration} duration={mode === "live" ? "기록 부족" : "8분 42초"} previous={mode === "live" ? "비교값 없음" : "+5.1%p"} month={mode === "live" ? "비교값 없음" : "+8.4%p"} insight="상품 개수 대신 사용자·세션별 등록 흐름을 셉니다. 같은 세션에서 여러 상품을 등록해도 한 흐름입니다." />
        <FunnelBlock title="조회→거래 완료 퍼널" subtitle="상품 조회 후 7일 · 같은 구매자·상품의 조회→채팅 진입과 실제 거래 기록" funnel={data.trade_completion} duration={mode === "live" ? "기록 부족" : "3.6일"} previous={mode === "live" ? "비교값 없음" : "+0.6%p"} month={mode === "live" ? "비교값 없음" : "+1.2%p"} insight="새 채팅 시작과 기존 채팅방 재진입을 함께 확인합니다." />
      </div>
      <section className="dropout-card"><h3>이탈을 3가지로 구분</h3><div><article><b>단계 이탈</b><p>정해진 기간 안에 다음 이벤트가 없음</p><span>핵심 퍼널 개선</span></article><article><b>화면 이탈</b><p>다른 화면으로 이동</p><span>이탈 후 경로 분석</span></article><article><b>앱 이탈</b><p>앱 종료 또는 일정 시간 무활동</p><span>세션 품질 확인</span></article></div></section>
    </>
  );
}

function LoginScreen({ configured, onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!password || submitting || !configured) return;
    setSubmitting(true);
    setError("");
    const result = await onLogin(password);
    if (!result.ok) setError(result.message);
    setSubmitting(false);
  };

  return (
    <div className="login-shell">
      <section className="login-card">
        <div className="login-brand"><div className="brand-mark">K</div><div><b>KOKET 운영 대시보드</b><span>관리자 전용</span></div></div>
        <div className="login-copy"><h1>관리자 로그인</h1><p>운영 데이터 보호를 위해 관리자 비밀번호를 입력해주세요.</p></div>
        {configured ? (
          <form onSubmit={submit}>
            <label htmlFor="admin-password">관리자 비밀번호</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호 입력" autoFocus />
            {error && <p className="login-error" role="alert">{error}</p>}
            <button type="submit" disabled={!password || submitting}>{submitting ? "확인 중..." : "로그인"}</button>
          </form>
        ) : (
          <div className="login-config-error"><b>관리자 로그인 설정 필요</b><p><code>DASHBOARD_PASSWORD</code>와 <code>DASHBOARD_SESSION_SECRET</code> 환경변수를 추가한 뒤 서버를 다시 실행해주세요.</p></div>
        )}
        <small>승인된 관리자만 접근할 수 있습니다.</small>
      </section>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState("core");
  const [payload, setPayload] = useState(() => { const dates = recentRange(); return { data: null, mode: "loading", period: { start_date: dates.startDate, end_date: dates.endDate }, warning: null }; });
  const [range, setRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState("–");
  const [authState, setAuthState] = useState("checking");

  const refresh = async (nextRange = range) => {
    setLoading(true);
    const next = await loadDashboard(nextRange?.startDate, nextRange?.endDate);
    if (next.unauthorized) {
      setAuthState("unauthenticated");
      setLoading(false);
      return;
    }
    setPayload(next);
    setRefreshedAt(new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    checkAdminSession().then(async ({ configured, authenticated }) => {
      if (!active) return;
      if (!configured) {
        setAuthState("unconfigured");
        setLoading(false);
        return;
      }
      if (!authenticated) {
        setAuthState("unauthenticated");
        setLoading(false);
        return;
      }
      setAuthState("authenticated");
      await refresh();
    });
    return () => { active = false; };
  }, []);

  const handleLogin = async (password) => {
    const result = await loginAdmin(password);
    if (result.ok) {
      setAuthState("authenticated");
      await refresh();
    }
    return result;
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setRange(null);
    setPayload(current => ({ ...current, data: null, mode: "loading", warning: null }));
    setAuthState("unauthenticated");
  };

  const currentPage = useMemo(() => {
    if (!payload.data) return null;
    const props = { data: payload.data[tab], mode: payload.mode };
    if (tab === "core") return <CorePage {...props} />;
    if (tab === "members") return <MembersPage {...props} />;
    if (tab === "supply") return <SupplyPage {...props} />;
    if (tab === "engagement") return <EngagementPage {...props} operations={payload.data.operations} />;
    return <FunnelsPage {...props} />;
  }, [payload, tab]);

  if (authState === "checking") return <div className="auth-loading"><span />관리자 세션을 확인하는 중입니다</div>;
  if (authState !== "authenticated") return <LoginScreen configured={authState !== "unconfigured"} onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">K</div><div><b>KOKET 운영 대시보드</b><span>데이터로 더 안전하고 빠른 교내 거래</span></div></div>
        <div className="header-actions">
          <span className={`mode-chip ${payload.mode}`} title={payload.warning || "Supabase 실데이터 연결됨"}>{loading ? "조회 중" : payload.mode === "live" ? "실데이터" : "연결 오류"}</span>
          <DateRangePicker period={payload.period} range={range} loading={loading} onChange={dates => { setRange(dates); refresh(dates); }} />
          <button className="logout-button" type="button" onClick={handleLogout}>로그아웃</button>
        </div>
      </header>
      <nav className="tabs" aria-label="대시보드 화면">
        <div>{TABS.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => { setTab(item.id); window.scrollTo({ top: 0 }); }}>{item.label}</button>)}</div>
      </nav>
      <main>
        <PageIntro page={tab} refreshedAt={refreshedAt} />
        {loading ? <div className="loading-state"><span />데이터를 불러오는 중입니다</div> : payload.mode === "error" ? <section className="chart-card" role="alert"><h2>실데이터를 불러오지 못했습니다</h2><p>{payload.warning}</p><button className="logout-button" type="button" onClick={() => refresh()}>다시 시도</button></section> : <DataModeContext.Provider value={payload.mode}>
          {payload.metadata?.notes?.length > 0 && <details className="data-notes"><summary>집계 기준·기록 범위 확인</summary><ul>{payload.metadata.notes.map(note => <li key={note}>{note}</li>)}</ul></details>}
          {currentPage}
        </DataModeContext.Provider>}
      </main>
      <footer>표시 시각과 날짜 기준: Asia/Seoul · 관리자용 내부 화면</footer>
    </div>
  );
}
