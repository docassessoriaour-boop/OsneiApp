import type { CompanySettings } from './types'
import { formatDatePDF, printPDF } from './pdf'

export type SanitaryDocumentStatus = 'pendente' | 'em_revisao' | 'vigente' | 'vencido'

export interface SanitaryDocument {
  id: string
  code: string
  title: string
  category: 'Legal' | 'Assistencial' | 'Alimentacao' | 'Higiene' | 'Medicamentos' | 'Indicadores' | 'Residuos'
  requirement: string
  legalBasis: string
  periodicity: string
  responsible: string
  status: SanitaryDocumentStatus
  isPop?: boolean
}

export interface PopProcedure {
  id: string
  code: string
  title: string
  objective: string
  scope: string
  legalBasis: string
  responsible: string
  materials: string[]
  steps: string[]
  records: string[]
  indicators: string[]
}

export interface SanitaryAppendixField {
  key: string
  label: string
  type?: 'text' | 'date' | 'datetime-local' | 'time' | 'number' | 'textarea'
}

export interface SanitaryAppendix {
  id: string
  code: string
  title: string
  relatedTo: string
  purpose: string
  fields: SanitaryAppendixField[]
}

export const sanitaryDocuments: SanitaryDocument[] = [
  {
    id: 'alvara-sanitario',
    code: 'DOC 01',
    title: 'Alvara sanitario atualizado',
    category: 'Legal',
    requirement: 'Manter documento vigente e acessivel para fiscalizacao.',
    legalBasis: 'RDC Anvisa 502/2021, art. 8o',
    periodicity: 'Conforme vencimento do alvara',
    responsible: 'Administracao / RT',
    status: 'pendente',
  },
  {
    id: 'constituicao-regimento',
    code: 'DOC 02',
    title: 'Constituicao legal, estatuto/contrato social e regimento interno',
    category: 'Legal',
    requirement: 'Comprovar constituicao legal e regras internas de funcionamento.',
    legalBasis: 'RDC Anvisa 502/2021, art. 9o',
    periodicity: 'Revisar sempre que houver alteracao societaria ou operacional',
    responsible: 'Administracao',
    status: 'pendente',
  },
  {
    id: 'responsavel-tecnico',
    code: 'DOC 03',
    title: 'Responsavel Tecnico e registro profissional quando aplicavel',
    category: 'Assistencial',
    requirement: 'Identificar RT, formacao, carga horaria e registros dos profissionais de saude vinculados.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 10, 11, 16 e 17',
    periodicity: 'Mensal ou a cada troca de profissional',
    responsible: 'RT / RH',
    status: 'pendente',
  },
  {
    id: 'contratos-residentes',
    code: 'DOC 04',
    title: 'Contratos formais de prestacao de servico dos residentes',
    category: 'Legal',
    requirement: 'Guardar contratos assinados com idoso, responsavel legal ou curador.',
    legalBasis: 'RDC Anvisa 502/2021, art. 12',
    periodicity: 'Na admissao e renovacoes',
    responsible: 'Administracao',
    status: 'pendente',
  },
  {
    id: 'plano-atencao-saude',
    code: 'DOC 05',
    title: 'Plano de Atencao Integral a Saude dos residentes',
    category: 'Assistencial',
    requirement: 'Elaborar plano bienal articulado com a rede local de saude e avaliar sua efetividade.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 36, 37 e 38',
    periodicity: 'A cada 2 anos, com avaliacao anual',
    responsible: 'RT',
    status: 'pendente',
  },
  {
    id: 'vacinas-residentes',
    code: 'DOC 06',
    title: 'Comprovantes de vacinacao obrigatoria dos residentes',
    category: 'Assistencial',
    requirement: 'Disponibilizar comprovacao conforme PNI quando solicitada.',
    legalBasis: 'RDC Anvisa 502/2021, art. 39',
    periodicity: 'Continuo',
    responsible: 'RT / Enfermagem',
    status: 'pendente',
  },
  {
    id: 'pop-07-admissao-triagem',
    code: 'POP 07',
    title: 'Admissao e triagem de residentes',
    category: 'Assistencial',
    requirement: 'Padronizar admissao, triagem, avaliacao inicial, documentos e comunicacao com responsaveis.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 12, 33, 36, 37 e 41',
    periodicity: 'Revisao anual ou quando houver mudanca do fluxo',
    responsible: 'RT / Administracao',
    status: 'vigente',
    isPop: true,
  },
  {
    id: 'pop-08-medicamentos',
    code: 'POP 08',
    title: 'Administracao e guarda de medicamentos',
    category: 'Medicamentos',
    requirement: 'Padronizar recebimento, guarda, preparo, administracao, registro e devolucao/descarte de medicamentos.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 40 e 41',
    periodicity: 'Revisao anual ou quando houver mudanca no processo',
    responsible: 'RT / Enfermagem',
    status: 'vigente',
    isPop: true,
  },
  {
    id: 'rotinas-alimentacao',
    code: 'DOC 09',
    title: 'Normas e rotinas tecnicas de alimentacao',
    category: 'Alimentacao',
    requirement: 'Manter rotinas de higienizacao, armazenagem, preparo, controle de vetores e residuos da cozinha.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 44, 45 e 46; RDC Anvisa 216/2004',
    periodicity: 'Revisao anual',
    responsible: 'Nutricionista / RT',
    status: 'pendente',
  },
  {
    id: 'rotinas-lavanderia',
    code: 'DOC 10',
    title: 'Rotinas tecnicas de lavanderia e guarda de roupas',
    category: 'Higiene',
    requirement: 'Definir lavagem, secagem, passagem, reparo, identificacao e guarda de roupas.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 47 a 50',
    periodicity: 'Revisao anual',
    responsible: 'Administracao / Lavanderia',
    status: 'pendente',
  },
  {
    id: 'rotinas-limpeza',
    code: 'DOC 11',
    title: 'Rotinas de limpeza e higienizacao de artigos e ambientes',
    category: 'Higiene',
    requirement: 'Manter ambientes limpos e rotinas escritas de higienizacao.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 51, 52 e 53',
    periodicity: 'Revisao anual',
    responsible: 'Administracao / Limpeza',
    status: 'pendente',
  },
  {
    id: 'eventos-sentinela',
    code: 'DOC 12',
    title: 'Fluxo de notificacao de eventos sentinela e agravos compulsorios',
    category: 'Assistencial',
    requirement: 'Definir registro e comunicacao de queda com lesao, tentativa de suicidio e notificacoes compulsorias.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 54 a 57',
    periodicity: 'Continuo',
    responsible: 'RT / Equipe de saude',
    status: 'pendente',
  },
  {
    id: 'indicadores-anuais',
    code: 'DOC 13',
    title: 'Indicadores mensais e consolidado anual da ILPI',
    category: 'Indicadores',
    requirement: 'Realizar avaliacao continuada e encaminhar consolidado anual em janeiro.',
    legalBasis: 'RDC Anvisa 502/2021, arts. 58, 59 e 60',
    periodicity: 'Mensal; consolidado anual em janeiro',
    responsible: 'RT / Administracao',
    status: 'pendente',
  },
  {
    id: 'pgrss',
    code: 'DOC 14',
    title: 'Plano de Gerenciamento de Residuos de Servicos de Saude - PGRSS',
    category: 'Residuos',
    requirement: 'Controlar segregacao, acondicionamento e destinacao de residuos gerados na rotina assistencial.',
    legalBasis: 'RDC Anvisa 222/2018; RDC Anvisa 502/2021, art. 46, V',
    periodicity: 'Revisao anual ou quando houver mudanca no processo',
    responsible: 'RT / Administracao',
    status: 'pendente',
  },
]

