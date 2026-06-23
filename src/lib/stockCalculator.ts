import type { Medication, MedicationEntry } from '@/lib/types'
import { supabase } from '@/lib/supabase'

/**
 * Calcula o fator de consumo diário baseado no tipo de escala.
 * - regular: 1 (consome todos os dias)
 * - dias_pares / dias_impares: 0.5 (consome a cada 2 dias, em média)
 * - dias_semana: N/7 (consome N dias por semana)
 * - se_necessario: 0 (não desconta automaticamente)
 */
function getScaleFactor(med: Medication): number {
  const tipo = med.tipo_escala || 'regular'
  switch (tipo) {
    case 'regular':
      return 1
    case 'dias_pares':
    case 'dias_impares':
      return 0.5
    case 'dias_semana': {
      const dias = med.dias_semana || []
      return dias.length / 7
    }
    case 'se_necessario':
      return 0
    default:
      return 1
  }
}

/**
 * Calcula o consumo diário de um medicamento considerando
 * horários, quantidade por dose e tipo de escala.
 */
export function calcularConsumoDiario(med: Medication): number {
  if (!med.horario) return 0
  const timesPerDay = med.horario.split(',').filter(t => t.trim()).length
  const qtdPorDose = med.qtd_por_dose || 0
  const scaleFactor = getScaleFactor(med)
  return timesPerDay * qtdPorDose * scaleFactor
}

/**
 * Calcula o estoque atual de um medicamento com base em:
 * - Todas as entradas registradas (medication_entries)
 * - O consumo diário × dias passados desde a primeira entrada
 *
 * Se não houver entradas registradas, retorna null (não altera o estoque).
 */
export function calcularEstoqueAtual(
  med: Medication,
  entries: MedicationEntry[],
  hoje: Date = new Date()
): number | null {
  const medEntries = entries.filter(e => e.medication_id === med.id)

  if (medEntries.length === 0) {
    // Sem histórico de entradas — não podemos recalcular
    return null
  }

  // Soma total de todas as entradas
  const totalEntrado = medEntries.reduce((sum, e) => sum + (e.quantidade || 0), 0)

  // Data da primeira entrada registrada
  const datas = medEntries.map(e => new Date(e.data).getTime())
  const dataInicio = new Date(Math.min(...datas))

  // Normalizar para meia-noite para evitar fuso horário
  dataInicio.setHours(0, 0, 0, 0)
  const hojeNorm = new Date(hoje)
  hojeNorm.setHours(0, 0, 0, 0)

  const diasPassados = Math.max(
    0,
    Math.floor((hojeNorm.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24))
  )

  const consumoDiario = calcularConsumoDiario(med)
  const totalConsumido = consumoDiario * diasPassados

  return Math.max(0, Math.round(totalEntrado - totalConsumido))
}

/**
 * Recalcula e persiste o estoque de TODOS os medicamentos que possuem
 * histórico de entradas. Salva os valores recalculados via updateMed.
 *
 * @param medications - lista de todos os medicamentos
 * @param entries - lista de todas as entradas de estoque
 * @param updateMed - função de persistência (ex: useDb update)
 * @param hoje - data de referência (padrão: hoje)
 * @returns número de medicamentos atualizados
 */
export async function recalcularTodosEstoques(
  medications: Medication[],
  entries: MedicationEntry[],
  updateMed: (id: string, data: Partial<Medication>) => Promise<any>,
  hoje: Date = new Date()
): Promise<number> {
  let updatedCount = 0

  for (const med of medications) {
    const novoEstoque = calcularEstoqueAtual(med, entries, hoje)

    if (novoEstoque === null) continue // Sem entradas, pula

    // Só atualiza se o valor mudou, para evitar writes desnecessários
    if (novoEstoque !== med.estoque_atual) {
      await updateMed(med.id, { estoque_atual: novoEstoque } as any)
      updatedCount++
    }
  }

  return updatedCount
}

