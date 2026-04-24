import { useState, useEffect, useRef } from 'react'
import { useDb } from '@/hooks/useDb'
import type { CompanyInfo } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Building2, DownloadCloud, UploadCloud } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function Configuracoes() {
  const { data: settings, loading, update, insert } = useDb<CompanyInfo>('company_info')
  const [form, setForm] = useState<Partial<CompanyInfo>>({
    nome_fantasia: '',
    razao_social: '',
    cnpj: '',
    endereco: '',
    telefone: '',
    email: '',
    website: '',
    logotipo_url: ''
  })

  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (settings && settings.length > 0) {
      setForm(settings[0])
    }
  }, [settings])

  async function handleSave() {
    if (!form.nome_fantasia) {
      alert('O nome da empresa é obrigatório.')
      return
    }
    
    setSaving(true)
    try {
      if (settings && settings.length > 0) {
        // Update existing settings
        await update(settings[0].id, form)
      } else {
        // Create new settings for the first time
        await insert(form)
      }
      alert('Configurações salvas com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar:', error)
      alert('Erro ao salvar configurações. Verifique sua conexão ou se o banco de dados está configurado.')
    } finally {
      setSaving(false)
    }
  }

  async function handleBackup() {
    setExporting(true)
    try {
      const tablesToBackup = [
        'employees', 'patients', 'contracts', 'medications', 'appointments', 
        'transaction_categories', 'bank_accounts', 'bills', 'incomes', 'invoices', 
        'products', 'entities', 'vacations', 'payrolls', 'bank_transactions', 
        'schedule_exceptions', 'schedule_history', 'company_info', 'curriculums', 'terminations'
      ]
      
      const backupData: Record<string, any> = {}
      let hasData = false
      
      for (const table of tablesToBackup) {
         try {
           const { data, error } = await supabase.from(table).select('*')
           if (!error && data && data.length > 0) {
             backupData[table] = data
             hasData = true
           }
         } catch (e) {
           // Skip tables that don't exist
           console.warn(`Could not export table ${table}`)
         }
      }
      
      if (!hasData) {
        alert('Nenhum dado encontrado para exportar.')
        return
      }

      const backupDate = new Date().toISOString().split('T')[0]
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_osneiapp_${backupDate}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      alert('Backup gerado e baixado com sucesso!')
    } catch (error) {
      console.error('Erro ao gerar backup:', error)
      alert('Houve um erro ao gerar o backup. Tente novamente mais tarde.')
    } finally {
      setExporting(false)
    }
  }

  async function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    alert('Processando arquivo selecionado...')
    console.log('handleRestore triggered')
    const file = e.target.files?.[0]
    if (!file) {
      console.log('No file selected')
      return
    }

    console.log('File selected:', file.name, file.size, 'bytes')
    alert(`Arquivo selecionado: ${file.name}. Iniciando restauração...`)
    
    setImporting(true)
    try {
      const text = await file.text()
      console.log('File text read, length:', text.length)
      
      let backupData: any
      try {
        backupData = JSON.parse(text)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError)
        alert('Erro: O arquivo selecionado não é um JSON válido.')
        setImporting(false)
        return
      }
      
      console.log('Backup data keys:', Object.keys(backupData))
      
      // Define a ordem correta para respeitar chaves estrangeiras
      const restorationOrder = [
        'clinic_config', 'company_info', 'transaction_categories', 'product_categories', 'entities',
        'bank_accounts', 'employees', 'patients',
        'contracts', 'medications', 'appointments', 'vacations', 'payrolls', 'terminations',
        'schedule_exceptions', 'schedule_history', 'products', 'curriculums',
        'incomes', 'bills', 'invoices', 'invoice_items', 'bank_transactions'
      ]

      const successTables: string[] = []
      const failedTables: string[] = []
      const skippedTables: string[] = []

      // Primeiro, processamos as tabelas na ordem definida
      for (const table of restorationOrder) {
        let tableData = backupData[table]
        
        // Mapeamento especial para tabelas renomeadas ou legadas (company_info)
        if (!tableData && table === 'company_info' && backupData['company_settings']) {
          console.log('Mapping company_settings to company_info')
          tableData = backupData['company_settings'].map((s: any) => ({
            id: s.id,
            nome_fantasia: s.name || s.nome_fantasia,
            razao_social: s.razao_social,
            cnpj: s.cnpj,
            endereco: s.address || s.endereco,
            telefone: s.phone || s.telefone,
            email: s.email,
            website: s.website,
            logotipo_url: s.logo_url || s.logotipo_url
          }))
        }

        // Mapeamento especial para pacientes (campos legados)
        if (tableData && table === 'patients') {
          tableData = tableData.map((p: any) => ({
            ...p,
            dataEntrada: p.data_entrada || p.dataEntrada
          }))
        }

        // Mapeamento especial para funcionários (campos legados)
        if (tableData && table === 'employees') {
          tableData = tableData.map((e: any) => ({
            ...e,
            dataAdmissao: e.data_admissao || e.dataAdmissao
          }))
        }

        if (tableData) {
          if (Array.isArray(tableData) && tableData.length > 0) {
            console.log(`Restoring table: ${table} (${tableData.length} records)`)
            const { error } = await supabase.from(table).upsert(tableData)
            if (error) {
              console.error(`Erro ao restaurar tabela ${table}:`, error)
              failedTables.push(`${table}: ${error.message}`)
            } else {
              successTables.push(table)
            }
          } else {
            skippedTables.push(table)
          }
        }
      }

      // Depois, processamos qualquer tabela que esteja no backup mas não na ordem definida
      for (const table of Object.keys(backupData)) {
        if (!restorationOrder.includes(table)) {
          const tableData = backupData[table]
          if (Array.isArray(tableData) && tableData.length > 0) {
             const { error } = await supabase.from(table).upsert(tableData)
             if (error) {
               console.error(`Erro ao restaurar tabela extra ${table}:`, error)
               // Não falhamos o processo por tabelas extras/antigas
             }
          }
        }
      }

      if (successTables.length > 0 || failedTables.length > 0) {
        let message = `Processo de restauração finalizado.\n\n`
        if (successTables.length > 0) {
          message += `Sucesso (${successTables.length}): ${successTables.join(', ')}\n`
        }
        if (failedTables.length > 0) {
          message += `Erro (${failedTables.length}):\n- ${failedTables.join('\n- ')}\n`
        }
        
        if (successTables.length > 0) {
          message += '\nA página será recarregada para aplicar os dados restaurados.'
          alert(message)
          window.location.reload()
        } else {
          alert(message + '\nNenhuma tabela foi restaurada com sucesso.')
        }
      } else {
        alert('Nenhum dado compatível encontrado no arquivo de backup.')
      }
    } catch (error) {
      console.error('Erro na restauração:', error)
      alert('Erro ao processar o arquivo de backup. Verifique se é um arquivo de backup válido.')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (loading && settings.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações da Empresa</h1>
        <p className="text-muted-foreground">Gerencie as informações básicas da sua clínica/instituição</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-8 p-4 bg-primary/5 rounded-lg">
          <div className="p-3 bg-primary/10 rounded-full text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-semibold text-lg">{form.nome_fantasia || 'Identidade Visual'}</h2>
            <p className="text-sm text-muted-foreground text-balance">Estes dados serão utilizados em relatórios e documentos gerados pelo sistema.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
            <Input 
              id="nome_fantasia"
              value={form.nome_fantasia} 
              onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} 
              placeholder="Ex: Clínica Viver Bem"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="razao_social">Razão Social</Label>
            <Input 
              id="razao_social"
              value={form.razao_social} 
              onChange={(e) => setForm({ ...form, razao_social: e.target.value })} 
              placeholder="Ex: Clínica Viver Bem Ltda"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input 
              id="cnpj"
              value={form.cnpj} 
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })} 
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="endereco">Endereço Completo</Label>
            <Input 
              id="endereco"
              value={form.endereco} 
              onChange={(e) => setForm({ ...form, endereco: e.target.value })} 
              placeholder="Rua, Número, Bairro, Cidade - UF"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone de Contato</Label>
            <Input 
              id="telefone"
              value={form.telefone} 
              onChange={(e) => setForm({ ...form, telefone: e.target.value })} 
              placeholder="(00) 0000-0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Institucional</Label>
            <Input 
              id="email"
              type="email"
              value={form.email} 
              onChange={(e) => setForm({ ...form, email: e.target.value })} 
              placeholder="contato@empresa.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input 
              id="website"
              value={form.website} 
              onChange={(e) => setForm({ ...form, website: e.target.value })} 
              placeholder="https://www.suaempresa.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="logotipo_url">URL da Logomarca (PNG/JPG)</Label>
            <Input 
              id="logotipo_url"
              value={form.logotipo_url} 
              onChange={(e) => setForm({ ...form, logotipo_url: e.target.value })} 
              placeholder="https://link-para-sua-logo.png"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="gap-2 px-8"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Alterações
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-primary/10 rounded-full text-primary">
            <DownloadCloud className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Backup do Sistema</h3>
            <p className="text-sm text-muted-foreground text-balance">
              Exporte todos os seus dados estruturados em formato JSON para fins de segurança corporativa, auditoria e migração.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 border-t pt-4">
          <input 
            key={importing ? 'importing' : 'ready'}
            type="file" 
            accept=".json" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleRestore} 
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing || exporting}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UploadCloud className="h-4 w-4 mr-2" />}
            {importing ? 'Restaurando...' : 'Restaurar Backup'}
          </Button>
          <Button variant="outline" onClick={handleBackup} disabled={exporting || importing}>
             {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
             {exporting ? 'Gerando Backup...' : 'Gerar Backup de Dados'}
          </Button>
        </div>
      </Card>

      <Card className="p-6 border-destructive/20 bg-destructive/5">
        <h3 className="text-lg font-semibold text-destructive mb-2">Zona de Perigo</h3>
        <p className="text-sm text-muted-foreground mb-4">Tenha cuidado ao alterar estas informações, pois elas afetam diretamente todos os documentos já emitidos.</p>
        <Button variant="outline" className="text-destructive hover:bg-destructive hover:text-white" disabled>
          Reiniciar banco de dados
        </Button>
      </Card>
    </div>
  )
}
