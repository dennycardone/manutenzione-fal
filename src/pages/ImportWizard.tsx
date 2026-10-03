import React, { useEffect, useMemo, useState } from 'react';
import { LuCircleCheck, LuFilePlus, LuTriangleAlert } from 'react-icons/lu';
import { pending } from '../components/QuickImport';
import { Card, displayManual, PageHeader, Progress } from '../components/ui';
import { sha256 } from '../lib/db';
import { extractAny, extOf, identify, organReport, suggestManuals, type ManualSuggestion, type OrganReport } from '../lib/importer';
import type { Extracted } from '../lib/pdf';
import { navigate, useRoute } from '../lib/router';
import { useStore } from '../lib/store';
import type { ImportedDoc } from '../lib/types';
import { Onboarding } from './Dashboard';

type Kind = 'organ' | 'link' | 'prc' | 'general' | 'other';
const KINDS: { k: Kind; t: string; d: string }[] = [
  { k: 'organ', t: 'Manuale organo', d: 'Manuale specifico di un organo/sistema (motore, porte, clima…): entra nella catena come destinazione dei riferimenti del PdM.' },
  { k: 'link', t: 'Documento di collegamento', d: 'Il file “Trasmissione PdM e PRC”.' },
  { k: 'prc', t: 'PRC C7', d: 'Il piano di riparazione e controllo.' },
  { k: 'general', t: 'Manuale Generale', d: 'Il manuale di manutenzione Stadler BU_1992747.' },
  { k: 'other', t: 'Altro', d: 'Documento consultabile e ricercabile, senza collegamenti automatici.' },
];