/**
 * Tenta vincular automaticamente as prescrições de medicação
 * (medications) ao produto correspondente no estoque (products)
 * com base na similaridade de nome e dosagem.
 *
 * A correspondência é feita normalizando os textos:
 * - Remove acentos, maiúsculas, espaços extras e hífens
 * - Verifica se o nome do produto contém o nome do medicamento
 *   e a dosagem (ou vice-versa)
 *
 * @returns número de vínculos criados
 */
export async function vincularMedicamentosAoProduto(
  medications: Medication[]
): Promise<number> {
  // Busca todos os produtos do tipo medicamento
  const { data: produtos, error } = await supabase
    .from('products')
    .select('id, nome, tipo')
    .or("tipo.eq.medicamento,tipo.ilike.MEDICAMENTO")

  if (error || !produtos) {
    console.error('Erro ao buscar produtos:', error)
    return 0
  }

  let vinculados = 0

  // Normaliza texto: lowercase, sem acento, só letras/números/espaço
  function normalizar(texto: string): string {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  for (const med of medications) {
    // Pula se já vinculado
    if ((med as any).product_id) continue

    const nomeMedNorm = normalizar(med.medicamento)
    const dosagemNorm = normalizar(med.dosagem || '')

    // Busca o produto cuja nome normalizado contenha o nome do medicamento
    let melhorProduto: any = null
    let melhorScore = 0

    for (const produto of produtos) {
      const nomeProdNorm = normalizar(produto.nome)

      // Verifica se o nome do produto contém o nome do medicamento
      const conteNome = nomeProdNorm.includes(nomeMedNorm) || nomeMedNorm.includes(nomeProdNorm.split(' ')[0])

      if (!conteNome) continue

      let score = 1

      // Bonus se a dosagem também estiver presente no nome do produto
      if (dosagemNorm && nomeProdNorm.includes(dosagemNorm.replace(/\s/g, ''))) {
        score += 2
      }

      // Verifica correspondência parcial de dosagem (ex: "100mg" vs "100 mg")
      const dosagemSemEspaco = dosagemNorm.replace(/\s/g, '')
      const prodNormSemEspaco = nomeProdNorm.replace(/\s/g, '')
      if (dosagemSemEspaco && prodNormSemEspaco.includes(dosagemSemEspaco)) {
        score += 3
      }

      if (score > melhorScore) {
        melhorScore = score
        melhorProduto = produto
      }
    }

    // Só vincula se tiver uma correspondência razoável
    if (melhorProduto && melhorScore >= 1) {
      const { error: updErr } = await supabase
        .from('medications')
        .update({ product_id: melhorProduto.id })
        .eq('id', med.id)

      if (!updErr) {
        vinculados++
      }
    }
  }

  return vinculados
}

/**
 * Sincroniza o estoque dos produtos (almoxarifado) com base
 * na soma dos estoques individuais dos pacientes (medications.estoque_atual),
 * agrupando por product_id.
 *
 * Apenas atualiza produtos do tipo "medicamento" que possuem
 * pelo menos um medication vinculado.
 *
 * @param medications - lista de todos os medicamentos dos pacientes
 * @returns número de produtos atualizados
 */
export async function sincronizarEstoqueProdutos(
  medications: Medication[]
): Promise<number> {
  // Agrupa estoque_atual por product_id
  const somaPorProduto: Record<string, number> = {}

  for (const med of medications) {
    const pid = (med as any).product_id
    if (!pid) continue
    if (somaPorProduto[pid] === undefined) somaPorProduto[pid] = 0
    somaPorProduto[pid] += med.estoque_atual || 0
  }

  const productIds = Object.keys(somaPorProduto)
  if (productIds.length === 0) return 0

  let atualizados = 0

  for (const productId of productIds) {
    const novoEstoque = Math.round(somaPorProduto[productId])

    const { error } = await supabase
      .from('products')
      .update({ estoque: novoEstoque })
      .eq('id', productId)

    if (!error) {
      atualizados++
    } else {
      console.error(`Erro ao atualizar produto ${productId}:`, error)
    }
  }

  return atualizados
}
