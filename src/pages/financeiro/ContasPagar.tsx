import { useState } from 'react'
import { addMonths } from 'date-fns'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import type { Bill, TransactionCategory, BankAccount, Termination } from '@/lib/types'
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
import { Pencil, Trash2, FileText, Loader2, Filter, ArrowUp, ArrowDown, Split, CheckCircle, Percent } from 'lucide-react'

const emptyBill: Omit<Bill, 'id'> = {
  descricao: '', 
  categoria: '', 
  category_id: '',
  valor: 0, 
  vencimento: new Date().toISOString().slice(0, 10), 
  status: 'pendente',
  payment_date: '',
  bank_account_id: '',
  destination_bank_account_id: ''
}

export default function ContasPagar() {
  const { data: bills, loading, insert, update, remove } = useDb<Bill>('bills')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')
  const { data: entities, insert: insertEntity } = useDb<any>('entities')
  const { data: bankAccounts } = useDb<BankAccount>('bank_accounts')
  const { insert: insertBankTransaction, update: updateBankTransaction, remove: removeBankTransaction } = useDb<any>('bank_transactions')
  const { update: updateTermination } = useDb<Termination>('terminations')
  const { update: updatePayroll } = useDb<any>('payrolls')
  
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago' | 'vencido'>('todos')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nfeDialogOpen, setNfeDialogOpen] = useState(false)
  const [loadingXml, setLoadingXml] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [partialDialogOpen, setPartialDialogOpen] = useState(false)
  const [totalDialogOpen, setTotalDialogOpen] = useState(false)
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [partialBill, setPartialBill] = useState<Bill | null>(null)
  const [totalBill, setTotalBill] = useState<Bill | null>(null)
  const [adjustBill, setAdjustBill] = useState<Bill | null>(null)
  const [totalForm, setTotalForm] = useState({ dataPagamento: new Date().toISOString().slice(0, 10), bank_account_id: '' })
  const [partialForm, setPartialForm] = useState({ valorPago: 0, dataPagamento: new Date().toISOString().slice(0, 10), bank_account_id: '' })
  const [adjustForm, setAdjustForm] = useState({ dataBase: new Date().toISOString().slice(0, 10), multaPercent: 2, jurosMesPercent: 1, desconto: 0 })
  const [form, setForm] = useState(emptyBill)
  const [parcelas, setParcelas] = useState(1)
  const [contaFixa, setContaFixa] = useState(false)
  const [repeticoesFixas, setRepeticoesFixas] = useState(12)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10))
  type SortKey = 'descricao' | 'categoria' | 'valor' | 'vencimento' | 'pagamento' | 'status'
  const [sortKey, setSortKey] = useState<SortKey>('vencimento')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  
  // States for split category
  const [isSplit, setIsSplit] = useState(false)
  const [splitForm, setSplitForm] = useState({
    category2_id: '',
    valor2: 0
  })
  
  const [nfeForm, setNfeForm] = useState({
    chaveAcesso: '',
    fornecedor: '',
    documento: '',
    dataEmissao: new Date().toISOString().slice(0, 10),
    vencimento: new Date().toISOString().slice(0, 10),
    valorOriginal: 0,
    categoria_id: ''
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

  function getSortValue(b: Bill, key: SortKey) {
    if (key === 'descricao') return b.descricao || ''
    if (key === 'categoria') return b.categoria || ''
    if (key === 'valor') return Number(b.valor || 0)
    if (key === 'vencimento') return b.vencimento || ''
    if (key === 'pagamento') return (b as any).payment_date || ''
    return b.status || ''
  }

  const filtered = bills.filter(b => {
    const matchesSearch = b.descricao.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'todos' || b.status === statusFilter
    const matchesCategory = !categoryFilter || b.category_id === categoryFilter
    
    let matchesDate = true
    if (startDate) matchesDate = matchesDate && b.vencimento >= startDate
    if (endDate) matchesDate = matchesDate && b.vencimento <= endDate
    
    return matchesSearch && matchesStatus && matchesCategory && matchesDate
  }).sort((a, b) => {
    const aValue = getSortValue(a, sortKey)
    const bValue = getSortValue(b, sortKey)
    const result = typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), 'pt-BR', { numeric: true })
    return sortDir === 'asc' ? result : -result
  })

  function openNew() { 
    setForm(emptyBill); 
    setEditingId(null); 
    setParcelas(1); 
    setContaFixa(false);
    setRepeticoesFixas(12);
    setIsSplit(false);
    setSplitForm({ category2_id: '', valor2: 0 });
    setDialogOpen(true) 
  }

  function openEdit(b: Bill) {
    setForm({
      descricao: b.descricao,
      categoria: b.categoria || '',
      category_id: b.category_id || '',
      valor: b.valor,
      vencimento: b.vencimento ? new Date(b.vencimento).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: b.status,
      payment_date: b.payment_date || '',
      bank_account_id: b.bank_account_id || '',
      bank_transaction_id: b.bank_transaction_id || '',
      destination_bank_account_id: (b as any).destination_bank_account_id || ''
    })
    setParcelas(1)
    setEditingId(b.id)
    setIsSplit(false)
    setSplitForm({ category2_id: '', valor2: 0 })
    setDialogOpen(true)
  }

  function openPartial(b: Bill) {
    setPartialBill(b)
    setPartialForm({
      valorPago: 0,
      dataPagamento: new Date().toISOString().slice(0, 10),
      bank_account_id: ''
    })
    setPartialDialogOpen(true)
  }

  function openTotal(b: Bill) {
    setTotalBill(b)
    setTotalForm({
      dataPagamento: new Date().toISOString().slice(0, 10),
      bank_account_id: ''
    })
    setTotalDialogOpen(true)
  }

  function openAdjust(b: Bill) {
    setAdjustBill(b)
    setAdjustForm({ dataBase: new Date().toISOString().slice(0, 10), multaPercent: 2, jurosMesPercent: 1, desconto: 0 })
    setAdjustDialogOpen(true)
  }

  const adjustPreview = (() => {
    if (!adjustBill) return null
    const due = new Date(`${adjustBill.vencimento}T00:00:00`)
    const base = new Date(`${adjustForm.dataBase}T00:00:00`)
    const days = Math.max(0, Math.floor((base.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)))
    const multa = days > 0 ? adjustBill.valor * (adjustForm.multaPercent / 100) : 0
    const juros = days > 0 ? adjustBill.valor * (adjustForm.jurosMesPercent / 100) * (days / 30) : 0
    const total = Math.max(0, adjustBill.valor + multa + juros - adjustForm.desconto)
    return { days, multa: Number(multa.toFixed(2)), juros: Number(juros.toFixed(2)), total: Number(total.toFixed(2)) }
  })()

  async function handleApplyAdjust() {
    if (!adjustBill || !adjustPreview) return
    await update(adjustBill.id, {
      ...adjustBill,
      valor: adjustPreview.total,
      descricao: `${adjustBill.descricao} (juros/desconto aplicado)`
    } as any)
    setAdjustDialogOpen(false)
  }

  const handlePartialPayment = async () => {
    if (!partialBill || partialForm.valorPago <= 0 || partialForm.valorPago >= partialBill.valor) {
      alert("O valor pago deve ser maior que zero e menor que o valor total da conta.")
      return
    }
    if (!partialForm.bank_account_id) {
      alert("Selecione uma conta bancária.")
      return
    }

    try {
      const remainingValue = partialBill.valor - partialForm.valorPago

      // 1. Criar transação bancária
      const bt = await insertBankTransaction({
        data: partialForm.dataPagamento,
        descricao: `Pagamento Parcial: ${partialBill.descricao}`,
        valor: partialForm.valorPago,
        tipo: 'debito',
        origem: 'manual',
        bank_account_id: partialForm.bank_account_id,
        categoria: partialBill.categoria,
        category_id: partialBill.category_id
      } as any)

      // 2. Atualizar a conta atual para refletir o valor pago
      await update(partialBill.id, {
        ...partialBill,
        valor: partialForm.valorPago,
        status: 'pago',
        payment_date: partialForm.dataPagamento,
        bank_account_id: partialForm.bank_account_id,
        bank_transaction_id: bt.id,
        descricao: `${partialBill.descricao} (Parcial)`
      })

      // Se for uma rescisão, dar baixa nela também
      if ((partialBill as any).termination_id) {
        await updateTermination((partialBill as any).termination_id, { status: 'pago' })
      }
      // Se for uma folha de pagamento, dar baixa na folha também
      if ((partialBill as any).payroll_id) {
        await updatePayroll((partialBill as any).payroll_id, { status: 'pago' })
      }

      // 3. Criar a nova conta com o saldo restante
      await insert({
        ...partialBill,
        id: undefined, // ensure new ID
        valor: remainingValue,
        status: 'pendente',
        descricao: `${partialBill.descricao} (Restante)`,
        payment_date: null,
        bank_account_id: null,
        bank_transaction_id: null
      } as any)

      setPartialDialogOpen(false)
      alert("Baixa parcial efetuada com sucesso!")
    } catch (e: any) {
      console.error(e)
      alert("Erro ao realizar baixa parcial: " + e.message)
    }
  }

  const handleTotalPayment = async () => {
    if (!totalBill) return
    if (!totalForm.bank_account_id) {
      alert("Selecione uma conta bancária.")
      return
    }

    try {
      const bt = await insertBankTransaction({
        data: totalForm.dataPagamento,
        descricao: `Pagamento: ${totalBill.descricao}`,
        valor: totalBill.valor,
        tipo: 'debito',
        origem: 'manual',
        bank_account_id: totalForm.bank_account_id,
        categoria: totalBill.categoria,
        category_id: totalBill.category_id
      } as any)

      await update(totalBill.id, {
        ...totalBill,
        status: 'pago',
        payment_date: totalForm.dataPagamento,
        bank_account_id: totalForm.bank_account_id,
        bank_transaction_id: bt.id
      })

      if ((totalBill as any).termination_id) {
        await updateTermination((totalBill as any).termination_id, { status: 'pago' })
      }
      // Se for uma folha de pagamento, dar baixa na folha também
      if ((totalBill as any).payroll_id) {
        await updatePayroll((totalBill as any).payroll_id, { status: 'pago' })
      }

      setTotalDialogOpen(false)
      alert("Baixa total efetuada com sucesso!")
    } catch (e: any) {
      console.error(e)
      alert("Erro ao realizar baixa total: " + e.message)
    }
  }

  const handleXmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoadingXml(true)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const xmlString = evt.target?.result as string
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xmlString, "text/xml")
        
        const infNFe = xmlDoc.getElementsByTagName('infNFe')[0]
        if (!infNFe) {
          alert("XML não aparenta ser uma NF-e válida.")
          return
        }

        const emit = infNFe.getElementsByTagName('emit')[0]
        const supplierName = emit?.getElementsByTagName('xNome')[0]?.textContent || ''
        const supplierCnpj = emit?.getElementsByTagName('CNPJ')[0]?.textContent || ''

        const ide = infNFe.getElementsByTagName('ide')[0]
        const dhEmi = ide?.getElementsByTagName('dhEmi')[0]?.textContent || ''
        const issueDate = dhEmi ? dhEmi.substring(0, 10) : new Date().toISOString().slice(0, 10)

        const totalInvoice = parseFloat(infNFe.getElementsByTagName('vNF')[0]?.textContent || '0')

        setNfeForm(prev => ({
          ...prev,
          fornecedor: supplierName,
          documento: supplierCnpj,
          dataEmissao: issueDate,
          vencimento: issueDate, // Pode ser alterado pelo usuário
          valorOriginal: totalInvoice
        }))
      } catch (error) {
        console.error('Erro ao ler XML', error)
        alert('Extensão ou formato XML inválido.')
      } finally {
        setLoadingXml(false)
      }
    }
    reader.readAsText(file)
  }

  const handleChaveAcessoChange = async (val: string) => {
    const limpo = val.replace(/\D/g, '')
    const atualizada = { ...nfeForm, chaveAcesso: val } 
    
    if (limpo.length === 44) {
      const yy = limpo.substring(2, 4)
      const mm = limpo.substring(4, 6)
      const cnpj = limpo.substring(6, 20)
      
      const anoCompleto = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`
      const issueDate = `${anoCompleto}-${mm}-01`
      
      atualizada.documento = cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      if (atualizada.dataEmissao === new Date().toISOString().slice(0, 10)) {
         atualizada.dataEmissao = issueDate
         atualizada.vencimento = issueDate
      }
      
      // Procura na base local primeiro
      const supplier = entities?.find((e: any) => e.type === 'supplier' && e.document && String(e.document).replace(/\D/g, '') === cnpj)
      if (supplier) {
        atualizada.fornecedor = supplier.name
        setNfeForm(atualizada)
      } else {
        // Se não tiver local, preenche o CNPJ imediatamente e tenta buscar na Receita
        setNfeForm({ ...atualizada, fornecedor: 'Buscando na Receita...' })
        try {
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
          if (res.ok) {
            const data = await res.json()
            setNfeForm(prev => ({ ...prev, fornecedor: data.razao_social || data.nome_fantasia || '' }))
          } else {
            setNfeForm(atualizada)
          }
        } catch {
          setNfeForm(atualizada)
        }
      }
    } else {
      setNfeForm(atualizada)
    }
  }

  async function handleSaveNfe() {
    if (!nfeForm.fornecedor || nfeForm.valorOriginal <= 0) {
      alert("Preencha o fornecedor e o valor.")
      return
    }

    try {
      let supplier = entities?.find((e: any) => e.type === 'supplier' && (e.document === nfeForm.documento || e.name === nfeForm.fornecedor))
      
      if (!supplier) {
        supplier = await insertEntity({
          name: nfeForm.fornecedor,
          type: 'supplier',
          document: nfeForm.documento
        })
      }

      const categoria = categories.find(c => c.id === nfeForm.categoria_id) || categories.find(c => c.nome.toLowerCase().includes('compra'))
      
      await insert({
        descricao: `Lançamento NF: ${nfeForm.fornecedor}${nfeForm.chaveAcesso ? ` - Chave: ${nfeForm.chaveAcesso}` : ''}`,
        categoria: categoria?.nome || 'Despesa Variável',
        category_id: categoria?.id || '',
        valor: Number(nfeForm.valorOriginal.toFixed(2)),
        vencimento: nfeForm.vencimento || null,
        payment_date: null,
        status: 'pendente'
      } as any)

      setNfeDialogOpen(false)
      alert("Despesa gerada com sucesso via NF!")
    } catch (e) {
      console.error(e)
      alert("Erro ao salvar conta NF")
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
        bank_account_id: (form as any).bank_account_id || null,
        bank_transaction_id: (form as any).bank_transaction_id || null,
        destination_bank_account_id: (form as any).destination_bank_account_id || null
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
        payload.categoria = categories.find(c => c.id === payload.category_id)?.nome || (payload.categoria || '')
      }
      
      let btId = (payload as any).bank_transaction_id

      if (payload.status === 'pago' && (payload as any).bank_account_id) {
        const btData = {
          data: (payload as any).payment_date || payload.vencimento,
          descricao: `Pagamento: ${payload.descricao}`,
          valor: payload.valor,
          tipo: 'debito' as const,
          origem: 'manual' as const,
          bank_account_id: (payload as any).bank_account_id,
          categoria: payload.categoria,
          category_id: payload.category_id
        }

        if (btId) {
          await updateBankTransaction(btId, btData)
        } else {
          const bt = await insertBankTransaction(btData as any)
          btId = bt.id
          ;(payload as any).bank_transaction_id = btId
        }

        // Se for Aplicação Financeira e tiver conta destino, criar o lançamento de entrada na outra conta
        const isAplicacao = payload.category_id === '2b84eef7-af3a-404f-b3c1-d9b1d668c478' || payload.categoria === 'Aplicação Financeira'
        const destId = (payload as any).destination_bank_account_id
        if (isAplicacao && destId) {
           await insertBankTransaction({
             data: btData.data,
             descricao: `Aplicação (Entrada via Contas a Pagar): ${payload.descricao}`,
             valor: payload.valor,
             tipo: 'credito',
             origem: 'manual',
             bank_account_id: destId,
             categoria: 'Aplicação Financeira',
             category_id: payload.category_id,
             status: 'recebido'
           } as any)
        }
      } else if (btId) {
        await removeBankTransaction(btId)
        ;(payload as any).bank_transaction_id = null
      }

      // Remove from payload before sending to Supabase because the column might not exist
      delete (payload as any).destination_bank_account_id

      const repeatCount = contaFixa ? repeticoesFixas : parcelas

      if (editingId) {
        if (repeatCount > 1) {
          const promises = []
          const baseDate = new Date(`${payload.vencimento || new Date().toISOString().slice(0, 10)}T12:00:00Z`)
          
          await update(editingId, {
            ...payload,
            descricao: contaFixa ? payload.descricao : `${payload.descricao} (1/${repeatCount})`
          })

          for (let i = 1; i < repeatCount; i++) {
            const installmentDate = addMonths(baseDate, i)
            const installmentPayload = {
              ...payload,
              descricao: contaFixa ? payload.descricao : `${payload.descricao} (${i + 1}/${repeatCount})`,
              vencimento: installmentDate.toISOString().slice(0, 10),
            }
            promises.push(insert(installmentPayload))
          }
          await Promise.all(promises)
        } else {
          await update(editingId, payload)
          
          // Se for uma rescisão e estiver sendo paga agora, dar baixa nela também
          if (payload.status === 'pago' && (payload as any).termination_id) {
            await updateTermination((payload as any).termination_id, { status: 'pago' })
          }
          // Se for uma folha de pagamento, dar baixa na folha também
          if (payload.status === 'pago' && (payload as any).payroll_id) {
            await updatePayroll((payload as any).payroll_id, { status: 'pago' })
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
        }
      } else {
        if (repeatCount > 1) {
          const promises = []
          const baseDate = new Date(`${payload.vencimento || new Date().toISOString().slice(0, 10)}T12:00:00Z`)
          for (let i = 0; i < repeatCount; i++) {
            const installmentDate = addMonths(baseDate, i)
            const installmentPayload = {
              ...payload,
              descricao: contaFixa ? payload.descricao : `${payload.descricao} (${i + 1}/${repeatCount})`,
              vencimento: installmentDate.toISOString().slice(0, 10),
            }
            promises.push(insert(installmentPayload))
          }
          await Promise.all(promises)
        } else {
          const insertedBill = await insert(payload)
          
          // Se for uma rescisão e já estiver sendo inserida como paga, dar baixa nela também
          if (payload.status === 'pago' && (payload as any).termination_id) {
             await updateTermination((payload as any).termination_id, { status: 'pago' })
          }
          // Se for uma folha de pagamento, dar baixa na folha também
          if (payload.status === 'pago' && (payload as any).payroll_id) {
            await updatePayroll((payload as any).payroll_id, { status: 'pago' })
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
        }
      }
      setDialogOpen(false)
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar conta: ${error.message || 'Erro desconhecido'}`)
    }
  }

  function handleDeleteClick(id: string) {
    setDeleteConfirmId(id)
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return
    try {
      await remove(deleteConfirmId)
      setDeleteConfirmId(null)
    } catch (error: any) {
      console.error('Erro ao excluir:', error)
      alert('Erro ao excluir: ' + (error.message || 'Erro desconhecido'))
    }
  }

  const statusBadge = (status: Bill['status']) => {
    const map = { pendente: 'warning', pago: 'success', vencido: 'destructive' } as const
    const labels = { pendente: 'Pendente', pago: 'Pago', vencido: 'Vencido' }
    return <Badge variant={map[status]}>{labels[status]}</Badge>
  }

  function printAnalyticalReport() {
    const total = filtered.reduce((s, b) => s + b.valor, 0)
    const rows = filtered.map(b => `<tr><td>${b.descricao}</td><td>${b.categoria}</td><td class="text-right">${formatCurrencyPDF(b.valor)}</td><td>${formatDatePDF(b.vencimento)}</td><td>${(b as any).payment_date ? formatDatePDF((b as any).payment_date) : '—'}</td><td>${b.status}</td></tr>`).join('')
    printPDF('Relatório Analítico de Contas a Pagar', `
      <table><thead><tr><th>Descrição</th><th>Categoria</th><th class="text-right">Valor</th><th>Vencimento</th><th>Pagamento</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="divider"></div>
      <div style="text-align:right;font-weight:700;">Total Geral: ${formatCurrencyPDF(total)}</div>
    `, clinic)
  }

  function printSyntheticReport() {
    const grouped = filtered.reduce((acc, b) => {
      const cat = b.categoria || 'Sem Categoria'
      acc[cat] = (acc[cat] || 0) + b.valor
      return acc
    }, {} as Record<string, number>)

    const total = Object.values(grouped).reduce((s, v) => s + v, 0)
    const rows = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1]) 
      .map(([cat, val]) => `<tr><td>${cat}</td><td class="text-right">${formatCurrencyPDF(val)}</td><td class="text-right">${((val/total)*100).toFixed(1)}%</td></tr>`)
      .join('')

    printPDF('Relatório Sintético de Contas a Pagar', `
      <table><thead><tr><th>Categoria</th><th class="text-right">Total Acumulado</th><th class="text-right">%</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="divider"></div>
      <div style="text-align:right;font-weight:700;">Total Geral: ${formatCurrencyPDF(total)}</div>
    `, clinic)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar</h1>
          <p className="text-muted-foreground">Gerenciamento de despesas e obrigações</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printSyntheticReport} className="gap-2"><FileText className="h-4 w-4" /> PDF Sintético</Button>
          <Button variant="outline" onClick={printAnalyticalReport} className="gap-2"><FileText className="h-4 w-4" /> PDF Analítico</Button>
          <Button variant="secondary" onClick={() => setNfeDialogOpen(true)}>Despesa via NF-e</Button>
          <Button onClick={openNew}>Nova Conta</Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4 items-end">
          <div className="flex-1 w-full">
            <Label className="text-xs text-muted-foreground">Buscar</Label>
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por descrição..." />
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
                {categories.filter(c => c.tipo === 'despesa').map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </Select>
          </div>
          <div className="w-full md:w-48">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="h-9">
                <option value="todos">Todos Status</option>
                <option value="pendente">Pendentes</option>
                <option value="pago">Pagos</option>
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
              onClick={() => { setStartDate(''); setEndDate(''); setSearch(''); setStatusFilter('todos'); setCategoryFilter('') }}
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
                  onChange={(e) => setSelectedIds(e.target.checked ? filtered.map(b => b.id) : [])}
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
              <TableRow><TableCell colSpan={8}><EmptyState message="Nenhum lançamento encontrado." /></TableCell></TableRow>
            ) : (
              filtered.map(b => (
                <TableRow key={b.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(b.id)}
                      onChange={(e) => setSelectedIds(prev => e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id))}
                      className="h-4 w-4"
                    />
                  </TableCell>
                  <TableCell className="font-medium">{b.descricao}</TableCell>
                  <TableCell>{b.categoria}</TableCell>
                  <TableCell className="font-semibold text-red-600">{formatCurrency(b.valor)}</TableCell>
                  <TableCell>{formatDate(b.vencimento)}</TableCell>
                  <TableCell>{(b as any).payment_date ? formatDate((b as any).payment_date) : '—'}</TableCell>
                  <TableCell>{statusBadge(b.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(b.status === 'pendente' || b.status === 'vencido') && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openTotal(b)} title="Baixa Total">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openPartial(b)} title="Baixa Parcial">
                            <Split className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openAdjust(b)} title="Juros e Descontos">
                            <Percent className="h-4 w-4 text-orange-600" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(b.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogTitle>{editingId ? 'Editar Conta' : 'Nova Conta a Pagar'}</DialogTitle>
          <DialogClose onClose={() => setDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div><Label>Descrição</Label><Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="mt-1" placeholder="Ex: Aluguel mensal" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isSplit ? 'Categoria 1' : 'Categoria'}</Label>
                <Select 
                  value={form.category_id || ''} 
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="mt-1"
                >
                  <option value="">-- Selecione --</option>
                  {categories.filter(c => c.tipo === 'despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
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
              <div className="grid grid-cols-2 gap-4 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <div>
                  <Label>Categoria 2</Label>
                  <Select 
                    value={splitForm.category2_id} 
                    onChange={(e) => setSplitForm({ ...splitForm, category2_id: e.target.value })}
                    className="mt-1"
                  >
                    <option value="">-- Selecione --</option>
                    {categories.filter(c => c.tipo === 'despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
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
                  <p className="text-[10px] text-blue-600 font-medium">
                    Valor Total: {formatCurrency(form.valor)} (Soma das 2 categorias)
                  </p>
                </div>
              </div>
            )}

            {!isSplit && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
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
                 const newStatus = e.target.value as Bill['status'];
                 setForm({ 
                   ...form, 
                   status: newStatus,
                   payment_date: newStatus === 'pago' && !(form as any).payment_date ? new Date().toISOString().slice(0, 10) : (form as any).payment_date
                 })
               }} className="mt-1"><option value="pendente">Pendente</option><option value="pago">Pago</option><option value="vencido">Vencido</option></Select></div>
            </div>

            {(form as any).status === 'pago' && (
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <Label>Data do Pagamento</Label>
                    <Input 
                      type="date" 
                      value={(form as any).payment_date || ''} 
                      onChange={(e) => setForm({ ...form, payment_date: e.target.value })} 
                      className="mt-1" 
                    />
                 </div>
                 <div>
                    <Label>Banco / Origem</Label>
                    <Select
                      value={(form as any).bank_account_id || ''}
                      onChange={(e) => setForm({ ...form, bank_account_id: e.target.value })}
                      className="mt-1"
                    >
                      <option value="">-- Selecionar Banco --</option>
                      {bankAccounts.map(ba => (
                        <option key={ba.id} value={ba.id}>{ba.nome} {ba.banco ? `(${ba.banco})` : ''}</option>
                      ))}
                    </Select>
                 </div>
                 
                 {(form.category_id === '2b84eef7-af3a-404f-b3c1-d9b1d668c478' || form.categoria === 'Aplicação Financeira') && (
                    <div className="col-span-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                      <Label className="text-blue-700 font-medium">Conta de Destino (Aplicação)</Label>
                      <Select
                        value={(form as any).destination_bank_account_id || ''}
                        onChange={(e) => setForm({ ...form, destination_bank_account_id: e.target.value })}
                        className="mt-1 bg-white"
                      >
                        <option value="">-- Selecionar Conta de Destino --</option>
                        {bankAccounts.map(ba => (
                          <option key={ba.id} value={ba.id}>{ba.nome} {ba.banco ? `(${ba.banco})` : ''}</option>
                        ))}
                      </Select>
                      <p className="text-[10px] text-blue-600 mt-1">Ao salvar como pago, o sistema gerará automaticamente uma entrada nesta conta.</p>
                    </div>
                 )}
               </div>
            )}
            
            <div>
              <Label>Qtd. de Parcelas</Label>
              <Input 
                type="number" 
                min={1} 
                max={360} 
                value={parcelas} 
                onChange={(e) => setParcelas(Number(e.target.value))} 
                disabled={contaFixa}
                className="mt-1 w-1/3" 
              />
              <p className="text-xs text-muted-foreground mt-1">
                {editingId 
                  ? "Se for > 1, converterá esta conta na parcela 1 e irá gerar as demais paras os meses seguintes."
                  : "Gera repetições lançando 1 mês para frente cada."}
              </p>
            </div>
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={contaFixa}
                onChange={(e) => setContaFixa(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="flex-1">
                Conta fixa mensal
                <span className="block text-xs text-muted-foreground">Repete o lançamento todo mês sem numerar como parcela.</span>
              </span>
            </label>
            {contaFixa && (
              <div>
                <Label>Repetir por quantos meses</Label>
                <Input
                  type="number"
                  min={1}
                  max={360}
                  value={repeticoesFixas}
                  onChange={(e) => setRepeticoesFixas(Number(e.target.value))}
                  className="mt-1 w-1/3"
                />
              </div>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={nfeDialogOpen} onOpenChange={setNfeDialogOpen}>
        <DialogHeader>
          <DialogTitle>Lançamento via NF-e (Manual ou XML)</DialogTitle>
          <DialogClose onClose={() => setNfeDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          <div className="grid gap-4">
            <div className="bg-muted/30 p-3 rounded-lg border">
              <Label htmlFor="xml-upload-financeiro" className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 py-2 px-4 rounded-md font-medium text-sm transition-colors flex items-center justify-center gap-2">
                {loadingXml ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {loadingXml ? 'Lendo Arquivo...' : 'Preencher Importando Arquivo XML'}
              </Label>
              <Input id="xml-upload-financeiro" type="file" accept=".xml" className="hidden" onChange={handleXmlUpload} />
              <p className="text-xs text-center mt-2 text-muted-foreground">Opcional: Importe um XML para preencher os campos automaticamente abaixo.</p>
            </div>
            
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Chave de Acesso (NF-e ou NF-C)</Label>
                  <Input 
                    value={nfeForm.chaveAcesso} 
                    onChange={e => handleChaveAcessoChange(e.target.value)} 
                    placeholder="Digite ou cole os números da chave..." 
                  />
                  {nfeForm.chaveAcesso && nfeForm.chaveAcesso.replace(/\D/g, '').length < 44 && (
                     <p className="text-xs text-orange-500">A chave deve ter 44 dígitos numéricos.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Fornecedor (Razão Social)</Label>
                    <Input value={nfeForm.fornecedor} onChange={e => setNfeForm({...nfeForm, fornecedor: e.target.value})} className="mt-1" placeholder="Nome da empresa" />
                  </div>
                  <div>
                    <Label>CNPJ / CPF</Label>
                    <Input value={nfeForm.documento} onChange={e => setNfeForm({...nfeForm, documento: e.target.value})} className="mt-1" placeholder="00.000.000/0000-00" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Categoria da Despesa</Label>
                    <Select 
                      value={nfeForm.categoria_id} 
                      onChange={e => setNfeForm({...nfeForm, categoria_id: e.target.value})}
                      className="mt-1"
                    >
                      <option value="">-- Automático / Variável --</option>
                      {categories.filter(c => c.tipo === 'despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>Valor Total (R$)</Label>
                    <Input type="number" value={nfeForm.valorOriginal} onChange={e => setNfeForm({...nfeForm, valorOriginal: Number(e.target.value)})} className="mt-1" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Data Emissão (Opcional)</Label>
                    <Input type="date" value={nfeForm.dataEmissao} onChange={e => setNfeForm({...nfeForm, dataEmissao: e.target.value})} className="mt-1" />
                  </div>
                  <div>
                    <Label>Data de Vencimento</Label>
                    <Input type="date" value={nfeForm.vencimento} onChange={e => setNfeForm({...nfeForm, vencimento: e.target.value})} className="mt-1" />
                  </div>
                </div>
              </div>
            
            <p className="text-xs text-muted-foreground mt-2 border-t pt-3">
              Ao salvar, o sistema irá registrar o fornecedor caso ele não exista e gerar uma conta a pagar ("Pendente") no valor da nota.
            </p>
          </div>
        </DialogContent>
        <DialogFooter className="flex justify-between sm:justify-between w-full">
          <Button variant="ghost" onClick={() => setNfeForm({
            chaveAcesso: '',
            fornecedor: '',
            documento: '',
            dataEmissao: new Date().toISOString().slice(0, 10),
            vencimento: new Date().toISOString().slice(0, 10),
            valorOriginal: 0,
            categoria_id: ''
          })} className="text-muted-foreground mr-auto">
            Limpar Formulario
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setNfeDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveNfe}>Salvar e Gerar Despesa</Button>
          </div>
        </DialogFooter>
      </Dialog>

      <Dialog open={partialDialogOpen} onOpenChange={setPartialDialogOpen}>
        <DialogHeader>
          <DialogTitle>Baixa Parcial</DialogTitle>
          <DialogClose onClose={() => setPartialDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {partialBill && (
            <div className="grid gap-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm mb-2">
                <p><strong>Conta:</strong> {partialBill.descricao}</p>
                <p><strong>Valor Total:</strong> {formatCurrency(partialBill.valor)}</p>
              </div>

              <div>
                <Label>Valor Pago Agora</Label>
                <Input 
                  type="number" 
                  value={partialForm.valorPago || ''} 
                  onChange={(e) => setPartialForm({ ...partialForm, valorPago: Number(e.target.value) })} 
                  className="mt-1" 
                  max={partialBill.valor - 0.01}
                />
                <p className="text-xs text-muted-foreground mt-1">O valor restante será gerado como uma nova conta pendente.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data do Pagamento</Label>
                  <Input 
                    type="date" 
                    value={partialForm.dataPagamento} 
                    onChange={(e) => setPartialForm({ ...partialForm, dataPagamento: e.target.value })} 
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label>Banco / Origem</Label>
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

      <Dialog open={totalDialogOpen} onOpenChange={setTotalDialogOpen}>
        <DialogHeader>
          <DialogTitle>Baixa Total</DialogTitle>
          <DialogClose onClose={() => setTotalDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {totalBill && (
            <div className="grid gap-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm mb-2">
                <p><strong>Conta:</strong> {totalBill.descricao}</p>
                <p><strong>Valor Total:</strong> {formatCurrency(totalBill.valor)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data do Pagamento</Label>
                  <Input 
                    type="date" 
                    value={totalForm.dataPagamento} 
                    onChange={(e) => setTotalForm({ ...totalForm, dataPagamento: e.target.value })} 
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label>Banco / Origem</Label>
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
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTotalDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleTotalPayment}>Confirmar Baixa Total</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogHeader>
          <DialogTitle>Juros e Descontos</DialogTitle>
          <DialogClose onClose={() => setAdjustDialogOpen(false)} />
        </DialogHeader>
        <DialogContent>
          {adjustBill && adjustPreview && (
            <div className="grid gap-4">
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <p><strong>Conta:</strong> {adjustBill.descricao}</p>
                <p><strong>Valor original:</strong> {formatCurrency(adjustBill.valor)}</p>
                <p><strong>Vencimento:</strong> {formatDate(adjustBill.vencimento)}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Calcular até</Label>
                  <Input type="date" value={adjustForm.dataBase} onChange={(e) => setAdjustForm({ ...adjustForm, dataBase: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Desconto por antecipação</Label>
                  <Input type="number" step="0.01" value={adjustForm.desconto} onChange={(e) => setAdjustForm({ ...adjustForm, desconto: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label>Multa por atraso (%)</Label>
                  <Input type="number" step="0.01" value={adjustForm.multaPercent} onChange={(e) => setAdjustForm({ ...adjustForm, multaPercent: Number(e.target.value) })} className="mt-1" />
                </div>
                <div>
                  <Label>Juros ao mês (%)</Label>
                  <Input type="number" step="0.01" value={adjustForm.jurosMesPercent} onChange={(e) => setAdjustForm({ ...adjustForm, jurosMesPercent: Number(e.target.value) })} className="mt-1" />
                </div>
              </div>
              <div className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex justify-between"><span>Dias em atraso</span><strong>{adjustPreview.days}</strong></div>
                <div className="flex justify-between"><span>Multa</span><strong>{formatCurrency(adjustPreview.multa)}</strong></div>
                <div className="flex justify-between"><span>Juros</span><strong>{formatCurrency(adjustPreview.juros)}</strong></div>
                <div className="flex justify-between"><span>Desconto</span><strong>{formatCurrency(adjustForm.desconto)}</strong></div>
                <div className="flex justify-between border-t pt-2 text-base"><span>Valor atualizado</span><strong className="text-red-600">{formatCurrency(adjustPreview.total)}</strong></div>
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleApplyAdjust}>Aplicar no Lançamento</Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <DialogClose onClose={() => setDeleteConfirmId(null)} />
        </DialogHeader>
        <DialogContent>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.</p>
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
