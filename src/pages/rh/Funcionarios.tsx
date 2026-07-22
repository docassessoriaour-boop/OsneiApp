import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { useCep } from '@/hooks/useCep'
import { formatCurrency } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import {
  DEMO_COMPANY_ADDRESS,
  DEMO_COMPANY_CNPJ,
  DEMO_COMPANY_LEGAL_NAME,
  DEMO_COMPANY_NAME,
  DEMO_COMPANY_REPRESENTATIVE,
  DEMO_COMPANY_REPRESENTATIVE_DOCS,
  LAR_SABEDORIA_CNPJ_DIGITS,
  onlyDigits,
} from '@/lib/companies'
import type { CompanySettings, Employee } from '@/lib/types'

import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, FileText, Loader2, ReceiptText, Plus, X, User } from 'lucide-react'



const emptyEmployee: Omit<Employee, 'id'> = {
  nome: '',
  cpf: '',
  rg: '',
  cargo: '',
  unidade: 'Ouro Verde',
  turno: 'Diurno',
  turno_inicio: '07:00',
  turno_fim: '19:00',
  escala: '40h',
  salario: 0,
  salario_tipo: 'mensal',
  tipo_contrato: 'autonomo',
  status: 'ativo',
  dataAdmissao: new Date().toISOString().slice(0, 10),
  telefone: '',
  email: '',
  endereco: '',
  tem_vt: false,
  vt_tipo: 'não',
  vt_valor: 0, 
  tem_insalubridade: false,
  insalubridade_percentual: 20, // Common default
  data_nascimento: undefined,
  estado_civil: '',
  nome_conjuge: '',
  possui_filhos_menores_14: false,
  quantidade_filhos_menores_14: 0,
  grau_escolaridade: '',
  situacao_escolaridade: '',
  contrato_experiencia: 'nao',
  dados_bancarios: '',
  chave_pix: '',
  is_pro_labore: false,
  descontos_fixos: 0,
  cep: '',
  cidade: '',
  uf: '',
}

function getDefaultShiftTimes(turno: Employee['turno'], escala: Employee['escala']) {
  if (turno === 'Noturno') return { turno_inicio: '19:00', turno_fim: '07:00' }
  if (escala === '40h' || escala === 'Mensalista') return { turno_inicio: '06:30', turno_fim: '14:30' }
  return { turno_inicio: '07:00', turno_fim: '19:00' }
}

function normalizeTime(value?: string) {
  return value ? value.slice(0, 5) : ''
}

function getEmployeeShiftLabel(employee: Employee) {
  const defaults = getDefaultShiftTimes(employee.turno || 'Diurno', employee.escala)
  const start = normalizeTime(employee.turno_inicio) || defaults.turno_inicio
  const end = normalizeTime(employee.turno_fim) || defaults.turno_fim
  return start && end ? ` (${start}-${end})` : ''
}

function getEmployeeSalaryLabel(employee: Employee) {
  const tipo = employee.salario_tipo === 'diaria' ? ' / dia' : ''
  return `${formatCurrency(employee.salario)}${tipo}`
}

function getEmployeeSalaryLabelPDF(employee: Employee) {
  const tipo = employee.salario_tipo === 'diaria' ? ' por dia' : ' por mês'
  return `${formatCurrencyPDF(employee.salario)}${tipo}`
}

function getVtDescription(employee: Employee) {
  if (!employee.tem_vt) return 'NÃO'
  const periodicity = employee.vt_tipo === 'diaria' ? 'por dia trabalhado' : 'por mês'
  return `SIM (${employee.vt_tipo || 'Padrão'} - ${formatCurrencyPDF(employee.vt_valor)} ${periodicity})`
}

function getContractTypeLabel(employee: Employee) {
  return employee.tipo_contrato === 'mei' ? 'MEI' : 'Autônomo'
}

function getChildrenUnder14Label(employee: Employee) {
  if (!employee.possui_filhos_menores_14) return 'Não'
  return `Sim (${employee.quantidade_filhos_menores_14 || 0})`
}

function getExperienceContractLabel(employee: Employee) {
  if (employee.contrato_experiencia === '30') return 'Sim, 30 dias'
  if (employee.contrato_experiencia === '45') return 'Sim, 45 dias'
  return 'Não'
}

type EmployeeDb = Employee & { data_admissao?: string }

type ClinicWithRhFields = Partial<CompanySettings> & {
  cnpj_digits?: string
  endereco?: string
  nome_fantasia?: string
  representante?: string
  representante_documentos?: string
}

const LAR_SABEDORIA_CONTRACT_ADDRESS = 'Rua Akemi Morita, 22 - Nova Ourinhos - Cep. 19.907-490 - Ourinhos/SP'
const LAR_SABEDORIA_REPRESENTATIVE = 'Érika Teodoro de Araújo'
const LAR_SABEDORIA_REPRESENTATIVE_DOCS = 'CPF 516.578.641/20'

