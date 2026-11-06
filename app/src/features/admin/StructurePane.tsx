import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadStructure, structOp, type AreaRow, type Kind, type PillarRow, type Structure } from './api';
import { Icon, PageHeader, RowMenu, Skeleton, useAdminUi } from './ui';
import { plural, uniqueCode } from './model';
import { PALETTE } from '../outcomes/model';

type Item = PillarRow | AreaRow;
type Run = (op: () => PromiseLike<{ error: { code?: string } | null }>, msg?: string) => Promise<void>;

/** Top-level areas in order, each followed by its sub-areas, so the list reads like the Outcomes table. */
function arrange(kind: Kind, items: Item[]): Array<{ it: Item; depth: number }> {
  const byOrder = [...items].sort((a, b) => a.sort_order - b.sort_order);
  if (kind === 'pillars') return byOrder.map((it) => ({ it, depth: 0 }));
  const areas = byOrder as AreaRow[];
  const ids = new Set(areas.map((a) => a.id));
  const tops = areas.filter((a) => !a.parent_area_id || !ids.has(a.parent_area_id));
  return tops.flatMap((t) => [{ it: t as Item, depth: 0 }, ...areas.filter((a) => a.parent_area_id === t.id).map((a) => ({ it: a as Item, depth: 1 }))]);
}

