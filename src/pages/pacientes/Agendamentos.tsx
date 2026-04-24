import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatDate, cn } from '@/lib/utils'
import type { Patient, Appointment } from '@/lib/types'
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
import { Pencil, Trash2, Calendar as CalendarIcon, List, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export default function Agendamentos() {
  const { data: patients } = useDb<Patient>('patients')
  const { data: appointments, loading, insert, update, remove } = useDb<Appointment>('appointments')
  const [view, setView] = useState<'list' | 'calendar'>('calendar')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    pacienteId: '', tipo: '', data: '', horario: '', profissional: '', status: 'agendado' as Appointment['status'], observacoes: '',
  })

  const filtered = appointments.filter(a =>
    (a.pacienteNome || '').toLowerCase().includes(search.toLowerCase()) ||
    a.profissional.toLowerCase().includes(search.toLowerCase())
  )

  function openNew() {
    setForm({ pacienteId: patients[0]?.id || '', tipo: '', data: '', horario: '', profissional: '', status: 'agendado', observacoes: '' })
    setEditingId(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    const patient = patients.find(p => p.id === form.pacienteId)
    if (!patient || !form.data) return
    const { pacienteId, ...restForm } = form
    const aptData = {
      pacienteId,
      pacienteNome: patient.nome,
      ...restForm,
    }
    
    try {
      if (editingId) {
        await update(editingId, aptData as any)
      } else {
        await insert(aptData as any)
      }
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar agendamento')
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error(error)
      }
    }
  }

  function openEdit(a: Appointment) {
    setForm({ pacienteId: a.pacienteId, tipo: a.tipo, data: a.data, horario: a.horario, profissional: a.profissional, status: a.status, observacoes: a.observacoes })
    setEditingId(a.id)
    setDialogOpen(true)
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const days = []
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
    return days
  }

  const statusBadge = (status: Appointment['status']) => {
    const map = { agendado: 'warning', realizado: 'success', cancelado: 'destructive' } as const
    const labels = { agendado: 'Agendado', realizado: 'Realizado', cancelado: 'Cancelado' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agendamentos</h1>
          <p className="text-muted-foreground">Gerenciamento de consultas e procedimentos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted p-1 rounded-lg">
            <Button variant={view === 'calendar' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('calendar')} className="gap-2">
              <CalendarIcon className="h-4 w-4" /> Calendário
            </Button>
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('list')} className="gap-2">
              <List className="h-4 w-4" /> Lista
            </Button>
          </div>
          <Button onClick={openNew}>Novo Agendamento</Button>
        </div>
      </div>

      <Card className="p-6">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por paciente ou profissional..." />
        
        <div className="mt-6">
          {view === 'list' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7}><EmptyState message="Nenhum agendamento" /></TableCell></TableRow>
                ) : (
                  filtered.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.pacienteNome}</TableCell>
                      <TableCell>{a.tipo}</TableCell>
                      <TableCell>{formatDate(a.data)}</TableCell>
                      <TableCell>{a.horario}</TableCell>
                      <TableCell>{a.profissional}</TableCell>
                      <TableCell>{statusBadge(a.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold capitalize">
                  {currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setCurrentMonth(new Date())}>Hoje</Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 border border-border rounded-lg overflow-hidden">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
                  <div key={d} className="bg-muted p-2 text-center text-xs font-semibold border-b border-border">{d}</div>
                ))}
                {getDaysInMonth(currentMonth).map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} className="bg-muted/30 border-b border-r border-border p-2 min-h-[100px]" />
                  
                  const isToday = day.toDateString() === new Date().toDateString()
                  const dayAppointments = filtered.filter(a => a.data === day.toISOString().slice(0, 10))

                  return (
                    <div key={day.toISOString()} className={cn(
                      "border-b border-r border-border p-2 min-h-[120px] transition-colors hover:bg-muted/50",
                      isToday && "bg-primary/5"
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                          isToday && "bg-primary text-primary-foreground"
                        )}>
                          {day.getDate()}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayAppointments.slice(0, 3).map(a => (
                          <div 
                            key={a.id} 
                            onClick={() => openEdit(a)}
                            className="text-[10px] p-1 rounded bg-secondary overflow-hidden truncate cursor-pointer hover:brightness-95 border-l-2 border-primary"
                            title={`${a.horario} - ${a.pacienteNome} (${a.tipo})`}
                          >
                            <span className="font-semibold">{a.horario}</span> {a.pacienteNome}
                          </div>
                        ))}
                        {dayAppointments.length > 3 && (
                          <div className="text-[10px] text-muted-foreground text-center font-medium">
                            + {dayAppointments.length - 3} mais
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle>
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
              <div><Label>Tipo</Label><Input value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} placeholder="Consulta, Exame..." className="mt-1" /></div>
              <div><Label>Profissional</Label><Input value={form.profissional} onChange={(e) => setForm({ ...form, profissional: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data</Label><Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="mt-1" /></div>
              <div><Label>Horário</Label><Input type="time" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} className="mt-1" /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Appointment['status'] })} className="mt-1">
                <option value="agendado">Agendado</option>
                <option value="realizado">Realizado</option>
                <option value="cancelado">Cancelado</option>
              </Select>
            </div>
            <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1" /></div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
