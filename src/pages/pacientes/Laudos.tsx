import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import type { Patient, PatientReport, TechnicalProfessional } from '@/lib/types'

import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { Pencil, Trash2, FileText, Loader2, Plus, Search, Wand2, Type } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { fixSpelling, normalizeCase } from '@/lib/spelling'

const emptyReport: Omit<PatientReport, 'id' | 'created_at'> = {
  patient_id: '',
  patient_name: '',
  date: new Date().toISOString().slice(0, 10),
  title: '',
  content: '',
  professional_name: ''
}

export default function Laudos() {
  const { data: reports, loading: loadingReports, insert, update, remove } = useDb<PatientReport>('patient_reports')
  const { data: patients, loading: loadingPatients } = useDb<Patient>('patients')
  const { data: professionals } = useDb<TechnicalProfessional>('technical_professionals')
  const [clinic] = useClinic()
  const { profile } = useAuth()
  
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyReport)

  const activePatients = patients.filter(p => p.status === 'ativo').sort((a, b) => a.nome.localeCompare(b.nome))

  const filtered = reports.filter(r => 
    r.patient_name.toLowerCase().includes(search.toLowerCase()) || 
    r.title.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  function openNew() { 
    setForm({
      ...emptyReport,
      date: new Date().toISOString().slice(0, 10),
      professional_name: profile?.full_name || ''
    })
    setEditingId(null) 
    setDialogOpen(true) 
  }

  function openEdit(report: PatientReport) {
    setForm({
      patient_id: report.patient_id,
      patient_name: report.patient_name,
      date: report.date,
      title: report.title,
      content: report.content,
      professional_name: report.professional_name || ''
    })
    setEditingId(report.id)
    setDialogOpen(true)
  }

  const handleFixSpelling = () => {
    const fixed = fixSpelling(form.content)
    setForm({ ...form, content: fixed })
  }

  const handleNormalizeCase = () => {
    const normalized = normalizeCase(form.content)
    setForm({ ...form, content: normalized })
  }

  async function handleSave() {
    if (!form.patient_id || !form.title || !form.content) {
      alert('Paciente, Título e Conteúdo são obrigatórios.')
      return
    }

    try {
      const selectedPatient = patients.find(p => p.id === form.patient_id)
      const payload = {
        ...form,
        patient_name: selectedPatient ? selectedPatient.nome : form.patient_name
      }

      if (editingId) {
        await update(editingId, payload)
        alert('Laudo atualizado com sucesso!')
      } else {
        await insert(payload)
        alert('Laudo registrado com sucesso!')
      }
      setDialogOpen(false)
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar laudo: ${error.message || 'Erro desconhecido'}`)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este laudo? Esta ação não pode ser desfeita.')) {
      try {
        await remove(id)
      } catch (error) {
        console.error('Erro ao excluir:', error)
        alert('Erro ao excluir laudo')
      }
    }
  }

  function printReport(report: PatientReport) {
    const selectedPatient = patients.find(p => p.id === report.patient_id)
    const patientInfo = selectedPatient ? `
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #555; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        <div><strong>Paciente:</strong> ${selectedPatient.nome}</div>
        <div><strong>Data Nasc.:</strong> ${formatDate(selectedPatient.data_nascimento)}</div>
        <div><strong>RG:</strong> ${selectedPatient.rg || 'Não informado'}</div>
      </div>
    ` : `
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #555; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
        <div><strong>Paciente:</strong> ${report.patient_name}</div>
      </div>
    `

    // Processar quebras de linha para HTML
    const formattedContent = report.content.replace(/\n/g, '<br/>')

    printPDF(`Laudo Técnico - ${report.patient_name}`, `
      ${patientInfo}
      
      <div style="margin-bottom: 30px;">
        <h3 style="font-size: 16px; border-left: 4px solid #3b82f6; padding-left: 10px; margin-bottom: 15px;">${report.title}</h3>
        <div style="font-size: 14px; line-height: 1.6; color: #333; text-align: justify;">
          ${formattedContent}
        </div>
      </div>

      <div style="margin-top: 80px; display: flex; justify-content: center;">
        <div style="text-align: center; width: 450px;">
          <div style="border-top: 1px solid #000; margin-bottom: 5px;"></div>
          <div style="font-size: 14px; font-weight: bold; line-height: 1.4;">
            ${(() => {
              let sig = report.professional_name || 'Profissional Responsável'
              const prof = professionals.find(p => sig.includes(p.nome))
              if (prof) {
                let reg = prof.coren_crm
                if (!reg.toUpperCase().includes('COREN') && !reg.toUpperCase().includes('CRM') && !reg.toUpperCase().includes('CRP')) {
                  reg = `COREN/CRM: ${reg}`
                }
                const doc = prof.cpf ? `${reg} - CPF: ${prof.cpf}` : reg
                sig = `${prof.nome}<br/><span style="font-weight: normal; font-size: 13px;">${doc}</span>`
              }
              return sig
            })()}
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 4px;">Assinatura / Carimbo</div>
        </div>
      </div>
    `, clinic)
  }

  return (
    <div>
      <PageHeader 
        title="Registro de Laudo Técnico" 
        description="Gerencie os laudos e evoluções técnicas dos pacientes"
      >
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Laudo
        </Button>
      </PageHeader>

      <Card className="p-6">
        <div className="mb-6 max-w-md">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por paciente ou título..." />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Título / Assunto</TableHead>
              <TableHead>Profissional</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingReports ? (
              <TableRow><TableCell colSpan={5}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5}><EmptyState message="Nenhum laudo encontrado" /></TableCell></TableRow>
            ) : (
              filtered.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium whitespace-nowrap">{formatDate(report.date)}</TableCell>
                  <TableCell className="font-semibold">{report.patient_name}</TableCell>
                  <TableCell>{report.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{report.professional_name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Gerar PDF" onClick={() => printReport(report)}><FileText className="h-4 w-4 text-blue-600" /></Button>
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(report)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => handleDelete(report.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} className="max-w-6xl w-[95vw] max-h-[95vh] h-[95vh] flex flex-col p-0">
        <DialogContent className="flex-1 overflow-hidden flex flex-col p-0 h-full w-full">
          <DialogHeader className="px-6 pt-6 pb-2 border-b shrink-0">
            <DialogTitle className="text-xl">{editingId ? 'Editar Laudo Técnico' : 'Novo Laudo Técnico'}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full content-start">
              <div>
                <Label>Paciente</Label>
                <Select 
                  value={form.patient_id} 
                  onChange={(e) => {
                    const id = e.target.value
                    const p = patients.find(x => x.id === id)
                    setForm({ ...form, patient_id: id, patient_name: p ? p.nome : '' })
                  }} 
                  className="mt-1"
                >
                  <option value="">Selecione um paciente...</option>
                  {loadingPatients ? (
                    <option disabled>Carregando...</option>
                  ) : (
                    activePatients.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))
                  )}
                </Select>
              </div>
              
              <div>
                <Label>Data do Laudo</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1" />
              </div>

              <div className="md:col-span-2">
                <Label>Título / Assunto Principal</Label>
                <Input 
                  value={form.title} 
                  onChange={(e) => setForm({ ...form, title: e.target.value })} 
                  className="mt-1 font-semibold" 
                  placeholder="Ex: Avaliação Psicológica, Evolução Médica, etc."
                />
              </div>

              <div className="md:col-span-2 flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-base font-semibold">Conteúdo do Laudo</Label>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleNormalizeCase}
                      className="h-8 gap-2 text-xs"
                      title="Converter de CAIXA ALTA para frase normal"
                    >
                      <Type className="h-3 w-3" /> Normalizar Case
                    </Button>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={handleFixSpelling}
                      className="h-8 gap-2 text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                      title="Corrigir erros comuns e espaçamento"
                    >
                      <Wand2 className="h-3 w-3" /> Corrigir Texto (PT-BR)
                    </Button>
                  </div>
                </div>
                <Textarea 
                  value={form.content} 
                  onChange={(e) => setForm({ ...form, content: e.target.value })} 
                  className="w-full min-h-[500px] text-base p-4 focus-visible:ring-primary/50" 
                  placeholder="Digite o texto detalhado do laudo aqui..."
                  spellCheck={true}
                />
                <p className="mt-1 text-[10px] text-muted-foreground italic">
                  * Dica: Use o botão "Corrigir" para ajustar erros comuns e espaçamento automaticamente.
                </p>
              </div>

              <div className="md:col-span-2 mt-2">
                <Label>Nome do Profissional Responsável (Assinatura)</Label>
                <Select 
                  value={form.professional_name} 
                  onChange={(e) => setForm({ ...form, professional_name: e.target.value })} 
                  className="mt-1"
                >
                  <option value="">Selecione o profissional...</option>
                  {professionals.filter(p => p.status === 'ativo').map(prof => {
                    let regLabel = prof.coren_crm;
                    if (!regLabel.toUpperCase().includes('COREN') && !regLabel.toUpperCase().includes('CRM') && !regLabel.toUpperCase().includes('CRP')) {
                      regLabel = `COREN/CRM: ${regLabel}`;
                    }
                    const docStr = prof.cpf ? `${regLabel} - CPF: ${prof.cpf}` : regLabel;
                    const valueStr = `${prof.nome} - ${docStr}`;
                    
                    return (
                      <option key={prof.id} value={valueStr}>
                        {prof.nome} ({docStr})
                      </option>
                    )
                  })}
                  {form.professional_name && !professionals.some(p => {
                    let regLabel = p.coren_crm;
                    if (!regLabel.toUpperCase().includes('COREN') && !regLabel.toUpperCase().includes('CRM') && !regLabel.toUpperCase().includes('CRP')) {
                      regLabel = `COREN/CRM: ${regLabel}`;
                    }
                    const docStr = p.cpf ? `${regLabel} - CPF: ${p.cpf}` : regLabel;
                    return `${p.nome} - ${docStr}` === form.professional_name;
                  }) && (
                    <option value={form.professional_name}>{form.professional_name}</option>
                  )}
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/10 mt-auto shrink-0">
            <Button variant="outline" size="lg" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="lg" onClick={handleSave}>Salvar Laudo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
