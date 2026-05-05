import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { formatCurrency } from '@/lib/utils'
import type { BankAccount } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Landmark, Wallet, CreditCard, PiggyBank } from 'lucide-react'

export default function Bancos() {
  const { data: accounts, loading, insert, update, remove } = useDb<BankAccount>('bank_accounts')
  const { insert: insertTx } = useDb<any>('bank_transactions')
  
  const [dialogOpen, setDialogOpen] = useState(false)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [form, setForm] = useState<Partial<BankAccount>>({
    nome: '',
    banco: '',
    tipo: 'corrente',
    saldo_inicial: 0,
    saldo_atual: 0,
    cor_identificacao: '#3b82f6'
  })

  const [transferForm, setTransferForm] = useState({
    origem_id: '',
    destino_id: '',
    valor: 0,
    data: new Date().toISOString().slice(0, 10),
    descricao: 'Transferência entre contas'
  })

  const handleSubmit = async () => {
    console.log('Botão Salvar clicado!', form)
    if (!form.nome) {
      alert('O nome da conta é obrigatório.')
      return
    }

    try {
      // Enviar apenas os campos necessários para evitar erros de colunas protegidas
      const updateData = {
        nome: form.nome,
        banco: form.banco,
        tipo: form.tipo,
        saldo_inicial: form.saldo_inicial,
        cor_identificacao: form.cor_identificacao
      }

      if (editing) {
        console.log('Atualizando conta...', editing.id, updateData)
        await update(editing.id, updateData)
        alert('Conta bancária atualizada com sucesso!')
      } else {
        console.log('Inserindo nova conta...', updateData)
        await insert({ ...updateData, saldo_atual: form.saldo_inicial })
        alert('Nova conta bancária criada com sucesso!')
      }
      setDialogOpen(false)
      setEditing(null)
      setForm({ nome: '', banco: '', tipo: 'corrente', saldo_inicial: 0, saldo_atual: 0, cor_identificacao: '#3b82f6' })
    } catch (e: any) {
      console.error('Erro detalhado no catch:', e)
      alert('Erro crítico ao salvar: ' + (e?.message || JSON.stringify(e) || 'Erro desconhecido'))
    }
  }

  const handleTransfer = async () => {
    if (!transferForm.origem_id || !transferForm.destino_id || transferForm.valor <= 0) {
      alert('Preencha todos os campos da transferência.')
      return
    }
    if (transferForm.origem_id === transferForm.destino_id) {
      alert('A conta de origem deve ser diferente da conta de destino.')
      return
    }

    try {
      // 1. Lançamento de saída na conta de origem
      await insertTx({
        data: transferForm.data,
        descricao: `${transferForm.descricao} (Saída)`,
        valor: transferForm.valor,
        tipo: 'debito',
        origem: 'manual',
        bank_account_id: transferForm.origem_id,
        categoria: 'Transferência',
        status: 'pago'
      })

      // 2. Lançamento de entrada na conta de destino
      await insertTx({
        data: transferForm.data,
        descricao: `${transferForm.descricao} (Entrada)`,
        valor: transferForm.valor,
        tipo: 'credito',
        origem: 'manual',
        bank_account_id: transferForm.destino_id,
        categoria: 'Transferência',
        status: 'recebido'
      })

      alert('Transferência realizada com sucesso!')
      setTransferDialogOpen(false)
      setTransferForm({
        origem_id: '',
        destino_id: '',
        valor: 0,
        data: new Date().toISOString().slice(0, 10),
        descricao: 'Transferência entre contas'
      })
    } catch (e: any) {
      console.error(e)
      alert('Erro ao realizar transferência: ' + e.message)
    }
  }

  const handleEdit = (acc: BankAccount) => {
    setEditing(acc)
    setForm(acc)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir esta conta? Todas as movimentações vinculadas perderão a referência.')) {
      await remove(id)
    }
  }

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case 'corrente': return <Landmark className="h-5 w-5" />
      case 'poupanca': return <PiggyBank className="h-5 w-5" />
      case 'investimento': return <CreditCard className="h-5 w-5" />
      case 'caixa': return <Wallet className="h-5 w-5" />
      default: return <Landmark className="h-5 w-5" />
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader 
          title="Contas Bancárias / Caixas" 
          description="Gerencie suas contas e saldos disponíveis" 
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTransferDialogOpen(true)} className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50">
            <Plus className="h-4 w-4" /> Transferência
          </Button>
          <Button onClick={() => { setEditing(null); setForm({ nome: '', banco: '', tipo: 'corrente', saldo_inicial: 0, saldo_atual: 0, cor_identificacao: '#3b82f6' }); setDialogOpen(true) }} className="gap-2">
            <Plus className="h-4 w-4" /> Nova Conta
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <Card key={acc.id} className="p-5 border-l-4" style={{ borderLeftColor: acc.cor_identificacao }}>
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 rounded-lg bg-muted text-primary">
                {getIcon(acc.tipo)}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(acc)} className="h-8 w-8">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(acc.id)} className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-lg">{acc.nome}</h3>
              <p className="text-sm text-muted-foreground mb-4">{acc.banco} • {acc.tipo.toUpperCase()}</p>
              <div className="flex justify-between items-end">
                <span className="text-sm text-muted-foreground">Saldo Atual</span>
                <span className={`text-xl font-bold ${acc.saldo_atual >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(acc.saldo_atual)}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Conta' : 'Nova Conta Bancária'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Conta / Identificação</Label>
              <Input 
                value={form.nome || ''} 
                onChange={e => setForm({ ...form, nome: e.target.value })} 
                placeholder="Ex: Itau Principal, Google Pay, Caixa Interno" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Banco (Opcional)</Label>
                <Input 
                  value={form.banco || ''} 
                  onChange={e => setForm({ ...form, banco: e.target.value })} 
                  placeholder="Ex: Itau, Bradesco" 
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Conta</Label>
                <Select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })}>
                  <option value="corrente">Conta Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="investimento">Investimento</option>
                  <option value="caixa">Caixa / Dinheiro</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Saldo Inicial</Label>
                <Input 
                  type="number" 
                  value={form.saldo_inicial || 0} 
                  onChange={e => setForm({ ...form, saldo_inicial: Number(e.target.value) })} 
                />
              </div>
              <div className="space-y-2">
                <Label>Cor de Identificação</Label>
                <Input 
                  type="color" 
                  value={form.cor_identificacao || '#3b82f6'} 
                  onChange={e => setForm({ ...form, cor_identificacao: e.target.value })} 
                  className="h-10 p-1" 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit}>Salvar Conta (Atualizado)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferência entre Contas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Conta de Origem (Saída)</Label>
                <Select value={transferForm.origem_id} onChange={e => setTransferForm({ ...transferForm, origem_id: e.target.value })}>
                  <option value="">-- Selecione --</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nome}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Conta de Destino (Entrada)</Label>
                <Select value={transferForm.destino_id} onChange={e => setTransferForm({ ...transferForm, destino_id: e.target.value })}>
                  <option value="">-- Selecione --</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nome}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input 
                  type="number" 
                  value={transferForm.valor} 
                  onChange={e => setTransferForm({ ...transferForm, valor: Number(e.target.value) })} 
                />
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input 
                  type="date" 
                  value={transferForm.data} 
                  onChange={e => setTransferForm({ ...transferForm, data: e.target.value })} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição / Observação</Label>
              <Input 
                value={transferForm.descricao} 
                onChange={e => setTransferForm({ ...transferForm, descricao: e.target.value })} 
                placeholder="Ex: Aplicação em CDB, Resgate, etc." 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleTransfer}>Confirmar Transferência</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