export function ImportWizard() {
  const st = useStore();
  const { query } = useRoute();
  const preKey = query.get('manual') || '';
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>('organ');
  const [step, setStep] = useState<'pick' | 'type' | 'analyze' | 'match' | 'done'>('pick');
  const [prog, setProg] = useState<[number, number]>([0, 0]);
  const [ext, setExt] = useState<(Extracted & { fileType: ImportedDoc['fileType'] }) | null>(null);
  const [err, setErr] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [organ, setOrgan] = useState('');
  const [system, setSystem] = useState('');
  const [msg, setMsg] = useState<string[]>([]);

  useEffect(() => {
    if (query.get('pending') && pending.files.length) {
      setFile(pending.files.shift()!);
      setStep('type');
    }
  }, []);

  const suggestions: ManualSuggestion[] = useMemo(() => {
    if (!file || !ext || !st.model) return [];
    return suggestManuals(file.name, ext.firstPagesText, st.model.expectedManuals);
  }, [file, ext, st.model]);

  useEffect(() => {
    if (step !== 'match' || !st.model) return;
    const top = suggestions[0];
    const clear = top && top.score >= 0.85 && top.score - (suggestions[1]?.score || 0) >= 0.2;
    const pre = preKey ? [preKey] : suggestions.filter((s) => s.score >= 1).map((s) => s.manual.key).concat(clear && top.score < 1 ? [top.manual.key] : []);
    setKeys(pre);
    const e = st.model.expectedManuals.find((x) => x.key === (pre[0] || ''));
    setTitle(e ? displayManual(e.names[0]) : file!.name.replace(/\.[^.]+$/, ''));
    setOrgan(e?.organs[0] || '');
    setSystem(e?.systems[0] ? e.systems[0].charAt(0) + e.systems[0].slice(1).toLowerCase() : '');
  }, [step]);

  const report: OrganReport | null = useMemo(() => {
    if (!ext || !st.model || !keys.length) return null;
    return organReport({ headings: ext.headings }, keys, st.model);
  }, [ext, keys, st.model]);

  if (!st.dataset || !st.model) return <Onboarding />;
  const expected = st.model.expectedManuals.filter((e) => !e.inGeneral);
  const preManual = expected.find((e) => e.key === preKey);

  async function analyze() {
    if (!file) return;
    setErr('');
    if (kind === 'prc' || kind === 'link' || kind === 'general') {
      if (extOf(file.name) !== 'pdf') {
        setErr('Per questa tipologia serve il PDF.');
        return;
      }
      const r = await identify(file, st.dataset);
      const target = kind === 'prc' ? 'prc-c7' : kind === 'link' ? 'pdm' : 'stadler';
      if (r.type === 'known' && r.docId === target) {
        await st.attach(target, file, file.name, r.pageOffset);
        await st.log({ fileName: file.name, kind: 'PDF collegato', summary: [st.docTitle(target), `Riconosciuto: ${r.how}`] });
        setMsg([`Il file corrisponde al documento già analizzato (“${st.docTitle(target)}”).`, 'Collegato: ora le pagine si aprono sul PDF originale.']);
        setStep('done');
        return;
      }
      if (confirm(`Non riesco a confermare in automatico che il file sia “${st.docTitle(target)}”. Se sei sicuro che sia lo stesso documento (stessa revisione), premi OK per collegarlo comunque.`)) {
        await st.attach(target, file, file.name, r.type === 'known' ? r.pageOffset : 0);
        await st.log({ fileName: file.name, kind: 'PDF collegato', summary: [st.docTitle(target), 'Collegato su conferma dell’operatore'] });
        setMsg([`Collegato a “${st.docTitle(target)}” su tua conferma.`, 'Controlla in un’attività che la pagina aperta sia quella giusta.']);
        setStep('done');
        return;
      }
      setErr(
        'Il file non corrisponde alla revisione analizzata. La struttura di questi documenti (tabelle PRC/PdM e Manuale Generale) viene estratta dallo script di estrazione, che genera un nuovo pacchetto dati: chiedi un pacchetto aggiornato e caricalo da Impostazioni. Nel frattempo puoi importarlo come “Altro” per consultarlo e cercarci dentro.',
      );
      return;
    }
    setStep('analyze');
    try {
      const x = await extractAny(file, (p, t) => setProg([p, t]));
      setExt(x);
      setStep(kind === 'organ' ? 'match' : 'match');
    } catch (e: any) {
      setErr(e?.message || String(e));
      setStep('type');
    }
  }

  async function save() {
    if (!file || !ext) return;
    const buf = await file.arrayBuffer();
    const doc: ImportedDoc = {
      id: `doc-${crypto.randomUUID().slice(0, 8)}`,
      kind: kind === 'organ' ? 'organ' : 'other',
      title: title || file.name,
      fileName: file.name,
      fileType: ext.fileType,
      sha256: await sha256(buf),
      pageCount: ext.pageCount,
      importedAt: new Date().toISOString(),
      organName: organ || undefined,
      system: system || undefined,
      manualKeys: kind === 'organ' ? keys : [],
      headings: ext.headings,
      pageTexts: ext.pageTexts,
      textless: ext.textless,
    };
    await st.addImported(doc, file);
    const summary = [
      `${ext.pageCount} pagine${ext.textless ? ' (senza testo: probabile scansione)' : ''}`,
      `${ext.headings.length} capitoli/paragrafi individuati`,
      ...(report
        ? [
            `${report.activities} attività PRC collegate a questo manuale`,
            `${report.exact} collegamenti riconosciuti`,
            `${report.parent} collegamenti parziali (capitolo superiore)`,
            `${report.notFound.reduce((a, n) => a + n.codes.length, 0)} riferimenti da verificare`,
          ]
        : kind === 'organ'
          ? ['Non associato ad alcun manuale del PdM: consultabile e ricercabile']
          : ['Documento consultabile e ricercabile']),
    ];
    await st.log({ fileName: file.name, kind: kind === 'organ' ? 'Manuale organo' : 'Altro documento', summary });
    setMsg(summary);
    setStep('done');
    (window as any).__lastImported = doc.id;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={<LuFilePlus />} title="Aggiungi documento" subtitle="Selezione file → tipologia → analisi automatica → collegamenti → report finale." />
      <ol className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
        {['File', 'Tipologia', 'Analisi', 'Collegamenti', 'Report'].map((s, i) => {
          const idx = ['pick', 'type', 'analyze', 'match', 'done'].indexOf(step);
          return (
            <li key={s} className={`rounded-full px-3 py-1 ${i <= idx ? 'bg-brand-600 text-white' : 'bg-white text-muted ring-1 ring-line'}`}>
              {i + 1}. {s}
            </li>
          );
        })}
      </ol>

      {preManual && step !== 'done' && (
        <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm">
          Stai caricando il manuale indicato nel PdM: <b className="code">{displayManual(preManual.names[0])}</b> ({preManual.organs.slice(0, 3).join(', ')}).
        </div>
      )}

      {step === 'pick' && (
        <Card>
          <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-brand-200 px-6 py-12 text-center hover:border-brand-500 hover:bg-brand-50/50">
            <LuFilePlus className="mb-2 text-3xl text-brand-500" />
            <span className="font-semibold">Seleziona il file</span>
            <span className="mt-1 text-sm text-muted">PDF, Word (DOCX), Excel (XLSX), CSV, TXT</span>
            <input
              type="file"
              className="hidden"
              accept=".pdf,.docx,.xlsx,.xlsm,.csv,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setStep('type');
                }
              }}
            />
          </label>
        </Card>
      )}

      {step === 'type' && file && (
        <Card title={`Tipologia di “${file.name}”`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label key={k.k} className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${kind === k.k ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-200'}`}>
                <input type="radio" name="kind" checked={kind === k.k} onChange={() => setKind(k.k)} className="mt-1" />
                <span>
                  <span className="block font-semibold">{k.t}</span>
                  <span className="block text-sm text-muted">{k.d}</span>
                </span>
              </label>
            ))}
          </div>
          {err && <div className="mt-4 rounded-xl bg-warn-bg p-3 text-sm text-ink">{err}</div>}
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => (setFile(null), setStep('pick'))}>
              Cambia file
            </button>
            <button className="btn btn-primary" onClick={analyze}>
              Importa e analizza
            </button>
          </div>
        </Card>
      )}

      {step === 'analyze' && (
        <Card title="Analisi automatica">
          <div className="mb-2 text-sm text-muted">
            Lettura del testo e individuazione di capitoli e paragrafi… {prog[1] ? `pagina ${prog[0]} di ${prog[1]}` : ''}
          </div>
          <Progress value={prog[0]} total={prog[1] || 1} />
        </Card>
      )}

      {step === 'match' && ext && file && (
        <div className="space-y-6">
          <Card title="Risultato dell’analisi">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-2xl font-bold">{ext.pageCount}</div>
                <div className="text-xs text-muted">{ext.fileType === 'xlsx' || ext.fileType === 'csv' ? 'righe' : ext.fileType === 'docx' ? 'sezioni' : 'pagine'}</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{ext.headings.length}</div>
                <div className="text-xs text-muted">capitoli/paragrafi individuati</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{Object.values(ext.pageTexts).reduce((a, t) => a + t.length, 0).toLocaleString('it-IT')}</div>
                <div className="text-xs text-muted">caratteri di testo</div>
              </div>
            </div>
            {ext.textless && (
              <div className="mt-4 flex gap-2 rounded-xl bg-warn-bg p-3 text-sm">
                <LuTriangleAlert className="mt-0.5 text-warn" /> Il PDF non contiene testo (probabile scansione): capitoli non individuabili automaticamente. Potrai indicare le pagine dei capitoli a mano nel dettaglio del manuale. L’OCR non è disponibile in questa versione.
              </div>
            )}
            {ext.headings.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand-600">Vedi capitoli individuati</summary>
                <ul className="scroll-thin mt-2 max-h-64 overflow-auto rounded-lg border border-line text-sm">
                  {ext.headings.map((h, i) => (
                    <li key={i} className="flex gap-3 border-b border-line px-3 py-1.5 last:border-0">
                      <span className="code w-16 shrink-0 font-semibold">{h.num}</span>
                      <span className="flex-1">{h.title}</span>
                      <span className="text-muted">p. {h.page}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          {kind === 'organ' && (
            <Card title="A quale manuale del PdM corrisponde questo file?">
              <p className="mb-3 text-sm text-muted">
                Il documento di collegamento indica i manuali con il loro nome. Conferma la corrispondenza: l’app non la dà per certa finché non la scegli tu.
              </p>
              <ul className="scroll-thin max-h-80 space-y-2 overflow-auto">
                {[...suggestions.map((s) => s.manual), ...expected.filter((e) => !suggestions.some((s) => s.manual.key === e.key))].map((e) => {
                  const s = suggestions.find((x) => x.manual.key === e.key);
                  const on = keys.includes(e.key);
                  return (
                    <li key={e.key}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? 'border-brand-500 bg-brand-50' : 'border-line hover:border-brand-200'}`}>
                        <input type="checkbox" className="mt-1" checked={on} onChange={() => setKeys(on ? keys.filter((k) => k !== e.key) : [...keys, e.key])} />
                        <span className="min-w-0 flex-1">
                          <span className="code block break-all text-[13px] font-semibold">{displayManual(e.names[0])}</span>
                          <span className="block text-xs text-muted">
                            {e.organs.slice(0, 4).join(', ')} · {e.prcActivities} attività PRC{e.importedDocId ? ' · già caricato' : ''}
                          </span>
                          {s && (
                            <span className="mt-1 block text-xs text-brand-700">
                              Corrispondenza {Math.round(s.score * 100)}% – {s.reasons.join('; ')}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label>
                  <span className="label">Titolo</span>
                  <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  <span className="label">Organo</span>
                  <input className="input mt-1" value={organ} onChange={(e) => setOrgan(e.target.value)} />
                </label>
                <label>
                  <span className="label">Sistema</span>
                  <input className="input mt-1" value={system} onChange={(e) => setSystem(e.target.value)} />
                </label>
              </div>
            </Card>
          )}

          {report && (
            <Card title="Collegamenti che questo manuale renderà possibili">
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <div className="text-2xl font-bold">{report.activities}</div>
                  <div className="text-xs text-muted">attività PRC</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-ok">{report.exact}</div>
                  <div className="text-xs text-muted">collegamenti riconosciuti</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-part">{report.parent}</div>
                  <div className="text-xs text-muted">parziali (capitolo superiore)</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-warn">{report.notFound.reduce((a, n) => a + n.codes.length, 0)}</div>
                  <div className="text-xs text-muted">da verificare</div>
                </div>
              </div>
              {report.notFound.length > 0 && (
                <div className="mt-4 text-sm">
                  <div className="label mb-1">Capitoli indicati nel PdM ma non trovati nel file</div>
                  <ul className="space-y-1">
                    {report.notFound.map((n, i) => (
                      <li key={i}>
                        Cap. <b>{n.chapter ?? '(non indicato)'}</b> – {n.organ} <span className="text-muted">({n.codes.slice(0, 5).join(', ')})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn btn-ghost" onClick={() => setStep('type')}>
              Indietro
            </button>
            <button className="btn btn-primary" onClick={save}>
              <LuCircleCheck /> Salva e aggiorna i collegamenti
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <Card>
          <div className="flex items-start gap-3">
            <LuCircleCheck className="mt-1 text-2xl text-ok" />
            <div>
              <div className="text-lg font-semibold">Documento importato</div>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {msg.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                {(window as any).__lastImported && (
                  <button className="btn btn-primary" onClick={() => navigate(`/manuale/${(window as any).__lastImported}`)}>
                    Apri il manuale
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => navigate('/verifica')}>
                  Controllo collegamenti
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const next = pending.files.shift() || null;
                    setFile(next);
                    setExt(null);
                    setKeys([]);
                    setErr('');
                    setStep(next ? 'type' : 'pick');
                    if (preKey) navigate('/documenti/nuovo', true);
                  }}
                >
                  Aggiungi un altro documento
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
