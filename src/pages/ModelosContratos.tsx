import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useClinic } from '@/lib/clinicConfig'
import { useAuth } from '@/hooks/useAuth'
import { useDb } from '@/hooks/useDb'
import { supabase } from '@/lib/supabase'
import { downloadContractTemplateWord } from '@/lib/contractTemplates'
import { Download, FileSpreadsheet, FileText, Loader2, ShieldCheck, Trash2, Upload } from 'lucide-react'

type UploadedTemplate = {
  id: string
  title: string
  file_name: string
  file_path: string
  file_type: 'word' | 'excel'
}

const allowedExtensions = ['doc', 'docx', 'xls', 'xlsx']

export default function ModelosContratos() {
  const [clinic] = useClinic()
  const { profile } = useAuth()
  const { data: uploadedTemplates, loading, insert, remove } = useDb<UploadedTemplate>('administrative_file_templates')
  const [title, setTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const models = [
    { type: 'funcionario' as const, title: 'Contrato de Funcionário', description: 'Modelo editável para contratos de prestação de serviços de funcionários, autônomos e prestadores.' },
    { type: 'paciente' as const, title: 'Contrato de Paciente', description: 'Modelo editável para contratos de acolhimento, moradia e cuidados dos residentes.' },
  ]

  const uploadTemplate = async () => {
    if (!selectedFile || !profile?.company_id) {
      alert('Selecione um arquivo Word ou Excel.')
      return
    }
    const extension = selectedFile.name.split('.').pop()?.toLowerCase() || ''
    if (!allowedExtensions.includes(extension)) {
      alert('Envie um arquivo Word (.doc ou .docx) ou Excel (.xls ou .xlsx).')
      return
    }
    if (selectedFile.size > 15 * 1024 * 1024) {
      alert('O arquivo deve ter no máximo 15 MB.')
      return
    }

    setUploading(true)
    try {
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${profile.company_id}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('modelos-administrativos').upload(path, selectedFile, {
        contentType: selectedFile.type || 'application/octet-stream',
      })
      if (error) throw error
      await insert({
        title: title.trim() || selectedFile.name.replace(/\.[^.]+$/, ''),
        file_name: selectedFile.name,
        file_path: path,
        file_type: extension.startsWith('doc') ? 'word' : 'excel',
      })
      setTitle('')
      setSelectedFile(null)
      const input = document.getElementById('administrative-template-file') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (error) {
      console.error(error)
      alert('Não foi possível enviar o modelo. Confirme se a migração de modelos foi aplicada no Supabase.')
    } finally {
      setUploading(false)
    }
  }

  const downloadUploadedTemplate = async (template: UploadedTemplate) => {
    const { data, error } = await supabase.storage.from('modelos-administrativos').createSignedUrl(template.file_path, 60, { download: template.file_name })
    if (error || !data?.signedUrl) {
      alert('Não foi possível baixar o arquivo.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const deleteUploadedTemplate = async (template: UploadedTemplate) => {
    if (!confirm(`Excluir o modelo “${template.title}”?`)) return
    try {
      const { error } = await supabase.storage.from('modelos-administrativos').remove([template.file_path])
      if (error) throw error
      await remove(template.id)
    } catch (error) {
      console.error(error)
      alert('Não foi possível excluir o modelo.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Modelo de Arquivos</h1>
        <p className="text-muted-foreground">Modelos Word e Excel para uso administrativo</p>
      </div>

      <Card className="border-l-4 border-l-primary p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-bold">Modelos administrativos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Baixe os modelos padrão ou adicione novos documentos Word e planilhas Excel para sua empresa.</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {models.map(model => (
          <Card key={model.type} className="p-6">
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3"><FileText className="h-6 w-6 text-primary" /></div>
                <h2 className="text-lg font-bold">{model.title}</h2>
              </div>
              <p className="mt-4 flex-1 text-sm text-muted-foreground">{model.description}</p>
              <Button className="mt-6 w-full gap-2" onClick={() => downloadContractTemplateWord(model.type, clinic)}>
                <Download className="h-4 w-4" /> Baixar modelo em Word
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <Upload className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold">Adicionar novo modelo</h2>
            <p className="text-sm text-muted-foreground">Arquivos Word ou Excel, com até 15 MB.</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-1">
            <Label>Nome do modelo</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Controle mensal de estoque" />
          </div>
          <div className="space-y-1">
            <Label>Arquivo Word ou Excel</Label>
            <Input id="administrative-template-file" type="file" accept=".doc,.docx,.xls,.xlsx" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={() => void uploadTemplate()} disabled={!selectedFile || uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar modelo
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h2 className="text-lg font-bold">Modelos enviados</h2>
          <p className="text-sm text-muted-foreground">Arquivos compartilhados com os usuários da mesma empresa.</p>
        </div>
        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : uploadedTemplates.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nenhum modelo adicional enviado.</p>
        ) : (
          <div className="divide-y">
            {uploadedTemplates.map(template => (
              <div key={template.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`rounded-lg p-2 ${template.file_type === 'excel' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {template.file_type === 'excel' ? <FileSpreadsheet className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0"><p className="font-semibold">{template.title}</p><p className="truncate text-xs text-muted-foreground">{template.file_name}</p></div>
                </div>
                <div className="flex gap-2 self-end sm:self-auto">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => void downloadUploadedTemplate(template)}><Download className="h-4 w-4" /> Baixar</Button>
                  <Button variant="ghost" size="icon" title="Excluir modelo" onClick={() => void deleteUploadedTemplate(template)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
