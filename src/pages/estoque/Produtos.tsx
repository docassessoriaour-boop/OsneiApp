import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency } from '@/lib/utils'

import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import type { Product, ProductCategory, Medication } from '@/lib/types'
import { Plus } from 'lucide-react'
import { sincronizarEstoqueProdutos, vincularMedicamentosAoProduto } from '@/lib/stockCalculator'

import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Pencil, Trash2, FileText, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Minus, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'

const emptyProduct: Omit<Product, 'id'> = {
  nome: '', tipo: 'material', estoque: 0, unidade: '', fornecedor: '', estoque_minimo: 0, ultima_data_entrada: ''
}

export default function Produtos() {
  const { data: products, loading, insert, update, remove, reload: reloadProducts } = useDb<Product>('products')
  const { data: categories, insert: insertCategory } = useDb<ProductCategory>('product_categories')
  const { data: allMedications } = useDb<Medication>('medications')
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyProduct)
  const [sortConfig, setSortConfig] = useState<{ key: keyof Product; direction: 'asc' | 'desc' } | null>(null)

  const [baixaDialogOpen, setBaixaDialogOpen] = useState(false)
  const [baixaProduto, setBaixaProduto] = useState<Product | null>(null)
  const [baixaQtd, setBaixaQtd] = useState<number | string>('')
  const [isSyncing, setIsSyncing] = useState(false)

  // Contagem de pacientes por product_id
  const pacientesPorProduto = useMemo(() => {
    const map: Record<string, number> = {}
    allMedications.forEach(m => {
      const pid = (m as any).product_id
      if (pid) {
        map[pid] = (map[pid] || 0) + 1
      }
    })
    return map
  }, [allMedications])

  const uniqueCategories = useMemo(() => {
    const names = new Set<string>()
    categories.forEach(c => names.add(c.nome))
    products.forEach(p => {
      if (!p.category_id && p.tipo) names.add(p.tipo)
    })
    return Array.from(names).sort()
  }, [categories, products])

  const filtered = products.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase())
    const catName = categories.find(c => c.id === p.category_id)?.nome || p.tipo || 'Outro'
    const matchesCategory = categoryFilter === '' || catName === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleSort = (key: keyof Product) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  }

  const sortedData = useMemo(() => {
    const list = [...filtered];
    if (sortConfig) {
      list.sort((a, b) => {
        let aVal: any = a[sortConfig.key] ?? ''
        let bVal: any = b[sortConfig.key] ?? ''

        // Special handling for category sorting
        if (sortConfig.key === 'category_id') {
          aVal = categories.find(c => c.id === a.category_id)?.nome || ''
          bVal = categories.find(c => c.id === b.category_id)?.nome || ''
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [filtered, sortConfig, categories]);

  async function handleDelete(id: string) {
    if (!confirm('Deseja excluir este produto?')) return
    try {
      await remove(id)
    } catch (e) {
      alert('Erro ao excluir produto')
    }
  }

  function openNew() { setForm(emptyProduct); setEditingId(null); setDialogOpen(true) }
  function openEdit(p: Product) { setForm(p); setEditingId(p.id); setDialogOpen(true) }

  function openBaixa(p: Product) { setBaixaProduto(p); setBaixaQtd(''); setBaixaDialogOpen(true) }

  async function handleBaixa() {
    if (!baixaProduto) return
    const qtd = Number(baixaQtd)
    if (isNaN(qtd) || qtd <= 0) {
      alert('Quantidade inválida')
      return
    }
    if (baixaProduto.estoque < qtd) {
      alert('Estoque insuficiente')
      return
    }
    try {
      await update(baixaProduto.id, { estoque: baixaProduto.estoque - qtd })
      setBaixaDialogOpen(false)
      setBaixaProduto(null)
    } catch (error) {
      console.error('Erro ao dar baixa:', error)
      alert('Erro ao dar baixa no estoque')
    }
  }

  async function handleSave() {
    if (!form.nome) return
    try {
      if (editingId) {
        await update(editingId, form)
      } else {
        await insert(form)
      }
      setDialogOpen(false)
    } catch (error) {
      console.error('Erro ao salvar:', error)
      alert('Erro ao salvar produto')
    }
  }

  async function handleAddCategory() {
    if (!newCatName) return
    try {
      await insertCategory({ nome: newCatName.toUpperCase() })
      setNewCatName('')
      setCatDialogOpen(false)
    } catch (e) {
      alert('Erro ao criar categoria')
    }
  }

  function printReport() {
    const rows = filtered.map(p => {
      const cat = categories.find(c => c.id === p.category_id)?.nome || p.tipo || 'Outro'
      const dataEntradaStr = p.ultima_data_entrada ? new Date(p.ultima_data_entrada).toLocaleDateString('pt-BR') : '-'
      return `<tr><td>${p.nome}</td><td>${cat}</td><td class="text-right">${p.estoque}</td><td class="text-right">${formatCurrency(p.custo_medio || 0)}</td><td class="text-right">${formatCurrency(p.ultimo_valor_comprado || 0)}</td><td class="text-center">${dataEntradaStr}</td><td>${p.unidade}</td><td>${p.fornecedor}</td><td class="text-right">${p.estoque_minimo}</td></tr>`
    }).join('')
    const lowStock = filtered.filter(p => p.estoque <= p.estoque_minimo)
    printPDF('Relatório de Estoque e Custos', `
      <table><thead><tr><th>Produto</th><th>Tipo</th><th class="text-right">Estoque</th><th class="text-right">Custo Méd.</th><th class="text-right">Últ. Valor</th><th class="text-center">Últ. Entrada</th><th>Unidade</th><th>Fornecedor</th><th class="text-right">Mínimo</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${lowStock.length > 0 ? `<div style="margin-top:16px;padding:10px;background:#fef2f2;border-radius:6px;"><strong style="color:#dc2626;">⚠ ${lowStock.length} produto(s) com estoque baixo:</strong> ${lowStock.map(p => p.nome).join(', ')}</div>` : ''}
    `, clinic)
  }

  async function handleSyncMedicacao() {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      // 1. Vincula medicamentos que ainda não foram vinculados
      const vinculados = await vincularMedicamentosAoProduto(allMedications)

      // 2. Sincroniza estoque dos produtos com base na soma dos estoques dos pacientes
      const atualizados = await sincronizarEstoqueProdutos(allMedications)

      // 3. Recarrega os produtos para mostrar os valores atualizados
      await reloadProducts()

      alert(
        `Sincronização concluída!\n` +
        `• ${vinculados} novo(s) vínculo(s) medicamento↔produto criado(s)\n` +
        `• ${atualizados} produto(s) com estoque atualizado`
      )
    } catch (err: any) {
      console.error(err)
      alert('Erro ao sincronizar: ' + err.message)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque</h1>
          <p className="text-muted-foreground">Cadastro de produtos e medicamentos</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSyncMedicacao}
            disabled={isSyncing}
            className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
            title="Atualiza o estoque dos medicamentos com base na soma dos estoques individuais dos pacientes"
          >
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar Medicação
          </Button>
          <Button variant="outline" onClick={printReport} className="gap-2"><FileText className="h-4 w-4" /> PDF</Button>
          <Button variant="secondary" onClick={() => setCatDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Categoria</Button>
          <Button onClick={openNew}>Novo Produto</Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar..." />
          </div>
          <div className="w-full sm:w-64">
            <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">Todas as Categorias</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('nome')}>
                  <div className="flex items-center gap-2">
                    Nome {sortConfig?.key === 'nome' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-50" />}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('category_id')}>
                  <div className="flex items-center gap-2">
                    Tipo {sortConfig?.key === 'category_id' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-50" />}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('estoque')}>
                  <div className="flex items-center gap-2">
                    Estoque {sortConfig?.key === 'estoque' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-50" />}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('custo_medio')}>
                  <div className="flex items-center gap-2">
                    Custo Méd. {sortConfig?.key === 'custo_medio' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-50" />}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('ultimo_valor_comprado')}>
                  <div className="flex items-center gap-2">
                    Últ. Valor {sortConfig?.key === 'ultimo_valor_comprado' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-50" />}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('ultima_data_entrada')}>
                  <div className="flex items-center gap-2">
                    Últ. Entrada {sortConfig?.key === 'ultima_data_entrada' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-50" />}
                  </div>
                </TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('fornecedor')}>
                  <div className="flex items-center gap-2">
                    Fornecedor {sortConfig?.key === 'fornecedor' ? (sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />) : <ArrowUpDown className="h-4 w-4 opacity-50" />}
                  </div>
                </TableHead>
                <TableHead>Pacientes</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10}><EmptyState message="Nenhum produto" /></TableCell></TableRow>
              ) : (
                sortedData.map(p => (
                  <TableRow key={p.id}>
            <TableCell className="font-medium">{p.nome}</TableCell>
            <TableCell>
              <Badge variant="outline">
                {categories.find(c => c.id === p.category_id)?.nome || p.tipo || 'Outro'}
              </Badge>
            </TableCell>
                    <TableCell>
                      <Badge variant={p.estoque <= p.estoque_minimo ? 'destructive' : 'success'}>
                        {p.estoque}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(p.custo_medio || 0)}</TableCell>
                    <TableCell>{formatCurrency(p.ultimo_valor_comprado || 0)}</TableCell>
                    <TableCell>{p.ultima_data_entrada ? new Date(p.ultima_data_entrada).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</TableCell>
                    <TableCell>{p.unidade}</TableCell>
                    <TableCell>{p.fornecedor}</TableCell>
                    <TableCell>
                      {pacientesPorProduto[p.id] ? (
                        <Badge variant="secondary" className="text-xs">
                          {pacientesPorProduto[p.id]} pac.
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openBaixa(p)} title="Baixa no Estoque"><Minus className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogTitle>{editingId ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
          <DialogClose onClose={() => setDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Categoria / Tipo</Label>
                  <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setCatDialogOpen(true)}>+ Nova</Button>
                </div>
                <Select value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="mt-1">
                  <option value="">Selecione...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="un, cx..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Estoque Atual</Label><Input type="number" value={form.estoque} onChange={(e) => setForm({ ...form, estoque: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Estoque Mínimo</Label><Input type="number" value={form.estoque_minimo} onChange={(e) => setForm({ ...form, estoque_minimo: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Fornecedor</Label><Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="mt-1" /></div>
              <div><Label>Última Data Entrada</Label><Input type="date" value={form.ultima_data_entrada || ''} onChange={(e) => setForm({ ...form, ultima_data_entrada: e.target.value })} className="mt-1" /></div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </Dialog>
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
          <DialogClose onClose={() => setCatDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div>
            <Label>Nome da Categoria</Label>
            <Input 
              value={newCatName} 
              onChange={e => setNewCatName(e.target.value)} 
              placeholder="Ex: HORTIFRUTI"
              className="mt-1"
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleAddCategory}>Criar Categoria</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={baixaDialogOpen} onOpenChange={setBaixaDialogOpen}>
        <DialogHeader>
          <DialogTitle>Baixa no Estoque</DialogTitle>
          <DialogClose onClose={() => setBaixaDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div className="text-sm">
              <p>Produto: <strong>{baixaProduto?.nome}</strong></p>
              <p>Estoque atual: <strong>{baixaProduto?.estoque}</strong></p>
            </div>
            <div>
              <Label>Quantidade para baixar</Label>
              <Input 
                type="number" 
                value={baixaQtd} 
                onChange={e => setBaixaQtd(e.target.value)} 
                placeholder="Ex: 1"
                className="mt-1"
                min="1"
                max={baixaProduto?.estoque}
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setBaixaDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleBaixa}>Confirmar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
