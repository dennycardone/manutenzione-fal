import React, { useState } from 'react';
import { LuArrowRight, LuBookOpen, LuClock, LuCog, LuNavigation, LuSearch, LuShieldCheck, LuStar, LuWrench } from 'react-icons/lu';
import { QuickImport } from '../components/QuickImport';
import { Card, fmtDate, StatusBadge } from '../components/ui';
import { STATUS_META } from '../lib/engine';
import { Link, navigate } from '../lib/router';
import { useStore } from '../lib/store';
import type { Status } from '../lib/types';

export function SearchHero({ initial = '', big = true }: { initial?: string; big?: boolean }) {
  const [q, setQ] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/dove?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative"
    >
      <LuSearch className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted ${big ? 'text-xl' : ''}`} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cosa devi fare? es. “riscaldatore”, “C6-023”, “sabbiera”, “antigelo”…"
        className={`input !rounded-2xl !pl-12 !pr-28 shadow-sm ${big ? '!py-4 !text-[17px]' : '!py-3'}`}
        autoFocus={big}
        enterKeyHint="search"
      />
      <button type="submit" className="btn btn-primary absolute right-2 top-1/2 -translate-y-1/2">
        Cerca
      </button>
    </form>
  );
}

export function Onboarding({ onDone }: { onDone?: () => void }) {
  const { dataset } = useStore();
  return (
    <div className="mx-auto max-w-3xl py-6">
      <div className="mb-8">
        <div className="label mb-2">Primo avvio su questo dispositivo</div>
        <h1 className="text-3xl font-bold tracking-tight">Carica la documentazione</h1>
        <p className="mt-2 text-muted">
          L’app non contiene dati: i documenti tecnici restano sul tuo dispositivo. Carica il <b>pacchetto dati</b> (file <span className="code">.json</span> estratto
          dai tuoi documenti) e, se vuoi vedere le pagine originali, i PDF: <b>PRC C7</b>, <b>Trasmissione PdM e PRC</b>, <b>Manuale Generale Stadler</b>. Puoi
          selezionarli tutti insieme.
        </p>
      </div>
      <QuickImport />
      {dataset && onDone && (
        <div className="mt-4 flex justify-end">
          <button className="btn btn-primary" onClick={onDone}>
            Continua alla dashboard <LuArrowRight />
          </button>
        </div>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ['1', 'Pacchetto dati', 'Attività PRC, righe PdM e voci del Manuale Generale, ognuna con documento e pagina di provenienza.'],
          ['2', 'PDF originali', 'Riconosciuti automaticamente: servono per aprire il documento alla pagina giusta.'],
          ['3', 'Manuali organo', 'Aggiungili quando vuoi da Manuali → Aggiungi documento: entrano nella catena senza modificare l’app.'],
        ].map(([n, t, d]) => (
          <div key={n} className="card p-4">
            <div className="mb-2 grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">{n}</div>
            <div className="font-semibold">{t}</div>
            <div className="mt-1 text-sm text-muted">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const st = useStore();
  const { model, dataset, imported, attachments, importLog } = st;
  const [onb, setOnb] = useState(!dataset);
  if (!dataset || !model || onb) return <Onboarding onDone={() => setOnb(false)} />;
  const s = model.stats;
  const statCards: { k: Status; n: number }[] = [
    { k: 'complete', n: s.complete },
    { k: 'partial', n: s.partial },
    { k: 'verify', n: s.verify },
    { k: 'missing', n: s.missing },
  ];
  const organs = new Set(model.links.flatMap((l) => l.organRefs.map((o) => o.organName)));
  const procedures = new Set(model.links.flatMap((l) => l.organRefs.filter((o) => o.procedurePage).map((o) => `${o.importedDocId || 'stadler'}:${o.procedurePage}`)));
  const loadedManuals = 3 + imported.length;
  const expectedOrganManuals = model.expectedManuals.filter((e) => !e.inGeneral);
  const loadedOrgan = expectedOrganManuals.filter((e) => e.importedDocId).length;
  const recent = st.recent.map((id) => model.byId.get(id)).filter(Boolean).slice(0, 6);
  const favs = st.favorites.map((id) => model.byId.get(id)).filter(Boolean).slice(0, 6);
  const missingPdf = dataset.documents.filter((d) => !attachments[d.id]);

  return (
    <div>
      <section className="relative mb-8 overflow-hidden rounded-3xl bg-brand-900 px-5 py-8 text-white sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-600/40 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-full w-1/2 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#fff 0 2px,transparent 2px 28px)' }} />
        <div className="relative max-w-3xl">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand-200">
            <LuNavigation /> Dove devo andare?
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dalla voce del PRC C7 alla procedura, in pochi passaggi.</h1>
          <p className="mt-2 text-sm text-brand-100/90 sm:text-base">Cerca un’attività, un organo, un codice o una parola: l’app segue il percorso PRC → PdM → Manuale Generale → manuale dell’organo.</p>
          <div className="mt-5">
            <SearchHero />
          </div>
        </div>
      </section>

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Link to="/prc" className="card col-span-2 p-4 transition hover:border-brand-200 lg:col-span-1">
          <div className="label">Attività PRC C7</div>
          <div className="mt-1 text-3xl font-bold">{s.total.toLocaleString('it-IT')}</div>
          <div className="mt-1 text-xs text-muted">{dataset.documents.find((d) => d.id === 'prc-c7')?.docCode}</div>
        </Link>
        {statCards.map((c) => (
          <Link key={c.k} to={`/prc?stato=${c.k}`} className="card p-4 transition hover:border-brand-200">
            <div className="label flex items-center gap-1.5">
              <span>{STATUS_META[c.k].emoji}</span> {STATUS_META[c.k].short}
            </div>
            <div className="mt-1 text-3xl font-bold">{c.n.toLocaleString('it-IT')}</div>
            <div className="mt-1 text-xs text-muted">{Math.round((c.n / s.total) * 100)}% delle attività</div>
          </Link>
        ))}
      </div>

      {s.partial > 0 && loadedOrgan < expectedOrganManuals.length && (
        <div className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border border-[#f1dc9b] bg-part-bg px-5 py-4">
          <LuBookOpen className="text-2xl text-part" />
          <div className="min-w-0 flex-1 text-sm">
            <b>{s.partial} attività</b> arrivano fino al Manuale Generale ma attendono il manuale dell’organo: caricati {loadedOrgan} di {expectedOrganManuals.length} manuali organo indicati nel PdM.
          </div>
          <Link to="/manuali" className="btn btn-ghost btn-sm">
            Vedi quali mancano <LuArrowRight />
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Documentazione" className="lg:col-span-1" actions={<Link to="/manuali" className="text-sm font-semibold text-brand-600">Gestisci</Link>}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">{loadedManuals}</div>
              <div className="text-xs text-muted">documenti</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{organs.size}</div>
              <div className="text-xs text-muted">organi</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{procedures.size}</div>
              <div className="text-xs text-muted">procedure raggiungibili</div>
            </div>
          </div>
          {missingPdf.length > 0 && (
            <div className="mt-4 rounded-xl bg-canvas p-3 text-xs text-muted">
              PDF non ancora collegati su questo dispositivo: {missingPdf.map((d) => d.fileName).join(', ')}. Le pagine si vedono comunque come testo estratto.
            </div>
          )}
          <div className="mt-4 space-y-2">
            <div className="label">Ultime importazioni</div>
            {importLog.slice(0, 4).map((l) => (
              <div key={l.id} className="flex items-start gap-2 text-sm">
                <LuClock className="mt-0.5 shrink-0 text-muted" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.fileName}</div>
                  <div className="text-xs text-muted">
                    {l.kind} · {fmtDate(l.at)}
                  </div>
                </div>
              </div>
            ))}
            {!importLog.length && <div className="text-sm text-muted">Nessuna importazione registrata.</div>}
          </div>
        </Card>

        <Card title={favs.length ? 'Preferiti' : 'Attività recenti'} className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-line">
            {(favs.length ? favs : recent).map((l) => (
              <li key={l!.prc.id}>
                <Link to={`/attivita/${l!.prc.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                  {favs.length ? <LuStar className="shrink-0 text-[#e0a800]" /> : <LuWrench className="shrink-0 text-muted" />}
                  <span className="code w-16 shrink-0 text-sm font-semibold text-brand-700">{l!.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{l!.prc.activity}</span>
                  <StatusBadge status={l!.status} short className="hidden sm:inline-flex" />
                </Link>
              </li>
            ))}
            {!favs.length && !recent.length && (
              <li className="px-5 py-6 text-sm text-muted">
                Le attività che apri compaiono qui. Inizia dalla ricerca o da <Link to="/prc" className="font-semibold text-brand-600">PRC C7</Link>.
              </li>
            )}
          </ul>
          {s.reviewOpen > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4">
              <LuShieldCheck className="text-xl text-warn" />
              <div className="flex-1 text-sm">
                <b>{s.reviewOpen}</b> collegamenti da verificare: l’app non li considera certi finché non li confermi.
              </div>
              <Link to="/verifica" className="btn btn-ghost btn-sm">
                Controlla <LuArrowRight />
              </Link>
            </div>
          )}
        </Card>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { to: '/prc?stato=complete', icon: <LuWrench />, t: 'Attività complete', d: 'Arrivano fino alla procedura' },
          { to: '/stato', icon: <LuCog />, t: 'Stato per sistema', d: 'Copertura documentale per impianto' },
          { to: '/collegamenti', icon: <LuBookOpen />, t: 'Rete dei collegamenti', d: 'Ogni collegamento con metodo e affidabilità' },
        ].map((x) => (
          <Link key={x.to} to={x.to} className="card flex items-center gap-3 p-4 transition hover:border-brand-200">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-lg text-brand-600">{x.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{x.t}</span>
              <span className="block text-xs text-muted">{x.d}</span>
            </span>
            <LuArrowRight className="text-muted" />
          </Link>
        ))}
      </div>
    </div>
  );
}
