// Motore dei collegamenti: PRC C7 → PdM (documento di collegamento) → Manuale Generale → Organo → Manuale organo → Procedura.
// Regola: un collegamento è "verde" solo se codice E descrizione concordano. Mai inventare: ogni passo porta la sua prova.

import type {
  ActivityLink,
  Anomaly,
  Dataset,
  Decision,
  Evidence,
  GeneralItem,
  GeneralRef,
  GeneralTableItem,
  ImportedDoc,
  LinkRecord,
  OrganRef,
  PdmRow,
  Status,
} from './types';
import { cleanChapter, manualKey, similarity, WeightedSim } from './text';

export const TH = {
  ok: 0.42, // sopra questa soglia il testo PRC corrisponde alla voce Stadler
  suggest: 0.5, // soglia minima per proporre una voce alternativa
  margin: 0.12, // la proposta deve superare il candidato di almeno questo margine
  strong: 0.85, // anche se il testo è simile, se un'altra voce corrisponde quasi esattamente...
  strongMargin: 0.25, // ...e molto meglio, il collegamento va verificato
};

export interface Model {
  links: ActivityLink[];
  byId: Map<string, ActivityLink>;
  linkRecords: LinkRecord[];
  expectedManuals: ExpectedManual[];
  missingInPrc: GeneralItem[];
  stats: { total: number; complete: number; partial: number; missing: number; verify: number; reviewOpen: number };
  itemsByNum: Map<string, GeneralItem[]>;
  sectionsByNum: Map<string, { num: string; title: string; page: number }>;
}

export interface ExpectedManual {
  key: string;
  names: string[]; // nomi come scritti nel PdM
  organs: string[];
  systems: string[];
  pdmRows: number;
  prcActivities: number;
  importedDocId?: string;
  inGeneral: boolean;
}

const GENERAL_KEYS = ['bu1992747', 'manualestadler'];
const isGeneralManual = (k: string) => GENERAL_KEYS.some((g) => k.includes(g));

function ev(docId: string, page: number, text: string, label: string): Evidence {
  return { docId, page, text, label };
}

