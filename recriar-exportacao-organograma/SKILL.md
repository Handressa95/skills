---
name: recriar-exportacao-organograma
description: Recria no SEAC Frontend a modal de exportação do organograma (PDF/JPG com papel A4/A3/A2, orientação, modos de ajuste, paginação e pré-visualização) exatamente como está na branch FEAT-201443-Handressa, compatível com o Organograma e com o Organograma da Simulação, sem alterar funcionalidades existentes. Use quando o usuário pedir para recriar, portar ou reaplicar a exportação/modal de exportação do organograma em outra branch.
disable-model-invocation: true
---

# Recriar a exportação do organograma

Reaplica, em outra branch, a exportação de `organograma/listar` exatamente como estava na `FEAT-201443-Handressa` (commit `122e0573`), já com as duas correções de merge que quebravam a tela:

- **`listar.vue` com um único `computed`:** o segundo bloco apagava `historicoEstadosDaUnidade` e causava "Erro ao pesquisar os organogramas".
- **`detalhes.vue` retornando `nosDoFluxo` no `setup()`:** sem isso a caixa delimitadora vinha `null` e a exportação media o organograma como vazio.

Os patches foram gerados contra a release `910023c3` (`release-req-840358`) e aplicam sem conflito sobre ela.

## Conteúdo desta skill

Caminhos relativos à pasta desta skill (`~/.cursor/skills/recriar-exportacao-organograma/`):

| Caminho | Uso |
|---|---|
| `arquivos/exportar/modalExportarOrganograma.{vue,html,scss,test.js}` | Componente da modal, copiado **sem alterações** |
| `patches/exportacao-completa.patch` | Todas as alterações de `views/organograma` (inclui a pasta `exportar/`) |
| `patches/listar.vue.patch`, `listar.html.patch`, `listar.test.js.patch` | Alterações de `listar`, uma por arquivo |
| `patches/detalhes.vue.patch`, `detalhes.test.js.patch` | Alterações de `detalhes`, uma por arquivo |

## Regras inegociáveis

1. **Não alterar funcionalidade existente.** Só entram os trechos dos patches. Tudo o que a branch de destino já tem (histórico de estados, salvar estado, carregamento automático do layout, tela de simulação, outros módulos) fica como está.
2. **Arquivos permitidos:** somente
   - `src/1.apresentacao/views/organograma/listar/exportar/*` (novos)
   - `src/1.apresentacao/views/organograma/listar/listar.{vue,html,test.js}`
   - `src/1.apresentacao/views/organograma/detalhes/detalhes.{vue,test.js}`

   Nunca tocar em `projetosimulacao/**`, serviços, router ou outros módulos.
3. **Modal idêntica:** copiar os 4 arquivos de `arquivos/exportar/` byte a byte. Não reformatar nem "melhorar".
4. **Não commitar.** Deixar tudo no working tree para o usuário conferir.
5. Seguir o `AGENTS.md` do repositório (pnpm, Options API, `mensagem` para feedback).

## Fluxo

Copie o checklist e marque o progresso:

```
- [ ] 1. Pré-verificação da branch
- [ ] 2. Pré-requisitos presentes
- [ ] 3. Copiar a modal
- [ ] 4. Aplicar as alterações de listar/detalhes
- [ ] 5. Conferir invariantes
- [ ] 6. Testes e revisão do diff
```

### 1. Pré-verificação

```powershell
git status --short
git branch --show-current
Test-Path src/1.apresentacao/views/organograma/listar/exportar
```

- **Working tree sujo:** pare e pergunte ao usuário como seguir.
- **Pasta `exportar/` já existe:** pare e pergunte se ela deve ser substituída.

### 2. Pré-requisitos

A exportação depende de código que já existe na release. Confirme com Grep em `src/`:

| Deve existir | Onde |
|---|---|
| `carregarOrganogramaSimulacao`, `modoSimulacao`, `nomeSimulacao`, `calculateOptimalScale`, `renderizarTiles`, `buscarLogoIdentidadeUnidadeFuncional`, `logosRelatorioMixin`, `historicoEstadosDaUnidade` | `views/organograma/listar/listar.vue` |
| `capturarComoImagem`, `obterDimensaoContainer`, `useVueFlow('org-chart-flow')` | `views/organograma/detalhes/detalhes.vue` |
| `buscarOrganogramaGrafico`, `pesquisarPorChave` | `2.servicos/simulacao/simulacaoServico.js` |
| `pesquisarPorChave` | `2.servicos/projetosimulacao/projetoSimulacaoServico.js` |

