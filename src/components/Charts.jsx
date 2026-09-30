import { formatMetric, formatAxisDate, isMetric, metricShare } from "../utils/metrics.js";
import { createContext, useContext } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const DataModeContext = createContext("demo");
const EmptyChart = () => <div className="chart-empty">해당 기간 기록 없음</div>;
const hasValues = (data, keys) => Array.isArray(data) && data.some(row => keys.some(key => isMetric(row[key])));

const ORANGE = "#ffb84d";
const ORANGE_DARK = "#f4a11c";
const SLATE = "#8092ad";
const SLATE_DARK = "#5f7392";
const PALE = "#dfe5ee";
const GRID = "#e9edf3";
const COLORS = [ORANGE, SLATE, PALE, "#e76158", "#9bb8a0", "#b6a6cc"];

const compactNumber = value => formatMetric(value);

function ChartTooltip({ active, payload, label, suffix = "", units = {} }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatMetric(item.value, units[item.dataKey] ?? suffix)}
        </span>
      ))}
    </div>
  );
}

function ValueLabel({ x, y, width, value, suffix = "", fill = "#344054" }) {
  if (!isMetric(value)) return null;
  return (
    <text x={x + width / 2} y={Math.max(12, y - 8)} textAnchor="middle" fill={fill} fontSize="13" fontWeight="700">
      {compactNumber(value)}{suffix}
    </text>
  );
}

function HorizontalValueLabel({ x, y, width, height, value, suffix = "" }) {
  if (!isMetric(value)) return null;
  return (
    <text x={x + width + 10} y={y + height / 2 + 4} fill="#344054" fontSize="13" fontWeight="700">
      {compactNumber(value)}{suffix}
    </text>
  );
}

export function ChartCard({ title, subtitle, insight, children, className = "" }) {
  const mode = useContext(DataModeContext);
  return (
    <section className={`chart-card ${className}`}>
      <header className="chart-card__head">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      <div className="chart-card__body">{children}</div>
      {mode !== "live" && insight && <div className="insight"><b>해석</b><span>{insight}</span></div>}
    </section>
  );
}

export function VerticalBars({ data, xKey, valueKey, suffix = "", accentLast = false, height = 260 }) {
  if (!hasValues(data, [valueKey])) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 30, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tickFormatter={formatAxisDate} minTickGap={24} axisLine={false} tickLine={false} tick={{ fill: "#667085", fontSize: 13 }} />
        <YAxis hide domain={[0, "dataMax + 1"]} />
        <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ fill: "#fff8ec" }} />
        <Bar isAnimationActive={false} dataKey={valueKey} name="값" radius={[6, 6, 2, 2]} maxBarSize={46} label={data.length > 12 ? false : (props) => <ValueLabel {...props} suffix={suffix} />}>
          {data.map((_, i) => <Cell key={i} fill={accentLast && i === data.length - 1 ? ORANGE : SLATE} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({ data, yKey, valueKey, suffix = "", highlightFirst = true, height = 260 }) {
  if (!hasValues(data, [valueKey])) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 58, left: 18, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis dataKey={yKey} type="category" axisLine={false} tickLine={false} width={128} tick={{ fill: "#344054", fontSize: 13 }} />
        <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ fill: "#fffaf1" }} />
        <Bar isAnimationActive={false} dataKey={valueKey} name="값" radius={6} maxBarSize={22} background={{ fill: PALE, radius: 6 }} label={(props) => <HorizontalValueLabel {...props} suffix={suffix} />}>
          {data.map((_, i) => <Cell key={i} fill={highlightFirst && i === 0 ? ORANGE : SLATE} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AdaptiveDistribution({ data, labelKey, valueKey, unit = "", summaryLabel = "현재 집계", height = 260 }) {
  if (!Array.isArray(data)) return <div className="chart-empty">새 집계 항목은 서버 업데이트 후 표시됩니다.</div>;
  if (!data.length) return <EmptyChart />;
  if (data.length > 1) return <HorizontalBars data={data} yKey={labelKey} valueKey={valueKey} suffix={unit} height={height} />;
  const row = data[0];
  return (
    <div className="single-metric-summary" role="group" aria-label={`${row[labelKey]} ${formatMetric(row[valueKey], unit)}`}>
      <span>{summaryLabel}</span>
      <strong>{formatMetric(row[valueKey], unit)}</strong>
      <b>{row[labelKey]}</b>
    </div>
  );
}

export function ReadRateBars({ data, labelKey = "label", totalKey = "notifications", rateKey = "read_rate" }) {
  if (!Array.isArray(data)) return <div className="chart-empty">새 집계 항목은 서버 업데이트 후 표시됩니다.</div>;
  if (!data.length) return <EmptyChart />;
  const rows = data.map((row) => {
    const total = Math.max(0, Number(row[totalKey]) || 0);
    const rate = Math.max(0, Math.min(100, Number(row[rateKey]) || 0));
    const read = Math.min(total, Math.round(total * rate / 100));
    return { ...row, total, rate, read, unread: total - read };
  });
  const maxTotal = Math.max(1, ...rows.map(row => row.total));
  return (
    <div className="read-rate-chart">
      <div className="read-rate-legend" aria-hidden="true"><span><i className="read" />읽음</span><span><i className="unread" />미읽음</span></div>
      <div className="read-rate-list" role="list" aria-label="알림 유형별 생성 및 읽음 현황">
        {rows.map((row) => (
          <div className="read-rate-row" role="listitem" key={row.notification_type ?? row[labelKey]}>
            <span className="read-rate-label" title={row[labelKey]}>{row[labelKey]}</span>
            <div className="read-rate-track" aria-label={`${row[labelKey]} 생성 ${formatMetric(row.total, "건")}, 읽음 ${formatMetric(row.read, "건")}, 미읽음 ${formatMetric(row.unread, "건")}`}>
              <div className="read-rate-total" style={{ width: `${Math.max(4, row.total / maxTotal * 100)}%` }}>
                <i className="read" style={{ width: `${row.rate}%` }} />
                <i className="unread" style={{ width: `${100 - row.rate}%` }} />
              </div>
            </div>
            <b>{formatMetric(row.total, "건")}<small>{formatMetric(row.rate, "%")}</small></b>
          </div>
        ))}
      </div>
    </div>
  );
}

function LastPointLabel({ x, y, value, index, total, suffix = "", color }) {
  if (index !== total - 1 || value == null) return null;
  return <text x={x + 8} y={y - 8} fill={color} fontSize="13" fontWeight="800">{compactNumber(value)}{suffix}</text>;
}

export function TrendLines({ data, xKey, lines, height = 260 }) {
  if (!hasValues(data, lines.map(line => line.key))) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 28, right: 64, left: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tickFormatter={formatAxisDate} minTickGap={24} axisLine={false} tickLine={false} tick={{ fill: "#667085", fontSize: 13 }} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip units={Object.fromEntries(lines.map(line => [line.key, line.suffix || ""]))} />} />
        {lines.map((line, i) => (
          <Line isAnimationActive={false} key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color || COLORS[i]} strokeWidth={2.5} dot={{ r: 3, fill: "white", strokeWidth: 2 }} activeDot={{ r: 5 }} label={lines.length > 1 ? false : (props) => <LastPointLabel {...props} total={data.length} suffix={line.suffix || ""} color={line.color || COLORS[i]} />} />
        ))}
        {lines.length > 1 && <Legend formatter={(name) => { const series = lines.find(line => line.name === name); return `${name} · 마지막 ${formatMetric(data.at(-1)?.[series?.key], series?.suffix || "")}`; }} verticalAlign="bottom" align="left" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, color: "#667085" }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, nameKey, valueKey, centerValue, centerLabel, unit = "명", height = 260 }) {
  if (!hasValues(data, [valueKey])) return <EmptyChart />;
  const total = data.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0);
  return (
    <div className="donut-wrap" style={{ height }}>
      <ResponsiveContainer width="62%" height="100%">
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="57%" outerRadius="80%" paddingAngle={1} startAngle={90} endAngle={-270} stroke="white" strokeWidth={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip suffix={unit} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <strong>{centerValue ?? formatMetric(metricShare(data[0]?.[valueKey], total), "%")}</strong>
        <span>{centerLabel}</span>
      </div>
      <div className="legend-list">
        {data.map((row, i) => <div key={`${row[nameKey]}-${i}`}><i style={{ background: COLORS[i % COLORS.length] }} /><span>{row[nameKey]}</span><b>{formatMetric(row[valueKey], unit)}</b></div>)}
      </div>
    </div>
  );
}

