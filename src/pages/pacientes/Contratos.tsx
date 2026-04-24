import { useState, useMemo } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
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
import { Pencil, Trash2, FileText, BarChart3, Loader2 } from 'lucide-react'

export default function Contratos() {
  const { data: patients, loading: loadingPatients } = useDb<Patient>('patients')
  const { data: contracts, loading: loadingContracts, insert, update, remove } = useDb<Contract>('contracts')
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [view, setView] = useState<'table' | 'timeline'>('table')
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd, setFilterEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    pacienteId: '', valor: 0, valorExtra: 0, descricaoExtra: '', dataInicio: '', dataFim: '', status: 'ativo' as Contract['status'], observacoes: '',
  })

  const today = new Date()

  const filtered = useMemo(() => {
    let list = contracts.filter(c => (c.pacienteNome || '').toLowerCase().includes(search.toLowerCase()))
    if (filterStart) list = list.filter(c => c.dataFim >= filterStart)
    if (filterEnd) list = list.filter(c => c.dataFim <= filterEnd)
    return list.sort((a, b) => new Date(a.dataFim).getTime() - new Date(b.dataFim).getTime())
  }, [contracts, search, filterStart, filterEnd])

  function openNew() {
    setForm({ pacienteId: patients[0]?.id || '', valor: 0, valorExtra: 0, descricaoExtra: '', dataInicio: '', dataFim: '', status: 'ativo', observacoes: '' })
    setEditingId(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    const patient = patients.find(p => p.id === form.pacienteId)
    if (!patient) {
      alert('Selecione um paciente cadastrado.')
      return
    }
    
    setSaving(true)
    try {
      const { pacienteId, ...restForm } = form
      const contractData = { 
        pacienteId, 
        pacienteNome: patient.nome, 
        ...restForm 
      }

      if (editingId) {
        await update(editingId, contractData as any)
      } else {
        const now = new Date()
        const dd = String(now.getDate()).padStart(2, '0')
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const yyyy = now.getFullYear()
        const hh = String(now.getHours()).padStart(2, '0')
        const min = String(now.getMinutes()).padStart(2, '0')
        const num = `CPS-${dd}${mm}${yyyy}${hh}${min}`
        
        await insert({ ...contractData, numero_contrato: num } as any)
      }
      setDialogOpen(false)
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
    setForm({ 
      pacienteId: c.pacienteId, 
      valor: c.valor, 
      valorExtra: c.valorExtra || 0,
      descricaoExtra: c.descricaoExtra || '',
      dataInicio: c.dataInicio, 
      dataFim: c.dataFim, 
      status: c.status, 
      observacoes: c.observacoes 
    })
    setEditingId(c.id)
    setDialogOpen(true)
  }

  const statusBadge = (status: Contract['status']) => {
    const map = { ativo: 'success', vencido: 'warning', cancelado: 'destructive' } as const
    const labels = { ativo: 'Ativo', vencido: 'Vencido', cancelado: 'Cancelado' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  // Timeline helpers
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

  // PDF Timeline export
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
    const p = patients.find(px => px.id === c.pacienteId)
    if (!p) return

    const fullAddress = `${p.resp_endereco || ''}, ${p.resp_cep || ''}, ${p.resp_cidade || ''}`
    const todayStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

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

    const html = `
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="margin-bottom: 5px; text-transform: uppercase;">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE</h2>
        <h2 style="margin-top: 0; text-transform: uppercase;">ACOLHIMENTO E CUIDADOS PARA IDOSOS</h2>
        <p style="margin-top: 20px;"><strong>CONTRATO Nº: ${c.numero_contrato || c.id.slice(0, 8).toUpperCase()}</strong></p>
      </div>

      <div class="abnt-text" style="text-align: justify; line-height: 1.5;">
        <p><strong>CONTRATADA: NOVO HORIZONTE CASA DOS IDOSOS</strong>, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 56.956.061/0001-81, com sede na Rua Silva Jardim, 1012, Vila Moraes, Ourinhos, São Paulo, CEP 19.900-461, representada por sua diretora presidente, a Sra. <strong>JULIANA VIRGINIA DA SILVA</strong>, enfermeira, RG nº 34.171.146-9 SSP/SP e CPF nº 285.840.548-47.</p>
        
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
        <p>2.1. O valor mensal é de <strong>${formatCurrencyPDF(c.valor)}</strong>, a ser pago todo <strong>5º dia útil</strong> de cada mês.</p>
        ${c.valorExtra && c.valorExtra > 0 ? `
        <p>2.1.1. <strong>Valores Extras Adicionais:</strong> Também será devido o valor de <strong>${formatCurrencyPDF(c.valorExtra)}</strong>, referente a: <em>${c.descricaoExtra || '---'}</em>.</p>
        ` : ''}
        <p>2.2. <strong>Penalidades:</strong> Multa de 2% sobre o atraso e juros de 1% ao mês.</p>
        <p style="font-size: 14pt;"><strong>2.3. Taxas Extras: Será cobrada uma taxa extra de ½ salário mínimo em dezembro para despesas de final de ano e encargos.</strong></p>
        <p>2.4. <strong>Reajustes:</strong> O valor será corrigido anualmente ou em caso de mudança no grau de dependência do idoso.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA TERCEIRA - DAS OBRIGAÇÕES DO CONTRATANTE</h3>
        <p>3.1. Fornecer dados de profissionais particulares (médicos, dentistas) e relação de medicamentos com receituário atualizado.</p>
        <p>3.2. Ressarcir a CONTRATADA por gastos extras antecipados (medicamentos, fraldas, higiene, etc.) mediante comprovante.</p>
        <p>3.3. Providenciar ação de curatela em até 30 dias caso o idoso perca a capacidade de responder por si.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA QUARTA - SERVIÇOS NÃO INCLUÍDOS</h3>
        <p>4.1. Não estão inclusos: Consultas externas, acompanhamento hospitalar, fraldas descartáveis, medicamentos pessoais, materiais para curativos específicos, roupas de uso pessoal e cobertores.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA QUINTA - VIGÊNCIA E RESCISÃO</h3>
        <p>5.1. O contrato entra em vigor em <strong>${formatDatePDF(c.dataInicio)}</strong> com término em <strong>${formatDatePDF(c.dataFim)}</strong>.</p>
        <p>5.2. A rescisão pode ocorrer por qualquer parte com aviso prévio de <strong>30 dias</strong>. Caso o Contratante rescinda sem aviso, será cobrada multa de 50% da mensalidade.</p>
        <p>5.3. O contrato é rescindido de pleno direito em caso de falecimento do idoso, sendo devido o pagamento proporcional aos serviços prestados no mês.</p>

        <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">CLÁUSULA SEXTA - REGRAS GERAIS</h3>
        <p>6.1. <strong>Visitas:</strong> Todos os dias, das 14h00 às 16h00. Retorno de passeios externos até as 18h00.</p>
        <p>6.2. <strong>Foro:</strong> Fica eleito o foro da Comarca de <strong>Ourinhos/SP</strong> para dirimir quaisquer dúvidas oriundas deste contrato.</p>

        <div style="margin-top: 50px;">
          <p style="text-indent: 0;">Ourinhos, ${todayStr}.</p>
        </div>

        <div style="margin-top: 60px; display: flex; justify-content: space-around;">
          <div style="text-align: center; width: 250px;">
            <div style="border-top: 1px solid #000; margin-bottom: 0.5rem;"></div>
            <p style="text-indent: 0;"><strong>CONTRATADA (Novo Horizonte)</strong></p>
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
    printPDF('Contrato de Prestação de Serviços', html, clinic)
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
                    <div className="text-right">
                      <span
                        className="text-sm font-semibold"
                        style={{ color }}
                      >
                        {days < 0 ? `Vencido há ${Math.abs(days)} dias` : days === 0 ? 'Vence hoje' : `${days} dias restantes`}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(c.dataInicio)} — {formatDate(c.dataFim)}
                      </p>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle>
          <DialogClose onClose={() => setDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div>
              <Label>Paciente</Label>
              <Select value={form.pacienteId} onChange={(e) => setForm({ ...form, pacienteId: e.target.value })} className="mt-1">
                <option value="">Selecionar...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Valor Mensal</Label><Input type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Status</Label><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Contract['status'] })} className="mt-1"><option value="ativo">Ativo</option><option value="vencido">Vencido</option><option value="cancelado">Cancelado</option></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Valor Extra</Label><Input type="number" value={form.valorExtra} onChange={(e) => setForm({ ...form, valorExtra: Number(e.target.value) })} className="mt-1" placeholder="Ex: Higiene, Fraldas..." /></div>
              <div><Label>Informar Referência do Extra</Label><Input value={form.descricaoExtra} onChange={(e) => setForm({ ...form, descricaoExtra: e.target.value })} className="mt-1" placeholder="A que se refere esse valor?" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data Início</Label><Input type="date" value={form.dataInicio} onChange={(e) => handleDateInicioChange(e.target.value)} className="mt-1" /></div>
              <div><Label>Data Fim</Label><Input type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1" /></div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
