export const documentTypes = {
  escala: 'Escala de funcionários',
  recibo_funcionario: 'Recibo de funcionário',
  recibo_paciente: 'Recibo de paciente',
  prontuario_funcionario: 'Prontuário de funcionário',
  prontuario_paciente: 'Prontuário de paciente',
  contrato_funcionario: 'Contrato de funcionário',
  contrato_paciente: 'Contrato de paciente',
} as const
export type DocumentType = keyof typeof documentTypes
export type Field = { key: string; label: string; type?: string; required?: boolean }
const identity: Field[] = [{ key: 'cpf', label: 'CPF / documento' }, { key: 'endereco', label: 'Endereço' }]
export function fieldsFor(type: DocumentType): Field[] {
  if (type === 'escala') return [
    { key: 'periodo', label: 'Período / competência', required: true },
    { key: 'funcao', label: 'Função / setor' },
    { key: 'plantoes', label: 'Plantões (data, funcionário, entrada, saída, intervalo e folga por linha)', type: 'textarea', required: true },
    { key: 'responsavel', label: 'Responsável pela escala' },
  ]
  if (type.startsWith('recibo')) return [...identity,
    { key: 'pagador', label: 'Pagador', required: true },
    { key: 'recebedor', label: 'Recebedor', required: true },
    { key: 'valor', label: 'Valor recebido (R$)', type: 'number', required: true },
    { key: 'referencia', label: 'Referente a / competência', required: true },
    { key: 'pagamento', label: 'Forma de pagamento', required: true },
  ]
  if (type.startsWith('prontuario')) return [...identity,
    { key: 'nascimento', label: 'Data de nascimento', type: 'date' },
    { key: 'contato', label: 'Contato / responsável e telefone' },
    { key: 'historico', label: type === 'prontuario_paciente' ? 'Histórico e condições de saúde' : 'Histórico funcional / função / admissão', type: 'textarea' },
    { key: 'registros', label: 'Registros / evolução (data e descrição)', type: 'textarea', required: true },
    { key: 'cuidados', label: type === 'prontuario_paciente' ? 'Cuidados, alergias e medicamentos' : 'Observações e acompanhamento', type: 'textarea' },
    { key: 'responsavel', label: 'Profissional responsável / registro', required: true },
  ]
  return [...identity,
    { key: 'contratante', label: 'Contratante — nome e qualificação', type: 'textarea', required: true },
    { key: 'contratado', label: 'Contratado — nome e qualificação', type: 'textarea', required: true },
    { key: 'inicio', label: 'Início da vigência', type: 'date', required: true },
    { key: 'fim', label: 'Fim da vigência (se houver)', type: 'date' },
    { key: 'clausulas', label: 'Texto integral do contrato / cláusulas acordadas', type: 'textarea', required: true },
    { key: 'testemunhas', label: 'Testemunhas — nomes e documentos', type: 'textarea' },
  ]
}
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
export function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
