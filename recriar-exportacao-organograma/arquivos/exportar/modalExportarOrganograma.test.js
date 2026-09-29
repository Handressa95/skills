import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ModalExportarOrganograma from './modalExportarOrganograma.vue'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve))

describe('ModalExportarOrganograma', () => {
  let wrapper

  const createWrapper = (props = {}) => {
    return mount(ModalExportarOrganograma, {
      props: {
        visivel: true,
        dimensaoOrganograma: { width: 2000, height: 1000 },
        ...props,
      },
    })
  }

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
      wrapper = null
    }
  })

  describe('Renderização condicional', () => {
    it('não deve renderizar o conteúdo quando visivel for falso', () => {
      wrapper = createWrapper({ visivel: false })
      expect(wrapper.find('.modal').exists()).toBe(false)
    })

    it('deve renderizar o modal quando visivel for verdadeiro', () => {
      wrapper = createWrapper()
      expect(wrapper.find('.modal').exists()).toBe(true)
    })
  })

  describe('Orientação automática', () => {
    it('deve resolver como paisagem quando a largura for maior ou igual à altura', () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 2000, height: 1000 } })
      expect(wrapper.vm.orientacaoResolvida).toBe('paisagem')
    })

    it('deve resolver como retrato quando a altura for maior que a largura', () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 500, height: 2000 } })
      expect(wrapper.vm.orientacaoResolvida).toBe('retrato')
    })

    it('deve respeitar a orientação explícita, ignorando o cálculo automático', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 2000, height: 1000 } })
      wrapper.vm.orientacao = 'retrato'
      await nextTick()
      expect(wrapper.vm.orientacaoResolvida).toBe('retrato')
    })
  })

  describe('Modo de ajuste — umaFolha', () => {
    it('deve manter 1 folha mesmo quando a escala de ajuste for baixa', async () => {
      // Conteúdo bem maior que uma folha A4: escalaAjustarUmaPagina será baixa.
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'umaFolha'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 1, rows: 1 })
      expect(wrapper.vm.resultadoAjuste.escala).toBeLessThan(70)
    })
  })

  describe('Modo de ajuste — pisoLegibilidade', () => {
    it('não deve paginar quando o ajuste a uma folha já respeita o piso de 70%', async () => {
      // Conteúdo pequeno o suficiente para caber em 1 folha A4 com escala >= 70%.
      wrapper = createWrapper({ dimensaoOrganograma: { width: 600, height: 400 } })
      wrapper.vm.modoAjuste = 'pisoLegibilidade'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 1, rows: 1 })
      expect(wrapper.vm.resultadoAjuste.escala).toBeGreaterThanOrEqual(70)
    })

    it('deve paginar em 70% quando o ajuste a uma folha ficaria abaixo do piso', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'pisoLegibilidade'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.escala).toBe(70)
      expect(wrapper.vm.resultadoAjuste.folhas.cols * wrapper.vm.resultadoAjuste.folhas.rows).toBeGreaterThan(1)
    })
  })

  describe('Modo de ajuste — manterPaginar', () => {
    it('deve manter escala 100% e paginar conforme necessário', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.escala).toBe(100)
      expect(wrapper.vm.resultadoAjuste.folhas.cols * wrapper.vm.resultadoAjuste.folhas.rows).toBeGreaterThan(1)
    })
  })

  describe('Reserva de espaço da legenda (mostrarLegenda)', () => {
    it('deve reduzir a área útil e aumentar as folhas quando mostrarLegenda for true', async () => {
      // Altura de conteúdo escolhida para caber em 1 folha sem legenda, mas
      // exigir 2 quando o espaço da legenda é reservado — mesma reserva
      // usada pela geração real do PDF em listar.vue.
      wrapper = createWrapper({ dimensaoOrganograma: { width: 378, height: 931 }, mostrarLegenda: false })
      wrapper.vm.orientacao = 'retrato'
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 1, rows: 1 })

      await wrapper.setProps({ mostrarLegenda: true })
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 1, rows: 2 })
    })
  })

  describe('Grade de pré-visualização (celulasGrade)', () => {
    it('deve gerar folhas de tamanho desigual quando o conteúdo não é múltiplo exato da área da folha', async () => {
      // Escolhido para gerar cols=2 com uma divisão bem distante de 50/50
      // (a última folha recebe só o restante) — reproduz o cenário do bug
      // relatado, em que a pré-visualização mostrava uma divisão igual mas o
      // PDF real recortava de forma desigual.
      wrapper = createWrapper({ dimensaoOrganograma: { width: 1633, height: 600 } })
      wrapper.vm.orientacao = 'paisagem'
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 2, rows: 1 })
      expect(wrapper.vm.celulasGrade).toHaveLength(2)

      const [primeira, segunda] = wrapper.vm.celulasGrade
      // Primeira folha ocupa a fatia cheia da página; a segunda (última)
      // recebe apenas o restante — por isso as larguras não são iguais.
      expect(primeira.width).not.toBeCloseTo(50, 0)
      expect(primeira.left).toBe(0)
      expect(segunda.left).toBeCloseTo(primeira.width, 5)
      expect(primeira.width + segunda.width).toBeCloseTo(100, 5)
    })

    it('deve gerar folhas de tamanho igual quando o conteúdo divide exatamente a área da folha', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 2000, height: 1000 } })
      wrapper.vm.modoAjuste = 'umaFolha'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 1, rows: 1 })
      expect(wrapper.vm.celulasGrade).toEqual([{ left: 0, top: 0, width: 100, height: 100 }])
    })
  })

  describe('Modo de ajuste — automatico', () => {
    it('deve se comportar como pisoLegibilidade quando a paginação resultante for aceitável', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 4000, height: 1200 } })
      wrapper.vm.modoAjuste = 'automatico'
      const resultadoPiso = wrapper.vm.calcularAjuste('pisoLegibilidade')
      await nextTick()

      expect(wrapper.vm.resultadoAjuste).toEqual(resultadoPiso)
    })

    it('deve preferir 1 folha (abaixo do piso) quando a paginação com piso geraria folhas demais', async () => {
      // Conteúdo extremamente alongado: pisoLegibilidade geraria dezenas de folhas.
      wrapper = createWrapper({ dimensaoOrganograma: { width: 100000, height: 20000 } })
      wrapper.vm.modoAjuste = 'automatico'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 1, rows: 1 })
      expect(wrapper.vm.resultadoAjuste.escala).toBe(wrapper.vm.escalaAjustarUmaPagina)
    })
  })

  describe('Formato JPG', () => {
    it('nunca deve paginar, independente do modo de ajuste selecionado', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.formato = 'jpg'
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()

      expect(wrapper.vm.resultadoAjuste.folhas).toEqual({ cols: 1, rows: 1 })
      expect(wrapper.vm.totalFolhas).toBe(1)
    })
  })

  describe('Legenda de revisão e continuação', () => {
    it('deve exibir a data de hoje e o formato PDF quando o formato selecionado for pdf', async () => {
      wrapper = createWrapper()
      wrapper.vm.formato = 'pdf'
      await nextTick()

      const dataFormatada = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })

      expect(wrapper.vm.legendaRevisaoTexto).toBe(
        `Revisão: ${dataFormatada} · PDF ${wrapper.vm.resolucaoDpi} dpi, uma imagem por folha`,
      )
    })

    it('deve exibir o formato JPG quando o formato selecionado for jpg', async () => {
      wrapper = createWrapper()
      wrapper.vm.formato = 'jpg'
      await nextTick()

      expect(wrapper.vm.legendaRevisaoTexto).toContain(`JPG ${wrapper.vm.resolucaoDpi} dpi, uma imagem por folha`)
    })

    it('deve atualizar a data de referência para a data atual sempre que o modal for reaberto', async () => {
      wrapper = createWrapper({ visivel: false })
      await nextTick()

      const dataAntiga = new Date('2020-01-01T12:00:00Z')
      wrapper.vm.dataReferencia = dataAntiga

      await wrapper.setProps({ visivel: true })
      await nextTick()

      const hoje = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })

      expect(wrapper.vm.dataReferencia).not.toBe(dataAntiga)
      expect(wrapper.vm.legendaRevisaoTexto).toContain(`Revisão: ${hoje}`)
    })

    it('deve aumentar o dpi calculado quando a escala de ajuste diminuir', async () => {
      // Conteúdo grande o bastante para forçar uma escala bem menor que 100%.
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'umaFolha'
      await nextTick()

      const escala = wrapper.vm.resultadoAjuste.escala
      expect(escala).toBeLessThan(100)
      expect(wrapper.vm.resolucaoDpi).toBe(Math.round(96 * (100 / escala)))
      expect(wrapper.vm.resolucaoDpi).toBeGreaterThan(96)
    })

    it('não deve exibir a legenda de continuação quando o conteúdo couber em 1 folha', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 600, height: 400 } })
      wrapper.vm.modoAjuste = 'umaFolha'
      await nextTick()

      expect(wrapper.vm.exibirLegendaContinuacao).toBe(false)
      expect(wrapper.find('.exportar-organograma-legenda__continuacao').exists()).toBe(false)
    })

    it('deve exibir a legenda de continuação quando o conteúdo exigir mais de 1 folha', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()

      expect(wrapper.vm.exibirLegendaContinuacao).toBe(true)
      const continuacao = wrapper.find('.exportar-organograma-legenda__continuacao')
      expect(continuacao.exists()).toBe(true)
      expect(continuacao.text()).toContain('Faixa laranja = continua na folha seguinte')
    })
  })

  describe('Eventos', () => {
    it('deve emitir close ao cancelar', async () => {
      wrapper = createWrapper()
      await wrapper.find('.modal-footer .btn-secondary').trigger('click')
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('deve emitir confirmar com os parâmetros calculados', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 600, height: 400 } })
      wrapper.vm.papel = 'A3'
      wrapper.vm.orientacao = 'retrato'
      wrapper.vm.modoAjuste = 'pisoLegibilidade'
      await nextTick()

      await wrapper.find('.modal-footer .btn-primary').trigger('click')

      expect(wrapper.emitted('confirmar')).toBeTruthy()
      expect(wrapper.emitted('confirmar')[0][0]).toEqual({
        formato: 'pdf',
        papel: 'A3',
        orientacao: 'retrato',
        modoAjuste: 'pisoLegibilidade',
        escala: wrapper.vm.resultadoAjuste.escala,
        folhas: wrapper.vm.resultadoAjuste.folhas,
      })
    })
  })

  describe('Pré-visualização', () => {
    it('deve chamar capturarPreview ao abrir o modal e usar a imagem retornada', async () => {
      const capturarPreview = vi.fn().mockResolvedValue({
        canvas: { toDataURL: () => 'data:image/png;base64,mock' },
      })
      wrapper = createWrapper({ visivel: false, capturarPreview })
      await wrapper.setProps({ visivel: true })
      await flushPromises()

      expect(capturarPreview).toHaveBeenCalledWith(1)
      expect(wrapper.vm.capturaPreviewUrl).toBe('data:image/png;base64,mock')
    })

    it('deve tratar falha na captura sem lançar erro, mantendo a pré-visualização vazia', async () => {
      const capturarPreview = vi.fn().mockRejectedValue(new Error('falha'))
      wrapper = createWrapper({ visivel: false, capturarPreview })
      await wrapper.setProps({ visivel: true })
      await flushPromises()

      expect(wrapper.vm.capturaPreviewUrl).toBeNull()
      expect(wrapper.vm.carregandoPreview).toBe(false)
    })

    it('não deve chamar capturarPreview quando a função não for informada', async () => {
      wrapper = createWrapper({ visivel: false, capturarPreview: null })
      await wrapper.setProps({ visivel: true })
      await flushPromises()

      expect(wrapper.vm.capturaPreviewUrl).toBeNull()
    })
  })

  describe('Navegação de páginas', () => {
    it('deve trocar a página atual dentro dos limites válidos', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()

      expect(wrapper.vm.totalFolhas).toBeGreaterThan(1)
      wrapper.vm.irParaPagina(1)
      expect(wrapper.vm.paginaAtual).toBe(1)
    })

    it('não deve trocar a página quando o índice for inválido', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()

      wrapper.vm.irParaPagina(-1)
      expect(wrapper.vm.paginaAtual).toBe(0)

      wrapper.vm.irParaPagina(999)
      expect(wrapper.vm.paginaAtual).toBe(0)
    })

    it('deve reiniciar a página atual ao trocar o papel ou o modo de ajuste', async () => {
      wrapper = createWrapper({ dimensaoOrganograma: { width: 20000, height: 4000 } })
      wrapper.vm.modoAjuste = 'manterPaginar'
      await nextTick()
      wrapper.vm.irParaPagina(1)
      expect(wrapper.vm.paginaAtual).toBe(1)

      wrapper.vm.papel = 'A3'
      await nextTick()
      expect(wrapper.vm.paginaAtual).toBe(0)
    })
  })
})
