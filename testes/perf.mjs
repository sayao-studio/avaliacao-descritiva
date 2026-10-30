import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` });
const p = await b.newPage();
await p.goto('file://' + new URL('../index.html', import.meta.url).pathname);
await p.evaluate(() => { localStorage.clear(); const t = document.getElementById('texto'); t.value = ('Texto de uma avaliação bem longa com muitos parágrafos para medir. '.repeat(12) + '\n').repeat(15); t.dispatchEvent(new Event('input')); });
await p.click('#texto'); await p.keyboard.press('Control+End');
const ms = await p.evaluate(async () => {
  const t = document.getElementById('texto'); const t0 = performance.now();
  for (let i = 0; i < 100; i++) { t.value += 'a'; t.dispatchEvent(new Event('input', { bubbles: true })); }
  return (performance.now() - t0) / 100;
});
console.log('caracteres no texto:', await p.$eval('#texto', t => t.value.length), '| ms por tecla (prévia+contador):', ms.toFixed(2));
await b.close();
