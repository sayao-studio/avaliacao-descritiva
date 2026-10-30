# Avaliação Descritiva

Página HTML única que gera a avaliação descritiva semestral da criança em **DOCX** e **PDF**, já formatada (ABNT, logo da Escola Praia do Riso, cabeçalho preenchido). Feita para a professora preencher 20–30 avaliações por semestre.

Modelo original de referência: `.docx` da escola, mantido fora do repositório (contém dados reais de aluna — **não publicar**).

## Status (26/09/2026)
- ✅ Pronto e testado: **220/220 verificações passando**.
- ✅ `index.html` é autossuficiente (logo embutido em base64): dá pra mandar só esse arquivo e abrir com duplo clique (Chrome/Edge).
- ⏳ Não publicado no GitHub Pages ainda (o usuário ia mandar só o HTML pra professora).
- ⚠️ Não validado no **Microsoft Word** (só LibreOffice). Pedir pra professora abrir um DOCX no Word uma vez.

## Como funciona
- **Automático:** data de hoje; semestre pela data (**mês ≤ 6 → primeiro**, ≥ 7 → segundo); ano atual. Tudo editável.
- **Nome da criança:** sai em MAIÚSCULAS + negrito, centralizado; espaços extras normalizados; 1º nome entra no parágrafo de abertura (`{nome}`).
- **Texto:** textarea que cresce; cada Enter = parágrafo. Limpeza automática de tabs, espaços duplos, espaço antes de pontuação, nbsp, hífen oculto, zero-width. Tab não tira o foco da caixa.
- **Abertura / encerramento / assinatura / linha de data (cidade)** automáticos, editáveis em "Configurações" (`{nome}`, `{serie}`).
- **Configurações da turma** (professora, coordenadora, série — padrão 2º ano, cidade, fonte) começam **vazias/genéricas** e ficam no `localStorage` de quem usa.
- **Rascunhos por criança** salvos automaticamente no navegador (salva também ao trocar de criança e ao fechar a aba).
- **Pré-visualização A4** ao vivo.
- **Prévia ao compartilhar** (WhatsApp etc.): meta tags Open Graph + `capa.jpg` (1200×630).

## Formatação gerada
- A4, margens 3 cm (sup./esq.) e 2 cm (inf./dir.), fonte 12, entrelinha 1,5, recuo 1ª linha 1,25 cm, justificado, pt-BR.
- Corpo: Times New Roman (padrão), Arial ou Cambria. Cabeçalho: Comic Sans MS no DOCX; **Comic Neue** no PDF (Comic Sans não pode ser embutida).
- Logo ancorado à direita do cabeçalho (mesmo tamanho do modelo: 4,19 × 2,57 cm).
- Arquivo: `Avaliação 2º semestre 2026 - NOME.docx|pdf`.

## Decisões técnicas
- **DOCX:** OOXML escrito à mão + JSZip (cdnjs). Sem template → nenhum dado real no pacote.
- **PDF:** jsPDF (cdnjs) com quebra de linha e justificação próprias; logo reduzido a 300 dpi (sem isso o PDF ia a ~4 MB; hoje ~140 KB). Fontes padrão do PDF só cobrem WinAnsi → emoji/✓/★ são removidos e ẽ vira e (aviso aparece na tela; o DOCX mantém tudo). Palavras maiores que a linha (URLs) são quebradas à força. Comic Neue baixada do jsDelivr; sem internet cai para Helvetica.
- **Precisa de internet** ao abrir (JSZip, jsPDF, Google Fonts, Comic Neue).

## Testes (`testes/`)
Playwright-core usando o Chromium já instalado em `~/.cache/ms-playwright/chromium-1234` (ou o caminho em `CHROME=`). Precisa de `libreoffice` (snap) e `poppler-utils`.

```bash
cd testes && npm i
node geral.mjs && python3 valida_geral.py      # 67 + 63: fluxo, rascunhos, config, caracteres, DOCX/PDF válidos
node digitacao.mjs && python3 valida_abnt.py   # 26 + 64: teclado real e ABNT medido em mm no PDF e no DOCX (via LibreOffice)
node perf.mjs                                  # ms por tecla com texto de ~12 mil caracteres (hoje ~3–7 ms)
```
Saídas em `testes/saida/` (ignorado). O LibreOffice snap não lê `/tmp` nem pastas ocultas, por isso os scripts convertem em `~/avtest` (e apagam depois).

## Publicar no GitHub Pages (quando quiser)
1. Repositório com `index.html` na raiz (`logo.png` só como referência; não subir o `.docx` modelo).
2. Settings → Pages → *Deploy from a branch* → `main` / `(root)`.

## Ideias não feitas
- Exportar/importar rascunhos (backup ou trocar de computador).
- Gerar todas as avaliações da turma de uma vez (ZIP).
- Validar no Word de verdade.
