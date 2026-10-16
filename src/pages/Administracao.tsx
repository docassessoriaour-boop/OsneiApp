import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useClinic } from '@/lib/clinicConfig'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { useDb } from '@/hooks/useDb'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  getMaintenanceTypeLabel,
  getPopById,
  getSanitaryStatusLabel,
  printAllAppendices,
  printAppendix,
  printPreventiveMaintenance,
  printPop,
  printSanitaryFolderReport,
  sanitaryAppendices,
  sanitaryDocuments,
  type PreventiveMaintenanceRecord,
  type PreventiveMaintenanceType,
  type SanitaryAppendix,
  type SanitaryDocument,
  type SanitaryDocumentStatus,
} from '@/lib/sanitaryDocuments'
import {
  ClipboardCheck,
  FileDown,
  FileText,
  FolderCheck,
  Printer,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  ExternalLink,
  Loader2,
} from 'lucide-react'

type StatusOverrides = Record<string, SanitaryDocumentStatus>
type AppendixValues = Record<string, Record<string, string>>
type MaintenanceForm = Omit<PreventiveMaintenanceRecord, 'id'>
type SanitaryDocumentFile = {
  id: string
  document_id: string
  file_path: string
  file_name: string
  uploaded_at?: string
}

const statusBadgeVariant: Record<SanitaryDocumentStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  pendente: 'warning',
  em_revisao: 'default',
  vigente: 'success',
  vencido: 'destructive',
}

