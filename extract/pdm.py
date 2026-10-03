import pdfplumber, re, json, sys
CODE=re.compile(r'\b([CMR]\d|Cx)-(\d{3}|XXX)(?:-(\d{3}))?\b', re.I)
def norm(h):
    h=(h or '').replace('\n',' ').lower().strip()
    if h=='impianto': return 'impianto'
    if h=='id': return 'id'
    if h.startswith('gp'): return 'gruppo'
    if h=='componente': return 'componente'
    if h.startswith('cod'): return 'code'
    if h=='descrizione competenza': return 'competDesc'
    if h.startswith('descrizione'): return 'desc'
    if h=='capitolo manuale stadler': return 'stadlerChapter'
    if 'manualoe' in h or 'manuale sott' in h and 'capitolo' in h: return 'organChapter'
    if h.startswith('capitolo'): return 'chapter'
    if h.startswith('manuale'): return 'manual'
    if h.startswith('tempo'): return 'time'
    if h.startswith('percorrenz'): return 'km'
    if 'otabile' in h: return 'rotabile'
    if 'categoria' in h: return 'category'
    if h.startswith('mestiere'): return 'mestiere'
    if h.startswith('competenza'): return 'compet'
    return None
def clean(s): return re.sub(r'\s+',' ',(s or '').replace('\n',' ')).strip()
out=[]
section='GENERALE'
with pdfplumber.open(sys.argv[1]) as pdf:
    for pi,pg in enumerate(pdf.pages):
        txt=pg.extract_text() or ''
        m=re.search(r'^\(([^)]+)\)\s*$',txt,re.M)
        if m: section=m.group(1).strip()
        for t in pg.extract_tables():
            hdr=None
            for row in t:
                if row and clean(row[0])=='Impianto':
                    hdr=[norm(c) for c in row]; continue
                if hdr is None or not any(clean(c) for c in row): continue
                rec={}
                for k,c in zip(hdr,row):
                    if k and clean(c): rec[k]=clean(c)
                codecell=rec.get('code','')
                m=CODE.search(codecell)
                if not m:
                    # code may sit in another cell
                    for k in ('desc','componente'):
                        m2=CODE.search(rec.get(k,''))
                        if m2: m=m2; codecell=rec[k]; break
                if m:
                    rec['codeFull']=m.group(0)
                    rest=clean(CODE.sub('',codecell,count=1))
                    if rest and 'desc' not in rec: rec['desc']=rest
                    elif rest and rec.get('code')==codecell and rest not in rec.get('desc',''): rec['desc']=(rest+' '+rec.get('desc','')).strip()
                rec['page']=pi+1
                rec['section']='GENERALE' if pi<11 else section
                rec.pop('code',None)
                out.append(rec)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
print(len(out), sum(1 for r in out if 'codeFull' in r))
