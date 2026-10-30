import { chromium } from 'playwright-core';
import fs from 'node:fs';

const S = new URL('./saida/geral/', import.meta.url).pathname;
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S, { recursive: true });
const URL_SITE = 'file://' + new URL('../index.html', import.meta.url).pathname;
const HOJE = new Date();
const ISO = `${HOJE.getFullYear()}-${String(HOJE.getMonth() + 1).padStart(2, '0')}-${String(HOJE.getDate()).padStart(2, '0')}`;

const res = [];
const ok = (nome, cond, info = '') => res.push({ nome, ok: !!cond, info: cond ? '' : JSON.stringify(info) });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
await page.addInitScript(() => {
  window.__resp = true; window.__dlg = [];
  window.confirm = (m) => { window.__dlg.push(m); return window.__resp; };
  window.alert = (m) => { window.__dlg.push('ALERT: ' + m); };
});
const resp = (v) => page.evaluate((v) => { window.__resp = v; }, v);
const baixar = async (btn, nome, p = page) => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click(btn)]);
  await dl.saveAs(S + nome);
  return dl.suggestedFilename();
};
const val = (id) => page.inputValue(id);

await page.goto(URL_SITE);
await page.evaluate(() => localStorage.clear());
await page.reload();

// ---- 1. estado inicial e automáticos
const semHoje = HOJE.getMonth() + 1 <= 6 ? 'PRIMEIRO SEMESTRE' : 'SEGUNDO SEMESTRE';
ok('data inicial = hoje', (await val('#data')) === ISO, await val('#data'));
ok('semestre inicial pela data de hoje', (await val('#semestre')) === semHoje, await val('#semestre'));
ok('ano inicial = ano atual', (await val('#ano')) === String(HOJE.getFullYear()));
ok('série padrão 2º ano', (await val('#serie')) === '2');
ok('fonte padrão Times', (await val('#fonte')) === 'Times New Roman');
ok('abertura marcada por padrão', await page.isChecked('#usar-intro'));
ok('configurações abertas quando não há professora', await page.$eval('#config', (d) => d.open));
const casos = { '2027-01-15': 'PRIMEIRO', '2027-05-31': 'PRIMEIRO', '2027-06-30': 'PRIMEIRO', '2027-07-01': 'SEGUNDO', '2027-12-10': 'SEGUNDO', '2031-02-01': 'PRIMEIRO' };
for (const [dt, esp] of Object.entries(casos)) {
  await page.fill('#data', dt);
  ok(`semestre para ${dt}`, (await val('#semestre')) === `${esp} SEMESTRE`, await val('#semestre'));
  ok(`ano para ${dt}`, (await val('#ano')) === dt.slice(0, 4), await val('#ano'));
}
await page.selectOption('#semestre', 'PRIMEIRO SEMESTRE');
ok('semestre editável manualmente', (await val('#semestre')) === 'PRIMEIRO SEMESTRE');
await page.click('#btn-novo');
ok('nova criança volta pra data de hoje', (await val('#data')) === ISO);

