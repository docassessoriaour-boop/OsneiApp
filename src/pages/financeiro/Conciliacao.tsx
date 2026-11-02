import { useState, useRef, useMemo, useEffect } from 'react'
import { useDb } from '@/hooks/useDb'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF, printReceipt } from '@/lib/pdf'
import type { Bill, Income, TransactionCategory, Patient, Invoice } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { investmentMovement, suggestCounterpart, parseBankStatement, sameStatementTransaction, matchingEntries, safeAutomaticMatch, normalizeBankText } from '@/lib/bankReconciliation'
import type { StatementTransaction as BankTransaction, ReconciliationAccount as BankAccount } from '@/lib/bankReconciliation'
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
import { Upload, FileText, X, Save, Search, Link, CheckCircle2, Pencil } from 'lucide-react'

export default function Conciliacao() {
  const { profile } = useAuth()
  const { data: bills, loading: loadingBills, error: billsError, reload: reloadBills, update: updateBill, insert: insertBill } = useDb<Bill>('bills')
  const { data: incomes, loading: loadingIncomes, error: incomesError, reload: reloadIncomes, update: updateIncome, insert: insertIncome } = useDb<Income>('incomes')
  const { data: dbTransactions, loading: loadingTransactions, error: transactionsError, reload: reloadTransactions, insert: insertTx, update: updateTx, remove: removeTx } = useDb<BankTransaction>('bank_transactions')
  const { data: bankAccounts, loading: loadingAccounts, error: accountsError, reload: reloadAccounts } = useDb<BankAccount>('bank_accounts')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')
  const { data: invoices, reload: reloadInvoices, update: updateInvoice } = useDb<Invoice>('invoices')
  const { data: patients } = useDb<Patient>('patients')
  
  const [clinic] = useClinic()
  const fileRef = useRef<HTMLInputElement>(null)
  
  const [selectedBankId, setSelectedBankId] = useState('')
  const [importedTxs, setImportedTxs] = useState<BankTransaction[]>([])
  const [filterCat, setFilterCat] = useState('')
  const [filterType, setFilterType] = useState<'' | 'credito' | 'debito'>('')
  const [importStartDate, setImportStartDate] = useState('')
  const [importEndDate, setImportEndDate] = useState('')
  const [search, setSearch] = useState('')
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false)
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null)
  const [editingTx, setEditingTx] = useState<BankTransaction | null>(null)
  const [reconcileSearch, setReconcileSearch] = useState('')
  const [newEntryCategoryId, setNewEntryCategoryId] = useState('')

  const [busy, setBusy] = useState(false)
  const processing = useRef(false)
  const [counterpartId, setCounterpartId] = useState('')
  const [dialogCounterpartId, setDialogCounterpartId] = useState('')
  const [feedback, setFeedback] = useState('')
  const dataError = billsError || incomesError || transactionsError || accountsError
  const loadingData = loadingBills || loadingIncomes || loadingTransactions || loadingAccounts || !!dataError
  const pendingImports = importedTxs.filter(t => t.bank_account_id === selectedBankId)
  const selectedMovement = selectedTx ? investmentMovement(selectedTx, bankAccounts.find(a => a.id === selectedTx.bank_account_id)) : null

  useEffect(() => {
    setCounterpartId(suggestCounterpart(bankAccounts.find(a => a.id === selectedBankId), bankAccounts))
  }, [selectedBankId, bankAccounts])

  useEffect(() => {
    setImportedTxs([]); setSelectedBankId(''); setSelectedTx(null)
    setReconcileDialogOpen(false); setFeedback('')
  }, [profile?.company_id])

  async function reloadFinancialData() {
    await Promise.all([reloadTransactions(), reloadBills(), reloadIncomes(), reloadInvoices(), reloadAccounts()])
  }

  function reconciliationError(error: unknown) {
    const detail = error as { code?: string; message?: string }
    return detail.code === 'PGRST202'
      ? 'A atualização da conciliação precisa ser ativada pela administração antes de processar o extrato.'
      : detail.message || 'Não foi possível concluir a conciliação. Tente novamente.'
  }

  async function saveAccountLink() {
    if (processing.current) return
    processing.current = true; setBusy(true)
    try {
      const { error } = await supabase.rpc('save_reconciliation_account', { p_account_id: selectedBankId, p_counterpart_id: counterpartId || null })
      if (error) throw error
      await reloadAccounts()
      setFeedback('Conta correspondente salva para as próximas importações.')
    } catch (error) { setFeedback(reconciliationError(error)) }
    finally { processing.current = false; setBusy(false) }
  }

  async function persistImported(tx: BankTransaction, item?: Income | Bill, transferAccount?: string) {
    const movement = investmentMovement(tx, bankAccounts.find(a => a.id === tx.bank_account_id))
    const otherAccount = transferAccount || (movement ? counterpartId : '')
    if (movement && !movement.validDirection) throw new Error('Confira o sentido da aplicação ou resgate. Estornos precisam de revisão.')
    if (movement && !otherAccount) throw new Error('Selecione a conta correspondente para aplicação e resgate.')
    const { data, error } = await supabase.rpc('reconcile_statement_transaction', {
      p_transaction: { ...tx, category_id: tx.category_id || null },
      p_counterpart_id: otherAccount || null,
      p_item_id: item?.id || null,
      p_create_entry: !item
    })
    if (error) throw error
    setImportedTxs(prev => prev.filter(t => t.id !== tx.id))
    return data as { result: string }
  }

  // Merge transactions
  const allTransactions = useMemo(() => {
    const list = [...dbTransactions, ...importedTxs]
    return list
      .filter(t => {
        const matchesBank = !selectedBankId || t.bank_account_id === selectedBankId
        const matchesCat = !filterCat || (filterCat === 'sem-categoria' ? (!t.category_id && !t.categoria) : (t.category_id === filterCat || t.categoria === filterCat))
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

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedBankId || processing.current) return
    try {
      const buffer = await file.arrayBuffer()
      let text: string
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer) }
      catch { text = new TextDecoder('windows-1252').decode(buffer) }
      appendStatement(text, file.name.toLowerCase().endsWith('.ofx') ? 'ofx' : 'csv')
    } catch { setFeedback('Não foi possível ler o arquivo. Confira o formato OFX ou CSV.') }
  }

  function applyAutoCategorization(newTxs: BankTransaction[]): BankTransaction[] {
    return newTxs.map(tx => {
      if (investmentMovement(tx, bankAccounts.find(a => a.id === tx.bank_account_id))) return tx
      const history = dbTransactions.filter(t => t.category_id && t.tipo === tx.tipo && !t.transfer_id
        && normalizeBankText(t.descricao) === normalizeBankText(tx.descricao))
      const ids = new Set(history.map(t => t.category_id))
      return ids.size === 1 ? { ...tx, category_id: history[0].category_id, categoria: history[0].categoria } : tx
    })
  }

  function appendStatement(text: string, format: 'ofx' | 'csv') {
    const result = parseBankStatement(text, format, selectedBankId)
    const accepted: BankTransaction[] = []
    let duplicates = 0, outside = 0
    for (const tx of result.transactions) {
      if ((importStartDate && tx.data < importStartDate) || (importEndDate && tx.data > importEndDate)) { outside++; continue }
      if ([...dbTransactions, ...importedTxs, ...accepted].some(existing => sameStatementTransaction(tx, existing))) { duplicates++; continue }
      accepted.push(tx)
    }
    setImportedTxs(prev => [...prev, ...applyAutoCategorization(accepted)])
    setFeedback(`${accepted.length} lançamento(s) importado(s). ${duplicates} duplicado(s), ${outside} fora do período e ${result.ignored} linha(s) inválida(s) ignorados.`)
  }

  async function processImported(transactions: BankTransaction[], onlyMatches = false) {
    if (processing.current || loadingData) return
    processing.current = true; setBusy(true)
    let transfers = 0, matched = 0, created = 0, duplicates = 0, review = 0
    const used = new Set<string>()
    try {
      for (const tx of transactions) {
        const movement = investmentMovement(tx, bankAccounts.find(a => a.id === tx.bank_account_id))
        if (movement && (!movement.validDirection || !counterpartId)) { review++; continue }
        const source = tx.tipo === 'credito' ? incomes : bills
        const candidates = matchingEntries(tx, source, Infinity, dbTransactions)
        const match = movement ? undefined : safeAutomaticMatch(tx, source, dbTransactions)
        // Não repetir uma baixa no mesmo lote nem criar outra conta para um candidato incerto.
        if (!movement && ((match && used.has(match.id)) || (!match && (onlyMatches || candidates.length > 0)))) { review++; continue }
        const result = await persistImported(tx, match)
        if (match) used.add(match.id)
        if (result.result === 'duplicate') duplicates++
        else if (movement) transfers++
        else if (match) matched++
        else created++
      }
      setFeedback(`${transfers} transferência(s), ${matched} baixa(s), ${created} novo(s) lançamento(s), ${duplicates} já processado(s). ${review} aguardando revisão.`)
    } catch (error) {
      setFeedback(`${reconciliationError(error)} O lote foi interrompido; os itens concluídos foram preservados e os restantes continuam pendentes.`)
    } finally {
      await reloadFinancialData()
      processing.current = false; setBusy(false)
    }
  }

  async function saveTransaction(t: BankTransaction) { await processImported([t]) }
  async function saveAllImported() { await processImported(pendingImports) }

  async function handleReconcile(tx: BankTransaction, item: Income | Bill) {
    if (processing.current) return
    if (Math.round(item.valor * 100) !== Math.round(tx.valor * 100) || item.status === 'parcial'
      || (item.bank_account_id && item.bank_account_id !== tx.bank_account_id)) {
      alert('O valor e a conta devem corresponder ao lançamento. Pagamentos parciais precisam ser registrados no financeiro.')
      return
    }
    if (tx.transfer_id || investmentMovement(tx, bankAccounts.find(a => a.id === tx.bank_account_id))) {
      alert('Concilie aplicação e resgate como transferência entre contas.')
      return
    }
    if (tx.id.startsWith('temp-')) {
      processing.current = true; setBusy(true)
      try {
        await persistImported(tx, item)
        setReconcileDialogOpen(false); setSelectedTx(null)
        setFeedback('Lançamento conciliado e financeiro atualizado.')
      } catch (error) { setFeedback(reconciliationError(error)) }
      finally { await reloadFinancialData(); processing.current = false; setBusy(false) }
      return
    }
    if (incomes.some(i => i.bank_transaction_id === tx.id) || bills.some(b => b.bank_transaction_id === tx.id)) {
      alert('Esta transação já possui vínculo financeiro. Revise o vínculo antes de alterá-lo.')
      return
    }
    try {
      let newTxId = tx.id
      
      // 3. Salvar a transação bancária se for temporária
      if (tx.id.startsWith('temp-')) {
        const cleaned = { ...tx, category_id: item.category_id || tx.category_id }
        delete (cleaned as any).id
        const newTx: any = await insertTx(cleaned)
        newTxId = newTx?.id || newTx?.[0]?.id || tx.id // Handle different return formats
        setImportedTxs(prev => prev.filter(x => x.id !== tx.id))
      } else {
        await updateTx(tx.id, { ...tx, category_id: item.category_id || tx.category_id })
      }

      // Se o item já tinha uma transação manual vinculada e estamos substituindo por uma OFX, removemos a manual
      if (item.bank_transaction_id && item.bank_transaction_id !== newTxId) {
        try {
           await removeTx(item.bank_transaction_id)
        } catch(e) {
           console.log("Old tx already deleted or not found")
        }
      }

      // 1. Marcar o item (Income ou Bill) como pago/recebido e vincular nova tx
      // Sincronizar também a categoria se o item estiver sem categoria
      const syncData = { 
        status: tx.tipo === 'credito' ? 'recebido' : 'pago', 
        bank_transaction_id: newTxId,
        bank_account_id: tx.bank_account_id || selectedBankId || null,
        payment_date: tx.data,
        ...( (!item.category_id || item.categoria === 'Sem Categoria') ? {
          category_id: tx.category_id,
          categoria: tx.categoria
        } : {})
      }

      if (tx.tipo === 'credito') {
        const income = item as Income
        await updateIncome(income.id, syncData as any)
        
        // 2. Se for uma Income vinculada a uma Invoice, marcar a Invoice como paga
        const linkedInvoice = invoices.find(inv => inv.income_id === income.id || inv.id === income.invoiceId)
        if (linkedInvoice) {
          await updateInvoice(linkedInvoice.id, { 
            status: 'pago', 
            bank_transaction_id: newTxId,
            ...((!linkedInvoice.bank_transaction_id) ? {
               // Optional: sync more fields to invoice if needed
            } : {})
          })
          
          // Solicitar impressão do recibo
          if (income.status !== 'recebido' && confirm('Lançamento conciliado e fatura quitada! Deseja gerar o recibo agora?')) {
            const patient = patients.find(p => p.id === linkedInvoice.patient_id)
            printReceipt(linkedInvoice, patient, clinic)
          }
        }
      } else {
        await updateBill(item.id, syncData as any)
      }

      setReconcileDialogOpen(false)
      setSelectedTx(null)
      alert('Conciliação realizada com sucesso! O lançamento financeiro foi vinculado e as duplicidades removidas.')
    } catch (e) {
      console.error(e)
      alert('Erro ao realizar conciliação.')
    }
  }

  async function handleDeleteTx(t: BankTransaction) {
    const isTemp = t.id.startsWith('temp-')
    if (!isTemp && !confirm(t.transfer_id ? 'Excluir as duas movimentações desta transferência? Os saldos das duas contas serão atualizados.' : 'Deseja excluir permanentemente este lançamento do banco de dados?')) return

    try {
      if (t.transfer_id) {
        const { error } = await supabase.rpc('delete_reconciled_transfer', { p_transfer_id: t.transfer_id })
        if (error) throw error
        await reloadFinancialData()
      } else if (isTemp) {
        setImportedTxs(prev => prev.filter(x => x.id !== t.id))
      } else {
        // 1. Procurar e desvincular qualquer Receita, Conta a Pagar ou Fatura que aponte para esta transação
        const linkedIncomes = incomes.filter(i => i.bank_transaction_id === t.id)
        for (const inc of linkedIncomes) {
          await updateIncome(inc.id, { bank_transaction_id: null as any })
        }

        const linkedBills = bills.filter(b => b.bank_transaction_id === t.id)
        for (const bill of linkedBills) {
          await updateBill(bill.id, { bank_transaction_id: null as any })
        }

        const linkedInvoices = invoices.filter(inv => inv.bank_transaction_id === t.id)
        for (const inv of linkedInvoices) {
          await updateInvoice(inv.id, { bank_transaction_id: null as any })
        }

        // 2. Agora sim, excluir a transação do banco
        await removeTx(t.id)
      }
    } catch (e: any) {
      console.error(e)
      alert('Erro ao excluir transação: ' + (e.message || 'Erro desconhecido'))
    }
  }

  async function handleCreateAndReconcile() {
    if (!selectedTx) return
    if (!newEntryCategoryId) {
      alert('Selecione uma categoria para o novo lançamento.')
      return
    }

    if (selectedMovement || selectedTx.transfer_id) {
      alert('Concilie esta movimentação como transferência entre contas.')
      return
    }
    if (selectedTx.id.startsWith('temp-')) {
      if (processing.current) return
      processing.current = true; setBusy(true)
      try {
        await persistImported({ ...selectedTx, category_id: newEntryCategoryId,
          categoria: categories.find(c => c.id === newEntryCategoryId)?.nome })
        setReconcileDialogOpen(false); setSelectedTx(null); setNewEntryCategoryId('')
        setFeedback('Novo lançamento criado e conciliado.')
      } catch (error) { setFeedback(reconciliationError(error)) }
      finally { await reloadFinancialData(); processing.current = false; setBusy(false) }
      return
    }
    if (incomes.some(i => i.bank_transaction_id === selectedTx.id) || bills.some(b => b.bank_transaction_id === selectedTx.id)) {
      alert('Esta transação já possui vínculo financeiro.')
      return
    }
    try {
      const isIncome = selectedTx.tipo === 'credito'
      const categoryName = categories.find(c => c.id === newEntryCategoryId)?.nome || ''

      let newTxId = selectedTx.id
      
      // Salvar a transação bancária se for temporária
      if (selectedTx.id.startsWith('temp-')) {
        const cleaned = { ...selectedTx, category_id: newEntryCategoryId, categoria: categoryName }
        delete (cleaned as any).id
        const newTx: any = await insertTx(cleaned)
        newTxId = newTx?.id || newTx?.[0]?.id || selectedTx.id
        setImportedTxs(prev => prev.filter(x => x.id !== selectedTx.id))
      } else {
        await updateTx(selectedTx.id, { ...selectedTx, category_id: newEntryCategoryId, categoria: categoryName })
      }

      if (isIncome) {
        await insertIncome({
          descricao: selectedTx.descricao,
          categoria: categoryName,
          category_id: newEntryCategoryId,
          valor: selectedTx.valor,
          vencimento: selectedTx.data,
          status: 'recebido',
          payment_date: selectedTx.data,
          bank_account_id: selectedTx.bank_account_id,
          bank_transaction_id: newTxId
        })
      } else {
        await insertBill({
          descricao: selectedTx.descricao,
          categoria: categoryName,
          category_id: newEntryCategoryId,
          valor: selectedTx.valor,
          vencimento: selectedTx.data,
          status: 'pago',
          payment_date: selectedTx.data,
          bank_account_id: selectedTx.bank_account_id,
          bank_transaction_id: newTxId
        })
      }

      setReconcileDialogOpen(false)
      setSelectedTx(null)
      setNewEntryCategoryId('')
      alert('Novo lançamento criado e conciliado com sucesso!')
    } catch (e: any) {
      console.error(e)
      alert('Erro ao criar lançamento.')
    }
  }

  async function handleSaveEdit() {
    if (!editingTx) return
    try {
      if (editingTx.id.startsWith('temp-')) {
        setImportedTxs(prev => prev.map(x => x.id === editingTx.id ? editingTx : x))
      } else {
        await updateTx(editingTx.id, editingTx)
        
        // Sincronizar edição (descrição, data, valor, categoria) com Conta a Pagar vinculada
        const linkedBill = bills.find(b => b.bank_transaction_id === editingTx.id)
        if (linkedBill) {
          await updateBill(linkedBill.id, { 
             ...linkedBill,
             descricao: editingTx.descricao,
             valor: editingTx.valor,
             vencimento: editingTx.data,
             payment_date: editingTx.data,
             category_id: editingTx.category_id,
             categoria: editingTx.categoria
          })
        }
        
        // Sincronizar edição (descrição, data, valor, categoria) com Conta a Receber vinculada
        const linkedIncome = incomes.find(i => i.bank_transaction_id === editingTx.id)
        if (linkedIncome) {
          await updateIncome(linkedIncome.id, { 
             ...linkedIncome,
             descricao: editingTx.descricao,
             valor: editingTx.valor,
             vencimento: editingTx.data,
             payment_date: editingTx.data,
             category_id: editingTx.category_id,
             categoria: editingTx.categoria
          })
        }
      }
      setEditingTx(null)
    } catch (e) {
      alert('Erro ao editar transação.')
    }
  }

  async function autoReconcileAll() { await processImported(pendingImports, true) }

  async function reconcileTransfer() {
    if (!selectedTx || !dialogCounterpartId || processing.current) return
    if (!selectedTx.id.startsWith('temp-')) {
      setFeedback('Para corrigir uma movimentação antiga já salva, revise seus vínculos financeiros antes de importar novamente.')
      return
    }
    processing.current = true; setBusy(true)
    try {
      await persistImported(selectedTx, undefined, dialogCounterpartId)
      setReconcileDialogOpen(false); setSelectedTx(null)
      setFeedback('Transferência conciliada nas duas contas, sem gerar receita ou despesa.')
    } catch (error) { setFeedback(reconciliationError(error)) }
    finally { await reloadFinancialData(); processing.current = false; setBusy(false) }
  }

  const potentialMatches = useMemo(() => {
    if (!selectedTx) return []
    const isIncome = selectedTx.tipo === 'credito'
    const source = isIncome ? incomes : bills
    
    return matchingEntries(selectedTx, source, Infinity, dbTransactions).filter(item =>
      (selectedTx.id.startsWith('temp-') || !item.bank_transaction_id) && (!reconcileSearch ||
        normalizeBankText(item.descricao).includes(normalizeBankText(reconcileSearch)) ||
        item.valor.toString().includes(reconcileSearch)))
  }, [selectedTx, incomes, bills, dbTransactions, reconcileSearch])

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
    printPDF('Relatório de Movimentação Financeira', html, clinic)
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Conciliação Bancária"
        description="Importe o extrato, reconheça aplicações e resgates e concilie o financeiro"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Label className="text-xs">Conta Bancária</Label>
          <Select value={selectedBankId} disabled={busy} onChange={e => setSelectedBankId(e.target.value)}>
            <option value="">-- Selecione a Conta --</option>
            {bankAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nome}</option>)}
          </Select>
        </div>
        <div className="w-40">
          <Label className="text-xs">Importar de</Label>
          <Input type="date" value={importStartDate} onChange={e => setImportStartDate(e.target.value)} />
        </div>
        <div className="w-40">
          <Label className="text-xs">Importar até</Label>
          <Input type="date" value={importEndDate} onChange={e => setImportEndDate(e.target.value)} />
        </div>
        
        <div className="flex items-end gap-2 pt-5">
          <input type="file" ref={fileRef} accept=".csv,.ofx" className="hidden" onChange={handleFileUpload} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!selectedBankId || busy || loadingData} className="gap-2">
            <Upload className="h-4 w-4" /> Importar Arquivo
          </Button>
          {pendingImports.length > 0 && (
            <Button disabled={busy || loadingData} onClick={saveAllImported} className="gap-2 bg-green-600 hover:bg-green-700">
              <Save className="h-4 w-4" /> {busy ? 'Processando...' : `Processar ${pendingImports.length} Lançamentos`}
            </Button>
          )}
          {pendingImports.length > 0 && (
            <Button disabled={busy || loadingData} variant="outline" onClick={autoReconcileAll} className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50">
              <CheckCircle2 className="h-4 w-4" /> Conciliar Correspondências
            </Button>
          )}
          <Button variant="outline" onClick={printReport} className="gap-2">
            <FileText className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      {selectedBankId && (
        <Card className="p-4 space-y-3">
          <div><p className="font-semibold">Aplicações e resgates entre contas</p>
            <p className="text-sm text-muted-foreground">Selecione a outra conta da empresa. A conta de aplicação deve estar cadastrada como Investimento ou Poupança. O sistema registra a saída e a entrada e reconhece a contrapartida quando seu extrato for importado.</p></div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64"><Label>Conta correspondente</Label>
              <Select disabled={busy} value={counterpartId} onChange={e => setCounterpartId(e.target.value)}>
                <option value="">-- Selecione para aplicações e resgates --</option>
                {bankAccounts.filter(a => a.id !== selectedBankId).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </Select>
            </div>
            <Button disabled={busy} variant="outline" onClick={saveAccountLink}>Salvar vínculo</Button>
          </div>
          <p className="text-sm text-muted-foreground">Processar também baixa correspondências seguras e cria novos lançamentos sem correspondência. Valores com mais de uma possibilidade ficam para revisão. Rendimentos, impostos e tarifas continuam separados das transferências.</p>
        </Card>
      )}
      {dataError && <div role="alert" className="rounded-lg border border-red-300 p-4 text-sm flex items-center justify-between gap-3"><p>Não foi possível carregar todos os dados financeiros. Atualize antes de conciliar.</p><Button variant="outline" onClick={reloadFinancialData}>Atualizar dados</Button></div>}
      {feedback && <div role="status" className="rounded-lg border bg-muted/30 p-4 text-sm">{feedback}</div>}

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
          <Select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="h-9">
            <option value="">Todas Categorias</option>
            <option value="sem-categoria">Sem Categoria</option>
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
                      {t.transfer_id || investmentMovement(t, bankAccounts.find(a => a.id === t.bank_account_id)) ? (
                        <span className="text-sm">{t.transfer_id ? 'Transferência entre contas' : 'Aplicação / Resgate'}{t.counterpart_account_id && <span className="block text-xs text-muted-foreground">{bankAccounts.find(a => a.id === t.counterpart_account_id)?.nome}</span>}</span>
                      ) : <Select
                        disabled={busy}
                        value={t.category_id || ''} 
                        onChange={async (e) => {
                          const newCatId = e.target.value
                          const catName = categories.find(c => c.id === newCatId)?.nome || ''
                          if (isTemp) {
                            setImportedTxs(prev => prev.map(x => x.id === t.id ? { ...x, category_id: newCatId, categoria: catName } : x))
                          } else {
                            await updateTx(t.id, { ...t, category_id: newCatId, categoria: catName })
                            
                            // Sincronizar categoria com Conta a Pagar vinculada
                            const linkedBill = bills.find(b => b.bank_transaction_id === t.id)
                            if (linkedBill) {
                              await updateBill(linkedBill.id, { ...linkedBill, category_id: newCatId, categoria: catName })
                            }
                            
                            // Sincronizar categoria com Conta a Receber vinculada
                            const linkedIncome = incomes.find(i => i.bank_transaction_id === t.id)
                            if (linkedIncome) {
                              await updateIncome(linkedIncome.id, { ...linkedIncome, category_id: newCatId, categoria: catName })
                            }
                          }
                        }}
                        className="h-8 text-xs"
                      >
                        <option value="">-- Selecione --</option>
                        {categories.filter(c => c.tipo === (t.tipo === 'credito' ? 'receita' : 'despesa')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </Select>}
                    </TableCell>
                    <TableCell className={t.tipo === 'credito' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                      {t.tipo === 'credito' ? '+' : '-'}{formatCurrency(t.valor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isTemp ? 'warning' : 'outline'}>{isTemp ? 'PENDENTE' : t.transfer_id ? (t.reconciliation_key ? 'CONCILIADO' : 'AGUARDANDO EXTRATO') : 'SALVO'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isTemp && (
                          <Button size="icon" variant="ghost" disabled={busy || loadingData} onClick={() => saveTransaction(t)} className="text-green-600" title="Salvar no banco">
                            <Save className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" disabled={busy || !!t.transfer_id} onClick={() => setEditingTx(t)} className="text-muted-foreground" title="Editar">
                           <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => {
                            setSelectedTx(t)
                            setDialogCounterpartId(t.bank_account_id === selectedBankId ? counterpartId : suggestCounterpart(bankAccounts.find(a => a.id === t.bank_account_id), bankAccounts))
                            setNewEntryCategoryId('')
                            setReconcileSearch('')
                            setReconcileDialogOpen(true)
                          }} 
                          className="text-blue-600"
                          disabled={busy || loadingData || !!t.transfer_id}
                          title="Conciliar lançamento ou transferência"
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" disabled={busy} onClick={() => handleDeleteTx(t)} className="text-red-500">
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

              <div className="rounded-lg border p-4 space-y-3">
                <Label>Transferência entre contas da empresa</Label>
                <p className="text-sm text-muted-foreground">{selectedTx.tipo === 'debito' ? 'Saída da conta deste extrato e entrada na conta abaixo.' : 'Entrada na conta deste extrato e saída da conta abaixo.'} Não gera receita ou despesa.</p>
                {selectedMovement && !selectedMovement.validDirection && <p className="text-sm text-red-600">O sentido da movimentação não corresponde ao tipo da conta. Confira a conta selecionada e eventuais estornos.</p>}
                <Select disabled={busy} value={dialogCounterpartId} onChange={e => setDialogCounterpartId(e.target.value)}>
                  <option value="">-- Outra conta da empresa --</option>
                  {bankAccounts.filter(a => a.id !== selectedTx.bank_account_id).map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </Select>
                <Button disabled={busy || !dialogCounterpartId || (!!selectedMovement && !selectedMovement.validDirection)} onClick={reconcileTransfer}>Conciliar como transferência</Button>
              </div>
              {!selectedMovement && <>
              <div className="space-y-2">
                <Label>Vincular a um lançamento existente</Label>
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
                          Nenhum lançamento compatível encontrado{reconcileSearch ? ' com este critério' : ' com o mesmo valor'}.
                        </TableCell>
                      </TableRow>
                    ) : (
                      potentialMatches.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{formatDate(item.vencimento)}</TableCell>
                          <TableCell className="font-medium">
                            {item.descricao}
                          </TableCell>
                          <TableCell className="font-bold">{formatCurrency(item.valor)}</TableCell>
                          <TableCell className="text-right">
                            <Button disabled={busy} size="sm" onClick={() => handleReconcile(selectedTx, item)}>
                              Vincular e Baixar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="pt-4 border-t space-y-3">
                <Label className="text-muted-foreground font-bold uppercase text-xs">Ou criar um novo lançamento a partir desta transação</Label>
                <div className="flex gap-2 items-center">
                  <Select value={newEntryCategoryId} onChange={e => setNewEntryCategoryId(e.target.value)} className="flex-1">
                    <option value="">-- Selecione a categoria --</option>
                    {categories.filter(c => c.tipo === (selectedTx.tipo === 'credito' ? 'receita' : 'despesa')).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Select>
                  <Button disabled={busy} onClick={handleCreateAndReconcile} className="whitespace-nowrap bg-green-600 hover:bg-green-700">
                    Criar Lançamento e Baixar
                  </Button>
                </div>
              </div>
              </>}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTx} onOpenChange={(open) => !open && setEditingTx(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Transação</DialogTitle></DialogHeader>
          {editingTx && (
            <div className="grid gap-4">
              <div><Label>Descrição</Label><Input value={editingTx.descricao} onChange={e => setEditingTx({...editingTx, descricao: e.target.value})} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Data</Label><Input type="date" value={editingTx.data} onChange={e => setEditingTx({...editingTx, data: e.target.value})} className="mt-1" /></div>
                <div><Label>Valor</Label><Input type="number" step="0.01" value={editingTx.valor} onChange={e => setEditingTx({...editingTx, valor: Number(e.target.value)})} className="mt-1" /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTx(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