function buildLarSabedoriaAutonomoContractHtml(params: {
  emp: Employee
  employerName: string
  employerCnpj: string
  employerAddress: string
  employerRepresentative: string
  employerRepresentativeDocs: string
  amountStr: string
  admissao: string
  today: string
}) {
  const {
    emp,
    employerName,
    employerCnpj,
    employerAddress,
    employerRepresentative,
    employerRepresentativeDocs,
    amountStr,
    admissao,
    today,
  } = params
  const employeeName = emp.nome.toUpperCase()
  const role = (emp.cargo || 'CUIDADOR(A) DE IDOSOS').toUpperCase()
  const representativeText = employerRepresentative
    ? `, neste ato representada por <strong>${employerRepresentative}</strong>${employerRepresentativeDocs ? `, ${employerRepresentativeDocs}` : ''}, na qualidade de representante legal`
    : ', neste ato por seu representante legal'
  const salaryClause = emp.salario > 0
    ? `<p>Pela prestação dos serviços, a <strong>CONTRATANTE</strong> pagará à <strong>CONTRATADA</strong> a remuneração de <strong>${amountStr}</strong>.</p>`
    : ''
  const transportClause = emp.tem_vt && emp.vt_valor > 0
    ? `<p>A <strong>CONTRATANTE</strong> pagará à <strong>CONTRATADA</strong> o valor de <strong>${formatCurrencyPDF(emp.vt_valor)}</strong> ${emp.vt_tipo === 'diaria' ? 'por dia trabalhado' : 'por mês'} a título de ajuda de custo para transporte.</p>`
    : ''
  const unhealthyWorkClause = emp.tem_insalubridade && emp.insalubridade_percentual > 0
    ? `<p>A <strong>CONTRATANTE</strong> pagará à <strong>CONTRATADA</strong> adicional contratual de insalubridade no percentual de <strong>${emp.insalubridade_percentual}%</strong>, calculado sobre a remuneração-base prevista nesta cláusula.</p>`
    : ''
  const startDateText = emp.dataAdmissao
    ? `, com início em <strong>${admissao}</strong>,`
    : ''

  return `
    <div style="text-align: center; margin-bottom: 30px;">
      <h2 style="margin-bottom: 5px; text-transform: uppercase;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CUIDADOR(A) AUTÔNOMO(A) DE IDOSOS</h2>
    </div>

    <div class="abnt-text" style="text-align: justify; line-height: 1.5; font-size: 12pt;">
      <p style="text-indent: 0;"><strong>CONTRATANTE:</strong> <strong>${employerName.toUpperCase()}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº <strong>${employerCnpj}</strong>, com sede na ${employerAddress}${representativeText}.</p>

      <p style="text-indent: 0;"><strong>CONTRATADA:</strong> <strong>${employeeName}</strong>, inscrita no CPF sob o nº <strong>${emp.cpf}</strong>, portadora do RG nº <strong>${emp.rg || '______________________________'}</strong>, residente e domiciliada na ${emp.endereco || '______________________________'}, profissão <strong>${role}</strong>.</p>

      <p>As partes acima qualificadas resolvem celebrar o presente Contrato de Prestação de Serviços de Cuidador(a) Autônomo(a) de Idosos, que será regido pelas cláusulas e condições seguintes.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA PRIMEIRA - DO OBJETO</h3>
      <p>O presente contrato tem por objeto a prestação, pela <strong>CONTRATADA</strong>, de serviços autônomos de cuidador(a) de idosos aos residentes assistidos pela <strong>CONTRATANTE</strong>, compreendendo o acompanhamento e apoio nas necessidades básicas diárias, com zelo pelo bem-estar físico, emocional, segurança, dignidade e qualidade de vida dos idosos.</p>
      <p>Os serviços incluem, entre outras atividades compatíveis com a função: auxílio e supervisão em higiene pessoal, alimentação, locomoção e atividades de rotina; administração ou acompanhamento de medicamentos exclusivamente conforme prescrição ou orientação médica/enfermagem responsável; monitoramento de sinais, comportamento e bem-estar; apoio em atividades recreativas e terapêuticas; organização do ambiente imediato do idoso; e comunicação de intercorrências à <strong>CONTRATANTE</strong>.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SEGUNDA - DA EXECUÇÃO DOS SERVIÇOS E AUTONOMIA</h3>
      <p>A <strong>CONTRATADA</strong> executará os serviços com autonomia técnica e profissional, responsabilidade, urbanidade, diligência, observância às boas práticas de cuidado e respeito às orientações assistenciais repassadas pela <strong>CONTRATANTE</strong>.</p>
      <p>As partes reconhecem que este contrato possui natureza civil e não gera vínculo empregatício, subordinação hierárquica, exclusividade, habitualidade trabalhista ou qualquer relação regida pela Consolidação das Leis do Trabalho, cabendo à <strong>CONTRATADA</strong> organizar a forma de execução dos serviços contratados, dentro das necessidades assistenciais previamente informadas.</p>
      <p>A <strong>CONTRATADA</strong> compromete-se a manter sigilo e confidencialidade sobre dados, imagens, documentos, rotinas, informações de saúde, familiares e pessoais dos idosos, da <strong>CONTRATANTE</strong> e de terceiros a que tiver acesso em razão da prestação dos serviços.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA TERCEIRA - DAS OBRIGAÇÕES DA CONTRATADA</h3>
      <p>Constituem obrigações da <strong>CONTRATADA</strong>: executar os serviços com zelo, pontualidade, prudência e boa-fé; respeitar a integridade física, moral e emocional dos idosos; seguir as prescrições médicas e orientações assistenciais formalmente repassadas; comunicar imediatamente à <strong>CONTRATANTE</strong> qualquer intercorrência, alteração relevante de saúde, risco, queda, recusa alimentar, alteração comportamental ou necessidade observada; preservar a organização e higiene do ambiente diretamente relacionado ao cuidado; e apresentar recibo de pagamento ou documento equivalente quando solicitado.</p>
      <p>A <strong>CONTRATADA</strong> responderá por prejuízos comprovadamente causados por dolo, culpa, negligência, imprudência, imperícia, uso inadequado de materiais, descumprimento de orientação essencial ou conduta incompatível com a prestação dos serviços contratados.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA QUARTA - DAS OBRIGAÇÕES DA CONTRATANTE</h3>
      <p>Constituem obrigações da <strong>CONTRATANTE</strong>: fornecer à <strong>CONTRATADA</strong> as informações necessárias à correta execução dos serviços; disponibilizar condições essenciais ao atendimento dos idosos; informar rotinas, cuidados específicos, prescrições, restrições e orientações relevantes; efetuar os pagamentos na forma pactuada; e manter comunicação adequada para o bom andamento da prestação dos serviços.</p>
      <p>São de responsabilidade da <strong>CONTRATANTE</strong> as despesas ordinárias indispensáveis à prestação do serviço e ao cuidado dos idosos, tais como luvas descartáveis, álcool, gaze, algodão, termômetro, materiais de higiene, equipamentos de proteção individual, uniformes quando exigidos e demais insumos necessários, desde que previamente autorizados ou devidamente comprovados pela <strong>CONTRATADA</strong> por nota fiscal, recibo ou documento equivalente.</p>
      <p>A responsabilidade prevista no parágrafo anterior não se aplica às despesas ou reposições decorrentes de conduta inadequada, mau uso, perda injustificada ou dano causado pela <strong>CONTRATADA</strong>, hipótese em que esta deverá ressarcir a <strong>CONTRATANTE</strong> pelos prejuízos comprovados.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA QUINTA - DO PREÇO E DA FORMA DE PAGAMENTO</h3>
      ${salaryClause}
      <p>O pagamento será realizado via Pix ou conta indicada pela <strong>CONTRATADA</strong>, até o 5º (quinto) dia útil de cada mês, mediante apresentação do respectivo recibo de pagamento ou documento equivalente.</p>
      <p>Em caso de atraso no pagamento, o valor devido será acrescido de multa de 2% (dois por cento) e juros de mora de 1% (um por cento) ao mês, calculados proporcionalmente sobre o valor em atraso.</p>
      <p>A <strong>CONTRATANTE</strong> pagará à <strong>CONTRATADA</strong>, no mês de dezembro de cada ano, gratificação contratual anual equivalente a uma mensalidade, calculada proporcionalmente aos meses de efetiva vigência do contrato no respectivo ano.</p>
      ${transportClause}
      ${unhealthyWorkClause}
      <p>Os valores poderão ser revistos por acordo escrito entre as partes, especialmente em caso de alteração relevante da carga de serviços, prorrogação de condições inicialmente ajustadas, aumento de custos operacionais ou necessidade superveniente relacionada à execução do objeto contratual.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SEXTA - DO PRAZO</h3>
      <p>O presente contrato vigorará por prazo indeterminado${startDateText} permanecendo válido enquanto houver interesse das partes e continuidade da prestação dos serviços.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SÉTIMA - DA RESCISÃO</h3>
      <p>O presente contrato poderá ser rescindido por qualquer das partes, a qualquer tempo, mediante aviso prévio escrito de 30 (trinta) dias, sem necessidade de justificativa e sem direito a indenização, ressalvadas as obrigações já vencidas ou assumidas antes do encerramento.</p>
      <p>A rescisão não prejudicará obrigações já assumidas por qualquer das partes antes do término do contrato, inclusive valores proporcionais devidos pelos serviços efetivamente prestados, reembolsos aprovados, prestação de contas, devolução de documentos ou materiais e eventuais responsabilidades perante terceiros.</p>
      <p>Caso haja pagamento antecipado por serviço não prestado em razão de rescisão solicitada pela <strong>CONTRATANTE</strong>, a apuração será feita proporcionalmente ao período efetivamente trabalhado, podendo haver compensação ou restituição do valor correspondente, quando aplicável.</p>
      <p>Caso a rescisão seja solicitada pela <strong>CONTRATADA</strong>, esta não fará jus a valores referentes a serviços futuros que não tenham sido efetivamente prestados, preservado o direito ao recebimento proporcional pelos serviços já realizados.</p>
      <p>O contrato poderá ser rescindido imediatamente por justa causa em caso de descumprimento grave de obrigação contratual, conduta incompatível com o cuidado de idosos, quebra de sigilo, abandono injustificado da prestação dos serviços, ato de violência, negligência grave, fraude, dano intencional ou qualquer prática que comprometa a segurança, dignidade ou integridade dos idosos.</p>
      <p>A parte que der causa à rescisão por descumprimento contratual ficará sujeita ao pagamento de multa equivalente a 25% (vinte e cinco por cento) de uma remuneração mensal vigente, sem prejuízo da apuração de perdas e danos efetivamente comprovados.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA OITAVA - DA AUSÊNCIA DE VÍNCULO EMPREGATÍCIO E RESPONSABILIDADES</h3>
      <p>As partes declaram expressamente que a relação estabelecida por este instrumento é de prestação de serviços autônomos, de natureza civil, inexistindo vínculo empregatício, subordinação jurídica, controle de jornada típico de relação de emprego ou dependência trabalhista.</p>
      <p>A <strong>CONTRATADA</strong> é responsável por suas obrigações fiscais, previdenciárias, tributárias e profissionais decorrentes de sua atuação autônoma, quando aplicáveis, sem prejuízo dos pagamentos expressamente assumidos pela <strong>CONTRATANTE</strong> neste contrato.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA NONA - DAS CONDIÇÕES GERAIS</h3>
      <p>Este contrato obriga as partes, seus herdeiros e sucessores, no limite das obrigações aqui assumidas.</p>
      <p>Qualquer tolerância, concessão ou não exercício imediato de direito previsto neste contrato será considerado mera liberalidade, não implicando renúncia, alteração contratual ou novação.</p>
      <p>Alterações deste contrato somente terão validade se realizadas por escrito e assinadas pelas partes.</p>
      <p>O presente contrato poderá, a critério das partes, ser registrado em cartório para fins de conservação, publicidade e autenticidade, devendo a <strong>CONTRATANTE</strong> fornecer cópia à <strong>CONTRATADA</strong>.</p>

      <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA DÉCIMA - DO FORO</h3>
      <p>As partes elegem o Foro da Comarca de Ourinhos/SP para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
      <p>E, por estarem justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, juntamente com as testemunhas abaixo.</p>

      <p style="margin-top: 50px; text-align: right; text-indent: 0;">Ourinhos (SP), ${today}.</p>

      <div style="margin-top: 70px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
        <div style="text-align: center;">
          <div style="border-top: 1px solid #000; padding-top: 10px;">
            <p style="margin: 0; text-indent: 0;"><strong>CONTRATANTE:</strong></p>
            <p style="margin: 0; text-indent: 0;">${employerName.toUpperCase()}</p>
            <p style="margin: 0; text-indent: 0;">CNPJ ${employerCnpj}</p>
          </div>
        </div>
        <div style="text-align: center;">
          <div style="border-top: 1px solid #000; padding-top: 10px;">
            <p style="margin: 0; text-indent: 0;"><strong>CONTRATADA:</strong></p>
            <p style="margin: 0; text-indent: 0;">${employeeName}</p>
            <p style="margin: 0; text-indent: 0;">CPF: ${emp.cpf}</p>
          </div>
        </div>
      </div>

      <div style="margin-top: 80px;">
        <p style="margin: 0; text-indent: 0;"><strong>Testemunhas:</strong></p>
        <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
          <div style="text-align: center;">
            <div style="border-top: 1px solid #777; padding-top: 5px; width: 80%; margin: 0 auto;"></div>
            <p style="font-size: 10pt; margin: 0; text-indent: 0;">Nome: __________________________</p>
            <p style="font-size: 10pt; margin: 0; text-indent: 0;">CPF: ___________________________</p>
          </div>
          <div style="text-align: center;">
            <div style="border-top: 1px solid #777; padding-top: 5px; width: 80%; margin: 0 auto;"></div>
            <p style="font-size: 10pt; margin: 0; text-indent: 0;">Nome: __________________________</p>
            <p style="font-size: 10pt; margin: 0; text-indent: 0;">CPF: ___________________________</p>
          </div>
        </div>
      </div>
    </div>
  `
}