export const sanitaryAppendices: SanitaryAppendix[] = [
  {
    id: 'anexo-a-limpeza',
    code: 'Anexo A',
    title: 'Registro de limpeza de ambientes',
    relatedTo: 'POP 01 - Higienizacao e Sanificacao de Ambientes / DOC 11',
    purpose: 'Registrar execucao da limpeza, produto utilizado, responsavel e observacoes do ambiente.',
    fields: [
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'horario', label: 'Horario', type: 'time' },
      { key: 'ambiente', label: 'Ambiente' },
      { key: 'produto_usado', label: 'Produto usado' },
      { key: 'responsavel', label: 'Responsavel' },
      { key: 'assinatura', label: 'Assinatura' },
      { key: 'observacoes', label: 'Observacoes', type: 'textarea' },
    ],
  },
  {
    id: 'anexo-b-temperatura',
    code: 'Anexo B',
    title: 'Controle de temperatura',
    relatedTo: 'POP 05 - Alimentos / DOC 09',
    purpose: 'Controlar temperatura de geladeira, freezer ou equipamento e registrar conduta quando estiver fora do padrao.',
    fields: [
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'equipamento', label: 'Geladeira/freezer/equipamento' },
      { key: 'temperatura', label: 'Temperatura', type: 'number' },
      { key: 'conduta', label: 'Conduta se fora do padrao', type: 'textarea' },
      { key: 'responsavel', label: 'Responsavel' },
    ],
  },
  {
    id: 'anexo-c-medicamentos',
    code: 'Anexo C',
    title: 'Controle de medicamentos',
    relatedTo: 'POP 08 - Administracao e Guarda de Medicamentos',
    purpose: 'Registrar administracao, responsavel e intercorrencias relacionadas a medicamentos.',
    fields: [
      { key: 'residente', label: 'Residente' },
      { key: 'medicamento', label: 'Medicamento' },
      { key: 'dose', label: 'Dose' },
      { key: 'horario', label: 'Horario', type: 'time' },
      { key: 'administrado_por', label: 'Administrado por' },
      { key: 'intercorrencia', label: 'Intercorrencia', type: 'textarea' },
    ],
  },
  {
    id: 'anexo-d-quedas',
    code: 'Anexo D',
    title: 'Registro de quedas',
    relatedTo: 'POP 10 - Urgencias, Emergencias e Obitos / DOC 12',
    purpose: 'Registrar queda, circunstancia, lesao aparente, conduta e comunicacao familiar.',
    fields: [
      { key: 'residente', label: 'Residente' },
      { key: 'data_hora', label: 'Data/hora', type: 'datetime-local' },
      { key: 'local', label: 'Local' },
      { key: 'circunstancia', label: 'Circunstancia', type: 'textarea' },
      { key: 'lesao_aparente', label: 'Lesao aparente', type: 'textarea' },
      { key: 'conduta', label: 'Conduta', type: 'textarea' },
      { key: 'familiar_comunicado', label: 'Familiar comunicado' },
    ],
  },
  {
    id: 'anexo-e-lesao-pressao',
    code: 'Anexo E',
    title: 'Registro de lesao por pressao',
    relatedTo: 'POP 09 - Higiene Pessoal do Residente / Plano de Atencao a Saude',
    purpose: 'Registrar identificacao, local, estagio quando avaliado, conduta e evolucao da lesao.',
    fields: [
      { key: 'residente', label: 'Residente' },
      { key: 'local_lesao', label: 'Local da lesao' },
      { key: 'estagio', label: 'Estagio se avaliado' },
      { key: 'data_identificacao', label: 'Data de identificacao', type: 'date' },
      { key: 'conduta', label: 'Conduta', type: 'textarea' },
      { key: 'evolucao', label: 'Evolucao', type: 'textarea' },
    ],
  },
  {
    id: 'anexo-f-treinamento',
    code: 'Anexo F',
    title: 'Controle de treinamento',
    relatedTo: 'DOC 03 - Responsavel Tecnico e registros profissionais / Educacao permanente',
    purpose: 'Registrar tema, data, carga horaria, instrutor, participantes e assinaturas.',
    fields: [
      { key: 'tema', label: 'Tema' },
      { key: 'data', label: 'Data', type: 'date' },
      { key: 'carga_horaria', label: 'Carga horaria' },
      { key: 'instrutor', label: 'Instrutor' },
      { key: 'participantes', label: 'Participantes', type: 'textarea' },
      { key: 'assinaturas', label: 'Assinaturas', type: 'textarea' },
    ],
  },
  {
    id: 'anexo-g-checklist-fiscalizacao',
    code: 'Anexo G',
    title: 'Checklist de fiscalizacao interna',
    relatedTo: 'DOC 13 - Indicadores e avaliacao continuada',
    purpose: 'Registrar item verificado, conformidade, prazo, responsavel e evidencia para correcao interna.',
    fields: [
      { key: 'item_verificado', label: 'Item verificado' },
      { key: 'conforme', label: 'Conforme' },
      { key: 'nao_conforme', label: 'Nao conforme' },
      { key: 'prazo', label: 'Prazo', type: 'date' },
      { key: 'responsavel', label: 'Responsavel' },
      { key: 'evidencia', label: 'Evidencia', type: 'textarea' },
    ],
  },
]

