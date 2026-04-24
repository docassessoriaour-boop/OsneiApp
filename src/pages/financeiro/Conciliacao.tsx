import { useState, useRef, useMemo } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate, generateId } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF, printReceipt } from '@/lib/pdf'
import type { Bill, Income, BankTransaction, BankAccount, TransactionCategory, Patient, Invoice } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Upload, FileText, Plus, Landmark, Tag, X, Save, Search, Link, CheckCircle2 } from 'lucide-react'

export default function Conciliacao() {
  const { data: bills, update: updateBill } = useDb<Bill>('bills')
  const { data: incomes, update: updateIncome } = useDb<Income>('incomes')
  const { data: dbTransactions, insert: insertTx, update: updateTx, remove: removeTx } = useDb<BankTransaction>('bank_transactions')
  const { data: bankAccounts } = useDb<BankAccount>('bank_accounts')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')
  const { data: invoices, update: updateInvoice } = useDb<Invoice>('invoices')
  const { data: patients } = useDb<Patient>('patients')
  
  const [clinic] = useClinic()
  const fileRef = useRef<HTMLInputElement>(null)
  
  const [selectedBankId, setSelectedBankId] = useState('')
  const [importedTxs, setImportedTxs] = useState<BankTransaction[]>([])
  const [filterCat, setFilterCat] = useState('')
  const [filterType, setFilterType] = useState<'' | 'credito' | 'debito'>('')
  const [search, setSearch] = useState('')
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null)
  const [reconcileSearch, setReconcileSearch] = useState('')

  // Merge transactions
  const allTransactions = useMemo(() => {
    const list = [...dbTransactions, ...importedTxs]
    return list
      .filter(t => {
        const matchesBank = !selectedBankId || t.bank_account_id === selectedBankId
        const matchesCat = !filterCat || t.category_id === filterCat || t.categoria === filterCat
        const matchesType = !filterType || t.tipo === filterType
        const matchesSearch = !search || t.descricao.toLowerCase().includes(search.toLowerCase())
        return matchesBank && matchesCat && matchesType && matchesSearch
      })
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  }, [dbTransactions, importedTxs, selectedBankId, filterCat, filterType, search])

  const totals = useMemo(() => {
    const credit = allTransactions.filter(t => t.tipo === 'credito').reduce((s, t) => s + t.valor, 0)
    const debit = allTransactions.filter(t => t.tipo === 'debito').reduce((s, t) => s + t.valor, 0)
    return { credit, debit, balance: credit - debit }
  }, [allTransactions])

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (file.name.toLowerCase().endsWith('.ofx')) {
        parseOFX(text)
      } else {
        parseCSV(text)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function parseCSV(text: string) {
    const lines = text.trim().split('\n')
    const newTxs: BankTransaction[] = []
    const startIdx = (lines[0].toLowerCase().includes('data') || lines[0].toLowerCase().includes('date')) ? 1 : 0

    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split(/[;,\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
      if (cols.length < 3) continue
      const valor = parseFloat(cols[2].replace(/\./g, '').replace(',', '.'))
      if (isNaN(valor)) continue
      
      const dateStr = cols[0]
      let data = ''
      const dParts = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
      if (dParts) {
        const y = dParts[3].length === 2 ? `20${dParts[3]}` : dParts[3]
        data = `${y}-${dParts[2].padStart(2, '0')}-${dParts[1].padStart(2, '0')}`
      }

      newTxs.push({
        id: 'temp-' + generateId(),
        data,
        descricao: cols[1],
        valor: Math.abs(valor),
        tipo: valor >= 0 ? 'credito' : 'debito',
        origem: 'csv',
        bank_account_id: selectedBankId
      })
    }
    setImportedTxs([...importedTxs, ...newTxs])
  }

  function parseOFX(text: string) {
    const newTxs: BankTransaction[] = []
    const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
    let match
    while ((match = stmtRegex.exec(text)) !== null) {
      const block = match[1]
      const get = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'))
        return m ? m[1].trim() : ''
      }
      const dtposted = get('DTPOSTED')
      const trnamt = parseFloat(get('TRNAMT').replace(',', '.'))
      const memo = get('MEMO') || get('NAME') || 'Sem descrição'
      if (isNaN(trnamt)) continue
      const data = dtposted.length >= 8 
        ? `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`
        : ''
      
      newTxs.push({
        id: 'temp-' + generateId(),
        data,
        descricao: memo,
        valor: Math.abs(trnamt),
        tipo: trnamt >= 0 ? 'credito' : 'debito',
        origem: 'ofx',
        bank_account_id: selectedBankId
      })
    }
    setImportedTxs([...importedTxs, ...newTxs])
  }

  async function saveTransaction(t: BankTransaction) {
    try {
      if (t.id.startsWith('temp-')) {
        const cleaned = { ...t }
        delete (cleaned as any).id
        await insertTx(cleaned)
        setImportedTxs(importedTxs.filter(x => x.id !== t.id))
      } else {
        await updateTx(t.id, t)
      }
    } catch (e) {
      alert('Erro ao salvar transação')
    }
  }

  async function saveAllImported() {
    if (!selectedBankId) {
      alert('Selecione uma conta bancária antes de salvar.')
      return
    }
    for (const t of importedTxs) {
      const cleaned = { ...t, bank_account_id: selectedBankId }
      delete (cleaned as any).id
      await insertTx(cleaned)
    }
    setImportedTxs([])
    alert('Todas as transações foram salvas no banco de dados.')
  }

  async function handleReconcile(tx: BankTransaction, item: Income | Bill) {
    try {
      // 1. Marcar o item (Income ou Bill) como pago/recebido
      if (tx.tipo === 'credito') {
        const income = item as Income
        await updateIncome(income.id, { status: 'recebido' })
        
        // 2. Se for uma Income vinculada a uma Invoice, marcar a Invoice como paga
        const linkedInvoice = invoices.find(inv => inv.income_id === income.id || inv.id === income.invoiceId)
        if (linkedInvoice) {
          await updateInvoice(linkedInvoice.id, { status: 'pago' })
          
          // Solicitar impressão do recibo
          if (confirm('Lançamento conciliado e fatura quitada! Deseja gerar o recibo agora?')) {
            const patient = patients.find(p => p.id === linkedInvoice.patient_id)
            printReceipt(linkedInvoice, patient, clinic)
          }
        }
      } else {
        await updateBill(item.id, { status: 'pago' })
      }

      // 3. Salvar a transação bancária se for temporária
      if (tx.id.startsWith('temp-')) {
        const cleaned = { ...tx, category_id: item.category_id || tx.category_id }
        delete (cleaned as any).id
        await insertTx(cleaned)
        setImportedTxs(prev => prev.filter(x => x.id !== tx.id))
      } else {
        await updateTx(tx.id, { ...tx, category_id: item.category_id || tx.category_id })
      }

      setReconcileDialogOpen(false)
      setSelectedTx(null)
      alert('Conciliação realizada com sucesso! O lançamento financeiro foi baixado.')
    } catch (e) {
      console.error(e)
      alert('Erro ao realizar conciliação.')
    }
  }

  async function autoReconcileAll() {
    let count = 0
    const txsToProcess = [...importedTxs]
    
    for (const tx of txsToProcess) {
      const isIncome = tx.tipo === 'credito'
      const source = isIncome ? incomes : bills
      
      const exactMatches = source.filter(item => 
        (item.status === 'pendente') && 
        Math.abs(item.valor - tx.valor) < 0.01
      )

      if (exactMatches.length === 1) {
        await handleReconcile(tx, exactMatches[0])
        count++
      }
    }

    if (count > 0) {
      alert(`${count} transações foram conciliadas automaticamente!`)
    } else {
      alert('Nenhuma transação com valor exato correspondente foi encontrada.')
    }
  }

  const potentialMatches = useMemo(() => {
    if (!selectedTx) return []
    const isIncome = selectedTx.tipo === 'credito'
    const source = isIncome ? incomes : bills
    
    return source.filter(item => {
      if (item.status === 'recebido' || item.status === 'pago') return false
      
      const matchesValue = Math.abs(item.valor - selectedTx.valor) < 0.01
      const matchesSearch = !reconcileSearch || 
        item.descricao.toLowerCase().includes(reconcileSearch.toLowerCase()) ||
        item.valor.toString().includes(reconcileSearch)
      
      return matchesSearch && (matchesValue || reconcileSearch)
    })
  }, [selectedTx, incomes, bills, reconcileSearch])

  const printReport = () => {
    const html = `
      <h3>Resumo Financeiro</h3>
      <p>Créditos: ${formatCurrencyPDF(totals.credit)}</p>
      <p>Débitos: ${formatCurrencyPDF(totals.debit)}</p>
      <p>Saldo: ${formatCurrencyPDF(totals.balance)}</p>
      <br/>
      <table>
        <thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Tipo</th></tr></thead>
        <tbody>
          ${allTransactions.map(t => `
            <tr>
              <td>${formatDatePDF(t.data)}</td>
              <td>${t.descricao}</td>
              <td class="${t.tipo === 'credito' ? 'text-green' : 'text-red'}">${formatCurrencyPDF(t.valor)}</td>
              <td>${t.tipo}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    printPDF('Relatório de Conciliação', html, clinic)
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Conciliação Bancária" 
        description="Importe arquivos OFX/CSV e vincule aos seus lançamentos" 
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Label className="text-xs">Conta Bancária</Label>
          <Select value={selectedBankId} onChange={e => setSelectedBankId(e.target.value)}>
            <option value="">-- Selecione a Conta --</option>
            {bankAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nome}</option>)}
          </Select>
        </div>
        
        <div className="flex items-end gap-2 pt-5">
          <input type="file" ref={fileRef} accept=".csv,.ofx" className="hidden" onChange={handleFileUpload} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!selectedBankId} className="gap-2">
            <Upload className="h-4 w-4" /> Importar Arquivo
          </Button>
          {importedTxs.length > 0 && (
            <Button onClick={saveAllImported} className="gap-2 bg-green-600 hover:bg-green-700">
              <Save className="h-4 w-4" /> Salvar {importedTxs.length} Lançamentos
            </Button>
          )}
          {importedTxs.length > 0 && (
            <Button variant="outline" onClick={autoReconcileAll} className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50">
              <CheckCircle2 className="h-4 w-4" /> Conciliação Automática
            </Button>
          )}
          <Button variant="outline" onClick={printReport} className="gap-2">
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-green-50">
          <p className="text-sm text-green-700">Entradas</p>
          <p className="text-2xl font-bold text-green-800">{formatCurrency(totals.credit)}</p>
        </Card>
        <Card className="p-4 bg-red-50">
          <p className="text-sm text-red-700">Saídas</p>
          <p className="text-2xl font-bold text-red-800">{formatCurrency(totals.debit)}</p>
        </Card>
        <Card className="p-4 bg-blue-50">
          <p className="text-sm text-blue-700">Saldo no Período</p>
          <p className="text-2xl font-bold text-blue-800">{formatCurrency(totals.balance)}</p>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar na descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={filterType} onChange={e => setFilterType(e.target.value as any)} className="w-32">
            <option value="">Todos tipos</option>
            <option value="credito">Crédito</option>
            <option value="debito">Débito</option>
          </Select>
          <Select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="w-48">
            <option value="">Todas categorias</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allTransactions.length === 0 ? (
              <TableRow><TableCell colSpan={6}><EmptyState message="Nenhum lançamento encontrado." /></TableCell></TableRow>
            ) : (
              allTransactions.map(t => {
                const isTemp = t.id.startsWith('temp-')
                return (
                  <TableRow key={t.id} className={isTemp ? 'bg-amber-50/50' : ''}>
                    <TableCell>{formatDate(t.data)}</TableCell>
                    <TableCell className="font-medium">{t.descricao}</TableCell>
                    <TableCell>
                      <Select 
                        value={t.category_id || ''} 
                        onChange={async (e) => {
                          const newCatId = e.target.value
                          if (isTemp) {
                            setImportedTxs(prev => prev.map(x => x.id === t.id ? { ...x, category_id: newCatId } : x))
                          } else {
                            await updateTx(t.id, { ...t, category_id: newCatId })
                          }
                        }}
                        className="h-8 text-xs"
                      >
                        <option value="">-- Selecione --</option>
                        {categories.filter(c => c.tipo === t.tipo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </Select>
                    </TableCell>
                    <TableCell className={t.tipo === 'credito' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {t.tipo === 'credito' ? '+' : '-'}{formatCurrency(t.valor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isTemp ? 'warning' : 'outline'}>{isTemp ? 'PENDENTE' : 'SALVO'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isTemp && (
                          <Button size="icon" variant="ghost" onClick={() => saveTransaction(t)} className="text-green-600">
                            <Save className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => {
                            setSelectedTx(t)
                            setReconcileSearch('')
                            setReconcileDialogOpen(true)
                          }} 
                          className="text-blue-600"
                          title="Vincular e dar baixa"
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => isTemp ? setImportedTxs(prev => prev.filter(x => x.id !== t.id)) : removeTx(t.id)} className="text-red-500">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={reconcileDialogOpen} onOpenChange={setReconcileDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Conciliar Transação</DialogTitle>
          </DialogHeader>
          
          {selectedTx && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold">Transação Bancária</p>
                  <p className="font-semibold">{selectedTx.descricao}</p>
                  <p className="text-sm">{formatDate(selectedTx.data)}</p>
                </div>
                <div className="text-right">
                  <p className={selectedTx.tipo === 'credito' ? 'text-green-600 font-bold text-lg' : 'text-red-600 font-bold text-lg'}>
                    {selectedTx.tipo === 'credito' ? '+' : '-'}{formatCurrency(selectedTx.valor)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Vincular a um lançamento pendente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar por descrição ou valor..." 
                    value={reconcileSearch} 
                    onChange={e => setReconcileSearch(e.target.value)} 
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {potentialMatches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum lançamento pendente encontrado{reconcileSearch ? ' com este critério' : ' com o mesmo valor'}.
                        </TableCell>
                      </TableRow>
                    ) : (
                      potentialMatches.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{formatDate(item.vencimento)}</TableCell>
                          <TableCell className="font-medium">{item.descricao}</TableCell>
                          <TableCell className="font-bold">{formatCurrency(item.valor)}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" onClick={() => handleReconcile(selectedTx, item)}>
                              Vincular e Baixar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
