import zipfile, re, json, subprocess, os, glob, unicodedata
from xml.dom import minidom
B=os.path.join(os.path.dirname(os.path.abspath(__file__)),'saida/geral/'); res=[]
def ok(n,c,i=''): res.append((n,bool(c),'' if c else i))
texto=json.load(open(B+'texto.json'))
def limpa(s):
    s=re.sub(r'[\t ]+',' ',s); s=re.sub(r' {2,}',' ',s); s=re.sub(r' +([,.;:!?])',r'\1',s); return s.strip()
esperados=[limpa(t) for t in texto if limpa(t)]

def docx_pars(p):
    z=zipfile.ZipFile(p)
    for n in z.namelist():
        if n.endswith('.xml') or n.endswith('.rels'): minidom.parseString(z.read(n))
    d=minidom.parseString(z.read('word/document.xml'))
    pars=[]
    for para in d.getElementsByTagName('w:p'):
        t=''.join(x.firstChild.data if x.firstChild else '' for x in para.getElementsByTagName('w:t'))
        jc=para.getElementsByTagName('w:jc'); ind=para.getElementsByTagName('w:ind'); sp=para.getElementsByTagName('w:spacing')
        b=bool(para.getElementsByTagName('w:b'))
        pars.append(dict(t=t,jc=jc[0].getAttribute('w:val') if jc else '',ind=ind[0].getAttribute('w:firstLine') if ind else '',line=sp[0].getAttribute('w:line') if sp else '',b=b,
             font=(para.getElementsByTagName('w:rFonts')[0].getAttribute('w:ascii') if para.getElementsByTagName('w:rFonts') else '')))
    return z,d,pars

for f in sorted(glob.glob(B+'*.docx')):
    try: z,d,p=docx_pars(f); ok(f'{f}: todos os XML bem-formados',True)
    except Exception as e: ok(f'{f}: XML bem-formado',False,str(e)); continue
    ok(f'{f}: logo embutido', 'word/media/logo.png' in z.namelist() and z.getinfo('word/media/logo.png').file_size==os.path.getsize(os.path.join(os.path.dirname(os.path.abspath(__file__)),'../logo.png')))
    ok(f'{f}: tamanho < 200KB', os.path.getsize(f)<200_000, os.path.getsize(f))

z,d,p=docx_pars(B+'dificil.docx')
xml=z.read('word/document.xml').decode()
ok('docx: margens ABNT 3/3/2/2', 'w:top="1701" w:right="1134" w:bottom="1134" w:left="1701"' in xml)
ok('docx: A4', 'w:w="11906" w:h="16838"' in xml)
ok('docx: cabeçalho', [x['t'] for x in p[:5]]==['AVALIAÇÃO DESCRITIVA',p[1]['t'],p[2]['t'],"PROFESSORA: Maria José D'Ávila & Cia",'COORDENADORA: Beatriz <Souza>'], [x['t'] for x in p[:5]])
ok('docx: cabeçalho em Comic Sans', all(x['font']=='Comic Sans MS' for x in p[:6]))
ok('docx: nome caps, negrito, centralizado', p[5]['t']=="ÉRICA JOÃO D'ÁVILA" and p[5]['b'] and p[5]['jc']=='center', p[5])
corpo=p[6:6+1+len(esperados)]
ok('docx: abertura com Érica', 'que Érica apresenta' in corpo[0]['t'])
ok('docx: corpo idêntico ao texto limpo', [c['t'] for c in corpo[1:]]==esperados, [(a['t'],b) for a,b in zip(corpo[1:],esperados) if a['t']!=b][:3])
ok('docx: corpo justificado, recuo 1,25cm, 1,5', all(c['jc']=='both' and c['ind']=='709' and c['line']=='360' for c in corpo))
ok('docx: fecho/assinatura/data', [x['t'] for x in p[-4:]][1:]==['Um abraço!','Maria',p[-1]['t']] and p[-1]['jc']=='right' and p[-1]['t'].startswith('Florianópolis, '), [x['t'] for x in p[-4:]])
ok('docx: emoji/símbolos preservados', any('😀' in c['t'] and '★' in c['t'] for c in corpo))
st=z.read('word/styles.xml').decode()
ok('docx: fonte padrão Times + idioma pt-BR', 'w:ascii="Times New Roman"' in st and 'pt-BR' in st)
for fnt in ['Arial','Cambria']:
    ok(f'docx fonte {fnt}', f'w:ascii="{fnt}"' in zipfile.ZipFile(B+f'fonte-{fnt}.docx').read('word/styles.xml').decode())
