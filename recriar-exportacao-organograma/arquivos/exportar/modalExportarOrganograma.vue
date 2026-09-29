<template src="./modalExportarOrganograma.html"></template>

<script>
// 1 px CSS a 96dpi convertido para milímetros físicos — mesma referência usada
// para calcular quantas folhas físicas o organograma ocupa.
const MM_PER_PX = 25.4 / 96

// Margem física (mm) aplicada nas quatro bordas de cada folha.
const MARGEM_MM = 15

// Piso de legibilidade (%): abaixo disso o texto do organograma fica pequeno
// demais para leitura confortável no papel — os modos que respeitam o piso
// preferem paginar a encolher além dele.
const LEGIBILIDADE_MINIMA = 70

// Acima desse número de folhas, o modo "Melhor ajuste automático" prefere
// aceitar uma escala abaixo do piso de legibilidade a gerar tantas páginas.
const MAX_FOLHAS_ACEITAVEL_MODO_AUTOMATICO = 6

const PAPEL_TAMANHOS_MM = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
}

// Espaço (px lógicos) reservado em cada folha para cabeçalho, legenda (quando
// exibida), rodapé e respiro interno — precisa ser IDÊNTICO ao usado por
// listar.vue na geração real do PDF, senão a quantidade de folhas/escala
// calculada aqui (e a pré-visualização) diverge do arquivo exportado.
const RESERVA_CABECALHO_PX = 100
const RESERVA_RODAPE_PX = 40
const RESERVA_LEGENDA_PX = 24
const RESERVA_MARGEM_PX = 20

// Reaproveitados por listar.vue para a paginação física do PDF exportado,
// mantendo uma única fonte da verdade para o tamanho dos papéis, a margem e o
// espaço reservado a cabeçalho/legenda/rodapé.
export { PAPEL_TAMANHOS_MM, MARGEM_MM, RESERVA_CABECALHO_PX, RESERVA_RODAPE_PX, RESERVA_LEGENDA_PX, RESERVA_MARGEM_PX }

