"""Builds the data package (dataset JSON) from the three source documents.
Usage: python3 build_seed.py <PRC.pdf> <PdM.pdf> <stadler.txt> <out.json>
Every record keeps document id + page (+ raw text) for traceability."""
import json, re, sys, hashlib, subprocess, pdfplumber, datetime, unicodedata
prc_pdf, pdm_pdf, st_txt, out = sys.argv[1:5]
here = __file__.rsplit('/',1)[0]
def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()
def run(script,*a): subprocess.check_call(['python3',f'{here}/{script}',*a])
run('prc.py',prc_pdf,'/tmp/_prc.json'); run('pdm.py',pdm_pdf,'/tmp/_pdm.json'); run('stadler.py',st_txt,'/tmp/_st.json')
prc_raw=json.load(open('/tmp/_prc.json')); pdm_raw=json.load(open('/tmp/_pdm.json')); st=json.load(open('/tmp/_st.json'))
PUA=re.compile('[-]')
def cl(s): return re.sub(r'\s+',' ',PUA.sub(' ',s or '')).strip()
def pagetexts(p):
    with pdfplumber.open(p) as pdf: return {str(i+1):(pg.extract_text() or '') for i,pg in enumerate(pdf.pages)}, len(pdf.pages)
prc_pages,prc_n=pagetexts(prc_pdf); pdm_pages,pdm_n=pagetexts(pdm_pdf)
CODE=re.compile(r'^(C\d|Cx|M\d|R\d)-(\d{3}|XXX)(?:-(\d{3}))?$', re.I)
# ---------- PRC
prc=[]
for i,r in enumerate(prc_raw):
    code=r['code'].strip(); m=CODE.match(code)
    prc.append({'id':f'prc-{i+1:04d}','row':i+1,'codeRaw':code,
        'interval':m.group(1).upper().replace('CX','Cx') if m else None,'num':(m.group(2) if m and m.group(2).isdigit() else None),
        'component':cl(r.get('comp')),'activity':cl(r.get('act')),'os':cl(r.get('os')) or None,
        'report':cl(r.get('report')) or None,'tools':cl(r.get('tools')) or None,'compet':cl(r.get('compet')) or None,
        'page':r['page'],'highlight':r['highlight']})
# ---------- PdM
pdm=[]; last_parent=None; motor_manual=None
for i,r in enumerate(pdm_raw):
    code=r.get('codeFull'); m=CODE.match(code) if code else None
    if m: m=CODE.match(code.upper().replace('CX-','Cx-'))
    rec={'id':f'pdm-{i+1:04d}','row':i+1,'page':r['page'],'section':r['section'],'codeRaw':code,
         'interval':m.group(1) if m else None,'num':m.group(2) if m else None,'childNum':m.group(3) if m else None}
    for k in ('impianto','id','gruppo','componente','desc','manual','chapter','stadlerChapter','organChapter','time','km','rotabile','category','mestiere','compet','competDesc'):
        v=cl(r.get(k))
        if v and v not in ('- - -',): rec['idRef' if k=='id' else k]=v
    if r['section']=='GENERALE':
        rec['role']='general' if m else 'uncoded'
    elif r['section']=='MOTORE DIESEL':
        # columns: Capitolo Manuale Stadler | Manuale Sottoassieme | Capitolo Manuale Sott.
        if m and m.group(2)=='000':
            motor_manual=rec.get('manual'); rec['role']='header'
        else:
            rec['role']='child' if m else 'uncoded'
            if rec.get('manual') and rec['manual'].lower().startswith('section'):
                rec['organChapter']=rec.get('organChapter') or rec['manual']; rec['manualInherited']=motor_manual; rec.pop('manual')
            if rec.get('stadlerChapter'): rec['chapter']=rec['stadlerChapter']
    elif m and m.group(3):
        rec['role']='child'; rec['parentCode']=f'{m.group(1)}-{m.group(2)}'
    elif m:
        rec['role']='parent'; last_parent=rec
    else:
        # parent row whose code cell was not extracted: it is followed by its children
        rec['role']='parent-nocode' if rec.get('manual') and not rec.get('componente') else 'uncoded'
    pdm.append(rec)
