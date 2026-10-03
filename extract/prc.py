import pdfplumber, re, json, sys
CODE=re.compile(r'^C[\dxX]-(\d{3}|XXX)$')
def col(x):
    if x<75: return 'code'
    if x<138: return 'comp'
    if x<240: return 'act'
    if x<262: return 'os'
    if x<326: return 'report'
    if x<376: return 'tools'
    if x<430: return 'dates'
    if x<472: return 'compet'
    return 'sign'
rows=[]
with pdfplumber.open(sys.argv[1]) as pdf:
    for pi,pg in enumerate(pdf.pages):
        words=pg.extract_words(keep_blank_chars=False, use_text_flow=False)
        # body area: after header row (top>125) and before footer 'Data: Emesso'
        foot=min([w['top'] for w in words if (w['text']=='Emesso' or (w['text']=='Le' and w['x0']<75)) and w['top']>300] or [9999])
        body=[w for w in words if 125<w['top']<foot-2]
        starts=sorted([w for w in body if w['x0']<75 and CODE.match(w['text'])], key=lambda w:w['top'])
        # yellow highlight rects
        hl=[r for r in pg.rects if r.get('non_stroking_color') and tuple(r['non_stroking_color'])==(1.0,1.0,0.0)]
        for i,s in enumerate(starts):
            top=s['top']-3; bot=(starts[i+1]['top']-3) if i+1<len(starts) else foot
            ws=[w for w in body if top<=w['top']<bot]
            cells={}
            for w in sorted(ws,key=lambda w:(round(w['top']),w['x0'])):
                cells.setdefault(col(w['x0']),[]).append(w['text'])
            r={k:' '.join(v) for k,v in cells.items()}
            r['page']=pi+1
            r['top']=round(s['top'])
            r['highlight']=any(h['top']<=s['top']+2 and h['bottom']>=s['top']-2 for h in hl)
            rows.append(r)
json.dump(rows,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
print(len(rows))