export function StackedBars({ data, xKey, keys, height = 270, horizontal = false, suffix = "건" }) {
  if (!hasValues(data, keys.map(key => key.key))) return <EmptyChart />;
  const layout = horizontal ? "vertical" : "horizontal";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 20, right: horizontal ? 22 : 12, left: horizontal ? 20 : 0, bottom: 4 }}>
        {horizontal ? <><XAxis type="number" hide /><YAxis type="category" dataKey={xKey} tickFormatter={formatAxisDate} axisLine={false} tickLine={false} width={82} tick={{ fontSize: 13, fill: "#667085" }} /></> : <><XAxis dataKey={xKey} tickFormatter={formatAxisDate} minTickGap={24} axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: "#667085" }} /><YAxis hide /></>}
        <Tooltip content={<ChartTooltip suffix={suffix} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13 }} />
        {keys.map((key, i) => <Bar isAnimationActive={false} key={key.key} dataKey={key.key} name={key.name} stackId="a" fill={key.color || COLORS[i]} radius={i === 0 ? [6, 0, 0, 6] : i === keys.length - 1 ? [0, 6, 6, 0] : 0} maxBarSize={34} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RetentionHeatmap({ rows }) {
  if (!rows.length) return <EmptyChart />;
  return (
    <div className="retention-table" role="table" aria-label="가입 주차별 리텐션">
      <div className="retention-row header"><span>가입 주</span>{[0, 1, 2, 3, 4].map((w) => <span key={w}>{w}주</span>)}</div>
      {rows.map((row) => (
        <div className="retention-row" key={row.cohort_week}>
          <b>{row.cohort_week}</b>
          {row.weeks.map((value, i) => <span key={i} className={value == null ? "empty" : ""} style={value == null ? {} : { background: `rgba(255, 174, 54, ${0.18 + value / 125})` }}>{value == null ? "–" : formatMetric(value, "%")}</span>)}
        </div>
      ))}
    </div>
  );
}

export const chartColors = { orange: ORANGE, orangeDark: ORANGE_DARK, slate: SLATE, slateDark: SLATE_DARK, pale: PALE };
