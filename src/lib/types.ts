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
  data_nascimento?: string
  dados_bancarios?: string
  chave_pix?: string
  is_pro_labore?: boolean
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
}

export interface Responsible {
  nome: string
  cpf: string
  rg?: string
  telefone?: string
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
  telefoneResponsavel: string
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
  dataEntrada: string
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
  status: 'pendente' | 'pago' | 'vencido'
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
  status: 'pendente' | 'recebido' | 'vencido'
  invoiceId?: string
  payment_date?: string
  bank_account_id?: string
  bank_transaction_id?: string
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
  status: 'pendente' | 'pago' | 'cancelado'
  items: InvoiceItem[]
  income_id?: string
  payment_date?: string
  bank_account_id?: string
  bank_transaction_id?: string
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
  telefone: string
  email: string
  website: string
  logotipo_url: string
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
  updated_at?: string
  created_at?: string
}

export interface Termination {
  id: string
  funcionarioId?: string
  funcionarioNome: string
  cpf: string
  cargo: string
  salarioBase: number
  dataAdmissao: string
  dataDemissao: string
  tipoRescisao: string
  valorLiquido: number
  valorFgts: number
  valorTotal: number
  status: 'pendente' | 'pago'
  created_at?: string
  details?: any
}


