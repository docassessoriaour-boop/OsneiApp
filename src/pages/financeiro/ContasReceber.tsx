import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import type { Income, TransactionCategory, Patient, BankAccount } from '@/lib/types'
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
import { Pencil, Trash2, FileText, Loader2, ArrowUp, ArrowDown } from 'lucide-react'

const emptyIncome: Omit<Income, 'id'> = {
  descricao: '', 
  categoria: '', 
  category_id: '',
  valor: 0, 
  vencimento: new Date().toISOString().slice(0, 10), 
  status: 'pendente',
  payment_date: '',
  bank_account_id: ''
}

export default function ContasReceber() {
  const { data: incomes, loading, insert, update, remove } = useDb<Income>('incomes')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')
  const { data: patients } = useDb<Patient>('patients')
  const { data: bankAccounts } = useDb<BankAccount>('bank_accounts')
  const { insert: insertBankTransaction, update: updateBankTransaction, remove: removeBankTransaction } = useDb<BankTransaction>('bank_transactions')
  
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'recebido' | 'vencido'>('todos')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedPatient, setSelectedPatient] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyIncome)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const filtered = incomes.filter(i => {
    const matchesSearch = i.descricao.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'todos' || i.status === statusFilter
    const matchesPatient = !selectedPatient || i.descricao.toLowerCase().includes(selectedPatient.toLowerCase())
    
    let matchesPeriod = true
    if (startDate) matchesPeriod = matchesPeriod && i.vencimento >= startDate
    if (endDate) matchesPeriod = matchesPeriod && i.vencimento <= endDate
    
    return matchesSearch && matchesStatus && matchesPatient && matchesPeriod
  }).sort((a, b) => {
    return sortDir === 'asc' 
      ? a.vencimento.localeCompare(b.vencimento)
      : b.vencimento.localeCompare(a.vencimento)
  })

  function openNew() { setForm(emptyIncome); setEditingId(null); setDialogOpen(true) }

  function openEdit(i: Income) { setForm(i); setEditingId(i.id); setDialogOpen(true) }

  async function handleSave() {
    if (!form.descricao) return
    try {
      const payload = { 
        ...form,
        vencimento: form.vencimento || null,
        payment_date: form.payment_date || null
      }
      if (payload.category_id) {
        payload.categoria = categories.find(c => c.id === payload.category_id)?.nome || payload.categoria
      }

      let btId = payload.bank_transaction_id

      if (payload.status === 'recebido' && payload.bank_account_id) {
        const btData = {
          data: payload.payment_date || payload.vencimento,
          descricao: `Recebimento: ${payload.descricao}`,
          valor: payload.valor,
          tipo: 'credito' as const,
          origem: 'manual' as const,
          bank_account_id: payload.bank_account_id,
          categoria: payload.categoria,
          category_id: payload.category_id
        }

        if (btId) {
          await updateBankTransaction(btId, btData)
        } else {
          const bt = await insertBankTransaction(btData as any)
          btId = bt.id
          payload.bank_transaction_id = btId
        }
      } else if (btId) {
        await removeBankTransaction(btId)
        payload.bank_transaction_id = undefined
      }

      if (editingId) {
        await update(editingId, payload)
      } else {
        await insert(payload)
      }
      setDialogOpen(false)
    } catch (error) {
      console.error('Erro ao salvar:', error)
      alert('Erro ao salvar receita')
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Deseja excluir esta receita?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error('Erro ao excluir:', error)
      }
    }
  }

  const statusBadge = (status: Income['status']) => {
    const map = { pendente: 'warning', recebido: 'success', vencido: 'destructive' } as const
    const labels = { pendente: 'Pendente', recebido: 'Recebido', vencido: 'Vencido' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  function printReport() {
    const total = filtered.reduce((s, i) => s + i.valor, 0)
    const rows = filtered.map(i => `<tr><td>${i.descricao}</td><td>${i.categoria}</td><td class="text-right">${formatCurrencyPDF(i.valor)}</td><td>${formatDatePDF(i.vencimento)}</td><td>${i.payment_date ? formatDatePDF(i.payment_date) : '—'}</td><td>${i.status}</td></tr>`).join('')
    printPDF('Relatório de Contas a Receber', `
      <table><thead><tr><th>Descrição</th><th>Categoria</th><th class="text-right">Valor</th><th>Vencimento</th><th>Recebimento</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="divider"></div>
      <div style="text-align:right;font-weight:700;">Total: ${formatCurrencyPDF(total)}</div>
    `, clinic)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a Receber</h1>
          <p className="text-muted-foreground">Gerenciamento de receitas e faturamentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printReport} className="gap-2"><FileText className="h-4 w-4" /> PDF</Button>
          <Button onClick={openNew}>Nova Receita</Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="lg:col-span-1">
            <Label className="text-xs mb-1 block text-muted-foreground uppercase tracking-wider font-semibold">Busca</Label>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar descrição..." />
          </div>
          
          <div>
            <Label className="text-xs mb-1 block text-muted-foreground uppercase tracking-wider font-semibold">Paciente</Label>
            <Select value={selectedPatient} onChange={e => setSelectedPatient(e.target.value)}>
              <option value="">Todos Pacientes</option>
              {patients.map(p => (
                <option key={p.id} value={p.nome}>{p.nome}</option>
              ))}
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1 block text-muted-foreground uppercase tracking-wider font-semibold">Status</Label>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                <option value="todos">Todos Status</option>
                <option value="pendente">Pendentes</option>
                <option value="recebido">Recebidos</option>
                <option value="vencido">Vencidos</option>
            </Select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs mb-1 block text-muted-foreground uppercase tracking-wider font-semibold">Início</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} size={1} />
            </div>
            <div className="flex-1">
              <Label className="text-xs mb-1 block text-muted-foreground uppercase tracking-wider font-semibold">Fim</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} size={1} />
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead 
                className="cursor-pointer hover:text-primary transition-colors select-none"
                onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              >
                <div className="flex items-center gap-1">
                  Vencimento
                  {sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                </div>
              </TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7}><EmptyState message="Nenhuma receita" /></TableCell></TableRow>
            ) : (
              filtered.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.descricao}</TableCell>
                  <TableCell>{i.categoria}</TableCell>
                  <TableCell className="font-semibold text-green-600">{formatCurrency(i.valor)}</TableCell>
                  <TableCell>{formatDate(i.vencimento)}</TableCell>
                  <TableCell>{i.payment_date ? formatDate(i.payment_date) : '—'}</TableCell>
                  <TableCell>{statusBadge(i.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(i.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Receita' : 'Nova Receita'}</DialogTitle>
          <DialogClose onClose={() => setDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="mt-1" placeholder="Ex: Mensalidade de paciente" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select 
                  value={form.category_id || ''} 
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="mt-1"
                >
                  <option value="">-- Selecione --</option>
                  {categories.filter(c => c.tipo === 'receita').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Vencimento</Label><Input type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} className="mt-1" /></div>
              <div><Label>Status</Label><Select value={form.status} onChange={(e) => {
                 const newStatus = e.target.value as Income['status'];
                 setForm({ 
                   ...form, 
                   status: newStatus,
                   payment_date: newStatus === 'recebido' && !form.payment_date ? new Date().toISOString().slice(0, 10) : form.payment_date
                 })
               }} className="mt-1"><option value="pendente">Pendente</option><option value="recebido">Recebido</option><option value="vencido">Vencido</option></Select></div>
            </div>

            {form.status === 'recebido' && (
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <Label>Data do Recebimento</Label>
                    <Input 
                      type="date" 
                      value={form.payment_date || ''} 
                      onChange={(e) => setForm({ ...form, payment_date: e.target.value })} 
                      className="mt-1" 
                    />
                 </div>
                 <div>
                    <Label>Banco / Destino</Label>
                    <Select
                      value={form.bank_account_id || ''}
                      onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
                      className="mt-1"
                    >
                      <option value="">-- Selecionar Banco --</option>
                      {bankAccounts.map(ba => (
                        <option key={ba.id} value={ba.id}>{ba.nome} {ba.banco ? `(${ba.banco})` : ''}</option>
                      ))}
                    </Select>
                 </div>
               </div>
             )}
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
