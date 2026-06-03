export interface Employee {
  id: string
  nome: string
  cpf: string
  rg: string
  cargo: string
  escala: '12x36' | '40h' | 'Mensalista' | 'Manual' | 'Dobra'
  salario: number
  status: 'ativo' | 'inativo' | 'ferias' | 'contrato_cancelado'
  unidade: 'Vila Moraes' | 'Jardim Matilde' | 'Ambas'
  turno: 'Diurno' | 'Noturno'
  dataAdmissao: string
  telefone: string
  email: string
  endereco: string
  tem_vt: boolean
  vt_tipo?: string
  vt_valor: number
  tem_insalubridade: boolean
  insalubridade_percentual: number
  cep?: string
  cidade?: string
  uf?: string
  data_nascimento?: string
  dados_bancarios?: string
  chave_pix?: string
  is_pro_labore?: boolean
  descontos_fixos?: number
}

export interface Curriculum {
  id: string
  nome: string
  telefone: string
  endereco: string
  rg: string
  cpf: string
  cargo_pretendido?: string
  status: 'aprovado' | 'em_analise' | 'agendar_entrevista' | 'rejeitado'
  data_nascimento?: string
  created_at?: string
  data_entrevista?: string
  hora_entrevista?: string
  local_entrevista?: string
  cep?: string
  cidade?: string
  uf?: string
}

export interface Responsible {
  nome: string
  cpf: string
  rg?: string
  telefone?: string
  is_whatsapp?: boolean
  email?: string
  endereco?: string
  cidade?: string
  uf?: string
  cep?: string
  nacionalidade?: string
  estado_civil?: string
  profissao?: string
}

export interface Patient {
  id: string
  nome: string
  cpf: string
  rg: string
  idade: number
  data_nascimento: string
  responsavel: string
  telefone_responsavel: string
  resp_is_whatsapp?: boolean
  resp_rg: string
  resp_cpf: string
  resp_endereco: string
  resp_cidade: string
  resp_uf: string
  resp_cep: string
  resp_email: string
  resp_nacionalidade?: string
  resp_estado_civil?: string
  resp_profissao?: string
  status: 'ativo' | 'inativo'
  unidade: 'Vila Moraes' | 'Jardim Matilde'
  data_entrada: string
  observacoes: string
  outros_responsaveis?: Responsible[]
}

export interface Medication {
  id: string
  pacienteId: string
  pacienteNome: string
  medicamento: string
  dosagem: string
  horario: string
  frequencia: string
  observacoes: string
  estoque_atual?: number
  estoque_minimo?: number
  qtd_por_dose?: number
  unidade_medida?: string
  tipo_escala?: 'regular' | 'dias_impares' | 'dias_pares' | 'dias_semana' | 'se_necessario'
  dias_semana?: string[]
  embalagem_completa?: number
}

export interface BaseMedication {
  id: string
  nome: string
  dosagem_padrao?: string
  unidade_medida_padrao?: string
  para_que_serve?: string
  created_at?: string
}

export interface MedicationEntry {
  id: string
  medication_id: string
  paciente_id: string
  data: string
  quantidade: number
  observacoes?: string
}

export interface Appointment {
  id: string
  pacienteId: string
  pacienteNome: string
  tipo: string
  data: string
  horario: string
  profissional: string
  status: 'agendado' | 'realizado' | 'cancelado'
  observacoes: string
}

export interface CompanionEntry {
  id: string
  paciente_id: string
  paciente_nome?: string
  data_inicio: string
  data_fim: string
  nome_acompanhante?: string
  tipo?: string
  local?: string
  responsavel?: string
  valor: number
  status?: string
  created_at?: string
}

export interface Contract {
  id: string
  numero_contrato?: string
  pacienteId: string
  pacienteNome: string
  valor: number
  valorExtra?: number
  descricaoExtra?: string
  dataInicio: string
  dataFim: string
  status: 'ativo' | 'vencido' | 'cancelado'
  observacoes: string
}

export interface TransactionCategory {
  id: string
  nome: string
  tipo: 'receita' | 'despesa'
  cor?: string
  icone?: string
}

export interface BankAccount {
  id: string
  nome: string
  banco: string
  tipo: 'corrente' | 'poupanca' | 'investimento' | 'caixa'
  saldo_inicial: number
  saldo_atual: number
  cor_identificacao?: string
}

export interface Bill {
  id: string
  descricao: string
  categoria?: string
  category_id?: string
  valor: number
  vencimento: string
  status: 'pendente' | 'pago' | 'vencido' | 'parcial'
  payment_date?: string
  bank_account_id?: string
  bank_transaction_id?: string
}