export const popProcedures: PopProcedure[] = [
  {
    id: 'pop-07-admissao-triagem',
    code: 'POP 07',
    title: 'Admissao e triagem de residentes',
    objective: 'Padronizar o fluxo de admissao do residente, garantindo coleta documental, avaliacao inicial, definicao do grau de dependencia, orientacoes ao responsavel e abertura dos registros assistenciais.',
    scope: 'Aplica-se a toda admissao, retorno apos ausencia prolongada ou transferencia interna de residentes da ILPI.',
    legalBasis: 'RDC Anvisa 502/2021, especialmente arts. 12, 33, 36, 37 e 41.',
    responsible: 'Responsavel Tecnico, administracao, enfermagem/cuidador designado e equipe multiprofissional quando houver.',
    materials: [
      'Ficha cadastral do residente e do responsavel',
      'Documento de identidade, CPF, cartao SUS e comprovantes apresentados',
      'Contrato formal de prestacao de servico',
      'Prescricoes, laudos, exames, carteira de vacinacao e lista de medicamentos em uso',
      'Instrumento interno de avaliacao do grau de dependencia e plano inicial de cuidados',
    ],
    steps: [
      'Conferir identidade do residente e do responsavel, documentos obrigatorios e condicoes contratuais antes da entrada.',
      'Realizar entrevista inicial com residente e responsavel, registrando historico de saude, alergias, quedas, restricoes alimentares, autonomia, rotina, contatos de emergencia e preferencias relevantes.',
      'Registrar medicamentos em uso somente com prescricao valida, incluindo nome, dose, via, horario, prazo e observacoes clinicas.',
      'Avaliar grau de dependencia e necessidades imediatas de higiene, mobilidade, alimentacao, risco de queda, cognicao e comunicacao.',
      'Abrir prontuario ou registro individual atualizado, anexando documentos e plano inicial de cuidados.',
      'Orientar residente e responsavel sobre regras da ILPI, pertences permitidos, rotina de visitas, comunicacao de intercorrencias e responsabilidades financeiras/assistenciais.',
      'Comunicar a equipe sobre cuidados prioritarios antes da acomodacao definitiva.',
      'Registrar pendencias documentais e definir prazo para regularizacao com assinatura do responsavel.',
    ],
    records: [
      'Ficha de admissao e triagem assinada',
      'Contrato de prestacao de servico',
      'Plano inicial de cuidados',
      'Relacao de pertences e medicamentos recebidos',
      'Pendencias documentais e prazos de regularizacao',
    ],
    indicators: [
      'Percentual de admissoes com ficha completa no dia da entrada',
      'Quantidade de pendencias documentais por admissao',
      'Tempo medio para conclusao do plano inicial de cuidados',
    ],
  },
  {
    id: 'pop-08-medicamentos',
    code: 'POP 08',
    title: 'Administracao e guarda de medicamentos',
    objective: 'Padronizar recebimento, armazenamento, preparo, administracao, registro, controle de validade e destinacao de medicamentos utilizados pelos residentes.',
    scope: 'Aplica-se a todos os medicamentos de uso individual dos residentes mantidos ou administrados pela ILPI.',
    legalBasis: 'RDC Anvisa 502/2021, especialmente arts. 40 e 41, e demais normas sanitarias locais aplicaveis.',
    responsible: 'Responsavel Tecnico e profissionais autorizados/designados para o processo de medicacao.',
    materials: [
      'Prescricao medica vigente',
      'Ficha ou sistema de administracao de medicamentos',
      'Armario, gaveta ou caixa identificada para guarda individualizada',
      'Etiquetas de identificacao do residente',
      'Equipamentos de protecao e materiais de higiene das maos',
    ],
    steps: [
      'Receber medicamentos conferindo residente, nome do medicamento, dose, quantidade, validade, integridade da embalagem e prescricao correspondente.',
      'Registrar a entrada, separar por residente e identificar medicamentos de uso continuo, temporario, controlado ou se necessario.',
      'Guardar medicamentos em local limpo, seco, organizado, restrito a pessoas autorizadas e conforme orientacao de conservacao do fabricante.',
      'Antes da administracao, conferir os certos da medicacao: residente, medicamento, dose, horario, via, validade, prescricao e registro.',
      'Higienizar as maos, preparar apenas a dose do horario e administrar conforme prescricao e condicao do residente.',
      'Registrar imediatamente administracao, recusa, ausencia, vomito, intercorrencia, atraso ou medicamento nao administrado, comunicando o RT quando necessario.',
      'Nao manter estoque de medicamento sem prescricao medica e solicitar atualizacao de receita sempre que houver alteracao terapeutica.',
      'Controlar validade e quantidade, providenciando devolucao ao responsavel ou destinacao conforme orientacao sanitaria para itens vencidos, suspensos ou sem identificacao segura.',
    ],
    records: [
      'Prescricao medica atualizada',
      'Ficha de entrada e controle de medicamentos',
      'Registro de administracao por residente',
      'Registro de intercorrencias, recusas e devolucoes',
      'Checklist periodico de validade e organizacao',
    ],
    indicators: [
      'Quantidade de administracoes nao realizadas por motivo',
      'Quantidade de medicamentos vencidos encontrados em conferencia',
      'Percentual de residentes com prescricao vigente anexada',
    ],
  },
]

