import React from 'react';
import { LuChartPie } from 'react-icons/lu';
import { Card, PageHeader, StatusBar, STATUS_STYLE } from '../components/ui';
import { STATUS_META } from '../lib/engine';
import { Link, viewerHref } from '../lib/router';
import { useStore } from '../lib/store';
import type { Status } from '../lib/types';
import { Onboarding } from './Dashboard';
import { exportCsv } from './PrcPage';

const ANOM: Record<string, string> = {
  code_text_mismatch: 'Codice PRC e testo non corrispondono alla voce del Manuale Generale',
  duplicate_code: 'Codice ripetuto nel PRC con contenuti diversi',
  no_code: 'Riga PRC senza numero attività',
  num_not_found: 'Numero attività assente nel Manuale Generale',
  not_in_summary: 'Numero presente solo nelle tabelle dei capitoli (non nel cap. 23)',
  pdm_missing: 'Codice PRC assente nel documento di collegamento',
  chapter_conflict: 'Capitolo diverso tra Manuale Generale e PdM',
  interval_mismatch: 'Intervallo diverso tra PRC e Manuale Generale',
  stadler_num_reused: 'Stesso numero usato per più attività nel Manuale Generale',
  stadler_internal_conflict: 'Descrizioni diverse dentro il Manuale Generale (cap. 23 vs capitolo)',
  organ_chapter_not_found: 'Capitolo non trovato nel manuale organo caricato',
  organ_chapter_partial: 'Trovato solo il capitolo superiore nel manuale organo',
};

export function StatusPage() {
  const { model } = useStore();
  if (!model) return <Onboarding />;
  const bySys = new Map<string, Record<Status, number>>();
  for (const l of model.links) {
    if (!bySys.has(l.system)) bySys.set(l.system, { complete: 0, partial: 0, missing: 0, verify: 0 });
    bySys.get(l.system)![l.status]++;
  }
  const anomalies = new Map<string, { n: number; sev: string }>();
  for (const l of model.links) for (const a of l.anomalies) anomalies.set(a.type, { n: (anomalies.get(a.type)?.n || 0) + 1, sev: a.severity });
  const s = model.stats;
  const organ = model.expectedManuals.filter((e) => !e.inGeneral);
  return (
    <div>
      <PageHeader
        icon={<LuChartPie />}
        title="Stato della documentazione"
        subtitle="Valori calcolati dai documenti importati e dalle decisioni registrate."
        actions={
          <button className="btn btn-ghost" onClick={() => exportCsv(model.links)}>
            Esporta tutto (CSV)
          </button>
        }
      />
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {(['complete', 'partial', 'verify', 'missing'] as Status[]).map((k) => (
            <Link key={k} to={`/prc?stato=${k}`} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLE[k].dot}`} />
              {STATUS_META[k].label}: <b>{s[k]}</b>
            </Link>
          ))}
        </div>
        <StatusBar counts={s} total={s.total} />
        <div className="mt-6 space-y-3">
          {[...bySys.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], 'it'))
            .map(([sys, c]) => {
              const tot = c.complete + c.partial + c.missing + c.verify;
              return (
                <Link key={sys} to={`/prc?sistema=${encodeURIComponent(sys)}`} className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 text-sm hover:text-brand-700">
                  <span className="truncate">{sys}</span>
                  <StatusBar counts={c} total={tot} />
                  <span className="w-10 text-right text-xs text-muted">{tot}</span>
                </Link>
              );
            })}
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Segnalazioni sui documenti">
          <ul className="space-y-2 text-sm">
            {[...anomalies.entries()]
              .sort((a, b) => b[1].n - a[1].n)
              .map(([k, v]) => (
                <li key={k} className="flex items-center gap-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${v.sev === 'error' ? 'bg-warn' : v.sev === 'warning' ? 'bg-[#e0a800]' : 'bg-brand-500'}`} />
                  <span className="flex-1">{ANOM[k] || k}</span>
                  <b>{v.n}</b>
                </li>
              ))}
          </ul>
          <div className="mt-4 text-xs text-muted">Punto arancione: richiede verifica. Giallo: attenzione. Blu: nota informativa.</div>
        </Card>
        <Card title={`Manuali organo · ${organ.filter((e) => e.importedDocId).length}/${organ.length} caricati`}>
          <ul className="space-y-1.5 text-sm">
            {organ.map((e) => (
              <li key={e.key} className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${e.importedDocId ? 'bg-ok' : 'bg-line'}`} />
                <span className="min-w-0 flex-1 truncate">{e.organs[0]}</span>
                <span className="text-xs text-muted">{e.prcActivities} att.</span>
              </li>
            ))}
          </ul>
          <Link to="/manuali" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Gestisci manuali →
          </Link>
        </Card>
        <Card title={`Attività del Manuale Generale (fino a C7) non presenti nel PRC · ${model.missingInPrc.length}`} className="lg:col-span-2">
          <p className="mb-3 text-sm text-muted">Report informativo: voci del cap. 23 con intervallo C2–C7 il cui numero non compare in nessuna riga del PRC C7.</p>
          <ul className="divide-y divide-line text-sm">
            {model.missingInPrc.map((it) => (
              <li key={it.id} className="py-2">
                <Link to={viewerHref('stadler', it.page, it.num)} className="flex gap-3 hover:text-brand-700">
                  <span className="code w-20 shrink-0 font-semibold">
                    {it.interval}-{it.num}
                  </span>
                  <span className="flex-1">{it.text}</span>
                  <span className="shrink-0 text-xs text-muted">
                    cap. {it.chapters.join(', ')} · p. {it.page}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
