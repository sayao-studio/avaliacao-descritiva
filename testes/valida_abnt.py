import os
import subprocess, re, os, shutil, json, zipfile
from xml.etree import ElementTree as ET
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'saida/digitacao/'); res=[]
def ok(n,c,i=''): res.append((n,bool(c),'' if c else i))
MM=72/25.4
ESQ, DIR, TOPO, BASE = 30*MM, (210-20)*MM, 30*MM, (297-20)*MM
RECUO=12.5*MM

# DOCX -> PDF via LibreOffice (renderização do Word)
os.makedirs(os.path.expanduser('~/avtest'),exist_ok=True)
for f in ['abnt.docx','abnt-arial.docx']: shutil.copy(D+f, os.path.expanduser('~/avtest/'+f))
subprocess.run('cd ~/avtest && timeout 200 libreoffice --headless --convert-to pdf *.docx',shell=True,capture_output=True)
for f in ['abnt','abnt-arial']: shutil.copy(os.path.expanduser(f'~/avtest/{f}.pdf'), D+f'lo-{f}.pdf')
shutil.rmtree(os.path.expanduser('~/avtest'))

def linhas(pdf):
    x=subprocess.run(['pdftotext','-bbox-layout',pdf,'-'],capture_output=True,text=True).stdout
    x=re.sub(r'<!DOCTYPE[^>]*>','',x); root=ET.fromstring(x)
    ns={'h':'http://www.w3.org/1999/xhtml'}
    out=[]
    for pi,pg in enumerate(root.iter('{http://www.w3.org/1999/xhtml}page')):
        for ln in pg.iter('{http://www.w3.org/1999/xhtml}line'):
            ws=[w for w in ln.iter('{http://www.w3.org/1999/xhtml}word')]
            out.append(dict(p=pi,x0=float(ln.get('xMin')),x1=float(ln.get('xMax')),y0=float(ln.get('yMin')),y1=float(ln.get('yMax')),t=' '.join(w.text or '' for w in ws),
                h=max(float(w.get('yMax'))-float(w.get('yMin')) for w in ws)))
    return out