// ---- 2. caso difícil
await page.fill('#professora', "Maria José D'Ávila & Cia");
await page.fill('#coordenadora', 'Beatriz <Souza>');
await page.fill('#cidade', 'Florianópolis');
await page.fill('#nome', "  érica   joão d'ávila  ");
const texto = [
  '\t\t   Primeiro parágrafo com   espaços  duplos , vírgula solta e tab\taqui .',
  '', '', '   ',
  'Segundo: caracteres XML & < > " \' e aspas “curvas” ‘simples’ — travessão – meia-risca… reticências, 2º, 1ª, R$ 5,00, 50%.',
  'Palavra gigante: https://www.exemplo.com.br/uma/url/muito/longa/que/nao/cabe/numa/linha/de/jeito/nenhum/mesmo/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'Emoji 😀 e símbolos ✓ ★ ẽ € • ° ½.',
];
for (let i = 0; i < 40; i++) texto.push(`Parágrafo longo número ${i} para testar paginação e completude do texto gerado pelo site.`);
fs.writeFileSync(S + 'texto.json', JSON.stringify(texto));
await page.fill('#texto', texto.join('\n'));
await page.waitForTimeout(800);
const pv = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('#prev-corpo p')].map((p) => p.textContent);
  return { aluno: document.getElementById('prev-aluno').textContent, n: ps.length, ps, intro: document.getElementById('intro-previa').textContent, cab: document.getElementById('prev-cab').innerText };
});
ok('prévia: nome em caixa alta e espaços normalizados', pv.aluno === "ÉRICA JOÃO D'ÁVILA", pv.aluno);
ok('prévia: primeiro nome capitalizado na abertura', pv.intro.includes('que Érica apresenta'), pv.intro.slice(-200));
ok('prévia: série na abertura', pv.intro.includes('rotina do 2º ano'));
ok('prévia: limpeza de espaços/tabs/pontuação', pv.ps[1] === 'Primeiro parágrafo com espaços duplos, vírgula solta e tab aqui.', pv.ps[1]);
ok('prévia: linhas em branco ignoradas (1 abertura + 44 + 2 fecho + assinatura + data)', pv.n === 1 + 44 + 2 + 1 + 1, pv.n);
ok('prévia: assinatura = 1º nome da professora', pv.ps.at(-2) === 'Maria', pv.ps.at(-2));
ok('prévia: linha de data', pv.ps.at(-1) === `Florianópolis, ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(HOJE)}.`, pv.ps.at(-1));
ok('prévia: cabeçalho', pv.cab.includes('SEGUNDO ANO') && pv.cab.includes('PROFESSORA: Maria José') && pv.cab.includes('COORDENADORA: Beatriz <Souza>'), pv.cab);
ok('prévia: XML escapado (sem HTML injetado)', await page.$$eval('#prev-cab rodrigues', (e) => e.length) === 0);
const contador = await page.textContent('#contador');
ok('aviso de caracteres sem suporte no PDF', (await page.textContent('#aviso-pdf')).includes('😀') && !(await page.$eval('#aviso-pdf', (e) => e.hidden)));
ok('contador de parágrafos', contador.includes('44 parágrafo'), contador);

const arqDocx = await baixar('#btn-docx', 'dificil.docx');
const arqPdf = await baixar('#btn-pdf', 'dificil.pdf');
ok('nome do arquivo docx', arqDocx === `Avaliação ${semHoje.startsWith('P') ? '1º' : '2º'} semestre ${HOJE.getFullYear()} - ÉRICA JOÃO D'ÁVILA.docx`, arqDocx);
ok('nome do arquivo pdf', arqPdf.endsWith("ÉRICA JOÃO D'ÁVILA.pdf"), arqPdf);

// ---- 3. fontes
for (const f of ['Arial', 'Cambria']) {
  await page.selectOption('#fonte', f);
  await baixar('#btn-docx', `fonte-${f}.docx`);
  await baixar('#btn-pdf', `fonte-${f}.pdf`);
}
await page.selectOption('#fonte', 'Times New Roman');

// ---- 4. sem abertura, 5º ano, 1º semestre 2027
await page.uncheck('#usar-intro');
await page.selectOption('#serie', '5');
await page.fill('#data', '2027-03-10');
const cab2 = await page.evaluate(() => document.getElementById('prev-cab').innerText);
ok('cabeçalho 5º ano 2027 1º sem', cab2.includes('PRIMEIRO SEMESTRE') && cab2.includes('QUINTO ANO 2027'), cab2);
await baixar('#btn-docx', 'sem-intro.docx');
await baixar('#btn-pdf', 'sem-intro.pdf');
await page.check('#usar-intro');
await page.selectOption('#serie', '2');
await page.waitForTimeout(800);

// ---- 5. persistência
await page.reload();
ok('persiste professora', (await val('#professora')) === "Maria José D'Ávila & Cia");
ok('persiste série', (await val('#serie')) === '2');
ok('persiste rascunho: nome', (await val('#nome')) === "érica   joão d'ávila", await val('#nome'));
ok('persiste rascunho: texto', (await val('#texto')) === texto.join('\n'));
ok('persiste rascunho: data do rascunho', (await val('#data')) === '2027-03-10', await val('#data'));
ok('config fechada quando já tem professora', !(await page.$eval('#config', (d) => d.open)));
ok('textarea cresceu com o texto', (await page.$eval('#texto', (t) => t.offsetHeight)) > 600);

// ---- 6. nome vazio
await page.click('#btn-novo');
await page.waitForTimeout(700);
ok('nova criança sem digitar não cria rascunho', (await page.$$('[data-abrir]')).length === 1);
await resp(false);
let baixou = 0;
const h = () => baixou++;
page.on('download', h);
await page.click('#btn-docx'); await page.click('#btn-pdf'); await page.waitForTimeout(1500);
page.off('download', h);
ok('nome vazio + cancelar = não baixa', baixou === 0, baixou);
await resp(true);
const vz = await baixar('#btn-docx', 'vazio.docx');
await baixar('#btn-pdf', 'vazio.pdf');
ok('nome vazio + confirmar = baixa "SEM NOME"', vz.includes('SEM NOME'), vz);

