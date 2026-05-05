import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Loader2, History, Search, Eye, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface AuditLog {
  id: string
  created_at: string
  user_id: string
  action: string
  table_name: string
  record_id: string
  old_data: any
  new_data: any
  description: string
  profiles?: {
    full_name: string
    email: string
  }
}

export default function Logs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  useEffect(() => {
    fetchLogs()
  }, [])

  async function fetchLogs() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          profiles:user_id (full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error
      setLogs(data || [])
    } catch (error) {
      console.error('Erro ao buscar logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredLogs = logs.filter(log => 
    log.table_name.toLowerCase().includes(search.toLowerCase()) ||
    log.action.toLowerCase().includes(search.toLowerCase()) ||
    log.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    log.profiles?.email?.toLowerCase().includes(search.toLowerCase())
  )

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT': return <Badge className="bg-emerald-500">INSERÇÃO</Badge>
      case 'UPDATE': return <Badge className="bg-amber-500">ALTERAÇÃO</Badge>
      case 'DELETE': return <Badge variant="destructive">EXCLUSÃO</Badge>
      default: return <Badge variant="outline">{action}</Badge>
    }
  }

  const formatTableName = (name: string) => {
    const names: Record<string, string> = {
      'patients': 'Pacientes',
      'employees': 'Funcionários',
      'bills': 'Contas a Pagar',
      'incomes': 'Contas a Receber',
      'medications': 'Medicações',
      'contracts': 'Contratos',
      'payrolls': 'Folha de Pagamento',
      'bank_accounts': 'Contas Bancárias',
      'bank_transactions': 'Transações'
    }
    return names[name] || name
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Log de Alterações" 
        description="Rastro de auditoria de todas as modificações no sistema"
      >
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar nos logs..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
          </Button>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>ID Registro</TableHead>
              <TableHead className="text-right">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Carregando logs...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow key={log.id} className="group">
                  <TableCell className="font-medium whitespace-nowrap">
                    {format(new Date(log.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm">{log.profiles?.full_name || 'Sistema'}</span>
                      <span className="text-[10px] text-muted-foreground">{log.profiles?.email || '---'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getActionBadge(log.action)}</TableCell>
                  <TableCell className="font-medium">{formatTableName(log.table_name)}</TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground truncate max-w-[100px]">
                    {log.record_id}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => setSelectedLog(log)}
                      title="Ver detalhes da alteração"
                    >
                      <Eye className="h-4 w-4 text-primary" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Detalhes da Alteração
            </DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg text-sm">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Data e Hora</label>
                  <p>{format(new Date(selectedLog.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Usuário Responsável</label>
                  <p>{selectedLog.profiles?.full_name || 'Usuário não identificado'}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Módulo / Tabela</label>
                  <p>{formatTableName(selectedLog.table_name)}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">ID do Registro</label>
                  <p className="font-mono text-[11px]">{selectedLog.record_id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dados Antigos */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold flex items-center gap-2 text-destructive">
                    {selectedLog.action === 'INSERT' ? '---' : 'Estado Anterior'}
                  </h4>
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-800 h-[300px] overflow-auto">
                    <pre className="text-[10px] text-slate-300 font-mono">
                      {selectedLog.old_data 
                        ? JSON.stringify(selectedLog.old_data, null, 2)
                        : (selectedLog.action === 'INSERT' ? '// Registro novo (sem dados anteriores)' : '// Dados não capturados')}
                    </pre>
                  </div>
                </div>

                {/* Dados Novos */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold flex items-center gap-2 text-emerald-500">
                    {selectedLog.action === 'DELETE' ? 'Excluído' : 'Novo Estado'}
                  </h4>
                  <div className="bg-slate-950 p-4 rounded-md border border-slate-800 h-[300px] overflow-auto">
                    <pre className="text-[10px] text-slate-300 font-mono">
                      {selectedLog.new_data 
                        ? JSON.stringify(selectedLog.new_data, null, 2)
                        : (selectedLog.action === 'DELETE' ? '// Registro removido do sistema' : '// Sem novos dados')}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