/** A tiny live picture of the Outcomes table, so it is obvious what a pillar and an area are. */
function Preview({ data, focus }: { data: Structure; focus: Kind }) {
  const pillars = data.pillars.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order);
  const rows = arrange('areas', data.areas.filter((a) => a.is_active));
  const shown = rows.slice(0, 6);
  return (
    <section className={`st-preview focus-${focus}`} aria-label="Preview of the Outcomes table">
      <div className="st-prev-head">
        <h3>How the Outcomes table is built</h3>
        <p>
          Each <b className="c">column</b> is a <b>pillar</b>, each <b className="r">row</b> is an <b>area</b>, and every box where they meet holds the promises
          and outcomes for that area under that pillar.
        </p>
      </div>
      <div className="st-prev-scroll">
        <table className="st-prev-table">
          <thead>
            <tr>
              <th className="corner">Areas ↓ · Pillars →</th>
              {pillars.map((p) => (
                <th key={p.id} className="col" style={{ borderTopColor: p.color }}>
                  <i style={{ background: p.color }} />
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ it, depth }) => (
              <tr key={it.id}>
                <th className={`row${depth ? ' sub' : ''}`}>{it.name}</th>
                {pillars.map((p) => (
                  <td key={p.id}>
                    <span />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length > shown.length && (
              <tr>
                <th className="row more">+ {rows.length - shown.length} more</th>
                {pillars.map((p) => (
                  <td key={p.id} />
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!pillars.length && <p className="ad-empty">No active pillars yet, so the table has no columns.</p>}
    </section>
  );
}

function Colour({ color, name, onPick }: { color: string; name: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="st-colour">
      <button type="button" className="swatch" style={{ background: color }} aria-label={`Colour of ${name}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="pop" role="radiogroup" aria-label="Colour">
          {PALETTE.map((c) => {
            const on = String(color).toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                className={`c${on ? ' on' : ''}`}
                style={{ background: c }}
                role="radio"
                aria-checked={on}
                aria-label={c}
                onClick={() => {
                  setOpen(false);
                  onPick(c);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  kind,
  it,
  depth,
  siblings,
  data,
  db,
  run,
}: {
  kind: Kind;
  it: Item;
  depth: number;
  siblings: Item[];
  data: Structure;
  db: SupabaseClient;
  run: Run;
}) {
  const { toast, confirm } = useAdminUi();
  const table = () => db.schema('outcomes').from(kind);
  const n = data.counts[kind][it.id] ?? 0;
  const [name, setName] = useState(it.name);
  useEffect(() => setName(it.name), [it.name]);
  const i = siblings.findIndex((s) => s.id === it.id);
  const kids = kind === 'areas' ? data.areas.filter((a) => a.parent_area_id === it.id) : [];

  const move = (d: number) => {
    const o = siblings[i + d];
    if (!o) return;
    void run(async () => {
      const [a, b] = await Promise.all([table().update({ sort_order: o.sort_order }).eq('id', it.id), table().update({ sort_order: it.sort_order }).eq('id', o.id)]);
      return a.error ? a : b;
    });
  };

  async function toggleArchive() {
    if (it.is_active) {
      const what = kind === 'pillars' ? 'column' : 'row';
      const ok = await confirm(
        `Archive “${it.name}”`,
        `It is hidden from the Outcomes table for everyone${n ? `, but its ${plural(n, 'outcome', 'outcomes')} ${n === 1 ? 'is' : 'are'} kept` : ''}. You can restore the ${what} any time.`,
        'Archive',
        false,
        'warn',
      );
      if (!ok) return;
    }
    await run(() => table().update({ is_active: !it.is_active }).eq('id', it.id), it.is_active ? 'Archived' : 'Restored');
  }

  async function remove() {
    if (n) return toast(`“${it.name}” still has ${plural(n, 'outcome', 'outcomes')}. Archive it instead, or remove its outcomes first.`, true);
    if (kids.length) return toast(`“${it.name}” still has sub-areas. Remove or move them first.`, true);
    if (!(await confirm(`Delete “${it.name}”`, 'This cannot be undone.', 'Delete', true))) return;
    await run(() => table().delete().eq('id', it.id), 'Deleted');
  }

  const color = kind === 'pillars' ? (it as PillarRow).color : null;
  const parent = (it as AreaRow).parent_area_id ? data.areas.find((a) => a.id === (it as AreaRow).parent_area_id) : null;
  const isGroup = kind === 'areas' && kids.length > 0;

  return (
    <div className={`st-row${it.is_active ? '' : ' off'}${depth ? ' sub' : ''}`}>
      {depth > 0 && <span className={`st-branch${i < siblings.length - 1 ? ' more' : ''}`} aria-hidden="true" />}
      {color && <Colour color={color} name={it.name} onPick={(c) => void run(() => table().update({ color: c }).eq('id', it.id))} />}
      <div className="st-name">
        <input
          type="text"
          maxLength={60}
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (!v) return setName(it.name);
            if (v !== it.name) void run(() => table().update({ name: v }).eq('id', it.id), 'Renamed');
          }}
        />
        <small>
          {!it.is_active && <span className="ad-badge off">Archived</span>}
          {isGroup ? plural(kids.length, 'sub-area', 'sub-areas') : n ? plural(n, 'outcome', 'outcomes') : kind === 'areas' ? 'No outcomes yet' : 'No outcomes yet'}
          {parent && ` · inside ${parent.name}`}
        </small>
      </div>
      <div className="st-acts">
        <button type="button" className="ad-iconbtn" aria-label={`Move ${it.name} up`} title="Move up" disabled={i <= 0} onClick={() => move(-1)}>
          ↑
        </button>
        <button type="button" className="ad-iconbtn" aria-label={`Move ${it.name} down`} title="Move down" disabled={i === siblings.length - 1} onClick={() => move(1)}>
          ↓
        </button>
        <RowMenu
          label={`More actions for ${it.name}`}
          items={[
            { label: it.is_active ? 'Archive (hide)' : 'Restore', onSelect: () => void toggleArchive() },
            { label: 'Delete', danger: true, onSelect: () => void remove() },
          ]}
        />
      </div>
    </div>
  );
}

function ListEditor({ kind, data, db, run }: { kind: Kind; data: Structure; db: SupabaseClient; run: Run }) {
  const { toast } = useAdminUi();
  const items: Item[] = data[kind];
  const [showArchived, setShowArchived] = useState(false);
  const archived = items.filter((x) => !x.is_active).length;
  const visible = items.filter((x) => showArchived || x.is_active);
  const rows = useMemo(() => arrange(kind, visible), [kind, visible]);
  const [text, setText] = useState('');
  const [parent, setParent] = useState('');
  const noun = kind === 'pillars' ? 'pillar' : 'area';

  const siblingsOf = (it: Item) =>
    kind === 'pillars'
      ? [...items].sort((a, b) => a.sort_order - b.sort_order)
      : [...(items as AreaRow[])].filter((a) => (a.parent_area_id ?? null) === ((it as AreaRow).parent_area_id ?? null)).sort((a, b) => a.sort_order - b.sort_order);

  function add() {
    const v = text.trim();
    if (!v) return;
    const row: Record<string, unknown> = {
      code: uniqueCode(v, items.map((x) => x.code)),
      name: v,
      sort_order: items.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1,
      is_active: true,
    };
    if (kind === 'pillars') row.color = PALETTE[data.pillars.length % PALETTE.length];
    if (kind === 'areas' && parent) {
      if (data.counts.areas[parent]) return toast('That area already has outcomes of its own, so it cannot have sub-areas.', true);
      row.parent_area_id = parent;
    }
    void run(() => db.schema('outcomes').from(kind).insert(row), `Added “${v}”`).then(() => setText(''));
  }

  return (
    <div className="st-list">
      <p className="st-help">
        {kind === 'pillars' ? (
          <>
            Pillars are the <b>columns</b> of the Outcomes table. Rename one by editing its name, click the coloured dot to change its colour, use the arrows to
            reorder, or archive one to hide the column (its outcomes are kept).
          </>
        ) : (
          <>
            Areas are the <b>rows</b> of the Outcomes table. An area can sit inside another (for example Unit A inside Operations). Outcomes are
            recorded against areas that have no sub-areas.
          </>
        )}
      </p>
      {!rows.length && <p className="ad-empty">No {kind} yet. Add the first one below.</p>}
      <div className="st-rows">
        {rows.map(({ it, depth }) => (
          <ItemRow key={it.id} kind={kind} it={it} depth={depth} siblings={siblingsOf(it)} data={data} db={db} run={run} />
        ))}
      </div>
      {archived > 0 && (
        <label className="ad-check st-arch">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived ({archived})
        </label>
      )}
      <div className="st-add">
        <h4>Add {kind === 'pillars' ? 'a pillar' : 'an area'}</h4>
        <div className="ad-additem">
          <input
            type="text"
            className="ad-name"
            placeholder={kind === 'pillars' ? 'New pillar name, e.g. Cost' : 'New area name, e.g. Radiology'}
            maxLength={60}
            aria-label={kind === 'pillars' ? 'New pillar name, e.g. Cost' : 'New area name, e.g. Radiology'}
            id={`st-new-${kind}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          {kind === 'areas' && (
            <select aria-label="Parent area" id="st-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Top-level area</option>
              {data.areas
                .filter((a) => !a.parent_area_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    Inside {a.name}
                  </option>
                ))}
            </select>
          )}
          <button type="button" className="ad-btn primary small with-ico" id={`st-add-${kind}`} onClick={add}>
            <Icon name="plus" size={15} /> Add {noun}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StructurePane({ db }: { db: SupabaseClient }) {
  const { toast } = useAdminUi();
  const [data, setData] = useState<Structure | null>(null);
  const [kind, setKind] = useState<Kind>('pillars');

  const load = useCallback(async () => {
    const s = await loadStructure(db);
    if (!s) return toast('Could not load areas and pillars.', true);
    setData(s);
  }, [db, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback<Run>(
    async (op, msg) => {
      const err = await structOp(op);
      if (err) return toast(err, true);
      if (msg) toast(msg);
      await load();
    },
    [load, toast],
  );

  const head = <PageHeader title="Areas & pillars" sub="Decide which columns (pillars) and rows (areas) the Outcomes table has." />;
  if (!data)
    return (
      <>
        {head}
        <div className="ad-card" role="status" aria-busy="true" aria-label="Loading areas and pillars">
          <Skeleton w={220} h={20} />
          <Skeleton w="100%" h={120} r={12} />
          {[0, 1, 2].map((j) => (
            <Skeleton key={j} w="100%" h={44} r={12} />
          ))}
        </div>
      </>
    );

  const count = (k: Kind) => data[k].filter((x) => x.is_active).length;
  return (
    <>
      {head}
      <Preview data={data} focus={kind} />
      <div className="ad-seg st-switch" role="tablist" aria-label="What to edit">
        {(['pillars', 'areas'] as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : undefined} onClick={() => setKind(k)}>
            {k === 'pillars' ? 'Pillars (columns)' : 'Areas (rows)'} <span className="cnt">{count(k)}</span>
          </button>
        ))}
      </div>
      <section className="ad-card wide st-card">
        <ListEditor key={kind} kind={kind} data={data} db={db} run={run} />
      </section>
    </>
  );
}
