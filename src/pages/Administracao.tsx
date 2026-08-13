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
import {
  getPopById,
  getSanitaryStatusLabel,
  printAppendix,
  printPop,
  printSanitaryFolderReport,
  sanitaryAppendices,
  sanitaryDocuments,
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
  ShieldCheck,
} from 'lucide-react'

type StatusOverrides = Record<string, SanitaryDocumentStatus>
type AppendixValues = Record<string, Record<string, string>>

const statusBadgeVariant: Record<SanitaryDocumentStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  pendente: 'warning',
  em_revisao: 'default',
  vigente: 'success',
  vencido: 'destructive',
}

export default function Administracao() {
  const [clinic] = useClinic()
  const [statusOverrides, setStatusOverrides] = useLocalStorage<StatusOverrides>('sanitary-document-status', {})
  const [appendixValues, setAppendixValues] = useLocalStorage<AppendixValues>('sanitary-appendix-values', {})
  const [categoryFilter, setCategoryFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [selectedAppendixId, setSelectedAppendixId] = useState(sanitaryAppendices[0]?.id || '')

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
                    <Button variant={doc.isPop ? 'default' : 'outline'} size="sm" onClick={() => printDocument(doc)} className="gap-2">
                      <FileText className="h-4 w-4" />
                      {doc.isPop ? 'POP' : 'Controle'}
                    </Button>
                  </td>
                </tr>
              ))}
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
              <Button variant="outline" onClick={() => printAppendix(selectedAppendix, {}, clinic, 12)} className="gap-2">
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
