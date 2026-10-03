import re, json, sys, unicodedata
lines=open(sys.argv[1],encoding='utf-8').read().split('\n')
HDR=re.compile(r'Pagina (\d+) / 174')
page=1; L=[]
for ln in lines:
    m=HDR.search(ln)
    if m and 'BU_1992747' in ln:
        page=int(m.group(1)); continue
    L.append((page, ln.rstrip()))
def nrm(s):
    s=unicodedata.normalize('NFKD',s.lower()); s=''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]+',' ',s).strip()
# --- TOC
TOC=re.compile(r'^(\d+(?:\.\d+)*)\s+(.+?)\s*\.{3,}\s*(\d+)\s*$')
toc=[]; toc_end=0
for i,(p,ln) in enumerate(L):
    if p>8: break
    m=TOC.match(ln.strip())
    if m: toc.append({'num':m.group(1),'title':m.group(2).strip(),'tocPage':int(m.group(3))}); toc_end=i
tocmap={t['num']:t for t in toc}
# --- body headings
found={}
for i,(p,ln) in enumerate(L):
    if i<=toc_end: continue
    m=re.match(r'^(\d+(?:\.\d+)*)\s+(.+)$',ln.strip())
    if not m: continue
    n,t=m.group(1),m.group(2)
    if n in tocmap and n not in found:
        tt=nrm(tocmap[n]['title']); bt=nrm(t)
        if (tt[:18]==bt[:18] or bt.startswith(tt[:12]) or tt.startswith(bt[:12])) and abs(p-tocmap[n]['tocPage'])<=1:
            found[n]=(p,i)
sections=[]
for t in toc:
    f=found.get(t['num'])
    sections.append({'num':t['num'],'title':t['title'],'page':t['tocPage'],'bodyPage':f[0] if f else None,'line':f[1] if f else None,
                     'level':t['num'].count('.')+1})
# section of a given line index
sec_starts=sorted([(s['line'],s['num']) for s in sections if s['line'] is not None])
def section_at(i):
    cur=None
    for li,n in sec_starts:
        if li<=i: cur=n
        else: break
    return cur
# --- chapter 23 summary
ch23_start=found['23'][1]
INTV={'23.2.1':'M0','23.2.2':'M4','23.2.3':'M6','23.2.4':'M7','23.3.1':'C2','23.3.2':'P2','23.4.1':'C3','23.4.2':'C4','23.4.3':'C5','23.4.4':'C6','23.4.5':'C7','23.5.1':'R1','23.5.2':'R2','23.5.3':'R3','23.5.4':'EST'}
CAPLINE=re.compile(r'^(DGHB\s*)?(\d+(?:\.\d+)+\.?|\d+\.?)?\s*$')
items23=[]; cur=None; sub=None
def flush():
    global cur
    if not cur: return
    txt=[]; caps=[]
    for x in cur['lines']:
        if x.strip() and CAPLINE.match(x.strip()): caps.append(x.strip())
        else: txt.append(x)
    def okcap(c,prev):
        c=c.strip().rstrip('.')
        return c.startswith('DGHB') or c in tocmap or (prev is not None and prev.strip()=='DGHB')
    keep=[]; bad=[]
    for k,c in enumerate(caps):
        (keep if okcap(c, caps[k-1] if k>0 else None) else bad).append(c)
    if bad and txt and re.search(r'DGHB\s*$',txt[-1]):
        txt[-1]=re.sub(r'DGHB\s*$','',txt[-1]); keep=['DGHB '+bad[0]]+keep; bad=bad[1:]
    caps=keep; txt=txt+bad
    if txt:
        m=re.search(r'\s?((?:DGHB\s*)?\d+(?:\.\d+)+)\s*$',txt[-1])
        if m and okcap(m.group(1),None) and (not caps or m.group(1) not in caps):
            caps=[m.group(1)]+caps; txt[-1]=txt[-1][:m.start()]
    capstr=' '.join(caps)
    capl=re.findall(r'(DGHB\s*)?(\d+(?:\.\d+)*)',capstr)
    cur['chapters']=[('DGHB ' if d else '')+n for d,n in capl]
    cur['text']=re.sub(r'\s+',' ',' '.join(x.strip() for x in txt)).strip()
    cur['raw']='\n'.join(cur.pop('lines'))
    items23.append(cur); cur=None
for i in range(ch23_start,len(L)):
    p,ln=L[i]; s=ln.strip()
    m=re.match(r'^(23\.\d+(?:\.\d+)?)\s',s)
    if m and m.group(1) in tocmap:
        flush(); sub=m.group(1); continue
    if s.startswith('N. Gruppo costruttivo'): flush(); continue
    m=re.match(r'^(\d{3})\s+(.*)$',s)
    if m and sub in INTV:
        flush(); cur={'num':m.group(1),'interval':INTV[sub],'section':sub,'page':p,'lines':[m.group(2)]}; continue
    if cur is not None:
        if s=='' : continue
        cur['lines'].append(s)
flush()
# --- chapter tables in body (chapters 4..22)
body_items=[]; in_table=False
for i in range(toc_end+1,ch23_start):
    p,ln=L[i]; s=ln.strip()
    if re.match(r'^N\.\s',s) and ('Attivit' in s or 'attivit' in s): in_table=True; table_hdr=s; continue
    m=re.match(r'^(\d+(?:\.\d+)*)\s',s)
    if m and m.group(1) in found and found[m.group(1)][1]==i: in_table=False; continue
    if s.startswith('NOTA') or s.startswith('AVVERTENZA') or s.startswith('ATTENZIONE') or s.startswith('PERICOLO'): in_table=False; continue
    if not in_table: continue
    m=re.match(r'^(\d{3})\s+(.*)$',s)
    if m:
        body_items.append({'num':m.group(1),'page':p,'section':section_at(i),'lines':[m.group(2)],'header':table_hdr})
    elif body_items and body_items[-1].get('open',True) and s:
        body_items[-1]['lines'].append(s)
for b in body_items:
    t=' '.join(b.pop('lines')); 
    xs=len(re.findall(r'(?:^|\s)X(?=\s|$)',t))
    t=re.sub(r'(\s+X)+\s*$','',t); t=re.sub(r'\s+X\s+',' ',t)
    b['text']=re.sub(r'\s+',' ',t).strip(); b['xCount']=xs; b.pop('open',None)
# --- page texts (for search / evidence)
pages={}
for p,ln in L: pages.setdefault(p,[]).append(ln)
json.dump({'sections':sections,'items23':items23,'bodyItems':body_items,
           'pages':{k:'\n'.join(v) for k,v in pages.items()}},open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
print('toc',len(toc),'found',len(found),'items23',len(items23),'body',len(body_items))
miss=[s['num'] for s in sections if s['bodyPage'] is None]; print('not found in body',miss)
diff=[(s['num'],s['page'],s['bodyPage']) for s in sections if s['bodyPage'] and s['bodyPage']!=s['page']]; print('page diff',diff)
print('no cap', [(x['num'],x['interval'],x['text'][:50]) for x in items23 if not x['chapters']])
