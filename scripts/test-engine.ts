// Verifiche del motore dei collegamenti sul pacchetto dati reale.
// Uso: npx tsx scripts/test-engine.ts percorso/dati_manutenzione_FAL.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildModel } from '../src/lib/engine';
import { SearchIndex } from '../src/lib/search';

const file = process.argv[2];
if (!file) { console.error('Indica il file del pacchetto dati'); process.exit(1); }
const ds = JSON.parse(fs.readFileSync(file, 'utf8'));
const m = buildModel(ds, [], {});
const get = (code: string) => m.links.filter((l) => l.code === code);
const types = (code: string) => get(code).flatMap((l) => l.anomalies.map((a) => a.type));

assert.equal(m.stats.total, ds.prc.length);
// collegamento pulito: codice + testo concordano
const c6023 = get('C6-023')[0];
assert.equal(c6023.method, 'codice+testo');
assert.equal(c6023.generalRef?.chapter, '4.5.1');
assert.equal(c6023.generalRef?.itemPage, 36);
assert.ok(c6023.organRefs.some((o) => o.chapter === '8'));
// incongruenze note dei documenti → mai verde
for (const c of ['C5-929', 'C7-932', 'C3-577', 'C5-586', 'C4-234']) assert.ok(types(c).includes('code_text_mismatch'), c);
assert.equal(get('C5-929')[0].anomalies.find((a) => a.suggestion)?.suggestion?.num, '928');
assert.ok(types('C3-542').includes('duplicate_code'));
assert.ok(types('Cx-XXX').includes('no_code'));
assert.ok(types('C6-311').includes('chapter_conflict'));
// decisione operatore: modifica → collegamento risolto
const m2 = buildModel(ds, [], { 'prc-0054': { key: 'prc-0054', action: 'override', overrideNum: '928', at: '' } });
const l54 = m2.byId.get('prc-0054')!;
assert.equal(l54.code, 'C5-929');
assert.equal(l54.stadlerItem?.num, '928');
assert.notEqual(l54.status, 'verify');
// ricerca tollerante
const idx = new SearchIndex(ds, m, []);
assert.ok(idx.search('riscaldatori')[0].doc.title.length > 0);
assert.equal(idx.search('C6-023')[0].doc.code, 'C6-023');
assert.ok(idx.search('tergicristalo').some((h) => h.doc.kind === 'prc'));
console.log('OK', m.stats);
