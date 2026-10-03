# Manutenzione FAL – Piattaforma documentazione

App web per consultare i piani di manutenzione dei treni Stadler FAL (SB, SBT, ST1–ST6). Segue la catena dei documenti:

**PRC C7 → documento di collegamento (PdM) → Manuale Generale → organo → manuale dell'organo → procedura**

## Riservatezza

Questo repository contiene **solo il programma**. Documenti, dati estratti e decisioni dell'operatore restano nel browser del dispositivo (IndexedDB) e non passano da nessun server. Il `.gitignore` esclude PDF e pacchetti dati.

## Uso

1. Apri l'app pubblicata su GitHub Pages.
2. Al primo avvio carica il **pacchetto dati** (`dati_manutenzione_FAL.json`) e, se vuoi vedere le pagine originali, i PDF di PRC C7, Trasmissione PdM e Manuale Generale. Li riconosce da solo.
3. Aggiungi i manuali degli organi da **Manuali → Aggiungi documento**: l'app individua capitoli e paragrafi, propone a quale manuale del PdM corrisponde il file e aggiorna i collegamenti.

## Regole di affidabilità

- Un collegamento è certo solo se **codice e descrizione** concordano.
- Le incongruenze tra documenti sono marcate **⚠️ Da verificare**, con documento, pagina e testo originale. L'app non le corregge da sola.
- Le decisioni dell'operatore (Conferma / Modifica / Ignora) sono registrate e si possono annullare.

## Sviluppo

```bash
npm install
npm run build        # genera docs/ (pubblicata da GitHub Pages)
npx tsx scripts/test-engine.ts percorso/dati_manutenzione_FAL.json
```

- Stack: React 19 + TypeScript, Tailwind CSS 4, esbuild, pdf.js.
- `extract/`: script Python (pdfplumber) che generano il pacchetto dati da PRC, PdM e Manuale Generale. Vanno rieseguiti quando cambia la revisione di uno di questi documenti.