_,_,p2=docx_pars(B+'sem-intro.docx')
ok('docx sem abertura: 1º parágrafo é o texto da professora', p2[6]['t']==esperados[0], p2[6]['t'][:60])
ok('docx sem abertura: cabeçalho 2027', p2[1]['t']=='PRIMEIRO SEMESTRE' and p2[2]['t']=='QUINTO ANO 2027', [p2[1]['t'],p2[2]['t']])
_,_,p3=docx_pars(B+'vazio.docx')
ok('docx vazio: placeholders', p3[5]['t']=='NOME DA CRIANÇA')

# LibreOffice abre e converte (proxy para Word)
os.makedirs(os.path.expanduser('~/avtest'),exist_ok=True)
import shutil
for f in ['dificil.docx','sem-intro.docx','vazio.docx']: shutil.copy(B+f, os.path.expanduser('~/avtest/'+f))
r=subprocess.run('cd ~/avtest && timeout 200 libreoffice --headless --convert-to pdf *.docx',shell=True,capture_output=True,text=True)
for f in ['dificil','sem-intro','vazio']:
    pdf=os.path.expanduser(f'~/avtest/{f}.pdf'); ok(f'LibreOffice abre {f}.docx', os.path.exists(pdf))
    if os.path.exists(pdf): shutil.copy(pdf, B+f'lo-{f}.pdf')
shutil.rmtree(os.path.expanduser('~/avtest'))

# PDFs
def norm(s): return re.sub(r'\s+',' ',unicodedata.normalize('NFC',s)).strip()
for f in sorted(glob.glob(B+'*.pdf')):
    if os.path.basename(f).startswith('lo-'): continue
    ok(f'{f}: tamanho < 400KB', os.path.getsize(f)<400_000, os.path.getsize(f))
    info=subprocess.run(['pdfinfo',f],capture_output=True,text=True).stdout
    ok(f'{f}: PDF válido A4', '595.28 x 841.89 pts (A4)' in info, info)
txt=norm(subprocess.run(['pdftotext','-raw',B+'dificil.pdf','-'],capture_output=True,text=True).stdout)
pags=int(re.search(r'Pages:\s+(\d+)',subprocess.run(['pdfinfo',B+'dificil.pdf'],capture_output=True,text=True).stdout).group(1))
ok('pdf: texto longo paginou (>=2 páginas)', pags>=2, pags)
faltando=[e for e in esperados if norm(e) not in txt and 'Emoji' not in e and 'gigante' not in e]
ok('pdf: todos os parágrafos presentes', not faltando, faltando[:3])
ok('pdf: nome e cabeçalho', "ÉRICA JOÃO D'ÁVILA" in txt and 'COORDENADORA: Beatriz <Souza>' in txt)
ok('pdf: caracteres especiais (aspas curvas, travessão, reticências, º ª)', all(c in txt for c in ['“curvas”','‘simples’','—','–','…','2º','1ª','R$ 5,00']), txt[txt.find('Segundo'):txt.find('Segundo')+160])
ok('pdf: fecho e data', 'Um abraço!' in txt and 'Florianópolis, ' in txt)
em=txt[txt.find('Emoji'):txt.find('Emoji')+40]
ok('pdf: símbolos suportados mantidos, sem lixo', em.startswith('Emoji e símbolos e € • ° ½.'), em)
ok('pdf: url longa inteira', 'mesmo/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' in txt.replace(' ',''), txt[txt.find('gigante'):txt.find('gigante')+200])
fonts=subprocess.run(['pdffonts',B+'dificil.pdf'],capture_output=True,text=True).stdout
ok('pdf: Comic Neue embutida no cabeçalho', 'ComicNeue' in fonts)
ok('pdf fallback sem internet usa Helvetica', 'ComicNeue' not in subprocess.run(['pdffonts',B+'fallback.pdf'],capture_output=True,text=True).stdout)
for n,c,i in res: print(('PASS ' if c else 'FAIL ')+n+('' if c else f'  -> {i}'))
print(f"\n{sum(c for _,c,_ in res)}/{len(res)} passaram")
