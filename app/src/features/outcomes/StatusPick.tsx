import { useState, type CSSProperties } from 'react';
import { STATUSES, statusOf, type StatusId } from './model';

/** Coloured dot used wherever a status is shown. Colour comes from STATUSES, the single source of truth. */
export function StatusDot({ status }: { status: string }) {
  return <i className="st-dot" style={{ background: statusOf(status).color }} aria-hidden="true" />;
}

/** One-click status choice: a radio group of pills, each with its coloured dot. */
export function StatusPick({ name, value, disabled, onChange }: { name: string; value: string; disabled?: boolean; onChange: (id: StatusId) => void }) {
  const cur = statusOf(value).id;
  return (
    <div className="st-pick" role="radiogroup" aria-label="Status">
      {STATUSES.map((s) => (
        <label key={s.id} className={`st-opt${cur === s.id ? ' on' : ''}`} style={{ '--sc': s.color } as CSSProperties}>
          <input type="radio" name={name} value={s.id} checked={cur === s.id} disabled={disabled} onChange={() => onChange(s.id)} />
          <StatusDot status={s.id} />
          {s.label}
        </label>
      ))}
    </div>
  );
}

const UNITS = ['%', 'hours', 'days', 'minutes', 'people', ''] as const; // '' = plain number
const CUSTOM = '__text';

function parse(v: string): { num: string; unit: string } | null {
  if (!v.trim()) return { num: '', unit: '%' };
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(%|hours|days|minutes|people)?\s*$/i.exec(v);
  return m ? { num: m[1], unit: (m[2] ?? '').toLowerCase() } : null;
}

const join = (num: string, unit: string) => (!num ? '' : unit === '%' ? `${num}%` : unit ? `${num} ${unit}` : num);

/** Number + unit input. Older free-text values that don't fit fall back to a plain text box. */
export function MeasureField({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  const first = parse(value);
  const [unit, setUnit] = useState(first?.unit ?? '%');
  const [text, setText] = useState(first === null);
  const p = parse(value);
  const num = p?.num ?? '';

  if (text) {
    return (
      <div className="ms">
        <input id={id} type="text" maxLength={200} disabled={disabled} placeholder="Type a value" value={value} onChange={(e) => onChange(e.target.value)} />
        {!disabled && (
          <button type="button" className="ox-lnk" onClick={() => { setText(false); setUnit('%'); onChange(''); }}>
            Use number
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="ms">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        maxLength={12}
        disabled={disabled}
        placeholder="0"
        value={num}
        onChange={(e) => onChange(join(e.target.value.replace(/[^\d.-]/g, ''), unit))}
      />
      <select
        aria-label={`${label} unit`}
        disabled={disabled}
        value={unit}
        onChange={(e) => {
          if (e.target.value === CUSTOM) return setText(true);
          setUnit(e.target.value);
          onChange(join(num, e.target.value));
        }}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u || 'number'}
          </option>
        ))}
        <option value={CUSTOM}>text…</option>
      </select>
    </div>
  );
}

export type { StatusId };
