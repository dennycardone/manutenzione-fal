import React, { useMemo } from 'react';
import { LuArrowRight, LuBookOpen, LuChevronRight, LuFileText, LuLink2, LuNavigation, LuWrench } from 'react-icons/lu';
import { bestTarget, generalTitle } from '../components/PathTimeline';
import { Card, displayManual, Empty, Highlight, PageHeader, StatusBadge } from '../components/ui';
import type { Hit } from '../lib/search';
import { INTERVALS } from '../lib/text';
import { Link, useRoute, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import type { ActivityLink } from '../lib/types';
import { Onboarding, SearchHero } from './Dashboard';

function PathChips({ l }: { l: ActivityLink }) {
  const { model } = useStore();
  const gt = model ? generalTitle(l, model.sectionsByNum) : null;
  const chips: { t: string; ok: boolean }[] = [{ t: `PRC ${l.code}`, ok: true }];
  chips.push({ t: gt ? `Man. Generale cap. ${gt.chapter} · pag. ${gt.itemPage || gt.page}` : 'Man. Generale ?', ok: !!gt });
  const o = l.organRefs[0];
  if (o) {
    chips.push({ t: o.organName, ok: true });
    if (!o.inGeneralManual) chips.push({ t: `${displayManual(o.manualName).slice(0, 38)}${o.chapter ? ' · cap. ' + o.chapter : ''}`, ok: !!o.importedDocId });
    chips.push({ t: o.procedurePage ? `Procedura · pag. ${o.procedurePage}` : 'Procedura: manuale da caricare', ok: !!o.procedurePage });
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {chips.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <LuChevronRight className="text-muted" />}
          <span className={`rounded-md px-2 py-0.5 ${c.ok ? 'bg-brand-50 text-brand-700' : 'bg-part-bg text-part'}`}>{c.t}</span>
        </React.Fragment>
      ))}
      {l.organRefs.length > 1 && <span className="ml-1 text-muted">+{l.organRefs.length - 1} sotto-attività</span>}
    </div>
  );
}

