import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import type { TransactionCategory } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Tag, ArrowUpCircle, ArrowDownCircle, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default function Categorias() {
  const { data: categories, loading, insert, update, remove } = useDb<TransactionCategory>('transaction_categories')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TransactionCategory | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'todos' | 'receita' | 'despesa'>('todos')
  
  const [form, setForm] = useState<Partial<TransactionCategory>>({
    nome: '',
    tipo: 'despesa',
    cor: '#3b82f6'
  })

  const filtered = categories.filter(cat => {
    const matchesSearch = cat.nome.toLowerCase().includes(search.toLowerCase())
    const matchesType = filterType === 'todos' || cat.tipo === filterType
    return matchesSearch && matchesType
  })

  const handleSubmit = async () => {
    if (!form.nome) return
    try {
      if (editing) {
        await update(editing.id, form)
      } else {
        await insert(form)
      }
      setDialogOpen(false)
      setEditing(null)
      setForm({ nome: '', tipo: 'despesa', cor: '#3b82f6' })
    } catch (e) {
      console.error(e)
    }
  }

  const handleEdit = (cat: TransactionCategory) => {
    setEditing(cat)
    setForm(cat)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir esta categoria? Os lançamentos existentes manterão o nome mas perderão o vínculo.')) {
      await remove(id)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader 
          title="Categorias Financeiras" 
          description="Organize suas receitas e despesas por categorias" 
        />
        <Button onClick={() => { setEditing(null); setForm({ nome: '', tipo: 'despesa', cor: '#3b82f6' }); setDialogOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Categoria
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar categoria..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant={filterType === 'todos' ? 'default' : 'outline'} onClick={() => setFilterType('todos')} size="sm">Todas</Button>
            <Button variant={filterType === 'receita' ? 'default' : 'outline'} onClick={() => setFilterType('receita')} size="sm" className="gap-2">
              <ArrowUpCircle className="h-4 w-4" /> Receitas
            </Button>
            <Button variant={filterType === 'despesa' ? 'default' : 'outline'} onClick={() => setFilterType('despesa')} size="sm" className="gap-2">
              <ArrowDownCircle className="h-4 w-4" /> Despesas
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(cat => (
            <div key={cat.id} className="group flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-2 h-8 rounded-full" style={{ backgroundColor: cat.cor }} />
                <div>
                  <p className="font-medium text-sm">{cat.nome}</p>
                  <Badge variant={cat.tipo === 'receita' ? 'success' : 'destructive'} className="text-[10px] h-4">
                    {cat.tipo}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(cat)} className="h-7 w-7">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(cat.id)} className="h-7 w-7 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Categoria</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Manutenção, Aluguel, Vendas" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cor para Identificação</Label>
                <Input type="color" value={form.cor} onChange={e => setForm({ ...form, cor: e.target.value })} className="h-10 p-1" />
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit}>Salvar Categoria</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
