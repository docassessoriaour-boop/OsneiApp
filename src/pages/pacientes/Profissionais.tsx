import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import type { TechnicalProfessional } from '@/lib/types'

import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, Loader2, Plus, UserCircle, BadgeIcon as IdCard } from 'lucide-react'

const emptyForm: Omit<TechnicalProfessional, 'id' | 'created_at'> = {
  nome: '',
  cpf: '',
  coren_crm: '',
  funcao: 'Técnico de Enfermagem',
  status: 'ativo'
}

export default function Profissionais() {
  const { data: profissionais, loading, insert, update, remove } = useDb<TechnicalProfessional>('technical_professionals')
  
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const filtered = profissionais.filter(p => 
    p.nome.toLowerCase().includes(search.toLowerCase()) || 
    p.coren_crm.toLowerCase().includes(search.toLowerCase()) ||
    (p.cpf && p.cpf.includes(search))
  ).sort((a, b) => a.nome.localeCompare(b.nome))

  function openNew() { 
    setForm(emptyForm)
    setEditingId(null) 
    setDialogOpen(true) 
  }

  function openEdit(prof: TechnicalProfessional) {
    setForm({
      nome: prof.nome,
      cpf: prof.cpf || '',
      coren_crm: prof.coren_crm,
      funcao: prof.funcao,
      status: prof.status
    })
    setEditingId(prof.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nome || !form.coren_crm) {
      alert('Nome e COREN/CRM são obrigatórios.')
      return
    }

    try {
      if (editingId) {
        await update(editingId, form)
        alert('Profissional atualizado com sucesso!')
      } else {
        await insert(form)
        alert('Profissional registrado com sucesso!')
      }
      setDialogOpen(false)
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar profissional: ${error.message || 'Erro desconhecido'}`)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este profissional? Esta ação não pode ser desfeita.')) {
      try {
        await remove(id)
      } catch (error) {
        console.error('Erro ao excluir:', error)
        alert('Erro ao excluir profissional')
      }
    }
  }

  return (
    <div>
      <PageHeader 
        title="Técnicos e Profissionais" 
        description="Gerencie os profissionais de saúde e seus respectivos registros (COREN/CRM)"
      >
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Profissional
        </Button>
      </PageHeader>

      <Card className="p-6">
        <div className="mb-6 max-w-md">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome, CPF ou registro..." />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Registro (COREN/CRM)</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6}><EmptyState message="Nenhum profissional encontrado" /></TableCell></TableRow>
            ) : (
              filtered.map((prof) => (
                <TableRow key={prof.id} className={prof.status === 'inativo' ? 'opacity-60' : ''}>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-muted-foreground" />
                      {prof.nome}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm">
                      <IdCard className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-blue-700">{prof.coren_crm}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{prof.cpf || 'Não informado'}</TableCell>
                  <TableCell className="text-sm">{prof.funcao}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${prof.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {prof.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(prof)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => handleDelete(prof.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Profissional' : 'Novo Profissional'}</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div>
              <Label>Nome Completo</Label>
              <Input 
                value={form.nome} 
                onChange={(e) => setForm({ ...form, nome: e.target.value })} 
                className="mt-1" 
                placeholder="Nome do profissional"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Registro (COREN, CRM, etc)</Label>
                <Input 
                  value={form.coren_crm} 
                  onChange={(e) => setForm({ ...form, coren_crm: e.target.value })} 
                  className="mt-1" 
                  placeholder="Ex: COREN 123456"
                />
              </div>
              <div>
                <Label>CPF</Label>
                <Input 
                  value={form.cpf} 
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })} 
                  className="mt-1" 
                  placeholder="Apenas números"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Função / Cargo</Label>
                <Select 
                  value={form.funcao} 
                  onChange={(e) => setForm({ ...form, funcao: e.target.value })} 
                  className="mt-1"
                >
                  <option value="Técnico de Enfermagem">Técnico de Enfermagem</option>
                  <option value="Enfermeiro">Enfermeiro</option>
                  <option value="Médico">Médico</option>
                  <option value="Fisioterapeuta">Fisioterapeuta</option>
                  <option value="Psicólogo">Psicólogo</option>
                  <option value="Assistente Social">Assistente Social</option>
                  <option value="Cuidador">Cuidador</option>
                </Select>
              </div>
              
              <div>
                <Label>Status</Label>
                <Select 
                  value={form.status} 
                  onChange={(e) => setForm({ ...form, status: e.target.value as any })} 
                  className="mt-1"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar Profissional</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
