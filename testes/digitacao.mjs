import { chromium } from 'playwright-core';
import fs from 'node:fs';

const S = new URL('./saida/digitacao/', import.meta.url).pathname;
fs.rmSync(S, { recursive: true, force: true }); fs.mkdirSync(S, { recursive: true });
const SITE = 'file://' + new URL('../index.html', import.meta.url).pathname;
const res = [];
const ok = (nome, cond, info = '') => res.push({ nome, ok: !!cond, info: cond ? '' : JSON.stringify(info).slice(0, 300) });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` });
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { window.confirm = () => true; window.alert = (m) => { (window.__alerts ||= []).push(m); }; });
let page = await ctx.newPage();
const erros = [];
const vigiar = (p) => { p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); }); };
vigiar(page);
const val = (sel) => page.inputValue(sel);
const prev = () => page.evaluate(() => ({
  aluno: document.getElementById('prev-aluno').textContent,
  ps: [...document.querySelectorAll('#prev-corpo p')].map((p) => p.textContent),
}));
const baixar = async (btn, nome) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click(btn)]);
  await dl.saveAs(S + nome);
};

await page.goto(SITE);
await page.evaluate(() => localStorage.clear());
await page.reload();

// configurações digitadas
await page.click('#professora'); await page.keyboard.type('Ana Paula Moreira');
await page.click('#coordenadora'); await page.keyboard.type('Beatriz Souza');
await page.click('#cidade'); await page.keyboard.type('Florianópolis');
ok('assinatura automática = 1º nome da professora', (await prev()).ps.includes('Ana'));

// ---- nome digitado letra a letra
await page.click('#nome');
await page.keyboard.type('maria', { delay: 20 });
ok('prévia atualiza a cada letra (caixa alta)', (await prev()).aluno === 'MARIA');
await page.keyboard.type(' eduarda  da   silva', { delay: 10 });
ok('nome: espaços extras normalizados na prévia', (await prev()).aluno === 'MARIA EDUARDA DA SILVA', (await prev()).aluno);
await page.keyboard.press('Enter');
ok('Enter no nome não quebra nada', (await val('#nome')) === 'maria eduarda  da   silva');

// ---- escrita no textarea com teclado
const P1 = 'Maria é uma menina doce, alegre e companheira. Interage bem com todas as crianças do grupo e costuma brincar com todos quando são propostas brincadeiras coletivas.';
const P2 = 'Na roda e em outros momentos de sala, é muito participativa. Presta atenção ao que lhe é apresentado e exerce a escuta dos amigos com valorização e respeito — algo que chama a atenção de todos.';
const P3 = 'Transita com tranquilidade pela Matemática: apresenta bom raciocínio lógico, compreende o sistema de numeração decimal e trabalhou com números de 0 a 99, representando-os corretamente.';
await page.click('#texto');
await page.keyboard.press('Tab');
ok('Tab mantém o cursor na caixa de texto', await page.evaluate(() => document.activeElement.id === 'texto'));
await page.keyboard.type(P1, { delay: 2 });
await page.keyboard.press('Enter');
await page.keyboard.type('     ' + P2, { delay: 2 });
await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.keyboard.type(P3, { delay: 2 });
let pv = await prev();
ok('Tab no início some do texto final (recuo é automático)', pv.ps[1] === P1, pv.ps[1]);
ok('Enter = novo parágrafo; Enters extras ignorados', pv.ps.length === 1 + 3 + 2 + 1 + 1 && pv.ps[2] === P2 && pv.ps[3] === P3, pv.ps.length);
ok('contador conta 3 parágrafos', (await page.textContent('#contador')).includes('3 parágrafo'));

// acentos e pontuação digitados
await page.keyboard.press('Enter');
const P4 = 'Acentos: ação, coração, pé, avô, à, ü, ç, Ç, É; aspas “assim” e "assim"; 2º ano, 1ª vez; R$ 10,00; 100%!';
await page.keyboard.type(P4, { delay: 2 });
ok('acentos/pontuação digitados preservados', (await prev()).ps[4] === P4, (await prev()).ps[4]);

// backspace
await page.keyboard.type(' xyz');
for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
ok('Backspace apaga', (await prev()).ps[4] === P4);

// cursor no meio: a prévia não pode mover o cursor
const pos = await page.$eval('#texto', (t) => { const i = t.value.indexOf('Na roda'); t.setSelectionRange(i, i); return i; });
await page.keyboard.type('Além disso, ', { delay: 15 });
const depois = await page.$eval('#texto', (t) => ({ v: t.value, s: t.selectionStart }));
ok('digitar no meio insere no lugar certo', depois.v.includes('Além disso, Na roda'), depois.v.slice(pos - 5, pos + 30));
ok('cursor não pula enquanto a prévia atualiza', depois.s === pos + 'Além disso, '.length, [depois.s, pos]);

// desfazer
await page.keyboard.press('Control+z');
const aposUndo = await val('#texto');
ok('Ctrl+Z desfaz', !aposUndo.includes('Além disso, Na roda'), aposUndo.slice(0, 50));
await page.keyboard.press('Control+Shift+z');
ok('Ctrl+Shift+Z refaz', (await val('#texto')).includes('Além disso, Na roda'));

// colar texto vindo do Word (CRLF, nbsp, hífen oculto, espaço de largura zero, tabs)
await page.keyboard.press('Control+End');
await page.keyboard.press('Enter');
const colado = 'Texto colado do Word com hífen ocul­to e espaço​invisível.\r\n\r\n\tSegundo parágrafo colado , com   espaços.\r\n';
await page.evaluate((t) => document.execCommand('insertText', false, t), colado);
pv = await prev();
const idx = pv.ps.findIndex((p) => p.startsWith('Texto colado'));
ok('colado: nbsp/hífen oculto/zero-width limpos', pv.ps[idx] === 'Texto colado do Word com hífen oculto e espaçoinvisível.', pv.ps[idx]);
ok('colado: CRLF vira parágrafos e espaços limpos', pv.ps[idx + 1] === 'Segundo parágrafo colado, com espaços.', pv.ps[idx + 1]);

// digitação rápida e longa (texto grande): performance
const longo = ('Seguiremos com novos desafios para o próximo semestre, com autonomia e sistematização do conhecimento. ').repeat(20);
await page.keyboard.press('Enter');
const t0 = Date.now();
await page.keyboard.type(longo, { delay: 0 });
const ms = Date.now() - t0;
ok('texto longo digitado sem perda de caracteres', (await val('#texto')).endsWith(longo), (await val('#texto')).slice(-40));
ok(`digitação fluida (${longo.length} teclas em ${ms} ms)`, ms / longo.length < 15, ms);
const ta = await page.$eval('#texto', (t) => ({ sh: t.scrollHeight, ch: t.clientHeight }));
ok('caixa cresce junto (sem barra de rolagem interna)', ta.sh <= ta.ch + 4, ta);
ok('spellcheck pt-BR ligado', await page.$eval('#texto', (t) => t.spellcheck && t.lang === 'pt-BR'));

// autosalvar: trocar de criança imediatamente após digitar
await page.keyboard.type(' FIM-IMEDIATO');
await page.click('#btn-novo');
const rasc = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('avaliacao:rascunhos'))));
ok('clicar "Nova criança" logo após digitar não perde texto', rasc.some((r) => r.texto.endsWith('FIM-IMEDIATO')), rasc.map((r) => r.texto.slice(-20)));
await page.click('[data-abrir]:has-text("maria")');
ok('reabrir rascunho traz tudo', (await val('#texto')).endsWith('FIM-IMEDIATO'));

// fechar a aba logo após digitar
await page.click('#texto'); await page.keyboard.press('Control+End');
await page.keyboard.type(' FECHOU-RAPIDO');
await page.close({ runBeforeUnload: true });
page = await ctx.newPage(); vigiar(page);
await page.goto(SITE);
ok('fechar a aba logo após digitar não perde texto', (await val('#texto')).endsWith('FECHOU-RAPIDO'), (await val('#texto')).slice(-30));
await page.$eval('#texto', (t) => { t.value = t.value.replace(' FECHOU-RAPIDO', '').replace(' FIM-IMEDIATO', ''); t.dispatchEvent(new Event('input')); });
await page.waitForTimeout(800);

// Ctrl+A dentro da caixa seleciona só o texto dela
await page.click('#texto'); await page.keyboard.press('Control+a');
ok('Ctrl+A seleciona só a caixa', await page.$eval('#texto', (t) => t.selectionStart === 0 && t.selectionEnd === t.value.length));
await page.keyboard.press('End');

// ---- gerar arquivos para medir ABNT
await baixar('#btn-docx', 'abnt.docx');
await baixar('#btn-pdf', 'abnt.pdf');
fs.writeFileSync(S + 'esperado.json', JSON.stringify({ corpo: (await prev()).ps }));
await page.click('#config summary'); await page.selectOption('#fonte', 'Arial');
await baixar('#btn-docx', 'abnt-arial.docx');
await baixar('#btn-pdf', 'abnt-arial.pdf');

ok('nenhum alert de erro', !(await page.evaluate(() => window.__alerts || [])).length);
ok('sem erros de JS', !erros.length, erros);
await browser.close();
for (const r of res) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.nome}${r.ok ? '' : '  -> ' + r.info}`);
console.log(`\n${res.filter((r) => r.ok).length}/${res.length} passaram`);