esperado=json.load(open(D+'esperado.json'))['corpo']
for nome in ['abnt.pdf','lo-abnt.pdf','abnt-arial.pdf','lo-abnt-arial.pdf']:
    L=linhas(D+nome); rot=f'[{nome}]'
    info=subprocess.run(['pdfinfo',D+nome],capture_output=True,text=True).stdout
    ok(f'{rot} papel A4', '(A4)' in info)
    # separa cabeçalho (linhas à esquerda do logo, antes do nome) e corpo
    i_nome=next(i for i,l in enumerate(L) if l['t'].startswith('MARIA EDUARDA'))
    cab=L[:i_nome]; nomeL=L[i_nome]; corpo=[l for l in L[i_nome+1:]]
    ok(f'{rot} cabeçalho começa na margem esquerda 3 cm', all(abs(l['x0']-ESQ)<1.5 for l in cab if 'AVALIA' in l['t'] or 'PROFESSORA' in l['t']), [round(l['x0']/MM,1) for l in cab])
    ok(f'{rot} margem superior 3 cm', abs(L[0]['y0']-TOPO)<4, round(L[0]['y0']/MM,2))
    ok(f'{rot} nome centralizado na mancha', abs((nomeL['x0']+nomeL['x1'])/2-(ESQ+DIR)/2)<2, round((nomeL['x0']+nomeL['x1'])/2/MM,1))
    data=corpo[-1]
    ok(f'{rot} data alinhada à direita (margem 2 cm)', abs(data['x1']-DIR)<1.5 and data['t'].startswith('Florianópolis'), (data['t'],round(data['x1']/MM,2)))
    corpo=corpo[:-1]
    ok(f'{rot} nenhuma linha passa da margem direita 2 cm', max(l['x1'] for l in corpo)<=DIR+0.8, round(max(l['x1'] for l in corpo)/MM,2))
    ok(f'{rot} nenhuma linha antes da margem esquerda 3 cm', min(l['x0'] for l in corpo)>=ESQ-0.8, round(min(l['x0'] for l in corpo)/MM,2))
    ok(f'{rot} margem inferior 2 cm respeitada', max(l['y1'] for l in L)<=BASE+1, round(max(l['y1'] for l in L)/MM,2))
    # parágrafos: 1ª linha recuada 1,25 cm
    primeiras=[l for l in corpo if abs(l['x0']-(ESQ+RECUO))<1.5]
    demais=[l for l in corpo if abs(l['x0']-ESQ)<1.5]
    ok(f'{rot} toda linha é recuo (1,25 cm) ou margem', len(primeiras)+len(demais)==len(corpo), [ (round(l['x0']/MM,2),l['t'][:20]) for l in corpo if l not in primeiras and l not in demais][:4])
    npar=len(esperado)-1  # sem a data
    ok(f'{rot} nº de parágrafos com recuo = esperado', len(primeiras)==npar, (len(primeiras),npar))
    # justificado: linhas que não são última do parágrafo terminam na margem direita
    ultimas=set()
    for i,l in enumerate(corpo):
        prox=corpo[i+1] if i+1<len(corpo) else None
        if prox is None or prox in primeiras: ultimas.add(i)
    just=[l for i,l in enumerate(corpo) if i not in ultimas]
    tortas=[(round(l['x1']/MM,2),l['t'][:30]) for l in just if abs(l['x1']-DIR)>1.2]
    ok(f'{rot} justificado: {len(just)} linhas cheias terminam na margem direita', not tortas, tortas[:4])
    # entrelinha 1,5 (≈ 1,5 × 1,15 × 12 pt = 20,7 pt) medida entre linhas consecutivas da mesma página
    gaps=[corpo[i+1]['y0']-corpo[i]['y0'] for i in range(len(corpo)-1) if corpo[i]['p']==corpo[i+1]['p'] and corpo[i+1] not in primeiras or (corpo[i]['p']==corpo[i+1]['p'] and corpo[i+1] in primeiras)]
    gaps=[g for g in gaps if 0<g<40]
    med=sorted(gaps)[len(gaps)//2]
    ok(f'{rot} entrelinha 1,5 (mediana {med:.1f} pt)', 19<=med<=22.5, med)
    # fonte 12 pt: altura das palavras
    hs=sorted(l['h'] for l in corpo); hm=hs[len(hs)//2]
    ok(f'{rot} corpo em ~12 pt (altura da caixa {hm:.1f})', 10.5<=hm<=15, hm)
    txt=' '.join(l['t'] for l in L)
    ok(f'{rot} sem hífen oculto/caracteres estranhos', '­' not in txt and '�' not in txt)
    ok(f'{rot} páginas: {max(l["p"] for l in L)+1}', True)

# DOCX estrutural
z=zipfile.ZipFile(D+'abnt.docx'); x=z.read('word/document.xml').decode()
ok('[docx] pgMar 3/2/2/3 cm', 'w:top="1701" w:right="1134" w:bottom="1134" w:left="1701"' in x)
ok('[docx] todos os parágrafos do corpo: both/709/360', x.count('w:line="360" w:lineRule="auto"/><w:ind w:firstLine="709"/><w:jc w:val="both"/>')==len(esperado)-1, x.count('w:firstLine="709"'))
ok('[docx] fonte 12 pt (sz=24) em todos os trechos', all('w:sz w:val="24"' in r for r in __import__('re').findall(r'<w:r>.*?</w:r>',x,__import__('re').S) if '<w:t' in r))
ok('[docx] idioma pt-BR (corretor do Word)', 'pt-BR' in z.read('word/styles.xml').decode())
for n,c,i in res: print(('PASS ' if c else 'FAIL ')+n+('' if c else f'  -> {i}'))
print(f"\n{sum(c for _,c,_ in res)}/{len(res)} passaram")
