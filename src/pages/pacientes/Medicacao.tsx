import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import type { Patient, Medication } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import { Pencil, Trash2, Loader2, FileText } from 'lucide-react'

export default function Medicacao() {
  const [clinic] = useClinic()
  const { data: patients } = useDb<Patient>('patients')
  const { data: medications, loading, insert, update, remove, reload } = useDb<Medication>('medications')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [form, setForm] = useState({
    pacienteId: '', 
    medicamento: '', 
    dosagem: '', 
    horario: '', 
    frequencia: '', 
    observacoes: '',
    estoque_atual: 0,
    estoque_minimo: 0,
    qtd_por_dose: 1,
    unidade_medida: 'comprimido'
  })
  const [genStartTime, setGenStartTime] = useState('08:00')
  const [genFrequency, setGenFrequency] = useState('1')

  const filtered = medications.filter(m =>
    (m.pacienteNome || '').toLowerCase().includes(search.toLowerCase()) ||
    m.medicamento.toLowerCase().includes(search.toLowerCase())
  )

  function openNew() {
    setForm({ 
      pacienteId: patients[0]?.id || '', 
      medicamento: '', 
      dosagem: '', 
      horario: '', 
      frequencia: '', 
      observacoes: '',
      estoque_atual: 0,
      estoque_minimo: 0,
      qtd_por_dose: 1,
      unidade_medida: 'comprimido'
    })
    setEditingId(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    const patient = patients.find(p => p.id === form.pacienteId)
    if (!patient || !form.medicamento) {
      alert('Selecione um paciente e informe o medicamento.')
      return
    }

    setSaving(true)
    try {
      const { pacienteId, ...restForm } = form
      const medData = {
        pacienteId,
        pacienteNome: patient.nome,
        ...restForm,
      }
      
      if (editingId) {
        await update(editingId, medData as any)
      } else {
        await insert(medData as any)
      }
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar medicação.')
    } finally {
      setSaving(false)
    }
  }

  async function executeDelete() {
    if (!deleteId) return
    try {
      await remove(deleteId)
      await reload()
      setDeleteId(null)
      // Removed native alert to prevent browser blocking
    } catch (error: any) {
      console.error(error)
      alert(`Erro ao excluir medicação: ${error.message || 'Erro desconhecido'}`)
    }
  }

  function openEdit(m: Medication) {
    setForm({ 
      pacienteId: m.pacienteId, 
      medicamento: m.medicamento, 
      dosagem: m.dosagem, 
      horario: m.horario, 
      frequencia: m.frequencia, 
      observacoes: m.observacoes,
      estoque_atual: m.estoque_atual || 0,
      estoque_minimo: m.estoque_minimo || 0,
      qtd_por_dose: m.qtd_por_dose || 1,
      unidade_medida: m.unidade_medida || 'comprimido'
    })
    setEditingId(m.id)
    setDialogOpen(true)
  }

  function generateSchedule(startTime: string, timesPerDay: number) {
    if (!startTime || !timesPerDay) return

    const [hour, minute] = startTime.split(':').map(Number)
    const interval = 24 / timesPerDay
    const schedule = []

    for (let i = 0; i < timesPerDay; i++) {
      const totalHours = hour + (i * interval)
      const h = Math.floor(totalHours % 24)
      const time = `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      schedule.push(time)
    }

    setForm({
      ...form,
      horario: schedule.join(', '),
      frequencia: `${timesPerDay}x ao dia`
    })
  }

  function calculateDailyConsumption(m: Medication) {
    if (!m.horario) return 0
    const timesPerDay = m.horario.split(',').length
    return timesPerDay * (m.qtd_por_dose || 0)
  }

  function calculateDaysRemaining(m: Medication) {
    const consumption = calculateDailyConsumption(m)
    if (consumption <= 0 || !m.estoque_atual) return 0
    return Math.floor(m.estoque_atual / consumption)
  }

  function getPeriodColumn(patientMeds: Medication[], periodNum: number) {
    const medsInPeriod: { time: string, med: string, dosagem: string }[] = []
    
    patientMeds.forEach(m => {
      if (!m.horario) return
      m.horario.split(',').forEach(h => {
        const timeStr = h.trim()
        const hour = parseInt(timeStr.split(':')[0])
        if (isNaN(hour)) return
        
        const isMadrugada = hour >= 0 && hour < 6
        const isManha = hour >= 6 && hour < 12
        const isTarde = hour >= 12 && hour < 18
        const isNoite = hour >= 18 && hour <= 23
        
        if (periodNum === 0 && isMadrugada) medsInPeriod.push({ time: timeStr, med: m.medicamento, dosagem: m.dosagem })
        if (periodNum === 1 && isManha) medsInPeriod.push({ time: timeStr, med: m.medicamento, dosagem: m.dosagem })
        if (periodNum === 2 && isTarde) medsInPeriod.push({ time: timeStr, med: m.medicamento, dosagem: m.dosagem })
        if (periodNum === 3 && isNoite) medsInPeriod.push({ time: timeStr, med: m.medicamento, dosagem: m.dosagem })
      })
    })

    // Sort chronologically
    return medsInPeriod.sort((a, b) => a.time.localeCompare(b.time))
  }

  function printReport() {
    const periods = [
      { name: 'Madrugada (00h-05h)', id: 0 },
      { name: 'Manhã (06h-11h)', id: 1 },
      { name: 'Tarde (12h-17h)', id: 2 },
      { name: 'Noite (18h-23h)', id: 3 },
    ]

    const rows = patients
      .filter(p => !search || p.nome.toLowerCase().includes(search.toLowerCase()))
      .map(patient => {
        const patientMeds = medications.filter(m => m.pacienteId === patient.id)
        if (patientMeds.length === 0) return ''

        const cells = periods.map(period => {
            const meds = getPeriodColumn(patientMeds, period.id)
            const htmlMeds = meds.map(m => `<div style="margin-bottom:6px; background:#fff; border:1px solid #ddd; padding:4px; border-radius:4px;"><span style="background:#e0f2fe; color:#0369a1; padding:2px 4px; border-radius:2px; font-weight:bold; margin-right:4px;">${m.time}</span> <b>${m.med}</b><br/><span style="color:#4b5563">${m.dosagem}</span></div>`).join('')
            return `<td style="background:#f9fafb;">${htmlMeds}</td>`
        }).join('')

        return `<tr><td style="font-weight:bold; width:150px; background:#fff;">${patient.nome}</td>${cells}</tr>`
      }).join('')

    printPDF('Escala de Medicação por Turnos', `
      <style>
        table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
        th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; overflow: hidden; }
        th { background-color: #f1f5f9; font-size: 10px; font-weight: bold; text-align:center; color:#334155; }
        td { font-size: 9px; line-height: 1.2; }
      </style>
      <table>
        <thead>
          <tr>
            <th style="width:150px;">Paciente</th>
            ${periods.map(p => `<th>${p.name}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `, clinic)
  }

  function printStockReport() {
    const medsToReport = medications.filter(m => (m.estoque_atual || 0) <= (m.estoque_minimo || 0))
    
    const rows = medsToReport.map(m => `
      <tr>
        <td>${m.pacienteNome}</td>
        <td>${m.medicamento}</td>
        <td style="text-align:center; color:${(m.estoque_atual || 0) <= (m.estoque_minimo || 0) ? 'red' : 'inherit'}; font-weight:bold;">${m.estoque_atual} ${m.unidade_medida}</td>
        <td style="text-align:center;">${m.estoque_minimo}</td>
        <td style="text-align:center;">${calculateDailyConsumption(m)} /dia</td>
        <td style="text-align:center; background:${calculateDaysRemaining(m) <= 5 ? '#fee2e2' : 'transparent'};">${calculateDaysRemaining(m)} dias</td>
      </tr>
    `).join('')

    printPDF('Relatório de Controle de Estoque (Alertas)', `
      <style>
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f8fafc; font-size: 12px; }
        td { font-size: 11px; }
      </style>
      <p>As seguintes medicações estão com estoque baixo ou próximo do fim, baseado no consumo diário.</p>
      <table>
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Medicamento</th>
            <th>Estoque Atual</th>
            <th>Mínimo</th>
            <th>Consumo Diário</th>
            <th>Previsão Restante</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center;">Nenhum alerta de estoque crítico no momento.</td></tr>'}
        </tbody>
      </table>
    `, clinic)
  }

  return (
    <div>
      <PageHeader title="Medicação" description="Controle de medicação dos pacientes" actionLabel="Nova Medicação" onAction={openNew} />

      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center justify-between">
          <div className="flex-1 w-full">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por paciente ou medicamento..." />
          </div>
          <div className="flex bg-muted p-1 rounded-lg">
            <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('list')}
                className="px-4 h-8"
            >
                Lista
            </Button>
            <Button 
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('grid')}
                className="px-4 h-8"
            >
                Quadro de Horários
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={printStockReport} className="gap-2 h-9 text-red-600 border-red-200 hover:bg-red-50">
                <FileText className="h-4 w-4" /> Alertas de Estoque
            </Button>
            <Button variant="outline" size="sm" onClick={printReport} className="gap-2 h-9">
                <FileText className="h-4 w-4" /> PDF da Escala
            </Button>
          </div>
        </div>

        {viewMode === 'list' ? (
          <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Medicamento</TableHead>
                <TableHead>Horário/Freq</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Consumo Diário</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState message="Nenhuma medicação cadastrada" /></TableCell></TableRow>
              ) : (
                filtered.map(m => (
                  <TableRow key={m.id} className={ (m.estoque_atual || 0) <= (m.estoque_minimo || 0) ? "bg-red-50" : ""}>
                    <TableCell className="font-medium">{m.pacienteNome}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{m.medicamento}</div>
                      <div className="text-xs text-muted-foreground">{m.dosagem}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{m.horario}</div>
                      <Badge variant="outline" className="mt-1">{m.frequencia}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-bold ${ (m.estoque_atual || 0) <= (m.estoque_minimo || 0) ? "text-red-600" : ""}`}>
                          {m.estoque_atual} {m.unidade_medida}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Mín: {m.estoque_minimo}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {calculateDailyConsumption(m)} {m.unidade_medida}/dia
                    </TableCell>
                    <TableCell>
                      <Badge variant={calculateDaysRemaining(m) <= 5 ? "destructive" : "secondary"}>
                        {calculateDaysRemaining(m)} dias
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50 border-b-2 border-primary/20">
                        <TableHead className="min-w-[200px] sticky left-0 bg-background z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-primary">Paciente</TableHead>
                        <TableHead className="text-center font-bold text-slate-700 min-w-[200px]">Madrugada<br/><span className="text-[10px] font-normal text-muted-foreground">00h às 05:59</span></TableHead>
                        <TableHead className="text-center font-bold text-amber-700 min-w-[200px]">Manhã<br/><span className="text-[10px] font-normal text-muted-foreground">06h às 11:59</span></TableHead>
                        <TableHead className="text-center font-bold text-orange-700 min-w-[200px]">Tarde<br/><span className="text-[10px] font-normal text-muted-foreground">12h às 17:59</span></TableHead>
                        <TableHead className="text-center font-bold text-indigo-700 min-w-[200px]">Noite<br/><span className="text-[10px] font-normal text-muted-foreground">18h às 23:59</span></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {patients.filter(p => !search || p.nome.toLowerCase().includes(search.toLowerCase())).map(patient => {
                        const patientMeds = medications.filter(m => m.pacienteId === patient.id)
                        if (patientMeds.length === 0) return null

                        const periods = [0, 1, 2, 3]

                        return (
                            <TableRow key={patient.id} className="hover:bg-muted/30 transition-colors">
                                <TableCell className="font-bold border-r sticky left-0 bg-background z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                  {patient.nome}
                                </TableCell>
                                {periods.map(periodId => {
                                    const meds = getPeriodColumn(patientMeds, periodId)
                                    return (
                                        <TableCell key={periodId} className={`p-3 border-r align-top ${periodId%2===0 ? 'bg-slate-50/50' : ''}`}>
                                            <div className="flex flex-col gap-2">
                                                {meds.map((m, idx) => (
                                                    <div key={idx} className="text-xs bg-white text-slate-800 p-2.5 rounded-md border shadow-sm flex flex-col hover:border-primary/50 transition-colors">
                                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                                            <span className="font-bold leading-tight">{m.med}</span>
                                                            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 shrink-0 font-bold tracking-wider">{m.time}</Badge>
                                                        </div>
                                                        <span className="text-muted-foreground text-[11px] font-medium">{m.dosagem}</span>
                                                    </div>
                                                ))}
                                                {meds.length === 0 && (
                                                  <div className="text-[10px] text-muted-foreground/50 italic text-center py-4">S/ Medicação</div>
                                                )}
                                            </div>
                                        </TableCell>
                                    )
                                })}
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Medicação' : 'Nova Medicação'}</DialogTitle>
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
              <div><Label>Medicamento</Label><Input value={form.medicamento} onChange={(e) => setForm({ ...form, medicamento: e.target.value })} className="mt-1" /></div>
              <div><Label>Dosagem</Label><Input value={form.dosagem} onChange={(e) => setForm({ ...form, dosagem: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg border">
              <p className="text-xs font-semibold mb-2 text-primary uppercase">Gerador de Escala</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[10px]">Horário Inicial</Label>
                  <Input type="time" value={genStartTime} onChange={(e) => setGenStartTime(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px]">Vezes ao dia</Label>
                  <Select value={genFrequency} onChange={(e) => setGenFrequency(e.target.value)} className="h-8 text-sm">
                    <option value="1">1x ao dia</option>
                    <option value="2">2x ao dia</option>
                    <option value="3">3x ao dia</option>
                    <option value="4">4x ao dia</option>
                    <option value="6">6x ao dia</option>
                    <option value="8">8x ao dia</option>
                    <option value="12">12x ao dia</option>
                  </Select>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-2 h-7 text-[10px]"
                onClick={() => generateSchedule(genStartTime, Number(genFrequency))}
              >
                Gerar Escala de Horários
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Horário (Final)</Label><Input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} placeholder="08:00, 14:00, 20:00" className="mt-1" /></div>
              <div><Label>Frequência (Final)</Label><Input value={form.frequencia} onChange={(e) => setForm({ ...form, frequencia: e.target.value })} placeholder="3x ao dia" className="mt-1" /></div>
            </div>

            <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
              <p className="text-xs font-semibold mb-3 text-primary uppercase">Controle de Estoque</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs">Qtd. por Dose ({form.unidade_medida})</Label>
                  <Input type="number" step="0.5" value={form.qtd_por_dose} onChange={(e) => setForm({ ...form, qtd_por_dose: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Unidade de Medida</Label>
                  <Select value={form.unidade_medida} onChange={(e) => setForm({ ...form, unidade_medida: e.target.value })} className="mt-1">
                    <option value="comprimido">Comprimido</option>
                    <option value="ml">ml</option>
                    <option value="gotas">Gotas</option>
                    <option value="ampola">Ampola</option>
                    <option value="frasco">Frasco</option>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Estoque Atual</Label>
                  <Input type="number" value={form.estoque_atual} onChange={(e) => setForm({ ...form, estoque_atual: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Estoque Mínimo (Alerta)</Label>
                  <Input type="number" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })} className="mt-1" />
                </div>
              </div>
              <div className="mt-3 p-2 bg-white rounded border text-[10px] text-muted-foreground">
                Consumo diário estimado: <strong>{calculateDailyConsumption(form as any)} {form.unidade_medida}s</strong><br/>
                O estoque durará aproximadamente <strong>{calculateDaysRemaining(form as any)} dias</strong>.
              </div>
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

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <p className="py-4">Tem certeza que deseja excluir esta medicação? Esta ação não pode ser desfeita.</p>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button variant="destructive" onClick={executeDelete}>Excluir</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
