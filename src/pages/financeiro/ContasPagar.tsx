import { useState } from 'react'
import { addMonths } from 'date-fns'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF, formatCurrencyPDF, formatDatePDF } from '@/lib/pdf'
import type { Bill, TransactionCategory, BankAccount } from '@/lib/types'
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
import { Pencil, Trash2, FileText, Loader2, Filter, ArrowUp, ArrowDown } from 'lucide-react'

const emptyBill: Omit<Bill, 'id'> = {
  descricao: '', 
  categoria: '', 
  category_id: '',
  valor: 0, 
  vencimento: new Date().toISOString().slice(0, 10), 
  status: 'pendente',
  payment_date: '',
  bank_account_id: ''
}

export default function ContasPagar() {
  const { data: bills, loading, insert, update, remove } = useDb<Bill>('bills')
  const { data: categories } = useDb<TransactionCategory>('transaction_categories')
  const { data: entities, insert: insertEntity } = useDb<any>('entities')
  const { data: bankAccounts } = useDb<BankAccount>('bank_accounts')
  const { insert: insertBankTransaction, update: updateBankTransaction, remove: removeBankTransaction } = useDb<BankTransaction>('bank_transactions')
  
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago' | 'vencido'>('todos')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nfeDialogOpen, setNfeDialogOpen] = useState(false)
  const [loadingXml, setLoadingXml] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyBill)
  const [parcelas, setParcelas] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  
  const [nfeForm, setNfeForm] = useState({
    chaveAcesso: '',
    fornecedor: '',
    documento: '',
    dataEmissao: new Date().toISOString().slice(0, 10),
    vencimento: new Date().toISOString().slice(0, 10),
    valorOriginal: 0,
    categoria_id: ''
  })

  const filtered = bills.filter(b => {
    const matchesSearch = b.descricao.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'todos' || b.status === statusFilter
    
    let matchesDate = true
    if (startDate) matchesDate = matchesDate && b.vencimento >= startDate
    if (endDate) matchesDate = matchesDate && b.vencimento <= endDate
    
    return matchesSearch && matchesStatus && matchesDate
  }).sort((a, b) => {
    if (!a.vencimento) return 1
    if (!b.vencimento) return -1
    const dateA = new Date(a.vencimento).getTime()
    const dateB = new Date(b.vencimento).getTime()
    return sortDir === 'asc' ? dateA - dateB : dateB - dateA
  })

  function openNew() { setForm(emptyBill); setEditingId(null); setParcelas(1); setDialogOpen(true) }

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
      bank_transaction_id: b.bank_transaction_id || ''
    })
    setParcelas(1)
    setEditingId(b.id)
    setDialogOpen(true)
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
        bank_transaction_id: (form as any).bank_transaction_id || null
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
      } else if (btId) {
        await removeBankTransaction(btId)
        ;(payload as any).bank_transaction_id = null
      }

      if (editingId) {
        if (parcelas > 1) {
          const promises = []
          const baseDate = new Date(`${payload.vencimento || new Date().toISOString().slice(0, 10)}T12:00:00Z`)
          
          await update(editingId, {
            ...payload,
            descricao: `${payload.descricao} (1/${parcelas})`
          })

          for (let i = 1; i < parcelas; i++) {
            const installmentDate = addMonths(baseDate, i)
            const installmentPayload = {
              ...payload,
              descricao: `${payload.descricao} (${i + 1}/${parcelas})`,
              vencimento: installmentDate.toISOString().slice(0, 10),
            }
            promises.push(insert(installmentPayload))
          }
          await Promise.all(promises)
        } else {
          await update(editingId, payload)
        }
      } else {
        if (parcelas > 1) {
          const promises = []
          const baseDate = new Date(`${payload.vencimento || new Date().toISOString().slice(0, 10)}T12:00:00Z`)
          for (let i = 0; i < parcelas; i++) {
            const installmentDate = addMonths(baseDate, i)
            const installmentPayload = {
              ...payload,
              descricao: `${payload.descricao} (${i + 1}/${parcelas})`,
              vencimento: installmentDate.toISOString().slice(0, 10),
            }
            promises.push(insert(installmentPayload))
          }
          await Promise.all(promises)
        } else {
          await insert(payload)
        }
      }
      setDialogOpen(false)
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar conta: ${error.message || 'Erro desconhecido'}`)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Deseja excluir esta conta?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error('Erro ao excluir:', error)
      }
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
    // Group by category
    const grouped = filtered.reduce((acc, b) => {
      const cat = b.categoria || 'Sem Categoria'
      acc[cat] = (acc[cat] || 0) + b.valor
      return acc
    }, {} as Record<string, number>)

    const total = Object.values(grouped).reduce((s, v) => s + v, 0)
    const rows = Object.entries(grouped)
      .sort((a, b) => b[1] - a[1]) // Sort by value descending
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
              variant="ghost" 
              size="sm" 
              onClick={() => { setStartDate(''); setEndDate(''); setSearch(''); setStatusFilter('todos') }}
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
              <TableRow><TableCell colSpan={7}><EmptyState message="Nenhum lançamento encontrado." /></TableCell></TableRow>
            ) : (
              filtered.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.descricao}</TableCell>
                  <TableCell>{b.categoria}</TableCell>
                  <TableCell className="font-semibold text-red-600">{formatCurrency(b.valor)}</TableCell>
                  <TableCell>{formatDate(b.vencimento)}</TableCell>
                  <TableCell>{(b as any).payment_date ? formatDate((b as any).payment_date) : '—'}</TableCell>
                  <TableCell>{statusBadge(b.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
                <Label>Categoria</Label>
                <Select 
                  value={form.category_id || ''} 
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="mt-1"
                >
                  <option value="">-- Selecione --</option>
                  {categories.filter(c => c.tipo === 'despesa').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} className="mt-1" /></div>
            </div>
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
                className="mt-1 w-1/3" 
              />
              <p className="text-xs text-muted-foreground mt-1">
                {editingId 
                  ? "Se for > 1, converterá esta conta na parcela 1 e irá gerar as demais paras os meses seguintes."
                  : "Gera repetições lançando 1 mês para frente cada."}
              </p>
            </div>
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
    </div>
  )
}
