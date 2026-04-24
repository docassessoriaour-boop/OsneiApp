import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF, printReceipt } from '@/lib/pdf'
import type { Invoice, Patient, Income, InvoiceItem, Contract, BankAccount, BankTransaction } from '@/lib/types'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Printer, CheckCircle2, Loader2, FileText, Search, Receipt, Layers, Calendar, Pencil, ArrowUp, ArrowDown } from 'lucide-react'

const emptyItem: InvoiceItem = { description: '', quantity: 1, price: 0 }

export default function Faturamento() {
  const { data: invoices, loading: loadingInvoices, insert: insertInvoice, update: updateInvoice } = useDb<Invoice>('invoices')
  const { data: patients, loading: loadingPatients } = useDb<Patient>('patients')
  const { data: contracts, loading: loadingContracts } = useDb<Contract>('contracts')
  const { data: incomes, insert: insertIncome, update: updateIncome } = useDb<Income>('incomes')
  const { data: bankAccounts } = useDb<BankAccount>('bank_accounts')
  const { insert: insertBankTransaction, update: updateBankTransaction } = useDb<BankTransaction>('bank_transactions')
  const [clinic] = useClinic()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [batchForm, setBatchForm] = useState({
    date_issued: new Date().toISOString().slice(0, 10),
    due_date: '',
    description: 'Mensalidade Assistencial'
  })

  // Set default due_date to day 10 of next month
  useState(() => {
    const nextMonth = new Date()
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    nextMonth.setDate(10)
    setBatchForm(f => ({ ...f, due_date: nextMonth.toISOString().slice(0, 10) }))
  })

  const [form, setForm] = useState<Partial<Invoice>>({
    client_name: '',
    client_document: '',
    date_issued: new Date().toISOString().slice(0, 10),
    due_date: '2026-05-07',
    total_amount: 0,
    items: [{ ...emptyItem }]
  })

  const filtered = invoices.filter(inv =>
    (inv.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
    inv.id.includes(search)
  ).sort((a, b) => {
    return sortDir === 'asc' 
      ? a.due_date.localeCompare(b.due_date)
      : b.due_date.localeCompare(a.due_date)
  })

  const handleAddItem = () => {
    setForm(f => ({ ...f, items: [...(f.items || []), { ...emptyItem }] }))
  }

  const handleRemoveItem = (index: number) => {
    const newItems = [...(form.items || [])]
    newItems.splice(index, 1)
    setForm(f => ({ ...f, items: newItems }))
    calculateTotal(newItems)
  }

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...(form.items || [])]
    newItems[index] = { ...newItems[index], [field]: value }
    setForm(f => ({ ...f, items: newItems }))
    calculateTotal(newItems)
  }

  const calculateTotal = (items: InvoiceItem[]) => {
    const total = items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
    setForm(f => ({ ...f, total_amount: total }))
  }

  const selectPatient = (p: Patient) => {
    setForm(f => ({
      ...f,
      patient_id: p.id,
      client_name: p.nome,
      client_document: p.cpf
    }))
  }

  async function handleGenerateBatch() {
    const activeContracts = contracts.filter(c => c.status === 'ativo' && c.valor > 0)
    if (activeContracts.length === 0) {
      alert('Nenhum contrato ativo encontrado para gerar faturas.')
      return
    }

    if (!batchForm.date_issued || !batchForm.due_date || !batchForm.description) {
      alert('Preencha os campos para geração em lote.')
      return
    }

    if (!confirm(`Deseja gerar ${activeContracts.length} faturas a partir dos contratos ativos?`)) return

    try {
      let count = 0
      for (const contract of activeContracts) {
        const patient = patients.find(p => p.id === contract.pacienteId)
        if (!patient) continue

        // 1. Criar a Income (Conta a Receber)
        const income = await insertIncome({
          descricao: `${batchForm.description}: ${patient.nome}`,
          categoria: 'Mensalidade/Serviços',
          valor: contract.valor,
          vencimento: batchForm.due_date,
          status: 'pendente'
        })

        // 2. Criar a Invoice vinculada à Income
        await insertInvoice({
          patient_id: patient.id,
          client_name: patient.nome,
          client_document: patient.cpf || patient.resp_cpf || '',
          date_issued: batchForm.date_issued,
          due_date: batchForm.due_date,
          total_amount: contract.valor,
          items: [{ description: batchForm.description, quantity: 1, price: contract.valor }],
          income_id: income.id,
          status: 'pendente'
        } as any)
        
        count++
      }

      setBatchDialogOpen(false)
      alert(`${count} faturas foram geradas e lançadas no financeiro com sucesso!`)
    } catch (error) {
      console.error(error)
      alert('Erro ao gerar faturas em lote.')
    }
  }

  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedBankId, setSelectedBankId] = useState('')
  const [invoiceToPay, setInvoiceToPay] = useState<Invoice | null>(null)

  function openPayDialog(inv: Invoice) {
    setInvoiceToPay(inv)
    setPayDate(new Date().toISOString().slice(0, 10))
    setSelectedBankId(inv.bank_account_id || '')
    setPayDialogOpen(true)
  }

  function openEditPayDialog(inv: Invoice) {
    setInvoiceToPay(inv)
    setPayDate(inv.payment_date || new Date().toISOString().slice(0, 10))
    setSelectedBankId(inv.bank_account_id || '')
    setPayDialogOpen(true)
  }

  async function handleMarkPaid() {
    if (!invoiceToPay) return
    try {
      let btId = invoiceToPay.bank_transaction_id

      // 3. Criar ou Atualizar Transação Bancária
      if (selectedBankId) {
        const linkedIncome = incomes.find(inc => inc.id === invoiceToPay.income_id)
        const btData = {
          data: payDate,
          descricao: `Recebimento Fatura: ${invoiceToPay.client_name}`,
          valor: invoiceToPay.total_amount,
          tipo: 'credito' as const,
          origem: 'manual' as const,
          bank_account_id: selectedBankId,
          categoria: linkedIncome?.categoria || 'Paciente',
          category_id: linkedIncome?.category_id || null
        }

        if (btId) {
          await updateBankTransaction(btId, btData)
        } else {
          const bt = await insertBankTransaction(btData as any)
          btId = bt.id
        }
      }

      // Atualizar Invoice com o ID da transação
      await updateInvoice(invoiceToPay.id, { 
        status: 'pago',
        payment_date: payDate,
        bank_account_id: selectedBankId || null,
        bank_transaction_id: btId || null
      })

      // 2. Se houver income_id, atualizar Income
      if (invoiceToPay.income_id) {
        await updateIncome(invoiceToPay.income_id, { 
          status: 'recebido',
          payment_date: payDate,
          bank_account_id: selectedBankId || null,
          bank_transaction_id: btId || null
        })
      }
      
      setPayDialogOpen(false)
      
      if (confirm('Fatura marcada como paga! Deseja gerar o recibo agora?')) {
        handlePrintReceipt(updatedInv)
      }
    } catch (error) {
       console.error(error)
       alert('Erro ao atualizar faturamento.')
    }
  }

  async function handleGenerate() {
    if (!form.client_name || !form.total_amount || (form.items?.length === 0)) {
      alert('Preencha os dados básicos e ao menos um item.')
      return
    }

    try {
      const sanitizedForm = {
        ...form,
        date_issued: form.date_issued || null,
        due_date: form.due_date || null
      }

      // 1. Criar a Income (Conta a Receber)
      const income = await insertIncome({
        descricao: `Fatura: ${sanitizedForm.client_name}`,
        categoria: 'Mensalidade/Serviços',
        valor: sanitizedForm.total_amount!,
        vencimento: sanitizedForm.due_date!,
        status: 'pendente'
      })

      // 2. Criar a Invoice vinculada à Income
      await insertInvoice({
        ...sanitizedForm,
        income_id: income.id,
        status: 'pendente'
      } as any)

      setDialogOpen(false)
      alert('Faturamento gerado e lançado no Contas a Receber!')
    } catch (error) {
      console.error(error)
      alert('Erro ao gerar faturamento.')
    }
  }

  function handlePrintReceipt(inv: Invoice) {
    const patient = patients.find(p => p.id === inv.patient_id)
    printReceipt(inv, patient, clinic)
  }

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  function printInvoice(inv: Invoice) {
    const safeItems = inv.items || []
    const patient = patients.find(p => p.id === inv.patient_id)
    const itemsHtml = safeItems.map(item => `
      <tr>
        <td>${item.description}</td>
        <td>${item.quantity}</td>
        <td class="text-right">${formatCurrencyPDF(item.price)}</td>
        <td class="text-right">${formatCurrencyPDF(item.quantity * item.price)}</td>
      </tr>
    `).join('')

    printPDF(`FATURA #${inv.id.slice(0, 8).toUpperCase()}`, `
      <h2 style="text-align:center; text-transform:uppercase; margin-bottom: 20px;">Fatura de Prestação de Serviços</h2>
      <div style="display:flex; justify-content:space-between; margin-bottom: 20px;">
        <div>
          <h3 style="margin-top:0">Dados do Cliente</h3>
          <p><strong>Paciente:</strong> ${inv.client_name}</p>
          <p><strong>CPF Paciente:</strong> ${patient?.cpf || inv.client_document || '—'}</p>
          ${patient?.responsavel ? `<p><strong>Responsável:</strong> ${patient.responsavel}</p>` : ''}
          ${patient?.resp_cpf ? `<p><strong>CPF Responsável:</strong> ${patient.resp_cpf}</p>` : ''}
        </div>
        <div style="text-align:right">
          <h3 style="margin-top:0">Informações da Fatura</h3>
          <p><strong>Data de Emissão:</strong> ${formatDatePDF(inv.date_issued)}</p>
          <p><strong>Vencimento:</strong> <span class="${new Date(inv.due_date) < new Date() && inv.status !== 'pago' ? 'text-red' : ''}">${formatDatePDF(inv.due_date)}</span></p>
          ${inv.status === 'pago' && inv.payment_date ? `<p><strong>Data de Pagamento:</strong> ${formatDatePDF(inv.payment_date)}</p>` : ''}
          <p><strong>Status:</strong> ${inv.status.toUpperCase()}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Qtd</th>
            <th class="text-right">Vlr Unit</th>
            <th class="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="text-align:right; margin-top:20px;">
        <p style="font-size:18px"><strong>Total da Fatura: ${formatCurrencyPDF(inv.total_amount)}</strong></p>
      </div>

      <div class="divider"></div>
      <div class="section">
        <h3>Instruções de Pagamento</h3>
        <p>Por favor, realize o pagamento até a data de vencimento informada.</p>
        <p>Em caso de dúvidas, entre em contato com nosso financeiro.</p>
      </div>
      
      <div class="signature">
        <div class="signature-line">
          <hr/>
          <p>Financeiro</p>
        </div>
        <div class="signature-line">
          <hr/>
          <p>Cliente / Responsável</p>
        </div>
      </div>
    `, clinic)
  }

  function handleOpenDetails(inv: Invoice) {
    setSelectedInvoice(inv)
    setDetailsOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faturamento</h1>
          <p className="text-muted-foreground">Gerencie faturas e gere lançamentos automáticos no financeiro</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBatchDialogOpen(true)} className="gap-2">
            <Layers className="h-4 w-4" /> Gerar via Contratos
          </Button>
          <Button onClick={() => {
            setForm({
              client_name: '',
              client_document: '',
              date_issued: new Date().toISOString().slice(0, 10),
              due_date: '2026-05-07',
              total_amount: 0,
              items: [{ ...emptyItem }]
            });
            setDialogOpen(true);
          }} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Faturamento
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou ID da fatura..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fatura #</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Emissão</TableHead>
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
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInvoices ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma fatura encontrada</TableCell></TableRow>
            ) : (
              filtered.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="font-medium">{inv.client_name}</TableCell>
                  <TableCell>{formatDate(inv.date_issued)}</TableCell>
                  <TableCell>{formatDate(inv.due_date)}</TableCell>
                  <TableCell>{inv.payment_date ? formatDate(inv.payment_date) : '—'}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(inv.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={inv.status === 'pago' ? 'success' : inv.status === 'pendente' ? 'warning' : 'destructive'}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => printInvoice(inv)} title="Imprimir Fatura">
                        <Printer className="h-4 w-4" />
                      </Button>
                       {inv.status === 'pago' ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handlePrintReceipt(inv)} title="Imprimir Recibo" className="text-blue-600">
                            <Receipt className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditPayDialog(inv)} title="Editar Data do Pagamento" className="text-orange-500">
                            <Calendar className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => openPayDialog(inv)} title="Dar Baixa (Marcar como Pago)" className="text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Ver Detalhes" onClick={() => handleOpenDetails(inv)}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Gerar Novo Faturamento</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Selecionar Paciente (Opcional)</Label>
                <div className="flex gap-2 mt-1">
                  <Select
                    className="flex-1"
                    onChange={(e) => {
                      const p = patients.find(px => px.id === e.target.value)
                      if (p) selectPatient(p)
                    }}
                  >
                    <option value="">-- Buscar Paciente --</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Cliente / Razão Social</Label>
                <Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>CPF / CNPJ</Label>
                <Input value={form.client_document} onChange={e => setForm({ ...form, client_document: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Data de Emissão</Label>
                <Input type="date" value={form.date_issued} onChange={e => setForm({ ...form, date_issued: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Itens da Fatura</h3>
                <Button variant="outline" size="sm" onClick={handleAddItem} className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar Item
                </Button>
              </div>

              {form.items?.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-xs">Descrição</Label>
                    <Input value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} placeholder="Ex: Mensalidade Janeiro" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Qtd</Label>
                    <Input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))} />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">Vlr Unit</Label>
                    <Input type="number" value={item.price} onChange={e => handleItemChange(index, 'price', Number(e.target.value))} />
                  </div>
                  <div className="col-span-1 pb-1">
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-4 border-t">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total da Fatura</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(form.total_amount || 0)}</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleGenerate} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Gerar e Lançar Receita
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{invoiceToPay?.status === 'pago' ? 'Editar Data do Pagamento' : 'Confirmar Pagamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Informe a data em que o pagamento foi realizado:</p>
            <div className="space-y-2">
              <Label>Data do Pagamento</Label>
              <Input 
                type="date" 
                value={payDate} 
                onChange={e => setPayDate(e.target.value)} 
              />
            </div>
            <div className="space-y-2">
              <Label>Conta Bancária / Destino</Label>
              <Select 
                value={selectedBankId} 
                onChange={e => setSelectedBankId(e.target.value)}
              >
                <option value="">-- Selecionar Banco --</option>
                {bankAccounts.map(ba => (
                  <option key={ba.id} value={ba.id}>{ba.nome} ({ba.banco})</option>
                ))}
              </Select>
            </div>
            <div className="p-3 bg-muted rounded-md text-sm">
               <strong>Valor:</strong> {formatCurrency(invoiceToPay?.total_amount || 0)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleMarkPaid} className="bg-green-600 hover:bg-green-700">
              {invoiceToPay?.status === 'pago' ? 'Salvar Alteração' : 'Confirmar Recebimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Faturas via Contratos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Isso irá gerar uma fatura (e conta a receber) para <strong>cada contrato ativo</strong> dos pacientes.
            </p>
            <div className="space-y-2">
              <Label>Descrição do Item</Label>
              <Input 
                value={batchForm.description} 
                onChange={e => setBatchForm({...batchForm, description: e.target.value})} 
                placeholder="Ex: Mensalidade Assistencial - Maio"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Emissão</Label>
              <Input 
                type="date" 
                value={batchForm.date_issued} 
                onChange={e => setBatchForm({...batchForm, date_issued: e.target.value})} 
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Vencimento</Label>
              <Input 
                type="date" 
                value={batchForm.due_date} 
                onChange={e => setBatchForm({...batchForm, due_date: e.target.value})} 
              />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerateBatch} className="gap-2">
              <Layers className="h-4 w-4" /> Gerar Faturas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes da Fatura</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Cliente</p>
                  <p className="font-semibold">{selectedInvoice.client_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Documento</p>
                  <p className="font-semibold">{selectedInvoice.client_document || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Emissão</p>
                  <p className="font-semibold">{formatDate(selectedInvoice.date_issued)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Vencimento</p>
                  <p className="font-semibold">{formatDate(selectedInvoice.due_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={selectedInvoice.status === 'pago' ? 'success' : selectedInvoice.status === 'pendente' ? 'warning' : 'destructive'}>
                    {selectedInvoice.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Total</p>
                  <p className="font-bold text-lg text-primary">{formatCurrency(selectedInvoice.total_amount)}</p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3">Itens da Fatura</h4>
                <div className="space-y-2">
                  {(selectedInvoice.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-muted/30 p-2 rounded text-sm">
                      <div>
                        <p className="font-medium">{item.description}</p>
                        <p className="text-muted-foreground text-xs">{item.quantity}x {formatCurrency(item.price)}</p>
                      </div>
                      <p className="font-semibold">{formatCurrency(item.quantity * item.price)}</p>
                    </div>
                  ))}
                  {(!selectedInvoice.items || selectedInvoice.items.length === 0) && (
                    <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailsOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
