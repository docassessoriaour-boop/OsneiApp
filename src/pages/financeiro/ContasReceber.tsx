import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import type { Income, TransactionCategory, Patient, BankAccount, BankTransaction, Invoice } from '@/lib/types'
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
import { Pencil, Trash2, FileText, Loader2, ArrowUp, ArrowDown, Split } from 'lucide-react'

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
  const { data: invoices, update: updateInvoice, insert: insertInvoice, remove: removeInvoice } = useDb<Invoice>('invoices')
  
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'recebido' | 'vencido'>('todos')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedPatient, setSelectedPatient] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [partialDialogOpen, setPartialDialogOpen] = useState(false)
  const [partialIncome, setPartialIncome] = useState<Income | null>(null)
  const [partialForm, setPartialForm] = useState({ valorPago: 0, dataPagamento: new Date().toISOString().slice(0, 10), bank_account_id: '' })
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

  function openPartial(i: Income) {
    setPartialIncome(i)
    setPartialForm({
      valorPago: 0,
      dataPagamento: new Date().toISOString().slice(0, 10),
      bank_account_id: ''
    })
    setPartialDialogOpen(true)
  }

  const handlePartialPayment = async () => {
    if (!partialIncome || partialForm.valorPago <= 0 || partialForm.valorPago >= partialIncome.valor) {
      alert("O valor recebido deve ser maior que zero e menor que o valor total.")
      return
    }
    if (!partialForm.bank_account_id) {
      alert("Selecione uma conta bancária.")
      return
    }

    try {
      const remainingValue = partialIncome.valor - partialForm.valorPago

      // 1. Criar transação bancária
      const bt = await insertBankTransaction({
        data: partialForm.dataPagamento,
        descricao: `Recebimento Parcial: ${partialIncome.descricao}`,
        valor: partialForm.valorPago,
        tipo: 'credito',
        origem: 'manual',
        bank_account_id: partialForm.bank_account_id,
        categoria: partialIncome.categoria,
        category_id: partialIncome.category_id
      } as any)

      // 2. Atualizar a conta atual para refletir o valor pago
      await update(partialIncome.id, {
        ...partialIncome,
        valor: partialForm.valorPago,
        status: 'recebido',
        payment_date: partialForm.dataPagamento,
        bank_account_id: partialForm.bank_account_id,
        bank_transaction_id: bt.id,
        descricao: `${partialIncome.descricao} (Parcial)`
      })

      // 3. Criar a nova conta com o saldo restante
      const novaConta = await insert({
        ...partialIncome,
        id: undefined, // ensure new ID
        valor: remainingValue,
        status: 'pendente',
        descricao: `${partialIncome.descricao} (Restante)`,
        payment_date: null,
        bank_account_id: null,
        bank_transaction_id: null
      } as any)

      // 4. Sincronizar Faturamento (Invoice) se existir
      const relatedInvoice = invoices.find(inv => inv.income_id === partialIncome.id)
      if (relatedInvoice) {
        // Atualiza a fatura original para o valor pago
        await updateInvoice(relatedInvoice.id, {
          status: 'pago',
          payment_date: partialForm.dataPagamento,
          bank_account_id: partialForm.bank_account_id,
          bank_transaction_id: bt.id,
          total_amount: partialForm.valorPago,
          items: (relatedInvoice.items || []).map(i => ({...i, price: (i.price / relatedInvoice.total_amount) * partialForm.valorPago}))
        })
        
        // Cria uma nova fatura com o restante pendente
        await insertInvoice({
          ...relatedInvoice,
          id: undefined,
          status: 'pendente',
          total_amount: remainingValue,
          income_id: novaConta.id,
          payment_date: null,
          bank_account_id: null,
          bank_transaction_id: null,
          items: (relatedInvoice.items || []).map(i => ({...i, price: (i.price / relatedInvoice.total_amount) * remainingValue}))
        } as any)
      }

      setPartialDialogOpen(false)
      alert("Baixa parcial efetuada com sucesso!")
    } catch (e: any) {
      console.error(e)
      alert("Erro ao realizar baixa parcial: " + e.message)
    }
  }

  async function handleSave() {
    if (!form.descricao) return
    try {
      const payload = { 
        ...form,
        valor: Number(Number(form.valor).toFixed(2)),
        vencimento: form.vencimento || null,
        payment_date: form.payment_date || null,
        category_id: form.category_id || null,
        bank_account_id: form.bank_account_id || null,
        bank_transaction_id: form.bank_transaction_id || null
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

        // Sincronizar faturamento (Invoice) se existir
        const relInv = invoices.find(inv => inv.income_id === editingId)
        if (relInv) {
          if (payload.status === 'recebido') {
            await updateInvoice(relInv.id, { 
               status: 'pago', 
               payment_date: payload.payment_date, 
               bank_account_id: payload.bank_account_id, 
               bank_transaction_id: payload.bank_transaction_id,
               total_amount: payload.valor
            })
          } else {
            await updateInvoice(relInv.id, { 
               status: payload.status === 'vencido' ? 'pendente' : payload.status,
               payment_date: null,
               bank_account_id: null,
               bank_transaction_id: null,
               total_amount: payload.valor
            })
          }
        }
      } else {
        await insert(payload)
      }
      setDialogOpen(false)
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar receita: ${error.message || 'Erro desconhecido'}`)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Deseja excluir esta receita? O faturamento (recibo) vinculado também será excluído.')) {
      try {
        const relInv = invoices.find(inv => inv.income_id === id)
        if (relInv) {
          await removeInvoice(relInv.id)
        }
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
        <div className="flex flex-col md:flex-row gap-4 mb-4 items-end">
          <div className="flex-1 w-full">
            <Label className="text-xs text-muted-foreground">Buscar</Label>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por descrição..." />
          </div>
          
          <div className="w-full md:w-48">
            <Label className="text-xs text-muted-foreground">Paciente</Label>
            <Select value={selectedPatient} onChange={e => setSelectedPatient(e.target.value)} className="h-9">
              <option value="">Todos Pacientes</option>
              {patients.map(p => (
                <option key={p.id} value={p.nome}>{p.nome}</option>
              ))}
            </Select>
          </div>

          <div className="w-full md:w-32">
            <Label className="text-xs text-muted-foreground">Início</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" />
          </div>
          <div className="w-full md:w-32">
            <Label className="text-xs text-muted-foreground">Fim</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9" />
          </div>

          <div className="w-full md:w-40">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="h-9">
                <option value="todos">Todos Status</option>
                <option value="pendente">Pendentes</option>
                <option value="recebido">Recebidos</option>
                <option value="vencido">Vencidos</option>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                const now = new Date()
                const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
                setStartDate(start)
                setEndDate(end)
              }}
              className="h-9"
            >
              Mês Atual
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { setStartDate(''); setEndDate(''); setSearch(''); setStatusFilter('todos'); setSelectedPatient('') }}
              className="h-9 text-muted-foreground"
            >
              Limpar
            </Button>
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
                      {(i.status === 'pendente' || i.status === 'vencido') && (
                        <Button variant="ghost" size="icon" onClick={() => openPartial(i)} title="Baixa Parcial">
                          <Split className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEdit(i)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(i.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

      <Dialog open={partialDialogOpen} onOpenChange={setPartialDialogOpen}>
        <DialogHeader>
          <DialogTitle>Baixa Parcial</DialogTitle>
          <DialogClose onClose={() => setPartialDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {partialIncome && (
            <div className="grid gap-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm mb-2">
                <p><strong>Conta:</strong> {partialIncome.descricao}</p>
                <p><strong>Valor Total:</strong> {formatCurrency(partialIncome.valor)}</p>
              </div>

              <div>
                <Label>Valor Recebido Agora</Label>
                <Input 
                  type="number" 
                  value={partialForm.valorPago || ''} 
                  onChange={(e) => setPartialForm({ ...partialForm, valorPago: Number(e.target.value) })} 
                  className="mt-1" 
                  max={partialIncome.valor - 0.01}
                />
                <p className="text-xs text-muted-foreground mt-1">O valor restante será gerado como uma nova conta pendente.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data do Recebimento</Label>
                  <Input 
                    type="date" 
                    value={partialForm.dataPagamento} 
                    onChange={(e) => setPartialForm({ ...partialForm, dataPagamento: e.target.value })} 
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label>Banco / Destino</Label>
                  <Select
                    value={partialForm.bank_account_id}
                    onChange={(e) => setPartialForm({ ...partialForm, bank_account_id: e.target.value })}
                    className="mt-1"
                  >
                    <option value="">-- Selecione o Banco --</option>
                    {bankAccounts.map(ba => (
                      <option key={ba.id} value={ba.id}>{ba.nome} {ba.banco ? `(${ba.banco})` : ''}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPartialDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handlePartialPayment}>Confirmar Baixa Parcial</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
