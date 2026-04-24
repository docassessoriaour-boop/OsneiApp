import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import type { Employee } from '@/lib/types'

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
  unidade: 'Vila Moraes',
  turno: 'Diurno',
  escala: '40h',
  salario: 0,
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
  dados_bancarios: '',
  chave_pix: '',
  is_pro_labore: false,
}

export default function Funcionarios() {
  const { data: employees, loading, insert, update, remove } = useDb<Employee>('employees')
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo' | 'ferias' | 'contrato_cancelado'>('todos')
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

  function openNew() {
    setForm(emptyEmployee)
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(employee: Employee) {
    setForm(employee)
    setEditingId(employee.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nome || !form.cpf || !form.cargo) return

    // Sanitize data: empty strings in date fields should be null for Postgres
    const payload = {
      ...form,
      data_nascimento: form.data_nascimento || null,
      dataAdmissao: form.dataAdmissao || null
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
      { desc: 'Salário Base', val: emp.salario },
      ...(emp.tem_vt ? [{ desc: 'Vale Transporte', val: emp.vt_valor }] : []),
      ...(emp.tem_insalubridade ? [{ desc: 'Adicional Insalubridade', val: (emp.salario * (emp.insalubridade_percentual / 100)) }] : [])
    ])
    setReceiptDialogOpen(true)
  }

  function printSimpleReceipt() {
    if (!selectedEmp) return
    const total = receiptItems.reduce((s, i) => s + i.val, 0)
    const today = new Date().toLocaleDateString('pt-BR')
    
    let rows = receiptItems.map(i => `
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
        <p><strong>Empregador:</strong> ${clinic?.nome_fantasia || 'Novo Horizonte'}</p>
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
        <p style="margin: 0; text-indent: 0;">Recebi de <strong>${clinic?.nome_fantasia || 'Novo Horizonte'}</strong> a importância de <strong>${formatCurrencyPDF(total)}</strong> referente aos itens descritos acima.</p>
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
    const rows = filtered.map(e => `<tr><td>${e.nome}</td><td>${e.cpf}</td><td>${e.cargo}<br/><small>${e.unidade || 'Vila Moraes'} - ${e.turno || 'Diurno'}</small></td><td>${e.escala}</td><td>${formatDatePDF(e.dataAdmissao)}</td><td class="text-right">${formatCurrencyPDF(e.salario)}</td><td>${e.status}</td></tr>`).join('')
    const totalSalario = filtered.reduce((s, e) => s + e.salario, 0)
    printPDF(`Relatório de Funcionários - ${statusLabel}`, `
      <table><thead><tr><th>Nome</th><th>CPF</th><th>Cargo / Unidade / Turno</th><th>Escala</th><th>Admissão</th><th class="text-right">Salário</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="divider"></div>
      <div style="text-align:right;font-weight:700;">Total Folha: ${formatCurrencyPDF(totalSalario)}</div>
    `, clinic)
  }

  function printEmployeeContract(emp: Employee) {
    const amountStr = formatCurrencyPDF(emp.salario)
    const admissao = formatDatePDF(emp.dataAdmissao)
    const today = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

    const html = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin-bottom: 5px; text-transform: uppercase;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h2>
        <h3 style="margin-top: 0; text-transform: uppercase; border:none;">CUIDADOR AUTÔNOMO DE IDOSOS</h3>
       </div>
       
       <div class="abnt-text" style="text-align: justify; line-height: 1.5; font-size: 12pt;">
        <p style="text-indent: 0;"><strong>CONTRATANTE:</strong></p>
        <p><strong>NOVO HORIZONTE CASA DOS IDOSOS</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº <strong>56.956.061/0001-81</strong>, com sede na Rua Silva Jardim, 1012, Vila Moraes, Ourinhos, São Paulo, representada neste ato por <strong>JULIANA VIRGINIA DA SILVA</strong>, brasileira, casada, enfermeira, RG 34.171.146-9 e CPF 285.840.548-47, na função de Sócia-administradora.</p>

        <p style="text-indent: 0; margin-top: 20px;"><strong>CONTRATADO(A):</strong></p>
        <div style="margin-top: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background-color: #f9f9f9;">
          <p style="margin: 0; text-indent: 0;"><strong>NOME:</strong> ${emp.nome.toUpperCase()}</p>
          <p style="margin: 0; text-indent: 0;"><strong>CPF:</strong> ${emp.cpf}</p>
          <p style="margin: 0; text-indent: 0;"><strong>RG:</strong> ${emp.rg || '—'}</p>
          <p style="margin: 0; text-indent: 0;"><strong>ENDEREÇO:</strong> ${emp.endereco || '—'}</p>
          <p style="margin: 0; text-indent: 0;"><strong>PROFISSÃO:</strong> ${emp.cargo.toUpperCase()}</p>
        </div>

        <p>As partes acima qualificadas, por este instrumento particular, de comum acordo, celebram o presente contrato, que se regerá pelas seguintes cláusulas e condições:</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA PRIMEIRA – DO OBJETO</h3>
        <p>O objeto do presente contrato é a prestação de serviços de <strong>${emp.cargo.toUpperCase()}</strong> a ser realizada pelo(a) <strong>CONTRATADO(A)</strong>, que deverá zelar pelo bem-estar físico e mental, segurança e qualidade de vida dos idosos, residentes na clínica do(a) <strong>CONTRATANTE</strong>.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SEGUNDA – DAS OBRIGAÇÕES DO(A) CONTRATADO(A)</h3>
        <p>1.1. O(A) <strong>CONTRATADO(A)</strong> compromete-se a executar os serviços de forma autônoma, sem subordinação ou vínculo empregatício com o(a) <strong>CONTRATANTE</strong>.</p>
        <p style="margin-top: 10px;">1.2. Entre as atividades a serem desempenhadas, incluem-se, mas não se limitam a: acompanhamento em atividades diárias (higiene, alimentação, locomoção), administração de medicamentos conforme orientação médica, monitoramento da saúde e bem-estar, auxílio em tarefas de organização do ambiente do idoso, e respeito à confidencialidade das informações.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA TERCEIRA – DAS OBRIGAÇÕES DO(A) CONTRATANTE</h3>
        <p>1.1. O(A) <strong>CONTRATANTE</strong> compromete-se a fornecer todas as informações e orientações necessárias para a correta execução dos serviços.</p>
        <p style="margin-top: 10px;">1.2. Pagar ao(à) <strong>CONTRATADO(A)</strong> a remuneração estipulada na Cláusula Quarta, nas datas e condições acordadas.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA QUARTA – DO PREÇO E DA FORMA DE PAGAMENTO</h3>
        <p>1.1. O(A) <strong>CONTRATANTE</strong> pagará ao(à) <strong>CONTRATADO(A)</strong> o valor de <strong>${amountStr}</strong> por mês.</p>
        <p style="margin-top: 10px;">1.2. O pagamento será realizado via Pix, para conta bancária estipulada pela <strong>CONTRATADA</strong>, até o <strong>5º dia útil</strong> de cada mês, mediante a apresentação do correspondente Recibo de Pagamento.</p>
        <p style="margin-top: 10px;">1.3. Em caso de atraso no pagamento, o valor devido será acrescido de multa de 2% e juros de 2% ao mês, calculados sobre o valor total em atraso.</p>
        <p style="margin-top: 10px;">1.4. A CONTRATANTE fará à CONTRATADA um pagamento de <strong>BONIFICAÇÃO</strong> no mês de dezembro do ano vigente no valor de uma mensalidade do contrato, sendo o cálculo baseado proporcionalmente aos meses do contrato em vigência.</p>
        ${emp.tem_vt ? `<p style="margin-top: 10px;">1.5. O(A) <strong>CONTRATANTE</strong> pagará ao(à) <strong>CONTRATADO(A)</strong> o valor de <strong>${formatCurrencyPDF(emp.vt_valor)}</strong> por mês a título de vale-transporte.</p>` : ''}
        ${emp.tem_insalubridade ? `<p style="margin-top: 10px;">${emp.tem_vt ? '1.6' : '1.5'}. O(A) <strong>CONTRATANTE</strong> pagará ao(à) <strong>CONTRATADO(A)</strong> o adicional de insalubridade no percentual de <strong>${emp.insalubridade_percentual}%</strong> sobre o salário base.</p>` : ''}

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA QUINTA – DO PRAZO</h3>
        <p>O presente contrato terá a vigência por prazo <strong>indeterminado</strong>, com início em <strong>${admissao}</strong>.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SEXTA – DA RESCISÃO</h3>
        <p>1.1. O presente contrato poderá ser rescindido por qualquer das partes, a qualquer tempo, mediante aviso prévio de <strong>30 (trinta) dias</strong>, por escrito, sem a necessidade de justificativa e sem que isso gere direito a indenização, salvo as obrigações já vencidas.</p>
        <p style="margin-top: 10px;">1.2. O contrato será automaticamente rescindido por justa causa em caso de descumprimento de qualquer de suas cláusulas ou condições, sujeitando a parte infratora ao pagamento de multa de <strong>25% sobre o valor total do contrato</strong>, sem prejuízo das perdas e danos.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA SÉTIMA – DA INDEPENDÊNCIA DAS PARTES</h3>
        <p>As partes declaram que a relação jurídica estabelecida neste contrato é de natureza civil, e não trabalhista, não havendo subordinação hierárquica, vínculo empregatício ou qualquer outra relação de trabalho entre o(a) <strong>CONTRATADO(A)</strong> e o(a) <strong>CONTRATANTE</strong>. O(A) <strong>CONTRATADO(A)</strong> é responsável por todas as suas obrigações fiscais, previdenciárias e trabalhistas.</p>

        <h3 style="margin-top: 30px; text-transform: uppercase;">CLÁUSULA OITAVA – DO FORO</h3>
        <p>As partes elegem o Foro da Comarca de <strong>Ourinhos/SP</strong> para dirimir quaisquer dúvidas oriundas do presente contrato, renunciando a qualquer outro, por mais privilegiado que seja.</p>

        <p style="margin-top: 50px; text-align: right; text-indent: 0;">Ourinhos (SP), ${today}.</p>

        <div style="margin-top: 70px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px;">
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 10px;">
              <p style="margin: 0; text-indent: 0;"><strong>CONTRATANTE:</strong></p>
              <p style="margin: 0; text-indent: 0;">NOVO HORIZONTE CASA DOS IDOSOS</p>
              <p style="margin: 0; text-indent: 0;">CNPJ 56.956.061/0001-81</p>
            </div>
          </div>
          <div style="text-align: center;">
            <div style="border-top: 1px solid #000; padding-top: 10px;">
              <p style="margin: 0; text-indent: 0;"><strong>CONTRATADO(A):</strong></p>
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
              <p style="font-size: 10pt; margin: 0; text-indent: 0;">Nome: Osnei Luiz Vieira Vianna</p>
              <p style="font-size: 10pt; margin: 0; text-indent: 0;">CPF: 191.429.158-13</p>
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
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Telefone:</strong></td><td style="border:none; padding: 4px;">${employee.telefone || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>E-mail:</strong></td><td style="border:none; padding: 4px;">${employee.email || '—'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Endereço:</strong></td><td style="border:none; padding: 4px;">${employee.endereco || '—'}</td></tr>
        </table>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="background: #f4f4f4; padding: 5px 10px; font-size: 12pt; border-bottom: 2px solid #1a1f2e; margin-bottom: 10px;">DADOS PROFISSIONAIS</h3>
        <table style="width: 100%; border: none;">
          <tr style="border:none;"><td style="border:none; padding: 4px; width: 30%;"><strong>Cargo:</strong></td><td style="border:none; padding: 4px;">${employee.cargo}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Unidade:</strong></td><td style="border:none; padding: 4px;">${employee.unidade || 'Vila Moraes'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Turno:</strong></td><td style="border:none; padding: 4px;">${employee.turno || 'Diurno'}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Escala:</strong></td><td style="border:none; padding: 4px;">${employee.escala}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Data de Admissão:</strong></td><td style="border:none; padding: 4px;">${formatDatePDF(employee.dataAdmissao)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Salário Base:</strong></td><td style="border:none; padding: 4px;">${formatCurrencyPDF(employee.salario)}</td></tr>
          <tr style="border:none;"><td style="border:none; padding: 4px;"><strong>Status Atual:</strong></td><td style="border:none; padding: 4px;">${employee.status.toUpperCase()}</td></tr>
        </table>
      </div>

      <div style="margin-bottom: 20px;">
        <h3 style="background: #f4f4f4; padding: 5px 10px; font-size: 12pt; border-bottom: 2px solid #1a1f2e; margin-bottom: 10px;">BENEFÍCIOS E PAGAMENTO</h3>
        <table style="width: 100%; border: none;">
          <tr style="border:none;"><td style="border:none; padding: 4px; width: 30%;"><strong>Vale Transporte:</strong></td><td style="border:none; padding: 4px;">${employee.tem_vt ? `SIM (${employee.vt_tipo || 'Padrão'} - ${formatCurrencyPDF(employee.vt_valor)})` : 'NÃO'}</td></tr>
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
                        <Badge variant="outline" className="text-[10px]">{employee.unidade || 'Vila Moraes'}</Badge>
                        <Badge variant="outline" className="text-[10px] bg-blue-50/50">
                          {employee.turno || 'Diurno'} 
                          {employee.escala === '12x36' 
                            ? (employee.turno === 'Noturno' ? ' (19h-07h)' : ' (07h-19h)')
                            : (employee.escala === 'Mensalista' || employee.escala === '40h' ? ' (06:30-14:30)' : '')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {calculateAge(employee.data_nascimento) ? `${calculateAge(employee.data_nascimento)} anos` : '—'}
                    </TableCell>
                    <TableCell>{employee.escala}</TableCell>
                    <TableCell>{formatCurrency(employee.salario)}</TableCell>
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
            <div className="md:col-span-2">
              <Label>Endereço Completo</Label>
              <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="mt-1" placeholder="Rua, Número, Bairro, Cidade - UF" />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Unidade de Trabalho</Label>
              <Select value={form.unidade || 'Vila Moraes'} onChange={(e) => setForm({ ...form, unidade: e.target.value as Employee['unidade'] })} className="mt-1">
                <option value="Vila Moraes">Vila Moraes</option>
                <option value="Jardim Matilde">Jardim Matilde</option>
                <option value="Ambas">Ambas as Unidades</option>
              </Select>
            </div>
            <div>
              <Label>Turno</Label>
              <Select value={form.turno || 'Diurno'} onChange={(e) => setForm({ ...form, turno: e.target.value as Employee['turno'] })} className="mt-1">
                <option value="Diurno">Diurno (07:00/19:00)</option>
                <option value="Noturno">Noturno (19:00/07:00)</option>
              </Select>
            </div>
            <div>
              <Label>Escala</Label>
              <Select value={form.escala} onChange={(e) => setForm({ ...form, escala: e.target.value as Employee['escala'] })} className="mt-1">
                <option value="12x36">12x36</option>
                <option value="Mensalista">Mensalista (Seg-Sex 06:30-14:30)</option>
                <option value="40h">40h (Padrão 40h/Semana)</option>
                <option value="Manual">Manual (Lançamento Livre)</option>
                <option value="Dobra">Dobra de Turno</option>
              </Select>
            </div>
            <div>
              <Label>Salário Base</Label>
              <Input type="number" value={form.salario} onChange={(e) => setForm({ ...form, salario: Number(e.target.value) })} className="mt-1" />
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
                      } else {
                        setForm({ ...form, tem_vt: true, vt_tipo: 'personalizado' });
                      }
                    }}
                    className="mt-1"
                  >
                    <option value="não">Não utiliza VT</option>
                    <option value="municipal">Transporte Municipal (R$ 130,00)</option>
                    <option value="combustivel">Ajuda Combustível (R$ 150,00)</option>
                    <option value="personalizado">Valor Personalizado...</option>
                  </Select>
                </div>
                {form.tem_vt && (
                  <div className="pl-4 border-l-2 border-primary/20 animate-in slide-in-from-left-2 duration-200">
                    <Label className="text-xs text-muted-foreground">Confirmar Valor Mensal (R$)</Label>
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
