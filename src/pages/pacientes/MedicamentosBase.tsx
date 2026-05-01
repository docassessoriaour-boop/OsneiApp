import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import type { BaseMedication, Medication } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Pencil, Trash2, Plus, Download, Loader2 } from 'lucide-react'

export default function MedicamentosBase() {
  const { data: rawProducts, loading, insert, update, remove, reload } = useDb<any>('products')
  const baseMeds = rawProducts.filter((p: any) => p.tipo === 'medicamento')
  const { data: patientMeds, loading: loadingPatientMeds } = useDb<Medication>('medications')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<BaseMedication>>({
    nome: '',
    dosagem_padrao: '',
    unidade_medida_padrao: 'comprimido'
  })
  const [importing, setImporting] = useState(false)

  const filtered = baseMeds.filter(m => 
    m.nome.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => a.nome.localeCompare(b.nome))

  function openNew() {
    setForm({ nome: '', dosagem_padrao: '', unidade_medida_padrao: 'comprimido' })
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(med: BaseMedication) {
    setForm(med)
    setEditingId(med.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.nome) return
    try {
      const payload = {
        nome: form.dosagem_padrao ? `${form.nome.split(' - ')[0]} - ${form.dosagem_padrao}` : form.nome,
        tipo: 'medicamento',
        unidade: form.unidade_medida_padrao
      }
      
      if (editingId) {
        await update(editingId, payload)
      } else {
        await insert(payload)
      }
      setDialogOpen(false)
      reload()
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar medicamento base')
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Excluir este medicamento do catálogo?')) {
      await remove(id)
      reload()
    }
  }

  async function handleImportFromPatients() {
    if (loadingPatientMeds) {
      alert('Aguarde, os dados ainda estão sendo carregados...')
      return
    }

    if (!patientMeds || patientMeds.length === 0) {
      alert('Nenhum medicamento encontrado nos registros dos pacientes para importar.')
      return
    }

    if (!confirm(`Identificamos ${patientMeds.length} registros de medicação. Deseja importar os nomes únicos para o catálogo?`)) return
    
    setImporting(true)
    try {
      // Normalizar nomes e remover duplicatas, tratando possíveis campos nulos ou nomes de colunas diferentes
      const uniqueNamesMap = new Map<string, any>()
      patientMeds.forEach(m => {
        const rawName = m.medicamento || (m as any).medicamento || (m as any).nome_medicamento
        if (rawName) {
          const name = rawName.trim().toUpperCase()
          if (!uniqueNamesMap.has(name)) {
            uniqueNamesMap.set(name, m)
          }
        }
      })

      const existingNames = new Set(baseMeds.map((m: any) => m.nome.trim().toUpperCase()))
      
      let importedCount = 0
      for (const [name, sample] of uniqueNamesMap.entries()) {
        const sampleDosagem = sample.dosagem || (sample as any).dosagem || ''
        const sampleUnidade = sample.unidade_medida || (sample as any).unidade_medida || 'comprimido'
        const baseName = sample.medicamento || (sample as any).medicamento || name
        const finalName = sampleDosagem ? `${baseName} - ${sampleDosagem}` : baseName
        
        if (!existingNames.has(finalName.trim().toUpperCase())) {
          await insert({
            nome: finalName,
            tipo: 'medicamento',
            unidade: sampleUnidade
          })
          importedCount++
        }
      }
      
      alert(`${importedCount} novos medicamentos importados com sucesso para o catálogo!`)
      reload()
    } catch (error: any) {
      console.error(error)
      alert(`Erro ao importar: ${error.message || 'Verifique se a tabela base_medications existe no banco de dados.'}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de Medicamentos</h1>
          <p className="text-muted-foreground">Gerencie a lista base de medicamentos do sistema para facilitar novos cadastros</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImportFromPatients} disabled={importing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Importar do Histórico
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Medicamento
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="mb-6">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar no catálogo..." />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome do Medicamento</TableHead>
              <TableHead>Dosagem Padrão</TableHead>
              <TableHead>Unidade Padrão</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4}><EmptyState message="Nenhum medicamento no catálogo" /></TableCell></TableRow>
            ) : (
              filtered.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-bold">{m.nome.split(' - ')[0]}</TableCell>
                  <TableCell>{m.nome.includes(' - ') ? m.nome.split(' - ')[1] : '-'}</TableCell>
                  <TableCell>{m.unidade || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit({ id: m.id, nome: m.nome.split(' - ')[0], dosagem_padrao: m.nome.includes(' - ') ? m.nome.split(' - ')[1] : '', unidade_medida_padrao: m.unidade } as BaseMedication)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'Editar Medicamento' : 'Novo Medicamento'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome do Medicamento</Label>
              <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} placeholder="Ex: Dipirona" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Dosagem Padrão</Label>
                <Input value={form.dosagem_padrao} onChange={e => setForm({...form, dosagem_padrao: e.target.value})} placeholder="Ex: 500mg" />
              </div>
              <div className="grid gap-2">
                <Label>Unidade Padrão</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={form.unidade_medida_padrao} 
                  onChange={e => setForm({...form, unidade_medida_padrao: e.target.value})}
                >
                  <option value="comprimido">Comprimido</option>
                  <option value="ml">ml</option>
                  <option value="gotas">Gotas</option>
                  <option value="ampola">Ampola</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
