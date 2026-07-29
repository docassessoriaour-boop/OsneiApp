import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF, printReceipt } from '@/lib/pdf'
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
import { Pencil, Trash2, FileText, Loader2, ArrowUp, ArrowDown, Split, Receipt, CheckCircle, Percent } from 'lucide-react'

const emptyIncome: Omit<Income, 'id'> = {
  descricao: '', 
  categoria: '', 
  category_id: '',
  valor: 0, 
  vencimento: new Date().toISOString().slice(0, 10), 
  status: 'pendente',
  payment_date: '',
  bank_account_id: '',
  source_bank_account_id: '',
  paid_by: '',
  paid_by_phone: '',
  paid_by_document: ''
}

const FINE_RATE = 0.02
const MONTHLY_INTEREST_RATE = 0.01

function calculateLateFee(valorBase: number, vencimento: string, dataAtualizacao: string) {
  const base = Number(valorBase) || 0
  const dueDate = new Date(`${vencimento}T00:00:00`)
  const updateDate = new Date(`${dataAtualizacao}T00:00:00`)
  const diffMs = updateDate.getTime() - dueDate.getTime()
  const diasAtraso = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  const multa = diasAtraso > 0 ? base * FINE_RATE : 0
  const juros = diasAtraso > 0 ? base * MONTHLY_INTEREST_RATE * (diasAtraso / 30) : 0
  const valorAtualizado = Number((base + multa + juros).toFixed(2))

  return {
    diasAtraso,
    multa: Number(multa.toFixed(2)),
    juros: Number(juros.toFixed(2)),
    valorAtualizado
  }
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
  const [categoryFilter, setCategoryFilter] = useState('')
  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10))
  const [selectedPatient, setSelectedPatient] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [partialDialogOpen, setPartialDialogOpen] = useState(false)
  const [totalDialogOpen, setTotalDialogOpen] = useState(false)
  const [partialIncome, setPartialIncome] = useState<Income | null>(null)
  const [totalIncome, setTotalIncome] = useState<Income | null>(null)
  const [lateFeeDialogOpen, setLateFeeDialogOpen] = useState(false)
  const [lateFeeIncome, setLateFeeIncome] = useState<Income | null>(null)
  const [lateFeeForm, setLateFeeForm] = useState({
    valorBase: 0,
    dataAtualizacao: new Date().toISOString().slice(0, 10)
  })
  const [partialForm, setPartialForm] = useState({ 
    valorPago: 0, 
    dataPagamento: new Date().toISOString().slice(0, 10), 
    bank_account_id: '',
    paid_by: '',
    paid_by_phone: '',
    paid_by_document: ''
  })
  const [totalForm, setTotalForm] = useState({
    dataPagamento: new Date().toISOString().slice(0, 10),
    bank_account_id: '',
    paid_by: '',
    paid_by_phone: '',
    paid_by_document: ''
  })
  const [form, setForm] = useState(emptyIncome)
  type SortKey = 'descricao' | 'categoria' | 'valor' | 'vencimento' | 'pagamento' | 'status'
  const [sortKey, setSortKey] = useState<SortKey>('vencimento')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  const findPatientForIncome = (income: Income) => {
    const relInv = invoices.find(inv => inv.income_id === income.id)
    if (relInv && relInv.patient_id) {
      return patients.find(p => p.id === relInv.patient_id)
    }
    return patients.find(p => income.descricao.toLowerCase().includes(p.nome.toLowerCase()))
  }

  const getPayerOptions = (income: Income) => {
    const p = findPatientForIncome(income)
    if (!p) return []
    const options = [
      { name: p.nome, phone: p.telefone_responsavel || '', document: p.cpf || '', type: 'Paciente' },
      { name: p.responsavel, phone: p.telefone_responsavel || '', document: p.resp_cpf || '', type: 'Responsável (Principal)' }
    ]
    if (p.outros_responsaveis) {
      p.outros_responsaveis.forEach(r => {
        options.push({ name: r.nome, phone: r.telefone || '', document: r.cpf || '', type: `Responsável (${r.nome})` })
      })
    }
    return options.filter(o => o.name)
  }

  const sendWhatsAppReceipt = (income: Income, valor: number, payer: string, phone: string) => {
    let finalPhone = phone;
    let finalPayer = payer;

    if (!finalPhone) {
      const p = findPatientForIncome(income)
      if (p) {
        finalPhone = p.telefone_responsavel || '';
        finalPayer = finalPayer || p.responsavel || p.nome;
      }
    }

    const userInputPhone = window.prompt("Confirme ou digite o número do WhatsApp (com DDD):", finalPhone);
    if (userInputPhone === null) return; // Usuário cancelou
    finalPhone = userInputPhone;

    const date = new Date().toLocaleDateString('pt-BR')
    const message = `Olá! Confirmamos o recebimento de ${formatCurrency(valor)} referente a ${income.descricao}, pago por ${finalPayer} em ${date}. Obrigado! - ${clinic.nome_fantasia || clinic.razao_social}`
    const encoded = encodeURIComponent(message)
    const cleanPhone = finalPhone.replace(/\D/g, '')
    if (!cleanPhone || cleanPhone.length < 10) {
      alert("Número de telefone inválido ou não informado.")
      return
    }
    window.open(`https://wa.me/55${cleanPhone}?text=${encoded}`, '_blank')
  }

  const handlePrintReceipt = (income: Income) => {
    const patient = findPatientForIncome(income)
    const pseudoInvoice: Invoice = {
      id: income.id,
      client_name: income.descricao.split(':')[1]?.trim() || income.descricao,
      client_document: income.paid_by_document || '',
      date_issued: income.vencimento,
      due_date: income.vencimento,
      total_amount: income.valor,
      status: 'pago',
      items: [{ description: income.descricao, quantity: 1, price: income.valor }],
      payment_date: income.payment_date,
      paid_by: income.paid_by,
      paid_by_phone: income.paid_by_phone,
      paid_by_document: income.paid_by_document
    }
    printReceipt(pseudoInvoice, patient, clinic)
  }
  
  // State for delete confirmation dialog
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // States for split category
  const [isSplit, setIsSplit] = useState(false)
  const [splitForm, setSplitForm] = useState({
    category2_id: '',
    valor2: 0
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (sortKey !== column) return <ArrowUp className="h-3 w-3 opacity-25" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  function getSortValue(i: Income, key: SortKey) {
    if (key === 'descricao') return i.descricao || ''
    if (key === 'categoria') return i.categoria || ''
    if (key === 'valor') return Number(i.valor || 0)
    if (key === 'vencimento') return i.vencimento || ''
    if (key === 'pagamento') return i.payment_date || ''
    return i.status || ''
  }

  const filtered = incomes.filter(i => {
    const matchesSearch = i.descricao.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'todos' || i.status === statusFilter
    const matchesPatient = !selectedPatient || i.descricao.toLowerCase().includes(selectedPatient.toLowerCase())
    const matchesCategory = !categoryFilter || i.category_id === categoryFilter
    
    let matchesPeriod = true
    if (startDate) matchesPeriod = matchesPeriod && i.vencimento >= startDate
    if (endDate) matchesPeriod = matchesPeriod && i.vencimento <= endDate
    
    return matchesSearch && matchesStatus && matchesPatient && matchesPeriod && matchesCategory
  }).sort((a, b) => {
    const aValue = getSortValue(a, sortKey)
    const bValue = getSortValue(b, sortKey)
    const result = typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), 'pt-BR', { numeric: true })
    return sortDir === 'asc' ? result : -result
  })

  function openNew() { 
    setForm(emptyIncome); 
    setEditingId(null); 
    setIsSplit(false);
    setSplitForm({ category2_id: '', valor2: 0 });
    setDialogOpen(true) 
  }

  function openEdit(i: Income) { 
    setForm({
      ...i,
      source_bank_account_id: (i as any).source_bank_account_id || '',
      paid_by: i.paid_by || '',
      paid_by_phone: i.paid_by_phone || '',
      paid_by_document: i.paid_by_document || ''
    }); 
    setEditingId(i.id); 
    setIsSplit(false);
    setSplitForm({ category2_id: '', valor2: 0 });
    setDialogOpen(true) 
  }

  function openPartial(i: Income) {
    setPartialIncome(i)
    setPartialForm({
      valorPago: 0,
      dataPagamento: new Date().toISOString().slice(0, 10),
      bank_account_id: '',
      paid_by: '',
      paid_by_phone: '',
      paid_by_document: ''
    })
    setPartialDialogOpen(true)
  }

  function openTotal(i: Income) {
    setTotalIncome(i)
    setTotalForm({
      dataPagamento: new Date().toISOString().slice(0, 10),
      bank_account_id: '',
      paid_by: '',
      paid_by_phone: '',
      paid_by_document: ''
    })
    setTotalDialogOpen(true)
  }

  function openLateFee(i: Income) {
    setLateFeeIncome(i)
    setLateFeeForm({
      valorBase: i.valor,
      dataAtualizacao: new Date().toISOString().slice(0, 10)
    })
    setLateFeeDialogOpen(true)
  }

  const lateFeePreview = lateFeeIncome
    ? calculateLateFee(lateFeeForm.valorBase, lateFeeIncome.vencimento, lateFeeForm.dataAtualizacao)
    : null

  async function handleApplyLateFee() {
    if (!lateFeeIncome || !lateFeePreview) return
    if (lateFeePreview.diasAtraso <= 0) {
      alert('Esta conta ainda não está em atraso na data informada.')
      return
    }

    try {
      await update(lateFeeIncome.id, {
        ...lateFeeIncome,
        valor: lateFeePreview.valorAtualizado
      } as any)

      const relatedInvoice = invoices.find(inv => inv.income_id === lateFeeIncome.id)
      if (relatedInvoice) {
        const currentTotal = relatedInvoice.total_amount || lateFeeForm.valorBase || 1
        await updateInvoice(relatedInvoice.id, {
          total_amount: lateFeePreview.valorAtualizado,
          items: (relatedInvoice.items || []).map(item => ({
            ...item,
            price: Number(((item.price / currentTotal) * lateFeePreview.valorAtualizado).toFixed(2))
          }))
        })
      }

      setLateFeeDialogOpen(false)
      alert('Valor a receber atualizado com multa e juros.')
    } catch (error: any) {
      console.error('Erro ao aplicar multa e juros:', error)
      alert(`Erro ao aplicar multa e juros: ${error.message || 'Erro desconhecido'}`)
    }
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
        category_id: partialIncome.category_id,
        paid_by: partialForm.paid_by,
        paid_by_phone: partialForm.paid_by_phone,
        paid_by_document: partialForm.paid_by_document
      } as any)

      // 2. Atualizar a conta atual para refletir o valor pago
      await update(partialIncome.id, {
        ...partialIncome,
        valor: partialForm.valorPago,
        status: 'recebido',
        payment_date: partialForm.dataPagamento,
        bank_account_id: partialForm.bank_account_id,
        bank_transaction_id: bt.id,
        descricao: `${partialIncome.descricao} (Parcial)`,
        paid_by: partialForm.paid_by,
        paid_by_phone: partialForm.paid_by_phone,
        paid_by_document: partialForm.paid_by_document
      } as any)

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
          items: (relatedInvoice.items || []).map(i => ({...i, price: (i.price / relatedInvoice.total_amount) * partialForm.valorPago})),
          paid_by: partialForm.paid_by,
          paid_by_phone: partialForm.paid_by_phone,
          paid_by_document: partialForm.paid_by_document
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
      if (confirm("Baixa parcial efetuada com sucesso! Deseja enviar o recibo via WhatsApp?")) {
        sendWhatsAppReceipt(partialIncome, partialForm.valorPago, partialForm.paid_by, partialForm.paid_by_phone)
      }
    } catch (e: any) {
      console.error(e)
      alert("Erro ao realizar baixa parcial: " + e.message)
    }
  }

  const handleTotalPayment = async () => {
    if (!totalIncome) return
    if (!totalForm.bank_account_id) {
      alert("Selecione uma conta bancária.")
      return
    }

    try {
      const bt = await insertBankTransaction({
        data: totalForm.dataPagamento,
        descricao: `Recebimento: ${totalIncome.descricao}`,
        valor: totalIncome.valor,
        tipo: 'credito',
        origem: 'manual',
        bank_account_id: totalForm.bank_account_id,
        categoria: totalIncome.categoria,
        category_id: totalIncome.category_id,
        paid_by: totalForm.paid_by,
        paid_by_phone: totalForm.paid_by_phone,
        paid_by_document: totalForm.paid_by_document
      } as any)

      await update(totalIncome.id, {
        ...totalIncome,
        status: 'recebido',
        payment_date: totalForm.dataPagamento,
        bank_account_id: totalForm.bank_account_id,
        bank_transaction_id: bt.id,
        paid_by: totalForm.paid_by,
        paid_by_phone: totalForm.paid_by_phone,
        paid_by_document: totalForm.paid_by_document
      } as any)

      const relatedInvoice = invoices.find(inv => inv.income_id === totalIncome.id)
      if (relatedInvoice) {
        await updateInvoice(relatedInvoice.id, {
          status: 'pago',
          payment_date: totalForm.dataPagamento,
          bank_account_id: totalForm.bank_account_id,
          bank_transaction_id: bt.id,
          paid_by: totalForm.paid_by,
          paid_by_phone: totalForm.paid_by_phone,
          paid_by_document: totalForm.paid_by_document
        })
      }

      setTotalDialogOpen(false)
      if (confirm("Baixa total efetuada com sucesso! Deseja enviar o recibo via WhatsApp?")) {
        sendWhatsAppReceipt(totalIncome, totalIncome.valor, totalForm.paid_by, totalForm.paid_by_phone)
      }
    } catch (e: any) {
      console.error(e)
      alert("Erro ao realizar baixa total: " + e.message)
    }
  }

  async function handleSave() {
    if (!form.descricao) return
    try {
      const { source_bank_account_id: sourceBankAccountId, ...formData } = form as any
      const payload = { 
        ...formData,
        valor: Number(Number(form.valor).toFixed(2)),
        vencimento: form.vencimento || null,
        payment_date: form.payment_date || null,
        category_id: form.category_id || null,
        bank_account_id: form.bank_account_id || null,
        bank_transaction_id: form.bank_transaction_id || null
      }

      if (isSplit) {
        if (!splitForm.category2_id || splitForm.valor2 <= 0) {
          alert("Para ratear em 2 categorias, preencha a segunda categoria e o valor correspondente.")
          return
        }
        if (splitForm.valor2 >= form.valor) {
          alert("O valor da segunda categoria deve ser menor que o valor total.")
          return
        }
        // Adjust the first payload's value
        payload.valor = Number((form.valor - splitForm.valor2).toFixed(2))
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
          category_id: payload.category_id,
          paid_by: payload.paid_by,
          paid_by_phone: payload.paid_by_phone,
          paid_by_document: payload.paid_by_document
        }

        if (btId) {
          await updateBankTransaction(btId, btData)
        } else {
          const bt = await insertBankTransaction(btData as any)
          btId = bt.id
          payload.bank_transaction_id = btId
        }

        // Se for Resgate de Aplicação e tiver conta origem, criar o lançamento de saída na outra conta
        const isResgate = payload.category_id === '372443ce-38f3-4cd4-9188-a2053a2cf150' || payload.categoria === 'Resgate Aplicação Financeira'
        const srcId = sourceBankAccountId
        if (isResgate && srcId) {
           await insertBankTransaction({
             data: btData.data,
             descricao: `Resgate (Saída via Contas a Receber): ${payload.descricao}`,
             valor: payload.valor,
             tipo: 'debito',
             origem: 'manual',
             bank_account_id: srcId,
             categoria: 'Resgate Aplicação Financeira',
             category_id: payload.category_id,
             status: 'pago'
           } as any)
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
        
        if (isSplit) {
          const cat2 = categories.find(c => c.id === splitForm.category2_id)
          await insert({
            ...payload,
            id: undefined,
            descricao: `${payload.descricao} (Rateio 2/2)`,
            valor: splitForm.valor2,
            category_id: splitForm.category2_id,
            categoria: cat2?.nome || '',
            bank_transaction_id: null
          } as any)
        }
      } else {
        await insert(payload)
        
        if (isSplit) {
          const cat2 = categories.find(c => c.id === splitForm.category2_id)
          await insert({
            ...payload,
            id: undefined,
            descricao: `${payload.descricao} (Rateio 2/2)`,
            valor: splitForm.valor2,
            category_id: splitForm.category2_id,
            categoria: cat2?.nome || '',
            bank_transaction_id: null
          } as any)
        }
      }
      setDialogOpen(false)
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar receita: ${error.message || 'Erro desconhecido'}`)
    }
  }

  function handleDeleteClick(id: string) {
    setDeleteConfirmId(id)
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return
    try {
      const relInv = invoices.find(inv => inv.income_id === deleteConfirmId)
      if (relInv) {
        await removeInvoice(relInv.id)
      }
      await remove(deleteConfirmId)
      setDeleteConfirmId(null)
    } catch (error: any) {
      console.error('Erro ao excluir:', error)
      alert('Erro ao excluir: ' + (error.message || 'Erro desconhecido'))
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

          <div className="w-full md:w-48">
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="h-9">
                <option value="">Todas Categorias</option>
                {categories.filter(c => c.tipo === 'receita').map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </Select>
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
              variant="outline" 
              size="sm" 
              onClick={() => {
                const now = new Date()
                const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10)
                const end = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)
                setStartDate(start)
                setEndDate(end)
              }}
              className="h-9"
            >
              Mês Anterior
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { setStartDate(''); setEndDate(''); setSearch(''); setStatusFilter('todos'); setSelectedPatient(''); setCategoryFilter('') }}
              className="h-9 text-muted-foreground"
            >
              Limpar
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selectedIds.length === filtered.length}
                  onChange={(e) => setSelectedIds(e.target.checked ? filtered.map(i => i.id) : [])}
                  className="h-4 w-4"
                />
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors select-none" onClick={() => toggleSort('descricao')}>
                <div className="flex items-center gap-1">Descrição <SortIcon column="descricao" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors select-none" onClick={() => toggleSort('categoria')}>
                <div className="flex items-center gap-1">Categoria <SortIcon column="categoria" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors select-none" onClick={() => toggleSort('valor')}>
                <div className="flex items-center gap-1">Valor <SortIcon column="valor" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors select-none" onClick={() => toggleSort('vencimento')}>
                <div className="flex items-center gap-1">Vencimento <SortIcon column="vencimento" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors select-none" onClick={() => toggleSort('pagamento')}>
                <div className="flex items-center gap-1">Pagamento <SortIcon column="pagamento" /></div>
              </TableHead>
              <TableHead className="cursor-pointer hover:text-primary transition-colors select-none" onClick={() => toggleSort('status')}>
                <div className="flex items-center gap-1">Status <SortIcon column="status" /></div>
              </TableHead>
              <TableHead>
                Ações
                {selectedIds.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{selectedIds.length} selecionada(s)</span>
                )}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8}><EmptyState message="Nenhuma receita" /></TableCell></TableRow>
            ) : (
              filtered.map(i => (
                <TableRow key={i.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(i.id)}
                      onChange={(e) => setSelectedIds(prev => e.target.checked ? [...prev, i.id] : prev.filter(id => id !== i.id))}
                      className="h-4 w-4"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{i.descricao}</TableCell>
                  <TableCell>{i.categoria}</TableCell>
                  <TableCell className="font-semibold text-green-600">{formatCurrency(i.valor)}</TableCell>
                  <TableCell>{formatDate(i.vencimento)}</TableCell>
                  <TableCell>{i.payment_date ? formatDate(i.payment_date) : '—'}</TableCell>
                  <TableCell>{statusBadge(i.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {i.status === 'recebido' && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handlePrintReceipt(i)} title="Imprimir Recibo" className="text-blue-600">
                            <Receipt className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => sendWhatsAppReceipt(i, i.valor, i.paid_by || '', i.paid_by_phone || '')} title="WhatsApp Recibo">
                            <FileText className="h-4 w-4 text-green-600" />
                          </Button>
                        </>
                      )}
                      {(i.status === 'pendente' || i.status === 'vencido') && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openTotal(i)} title="Baixa Total">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openPartial(i)} title="Baixa Parcial">
                            <Split className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openLateFee(i)} title="Calcular Multa e Juros">
                            <Percent className="h-4 w-4 text-orange-600" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEdit(i)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(i.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
                <Label>{isSplit ? 'Categoria 1' : 'Categoria'}</Label>
                <Select 
                  value={form.category_id || ''} 
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="mt-1"
                >
                  <option value="">-- Selecione --</option>
                  {categories.filter(c => c.tipo === 'receita').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Select>
              </div>
              <div>
                <Label>{isSplit ? 'Valor 1' : 'Valor Total'}</Label>
                <Input 
                  type="number" 
                  value={isSplit ? Number((form.valor - splitForm.valor2).toFixed(2)) : form.valor} 
                  onChange={(e) => {
                    const newVal = Number(e.target.value)
                    if (isSplit) {
                      setForm({ ...form, valor: newVal + splitForm.valor2 })
                    } else {
                      setForm({ ...form, valor: newVal })
                    }
                  }} 
                  className="mt-1" 
                />
              </div>
            </div>

            {isSplit && (
              <div className="grid grid-cols-2 gap-4 bg-green-50/50 p-3 rounded-lg border border-green-100">
                <div>
                  <Label>Categoria 2</Label>
                  <Select 
                    value={splitForm.category2_id} 
                    onChange={(e) => setSplitForm({ ...splitForm, category2_id: e.target.value })}
                    className="mt-1"
                  >
                    <option value="">-- Selecione --</option>
                    {categories.filter(c => c.tipo === 'receita').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Valor 2</Label>
                  <Input 
                    type="number" 
                    value={splitForm.valor2} 
                    onChange={(e) => setSplitForm({ ...splitForm, valor2: Number(e.target.value) })} 
                    className="mt-1" 
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-green-600 font-medium">
                    Valor Total: {formatCurrency(form.valor)} (Soma das 2 categorias)
                  </p>
                </div>
              </div>
            )}

            {!isSplit && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => setIsSplit(true)}
              >
                <Split className="h-4 w-4" /> Ratear em 2 categorias
              </Button>
            )}

            {isSplit && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full gap-2 text-destructive hover:bg-red-50"
                onClick={() => setIsSplit(false)}
              >
                Cancelar Rateio
              </Button>
            )}
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

                  <div className="col-span-2">
                    <Label>Responsável pelo Pagamento (Para o Recibo)</Label>
                    <Select
                      value={form.paid_by}
                      onChange={(e) => {
                        const opt = getPayerOptions(form as any).find(o => o.name === e.target.value)
                        setForm({ 
                          ...form, 
                          paid_by: e.target.value, 
                          paid_by_phone: opt?.phone || '',
                          paid_by_document: opt?.document || ''
                        })
                      }}
                      className="mt-1"
                    >
                      <option value="">-- Selecionar Pagador --</option>
                      {getPayerOptions(form as any).map((o, idx) => (
                        <option key={idx} value={o.name}>{o.name} ({o.type})</option>
                      ))}
                    </Select>
                    {form.paid_by_phone && (
                      <p className="text-[10px] text-muted-foreground mt-1 px-1">WhatsApp: {form.paid_by_phone}</p>
                    )}
                  </div>

                 {(form.category_id === '372443ce-38f3-4cd4-9188-a2053a2cf150' || form.categoria === 'Resgate Aplicação Financeira') && (
                    <div className="col-span-2 bg-green-50 p-3 rounded-lg border border-green-100">
                      <Label className="text-green-700 font-medium">Conta de Origem (Aplicação/Resgate)</Label>
                      <Select
                        value={(form as any).source_bank_account_id || ''}
                        onChange={(e) => setForm({ ...form, source_bank_account_id: e.target.value })}
                        className="mt-1 bg-white"
                      >
                        <option value="">-- Selecionar Conta de Origem --</option>
                        {bankAccounts.map(ba => (
                          <option key={ba.id} value={ba.id}>{ba.nome} {ba.banco ? `(${ba.banco})` : ''}</option>
                        ))}
                      </Select>
                      <p className="text-[10px] text-green-600 mt-1">Ao salvar como recebido, o sistema gerará automaticamente uma saída nesta conta.</p>
                    </div>
                 )}
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

              <div>
                <Label>Responsável pelo Pagamento</Label>
                <Select
                  value={partialForm.paid_by}
                  onChange={(e) => {
                    const opt = getPayerOptions(partialIncome).find(o => o.name === e.target.value)
                    setPartialForm({ 
                      ...partialForm, 
                      paid_by: e.target.value, 
                      paid_by_phone: opt?.phone || '',
                      paid_by_document: opt?.document || ''
                    })
                  }}
                  className="mt-1"
                >
                  <option value="">-- Selecione o Payer --</option>
                  {getPayerOptions(partialIncome).map((o, idx) => (
                    <option key={idx} value={o.name}>{o.name} ({o.type})</option>
                  ))}
                </Select>
                {partialForm.paid_by_phone && (
                  <p className="text-[10px] text-muted-foreground mt-1">WhatsApp: {partialForm.paid_by_phone}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPartialDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handlePartialPayment}>Confirmar Baixa Parcial</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={totalDialogOpen} onOpenChange={setTotalDialogOpen}>
        <DialogHeader>
          <DialogTitle>Baixa Total</DialogTitle>
          <DialogClose onClose={() => setTotalDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {totalIncome && (
            <div className="grid gap-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm mb-2">
                <p><strong>Conta:</strong> {totalIncome.descricao}</p>
                <p><strong>Valor Total:</strong> {formatCurrency(totalIncome.valor)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data do Recebimento</Label>
                  <Input 
                    type="date" 
                    value={totalForm.dataPagamento} 
                    onChange={(e) => setTotalForm({ ...totalForm, dataPagamento: e.target.value })} 
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label>Banco / Destino</Label>
                  <Select
                    value={totalForm.bank_account_id}
                    onChange={(e) => setTotalForm({ ...totalForm, bank_account_id: e.target.value })}
                    className="mt-1"
                  >
                    <option value="">-- Selecione o Banco --</option>
                    {bankAccounts.map(ba => (
                      <option key={ba.id} value={ba.id}>{ba.nome} {ba.banco ? `(${ba.banco})` : ''}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label>Responsável pelo Pagamento</Label>
                <Select
                  value={totalForm.paid_by}
                  onChange={(e) => {
                    const opt = getPayerOptions(totalIncome).find(o => o.name === e.target.value)
                    setTotalForm({ 
                      ...totalForm, 
                      paid_by: e.target.value, 
                      paid_by_phone: opt?.phone || '',
                      paid_by_document: opt?.document || ''
                    })
                  }}
                  className="mt-1"
                >
                  <option value="">-- Selecione o Payer --</option>
                  {getPayerOptions(totalIncome).map((o, idx) => (
                    <option key={idx} value={o.name}>{o.name} ({o.type})</option>
                  ))}
                </Select>
                {totalForm.paid_by_phone && (
                  <p className="text-[10px] text-muted-foreground mt-1">WhatsApp: {totalForm.paid_by_phone}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTotalDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleTotalPayment}>Confirmar Baixa Total</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={lateFeeDialogOpen} onOpenChange={setLateFeeDialogOpen}>
        <DialogHeader>
          <DialogTitle>Calcular Multa e Juros</DialogTitle>
          <DialogClose onClose={() => setLateFeeDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {lateFeeIncome && lateFeePreview && (
            <div className="grid gap-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <p><strong>Conta:</strong> {lateFeeIncome.descricao}</p>
                <p><strong>Vencimento:</strong> {formatDate(lateFeeIncome.vencimento)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor Inicial</Label>
                  <Input type="number" step="0.01" value={lateFeeForm.valorBase} onChange={(e) => setLateFeeForm({ ...lateFeeForm, valorBase: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label>Atualizar até</Label>
                  <Input type="date" value={lateFeeForm.dataAtualizacao} onChange={(e) => setLateFeeForm({ ...lateFeeForm, dataAtualizacao: e.target.value })} className="mt-1" />
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex justify-between"><span>Dias em atraso</span><strong>{lateFeePreview.diasAtraso}</strong></div>
                <div className="flex justify-between"><span>Multa 2%</span><strong>{formatCurrency(lateFeePreview.multa)}</strong></div>
                <div className="flex justify-between"><span>Juros 1% ao mês</span><strong>{formatCurrency(lateFeePreview.juros)}</strong></div>
                <div className="flex justify-between border-t pt-2 text-base"><span>Valor atualizado</span><strong className="text-green-600">{formatCurrency(lateFeePreview.valorAtualizado)}</strong></div>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLateFeeDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleApplyLateFee}>Atualizar Valor a Receber</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <DialogClose onClose={() => setDeleteConfirmId(null)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Deseja excluir esta receita? O faturamento (recibo) vinculado também será excluído. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmDelete}>Excluir</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
