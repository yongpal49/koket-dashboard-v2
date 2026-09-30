import { useId, useRef, useState } from "react";
import { formatPeriod, rangeError, recentRange } from "../utils/dateRange.js";

export function DateRangePicker({ period, range, loading, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(recentRange);
  const trigger = useRef(null);
  const panelId = useId();
  const error = rangeError(draft);
  const presets = [
    { label: "전체 기간", dates: null },
    { label: "최근 7일", dates: recentRange(7) },
    { label: "최근 30일", dates: recentRange(30) },
  ];
  const apply = dates => {
    setOpen(false);
    trigger.current?.focus();
    onChange(dates);
  };
  return (
    <div className="date-control" onKeyDown={event => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }}>
      <button ref={trigger} type="button" disabled={loading} aria-expanded={open} aria-controls={panelId} onClick={() => {
        setDraft({ startDate: period.start_date, endDate: period.end_date });
        setOpen(value => !value);
      }}>{range ? "선택 기간" : "전체 기간"} · {formatPeriod(period)}</button>
      {open && <div id={panelId} className="date-popover" role="dialog" aria-label="조회 기간 선택">
        <div className="date-presets" aria-label="빠른 기간 선택">
          {presets.map(({ label, dates }) => <button key={label} type="button" disabled={loading}
            aria-pressed={dates === null ? range === null : range?.startDate === dates.startDate && range?.endDate === dates.endDate}
            onClick={() => apply(dates)}>{label}</button>)}
        </div>
        <b className="date-custom-title">직접 선택</b>
        <label>시작일<input type="date" value={draft.startDate} disabled={loading} onChange={event => setDraft(value => ({ ...value, startDate: event.target.value }))} /></label>
        <label>종료일<input type="date" value={draft.endDate} disabled={loading} onChange={event => setDraft(value => ({ ...value, endDate: event.target.value }))} /></label>
        {error && <p className="date-error" role="alert">{error}</p>}
        <button type="button" disabled={loading || Boolean(error)} onClick={() => apply(draft)}>선택 기간 적용</button>
      </div>}
    </div>
  );
}