export default function Administracao() {
  const [clinic] = useClinic()
  const { profile } = useAuth()
  const { data: documentFiles, insert: insertDocumentFile, update: updateDocumentFile } = useDb<SanitaryDocumentFile>('sanitary_document_files')
  const [statusOverrides, setStatusOverrides] = useLocalStorage<StatusOverrides>('sanitary-document-status', {})
  const [appendixValues, setAppendixValues] = useLocalStorage<AppendixValues>('sanitary-appendix-values', {})
  const [maintenanceRecords, setMaintenanceRecords] = useLocalStorage<PreventiveMaintenanceRecord[]>('preventive-maintenance-records', [])
  const [categoryFilter, setCategoryFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null)
  const [selectedAppendixId, setSelectedAppendixId] = useState(sanitaryAppendices[0]?.id || '')
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceForm>({
    type: 'controle_pragas',
    date: '',
    company: '',
    validUntil: '',
    notes: '',
  })

  const documents = useMemo<SanitaryDocument[]>(() => {
    return sanitaryDocuments.map(doc => ({
      ...doc,
      status: statusOverrides[doc.id] || doc.status,
    }))
  }, [statusOverrides])

  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const categoryOk = categoryFilter === 'todos' || doc.category === categoryFilter
      const statusOk = statusFilter === 'todos' || doc.status === statusFilter
      return categoryOk && statusOk
    })
  }, [documents, categoryFilter, statusFilter])

  const totals = useMemo(() => {
    const total = documents.length
    const current = documents.filter(doc => doc.status === 'vigente').length
    const review = documents.filter(doc => doc.status === 'em_revisao').length
    const pending = documents.filter(doc => doc.status === 'pendente' || doc.status === 'vencido').length
    const popCount = documents.filter(doc => doc.isPop).length
    return { total, current, review, pending, popCount, percent: Math.round((current / total) * 100) }
  }, [documents])

  const setDocumentStatus = (id: string, status: SanitaryDocumentStatus) => {
    setStatusOverrides(current => ({ ...current, [id]: status }))
  }

  const printDocument = (doc: SanitaryDocument) => {
    if (!doc.isPop) {
      printSanitaryFolderReport(documents, clinic)
      return
    }

    const pop = getPopById(doc.id)
    if (pop) printPop(pop, clinic)
  }

  const getDocumentFile = (documentId: string) => documentFiles.find(file => file.document_id === documentId)

  const uploadDocumentPdf = async (doc: SanitaryDocument, file?: File) => {
    if (!file) return
    if (file.type !== 'application/pdf') {
      alert('Selecione um arquivo PDF.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      alert('O PDF deve ter no máximo 15 MB.')
      return
    }
    if (!profile?.company_id) {
      alert('Empresa não identificada. Entre novamente no sistema.')
      return
    }

    setUploadingDocumentId(doc.id)
    try {
      const currentFile = getDocumentFile(doc.id)
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${profile.company_id}/${doc.id}/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage
        .from('pasta-sanitaria-pdf')
        .upload(path, file, { contentType: 'application/pdf' })
      if (uploadError) throw uploadError

      if (currentFile) {
        await updateDocumentFile(currentFile.id, {
          file_path: path,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
        })
        if (currentFile.file_path) {
          await supabase.storage.from('pasta-sanitaria-pdf').remove([currentFile.file_path])
        }
      } else {
        await insertDocumentFile({
          document_id: doc.id,
          file_path: path,
          file_name: file.name,
          uploaded_at: new Date().toISOString(),
        })
      }
      setDocumentStatus(doc.id, 'vigente')
    } catch (error) {
      console.error(error)
      alert('Não foi possível enviar o PDF. Confirme se a migração da Pasta Sanitária foi aplicada no Supabase.')
    } finally {
      setUploadingDocumentId(null)
    }
  }

  const openDocumentPdf = async (documentId: string) => {
    const file = getDocumentFile(documentId)
    if (!file) return
    const { data, error } = await supabase.storage.from('pasta-sanitaria-pdf').createSignedUrl(file.file_path, 60)
    if (error || !data?.signedUrl) {
      alert('Não foi possível abrir o PDF.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const categories = Array.from(new Set(documents.map(doc => doc.category)))
  const selectedAppendix = sanitaryAppendices.find(appendix => appendix.id === selectedAppendixId) || sanitaryAppendices[0]
  const selectedAppendixValues = appendixValues[selectedAppendix?.id] || {}

  const setAppendixValue = (appendix: SanitaryAppendix, key: string, value: string) => {
    setAppendixValues(current => ({
      ...current,
      [appendix.id]: {
        ...(current[appendix.id] || {}),
        [key]: value,
      },
    }))
  }

  const clearAppendixValues = (appendix: SanitaryAppendix) => {
    setAppendixValues(current => ({ ...current, [appendix.id]: {} }))
  }

  const saveMaintenanceRecord = () => {
    if (!maintenanceForm.date || !maintenanceForm.company.trim() || !maintenanceForm.validUntil) {
      alert('Preencha data, empresa responsavel e validade.')
      return
    }

    const newRecord: PreventiveMaintenanceRecord = {
      ...maintenanceForm,
      id: crypto.randomUUID(),
      company: maintenanceForm.company.trim(),
      notes: maintenanceForm.notes?.trim(),
    }

    setMaintenanceRecords(current => [newRecord, ...current])
    setMaintenanceForm({
      type: maintenanceForm.type,
      date: '',
      company: '',
      validUntil: '',
      notes: '',
    })
  }

  const deleteMaintenanceRecord = (id: string) => {
    if (!confirm('Excluir este certificado do controle?')) return
    setMaintenanceRecords(current => current.filter(record => record.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administracao</h1>
          <p className="text-muted-foreground">Controle de documentos da pasta sanitaria da ILPI e emissao de POPs</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => printSanitaryFolderReport(documents, clinic)} className="gap-2">
            <FileDown className="h-4 w-4" />
            PDF da Pasta Sanitaria
          </Button>
          <Button onClick={() => printSanitaryFolderReport(documents, clinic)} className="gap-2">
            <Printer className="h-4 w-4" />
            Imprimir Controle
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-primary">
          <FolderCheck className="h-5 w-5 text-primary mb-2" />
          <p className="text-xs font-bold uppercase text-muted-foreground">Documentos</p>
          <p className="mt-1 text-2xl font-black">{totals.total}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-green-600">
          <ShieldCheck className="h-5 w-5 text-green-600 mb-2" />
          <p className="text-xs font-bold uppercase text-muted-foreground">Vigentes</p>
          <p className="mt-1 text-2xl font-black text-green-700">{totals.current}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500">
          <ClipboardCheck className="h-5 w-5 text-amber-600 mb-2" />
          <p className="text-xs font-bold uppercase text-muted-foreground">Pendentes/Vencidos</p>
          <p className="mt-1 text-2xl font-black text-amber-700">{totals.pending}</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-blue-500">
          <FileText className="h-5 w-5 text-blue-600 mb-2" />
          <p className="text-xs font-bold uppercase text-muted-foreground">POPs prontos</p>
          <p className="mt-1 text-2xl font-black text-blue-700">{totals.popCount}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-lg font-bold">Controle de Documentos da Pasta Sanitaria</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Base organizada a partir da RDC Anvisa 502/2021. A lista funciona como controle interno e deve ser validada pelo Responsavel Tecnico conforme a realidade da instituicao e exigencias da Vigilancia Sanitaria local.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="todos">Todas</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="vigente">Vigente</option>
                <option value="em_revisao">Em revisao</option>
                <option value="pendente">Pendente</option>
                <option value="vencido">Vencido</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-green-600 transition-all" style={{ width: `${totals.percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{totals.percent}% dos documentos marcados como vigentes.</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/70">
              <tr>
                <th className="p-3 text-left">Codigo</th>
                <th className="p-3 text-left">Documento</th>
                <th className="p-3 text-left">Base / exigencia</th>
                <th className="p-3 text-left">Periodicidade</th>
                <th className="p-3 text-left">Responsavel</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredDocuments.map(doc => (
                <tr key={doc.id} className="align-top hover:bg-muted/30">
                  <td className="p-3 font-black text-primary">{doc.code}</td>
                  <td className="p-3">
                    <div className="font-semibold">{doc.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{doc.category}</div>
                  </td>
                  <td className="p-3">
                    <div>{doc.requirement}</div>
                    <div className="mt-1 text-xs font-medium text-muted-foreground">{doc.legalBasis}</div>
                  </td>
                  <td className="p-3">{doc.periodicity}</td>
                  <td className="p-3">{doc.responsible}</td>
                  <td className="p-3">
                    <div className="space-y-2">
                      <Badge variant={statusBadgeVariant[doc.status]}>
                        {getSanitaryStatusLabel(doc.status)}
                      </Badge>
                      <Select
                        value={doc.status}
                        onChange={e => setDocumentStatus(doc.id, e.target.value as SanitaryDocumentStatus)}
                        className="h-9 text-xs"
                      >
                        <option value="vigente">Vigente</option>
                        <option value="em_revisao">Em revisao</option>
                        <option value="pendente">Pendente</option>
                        <option value="vencido">Vencido</option>
                      </Select>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex min-w-[210px] flex-col items-end gap-2">
                      <div className="flex justify-end gap-1">
                        <Button variant={doc.isPop ? 'default' : 'outline'} size="sm" onClick={() => printDocument(doc)} className="gap-2">
                          <FileText className="h-4 w-4" />
                          {doc.isPop ? 'POP' : 'Controle'}
                        </Button>
                        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent" title="Enviar PDF deste documento">
                          {uploadingDocumentId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-primary" />}
                          {getDocumentFile(doc.id) ? 'Substituir' : 'Anexar'}
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="hidden"
                            disabled={uploadingDocumentId === doc.id}
                            onChange={e => { void uploadDocumentPdf(doc, e.target.files?.[0]); e.currentTarget.value = '' }}
                          />
                        </label>
                        {getDocumentFile(doc.id) && (
                          <Button variant="ghost" size="icon" onClick={() => void openDocumentPdf(doc.id)} title="Abrir PDF anexado">
                            <ExternalLink className="h-4 w-4 text-emerald-700" />
                          </Button>
                        )}
                      </div>
                      {getDocumentFile(doc.id) && (
                        <span className="max-w-[210px] truncate text-[10px] text-muted-foreground" title={getDocumentFile(doc.id)?.file_name}>
                          {getDocumentFile(doc.id)?.file_name}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold">Manutencao Preventiva</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Controle de certificados de controle de pragas e limpeza de caixa d'agua, com data de execucao, empresa responsavel e validade.
            </p>
          </div>
          <Button onClick={() => printPreventiveMaintenance(maintenanceRecords, clinic)} className="gap-2">
            <Printer className="h-4 w-4" />
            PDF Manutencao
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">Certificado</Label>
            <Select
              value={maintenanceForm.type}
              onChange={e => setMaintenanceForm({ ...maintenanceForm, type: e.target.value as PreventiveMaintenanceType })}
            >
              <option value="controle_pragas">Controle de pragas</option>
              <option value="limpeza_caixa_agua">Limpeza caixa d'agua</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data</Label>
            <Input type="date" value={maintenanceForm.date} onChange={e => setMaintenanceForm({ ...maintenanceForm, date: e.target.value })} />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">Empresa responsavel</Label>
            <Input value={maintenanceForm.company} onChange={e => setMaintenanceForm({ ...maintenanceForm, company: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Validade</Label>
            <Input type="date" value={maintenanceForm.validUntil} onChange={e => setMaintenanceForm({ ...maintenanceForm, validUntil: e.target.value })} />
          </div>
          <div className="space-y-1 lg:col-span-4">
            <Label className="text-xs">Observacoes</Label>
            <Input value={maintenanceForm.notes || ''} onChange={e => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={saveMaintenanceRecord} className="w-full gap-2">
              <Save className="h-4 w-4" />
              Salvar
            </Button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left">Certificado</th>
                <th className="p-3 text-left">Data</th>
                <th className="p-3 text-left">Empresa responsavel</th>
                <th className="p-3 text-left">Validade</th>
                <th className="p-3 text-left">Observacoes</th>
                <th className="p-3 text-right">Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {maintenanceRecords.length === 0 ? (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={6}>
                    Nenhum certificado cadastrado.
                  </td>
                </tr>
              ) : (
                maintenanceRecords.map(record => (
                  <tr key={record.id} className="hover:bg-muted/30">
                    <td className="p-3 font-semibold">{getMaintenanceTypeLabel(record.type)}</td>
                    <td className="p-3">{record.date ? new Date(`${record.date}T12:00:00`).toLocaleDateString('pt-BR') : ''}</td>
                    <td className="p-3">{record.company}</td>
                    <td className="p-3">{record.validUntil ? new Date(`${record.validUntil}T12:00:00`).toLocaleDateString('pt-BR') : ''}</td>
                    <td className="p-3">{record.notes || ''}</td>
                    <td className="p-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => deleteMaintenanceRecord(record.id)} className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedAppendix && (
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold">Anexos e Formularios de Registro</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Campos padronizados conforme a secao 7 do modelo da pasta sanitaria. Voce pode imprimir em branco para preenchimento manual ou gerar o PDF ja preenchido com os dados digitados aqui.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => printAllAppendices(sanitaryAppendices, {}, clinic, 50)} className="gap-2">
                <Printer className="h-4 w-4" />
                PDF Manual - Todos
              </Button>
              <Button variant="outline" onClick={() => printAllAppendices(sanitaryAppendices, appendixValues, clinic)} className="gap-2">
                <FileText className="h-4 w-4" />
                PDF Preenchido - Todos
              </Button>
              <Button variant="outline" onClick={() => printAppendix(selectedAppendix, {}, clinic, 50)} className="gap-2">
                <Printer className="h-4 w-4" />
                PDF Manual
              </Button>
              <Button onClick={() => printAppendix(selectedAppendix, selectedAppendixValues, clinic)} className="gap-2">
                <FileText className="h-4 w-4" />
                PDF Preenchido
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              <Label className="text-xs">Formulario</Label>
              <Select value={selectedAppendix.id} onChange={e => setSelectedAppendixId(e.target.value)}>
                {sanitaryAppendices.map(appendix => (
                  <option key={appendix.id} value={appendix.id}>{appendix.code} - {appendix.title}</option>
                ))}
              </Select>

              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-bold text-primary">{selectedAppendix.code}</p>
                <p className="mt-1 font-semibold">{selectedAppendix.title}</p>
                <p className="mt-2 text-xs text-muted-foreground">{selectedAppendix.purpose}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">Relacionado a: {selectedAppendix.relatedTo}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {selectedAppendix.fields.map(field => (
                <div key={field.key} className={field.type === 'textarea' ? 'space-y-1 md:col-span-2' : 'space-y-1'}>
                  <Label className="text-xs">{field.label}</Label>
                  {field.type === 'textarea' ? (
                    <Textarea
                      value={selectedAppendixValues[field.key] || ''}
                      onChange={e => setAppendixValue(selectedAppendix, field.key, e.target.value)}
                      rows={3}
                    />
                  ) : (
                    <Input
                      type={field.type || 'text'}
                      value={selectedAppendixValues[field.key] || ''}
                      onChange={e => setAppendixValue(selectedAppendix, field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
              <div className="flex items-end justify-end md:col-span-2">
                <Button variant="ghost" onClick={() => clearAppendixValues(selectedAppendix)}>
                  Limpar campos
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