// ---- 7. rascunhos
await page.fill('#nome', 'Zé'); await page.fill('#texto', 'Texto do Zé.'); await page.waitForTimeout(800);
ok('dois rascunhos', (await page.$$('[data-abrir]')).length === 2);
await page.click('[data-abrir]:has-text("érica")');
ok('trocar rascunho carrega nome', (await val('#nome')).includes('érica'));
ok('trocar rascunho carrega texto', (await val('#texto')) === texto.join('\n'));
await page.click('[data-abrir]:has-text("Zé")');
ok('volta pro Zé com texto dele', (await val('#texto')) === 'Texto do Zé.');
await page.click('[data-abrir]:has-text("érica")');
await resp(false); await page.click('.chip:has-text("Zé") [data-remover]');
ok('remover cancelado mantém', (await page.$$('[data-abrir]')).length === 2);
await resp(true); await page.click('.chip:has-text("Zé") [data-remover]');
ok('remover outro rascunho', (await page.$$('[data-abrir]')).length === 1);
ok('remover outro não troca o atual', (await val('#nome')).includes('érica'));
await page.click('.chip:has-text("rica") [data-remover]');
ok('remover atual limpa editor', (await val('#nome')) === '' && (await val('#texto')) === '');
ok('aviso some sem caracteres especiais', await page.$eval('#aviso-pdf', (e) => e.hidden));
ok('sem rascunhos mostra vazio', (await page.textContent('#rascunhos')).includes('Nenhum'));
await page.reload();
ok('remoção persiste após recarregar', (await page.$$('[data-abrir]')).length === 0);

// ---- 8. caracteres proibidos no nome do arquivo
await page.fill('#nome', 'Ana/Maria: "Teste"?'); await page.fill('#texto', 'ok');
const np = await baixar('#btn-docx', 'nomeproibido.docx');
ok('nome de arquivo sem caracteres proibidos', !/[\\/:*?"<>|]/.test(np), np);

// ---- 9. reset de textos
await page.click('#config summary'); await page.fill('#intro', 'lixo {nome}');
ok('abertura customizada aplicada', (await page.textContent('#intro-previa')) === 'lixo Ana/maria:');
await page.click('#btn-reset-config');
ok('restaurar textos padrão', (await val('#intro')).startsWith('Desde nossos'));

const dlg = await page.evaluate(() => window.__dlg);
ok('nenhum alert de erro', !dlg.some((d) => d.startsWith('ALERT')), dlg);

// ---- 10. localStorage bloqueado
const p2 = await ctx.newPage();
const erros2 = [];
p2.on('pageerror', (e) => erros2.push(e.message));
await p2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } }); window.confirm = () => true; });
await p2.goto(URL_SITE);
await p2.fill('#nome', 'sem storage'); await p2.fill('#texto', 'funciona?'); await p2.waitForTimeout(800);
await baixar('#btn-pdf', 'semstorage.pdf', p2);
await baixar('#btn-docx', 'semstorage.docx', p2);
ok('funciona com localStorage bloqueado', erros2.length === 0, erros2);
await p2.close();

// ---- 11. sem internet para a fonte do PDF (fallback)
const p3 = await ctx.newPage();
await p3.route(/jsdelivr/, (r) => r.abort());
await p3.addInitScript(() => { window.confirm = () => true; });
await p3.goto(URL_SITE);
await p3.fill('#nome', 'offline fonte'); await p3.fill('#texto', 'teste');
await baixar('#btn-pdf', 'fallback.pdf', p3);
ok('PDF gera mesmo sem baixar a Comic Neue', fs.existsSync(S + 'fallback.pdf'));
await p3.close();

// ---- 12. layouts
for (const [w, h, nome, esquema] of [[1400, 900, 'desktop', 'light'], [390, 844, 'mobile', 'light'], [1400, 900, 'dark', 'dark'], [768, 1024, 'tablet', 'light']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({ colorScheme: esquema });
  await page.reload();
  await page.fill('#nome', 'Layout'); await page.fill('#texto', 'Um parágrafo.\nOutro parágrafo.');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: S + `${nome}.png` });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`sem rolagem horizontal (${nome})`, over <= 0, over);
}

ok('sem erros de JS no console', erros.length === 0, erros);
await browser.close();

for (const r of res) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.nome}${r.ok ? '' : '  -> ' + r.info}`);
console.log(`\n${res.filter((r) => r.ok).length}/${res.length} passaram`);
