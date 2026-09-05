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

const ORANGE = "#ffb84d";
const ORANGE_DARK = "#f4a11c";
const SLATE = "#8092ad";
const SLATE_DARK = "#5f7392";
const PALE = "#dfe5ee";
const GRID = "#e9edf3";
const COLORS = [ORANGE, SLATE, PALE, "#e76158", "#9bb8a0", "#b6a6cc"];

const compactNumber = (value) => Number(value || 0).toLocaleString("ko-KR");

function ChartTooltip({ active, payload, label, suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {compactNumber(item.value)}{suffix}
        </span>
      ))}
    </div>
  );
}

function ValueLabel({ x, y, width, value, suffix = "", fill = "#344054" }) {
  return (
    <text x={x + width / 2} y={Math.max(12, y - 8)} textAnchor="middle" fill={fill} fontSize="11" fontWeight="700">
      {compactNumber(value)}{suffix}
    </text>
  );
}

function HorizontalValueLabel({ x, y, width, height, value, suffix = "" }) {
  return (
    <text x={x + width + 10} y={y + height / 2 + 4} fill="#344054" fontSize="11" fontWeight="700">
      {compactNumber(value)}{suffix}
    </text>
  );
}

export function ChartCard({ title, subtitle, insight, children, className = "" }) {
  return (
    <section className={`chart-card ${className}`}>
      <header className="chart-card__head">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </header>
      <div className="chart-card__body">{children}</div>
      {insight && <div className="insight"><b>해석</b><span>{insight}</span></div>}
    </section>
  );
}

export function VerticalBars({ data, xKey, valueKey, suffix = "", accentLast = false, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 30, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: "#98a2b3", fontSize: 11 }} />
        <YAxis hide domain={[0, "dataMax + 1"]} />
        <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ fill: "#fff8ec" }} />
        <Bar isAnimationActive={false} dataKey={valueKey} name="값" radius={[6, 6, 2, 2]} maxBarSize={46} label={(props) => <ValueLabel {...props} suffix={suffix} />}>
          {data.map((_, i) => <Cell key={i} fill={accentLast && i === data.length - 1 ? ORANGE : SLATE} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({ data, yKey, valueKey, suffix = "", highlightFirst = true, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 58, left: 18, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis dataKey={yKey} type="category" axisLine={false} tickLine={false} width={92} tick={{ fill: "#344054", fontSize: 11 }} />
        <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ fill: "#fffaf1" }} />
        <Bar isAnimationActive={false} dataKey={valueKey} name="값" radius={6} maxBarSize={22} background={{ fill: PALE, radius: 6 }} label={(props) => <HorizontalValueLabel {...props} suffix={suffix} />}>
          {data.map((_, i) => <Cell key={i} fill={highlightFirst && i === 0 ? ORANGE : SLATE} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LastPointLabel({ x, y, value, index, total, suffix = "", color }) {
  if (index !== total - 1) return null;
  return <text x={x + 8} y={y - 8} fill={color} fontSize="11" fontWeight="800">{compactNumber(value)}{suffix}</text>;
}

export function TrendLines({ data, xKey, lines, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 28, right: 64, left: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: "#98a2b3", fontSize: 11 }} />
        <YAxis hide />
        <Tooltip content={<ChartTooltip />} />
        {lines.map((line, i) => (
          <Line isAnimationActive={false} key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color || COLORS[i]} strokeWidth={2.5} dot={{ r: 3, fill: "white", strokeWidth: 2 }} activeDot={{ r: 5 }} label={(props) => <LastPointLabel {...props} total={data.length} suffix={line.suffix || ""} color={line.color || COLORS[i]} />} />
        ))}
        {lines.length > 1 && <Legend verticalAlign="bottom" align="left" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#667085" }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, nameKey, valueKey, centerValue, centerLabel, height = 260 }) {
  const total = data.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0);
  return (
    <div className="donut-wrap" style={{ height }}>
      <ResponsiveContainer width="62%" height="100%">
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="57%" outerRadius="80%" paddingAngle={1} startAngle={90} endAngle={-270} stroke="white" strokeWidth={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <strong>{centerValue ?? `${Math.round((Number(data[0]?.[valueKey] || 0) / Math.max(1, total)) * 100)}%`}</strong>
        <span>{centerLabel}</span>
      </div>
      <div className="legend-list">
        {data.map((row, i) => <div key={`${row[nameKey]}-${i}`}><i style={{ background: COLORS[i % COLORS.length] }} /><span>{row[nameKey]}</span><b>{compactNumber(row[valueKey])}{total === 100 ? "%" : ""}</b></div>)}
      </div>
    </div>
  );
}

export function StackedBars({ data, xKey, keys, height = 270, horizontal = false }) {
  const layout = horizontal ? "vertical" : "horizontal";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 20, right: horizontal ? 22 : 12, left: horizontal ? 20 : 0, bottom: 4 }}>
        {horizontal ? <><XAxis type="number" hide /><YAxis type="category" dataKey={xKey} axisLine={false} tickLine={false} width={82} tick={{ fontSize: 11, fill: "#667085" }} /></> : <><XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#98a2b3" }} /><YAxis hide /></>}
        <Tooltip content={<ChartTooltip />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        {keys.map((key, i) => <Bar isAnimationActive={false} key={key.key} dataKey={key.key} name={key.name} stackId="a" fill={key.color || COLORS[i]} radius={i === 0 ? [6, 0, 0, 6] : i === keys.length - 1 ? [0, 6, 6, 0] : 0} maxBarSize={34} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RetentionHeatmap({ rows }) {
  return (
    <div className="retention-table" role="table" aria-label="가입 주차별 리텐션">
      <div className="retention-row header"><span>가입 주</span>{[0, 1, 2, 3, 4].map((w) => <span key={w}>{w}주</span>)}</div>
      {rows.map((row) => (
        <div className="retention-row" key={row.cohort_week}>
          <b>{row.cohort_week}</b>
          {row.weeks.map((value, i) => <span key={i} className={value == null ? "empty" : ""} style={value == null ? {} : { background: `rgba(255, 174, 54, ${0.18 + value / 125})` }}>{value == null ? "–" : `${value}%`}</span>)}
        </div>
      ))}
    </div>
  );
}

export const chartColors = { orange: ORANGE, orangeDark: ORANGE_DARK, slate: SLATE, slateDark: SLATE_DARK, pale: PALE };