export function getPopById(id: string) {
  return popProcedures.find(pop => pop.id === id)
}

export function getSanitaryStatusLabel(status: SanitaryDocumentStatus) {
  const labels: Record<SanitaryDocumentStatus, string> = {
    pendente: 'Pendente',
    em_revisao: 'Em revisao',
    vigente: 'Vigente',
    vencido: 'Vencido',
  }
  return labels[status]
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function listItems(items: string[]) {
  return `<ol>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`
}

function formatFieldValue(field: SanitaryAppendixField, value?: string) {
  if (!value) return ''
  if (field.type === 'date') return formatDatePDF(value)
  if (field.type === 'datetime-local') {
    const [date, time] = value.split('T')
    return `${formatDatePDF(date)} ${time || ''}`.trim()
  }
  return escapeHtml(value)
}

export function buildPopHtml(pop: PopProcedure) {
  return `
    <style>
      .pop-cover { border: 1px solid #cbd5e1; margin-bottom: 16px; }
      .pop-row { display: grid; grid-template-columns: 145px 1fr; border-bottom: 1px solid #cbd5e1; }
      .pop-row:last-child { border-bottom: 0; }
      .pop-label { background: #f1f5f9; font-weight: 700; padding: 7px; border-right: 1px solid #cbd5e1; }
      .pop-value { padding: 7px; }
      .pop-section h3 { margin-top: 16px; }
      .pop-section p, .pop-section li { font-size: 10.5pt; line-height: 1.45; }
      .pop-section ol, .pop-section ul { margin-left: 18px; }
      .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 52px; }
      .signature-box { text-align: center; font-size: 10pt; }
      .signature-box div { border-top: 1px solid #111; padding-top: 5px; }
    </style>
    <div class="pop-cover">
      <div class="pop-row"><div class="pop-label">Codigo</div><div class="pop-value"><strong>${pop.code}</strong></div></div>
      <div class="pop-row"><div class="pop-label">Titulo</div><div class="pop-value"><strong>${escapeHtml(pop.title)}</strong></div></div>
      <div class="pop-row"><div class="pop-label">Versao</div><div class="pop-value">01</div></div>
      <div class="pop-row"><div class="pop-label">Vigencia</div><div class="pop-value">${new Date().toLocaleDateString('pt-BR')}</div></div>
      <div class="pop-row"><div class="pop-label">Revisao</div><div class="pop-value">Anual ou quando houver mudanca do processo</div></div>
      <div class="pop-row"><div class="pop-label">Responsavel</div><div class="pop-value">${escapeHtml(pop.responsible)}</div></div>
    </div>
    <div class="pop-section">
      <h3>1. Objetivo</h3>
      <p>${escapeHtml(pop.objective)}</p>
      <h3>2. Abrangencia</h3>
      <p>${escapeHtml(pop.scope)}</p>
      <h3>3. Base normativa</h3>
      <p>${escapeHtml(pop.legalBasis)} A rotina deve ser validada pelo Responsavel Tecnico e ajustada as exigencias da Vigilancia Sanitaria local.</p>
      <h3>4. Materiais e documentos necessarios</h3>
      ${listItems(pop.materials)}
      <h3>5. Procedimento operacional</h3>
      ${listItems(pop.steps)}
      <h3>6. Registros obrigatorios</h3>
      ${listItems(pop.records)}
      <h3>7. Monitoramento recomendado</h3>
      ${listItems(pop.indicators)}
      <h3>8. Controle de revisao</h3>
      <table>
        <thead><tr><th>Versao</th><th>Data</th><th>Alteracao</th><th>Responsavel</th></tr></thead>
        <tbody><tr><td>01</td><td>${new Date().toLocaleDateString('pt-BR')}</td><td>Emissao inicial pelo sistema</td><td>RT / Administracao</td></tr></tbody>
      </table>
      <div class="signature-grid">
        <div class="signature-box"><div>Responsavel Tecnico</div></div>
        <div class="signature-box"><div>Direcao / Administracao</div></div>
      </div>
    </div>
  `
}

export function buildSanitaryFolderReportHtml(documents: SanitaryDocument[]) {
  const rows = documents.map(doc => `
    <tr>
      <td><strong>${doc.code}</strong></td>
      <td>${escapeHtml(doc.title)}</td>
      <td>${escapeHtml(doc.requirement)}</td>
      <td>${escapeHtml(doc.legalBasis)}</td>
      <td>${escapeHtml(doc.periodicity)}</td>
      <td>${getSanitaryStatusLabel(doc.status)}</td>
    </tr>
  `).join('')

  const popRows = documents.filter(doc => doc.isPop).map(doc => `
    <tr>
      <td><strong>${doc.code}</strong></td>
      <td>${escapeHtml(doc.title)}</td>
      <td>${escapeHtml(doc.legalBasis)}</td>
      <td>${getSanitaryStatusLabel(doc.status)}</td>
    </tr>
  `).join('')

  const appendixRows = sanitaryAppendices.map(appendix => `
    <tr>
      <td><strong>${appendix.code}</strong></td>
      <td>${escapeHtml(appendix.title)}</td>
      <td>${escapeHtml(appendix.relatedTo)}</td>
      <td>${escapeHtml(appendix.fields.map(field => field.label).join(', '))}</td>
    </tr>
  `).join('')

  return `
    <h2 style="text-align:center; text-transform:uppercase;">Controle de Documentos da Pasta Sanitaria</h2>
    <p style="font-size: 11pt; margin-bottom: 14px;">Documento de apoio para organizacao dos registros exigidos para ILPI, com base na RDC Anvisa 502/2021 e normas relacionadas. Deve ser revisado pelo Responsavel Tecnico e adequado as exigencias locais.</p>
    <table>
      <thead>
        <tr>
          <th>Codigo</th>
          <th>Documento</th>
          <th>Exigencia/controle</th>
          <th>Base</th>
          <th>Periodicidade</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <h3>POPs vinculados aos relatorios</h3>
    <table>
      <thead><tr><th>POP</th><th>Titulo</th><th>Base normativa</th><th>Status</th></tr></thead>
      <tbody>${popRows}</tbody>
    </table>
    <h3>Anexos e formularios de registro</h3>
    <table>
      <thead><tr><th>Anexo</th><th>Formulario</th><th>Relacionado a</th><th>Campos para registro</th></tr></thead>
      <tbody>${appendixRows}</tbody>
    </table>
    <div class="signature">
      <div class="signature-line"><hr />Responsavel Tecnico</div>
      <div class="signature-line"><hr />Administracao</div>
    </div>
  `
}

export function buildAppendixHtml(appendix: SanitaryAppendix, values: Record<string, string> = {}, blankRows = 10) {
  const hasValues = appendix.fields.some(field => values[field.key])
  const rows = hasValues
    ? [appendix.fields.map(field => formatFieldValue(field, values[field.key]))]
    : Array.from({ length: blankRows }, () => appendix.fields.map(() => '&nbsp;'))

  return `
    <style>
      .appendix-meta { border: 1px solid #cbd5e1; margin-bottom: 6px; }
      .appendix-row { display: grid; grid-template-columns: 105px 1fr; border-bottom: 1px solid #cbd5e1; }
      .appendix-row:last-child { border-bottom: 0; }
      .appendix-label { background: #f1f5f9; font-size: 7pt; font-weight: 700; padding: 3px 5px; border-right: 1px solid #cbd5e1; }
      .appendix-value { font-size: 7pt; line-height: 1.15; padding: 3px 5px; }
      .appendix-table { margin: 4px 0 0 !important; }
      .appendix-table th,
      .appendix-table td {
        padding: 1px 4px !important;
        font-size: 6.7pt !important;
        line-height: 1.05 !important;
      }
      .appendix-table th { height: 14px; }
      .appendix-table td { height: ${hasValues ? '24px' : '17px'}; vertical-align: top; }
      .appendix-note { font-size: 6.8pt; color: #475569; margin-top: 5px; }
      .signature { margin-top: 24px !important; }
      .signature-line { font-size: 7pt !important; }
      .signature-line hr { margin-bottom: 2px !important; }
    </style>
    <div class="appendix-meta">
      <div class="appendix-row"><div class="appendix-label">Relacionado a</div><div class="appendix-value">${escapeHtml(appendix.relatedTo)}</div></div>
      <div class="appendix-row"><div class="appendix-label">Finalidade</div><div class="appendix-value">${escapeHtml(appendix.purpose)}</div></div>
      <div class="appendix-row"><div class="appendix-label">Emissao</div><div class="appendix-value">${new Date().toLocaleDateString('pt-BR')}</div></div>
    </div>
    <table class="appendix-table">
      <thead>
        <tr>${appendix.fields.map(field => `<th>${escapeHtml(field.label)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cell => `<td>${cell || '&nbsp;'}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    <p class="appendix-note">Formulario para preenchimento pelo sistema ou manualmente. Conferir assinatura, responsavel e arquivamento junto a pasta sanitaria da ILPI.</p>
    <div class="signature">
      <div class="signature-line"><hr />Responsavel pelo registro</div>
      <div class="signature-line"><hr />Responsavel Tecnico / Supervisor</div>
    </div>
  `
}

export function printPop(pop: PopProcedure, clinic?: CompanySettings) {
  printPDF(`${pop.code} - ${pop.title}`, buildPopHtml(pop), clinic, { hideLogo: true, pageMargin: '1.2cm' })
}

export function printSanitaryFolderReport(documents: SanitaryDocument[], clinic?: CompanySettings) {
  printPDF('Controle de Documentos da Pasta Sanitaria', buildSanitaryFolderReportHtml(documents), clinic, { hideLogo: true, orientation: 'landscape', pageMargin: '0.9cm' })
}

export function printAppendix(appendix: SanitaryAppendix, values: Record<string, string> = {}, clinic?: CompanySettings, blankRows?: number) {
  printPDF(`${appendix.code} - ${appendix.title}`, buildAppendixHtml(appendix, values, blankRows), clinic, { hideLogo: true, orientation: 'landscape', pageMargin: '0.35cm', compactLayout: true })
}

export function getTodayPtBr() {
  return formatDatePDF(new Date().toISOString().slice(0, 10))
}
