import React, { useMemo, useState } from 'react';
import { LuCheck, LuEyeOff, LuPencil, LuRefreshCw } from 'react-icons/lu';
import { useStore } from '../lib/store';
import { similarity } from '../lib/text';
import type { ActivityLink } from '../lib/types';
import { fmtDate, Modal } from './ui';

export function DecisionPanel({ link }: { link: ActivityLink }) {
  const st = useStore();
  const [edit, setEdit] = useState(false);
  const d = link.decision;
  const sug = link.anomalies.find((a) => a.suggestion)?.suggestion;
  const hasErr = link.anomalies.some((a) => a.severity === 'error');
  if (!hasErr && !d) return null;
  const save = (action: 'confirm' | 'override' | 'ignore', overrideNum?: string) =>
    st.setDecision({ key: link.prc.id, action, overrideNum, at: new Date().toISOString() });
  return (
    <div className="rounded-xl border border-line bg-canvas/60 p-4">
      {d ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold">
            {d.action === 'confirm' && '✔ Collegamento confermato dall’operatore'}
            {d.action === 'override' && `✎ Collegamento modificato: voce Manuale Generale N. ${d.overrideNum}`}
            {d.action === 'ignore' && '⨯ Segnalazione ignorata (resta “Da verificare”)'}
          </span>
          <span className="text-xs text-muted">{fmtDate(d.at)}</span>
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => st.clearDecision(link.prc.id)}>
            <LuRefreshCw /> Annulla decisione
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-muted">Decisione dell’operatore:</span>
          <button className="btn btn-ghost btn-sm" onClick={() => save('confirm')} title="Il collegamento per codice è corretto">
            <LuCheck /> Conferma
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)} title="Scegli la voce corretta del Manuale Generale">
            <LuPencil /> Modifica
          </button>
          {sug && (
            <button className="btn btn-primary btn-sm" onClick={() => save('override', sug.num)} title={sug.text}>
              Usa N. {sug.num} proposto
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => save('ignore')}>
            <LuEyeOff /> Ignora
          </button>
        </div>
      )}
      <OverrideModal open={edit} onClose={() => setEdit(false)} link={link} onPick={(n) => (save('override', n), setEdit(false))} />
    </div>
  );
}

function OverrideModal({ open, onClose, link, onPick }: { open: boolean; onClose: () => void; link: ActivityLink; onPick: (num: string) => void }) {
  const { dataset } = useStore();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    if (!dataset) return [];
    const items = dataset.general.items.map((it) => ({ it, s: similarity(link.prc.activity, it.text) }));
    const qq = q.trim().toLowerCase();
    return items
      .filter((x) => !qq || x.it.num.includes(qq) || x.it.text.toLowerCase().includes(qq))
      .sort((a, b) => b.s - a.s)
      .slice(0, 40);
  }, [dataset, q, link]);
  return (
    <Modal open={open} onClose={onClose} title={`Scegli la voce del Manuale Generale per ${link.code}`} wide>
      <div className="mb-3 rounded-lg bg-canvas p-3 text-sm">
        <div className="label">Testo della riga PRC</div>
        {link.prc.activity}
      </div>
      <input className="input mb-3" placeholder="Cerca per numero o testo…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="max-h-[50vh] divide-y divide-line overflow-auto rounded-lg border border-line">
        {list.map(({ it, s }) => (
          <li key={it.id}>
            <button className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-brand-50" onClick={() => onPick(it.num)}>
              <span className="code w-10 shrink-0 font-semibold text-brand-700">{it.num}</span>
              <span className="min-w-0 flex-1">
                {it.text}
                <span className="block text-xs text-muted">
                  {it.interval} · cap. {it.chapters.join(', ')} · pag. {it.page}
                </span>
              </span>
              <span className="text-xs text-muted">{Math.round(s * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