function isMissingRhMigrationError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error ? String((error as { message?: unknown }).message || '') : ''
  const details = 'details' in error ? String((error as { details?: unknown }).details || '') : ''
  const text = `${message} ${details}`.toLowerCase()

  return text.includes('salario_tipo') ||
    text.includes('turno_inicio') ||
    text.includes('turno_fim') ||
    text.includes('tipo_contrato') ||
    text.includes('estado_civil') ||
    text.includes('nome_conjuge') ||
    text.includes('possui_filhos_menores_14') ||
    text.includes('quantidade_filhos_menores_14') ||
    text.includes('grau_escolaridade') ||
    text.includes('situacao_escolaridade') ||
    text.includes('contrato_experiencia')
}

export default function Funcionarios() {
  const { data: rawEmployees, loading, insert, update, remove } = useDb<Employee>('employees')
  const { fetchCep } = useCep()
  const [clinic] = useClinic()
  const clinicConfig = clinic as ClinicWithRhFields | null

  // Normaliza: DB retorna data_admissao (snake_case), código usa dataAdmissao (camelCase)
  const employees = rawEmployees.map((e: EmployeeDb) => ({
    ...e,
    dataAdmissao: e.dataAdmissao || e.data_admissao || ''
  })) as Employee[]

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo' | 'ferias' | 'contrato_cancelado'>('ativo')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyEmployee)
  
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null)
  const [receiptItems, setReceiptItems] = useState<{ desc: string, val: number }[]>([])

  const filtered = employees.filter((e) => {
    const matchesSearch = e.nome.toLowerCase().includes(search.toLowerCase()) || e.cpf.includes(search)
    const matchesStatus = statusFilter === 'todos' || e.status === statusFilter
    return matchesSearch && matchesStatus
  })

  function calculateAge(birthDate?: string) {
    if (!birthDate) return null
    const birth = new Date(birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age
  }

  const handleCepBlur = async (cep: string) => {
    if (!cep) return
    const data = await fetchCep(cep)
    if (data) {
      setForm(f => ({
        ...f,
        endereco: `${data.logradouro}${data.bairro ? `, ${data.bairro}` : ''}`,
        cidade: data.localidade,
        uf: data.uf,
        cep: data.cep
      }))
    }
  }

  function openNew() {
    setForm(emptyEmployee)
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(employee: Employee) {
    // DB returns data_admissao (snake_case), form uses dataAdmissao (camelCase)
    const { data_admissao, ...rest } = employee as EmployeeDb
    const defaultTimes = getDefaultShiftTimes(employee.turno || 'Diurno', employee.escala)
    setForm({
      ...rest,
      salario_tipo: employee.salario_tipo || 'mensal',
      tipo_contrato: employee.tipo_contrato || 'autonomo',
      possui_filhos_menores_14: !!employee.possui_filhos_menores_14,
      quantidade_filhos_menores_14: employee.quantidade_filhos_menores_14 || 0,
      contrato_experiencia: employee.contrato_experiencia || 'nao',
      turno_inicio: normalizeTime(employee.turno_inicio) || defaultTimes.turno_inicio,
      turno_fim: normalizeTime(employee.turno_fim) || defaultTimes.turno_fim,
      dataAdmissao: data_admissao || employee.dataAdmissao || ''
    })
    setEditingId(employee.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nome || !form.cpf || !form.cargo) return

    // Sanitize data: empty strings in date fields should be null for Postgres
    // dataAdmissao in TS = data_admissao in DB (snake_case)
    const { dataAdmissao, ...rest } = form
    const payload = {
      ...rest,
      data_nascimento: form.data_nascimento || null,
      data_admissao: dataAdmissao || null
    }

    try {
      if (editingId) {
        await update(editingId, payload as Employee)
      } else {
        await insert(payload as Employee)
      }
      setDialogOpen(false)
    } catch (error: unknown) {
      console.error('Erro ao salvar:', error)
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        alert('Este CPF já está cadastrado para outro funcionário.')
      } else if (isMissingRhMigrationError(error)) {
        alert('Atualização necessária no banco de dados: aplique o arquivo supabase_rh_diaria_turno_vt.sql no Supabase e tente salvar novamente.')
      } else {
        alert('Erro ao salvar funcionário. Verifique os dados e tente novamente.')
      }
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este funcionário?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error('Erro ao excluir:', error)
        alert('Erro ao excluir funcionário')
      }
    }
  }

  function openReceipt(emp: Employee) {
    setSelectedEmp(emp)
    setReceiptItems([
      { desc: emp.salario_tipo === 'diaria' ? 'Diária' : 'Salário Base', val: emp.salario },
      ...(emp.tem_vt ? [{ desc: emp.vt_tipo === 'diaria' ? 'Vale Transporte (por dia trabalhado)' : 'Vale Transporte', val: emp.vt_valor }] : []),
      ...(emp.tem_insalubridade ? [{ desc: 'Adicional Insalubridade', val: (emp.salario * (emp.insalubridade_percentual / 100)) }] : [])
    ])
    setReceiptDialogOpen(true)
  }

  function printSimpleReceipt() {
    if (!selectedEmp) return
    const total = receiptItems.reduce((s, i) => s + i.val, 0)
    const today = new Date().toLocaleDateString('pt-BR')
    const employerName = clinicConfig?.nome_fantasia || clinicConfig?.name || DEMO_COMPANY_NAME
    
    const rows = receiptItems.map(i => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${i.desc}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${formatCurrencyPDF(i.val)}</td>
      </tr>
    `).join('')

    const html = `
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="border:none;">RECIBO DE PAGAMENTO</h2>
      </div>
      <div style="margin-bottom: 20px; font-size: 11pt;">
        <p><strong>Empregador:</strong> ${employerName}</p>
        <p><strong>Funcionário:</strong> ${selectedEmp.nome}</p>
        <p><strong>CPF:</strong> ${selectedEmp.cpf}</p>
        <p><strong>Cargo:</strong> ${selectedEmp.cargo}</p>
        <p><strong>Data de Emissão:</strong> ${today}</p>
      </div>
      <table style="width:100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr style="background: #f4f4f4;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Descrição</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="margin-top: 15px; text-align: right; font-size: 14pt; font-weight: bold;">
        VALOR TOTAL: ${formatCurrencyPDF(total)}
      </div>
      <div style="margin-top: 20px; padding: 15px; border: 1px solid #eee; background: #fafafa; border-radius: 5px;">
        <p style="margin: 0; text-indent: 0;">Recebi de <strong>${employerName}</strong> a importância de <strong>${formatCurrencyPDF(total)}</strong> referente aos itens descritos acima.</p>
      </div>
      <div style="margin-top: 80px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
        <div style="text-align: center;">
          <div style="border-top: 1px solid #000; padding-top: 5px;">Assinatura do Empregador</div>
        </div>
        <div style="text-align: center;">
          <div style="border-top: 1px solid #000; padding-top: 5px;">Assinatura do Funcionário</div>
        </div>
      </div>
    `
    printPDF(`Recibo - ${selectedEmp.nome}`, html, clinic)
    setReceiptDialogOpen(false)
  }

  const statusBadge = (status: Employee['status']) => {
    const map = { ativo: 'success', inativo: 'destructive', ferias: 'warning', contrato_cancelado: 'outline' } as const
    const labels = { ativo: 'Ativo', inativo: 'Inativo', ferias: 'Férias', contrato_cancelado: 'Contrato Cancelado' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  function printReport() {
    const statusLabel = statusFilter === 'todos' ? 'Todos' : statusFilter === 'ativo' ? 'Ativos' : statusFilter === 'ferias' ? 'Em Férias' : statusFilter === 'contrato_cancelado' ? 'Contrato Cancelado' : 'Inativos'
    const rows = filtered.map(e => `<tr><td>${e.nome}</td><td>${e.cpf}</td><td>${e.cargo}<br/><small>${e.unidade || 'Ouro Verde'} - ${e.turno || 'Diurno'}${getEmployeeShiftLabel(e)}</small></td><td>${e.escala}</td><td>${formatDatePDF(e.dataAdmissao)}</td><td class="text-right">${getEmployeeSalaryLabelPDF(e)}</td><td>${e.status}</td></tr>`).join('')
    const totalSalario = filtered.reduce((s, e) => s + e.salario, 0)
    printPDF(`Relatório de Funcionários - ${statusLabel}`, `
      <table><thead><tr><th>Nome</th><th>CPF</th><th>Cargo / Unidade / Turno</th><th>Escala</th><th>Admissão</th><th class="text-right">Salário</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="divider"></div>
      <div style="text-align:right;font-weight:700;">Total Folha: ${formatCurrencyPDF(totalSalario)}</div>
    `, clinic)
  }

  function printEmployeeContract(emp: Employee) {
    const amountStr = getEmployeeSalaryLabelPDF(emp)
    const admissao = formatDatePDF(emp.dataAdmissao)
    const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    const employerName = clinicConfig?.razao_social || clinicConfig?.name || clinicConfig?.nome_fantasia || DEMO_COMPANY_LEGAL_NAME
    const employerCnpj = clinicConfig?.cnpj || DEMO_COMPANY_CNPJ
    const employerAddress = clinicConfig?.endereco || clinicConfig?.address || DEMO_COMPANY_ADDRESS
    const employerRepresentative = clinicConfig?.representante || DEMO_COMPANY_REPRESENTATIVE
    const employerRepresentativeDocs = clinicConfig?.representante_documentos || DEMO_COMPANY_REPRESENTATIVE_DOCS
    const isMeiContract = emp.tipo_contrato === 'mei'
    const employerCnpjDigits = onlyDigits(clinicConfig?.cnpj_digits || employerCnpj)

    if (!isMeiContract && employerCnpjDigits === LAR_SABEDORIA_CNPJ_DIGITS) {
      const html = buildLarSabedoriaAutonomoContractHtml({
        emp,
        employerName,
        employerCnpj,
        employerAddress: LAR_SABEDORIA_CONTRACT_ADDRESS,
        employerRepresentative: LAR_SABEDORIA_REPRESENTATIVE,
        employerRepresentativeDocs: LAR_SABEDORIA_REPRESENTATIVE_DOCS,
        amountStr,
        admissao,
        today,
      })

      printPDF(`Contrato - ${emp.nome}`, html, clinic)
      return
    }

    const contractTitle = isMeiContract ? 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS MEI' : 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS AUTÔNOMO'
    const contractorLabel = isMeiContract ? 'PRESTADOR(A) MEI' : 'CONTRATADO(A) AUTÔNOMO(A)'
    const contractorDocs = isMeiContract
      ? `
          <p style="margin: 0; text-indent: 0;"><strong>CPF:</strong> ${emp.cpf}</p>
          <p style="margin: 0; text-indent: 0;"><strong>RG:</strong> ${emp.rg || '—'}</p>
          <p style="margin: 0; text-indent: 0;"><strong>MEI/CNPJ:</strong> ______________________________</p>
        `
      : `
          <p style="margin: 0; text-indent: 0;"><strong>CPF:</strong> ${emp.cpf}</p>
          <p style="margin: 0; text-indent: 0;"><strong>RG:</strong> ${emp.rg || '—'}</p>
        `
    const autonomyClause = isMeiContract
      ? 'O(A) PRESTADOR(A) MEI declara atuar por conta própria, com autonomia técnica e administrativa, assumindo integral responsabilidade por suas obrigações fiscais, previdenciárias, tributárias e pela emissão dos documentos fiscais aplicáveis.'
      : 'O(A) CONTRATADO(A) AUTÔNOMO(A) declara atuar por conta própria, sem subordinação, habitualidade empregatícia ou vínculo trabalhista, assumindo integral responsabilidade por suas obrigações fiscais, previdenciárias e trabalhistas.'
    const paymentDocumentClause = isMeiContract
      ? 'O pagamento será realizado via Pix ou conta bancária indicada pelo(a) PRESTADOR(A) MEI, mediante emissão da respectiva nota fiscal ou documento fiscal equivalente.'
      : 'O pagamento será realizado via Pix ou conta bancária indicada pelo(a) CONTRATADO(A), mediante a apresentação do correspondente recibo de pagamento.'

    const html = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin-bottom: 5px; text-transform: uppercase;">${contractTitle}</h2>
        <h3 style="margin-top: 0; text-transform: uppercase; border:none;">${emp.cargo || 'PRESTAÇÃO DE SERVIÇOS'}</h3>
       </div>
       
       <div class="abnt-text" style="text-align: justify; line-height: 1.5; font-size: 12pt;">
        <p style="text-indent: 0;"><strong>CONTRATANTE:</strong></p>
        <p><strong>${employerName.toUpperCase()}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº <strong>${employerCnpj}</strong>, com sede na ${employerAddress}, representada neste ato por <strong>${employerRepresentative}</strong>, ${employerRepresentativeDocs}, na função de representante legal.</p>

        <p style="text-indent: 0; margin-top: 20px;"><strong>${contractorLabel}:</strong></p>
        <div style="margin-top: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;">
          <p style="margin: 0; text-indent: 0;"><strong>NOME:</strong> ${emp.nome.toUpperCase()}</p>
          ${contractorDocs}
          <p style="margin: 0; text-indent: 0;"><strong>ENDEREÇO:</strong> ${emp.endereco || '—'}</p>
          <p style="margin: 0; text-indent: 0;"><strong>PROFISSÃO:</strong> ${emp.cargo.toUpperCase()}</p>
        </div>

        <p>As partes acima qualificadas, por este instrumento particular, de comum acordo, celebram o presente contrato, que se regerá pelas seguintes cláusulas e condições:</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA PRIMEIRA – DO OBJETO</h3>
        <p>O objeto do presente contrato é a prestação de serviços de <strong>${emp.cargo.toUpperCase()}</strong> a ser realizada pelo(a) <strong>CONTRATADO(A)</strong>, que deverá zelar pelo bem-estar físico e mental, segurança e qualidade de vida dos idosos, residentes na clínica do(a) <strong>CONTRATANTE</strong>.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SEGUNDA – DAS OBRIGAÇÕES DO(A) CONTRATADO(A)</h3>
        <p>1.1. ${autonomyClause}</p>
        <p style="margin-top: 10px;">1.2. Entre as atividades a serem desempenhadas, incluem-se, mas não se limitam a: acompanhamento em atividades diárias (higiene, alimentação, locomoção), administração de medicamentos conforme orientação médica, monitoramento da saúde e bem-estar, auxílio em tarefas de organização do ambiente do idoso, e respeito à confidencialidade das informações.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA TERCEIRA – DAS OBRIGAÇÕES DO(A) CONTRATANTE</h3>
        <p>1.1. O(A) <strong>CONTRATANTE</strong> compromete-se a fornecer todas as informações e orientações necessárias para a correta execução dos serviços.</p>
        <p style="margin-top: 10px;">1.2. Pagar ao(à) <strong>CONTRATADO(A)</strong> a remuneração estipulada na Cláusula Quarta, nas datas e condições acordadas.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA QUARTA – DO PREÇO E DA FORMA DE PAGAMENTO</h3>
        <p>1.1. O(A) <strong>CONTRATANTE</strong> pagará ao(à) <strong>CONTRATADO(A)</strong> o valor de <strong>${amountStr}</strong>.</p>
        <p style="margin-top: 10px;">1.2. ${paymentDocumentClause}</p>
        <p style="margin-top: 10px;">1.3. Em caso de atraso no pagamento, o valor devido será acrescido de multa de 2% e juros de 2% ao mês, calculados sobre o valor total em atraso.</p>
        <p style="margin-top: 10px;">1.4. A CONTRATANTE fará à CONTRATADA um pagamento de <strong>BONIFICAÇÃO</strong> no mês de dezembro do ano vigente no valor de uma mensalidade do contrato, sendo o cálculo baseado proporcionalmente aos meses do contrato em vigência.</p>
        ${emp.tem_vt ? `<p style="margin-top: 10px;">1.5. O(A) <strong>CONTRATANTE</strong> pagará ao(à) <strong>CONTRATADO(A)</strong> o valor de <strong>${formatCurrencyPDF(emp.vt_valor)}</strong> ${emp.vt_tipo === 'diaria' ? 'por dia trabalhado' : 'por mês'} a título de vale-transporte.</p>` : ''}
        ${emp.tem_insalubridade ? `<p style="margin-top: 10px;">${emp.tem_vt ? '1.6' : '1.5'}. O(A) <strong>CONTRATANTE</strong> pagará ao(à) <strong>CONTRATADO(A)</strong> o adicional de insalubridade no percentual de <strong>${emp.insalubridade_percentual}%</strong> sobre o salário base.</p>` : ''}

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA QUINTA – DO PRAZO</h3>
        <p>O presente contrato terá a vigência por prazo <strong>indeterminado</strong>, com início em <strong>${admissao}</strong>.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SEXTA – DA RESCISÃO</h3>
        <p>1.1. O presente contrato poderá ser rescindido por qualquer das partes, a qualquer tempo, mediante aviso prévio de <strong>30 (trinta) dias</strong>, por escrito, sem a necessidade de justificativa e sem que isso gere direito a indenização, salvo as obrigações já vencidas.</p>
        <p style="margin-top: 10px;">1.2. O contrato será automaticamente rescindido por justa causa em caso de descumprimento de qualquer de suas cláusulas ou condições, sujeitando a parte infratora ao pagamento de multa de <strong>25% sobre o valor total do contrato</strong>, sem prejuízo das perdas e danos.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SÉTIMA – DA INDEPENDÊNCIA DAS PARTES</h3>
        <p>As partes declaram que a relação jurídica estabelecida neste contrato é de natureza civil, e não trabalhista, não havendo subordinação hierárquica, vínculo empregatício ou qualquer outra relação de trabalho entre o(a) <strong>${contractorLabel}</strong> e o(a) <strong>CONTRATANTE</strong>. ${autonomyClause}</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA OITAVA – DO FORO</h3>
        <p>As partes elegem o Foro da Comarca de <strong>Ourinhos/SP</strong> para dirimir quaisquer dúvidas oriundas do presente contrato, renunciando a qualquer outro, por mais privilegiado que seja.</p>

        <p style="margin-top: 50px; text-align: right; text-indent: 0;">Ourinhos (SP), ${today}.</p>

        <div style="margin-top: 70px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 10px;">
              <p style="margin: 0; text-indent: 0;"><strong>CONTRATANTE:</strong></p>
              <p style="margin: 0; text-indent: 0;">${employerName.toUpperCase()}</p>
              <p style="margin: 0; text-indent: 0;">CNPJ ${employerCnpj}</p>
            </div>
          </div>
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 10px;">
              <p style="margin: 0; text-indent: 0;"><strong>${contractorLabel}:</strong></p>
              <p style="margin: 0; text-indent: 0;">${emp.nome.toUpperCase()}</p>
              <p style="margin: 0; text-indent: 0;">CPF: ${emp.cpf}</p>
            </div>
          </div>
        </div>

        <div style="margin-top: 80px;">
          <p style="margin: 0; text-indent: 0;"><strong>Testemunhas:</strong></p>
          <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
            <div style="text-align: center;">
              <div style="border-top: 1px solid #777; padding-top: 5px; width: 80%; margin: 0 auto;"></div>
              <p style="font-size: 10pt; margin: 0; text-indent: 0;">Nome: Testemunha 1</p>
              <p style="font-size: 10pt; margin: 0; text-indent: 0;">CPF: 000.000.000-00</p>
            </div>
            <div style="text-align: center;">
              <div style="border-top: 1px solid #777; padding-top: 5px; width: 80%; margin: 0 auto;"></div>
              <p style="font-size: 10pt; margin: 0; text-indent: 0;">Nome: __________________________</p>
              <p style="font-size: 10pt; margin: 0; text-indent: 0;">CPF: ___________________________</p>
            </div>
          </div>
        </div>
      </div>
    `
    printPDF(`Contrato - ${emp.nome}`, html, clinic)
  }

  function printEmployeeRegistrationForm(employee: Employee) {
    const html = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="border:none; margin:0;">FICHA CADASTRAL DO FUNCIONÁRIO</h2>
        <p style="font-size: 10pt; color: #666;">Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="background: #f4f4f4; padding: 5px 10px; font-size: 12pt; border-bottom: 2px solid #1a1f2e; margin-bottom: 10px;">DADOS PESSOAIS</h3>
        <table style="width: 100%; border: none;">
          <tr style="border:none;"><td style="border:none; padding: 4px; width: 30%;"><strong>Nome Completo:</strong></td><td style="border:none; padding: 4px;">${employee.nome}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>CPF:</strong></td><td style="border:none; padding: 4px;">${employee.cpf}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>RG:</strong></td><td style="border:none; padding: 4px;">${employee.rg || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Data de Nascimento:</strong></td><td style="border:none; padding: 4px;">${formatDatePDF(employee.data_nascimento || '')}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Estado Civil:</strong></td><td style="border:none; padding: 4px;">${employee.estado_civil || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Nome do Cônjuge:</strong></td><td style="border:none; padding: 4px;">${employee.nome_conjuge || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Filhos menores de 14 anos:</strong></td><td style="border:none; padding: 4px;">${getChildrenUnder14Label(employee)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Escolaridade:</strong></td><td style="border:none; padding: 4px;">${employee.grau_escolaridade || '—'}${employee.situacao_escolaridade ? ` (${employee.situacao_escolaridade})` : ''}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Telefone:</strong></td><td style="border:none; padding: 4px;">${employee.telefone || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>E-mail:</strong></td><td style="border:none; padding: 4px;">${employee.email || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Endereço:</strong></td><td style="border:none; padding: 4px;">${employee.endereco || '—'}</td></tr>
        </table>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="background: #f4f4f4; padding: 5px 10px; font-size: 12pt; border-bottom: 2px solid #1a1f2e; margin-bottom: 10px;">DADOS PROFISSIONAIS</h3>
        <table style="width: 100%; border: none;">
          <tr style="border:none;"><td style="border:none; padding: 4px; width: 30%;"><strong>Cargo:</strong></td><td style="border:none; padding: 4px;">${employee.cargo}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Unidade:</strong></td><td style="border:none; padding: 4px;">${employee.unidade || 'Ouro Verde'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Turno:</strong></td><td style="border:none; padding: 4px;">${employee.turno || 'Diurno'}${getEmployeeShiftLabel(employee)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Escala:</strong></td><td style="border:none; padding: 4px;">${employee.escala}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Tipo de Contrato:</strong></td><td style="border:none; padding: 4px;">${getContractTypeLabel(employee)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Contrato de Experiência:</strong></td><td style="border:none; padding: 4px;">${getExperienceContractLabel(employee)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Data de Admissão:</strong></td><td style="border:none; padding: 4px;">${formatDatePDF(employee.dataAdmissao)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Salário Base:</strong></td><td style="border:none; padding: 4px;">${getEmployeeSalaryLabelPDF(employee)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Status Atual:</strong></td><td style="border:none; padding: 4px;">${employee.status.toUpperCase()}</td></tr>
        </table>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="background: #f4f4f4; padding: 5px 10px; font-size: 12pt; border-bottom: 2px solid #1a1f2e; margin-bottom: 10px;">BENEFÍCIOS E PAGAMENTO</h3>
        <table style="width: 100%; border: none;">
          <tr style="border:none;"><td style="border:none; padding: 4px; width: 30%;"><strong>Vale Transporte:</strong></td><td style="border:none; padding: 4px;">${getVtDescription(employee)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Insalubridade:</strong></td><td style="border:none; padding: 4px;">${employee.tem_insalubridade ? `SIM (${employee.insalubridade_percentual}%)` : 'NÃO'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Dados Bancários:</strong></td><td style="border:none; padding: 4px;">${employee.dados_bancarios || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Chave PIX:</strong></td><td style="border:none; padding: 4px;">${employee.chave_pix || '—'}</td></tr>
        </table>
      </div>

      <div style="margin-top: 50px; text-align: center; font-size: 10pt;">
        <div style="border-top: 1px solid #000; width: 300px; margin: 0 auto; padding-top: 5px;">Assinatura do Funcionário</div>
      </div>
    `
    printPDF(`Ficha Cadastral - ${employee.nome}`, html, clinic)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Funcionários</h1>
          <p className="text-muted-foreground">Cadastro e gerenciamento de funcionários</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printReport} className="gap-2"><FileText className="h-4 w-4" /> PDF</Button>
          <Button onClick={openNew}>Novo Funcionário</Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome ou CPF..." />
          </div>
          <div className="w-full md:w-48">
            <Select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="todos">Todos os Status</option>
              <option value="ativo">Ativos</option>
              <option value="ferias">Férias</option>
              <option value="inativo">Inativos</option>
              <option value="contrato_cancelado">Contrato Cancelado</option>
            </Select>
          </div>
        </div>

        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cargo / Unid. / Turno</TableHead>
                <TableHead>Idade</TableHead>
                <TableHead>Escala</TableHead>
                <TableHead>Salário</TableHead>
                <TableHead>VT / Insal.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7}><EmptyState message="Nenhum funcionário cadastrado" /></TableCell></TableRow>
              ) : (
                filtered.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      <div>{employee.nome}</div>
                      <div className="text-xs text-muted-foreground">CPF: {employee.cpf}</div>
                    </TableCell>
                    <TableCell>
                      <div>{employee.cargo}</div>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline" className="text-[10px]">{employee.unidade || 'Ouro Verde'}</Badge>
                        <Badge variant="outline" className="text-[10px] bg-blue-50/50">
                          {employee.turno || 'Diurno'}{getEmployeeShiftLabel(employee)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {calculateAge(employee.data_nascimento) ? `${calculateAge(employee.data_nascimento)} anos` : '—'}
                    </TableCell>
                    <TableCell>{employee.escala}</TableCell>
                    <TableCell>{getEmployeeSalaryLabel(employee)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {employee.tem_vt && <Badge variant="secondary" className="text-[10px]">VT</Badge>}
                        {employee.tem_insalubridade && <Badge variant="secondary" className="text-[10px]">Ins.</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(employee.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openReceipt(employee)} title="Gerar Recibo">
                          <ReceiptText className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => printEmployeeRegistrationForm(employee)} title="Ficha Cadastral">
                          <User className="h-4 w-4 text-orange-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => printEmployeeContract(employee)} title="Imprimir Contrato">
                          <FileText className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(employee)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(employee.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nome Completo</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>RG</Label>
              <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} className="mt-1" placeholder="Digite o RG" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:col-span-2">
              <div className="md:col-span-1">
                <Label>CEP</Label>
                <Input value={form.cep || ''} onChange={(e) => setForm({ ...form, cep: e.target.value })} onBlur={(e) => handleCepBlur(e.target.value)} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Endereço Completo</Label>
                <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="mt-1" placeholder="Rua, Número, Bairro" />
              </div>
              <div className="md:col-span-1">
                <Label>Cidade (UF)</Label>
                <Input value={form.uf ? `${form.cidade} - ${form.uf}` : (form.cidade || '')} onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes(' - ')) {
                    const [cit, st] = val.split(' - ');
                    setForm({ ...form, cidade: cit, uf: st });
                  } else {
                    setForm({ ...form, cidade: val });
                  }
                }} className="mt-1" placeholder="Cidade - UF" />
              </div>
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Unidade de Trabalho</Label>
              <Select value={form.unidade || 'Ouro Verde'} onChange={(e) => setForm({ ...form, unidade: e.target.value as Employee['unidade'] })} className="mt-1">
                <option value="Ouro Verde">Ouro Verde</option>
              </Select>
            </div>
            <div>
              <Label>Turno</Label>
              <Select value={form.turno || 'Diurno'} onChange={(e) => {
                const turno = e.target.value as Employee['turno']
                setForm({ ...form, turno, ...getDefaultShiftTimes(turno, form.escala) })
              }} className="mt-1">
                <option value="Diurno">Diurno (07:00/19:00)</option>
                <option value="Noturno">Noturno (19:00/07:00)</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Entrada do Turno</Label>
                <Input type="time" value={normalizeTime(form.turno_inicio)} onChange={(e) => setForm({ ...form, turno_inicio: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Saída do Turno</Label>
                <Input type="time" value={normalizeTime(form.turno_fim)} onChange={(e) => setForm({ ...form, turno_fim: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Escala</Label>
              <Select value={form.escala} onChange={(e) => {
                const escala = e.target.value as Employee['escala']
                const shouldApplyDefault = !form.turno_inicio || !form.turno_fim
                setForm({ ...form, escala, ...(shouldApplyDefault ? getDefaultShiftTimes(form.turno || 'Diurno', escala) : {}) })
              }} className="mt-1">
                <option value="12x36">12x36</option>
                <option value="Mensalista">Mensalista (Seg-Sex 06:30-14:30)</option>
                <option value="40h">40h (Padrão 40h/Semana)</option>
                <option value="Manual">Manual (Lançamento Livre)</option>
                <option value="Dobra">Dobra de Turno</option>
              </Select>
            </div>
            <div>
              <Label>{form.salario_tipo === 'diaria' ? 'Valor da Diária' : 'Salário Base Mensal'}</Label>
              <Input type="number" value={form.salario} onChange={(e) => setForm({ ...form, salario: Number(e.target.value) })} className="mt-1" />
            </div>
            <div>
              <Label>Tipo de Salário</Label>
              <Select value={form.salario_tipo || 'mensal'} onChange={(e) => setForm({ ...form, salario_tipo: e.target.value as Employee['salario_tipo'] })} className="mt-1">
                <option value="mensal">Mensal</option>
                <option value="diaria">Diária</option>
              </Select>
            </div>
            <div>
              <Label>Descontos Fixos (Mensais)</Label>
              <Input type="number" value={form.descontos_fixos} onChange={(e) => setForm({ ...form, descontos_fixos: Number(e.target.value) })} className="mt-1" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Employee['status'] })} className="mt-1">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="ferias">Férias</option>
                <option value="contrato_cancelado">Contrato Cancelado</option>
              </Select>
            </div>
            <div>
              <Label>Tipo de Contrato</Label>
              <Select value={form.tipo_contrato || 'autonomo'} onChange={(e) => setForm({ ...form, tipo_contrato: e.target.value as Employee['tipo_contrato'] })} className="mt-1">
                <option value="autonomo">Autônomo</option>
                <option value="mei">MEI</option>
              </Select>
            </div>
            <div>
              <Label>Contrato de Experiência</Label>
              <Select value={form.contrato_experiencia || 'nao'} onChange={(e) => setForm({ ...form, contrato_experiencia: e.target.value as Employee['contrato_experiencia'] })} className="mt-1">
                <option value="nao">Não</option>
                <option value="30">30 dias</option>
                <option value="45">45 dias</option>
              </Select>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div className="col-span-1 md:col-span-2">
                <h4 className="text-sm font-semibold text-primary">Dados para Pagamento</h4>
              </div>
              <div>
                <Label>Dados Bancários (Banco, Agência, Conta)</Label>
                <Input 
                  value={form.dados_bancarios || ''} 
                  onChange={(e) => setForm({ ...form, dados_bancarios: e.target.value })} 
                  placeholder="Ex: Itaú - Ag 1234 - CC 56789-0"
                  className="mt-1" 
                />
              </div>
              <div>
                <Label>Chave PIX</Label>
                <Input 
                  value={form.chave_pix || ''} 
                  onChange={(e) => setForm({ ...form, chave_pix: e.target.value })} 
                  placeholder="CPF, E-mail, Celular ou Chave Aleatória"
                  className="mt-1" 
                />
              </div>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg md:col-span-2 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-base font-semibold text-primary">Vale Transporte</Label>
                  <p className="text-xs text-muted-foreground mb-3">Selecione a modalidade de transporte do funcionário</p>
                  
                  <Select 
                    value={!form.tem_vt ? 'não' : form.vt_tipo || (form.vt_valor === 130 ? 'municipal' : form.vt_valor === 150 ? 'combustivel' : 'personalizado')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'não') {
                        setForm({ ...form, tem_vt: false, vt_valor: 0, vt_tipo: 'não' });
                      } else if (val === 'municipal') {
                        setForm({ ...form, tem_vt: true, vt_valor: 130, vt_tipo: 'municipal' });
                      } else if (val === 'combustivel') {
                        setForm({ ...form, tem_vt: true, vt_valor: 150, vt_tipo: 'combustivel' });
                      } else if (val === 'diaria') {
                        setForm({ ...form, tem_vt: true, vt_tipo: 'diaria' });
                      } else {
                        setForm({ ...form, tem_vt: true, vt_tipo: 'personalizado' });
                      }
                    }}
                    className="mt-1"
                  >
                    <option value="não">Não utiliza VT</option>
                    <option value="municipal">Transporte Municipal (R$ 130,00)</option>
                    <option value="combustivel">Ajuda Combustível (R$ 150,00)</option>
                    <option value="diaria">Por Dia Trabalhado</option>
                    <option value="personalizado">Valor Personalizado...</option>
                  </Select>
                </div>
                {form.tem_vt && (
                  <div className="pl-4 border-l-2 border-primary/20 animate-in slide-in-from-left-2 duration-200">
                    <Label className="text-xs text-muted-foreground">
                      {form.vt_tipo === 'diaria' ? 'Confirmar Valor por Dia Trabalhado (R$)' : 'Confirmar Valor Mensal (R$)'}
                    </Label>
                    <Input 
                      type="number" 
                      value={form.vt_valor} 
                      onChange={(e) => setForm({ ...form, vt_valor: Number(e.target.value) })} 
                      className="mt-1 h-8 max-w-[150px]"
                      placeholder="Valor fixo"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4 pt-4 border-t border-muted">
                <div className="space-y-2">
                  <Label className="text-base font-semibold text-primary">Adicional de Insalubridade</Label>
                  <p className="text-xs text-muted-foreground mb-3">Selecione o percentual do adicional se aplicável</p>
                  
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      type="button"
                      variant={!form.tem_insalubridade ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm({ ...form, tem_insalubridade: false, insalubridade_percentual: 0 })}
                      className="flex-1 min-w-[80px]"
                    >
                      Nenhum
                    </Button>
                    <Button 
                      type="button"
                      variant={form.tem_insalubridade && form.insalubridade_percentual === 10 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm({ ...form, tem_insalubridade: true, insalubridade_percentual: 10 })}
                      className="flex-1 min-w-[80px]"
                    >
                      10%
                    </Button>
                    <Button 
                      type="button"
                      variant={form.tem_insalubridade && form.insalubridade_percentual === 20 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm({ ...form, tem_insalubridade: true, insalubridade_percentual: 20 })}
                      className="flex-1 min-w-[80px]"
                    >
                      20%
                    </Button>
                    <Button 
                      type="button"
                      variant={form.tem_insalubridade && form.insalubridade_percentual === 40 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm({ ...form, tem_insalubridade: true, insalubridade_percentual: 40 })}
                      className="flex-1 min-w-[80px]"
                    >
                      40%
                    </Button>
                  </div>
                </div>

                {form.tem_insalubridade && (
                  <div className="pl-4 border-l-2 border-primary/20 animate-in slide-in-from-left-2 duration-200">
                    <Label className="text-xs text-muted-foreground">Confirmar Percentual (%)</Label>
                    <Input 
                      type="number" 
                      value={form.insalubridade_percentual} 
                      onChange={(e) => setForm({ ...form, insalubridade_percentual: Number(e.target.value) })} 
                      className="mt-1 h-8 max-w-[150px]"
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>Data de Nascimento</Label>
              <Input type="date" value={form.data_nascimento || ''} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Data de Admissão</Label>
              <Input type="date" value={form.dataAdmissao} onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Estado Civil</Label>
              <Select value={form.estado_civil || ''} onChange={(e) => setForm({ ...form, estado_civil: e.target.value })} className="mt-1">
                <option value="">Selecionar...</option>
                <option value="Solteiro(a)">Solteiro(a)</option>
                <option value="Casado(a)">Casado(a)</option>
                <option value="União Estável">União Estável</option>
                <option value="Divorciado(a)">Divorciado(a)</option>
                <option value="Viúvo(a)">Viúvo(a)</option>
              </Select>
            </div>
            <div>
              <Label>Nome do Cônjuge</Label>
              <Input value={form.nome_conjuge || ''} onChange={(e) => setForm({ ...form, nome_conjuge: e.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border">
                <input
                  type="checkbox"
                  id="possui_filhos_menores_14"
                  checked={!!form.possui_filhos_menores_14}
                  onChange={(e) => setForm({
                    ...form,
                    possui_filhos_menores_14: e.target.checked,
                    quantidade_filhos_menores_14: e.target.checked ? form.quantidade_filhos_menores_14 || 1 : 0
                  })}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="possui_filhos_menores_14" className="text-sm font-medium cursor-pointer">
                  Possui filhos menores de 14 anos?
                </Label>
              </div>
              {form.possui_filhos_menores_14 && (
                <div>
                  <Label>Quantidade de Filhos</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.quantidade_filhos_menores_14 || 1}
                    onChange={(e) => setForm({ ...form, quantidade_filhos_menores_14: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
            <div>
              <Label>Grau de Escolaridade</Label>
              <Select value={form.grau_escolaridade || ''} onChange={(e) => setForm({ ...form, grau_escolaridade: e.target.value })} className="mt-1">
                <option value="">Selecionar...</option>
                <option value="Ensino Fundamental">Ensino Fundamental</option>
                <option value="Ensino Médio">Ensino Médio</option>
                <option value="Ensino Técnico">Ensino Técnico</option>
                <option value="Ensino Superior">Ensino Superior</option>
                <option value="Pós-graduação">Pós-graduação</option>
                <option value="Mestrado">Mestrado</option>
                <option value="Doutorado">Doutorado</option>
              </Select>
            </div>
            <div>
              <Label>Situação da Escolaridade</Label>
              <Select value={form.situacao_escolaridade || ''} onChange={(e) => setForm({ ...form, situacao_escolaridade: e.target.value })} className="mt-1">
                <option value="">Selecionar...</option>
                <option value="Completo">Completo</option>
                <option value="Incompleto">Incompleto</option>
                <option value="Cursando">Cursando</option>
              </Select>
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2 flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10 mt-2">
              <input 
                type="checkbox" 
                id="is_pro_labore"
                checked={form.is_pro_labore} 
                onChange={(e) => setForm({ ...form, is_pro_labore: e.target.checked })} 
                className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="is_pro_labore" className="text-sm font-bold leading-none cursor-pointer">
                  Sócio / Pro-Labore
                </Label>
                <p className="text-xs text-muted-foreground">
                  Marque esta opção se este cadastro for de um sócio para retirada de Pro-Labore.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar Funcionário</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogHeader>
          <DialogTitle>Gerar Recibo de Pagamento</DialogTitle>
          <p className="text-sm text-muted-foreground">{selectedEmp?.nome}</p>
        </DialogHeader>
        <DialogContent className="max-w-md">
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Itens do Recibo</Label>
              <Button size="sm" variant="outline" onClick={() => setReceiptItems([...receiptItems, { desc: '', val: 0 }])} className="h-8 gap-1">
                <Plus className="h-3 w-3" /> Adicionar Item
              </Button>
            </div>
            
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
              {receiptItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <Input 
                      placeholder="Descrição" 
                      value={item.desc} 
                      onChange={(e) => {
                        const newItems = [...receiptItems]
                        newItems[idx].desc = e.target.value
                        setReceiptItems(newItems)
                      }}
                    />
                  </div>
                  <div className="w-32">
                    <Input 
                      type="number" 
                      placeholder="Valor" 
                      value={item.val} 
                      onChange={(e) => {
                        const newItems = [...receiptItems]
                        newItems[idx].val = Number(e.target.value)
                        setReceiptItems(newItems)
                      }}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setReceiptItems(receiptItems.filter((_, i) => i !== idx))} className="h-10 w-10">
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t flex justify-between items-center">
              <span className="font-bold">Total do Recibo:</span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(receiptItems.reduce((s, i) => s + i.val, 0))}
              </span>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReceiptDialogOpen(false)}>Cancelar</Button>
          <Button onClick={printSimpleReceipt} className="gap-2">
            <ReceiptText className="h-4 w-4" /> Gerar Recibo PDF
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