# parent rows without code: infer from the following child (kept explicit as inference)
for i,rec in enumerate(pdm):
    if rec['role']=='parent-nocode':
        nxt=next((x for x in pdm[i+1:i+3] if x['role']=='child'),None)
        if nxt:
            rec['role']='parent'; rec['codeInferredFrom']=nxt['id']
            rec['interval']=nxt['interval']; rec['num']=nxt['num']; rec['codeRaw']=None
        else: rec['role']='uncoded'
# ---------- General manual (Stadler)
sections=[{'num':s['num'],'title':cl(s['title']),'page':s['page'],'level':s['level']} for s in st['sections']]
items=[{'id':f'st23-{i+1:04d}','num':x['num'],'interval':x['interval'],'summarySection':x['section'],'chapters':x['chapters'],
        'text':cl(x['text']),'raw':x['raw'],'page':x['page']} for i,x in enumerate(st['items23'])]
titems=[{'id':f'stt-{i+1:04d}','num':x['num'],'section':x['section'],'page':x['page'],'text':cl(x['text']),'header':cl(x['header'])} for i,x in enumerate(st['bodyItems'])]
abbr=[]
pg=[ln for k in ('10','11') for ln in st['pages'][k].split('\n')]
on=False
for ln in pg:
    s=ln.strip()
    if s.startswith('Abbreviazione Concetto'): on=True; continue
    if s.startswith('1.5'): on=False
    if on and s:
        m=re.match(r'^(\S+)\s+(.+)$',s)
        if m: abbr.append({'abbr':m.group(1),'meaning':m.group(2),'page':10 if s in st['pages']['10'] else 11})
docs=[
 {'id':'prc-c7','kind':'prc','title':'PRC C7 – Piano di Riparazione e Controllo biennale','docCode':'23.4.5/C7-000/MP','revision':'01',
  'fileName':'PRC C7.pdf','pageCount':prc_n,'sha256':sha(prc_pdf),'signature':['23.4.5/C7-000/MP','PIANO DI RIPARAZIONE E CONTROLLO']},
 {'id':'pdm','kind':'link','title':'Piano di Manutenzione Complessi Stadler (Trasmissione PdM e PRC)','docCode':'220101','revision':'REV03',
  'fileName':'220101_Trasmissione PdM e PRC solo stadler.pdf','pageCount':pdm_n,'sha256':sha(pdm_pdf),'signature':['PIANO DI MANUTENZIONE COMPLESSI STADLER']},
 {'id':'stadler','kind':'general','title':'Manuale di manutenzione Stadler FAL (Manuale Generale)','docCode':'BU_1992747','revision':'v2.2 – 06/02/2019',
  'fileName':'BU_1992747_IHHB_FAL_v2.2_ita_20190206.pdf','pageCount':174,'sha256':None,'signature':['BU_1992747'],
  'pageNote':'Numeri di pagina presi dall\'intestazione "Pagina X / 174" del manuale.'},
]
data={'schema':1,'generatedAt':datetime.datetime.now().isoformat(timespec='seconds'),'generator':'extract/build_seed.py v1',
      'documents':docs,'prc':prc,'pdm':pdm,
      'general':{'docId':'stadler','sections':sections,'items':items,'tableItems':titems,'abbreviations':abbr},
      'pageTexts':{'prc-c7':prc_pages,'pdm':pdm_pages,'stadler':st['pages']}}
json.dump(data,open(out,'w'),ensure_ascii=False)
print('prc',len(prc),'pdm',len(pdm),'sections',len(sections),'items',len(items),'tableItems',len(titems),'abbr',len(abbr))
import collections; print(collections.Counter(r['role'] for r in pdm))