Se faltar algum item, **pare e informe o usuário**. Não crie o item faltante: seria alterar funcionalidade existente.

### 3. Copiar a modal

```powershell
$sk = "$env:USERPROFILE\.cursor\skills\recriar-exportacao-organograma"
New-Item -ItemType Directory -Force src/1.apresentacao/views/organograma/listar/exportar | Out-Null
Copy-Item "$sk\arquivos\exportar\*" src/1.apresentacao/views/organograma/listar/exportar/ -Force
```

### 4. Aplicar listar/detalhes

Tente, nesta ordem, parando na primeira que funcionar.

**a) Branch com os arquivos iguais à release.** Verifique com `git diff --stat 910023c3 -- src/1.apresentacao/views/organograma`. Se não houver saída, aplique os patches por arquivo, porque a pasta `exportar/` já foi copiada no passo 3:

```powershell
foreach ($p in 'listar.vue','listar.html','listar.test.js','detalhes.vue','detalhes.test.js') {
  git apply --3way --whitespace=nowarn "$sk\patches\$p.patch"
}
```

**b) Arquivos diferentes da release.** Rode o mesmo comando com `--3way`. Se sobrarem conflitos, resolva **mantendo o código da branch de destino e acrescentando** os trechos do patch. Nunca descarte código da branch.

**c) Patch não aplica.** Aplique manualmente, lendo cada `patches/<arquivo>.patch` e reproduzindo cada hunk no lugar equivalente. O mapa abaixo mostra o que cada arquivo recebe.

**`listar.vue`:**
- **Imports:**
  - `projetoSimulacaoServico`
  - `ModalExportarOrganograma` e as constantes `PAPEL_TAMANHOS_MM`, `MARGEM_MM`, `RESERVA_CABECALHO_PX`, `RESERVA_RODAPE_PX`, `RESERVA_LEGENDA_PX`, `RESERVA_MARGEM_PX`, vindas de `./exportar/modalExportarOrganograma.vue`
- **Constantes de módulo:** `MM_PER_PX`, `mmParaPx`, `LEGENDA_TIPO_ACAO`, `SITUACAO_SIMULACAO_LABELS`.
- **`components`:** `ModalExportarOrganograma`.
- **`data`:** `projetoNome`, `situacaoSimulacao`, `mostrarModalExportar`, `dimensaoOrganogramaExportacao`, `formatoExportarInicial`.
- **`computed`:** `mostrarLegendaExportacao` entra **dentro do `computed` já existente**, junto de `historicoEstadosDaUnidade`. Nunca crie um segundo bloco `computed`.
- **Métodos:**
  - `generateJpg(parametrosPapel)`: bloqueia a simulação sem unidades e aplica a escala do modal.
  - `prepararLogosCabecalho`, `desenharCabecalhoPdf`, `hexParaRgb`, `renderizarLegendaPdf`, `possuiAcoesSimulacaoParaLegenda`, `renderizarRodapePdf`.
    - O rodapé mostra "Simulação · Projeto · Situação" no modo simulação e a legislação de estrutura no modo normal.
  - `gerarPdfConteudoAjustado`: fluxo legado, é o PDF original de página única.
  - `gerarPdfPaginadoPorPapel`: PDF paginado por folhas.
  - `generatePdf(parametrosPapel)`: escolhe entre os dois fluxos.
  - `carregarNomeProjetoSimulacao`.
  - `abrirModalExportar`, `fecharModalExportar`, `capturarPreviewExportacao`, `confirmarExportacao`.
- **`carregarOrganogramaSimulacao`:** acrescente apenas o preenchimento de `situacaoSimulacao` e a chamada `await this.carregarNomeProjetoSimulacao(respostaSimulacao.dados.projetoSimulacaoChave)`.

**`listar.html`:**
- **Menu "Exportar organograma":** os itens PDF e JPG passam a chamar `abrirModalExportar('pdf')` e `abrirModalExportar('jpg')`.
- **Modal:** `<ModalExportarOrganograma ...>` entra logo antes de `</section>`, com as props `visivel`, `dimensao-organograma`, `modo-simulacao`, `mostrar-legenda`, `formato-inicial` e `capturar-preview`, e os eventos `@close` e `@confirmar`.
- **Comentário:** remova o comentário "Exportação temporariamente oculta".