export function buildModel(ds: Dataset, imported: ImportedDoc[], decisions: Record<string, Decision>): Model {
  const items = ds.general.items;
  const itemsByNum = new Map<string, GeneralItem[]>();
  for (const it of items) {
    if (!itemsByNum.has(it.num)) itemsByNum.set(it.num, []);
    itemsByNum.get(it.num)!.push(it);
  }
  const tableByNum = new Map<string, GeneralTableItem[]>();
  for (const t of ds.general.tableItems) {
    if (!tableByNum.has(t.num)) tableByNum.set(t.num, []);
    tableByNum.get(t.num)!.push(t);
  }
  const sectionsByNum = new Map(ds.general.sections.map((s) => [s.num, s]));
  const ws = new WeightedSim(items.map((t) => t.text).concat(ds.prc.map((p) => p.activity)));
  const sc = (prc: { activity: string; component: string }, text: string) => ws.score(prc.activity, text) + 0.06 * ws.score(prc.component, text);

  const pdmByCode = new Map<string, PdmRow[]>();
  const childrenByParent = new Map<string, PdmRow[]>();
  for (const r of ds.pdm) {
    if (r.role === 'child' && r.parentCode) {
      if (!childrenByParent.has(r.parentCode)) childrenByParent.set(r.parentCode, []);
      childrenByParent.get(r.parentCode)!.push(r);
    }
    if (r.interval && r.num && !r.childNum) {
      const code = `${r.interval}-${r.num}`;
      if (!pdmByCode.has(code)) pdmByCode.set(code, []);
      pdmByCode.get(code)!.push(r);
    }
  }

  // codici duplicati nel PRC
  const codeCount = new Map<string, number>();
  for (const p of ds.prc) codeCount.set(p.codeRaw, (codeCount.get(p.codeRaw) || 0) + 1);

  const importedByKey = new Map<string, ImportedDoc>();
  for (const d of imported) for (const k of d.manualKeys) importedByKey.set(k, d);

  const links: ActivityLink[] = [];

  for (const prc of ds.prc) {
    const anomalies: Anomaly[] = [];
    const code = prc.codeRaw;
    const decision = decisions[prc.id];
    const prcText = prc.activity;
    const prcFull = `${prc.component} ${prc.activity}`;
    const prcEv = ev('prc-c7', prc.page, `${code} | ${prc.component} | ${prc.activity}`, 'Riga PRC C7');

    if ((codeCount.get(code) || 0) > 1) {
      anomalies.push({
        type: 'duplicate_code',
        severity: 'error',
        message: `Il codice ${code} compare ${codeCount.get(code)} volte nel PRC con contenuti diversi.`,
        evidence: ds.prc
          .filter((p) => p.codeRaw === code)
          .map((p) => ev('prc-c7', p.page, `${p.codeRaw} | ${p.component} | ${p.activity}`, `PRC riga ${p.row}`)),
      });
    }

    // --- 1. voce Stadler per numero attività
    const candidates = prc.num ? itemsByNum.get(prc.num) || [] : [];
    let best: GeneralItem | undefined;
    let bestScore = 0;
    for (const c of candidates) {
      const s = sc(prc, c.text);
      const bonus = c.interval === prc.interval ? 0.08 : 0;
      if (!best || s + bonus > bestScore + (best.interval === prc.interval ? 0.08 : 0)) {
        best = c;
        bestScore = s;
      }
    }
    const tableItems = prc.num ? tableByNum.get(prc.num) || [] : [];
    let tableScore = 0;
    for (const t of tableItems) tableScore = Math.max(tableScore, ws.score(prcText, t.text));

    // miglior voce per solo testo (per proporre la correzione)
    let sug: GeneralItem | undefined;
    let sugScore = 0;
    for (const it of items) {
      if (best && it.id === best.id) continue;
      const s = sc(prc, it.text);
      const bonus = it.interval === prc.interval ? 0.03 : 0;
      if (s + bonus > sugScore) {
        sugScore = s + bonus;
        sug = it;
      }
    }

    let stadlerItem = best;
    let textScore = Math.max(bestScore, tableScore);
    let method: ActivityLink['method'] = 'nessuno';
    let confidence = 0;

    if (!prc.num) {
      anomalies.push({
        type: 'no_code',
        severity: 'error',
        message: `La riga non ha un numero attività (codice "${code}"): il collegamento non è determinabile dal codice.`,
        evidence: [prcEv],
        suggestion: sug && sugScore >= TH.suggest ? { num: sug.num, itemId: sug.id, score: sugScore, text: sug.text } : undefined,
      });
    } else if (!best && tableItems.length) {
      const t = tableItems[0];
      method = tableScore >= TH.ok ? 'codice+testo' : 'codice';
      confidence = tableScore >= TH.ok ? 0.75 : 0.35;
      anomalies.push({
        type: tableScore >= TH.ok ? 'not_in_summary' : 'code_text_mismatch',
        severity: tableScore >= TH.ok ? 'warning' : 'error',
        message: `Il N. ${prc.num} non compare nel riepilogo del cap. 23 del Manuale Generale; è presente solo nella tabella del cap. ${t.section} (pag. ${t.page}).`,
        evidence: [prcEv, ...tableItems.map((x) => ev('stadler', x.page, `N. ${x.num} – ${x.text}`, `Manuale Generale cap. ${x.section}`))],
      });
    } else if (!best && !tableItems.length) {
      anomalies.push({
        type: 'num_not_found',
        severity: 'error',
        message: `Il numero ${prc.num} non è presente nel Manuale Generale (cap. 23 e tabelle dei capitoli).`,
        evidence: [prcEv],
        suggestion: sug && sugScore >= TH.suggest ? { num: sug.num, itemId: sug.id, score: sugScore, text: sug.text } : undefined,
      });
    } else if (textScore >= TH.ok && !(sug && sugScore >= TH.strong && sugScore - textScore >= TH.strongMargin)) {
      method = 'codice+testo';
      confidence = Math.min(1, 0.6 + textScore / 2);
    } else {
      method = 'codice';
      confidence = 0.35;
      const better = !!sug && sugScore >= TH.suggest && sugScore - textScore >= TH.margin;
      anomalies.push({
        type: 'code_text_mismatch',
        severity: 'error',
        message: better
          ? `Il codice ${code} rimanda alla voce N. ${prc.num} del Manuale Generale, ma il testo della riga PRC è più simile alla voce N. ${sug!.num} (somiglianza ${Math.round(Math.min(1, sugScore) * 100)}%).`
          : `Il testo della riga PRC non corrisponde alla voce Stadler N. ${prc.num}.`,
        evidence: [
          prcEv,
          ...(best ? [ev('stadler', best.page, `N. ${best.num} (${best.interval}) – ${best.text}`, 'Manuale Generale cap. 23')] : []),
          ...tableItems.slice(0, 2).map((t) => ev('stadler', t.page, `N. ${t.num} – ${t.text}`, `Manuale Generale cap. ${t.section}`)),
          ...(better ? [ev('stadler', sug!.page, `N. ${sug!.num} (${sug!.interval}) – ${sug!.text}`, 'Corrispondenza per testo')] : []),
        ],
        suggestion: better ? { num: sug!.num, itemId: sug!.id, score: sugScore, text: sug!.text } : undefined,
      });
    }

    // Stadler: stesso numero usato per attività diverse
    if (candidates.length > 1) {
      const ivs = [...new Set(candidates.map((c) => c.interval))].join(', ');
      anomalies.push({
        type: 'stadler_num_reused',
        severity: 'info',
        message: `Nel Manuale Generale il N. ${prc.num} è usato per ${candidates.length} attività diverse (${ivs}). Scelta la voce con intervallo e testo più vicini.`,
        evidence: candidates.map((c) => ev('stadler', c.page, `N. ${c.num} (${c.interval}) – ${c.text}`, 'Manuale Generale cap. 23')),
      });
    }
    // Stadler: testo diverso tra cap. 23 e tabella del capitolo
    if (best && tableItems.length) {
      const t = tableItems.find((x) => best!.chapters.some((ch) => x.section && ch === x.section)) || tableItems[0];
      const s = similarity(best.text, t.text);
      if (s < 0.3) {
        anomalies.push({
          type: 'stadler_internal_conflict',
          severity: 'warning',
          message: `Nel Manuale Generale il N. ${prc.num} ha descrizioni diverse al cap. 23 e al cap. ${t.section}.`,
          evidence: [
            ev('stadler', best.page, `cap. 23: ${best.text}`, 'Manuale Generale cap. 23'),
            ev('stadler', t.page, `cap. ${t.section}: ${t.text}`, `Manuale Generale cap. ${t.section}`),
          ],
        });
      }
    }

    // decisione operatore: sostituzione numero
    if (decision?.action === 'override' && decision.overrideNum) {
      const alt = itemsByNum.get(decision.overrideNum) || [];
      const pick = alt.find((a) => a.interval === prc.interval) || alt[0];
      if (pick) {
        stadlerItem = pick;
        textScore = sc(prc, pick.text);
        method = 'manuale';
        confidence = 1;
      }
    } else if (decision?.action === 'confirm') {
      method = method === 'nessuno' ? 'manuale' : method;
      confidence = 1;
    }

    const effNum = stadlerItem?.num || prc.num;
    const effCode = effNum && prc.interval ? `${prc.interval}-${effNum}` : code;

    // --- 2. righe PdM (documento di collegamento)
    const pdmRows = (pdmByCode.get(effCode) || []).concat(effCode !== code ? [] : []);
    const pdmGeneral = pdmRows.filter((r) => r.role === 'general');
    const pdmParent = pdmRows.find((r) => r.role === 'parent');
    const pdmSelf = pdmRows.filter((r) => r.role === 'child'); // sezione motore: righe a livello singolo
    const pdmChildren = (pdmParent ? childrenByParent.get(effCode) || [] : []).concat(pdmSelf);

    if (!pdmRows.length) {
      // stesso numero con altro intervallo, oppure stessa attività (per testo) con altro codice
      const other = prc.num ? [...pdmByCode.keys()].filter((k) => k.endsWith(`-${effNum}`)) : [];
      const byText = ds.pdm
        .filter((r) => r.role === 'general' && r.desc && ws.score(prcText, r.desc) >= 0.8)
        .slice(0, 3);
      const alt = byText.filter((r) => r.codeRaw && r.codeRaw !== code);
      anomalies.push({
        type: 'pdm_missing',
        severity: alt.length ? 'error' : 'warning',
        message:
          (prc.num ? `Il codice ${effCode} non è presente nel Piano di Manutenzione (documento di collegamento).` : 'La riga non ha codice: nessuna riga del PdM collegabile per codice.') +
          (other.length ? ` Il numero ${effNum} compare come ${other.join(', ')}.` : '') +
          (alt.length ? ` Per testo corrisponde a: ${alt.map((r) => r.codeRaw).join(', ')}.` : byText.length ? ` Per testo corrisponde a righe PdM senza codice (pag. ${byText.map((r) => r.page).join(', ')}).` : ''),
        evidence: [prcEv, ...byText.map((r) => ev('pdm', r.page, `${r.codeRaw ?? '(senza codice)'} | ${r.gruppo ?? ''} | ${r.desc} | cap. ${r.chapter ?? '-'}`, 'PdM tabella generale'))],
      });
    }

    // intervallo: PRC vs Stadler
    if (stadlerItem && prc.interval && stadlerItem.interval !== prc.interval && !pdmRows.length) {
      anomalies.push({
        type: 'interval_mismatch',
        severity: 'warning',
        message: `Intervallo diverso: PRC ${prc.interval}, Manuale Generale ${stadlerItem.interval}.`,
        evidence: [prcEv, ev('stadler', stadlerItem.page, `N. ${stadlerItem.num} (${stadlerItem.interval}) – ${stadlerItem.text}`, 'Manuale Generale cap. 23')],
      });
    }

    // --- 3. riferimento Manuale Generale
    let generalRef: GeneralRef | undefined;
    const stChapters = stadlerItem?.chapters || [];
    const stCh = stChapters.find((c) => !c.startsWith('DGHB'));
    const dghb = stChapters.find((c) => c.startsWith('DGHB'))?.replace(/^DGHB\s*/, '');
    const pdmCh = cleanChapter(pdmParent && isGeneralManual(manualKey(pdmParent.manual || '')) ? pdmParent.chapter : undefined);
    const pdmGenCh = cleanChapter(pdmGeneral[0]?.chapter);
    const pdmSelfCh = cleanChapter(pdmSelf[0]?.stadlerChapter);
    const chosen = cleanChapter(stCh) || (dghb ? '9' : null) || pdmCh || pdmGenCh || pdmSelfCh || (stadlerItem ? null : tableItems[0]?.section) || null;
    if (chosen) {
      const sec = sectionsByNum.get(chosen);
      const tItem =
        tableItems.find((t) => t.section === chosen) ||
        (stadlerItem ? (tableByNum.get(stadlerItem.num) || []).find((t) => t.section === chosen) : undefined);
      const sources: string[] = [];
      if (stCh || dghb) sources.push(`Manuale Generale cap. 23 (pag. ${stadlerItem!.page})`);
      if (!stadlerItem && tItem) sources.push(`Manuale Generale tabella cap. ${tItem.section} (pag. ${tItem.page})`);
      if (pdmCh) sources.push(`PdM scheda (pag. ${pdmParent!.page})`);
      if (pdmGenCh) sources.push(`PdM tabella generale (pag. ${pdmGeneral[0].page})`);
      generalRef = { chapter: chosen, title: sec?.title, page: sec?.page, itemPage: tItem?.page, dghbChapter: dghb, sources };
      const related = (a: string, b: string) => a === b || a.startsWith(b + '.') || b.startsWith(a + '.');
      const others = [pdmCh, pdmGenCh].filter(
        (c): c is string => !!c && !dghb && !related(c, chosen) && !stChapters.some((x) => related(x, c)) && !(c.split(/\s+/).every((y) => stChapters.some((x) => related(x, y)))),
      );
      if (others.length && stCh) {
        anomalies.push({
          type: 'chapter_conflict',
          severity: 'warning',
          message: `Capitolo diverso tra i documenti: Manuale Generale ${chosen}, PdM ${[...new Set(others)].join(' / ')}.`,
          evidence: [
            ev('stadler', stadlerItem!.page, `N. ${stadlerItem!.num} → cap. ${stChapters.join(', ')}`, 'Manuale Generale cap. 23'),
            ...(pdmParent ? [ev('pdm', pdmParent.page, `${pdmParent.codeRaw} → ${pdmParent.manual} cap. ${pdmParent.chapter}`, 'PdM scheda')] : []),
            ...pdmGeneral.slice(0, 1).map((g) => ev('pdm', g.page, `${g.codeRaw} → cap. ${g.chapter}`, 'PdM tabella generale')),
          ],
        });
      }
    }

    // --- 4. organo e manuale organo
    const organRefs: OrganRef[] = [];
    for (const ch of pdmChildren) {
      let manualName = ch.manual || '';
      let inherited = false;
      let chapter = cleanChapter(ch.role === 'child' && !ch.parentCode ? ch.organChapter : ch.chapter);
      if (!manualName && ch.manualInherited) {
        manualName = ch.manualInherited;
        inherited = true;
      }
      if (!manualName && pdmParent?.manual && !isGeneralManual(manualKey(pdmParent.manual))) {
        manualName = pdmParent.manual;
        chapter = chapter || cleanChapter(pdmParent.chapter);
        inherited = true;
      }
      if (!manualName) continue;
      const key = manualKey(manualName);
      organRefs.push({
        pdmRowId: ch.id,
        organName: ch.componente || ch.gruppo || prc.component,
        manualName,
        manualKey: key,
        chapter,
        inherited,
        inGeneralManual: isGeneralManual(key),
        desc: ch.desc,
      });
    }
    if (!organRefs.length && pdmParent && isGeneralManual(manualKey(pdmParent.manual || ''))) {
      organRefs.push({
        pdmRowId: pdmParent.id,
        organName: pdmParent.componente || pdmParent.gruppo || prc.component,
        manualName: pdmParent.manual!,
        manualKey: manualKey(pdmParent.manual!),
        chapter: cleanChapter(pdmParent.chapter),
        inherited: false,
        inGeneralManual: true,
        desc: pdmParent.desc,
      });
    }
    if (!organRefs.length && dghb) {
      organRefs.push({
        pdmRowId: '',
        organName: prc.component,
        manualName: 'BU_1992756_DGHB_FAL Carrelli (Manuale dei carrelli)',
        manualKey: manualKey('BU_1992756_DGHB_FAL_v3.0_ita Carrelli'),
        chapter: dghb,
        inherited: true,
        inGeneralManual: false,
      });
    }
    for (const o of organRefs) {
      if (o.inGeneralManual) {
        o.procedurePage = generalRef?.itemPage || generalRef?.page;
        o.procedureTitle = generalRef ? `Manuale Generale cap. ${generalRef.chapter}` : undefined;
        o.procedureMatch = o.procedurePage ? 'exact' : 'none';
        continue;
      }
      const doc = importedByKey.get(o.manualKey) || [...importedByKey.entries()].find(([k]) => k.length > 6 && (o.manualKey.includes(k) || k.includes(o.manualKey)))?.[1];
      if (!doc) continue;
      o.importedDocId = doc.id;
      const dk = decisions[`${prc.id}|organ|${o.pdmRowId}`];
      if (dk?.overridePage) {
        o.procedurePage = dk.overridePage;
        o.procedureMatch = 'manual';
        o.procedureTitle = 'Pagina indicata dall\'operatore';
        continue;
      }
      const found = findHeading(doc, o.chapter);
      if (found) {
        o.procedurePage = found.h.page;
        o.procedureTitle = `${found.h.num} ${found.h.title}`;
        o.procedureMatch = found.exact ? 'exact' : 'parent';
        if (!found.exact) {
          anomalies.push({
            type: 'organ_chapter_partial',
            severity: 'warning',
            message: `Nel manuale "${doc.title}" non è stato trovato il capitolo ${o.chapter}: indicato il capitolo superiore ${found.h.num}.`,
            evidence: [ev(doc.id, found.h.page, `${found.h.num} ${found.h.title}`, doc.title)],
          });
        }
      } else {
        o.procedureMatch = 'none';
        anomalies.push({
          type: 'organ_chapter_not_found',
          severity: 'error',
          message: `Il capitolo ${o.chapter ?? '(non indicato)'} non è stato trovato nel manuale caricato "${doc.title}".`,
          evidence: [ev('pdm', ds.pdm.find((r) => r.id === o.pdmRowId)?.page || 0, `${o.manualName} cap. ${o.chapter}`, 'PdM')],
        });
      }
    }

    // --- 5. stato
    const errors = anomalies.filter((a) => a.severity === 'error');
    const resolved = decision && (decision.action === 'confirm' || decision.action === 'override');
    const hasErrors = errors.length > 0 && !resolved;
    const hasAny = !!stadlerItem || pdmRows.length > 0 || tableItems.length > 0;
    let status: Status;
    if (hasErrors) status = 'verify';
    else if (!hasAny || !generalRef) status = 'missing';
    else if (organRefs.length && organRefs.every((o) => o.procedurePage)) status = 'complete';
    else status = 'partial';

    if (method === 'nessuno' && stadlerItem) method = 'codice';

    const system = pdmGeneral[0]?.impianto || pdmParent?.impianto || pdmChildren[0]?.impianto || prc.component.split(/\s+/).slice(0, 2).join(' ');
    const organ = pdmGeneral[0]?.gruppo || pdmChildren[0]?.componente || pdmChildren[0]?.gruppo || prc.component;

    links.push({
      prc,
      code,
      system: titleCase(system),
      organ,
      stadlerItem,
      stadlerCandidates: candidates,
      stadlerTableItems: tableItems,
      textScore,
      method,
      confidence,
      pdmGeneral,
      pdmParent,
      pdmChildren,
      generalRef,
      organRefs,
      anomalies,
      status,
      decision,
      reviewOpen: hasErrors && decision?.action !== 'ignore',
    });
  }

  // --- manuali organo attesi (dal PdM)
  const exp = new Map<string, ExpectedManual>();
  for (const r of ds.pdm) {
    const name = r.role === 'child' ? r.manual || r.manualInherited : r.role === 'parent' ? r.manual : undefined;
    if (!name) continue;
    const key = manualKey(name);
    if (!key || key.startsWith('nonpresente')) continue;
    if (!exp.has(key)) exp.set(key, { key, names: [], organs: [], systems: [], pdmRows: 0, prcActivities: 0, inGeneral: isGeneralManual(key) });
    const e = exp.get(key)!;
    if (!e.names.includes(name)) e.names.push(name);
    const org = r.componente || r.gruppo;
    if (org && !e.organs.includes(org)) e.organs.push(org);
    if (r.section && !e.systems.includes(r.section)) e.systems.push(r.section);
    e.pdmRows++;
  }
  for (const l of links) for (const k of new Set(l.organRefs.map((o) => o.manualKey))) if (exp.has(k)) exp.get(k)!.prcActivities++;
  for (const e of exp.values()) e.importedDocId = importedByKey.get(e.key)?.id;

  // --- voci Stadler fino a C7 non presenti nel PRC
  const prcNums = new Set(ds.prc.map((p) => p.num).filter(Boolean) as string[]);
  for (const l of links) if (l.stadlerItem) prcNums.add(l.stadlerItem.num);
  const missingInPrc = items.filter((it) => ['C2', 'C3', 'C4', 'C5', 'C6', 'C7'].includes(it.interval) && !prcNums.has(it.num));

  const stats = { total: links.length, complete: 0, partial: 0, missing: 0, verify: 0, reviewOpen: 0 };
  for (const l of links) {
    stats[l.status]++;
    if (l.reviewOpen) stats.reviewOpen++;
  }

  return {
    links,
    byId: new Map(links.map((l) => [l.prc.id, l])),
    linkRecords: buildLinkRecords(links),
    expectedManuals: [...exp.values()].sort((a, b) => Number(a.inGeneral) - Number(b.inGeneral) || b.prcActivities - a.prcActivities),
    missingInPrc,
    stats,
    itemsByNum,
    sectionsByNum,
  };
}

