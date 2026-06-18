import type { Medication, MedicationEntry } from '@/lib/types'

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
