import { useState, useMemo } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import {
  DEMO_COMPANY_ADDRESS,
  DEMO_COMPANY_CNPJ,
  DEMO_COMPANY_LEGAL_NAME,
  DEMO_COMPANY_NAME,
  DEMO_COMPANY_REPRESENTATIVE,
  DEMO_COMPANY_REPRESENTATIVE_DOCS,
} from '@/lib/companies'
import type { Patient, Contract } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, FileText, BarChart3, Loader2, RefreshCw, History } from 'lucide-react'

export default function Contratos() {
  const { data: patients, loading: loadingPatients } = useDb<Patient>('patients')
  const { data: contracts, loading: loadingContracts, insert, update, remove } = useDb<Contract>('contracts')
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renovandoDe, setRenovandoDe] = useState<Contract | null>(null)
  const [view, setView] = useState<'table' | 'timeline'>('table')
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'vencido' | 'cancelado'>('ativo')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    pacienteId: '', valor: 0, valorExtra: 0, descricaoExtra: '', dataInicio: '', dataFim: '', status: 'ativo' as Contract['status'], observacoes: '',
  })

  // Histórico
  const [historicoOpen, setHistoricoOpen] = useState(false)
  const [historicoPacienteId, setHistoricoPacienteId] = useState<string | null>(null)
  const [historicoPacienteNome, setHistoricoPacienteNome] = useState('')

  const today = new Date()

  const filtered = useMemo(() => {
    let list = contracts.map(c => {
      const mapped = {
        ...c,
        pacienteId: (c as any).paciente_id || c.pacienteId,
        pacienteNome: (c as any).paciente_nome || c.pacienteNome,
        dataInicio: (c as any).data_inicio || c.dataInicio,
        dataFim: (c as any).data_fim || c.dataFim,
        valorExtra: (c as any).valor_extra || c.valorExtra,
        descricaoExtra: (c as any).descricao_extra || c.descricaoExtra,
      } as Contract
      if (!mapped.pacienteNome && mapped.pacienteId) {
        const p = patients.find(px => px.id === mapped.pacienteId)
        if (p) mapped.pacienteNome = p.nome
      }
      mapped.pacienteNome = mapped.pacienteNome || 'Desconhecido'
      return mapped
    }).filter(c => (c.pacienteNome).toLowerCase().includes(search.toLowerCase()))

    if (statusFilter !== 'todos') list = list.filter(c => c.status === statusFilter)
    if (filterStart) list = list.filter(c => c.dataFim >= filterStart)
    if (filterEnd) list = list.filter(c => c.dataFim <= filterEnd)
    return list.sort((a, b) => new Date(a.dataFim).getTime() - new Date(b.dataFim).getTime())
  }, [contracts, patients, search, filterStart, filterEnd, statusFilter])

  // Todos os contratos mapeados (sem filtro de status) — usado no histórico
  const allMapped = useMemo(() => {
    return contracts.map(c => {
      const mapped = {
        ...c,
        pacienteId: (c as any).paciente_id || c.pacienteId,
        pacienteNome: (c as any).paciente_nome || c.pacienteNome,
        dataInicio: (c as any).data_inicio || c.dataInicio,
        dataFim: (c as any).data_fim || c.dataFim,
        valorExtra: (c as any).valor_extra || c.valorExtra,
        descricaoExtra: (c as any).descricao_extra || c.descricaoExtra,
      } as Contract
      if (!mapped.pacienteNome && mapped.pacienteId) {
        const p = patients.find(px => px.id === mapped.pacienteId)
        if (p) mapped.pacienteNome = p.nome
      }
      mapped.pacienteNome = mapped.pacienteNome || 'Desconhecido'
      return mapped
    })
  }, [contracts, patients])

  // Histórico do paciente selecionado, do mais recente ao mais antigo
  const historicoContratos = useMemo(() => {
    if (!historicoPacienteId) return []
    return allMapped
      .filter(c => c.pacienteId === historicoPacienteId)
      .sort((a, b) => new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime())
  }, [allMapped, historicoPacienteId])

  function openNew() {
    setForm({ pacienteId: patients[0]?.id || '', valor: 0, valorExtra: 0, descricaoExtra: '', dataInicio: '', dataFim: '', status: 'ativo', observacoes: '' })
    setEditingId(null)
    setRenovandoDe(null)
    setDialogOpen(true)
  }

  function openRenovar(c: Contract) {
    // Calcula nova data início = dia seguinte ao vencimento do contrato atual
    const fimAtual = c.dataFim ? new Date(c.dataFim + 'T12:00:00') : new Date()
    const novoInicio = new Date(fimAtual)
    novoInicio.setDate(novoInicio.getDate() + 1)
    const novoFim = new Date(novoInicio)
    novoFim.setFullYear(novoInicio.getFullYear() + 1)

    const toStr = (d: Date) => d.toISOString().split('T')[0]

    setForm({
      pacienteId: c.pacienteId || (c as any).paciente_id,
      valor: c.valor,
      valorExtra: c.valorExtra || 0,
      descricaoExtra: c.descricaoExtra || '',
      dataInicio: toStr(novoInicio),
      dataFim: toStr(novoFim),
      status: 'ativo',
      observacoes: `Renovação do contrato ${c.numero_contrato || c.id.slice(0, 8).toUpperCase()}`,
    })
    setEditingId(null)
    setRenovandoDe(c)
    setDialogOpen(true)
  }

  function openHistorico(c: Contract) {
    setHistoricoPacienteId(c.pacienteId || (c as any).paciente_id)
    setHistoricoPacienteNome(c.pacienteNome)
    setHistoricoOpen(true)
  }

  async function handleSave() {
    const patient = patients.find(p => p.id === form.pacienteId)
    if (!patient) {
      alert('Selecione um paciente cadastrado.')
      return
    }

    setSaving(true)
    try {
      const dbPayload = {
        paciente_id: form.pacienteId,
        paciente_nome: patient.nome,
        valor: form.valor,
        valor_extra: form.valorExtra,
        descricao_extra: form.descricaoExtra,
        data_inicio: form.dataInicio,
        data_fim: form.dataFim,
        status: form.status,
        observacoes: form.observacoes,
      }

      if (editingId) {
        await update(editingId, dbPayload as any)
      } else {
        const now = new Date()
        const dd = String(now.getDate()).padStart(2, '0')
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const yyyy = now.getFullYear()
        const hh = String(now.getHours()).padStart(2, '0')
        const min = String(now.getMinutes()).padStart(2, '0')
        const num = `CPS-${dd}${mm}${yyyy}${hh}${min}`

        // Se for renovação, registra referência ao contrato anterior e marca-o como vencido
        if (renovandoDe) {
          await insert({ ...dbPayload, numero_contrato: num, contrato_renovado_de: renovandoDe.id } as any)
          await update(renovandoDe.id, { status: 'vencido' } as any)
        } else {
          await insert({ ...dbPayload, numero_contrato: num } as any)
        }
      }
      setDialogOpen(false)
      setRenovandoDe(null)
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar contrato.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Deseja excluir este contrato?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error(error)
        alert('Erro ao excluir contrato.')
      }
    }
  }

  function openEdit(c: Contract) {
    const mappedC = {
      ...c,
      pacienteId: (c as any).paciente_id || c.pacienteId,
      valorExtra: (c as any).valor_extra || c.valorExtra,
      descricaoExtra: (c as any).descricao_extra || c.descricaoExtra,
      dataInicio: (c as any).data_inicio || c.dataInicio,
      dataFim: (c as any).data_fim || c.dataFim
    }

    setForm({
      pacienteId: mappedC.pacienteId,
      valor: mappedC.valor,
      valorExtra: mappedC.valorExtra || 0,
      descricaoExtra: mappedC.descricaoExtra || '',
      dataInicio: mappedC.dataInicio,
      dataFim: mappedC.dataFim,
      status: mappedC.status,
      observacoes: mappedC.observacoes
    })
    setEditingId(c.id)
    setRenovandoDe(null)
    setDialogOpen(true)
  }

  const statusBadge = (status: Contract['status']) => {
    const map = { ativo: 'success', vencido: 'warning', cancelado: 'destructive' } as const
    const labels = { ativo: 'Ativo', vencido: 'Vencido', cancelado: 'Cancelado' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  function getDaysRemaining(dataFim: string) {
    const diff = Math.ceil((new Date(dataFim).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  function getTimelinePercent(dataInicio: string, dataFim: string) {
    const start = new Date(dataInicio).getTime()
    const end = new Date(dataFim).getTime()
    const now = today.getTime()
    if (now <= start) return 0
    if (now >= end) return 100
    return Math.round(((now - start) / (end - start)) * 100)
  }

  function getTimelineColor(daysLeft: number, status: string) {
    if (status === 'cancelado') return '#9ca3af'
    if (daysLeft < 0) return '#dc2626'
    if (daysLeft <= 30) return '#f59e0b'
    if (daysLeft <= 90) return '#3b82f6'
    return '#16a34a'
  }

  function exportTimelinePDF() {
    let rows = ''
    for (const c of filtered) {
      const days = getDaysRemaining(c.dataFim)
      const color = getTimelineColor(days, c.status)
      const statusLabel = days < 0 ? 'Vencido' : days <= 30 ? 'Vence em breve' : 'No prazo'
      rows += `
        <tr>
          <td>${c.pacienteNome}</td>
          <td>${formatDatePDF(c.dataInicio)}</td>
          <td>${formatDatePDF(c.dataFim)}</td>
          <td>${formatCurrencyPDF(c.valor)}</td>
          <td>${days < 0 ? `Vencido há ${Math.abs(days)}d` : `${days} dias`}</td>
          <td><span class="badge" style="background:${color}20;color:${color};">${statusLabel}</span></td>
        </tr>`
    }
    const html = `
      <p style="margin-bottom:12px;font-size:12px;">Filtro: ${filterStart ? formatDatePDF(filterStart) : 'Início'} — ${filterEnd ? formatDatePDF(filterEnd) : 'Fim'}</p>
      <table>
        <thead><tr><th>Paciente</th><th>Início</th><th>Vencimento</th><th>Valor</th><th>Dias Rest.</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;font-size:11px;color:#666;">
        <p>Total de contratos: ${filtered.length}</p>
        <p>Valor total mensal: ${formatCurrencyPDF(filtered.reduce((s, c) => s + c.valor, 0))}</p>
      </div>
    `
    printPDF('Relatório de Timeline de Contratos', html, clinic)
  }

  function printContract(c: Contract) {
    const pid = c.pacienteId || (c as any).paciente_id
    const p = patients.find(px => px.id === pid)
    if (!p) return

    const fullAddress = `${p.resp_endereco || ''}, ${p.resp_cep || ''}, ${p.resp_cidade || ''}`
    const todayStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const contractorName = clinic?.razao_social || (clinic as any)?.name || clinic?.nome_fantasia || DEMO_COMPANY_LEGAL_NAME
    const contractorTradeName = clinic?.nome_fantasia || (clinic as any)?.name || DEMO_COMPANY_NAME
    const contractorCnpj = clinic?.cnpj || DEMO_COMPANY_CNPJ
    const contractorAddress = clinic?.endereco || DEMO_COMPANY_ADDRESS
    const contractorRepresentative = (clinic as any)?.representante || DEMO_COMPANY_REPRESENTATIVE
    const contractorRepresentativeDocs = (clinic as any)?.representante_documentos || DEMO_COMPANY_REPRESENTATIVE_DOCS

    const allResps = [
      { nome: p.responsavel, cpf: p.resp_cpf, rg: p.resp_rg, nac: p.resp_nacionalidade, civil: p.resp_estado_civil, prof: p.resp_profissao, end: fullAddress },
      ...(p.outros_responsaveis || []).map(r => ({
        nome: r.nome, cpf: r.cpf, rg: r.rg, nac: r.nacionalidade || 'Brasileira', civil: r.estado_civil || '---', prof: r.profissao || '---', end: r.endereco || fullAddress
      }))
    ]

    const responsiblesText = allResps.map((r, i) => `
      ${i > 0 ? '<p style="margin-top: 10px;">E também como <strong>CO-CONTRATANTE:</strong></p>' : ''}
      <p><strong>${i > 0 ? i + 1 + 'º ' : ''}CONTRATANTE: ${r.nome}</strong>, ${r.nac || 'Brasileira'}, ${r.civil || '---'}, ${r.prof || '---'}, portador(a) do RG nº ${r.rg || '---'} e CPF nº ${r.cpf || '---'}, residente na ${r.end}.</p>
    `).join('')

    const dInicio = c.dataInicio || (c as any).data_inicio
    const dFim = c.dataFim || (c as any).data_fim
    const valor = c.valor
    const valorExtra = c.valorExtra || (c as any).valor_extra
    const descricaoExtra = c.descricaoExtra || (c as any).descricao_extra

    const html = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin-bottom: 5px; text-transform: uppercase;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE</h2>
        <h2 style="margin-top: 0; text-transform: uppercase;">ACOLHIMENTO E CUIDADOS PARA IDOSOS</h2>
        <p style="margin-top: 20px;"><strong>CONTRATO Nº: ${c.numero_contrato || c.id.slice(0, 8).toUpperCase()}</strong></p>
      </div>

      <div class="abnt-text" style="text-align: justify; line-height: 1.5;">
        <p><strong>CONTRATADA: ${contractorName.toUpperCase()}</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${contractorCnpj}, com sede na ${contractorAddress}, representada por <strong>${contractorRepresentative}</strong>, ${contractorRepresentativeDocs}.</p>
        
        ${responsiblesText}

        <p>Pelo presente instrumento particular, as partes acima qualificadas, doravante denominadas CONTRATANTE e CONTRATADA, na melhor forma de direito, ajustam e contratam a prestação de serviços profissionais destinados a moradia definitiva, temporária e/ou provisória de idosos nos termos da <strong>Lei 10.741/2003 (Estatuto do Idoso)</strong>, segundo as cláusulas e condições adiante arroladas.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA PRIMEIRA - DO OBJETO E SERVIÇOS</h3>
        <p>1.1. O presente contrato tem como objeto a prestação de serviços de acolhimento e cuidados personalizados ao(à) residente <strong>${p.nome}</strong>, portador(a) do RG nº ${p.rg || '---'} e CPF nº ${p.cpf || '---'}, na modalidade de Instituição de Longa Permanência para Idosos (ILPI), em regime de internato, focando em necessidades humanas básicas (higiene, saúde, moradia, alimentação e convivência social), não se caracterizando como serviços hospitalares ou sanitários.</p>
        
        <p><strong>1.2. Serviços Inclusos:</strong></p>
        <ul style="margin-left: 20px; margin-top: 10px;">
          <li><strong>Suporte de enfermagem 24 horas</strong> e equipe de cuidadores.</li>
          <li><strong>Serviços de limpeza diária</strong> e lavanderia.</li>
          <li><strong>Atividades de lazer</strong>, recreação e preservação do vínculo familiar.</li>
          <li><strong>Residência:</strong> Alojamento em dormitórios compartilhados (com duas ou três camas, separadas por sexo, conforme disponibilidade), com cama individual e móveis para guarda pessoal, adaptado para as necessidades de pessoas idosas.</li>
          <li><strong>Acolhimento Humanizado:</strong> Tratamento respeitoso e individualizado, com equipe de cuidadores dedicados.</li>
          <li><strong>Alimentação:</strong> Oferecimento de, no mínimo, seis refeições diárias, adequadas e suficientes para as necessidades do(a) residente.</li>
          <li><strong>Acessibilidade:</strong> Instalações adaptadas para garantir a acessibilidade dos moradores.</li>
        </ul>

        <p style="margin-top: 15px;"><strong>1.3. DA AUTONOMIA DOS SERVIÇOS:</strong> Os serviços serão prestados pela CONTRATADA de forma autônoma e independente, sem qualquer vínculo empregatício com o(a) CONTRATANTE.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA SEGUNDA - DOS VALORES E TAXAS</h3>
        <p>2.1. O valor mensal é de <strong>${formatCurrencyPDF(valor)}</strong>, a ser pago todo <strong>5º dia útil</strong> de cada mês.</p>
        ${valorExtra && valorExtra > 0 ? `
        <p>2.1.1. <strong>Valores Extras Adicionais:</strong> Também será devido o valor de <strong>${formatCurrencyPDF(valorExtra)}</strong>, referente a: <em>${descricaoExtra || '---'}</em>.</p>
        ` : ''}
        <p>2.2. <strong>Penalidades:</strong> Multa de 2% sobre o atraso e juros de 1% ao mês.</p>
        <p style="font-size: 14pt;"><strong>2.3. Taxas Extras: Será cobrada uma taxa extra de ½ salário mínimo em dezembro para despesas de final de ano e encargos.</strong></p>
        <p>2.4. <strong>Reajustes:</strong> O valor será corrigido anualmente em 15% (automaticamente) ou em caso de mudança no grau de dependência do idoso.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA TERCEIRA - DAS OBRIGAÇÕES DO CONTRATANTE</h3>
        <p>3.1. Fornecer dados de profissionais particulares (médicos, dentistas) e relação de medicamentos com receituário atualizado.</p>
        <p>3.2. Ressarcir a CONTRATADA por gastos extras antecipados (medicamentos, fraldas, higiene, etc.) mediante comprovante.</p>
        <p>3.3. Providenciar ação de curatela em até 30 dias caso o idoso perca a capacidade de responder por si.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA QUARTA - SERVIÇOS NÃO INCLUÍDOS</h3>
        <p>4.1. Não estão inclusos: Consultas externas, acompanhamento hospitalar, fraldas descartáveis, medicamentos pessoais, materiais para curativos específicos, roupas de uso pessoal e cobertores.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA QUINTA - VIGÊNCIA E RESCISÃO</h3>
        <p>5.1. O contrato entra em vigor em <strong>${formatDatePDF(dInicio)}</strong> com término em <strong>${formatDatePDF(dFim)}</strong>.</p>
        <p>5.2. A rescisão pode ocorrer por qualquer parte com aviso prévio de <strong>30 dias</strong>. Caso o Contratante rescinda sem aviso, será cobrada multa de 50% da mensalidade.</p>
        <p>5.3. Em caso de falecimento do idoso, o contrato será automaticamente rescindido de pleno direito, sendo devido apenas o pagamento proporcional aos serviços efetivamente prestados no mês em curso. Fica estabelecido que não haverá qualquer devolução de valores já pagos à clínica, seja a título de mensalidade, taxa de adesão ou outros encargos, considerando que tais quantias correspondem a serviços disponibilizados e/ou custos administrativos já assumidos.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA SEXTA - REGRAS GERAIS</h3>
        <p>6.1. <strong>Foro:</strong> Fica eleito o foro da Comarca de <strong>Ourinhos/SP</strong> para dirimir quaisquer dúvidas oriundas deste contrato.</p>

        <div style="margin-top: 50px;">
          <p style="text-indent: 0;">Ourinhos, ${todayStr}.</p>
        </div>

        <div style="margin-top: 60px; display: flex; justify-content: space-around;">
          <div style="text-align: center; width: 250px;">
            <div style="border-top: 1px solid #000; margin-bottom: 0.5rem;"></div>
            <p style="text-indent: 0;"><strong>CONTRATADA (${contractorTradeName})</strong></p>
          </div>
        </div>
        
        <div style="margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
          ${allResps.map(r => `
            <div style="text-align: center;">
              <div style="border-top: 1px solid #000; margin-bottom: 0.5rem;"></div>
              <p style="text-indent: 0;"><strong>CONTRATANTE (${r.nome})</strong></p>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 40px;">
          <p style="text-indent: 0;"><strong>TESTEMUNHAS:</strong></p>
          <div style="display: flex; justify-content: space-around; margin-top: 30px;">
            <div style="width: 200px; border-top: 1px solid #000;"></div>
            <div style="width: 200px; border-top: 1px solid #000;"></div>
          </div>
        </div>
      </div>
    `
    printPDF('Contrato de Prestação de Serviços', html, clinic, { hideTitle: true })
  }

  const handleDateInicioChange = (date: string) => {
    if (!date) {
      setForm({ ...form, dataInicio: date });
      return;
    }
    const start = new Date(date);
    const end = new Date(start);
    end.setFullYear(start.getFullYear() + 1);
    const endStr = end.toISOString().split('T')[0];
    setForm({ ...form, dataInicio: date, dataFim: endStr });
  };

  return (
    <div>
      <PageHeader title="Contratos" description="Gerenciamento de contratos de pacientes" actionLabel="Novo Contrato" onAction={openNew} />

      {/* Filters & View Toggle */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por paciente..." />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="mt-0.5 w-32">
            <option value="todos">Todos</option>
            <option value="ativo">Ativos</option>
            <option value="vencido">Vencidos</option>
            <option value="cancelado">Cancelados</option>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Vencimento De</Label>
          <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="mt-0.5 w-40" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="mt-0.5 w-40" />
        </div>
        <Button variant={view === 'table' ? 'default' : 'outline'} size="sm" onClick={() => setView('table')}>Tabela</Button>
        <Button variant={view === 'timeline' ? 'default' : 'outline'} size="sm" onClick={() => setView('timeline')} className="gap-1">
          <BarChart3 className="h-4 w-4" /> Timeline
        </Button>
        <Button variant="outline" size="sm" onClick={exportTimelinePDF} className="gap-1">
          <FileText className="h-4 w-4" /> PDF
        </Button>
      </div>

      {view === 'table' ? (
        <Card className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Dias Rest.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingContracts ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7}><EmptyState message="Nenhum contrato" /></TableCell></TableRow>
              ) : (
                filtered.map(c => {
                  const days = getDaysRemaining(c.dataFim)
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{c.pacienteNome}</span>
                          <span className="text-[10px] text-muted-foreground">{c.numero_contrato || c.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(c.valor)}</TableCell>
                      <TableCell>{formatDate(c.dataInicio)}</TableCell>
                      <TableCell>{formatDate(c.dataFim)}</TableCell>
                      <TableCell>
                        <span className={days < 0 ? 'text-red-600 font-semibold' : days <= 30 ? 'text-amber-600 font-semibold' : ''}>
                          {days < 0 ? `Vencido há ${Math.abs(days)}d` : `${days}d`}
                        </span>
                      </TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => printContract(c)} title="Imprimir Contrato"><FileText className="h-4 w-4 text-blue-600" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openRenovar(c)} title="Renovar Contrato"><RefreshCw className="h-4 w-4 text-green-600" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openHistorico(c)} title="Histórico de Contratos"><History className="h-4 w-4 text-purple-600" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        /* TIMELINE VIEW */
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="p-6"><EmptyState message="Nenhum contrato para exibir" /></Card>
          ) : (
            filtered.map(c => {
              const days = getDaysRemaining(c.dataFim)
              const pct = getTimelinePercent(c.dataInicio, c.dataFim)
              const color = getTimelineColor(days, c.status)
              return (
                <Card key={c.id} className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold">{c.pacienteNome}</p>
                      <p className="text-[10px] text-muted-foreground">{c.numero_contrato || c.id.slice(0, 8).toUpperCase()}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(c.valor)}/mês</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openRenovar(c)} title="Renovar"><RefreshCw className="h-4 w-4 text-green-600" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openHistorico(c)} title="Histórico"><History className="h-4 w-4 text-purple-600" /></Button>
                      <div className="text-right">
                        <span className="text-sm font-semibold" style={{ color }}>
                          {days < 0 ? `Vencido há ${Math.abs(days)} dias` : days === 0 ? 'Vence hoje' : `${days} dias restantes`}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(c.dataInicio)} — {formatDate(c.dataFim)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>{pct}% decorrido</span>
                    {statusBadge(c.status)}
                  </div>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* ── DIALOG: Novo / Editar / Renovar ─────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setRenovandoDe(null) }}>
        <DialogHeader>
          <DialogTitle>
            {renovandoDe
              ? `🔄 Renovar Contrato — ${renovandoDe.pacienteNome}`
              : editingId ? 'Editar Contrato' : 'Novo Contrato'}
          </DialogTitle>
          <DialogClose onClose={() => { setDialogOpen(false); setRenovandoDe(null) }} />
        </DialogHeader>
        <DialogContent>
          {renovandoDe && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-2 text-sm text-green-800">
              <strong>Renovação:</strong> O contrato anterior <span className="font-mono">{renovandoDe.numero_contrato || renovandoDe.id.slice(0, 8).toUpperCase()}</span> será marcado como <strong>Vencido</strong> automaticamente ao salvar.
            </div>
          )}
          <div className="grid gap-4">
            <div>
              <Label>Paciente</Label>
              <Select
                value={form.pacienteId}
                onChange={(e) => setForm({ ...form, pacienteId: e.target.value })}
                className="mt-1"
                disabled={!!renovandoDe}
              >
                <option value="">Selecionar...</option>
                {patients.filter(p => p.status === 'ativo').map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor Mensal (R$)</Label>
                <Input type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Contract['status'] })} className="mt-1">
                  <option value="ativo">Ativo</option>
                  <option value="vencido">Vencido</option>
                  <option value="cancelado">Cancelado</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor Extra</Label>
                <Input type="number" value={form.valorExtra} onChange={(e) => setForm({ ...form, valorExtra: Number(e.target.value) })} className="mt-1" placeholder="Ex: Higiene, Fraldas..." />
              </div>
              <div>
                <Label>Referência do Extra</Label>
                <Input value={form.descricaoExtra} onChange={(e) => setForm({ ...form, descricaoExtra: e.target.value })} className="mt-1" placeholder="A que se refere esse valor?" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data Início</Label>
                <Input type="date" value={form.dataInicio} onChange={(e) => handleDateInicioChange(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Data Fim</Label>
                <Input type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1" />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setDialogOpen(false); setRenovandoDe(null) }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className={renovandoDe ? 'bg-green-600 hover:bg-green-700' : ''}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {renovandoDe ? '🔄 Confirmar Renovação' : 'Salvar'}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* ── MODAL: Histórico de Contratos ────────────────────────────────── */}
      <Dialog open={historicoOpen} onOpenChange={setHistoricoOpen}>
        <DialogHeader>
          <DialogTitle>
            <History className="inline h-5 w-5 mr-2 text-purple-600" />
            Histórico de Contratos — {historicoPacienteNome}
          </DialogTitle>
          <DialogClose onClose={() => setHistoricoOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {historicoContratos.length === 0 ? (
            <EmptyState message="Nenhum contrato encontrado para este paciente." />
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {historicoContratos.map((c, idx) => {
                const days = getDaysRemaining(c.dataFim)
                const isAtual = idx === 0
                return (
                  <div
                    key={c.id}
                    className={`border rounded-lg p-4 ${isAtual ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-gray-600">
                          {c.numero_contrato || c.id.slice(0, 8).toUpperCase()}
                        </span>
                        {isAtual && <span className="text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded font-semibold">ATUAL</span>}
                        {c.contrato_renovado_de && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Renovação</span>}
                      </div>
                      {statusBadge(c.status)}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm text-gray-700 mb-2">
                      <div>
                        <span className="text-xs text-gray-500 block">Início</span>
                        {formatDate(c.dataInicio)}
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Vencimento</span>
                        {formatDate(c.dataFim)}
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Valor</span>
                        {formatCurrency(c.valor)}/mês
                      </div>
                    </div>
                    {c.observacoes && (
                      <p className="text-xs text-gray-500 italic mb-2">{c.observacoes}</p>
                    )}
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => printContract(c)}>
                        <FileText className="h-3 w-3" /> Imprimir
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground text-right">
            {historicoContratos.length} contrato{historicoContratos.length !== 1 ? 's' : ''} no histórico
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setHistoricoOpen(false)}>Fechar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