export default {
  name: 'ModalExportarOrganograma',
  props: {
    visivel: { type: Boolean, default: false },
    // Dimensões do organograma capturado (px lógicos/CSS), usadas para calcular
    // quantas folhas físicas ele ocupa em cada papel/escala.
    dimensaoOrganograma: {
      type: Object,
      default: () => ({ width: 0, height: 0 }),
    },
    modoSimulacao: { type: Boolean, default: false },
    // Indica se a legenda de tipos de ação será desenhada no PDF exportado —
    // reduz a área útil de conteúdo (e a pré-visualização) do mesmo jeito que
    // a geração real em listar.vue.
    mostrarLegenda: { type: Boolean, default: false },
    // Formato pré-selecionado ao abrir (ex.: quando o usuário clica em "PDF"
    // ou "JPG" no menu de exportação, em vez do botão genérico).
    formatoInicial: { type: String, default: 'pdf' },
    // Função assíncrona (pixelRatio) => { canvas, width, height }, delegada pelo
    // componente pai (Detalhes.capturarComoImagem) — usada só para exibir a
    // pré-visualização; a geração real do arquivo acontece em listar.vue.
    capturarPreview: { type: Function, default: null },
  },
  emits: ['close', 'confirmar'],
  data() {
    return {
      papel: 'A4',
      orientacao: 'automatica', // automatica | retrato | paisagem
      modoAjuste: 'automatico', // automatico | pisoLegibilidade | umaFolha | manterPaginar
      formato: 'pdf', // pdf | jpg
      paginaAtual: 0,
      capturaPreviewUrl: null,
      carregandoPreview: false,
      // Capturada ao abrir o modal (ver watch de `visivel`) em vez de lida
      // direto de `new Date()` dentro do computed: um computed só reavalia
      // quando uma dependência reativa muda, então ler `new Date()` ali
      // "congelaria" a legenda na data da primeira renderização em vez de
      // atualizar a cada nova abertura do modal.
      dataReferencia: new Date(),
    }
  },
  computed: {
    orientacaoResolvida() {
      if (this.orientacao !== 'automatica') return this.orientacao
      const { width = 0, height = 0 } = this.dimensaoOrganograma || {}
      return width >= height ? 'paisagem' : 'retrato'
    },
    papelMm() {
      const base = PAPEL_TAMANHOS_MM[this.papel] || PAPEL_TAMANHOS_MM.A4
      return this.orientacaoResolvida === 'paisagem'
        ? { width: base.height, height: base.width }
        : { width: base.width, height: base.height }
    },
    areaConteudoMm() {
      const reservaAlturaPx =
        RESERVA_CABECALHO_PX + (this.mostrarLegenda ? RESERVA_LEGENDA_PX : 0) + RESERVA_RODAPE_PX + RESERVA_MARGEM_PX * 2
      return {
        width: Math.max(this.papelMm.width - MARGEM_MM * 2, 10),
        height: Math.max(this.papelMm.height - reservaAlturaPx * MM_PER_PX, 10),
      }
    },
    conteudoMm() {
      const { width = 0, height = 0 } = this.dimensaoOrganograma || {}
      return {
        width: Math.max(width * MM_PER_PX, 1),
        height: Math.max(height * MM_PER_PX, 1),
      }
    },
    // Maior escala (%) que ainda cabe inteira em 1 folha, sem upscale (máx. 100%).
    escalaAjustarUmaPagina() {
      const proporcaoLargura = this.areaConteudoMm.width / this.conteudoMm.width
      const proporcaoAltura = this.areaConteudoMm.height / this.conteudoMm.height
      const escala = Math.min(proporcaoLargura, proporcaoAltura) * 100
      return Math.max(1, Math.min(100, Math.floor(escala)))
    },
    resultadoAjuste() {
      return this.calcularAjuste(this.modoAjuste)
    },
    totalFolhas() {
      return this.resultadoAjuste.folhas.cols * this.resultadoAjuste.folhas.rows
    },
    paginas() {
      return Array.from({ length: this.totalFolhas }, (_valor, indice) => indice)
    },
    // Fração (0–1) do conteúdo total que cabe em cada folha ao longo da
    // largura/altura: igual à área útil da folha convertida para a mesma
    // unidade do conteúdo. Espelha exatamente o recorte feito por
    // listar.vue (fatia de tamanho fixo, restante só na última folha) —
    // evita que a grade da pré-visualização mostre uma divisão igual quando
    // o corte real do PDF é desigual.
    fracaoPorFolhaLargura() {
      const fatorEscala = this.resultadoAjuste.escala / 100
      return Math.min(1, this.areaConteudoMm.width / fatorEscala / this.conteudoMm.width)
    },
    fracaoPorFolhaAltura() {
      const fatorEscala = this.resultadoAjuste.escala / 100
      return Math.min(1, this.areaConteudoMm.height / fatorEscala / this.conteudoMm.height)
    },
    // Limites (%) das divisórias internas da grade de pré-visualização — só
    // as fronteiras entre folhas (0% e 100% ficam implícitos nas bordas do
    // contêiner).
    limitesColunas() {
      return this.calcularLimites(this.resultadoAjuste.folhas.cols, this.fracaoPorFolhaLargura)
    },
    limitesLinhas() {
      return this.calcularLimites(this.resultadoAjuste.folhas.rows, this.fracaoPorFolhaAltura)
    },
    // Um retângulo (%) por folha, na ordem linha-a-linha/coluna-a-coluna
    // usada por listar.vue (folha = linha * cols + coluna), para desenhar a
    // grade e destacar a folha atual sem CSS grid (que forçaria células
    // iguais).
    celulasGrade() {
      const { cols, rows } = this.resultadoAjuste.folhas
      const colunasLimites = [0, ...this.limitesColunas, 100]
      const linhasLimites = [0, ...this.limitesLinhas, 100]
      const celulas = []
      for (let linha = 0; linha < rows; linha += 1) {
        for (let coluna = 0; coluna < cols; coluna += 1) {
          celulas.push({
            left: colunasLimites[coluna],
            top: linhasLimites[linha],
            width: colunasLimites[coluna + 1] - colunasLimites[coluna],
            height: linhasLimites[linha + 1] - linhasLimites[linha],
          })
        }
      }
      return celulas
    },
    resumoTexto() {
      const orientacaoLabel = this.orientacaoResolvida === 'paisagem' ? 'paisagem' : 'retrato'
      const plural = this.totalFolhas > 1 ? 's' : ''
      return `${this.papel} ${orientacaoLabel} · escala ${this.resultadoAjuste.escala}% · ${this.totalFolhas} folha${plural}`
    },
    descricaoModoAjuste() {
      const descricoes = {
        automatico: 'O sistema escolhe o melhor equilíbrio entre legibilidade e número de folhas.',
        pisoLegibilidade: `Reduz a escala para caber em 1 folha, nunca abaixo de ${LEGIBILIDADE_MINIMA}% — pagina quando necessário para manter a leitura.`,
        umaFolha: 'Todo o organograma em uma única folha. Textos podem ficar reduzidos.',
        manterPaginar: 'Tamanho original preservado, distribuído entre as folhas com marcas de corte.',
      }
      return descricoes[this.modoAjuste] || ''
    },
    conteudoTexto() {
      return `${Math.round(this.conteudoMm.width)}×${Math.round(this.conteudoMm.height)} mm de conteúdo`
    },
    // JPG é sempre um único arquivo (sem paginação); a UI avisa essa restrição.
    formatoNaoPagina() {
      return this.formato === 'jpg' && this.totalFolhas <= 1
    },
    // Resolução efetiva (dpi) da imagem impressa em cada folha: mesma base de
    // 96 dpi usada para converter px lógicos em mm (MM_PER_PX/conteudoMm) —
    // quanto menor a escala escolhida, mais denso o conteúdo original fica
    // "espremido" na folha, aumentando o dpi resultante.
    resolucaoDpi() {
      const escala = Math.max(this.resultadoAjuste.escala, 1)
      return Math.round(96 * (100 / escala))
    },
    // Legenda inferior da pré-visualização: data de geração (hoje) + resolução
    // e regra de montagem do arquivo — cada folha recebe uma imagem própria,
    // igual ao que listar.vue efetivamente grava no PDF/JPG.
    legendaRevisaoTexto() {
      const dataFormatada = this.dataReferencia.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      const formatoLabel = this.formato === 'jpg' ? 'JPG' : 'PDF'
      return `Revisão: ${dataFormatada} · ${formatoLabel} ${this.resolucaoDpi} dpi, uma imagem por folha`
    },
    // "Faixa laranja" só faz sentido quando o conteúdo é realmente recortado
    // entre folhas — some quando tudo cabe em uma única folha.
    exibirLegendaContinuacao() {
      return this.totalFolhas > 1
    },
  },
  watch: {
    visivel(aberto) {
      if (aberto) {
        this.paginaAtual = 0
        this.formato = this.formatoInicial === 'jpg' ? 'jpg' : 'pdf'
        this.dataReferencia = new Date()
        this.capturarPreviewAsync()
      }
    },
    papel() {
      this.paginaAtual = 0
    },
    orientacao() {
      this.paginaAtual = 0
    },
    modoAjuste() {
      this.paginaAtual = 0
    },
    formato() {
      this.paginaAtual = 0
    },
  },
  methods: {
    // Calcula escala e paginação (cols x rows) para um modo de ajuste. JPG
    // nunca pagina: usa sempre o comportamento de "1 folha".
    calcularAjuste(modo) {
      const modoEfetivo = this.formato === 'jpg' ? 'umaFolha' : modo

      if (modoEfetivo === 'manterPaginar') {
        return { escala: 100, folhas: this.calcularGrade(100) }
      }

      if (modoEfetivo === 'pisoLegibilidade') {
        if (this.escalaAjustarUmaPagina >= LEGIBILIDADE_MINIMA) {
          return { escala: this.escalaAjustarUmaPagina, folhas: { cols: 1, rows: 1 } }
        }
        return { escala: LEGIBILIDADE_MINIMA, folhas: this.calcularGrade(LEGIBILIDADE_MINIMA) }
      }

      if (modoEfetivo === 'automatico') {
        if (this.escalaAjustarUmaPagina >= LEGIBILIDADE_MINIMA) {
          return { escala: this.escalaAjustarUmaPagina, folhas: { cols: 1, rows: 1 } }
        }
        const comPiso = this.calcularGrade(LEGIBILIDADE_MINIMA)
        if (comPiso.cols * comPiso.rows > MAX_FOLHAS_ACEITAVEL_MODO_AUTOMATICO) {
          return { escala: this.escalaAjustarUmaPagina, folhas: { cols: 1, rows: 1 } }
        }
        return { escala: LEGIBILIDADE_MINIMA, folhas: comPiso }
      }

      // umaFolha (padrão)
      return { escala: this.escalaAjustarUmaPagina, folhas: { cols: 1, rows: 1 } }
    },
    calcularGrade(escala) {
      const larguraEscalada = this.conteudoMm.width * (escala / 100)
      const alturaEscalada = this.conteudoMm.height * (escala / 100)
      return {
        cols: Math.max(1, Math.ceil(larguraEscalada / this.areaConteudoMm.width)),
        rows: Math.max(1, Math.ceil(alturaEscalada / this.areaConteudoMm.height)),
      }
    },
    // Posições (%) das divisórias internas de um eixo: todas as folhas,
    // exceto a última, ocupam a mesma fração do conteúdo — a última recebe
    // apenas o restante (pode ser menor).
    calcularLimites(quantidade, fracaoPorFolha) {
      const limites = []
      for (let indice = 1; indice < quantidade; indice += 1) {
        limites.push(Math.min(1, indice * fracaoPorFolha) * 100)
      }
      return limites
    },
    async capturarPreviewAsync() {
      if (!this.capturarPreview) return
      this.carregandoPreview = true
      try {
        const resultado = await this.capturarPreview(1)
        this.capturaPreviewUrl = resultado?.canvas?.toDataURL ? resultado.canvas.toDataURL('image/png') : null
      } catch {
        this.capturaPreviewUrl = null
      } finally {
        this.carregandoPreview = false
      }
    },
    irParaPagina(indice) {
      if (indice < 0 || indice >= this.totalFolhas) return
      this.paginaAtual = indice
    },
    fechar() {
      this.$emit('close')
    },
    confirmar() {
      this.$emit('confirmar', {
        formato: this.formato,
        papel: this.papel,
        orientacao: this.orientacaoResolvida,
        modoAjuste: this.modoAjuste,
        escala: this.resultadoAjuste.escala,
        folhas: this.resultadoAjuste.folhas,
      })
    },
  },
}
</script>

<style scoped src="./modalExportarOrganograma.scss" lang="scss"></style>
