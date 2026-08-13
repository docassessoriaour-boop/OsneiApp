import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useClinic } from '@/lib/clinicConfig'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import {
  getPopById,
  getSanitaryStatusLabel,
  printPop,
  printSanitaryFolderReport,
  sanitaryDocuments,
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

const statusBadgeVariant: Record<SanitaryDocumentStatus, 'default' | 'success' | 'warning' | 'destructive'> = {
  pendente: 'warning',
  em_revisao: 'default',
  vigente: 'success',
  vencido: 'destructive',
}

export default function Administracao() {
  const [clinic] = useClinic()
  const [statusOverrides, setStatusOverrides] = useLocalStorage<StatusOverrides>('sanitary-document-status', {})
  const [categoryFilter, setCategoryFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')

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
    </div>
  )
}
