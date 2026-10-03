import React from 'react';
import { LuBookOpen, LuChevronRight, LuClipboardList, LuCog, LuFileText, LuLink2, LuWrench } from 'react-icons/lu';
import { Link, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import type { ActivityLink, OrganRef } from '../lib/types';
import { displayManual } from './ui';

type NodeState = 'ok' | 'pending' | 'missing' | 'warn';

interface Node {
  step: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  to?: string;
  state: NodeState;
  icon: React.ReactNode;
}

const STATE: Record<NodeState, { ring: string; text: string; label: string }> = {
  ok: { ring: 'border-ok bg-ok-bg text-ok', text: 'text-ok', label: 'Trovato' },
  pending: { ring: 'border-[#e0a800] bg-part-bg text-part', text: 'text-part', label: 'Manuale non caricato' },
  missing: { ring: 'border-miss bg-miss-bg text-miss', text: 'text-miss', label: 'Non trovato' },
  warn: { ring: 'border-warn bg-warn-bg text-warn', text: 'text-warn', label: 'Da verificare' },
};

export function generalTitle(l: ActivityLink, sections: Map<string, { num: string; title: string; page: number }>) {
  const g = l.generalRef;
  if (!g) return null;
  const parts = g.chapter.split('.');
  const parent = parts.length > 2 ? sections.get(parts.slice(0, -1).join('.')) : undefined;
  const sec = sections.get(g.chapter);
  return { chapter: g.chapter, title: sec?.title || g.title || '', parent: parent?.title, page: g.page, itemPage: g.itemPage };
}

export function bestTarget(l: ActivityLink): { to: string; label: string } | null {
  const o = l.organRefs.find((x) => x.procedurePage && !x.inGeneralManual && x.importedDocId);
  if (o) return { to: viewerHref(o.importedDocId!, o.procedurePage, o.chapter || undefined, `${l.code} – ${o.organName}`), label: 'Apri procedura' };
  const g = l.generalRef;
  if (g) return { to: viewerHref('stadler', g.itemPage || g.page, l.stadlerItem?.num || l.prc.num || undefined, `${l.code} – Manuale Generale cap. ${g.chapter}`), label: 'Apri Manuale Generale' };
  return null;
}

function organNodes(o: OrganRef, l: ActivityLink): Node[] {
  const nodes: Node[] = [];
  if (o.inGeneralManual) {
    nodes.push({
      step: 'Procedura',
      icon: <LuWrench />,
      title: <>Nel Manuale Generale{l.generalRef ? ` – cap. ${l.generalRef.chapter}` : ''}</>,
      meta: o.procedurePage ? `Pagina ${o.procedurePage}` : 'Pagina non determinata',
      to: o.procedurePage ? viewerHref('stadler', o.procedurePage, l.stadlerItem?.num, l.code) : undefined,
      state: o.procedurePage ? 'ok' : 'missing',
    });
    return nodes;
  }
  nodes.push({
    step: 'Manuale organo',
    icon: <LuBookOpen />,
    title: displayManual(o.manualName),
    meta: (
      <>
        {o.chapter ? `Capitolo ${o.chapter}` : 'Capitolo non indicato'}
        {o.inherited ? ' · ereditato dalla riga padre del PdM' : ''}
        {o.importedDocId ? ' · caricato' : ' · non ancora caricato'}
      </>
    ),
    to: o.importedDocId ? `/manuale/${o.importedDocId}` : `/documenti/nuovo?manual=${encodeURIComponent(o.manualKey)}`,
    state: o.importedDocId ? 'ok' : 'pending',
  });
  nodes.push({
    step: 'Procedura',
    icon: <LuWrench />,
    title: o.procedurePage ? o.procedureTitle || `Capitolo ${o.chapter}` : o.importedDocId ? `Capitolo ${o.chapter ?? '?'} non trovato` : 'In attesa del manuale',
    meta: o.procedurePage
      ? `Pagina ${o.procedurePage}${o.procedureMatch === 'parent' ? ' · capitolo superiore (da verificare)' : o.procedureMatch === 'manual' ? ' · indicata dall’operatore' : ''}`
      : o.importedDocId
        ? 'Indica la pagina da “Da verificare”'
        : 'Carica il manuale da Manuali → Aggiungi documento',
    to: o.procedurePage && o.importedDocId ? viewerHref(o.importedDocId, o.procedurePage, o.chapter || undefined, `${l.code} – ${o.organName}`) : undefined,
    state: o.procedurePage ? (o.procedureMatch === 'parent' ? 'warn' : 'ok') : o.importedDocId ? 'warn' : 'pending',
  });
  return nodes;
}

export function PathTimeline({ link, compact }: { link: ActivityLink; compact?: boolean }) {
  const { model } = useStore();
  const l = link;
  const gt = model ? generalTitle(l, model.sectionsByNum) : null;
  const hasErr = l.anomalies.some((a) => a.severity === 'error') && !(l.decision && l.decision.action !== 'ignore');
  const pdmRow = l.pdmParent || l.pdmGeneral[0] || l.pdmChildren[0];
  const head: Node[] = [
    {
      step: 'PRC C7',
      icon: <LuClipboardList />,
      title: (
        <>
          <span className="code font-semibold">{l.code}</span> {l.prc.activity}
        </>
      ),
      meta: `Riga ${l.prc.row} · pagina ${l.prc.page} del PRC`,
      to: viewerHref('prc-c7', l.prc.page, l.code, l.code),
      state: 'ok',
    },
    {
      step: 'Documento di collegamento (PdM)',
      icon: <LuLink2 />,
      title: pdmRow ? (
        <>
          <span className="code">{pdmRow.codeRaw}</span> {pdmRow.desc || pdmRow.gruppo}
        </>
      ) : (
        'Codice non presente nel PdM'
      ),
      meta: pdmRow ? `Pagina ${pdmRow.page}${l.pdmChildren.length ? ` · ${l.pdmChildren.length} sotto-attività` : ''}` : undefined,
      to: pdmRow ? viewerHref('pdm', pdmRow.page, pdmRow.codeRaw || undefined, l.code) : undefined,
      state: pdmRow ? 'ok' : 'missing',
    },
    {
      step: 'Manuale Generale',
      icon: <LuFileText />,
      title: gt ? (
        <>
          Cap. {gt.chapter} – {gt.title}
          {gt.parent && <span className="text-muted"> ({gt.parent})</span>}
        </>
      ) : (
        'Riferimento non trovato'
      ),
      meta: gt ? (
        <>
          {l.stadlerItem ? `N. ${l.stadlerItem.num} · ` : ''}Pagina {gt.itemPage || gt.page}
          {l.generalRef?.dghbChapter ? ` · rimanda al Manuale Carrelli (DGHB) cap. ${l.generalRef.dghbChapter}` : ''}
        </>
      ) : undefined,
      to: gt ? viewerHref('stadler', gt.itemPage || gt.page, l.stadlerItem?.num || l.prc.num || undefined, l.code) : undefined,
      state: !gt ? 'missing' : hasErr ? 'warn' : 'ok',
    },
  ];
  const organs = l.organRefs;
  return (
    <ol className="relative">
      {head.map((n, i) => (
        <NodeRow key={i} n={n} last={false} compact={compact} />
      ))}
      {organs.length === 0 && (
        <NodeRow
          n={{ step: 'Organo / Manuale organo', icon: <LuCog />, title: l.organ, meta: 'Nessun manuale specifico indicato nel PdM per questa attività', state: 'pending' }}
          last
          compact={compact}
        />
      )}
      {organs.length > 0 && (
        <li className="relative pl-12">
          <span className="absolute left-[19px] top-0 h-full w-px bg-line" />
          <span className="absolute left-2 top-1 grid h-8 w-8 place-items-center rounded-full border-2 border-brand-200 bg-brand-50 text-brand-600">
            <LuCog />
          </span>
          <div className="pb-1 pt-1.5">
            <div className="label">Organo{organs.length > 1 ? ` · ${organs.length} sotto-attività` : ''}</div>
          </div>
          <div className="space-y-3 pb-2">
            {(compact ? organs.slice(0, 2) : organs).map((o, k) => (
              <div key={k} className="rounded-xl border border-line bg-canvas/60 p-3">
                <div className="mb-2 text-sm font-semibold text-ink">
                  {o.organName}
                  {o.desc && <span className="font-normal text-muted"> — {o.desc}</span>}
                </div>
                <ol>
                  {organNodes(o, l).map((n, j, arr) => (
                    <NodeRow key={j} n={n} last={j === arr.length - 1} compact small />
                  ))}
                </ol>
              </div>
            ))}
            {compact && organs.length > 2 && <div className="text-xs text-muted">+ altre {organs.length - 2} sotto-attività nella scheda</div>}
          </div>
        </li>
      )}
    </ol>
  );
}

function NodeRow({ n, last, compact, small }: { n: Node; last: boolean; compact?: boolean; small?: boolean }) {
  const st = STATE[n.state];
  const body = (
    <div className={`group flex items-start gap-2 rounded-lg ${n.to ? 'cursor-pointer hover:bg-brand-50/60' : ''} -mx-2 px-2 py-1.5`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label">{n.step}</span>
          {n.state !== 'ok' && <span className={`text-[11px] font-semibold ${st.text}`}>{st.label}</span>}
        </div>
        <div className={`mt-0.5 ${small ? 'text-[13px]' : 'text-sm'} font-medium text-ink [overflow-wrap:anywhere]`}>{n.title}</div>
        {n.meta && <div className="mt-0.5 text-xs text-muted">{n.meta}</div>}
      </div>
      {n.to && <LuChevronRight className="mt-4 shrink-0 text-muted group-hover:text-brand-600" />}
    </div>
  );
  return (
    <li className={`relative ${small ? 'pl-9' : 'pl-12'} ${compact ? 'pb-1' : 'pb-3'}`}>
      {!last && <span className={`absolute ${small ? 'left-[13px]' : 'left-[19px]'} top-8 h-[calc(100%-1.5rem)] w-px bg-line`} />}
      <span className={`absolute ${small ? 'left-0' : 'left-2'} top-1 grid ${small ? 'h-7 w-7 text-[13px]' : 'h-8 w-8'} place-items-center rounded-full border-2 ${st.ring}`}>{n.icon}</span>
      {n.to ? <Link to={n.to}>{body}</Link> : body}
    </li>
  );
}