export function findHeading(doc: ImportedDoc, chapter: string | null): { h: ImportedDoc['headings'][number]; exact: boolean } | null {
  if (!chapter) return null;
  const c = chapter.trim().replace(/\.$/, '');
  const hs = doc.headings;
  const norm = (s: string) => s.toLowerCase().replace(/^(section|sezione|capitolo|cap\.?|chapter|kapitel)\s*/, '').replace(/\.$/, '').trim();
  const target = norm(c);
  // "Section 5-6" → 5
  const first = target.split(/[-–\s]/)[0];
  let h = hs.find((x) => norm(x.num) === target) || hs.find((x) => norm(x.num) === first);
  if (h) return { h, exact: norm(h.num) === target || target.includes('-') };
  const parts = first.split('.');
  while (parts.length > 1) {
    parts.pop();
    h = hs.find((x) => norm(x.num) === parts.join('.'));
    if (h) return { h, exact: false };
  }
  return null;
}

function titleCase(s: string): string {
  const t = (s || '').trim();
  if (!t) return '';
  if (t === t.toUpperCase()) return t.charAt(0) + t.slice(1).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildLinkRecords(links: ActivityLink[]): LinkRecord[] {
  const out: LinkRecord[] = [];
  for (const l of links) {
    const p = l.prc;
    const from = { label: `PRC ${l.code}`, docId: 'prc-c7', page: p.page };
    if (l.stadlerItem)
      out.push({
        id: `${p.id}-st`,
        from,
        to: { label: `Manuale Generale N. ${l.stadlerItem.num} (${l.stadlerItem.interval})`, docId: 'stadler', page: l.stadlerItem.page },
        method: l.method,
        confidence: l.confidence,
        status: l.anomalies.some((a) => a.severity === 'error' && ['code_text_mismatch', 'no_code', 'num_not_found', 'duplicate_code'].includes(a.type)) && !(l.decision && l.decision.action !== 'ignore') ? 'verify' : 'complete',
        prcId: p.id,
      });
    else
      out.push({ id: `${p.id}-st`, from, to: { label: 'Manuale Generale – voce non trovata' }, method: 'nessuno', confidence: 0, status: 'verify', prcId: p.id });
    for (const g of l.pdmGeneral.slice(0, 1))
      out.push({ id: `${p.id}-pg`, from, to: { label: `PdM ${g.codeRaw} (tabella generale)`, docId: 'pdm', page: g.page }, method: 'codice', confidence: 0.9, status: 'complete', prcId: p.id });
    if (l.generalRef)
      out.push({
        id: `${p.id}-gr`,
        from,
        to: { label: `Manuale Generale cap. ${l.generalRef.chapter}${l.generalRef.title ? ' – ' + l.generalRef.title : ''}`, docId: 'stadler', page: l.generalRef.itemPage || l.generalRef.page },
        method: l.generalRef.sources.length > 1 ? 'codice (più fonti)' : 'codice',
        confidence: l.anomalies.some((a) => a.type === 'chapter_conflict') ? 0.6 : 0.95,
        status: l.anomalies.some((a) => a.type === 'chapter_conflict') ? 'verify' : 'complete',
        prcId: p.id,
      });
    for (const o of l.organRefs)
      out.push({
        id: `${p.id}-o-${o.pdmRowId || 'dghb'}`,
        from: { label: `${o.organName}`, docId: 'pdm', page: undefined },
        to: { label: `${o.inGeneralManual ? 'Manuale Generale' : o.manualName}${o.chapter ? ' cap. ' + o.chapter : ''}`, docId: o.inGeneralManual ? 'stadler' : o.importedDocId, page: o.procedurePage },
        method: o.inherited ? 'PdM (ereditato dalla riga padre)' : 'PdM',
        confidence: o.procedureMatch === 'exact' || o.procedureMatch === 'manual' ? 0.95 : o.procedureMatch === 'parent' ? 0.6 : 0.4,
        status: o.procedurePage ? (o.procedureMatch === 'parent' ? 'verify' : 'complete') : o.importedDocId ? 'verify' : 'partial',
        prcId: p.id,
      });
  }
  return out;
}

export const STATUS_META: Record<Status, { label: string; short: string; emoji: string; desc: string }> = {
  complete: { label: 'Completa', short: 'Completa', emoji: '🟢', desc: 'Tutti i collegamenti sono disponibili, fino alla procedura.' },
  partial: { label: 'Parzialmente collegata', short: 'Parziale', emoji: '🟡', desc: 'Riferimento al Manuale Generale presente, manca il manuale specifico o la procedura.' },
  missing: { label: 'Documentazione mancante', short: 'Mancante', emoji: '🔴', desc: 'Non è stato trovato il riferimento necessario.' },
  verify: { label: 'Da verificare', short: 'Da verificare', emoji: '⚠️', desc: 'Corrispondenze trovate ma non certe: serve conferma dell\'operatore.' },
};