**`detalhes.vue`:**
- **Constante:** `CAPTURA_PADDING_PX = 40`.
- **`setup()`:** extrair `nodes: nosDoFluxo` e `onlyRenderVisibleElements` do `useVueFlow` **e retornar os dois**.
- **Métodos:**
  - Novo `obterCaixaDelimitadora()`.
  - `obterDimensaoContainer()` passa a usar a caixa delimitadora mais o padding.
  - `capturarComoImagem()` desliga `onlyRenderVisibleElements`, redimensiona o container para o conteúdo, captura em zoom 1 e restaura tudo no `finally`.

**Testes (`listar.test.js`, `detalhes.test.js`):** acrescente os blocos do patch. Não remova nem altere testes existentes da branch de destino.

### 5. Invariantes (obrigatório)

Todos devem retornar o valor indicado:

```powershell
(Select-String src/1.apresentacao/views/organograma/listar/listar.vue -Pattern '^\s{4}computed:').Count      # 1
(Select-String src/1.apresentacao/views/organograma/detalhes/detalhes.vue -Pattern '^\s{6}nosDoFluxo,$').Count # 1 (no return do setup)
(Select-String src/1.apresentacao/views/organograma/listar/listar.html -Pattern 'generatePdf\(|generateJpg\(').Count # 0
(Select-String src/1.apresentacao/views/organograma/listar/listar.html -Pattern '<ModalExportarOrganograma').Count # 1
```

Compare também a modal com a da skill; nenhuma diferença é aceitável:

```powershell
Get-ChildItem "$sk\arquivos\exportar" | ForEach-Object {
  $a = Get-FileHash $_.FullName; $b = Get-FileHash "src/1.apresentacao/views/organograma/listar/exportar/$($_.Name)"
  "$($_.Name): $($a.Hash -eq $b.Hash)"
}
```

### 6. Testes e revisão

```powershell
pnpm exec vitest run src/1.apresentacao/views/organograma src/2.servicos/organograma src/2.servicos/simulacao
git status --short
git diff HEAD --stat
```

`git apply --3way` deixa as mudanças no stage; por isso compare com `HEAD`. Não faça `git commit`.

- **Testes:** todos devem passar, sem warnings de console vindos dos arquivos do organograma.
- **`git status`:** só os arquivos permitidos na regra 2.
- **`git diff`:** revise cada remoção. As únicas remoções esperadas são o antigo corpo de `generatePdf`, que migrou para `gerarPdfConteudoAjustado`, `desenharCabecalhoPdf` e `renderizarRodapePdf` com o mesmo resultado, e as chamadas `generatePdf()`/`generateJpg()` do HTML. Qualquer outra remoção é regressão e deve ser desfeita.

Se um teste existente da branch de destino falhar, corrija a integração. Não mude HTML ou regra de negócio para o teste passar.

## Comportamento esperado (para conferir no navegador)

**Organograma (`/organograma/listar`):**
- "Gerar organograma" funciona como antes: carrega o último layout salvo, e o histórico e o salvar estado seguem inalterados.
- "Exportar organograma" > PDF ou JPG abre a modal.
- **Configuração da modal:**
  - Papel: A4, A3 ou A2.
  - Orientação: automática, retrato ou paisagem.
  - Modo de ajuste: automático, piso de legibilidade de 70%, 1 folha, ou manter legível e paginar.
  - Formato: PDF ou JPG.
- **Resumo e pré-visualização:** a modal mostra papel, escala e número de folhas, e a pré-visualização tem a grade de folhas.
- **Arquivo gerado:** "Confirmar" gera `organograma.pdf`, paginado com cabeçalho, logos e rodapé em cada folha, ou `organograma.jpg`, em arquivo único.

**Organograma da Simulação (`/organograma/listar?simulacaoChave=...`, pelo menu da tela Simular):**
- A mesma modal abre com `modoSimulacao`.
- **PDF:** mostra a legenda Atual/Acréscimo/Alteração quando houver acréscimos ou alterações, e o rodapé "Simulação · Projeto: … · Situação: …".
- **Simulação sem unidades:** alerta "Esta simulação não possui unidades para exportar." e não gera arquivo.

## Ao terminar

Informe ao usuário:
- os arquivos alterados;
- como os patches foram aplicados (direto, `--3way` ou manual);
- o resultado dos testes e dos invariantes.

Lembre que nada foi commitado.