export interface Income {
  id: string
  descricao: string
  categoria?: string
  category_id?: string
  valor: number
  vencimento: string
  status: 'pendente' | 'recebido' | 'vencido' | 'parcial'
  invoiceId?: string
  payment_date?: string
  bank_account_id?: string
  bank_transaction_id?: string
  paid_by?: string
  paid_by_phone?: string
  paid_by_document?: string
  valor_pago?: number
}

export interface InvoiceItem {
  description: string
  quantity: number
  price: number
}

export interface Invoice {
  id: string
  patient_id?: string
  client_name: string
  client_document: string
  date_issued: string
  due_date: string
  total_amount: number
  status: 'pendente' | 'pago' | 'cancelado' | 'parcial'
  items: InvoiceItem[]
  income_id?: string
  payment_date?: string
  bank_account_id?: string
  bank_transaction_id?: string
  paid_by?: string
  paid_by_phone?: string
  paid_by_document?: string
  valor_pago?: number
}

export interface Product {
  id: string
  nome: string
  tipo: string
  category_id?: string
  estoque: number
  unidade: string
  fornecedor: string
  fornecedor_id?: string
  estoqueMinimo: number
  custo_medio?: number
  ultimo_valor_comprado?: number
}

export interface ProductCategory {
  id: string
  nome: string
}


export interface Entity {
  id: string
  name: string
  type: 'customer' | 'supplier'
  document?: string
  email?: string
  phone?: string
}


export interface Vacation {
  id: string
  funcionarioId: string
  funcionarioNome: string
  dataInicio: string
  dataFim: string
  status: 'agendada' | 'em_andamento' | 'concluida'
  salarioBase?: number
  diasFerias?: number
  diasAbono?: number // Dias vendidos (abono pecuniário)
  valorFerias?: number
  valorTercoConstitucional?: number
  valorAbonoPecuniario?: number
  valorTercoAbono?: number
  descontosInss?: number
  descontosIrrf?: number
  valorLiquido?: number
  created_at?: string
}

export interface PayrollAdicional {
  descricao: string
  tipo: 'provento' | 'desconto'
  valor: number
}

export interface Payroll {
  id: string
  funcionarioId: string
  funcionarioNome: string
  cargo: string
  salarioBruto: number
  descontos: number
  salarioLiquido: number
  mesReferencia: string
  status: 'pendente' | 'pago'
  periodoInicio?: string
  periodoFim?: string
  adicionais?: PayrollAdicional[]
  tipo_periodo?: 'mes' | 'periodo'
  observacoes?: string
}

export interface BankTransaction {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
  categoria?: string
  category_id?: string
  bank_account_id?: string
  origem: 'manual' | 'csv' | 'ofx'
  status?: string
  paid_by?: string
  paid_by_phone?: string
  paid_by_document?: string
}

export interface ScheduleException {
  id: string
  employee_id: string
  date: string
  is_working: boolean
  is_dobra?: boolean
  start_time?: string
  end_time?: string
}

export interface ScheduleHistory {
  id: string
  month: string
  unidade: string
  snapshot_data: any
  created_at?: string
}

export interface CompanyInfo {
  id: string
  nome_fantasia: string
  razao_social: string
  cnpj: string
  endereco: string
  cep?: string
  telefone: string
  email: string
  website: string
  logotipo_url: string
  assinatura_url?: string
  configuracoes_adicionais?: any
  created_at?: string
}

export interface CompanySettings {
  id: string
  name: string // Nome Fantasia
  razao_social?: string
  cnpj: string
  inscricao_estadual?: string
  data_abertura?: string
  address: string // Endereço Completo
  street?: string
  number?: string
  complement?: string
  neighborhood?: string
  city?: string
  state?: string
  zip_code?: string
  phone: string
  email: string
  website: string
  logo_url: string
  assinatura_url?: string
  updated_at?: string
  created_at?: string
}

export interface Termination {
  id: string
  funcionario_id?: string
  funcionario_nome: string
  cpf: string
  cargo: string
  salario_base: number
  data_admissao: string
  data_demissao: string
  tipo_rescisao: string
  valor_liquido: number
  valor_fgts: number
  valor_total: number
  status: 'pendente' | 'pago'
  created_at?: string
  details?: any
}

export interface PatientReport {
  id: string
  created_at?: string
  patient_id: string
  patient_name: string
  date: string
  title: string
  content: string
  professional_name?: string
}

export interface TechnicalProfessional {
  id: string
  created_at?: string
  nome: string
  cpf?: string
  coren_crm: string
  funcao: string
  status: 'ativo' | 'inativo'
}
