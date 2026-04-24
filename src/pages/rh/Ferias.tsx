import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatDate } from '@/lib/utils'
import type { Employee, Vacation } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Pencil, Trash2, Loader2 } from 'lucide-react'

export default function Ferias() {
  const { data: employees } = useDb<Employee>('employees')
  const { data: vacations, loading, insert, update, remove } = useDb<Vacation>('vacations')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    funcionarioId: '',
    dataInicio: '',
    dataFim: '',
    status: 'agendada' as Vacation['status'],
  })

  const filtered = vacations.filter(v =>
    (v.funcionarioNome || '').toLowerCase().includes(search.toLowerCase())
  )

  function openNew() {
    setForm({ funcionarioId: employees[0]?.id || '', dataInicio: '', dataFim: '', status: 'agendada' })
    setEditingId(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    const emp = employees.find(e => e.id === form.funcionarioId)
    if (!emp || !form.dataInicio || !form.dataFim) {
      alert('Preencha os campos obrigatórios e selecione o funcionário.')
      return
    }
    
    setSaving(true)
    try {
      const vData = {
        funcionarioId: form.funcionarioId,
        funcionarioNome: emp.nome,
        dataInicio: form.dataInicio,
        dataFim: form.dataFim,
        status: form.status,
      }
      if (editingId) {
        await update(editingId, vData as Omit<Vacation, 'id'>)
      } else {
        await insert(vData as Omit<Vacation, 'id'>)
      }
      setDialogOpen(false)
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar férias.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error(error)
        alert('Erro ao excluir férias.')
      }
    }
  }

  function openEdit(v: Vacation) {
    setForm({ funcionarioId: v.funcionarioId, dataInicio: v.dataInicio, dataFim: v.dataFim, status: v.status })
    setEditingId(v.id)
    setDialogOpen(true)
  }

  const statusBadge = (status: Vacation['status']) => {
    const map = { agendada: 'default', em_andamento: 'warning', concluida: 'success' } as const
    const labels = { agendada: 'Agendada', em_andamento: 'Em Andamento', concluida: 'Concluída' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  return (
    <div>
      <PageHeader
        title="Férias"
        description="Controle de férias dos funcionários"
        actionLabel="Nova Férias"
        onAction={openNew}
      />

      <Card className="p-6">
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar..." />
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Data Início</TableHead>
                <TableHead>Data Fim</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}><EmptyState message="Nenhuma férias cadastrada" /></TableCell>
                </TableRow>
              ) : (
                filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.funcionarioNome}</TableCell>
                    <TableCell>{formatDate(v.dataInicio)}</TableCell>
                    <TableCell>{formatDate(v.dataFim)}</TableCell>
                    <TableCell>{statusBadge(v.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Férias' : 'Nova Férias'}</DialogTitle>
          <DialogClose onClose={() => setDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div>
              <Label>Funcionário</Label>
              <Select value={form.funcionarioId} onChange={(e) => setForm({ ...form, funcionarioId: e.target.value })} className="mt-1">
                <option value="">Selecionar...</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Data Início</Label><Input type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })} className="mt-1" /></div>
              <div><Label>Data Fim</Label><Input type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} className="mt-1" /></div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Vacation['status'] })} className="mt-1">
                <option value="agendada">Agendada</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluida">Concluída</option>
              </Select>
            </div>
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