export function ActivityResult({ l, terms, primary }: { l: ActivityLink; terms: string[]; primary?: boolean }) {
  const t = bestTarget(l);
  return (
    <div className={`card p-4 sm:p-5 ${primary ? 'ring-2 ring-brand-200' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="code rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-semibold text-white">{l.code}</span>
            <span>{l.system}</span>
            <span>·</span>
            <span>{l.prc.component}</span>
          </div>
          <Link to={`/attivita/${l.prc.id}`} className="block text-[16px] font-semibold leading-snug text-ink hover:text-brand-700">
            <Highlight text={l.prc.activity} terms={terms} />
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Frequenza: <b className="text-ink">{INTERVALS[l.prc.interval || ''] || l.prc.interval}</b>
            </span>
            <span>
              Livello: <b className="text-ink">{l.prc.interval}</b>
            </span>
            {l.prc.compet && (
              <span>
                Competenza: <b className="text-ink">{l.prc.compet}</b>
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={l.status} short />
      </div>
      <div className="mt-3">
        <PathChips l={l} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {t && (
          <Link to={t.to} className="btn btn-primary">
            <LuWrench /> {t.label.toUpperCase()}
          </Link>
        )}
        <Link to={`/attivita/${l.prc.id}`} className="btn btn-ghost">
          Scheda attività <LuArrowRight />
        </Link>
      </div>
    </div>
  );
}

function HitRow({ h, terms }: { h: Hit; terms: string[] }) {
  const { docTitle } = useStore();
  const d = h.doc;
  const to = d.kind === 'pdm' || d.kind === 'item' || d.kind === 'section' || d.kind === 'page' || d.kind === 'heading' ? viewerHref(d.docId, d.page, terms.join(' ')) : '/';
  return (
    <li>
      <Link to={to} className="flex items-start gap-3 px-5 py-3 hover:bg-canvas">
        <span className="mt-0.5 text-muted">{d.kind === 'pdm' ? <LuLink2 /> : d.kind === 'heading' ? <LuBookOpen /> : <LuFileText />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">
            <Highlight text={d.kind === 'page' ? `${docTitle(d.docId)} – pagina ${d.page}` : d.title} terms={terms} />
          </span>
          <span className="block text-xs text-muted">{d.kind === 'page' ? <Highlight text={h.snippet} terms={terms} /> : d.subtitle}</span>
        </span>
        <LuChevronRight className="mt-1 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

export function SearchPage() {
  const { query } = useRoute();
  const { model, index } = useStore();
  const q = query.get('q') || '';
  const hits = useMemo(() => (index && q ? index.search(q, 120) : []), [index, q]);
  if (!model || !index) return <Onboarding />;
  const terms = q.split(/\s+/).filter(Boolean);
  const acts = hits.filter((h) => h.doc.kind === 'prc').map((h) => model.byId.get(h.doc.id)!).filter(Boolean);
  const general = hits.filter((h) => h.doc.kind === 'item' || h.doc.kind === 'section');
  const pdm = hits.filter((h) => h.doc.kind === 'pdm');
  const organ = hits.filter((h) => h.doc.kind === 'heading' || (h.doc.kind === 'page' && h.doc.docId !== 'stadler'));
  const pages = hits.filter((h) => h.doc.kind === 'page' && h.doc.docId === 'stadler');
  return (
    <div>
      <PageHeader icon={<LuNavigation />} title="Dove devo andare?" subtitle="Scrivi cosa devi fare: l’app trova l’attività del PRC C7 e il percorso fino alla procedura." />
      <div className="mb-6 max-w-3xl">
        <SearchHero initial={q} big={false} key={q} />
      </div>
      {!q && (
        <Card>
          <div className="text-sm text-muted">Esempi:</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {['trasmissione', 'riscaldatore', 'C6-023', 'antigelo', 'sabbiera', 'accoppiatore automatico', 'batterie', 'filtro combustibile', 'porte'].map((x) => (
              <Link key={x} to={`/dove?q=${encodeURIComponent(x)}`} className="chip hover:border-brand-200 hover:bg-brand-50">
                {x}
              </Link>
            ))}
          </div>
        </Card>
      )}
      {q && !hits.length && (
        <Card>
          <Empty title={`Nessun risultato per “${q}”`}>Prova con una parola più generica, un codice (es. C6-023) o un numero attività (es. 023).</Empty>
        </Card>
      )}
      {acts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Attività PRC C7 · {acts.length}</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {acts.slice(0, 12).map((l, i) => (
              <ActivityResult key={l.prc.id} l={l} terms={terms} primary={i === 0 && acts.length === 1} />
            ))}
          </div>
          {acts.length > 12 && (
            <div className="mt-3 text-sm">
              <Link to={`/prc?q=${encodeURIComponent(q)}`} className="font-semibold text-brand-600">
                Vedi tutte le {acts.length} attività nel PRC C7 →
              </Link>
            </div>
          )}
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {general.length > 0 && (
          <Card title={`Manuale Generale · ${general.length}`} pad={false}>
            <ul className="divide-y divide-line">{general.slice(0, 10).map((h) => <HitRow key={h.doc.id} h={h} terms={terms} />)}</ul>
          </Card>
        )}
        {organ.length > 0 && (
          <Card title={`Manuali organo · ${organ.length}`} pad={false}>
            <ul className="divide-y divide-line">{organ.slice(0, 10).map((h) => <HitRow key={h.doc.id} h={h} terms={terms} />)}</ul>
          </Card>
        )}
        {pdm.length > 0 && (
          <Card title={`Documento di collegamento (PdM) · ${pdm.length}`} pad={false}>
            <ul className="divide-y divide-line">{pdm.slice(0, 10).map((h) => <HitRow key={h.doc.id} h={h} terms={terms} />)}</ul>
          </Card>
        )}
        {pages.length > 0 && (
          <Card title={`Testo del Manuale Generale · ${pages.length} pagine`} pad={false}>
            <ul className="divide-y divide-line">{pages.slice(0, 8).map((h) => <HitRow key={h.doc.id} h={h} terms={terms} />)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
