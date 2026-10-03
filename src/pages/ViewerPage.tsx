import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowLeft, LuChevronLeft, LuChevronRight, LuExternalLink, LuFileText, LuPaperclip, LuZoomIn, LuZoomOut } from 'react-icons/lu';
import { Empty, Highlight } from '../components/ui';
import { identify } from '../lib/importer';
import { openPdf, renderPage, type PDFDoc } from '../lib/pdf';
import { navigate, useRoute } from '../lib/router';
import { useStore } from '../lib/store';
import { Onboarding } from './Dashboard';

const cache = new Map<string, { pdf: PDFDoc; url: string }>();

async function loadDoc(key: string, blob: Blob) {
  const c = cache.get(key);
  if (c) return c;
  const pdf = await openPdf(await blob.arrayBuffer());
  const url = URL.createObjectURL(blob);
  const v = { pdf, url };
  cache.set(key, v);
  return v;
}

export function ViewerPage() {
  const { parts, query } = useRoute();
  const st = useStore();
  const docId = decodeURIComponent(parts[1] || '');
  const refPage = Number(query.get('page') || '1') || 1;
  const q = query.get('q') || '';
  const label = query.get('label') || '';
  const base = st.dataset?.documents.find((d) => d.id === docId);
  const imp = st.imported.find((d) => d.id === docId);
  const att = st.attachments[docId];
  const offset = base ? att?.pageOffset || 0 : 0;
  const [doc, setDoc] = useState<{ pdf: PDFDoc; url: string } | null>(null);
  const [state, setState] = useState<'loading' | 'pdf' | 'text' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showText, setShowText] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const physical = refPage + offset;
  const pageCount = doc?.pdf.numPages || base?.pageCount || imp?.pageCount || 1;
  const terms = useMemo(() => q.split(/\s+/).filter((t) => t.length >= 3), [q]);

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      const isPdf = base ? true : imp?.fileType === 'pdf';
      const blob = isPdf ? await st.getFile(docId) : null;
      if (!alive) return;
      if (!blob) {
        setDoc(null);
        setState('text');
        return;
      }
      try {
        const d = await loadDoc(`${docId}:${blob.size}`, blob);
        if (!alive) return;
        setDoc(d);
        setState('pdf');
      } catch (e: any) {
        setErr(e?.message || String(e));
        setState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [docId, att?.sha256, imp?.sha256]);

  useEffect(() => {
    if (state !== 'pdf' || !doc || !canvasRef.current || !wrapRef.current) return;
    const width = Math.min(wrapRef.current.clientWidth, 1100) * zoom;
    let alive = true;
    renderPage(doc.pdf, Math.min(Math.max(1, physical), doc.pdf.numPages), canvasRef.current, width, terms).then((r) => {
      if (!alive) return;
      setRects(r.rects);
      const first = r.rects.sort((a, b) => a.y - b.y)[0];
      if (first && canvasRef.current) {
        const top = canvasRef.current.getBoundingClientRect().top + window.scrollY + first.y - 160;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    });
    return () => {
      alive = false;
    };
  }, [state, doc, physical, zoom, terms.join(' ')]);

  if (!st.dataset) return <Onboarding />;
  if (!base && !imp) return <Empty title="Documento non trovato" />;
  const title = base?.title || imp?.title || docId;
  const texts = base ? st.dataset.pageTexts[docId] || {} : imp?.pageTexts || {};
  const pageText = texts[String(base ? refPage : physical)] || '';
  const section = docId === 'stadler' ? [...st.dataset.general.sections].filter((s) => s.page <= refPage).pop() : imp ? [...imp.headings].filter((h) => h.page <= physical).sort((a, b) => a.page - b.page).pop() : undefined;
  const go = (p: number) => {
    const np = new URLSearchParams(query);
    np.set('page', String(Math.max(1, p)));
    navigate(`/viewer/${encodeURIComponent(docId)}?${np.toString()}`, true);
  };

  async function attachHere(f: File) {
    if (!base) return;
    const r = await identify(f, st.dataset);
    if (r.type === 'known' && r.docId !== docId) {
      alert(`Il file sembra essere un altro documento (${st.docTitle(r.docId)}). Lo collego a quello.`);
      await st.attach(r.docId, f, f.name, r.pageOffset);
      return;
    }
    if (r.type !== 'known' && !confirm('Il file non è stato riconosciuto con certezza come questo documento. Collegarlo comunque?')) return;
    await st.attach(docId, f, f.name, r.type === 'known' ? r.pageOffset : 0);
  }

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-10 lg:-my-8">
      <div className="no-print sticky top-[49px] z-30 flex flex-wrap items-center gap-2 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur lg:top-0 lg:px-6">
        <button onClick={() => history.back()} className="rounded-lg p-2 hover:bg-canvas" aria-label="Indietro">
          <LuArrowLeft />
        </button>
        <div className="mr-auto min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-muted">
            {section ? `Cap. ${section.num} – ${section.title}` : ''}
            {label ? ` · ${label}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-sm" onClick={() => go(refPage - 1)} disabled={refPage <= 1} aria-label="Pagina precedente">
            <LuChevronLeft />
          </button>
          <span className="flex items-center gap-1 text-sm">
            Pag.
            <input
              className="input !w-16 !px-2 !py-1 text-center"
              defaultValue={refPage}
              key={refPage}
              onKeyDown={(e) => e.key === 'Enter' && go(Number((e.target as HTMLInputElement).value))}
            />
            <span className="text-muted">/ {pageCount - offset}</span>
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => go(refPage + 1)} disabled={refPage >= pageCount - offset} aria-label="Pagina successiva">
            <LuChevronRight />
          </button>
        </div>
        {state === 'pdf' && (
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Riduci">
              <LuZoomOut />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Ingrandisci">
              <LuZoomIn />
            </button>
          </div>
        )}
        <button className={`btn btn-sm ${showText ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowText(!showText)}>
          <LuFileText /> Testo
        </button>
        {doc && (
          <a className="btn btn-ghost btn-sm" href={`${doc.url}#page=${physical}`} target="_blank" rel="noreferrer">
            <LuExternalLink /> Documento completo
          </a>
        )}
      </div>

      <div className="px-4 py-5 lg:px-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="chip bg-brand-50 text-brand-700">
            {section ? `Capitolo ${section.num} – ` : ''}Pagina {refPage}
          </span>
          {offset !== 0 && <span className="text-xs text-muted">pagina {physical} del file PDF</span>}
          {q && (
            <span className="text-xs text-muted">
              Evidenziato: <b>{q}</b>
            </span>
          )}
        </div>
        <div className={`grid gap-5 ${showText && state === 'pdf' ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
          <div ref={wrapRef} className="min-w-0">
            {state === 'loading' && <div className="card p-10 text-center text-sm text-muted">Apertura del documento…</div>}
            {state === 'error' && <div className="card p-6 text-sm text-miss">Errore nella lettura del PDF: {err}</div>}
            {state === 'pdf' && (
              <div className="scroll-thin overflow-auto">
                <div className="relative mx-auto w-fit rounded-md bg-white shadow-lg ring-1 ring-line">
                  <canvas ref={canvasRef} className="block" />
                  {rects.map((r, i) => (
                    <span key={i} className="pointer-events-none absolute rounded-sm bg-[#facc15]/40 ring-2 ring-[#eab308]/70" style={{ left: r.x - 2, top: r.y - 1, width: r.w + 4, height: r.h + 2 }} />
                  ))}
                </div>
              </div>
            )}
            {state === 'text' && (
              <div className="card p-5">
                {base && (
                  <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-part-bg p-3 text-sm">
                    <LuPaperclip className="text-part" />
                    <span className="flex-1">
                      Il PDF originale non è collegato su questo dispositivo: vedi il <b>testo estratto</b> della pagina. Collega il file <span className="code">{base.fileName}</span> per vedere la pagina originale.
                    </span>
                    <label className="btn btn-primary btn-sm cursor-pointer">
                      Collega PDF
                      <input type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && attachHere(e.target.files[0])} />
                    </label>
                  </div>
                )}
                {imp && imp.fileType !== 'pdf' && <div className="mb-3 text-xs text-muted">Documento {imp.fileType.toUpperCase()}: “pagina” = sezione/riga estratta.</div>}
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink">
                  <Highlight text={pageText || '(nessun testo per questa pagina)'} terms={terms} />
                </pre>
              </div>
            )}
          </div>
          {showText && state === 'pdf' && (
            <aside className="card h-fit max-h-[80vh] overflow-auto p-4">
              <div className="label mb-2">Testo estratto · pagina {refPage}</div>
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed">
                <Highlight text={pageText || '(nessun testo)'} terms={terms} />
              </pre>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
