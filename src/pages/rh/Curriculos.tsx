import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { useClinic } from '@/lib/clinicConfig'
import type { Curriculum, Employee } from '@/lib/types'

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
import { Pencil, Trash2, UserPlus, Loader2, FileText, Calendar, MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { printPDF } from '@/lib/pdf'
import { formatDate } from '@/lib/utils'

function calculateAge(birthDate?: string) {
  if (!birthDate) return null
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

const emptyCurriculum: Omit<Curriculum, 'id'> = {
  nome: '',
  telefone: '',
  endereco: '',
  rg: '',
  cpf: '',
  cargo_pretendido: '',
  status: 'em_analise',
  data_nascimento: ''
}

export default function Curriculos() {
  const [clinic] = useClinic()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyCurriculum)
  const { data: curriculums, loading, insert, update, remove, reload } = useDb<Curriculum>('curriculums')
  const { insert: insertEmployee } = useDb<Employee>('employees')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [selectedCurriculum, setSelectedCurriculum] = useState<Curriculum | null>(null)
  const [interviewForm, setInterviewForm] = useState({
    data: '',
    hora: '',
    local: 'Unidade Vila Moraes'
  })
  const navigate = useNavigate()

  const filtered = curriculums.filter((c) => {
    const searchLower = search.toLowerCase()
    const matchesName = c.nome.toLowerCase().includes(searchLower)
    const matchesCpf = c.cpf ? c.cpf.includes(search) : false
    const matchesRg = c.rg ? c.rg.includes(search) : false
    return matchesName || matchesCpf || matchesRg
  })

  function printReport() {
    const rows = filtered.map(c => `<tr><td>${c.nome}</td><td>${c.telefone}</td><td>${c.rg} / ${c.cpf}</td><td>${c.cargo_pretendido || '—'}</td><td>${c.endereco || '—'}</td></tr>`).join('')
    printPDF('Banco de Currículos Aprovados', `
      <table><thead><tr><th>Nome</th><th>Telefone</th><th>RG / CPF</th><th>Cargo Pretendido</th><th>Endereço</th></tr></thead>
      <tbody>${rows}</tbody></table>
    `, clinic)
  }

  function openNew() {
    setForm({ ...emptyCurriculum })
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(curr: Curriculum) {
    setForm({ ...curr })
    setEditingId(curr.id)
    setDialogOpen(true)
  }

  function openSchedule(curr: Curriculum) {
    setSelectedCurriculum(curr)
    setInterviewForm({
      data: curr.data_entrevista || '',
      hora: curr.hora_entrevista || '',
      local: curr.local_entrevista || 'Unidade Vila Moraes'
    })
    setScheduleDialogOpen(true)
  }

  async function handleSaveSchedule() {
    if (!selectedCurriculum) return
    if (!interviewForm.data || !interviewForm.hora || !interviewForm.local) {
      alert('Por favor, preencha todos os campos do agendamento.')
      return
    }

    try {
      setSaving(true)
      const updatedCurr = {
        ...selectedCurriculum,
        data_entrevista: interviewForm.data,
        hora_entrevista: interviewForm.hora,
        local_entrevista: interviewForm.local
      }
      await update(selectedCurriculum.id, updatedCurr)
      
      // Gerar PDF
      printInterviewPDF(updatedCurr)
      
      setScheduleDialogOpen(false)
      alert('Entrevista agendada e comprovante gerado!')
    } catch (error) {
      console.error('Erro ao agendar entrevista:', error)
      alert('Erro ao agendar entrevista')
    } finally {
      setSaving(false)
    }
  }

  function printInterviewPDF(curr: Curriculum) {
    const bodyHtml = `
      <div style="font-size: 16px; line-height: 1.8; text-align: justify; margin-bottom: 40px; margin-top: 20px;">
        <p>Prezado(a) <strong>${curr.nome}</strong>,</p>
        
        <p>Temos o prazer de convidá-lo(a) para uma entrevista referente à vaga de <strong>${curr.cargo_pretendido || 'Candidato'}</strong> em nossa instituição.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e0e0e0;">
          <p style="margin: 0; font-weight: bold; color: #1a1f2e; margin-bottom: 8px;">DETALHES DO AGENDAMENTO:</p>
          <p style="margin: 4px 0;"><strong>Data:</strong> ${formatDate(curr.data_entrevista!)}</p>
          <p style="margin: 4px 0;"><strong>Horário:</strong> ${curr.hora_entrevista}</p>
          <p style="margin: 4px 0;"><strong>Local:</strong> ${curr.local_entrevista}</p>
        </div>

        <p>Caso haja algum imprevisto que impeça sua participação, por favor, entre em contato através do telefone <strong>(14) 99184-0628 (WhatsApp)</strong> o quanto antes para reagendarmos.</p>
        
        <p>Atenciosamente,</p>
        
        <div style="margin-top: 40px;">
          <p><strong>Departamento de Recursos Humanos</strong></p>
          <p>${clinic?.razao_social || (clinic as any)?.name || (clinic as any)?.nome_fantasia || ''}</p>
        </div>
      </div>
    `
    printPDF('CONVITE PARA ENTREVISTA', bodyHtml, clinic)
  }

  async function handleSave() {
    if (!form.nome) {
      alert('Por favor, preencha o nome.')
      return
    }
    try {
      setSaving(true)
      
      // Sanitizar dados: strings vazias em campos de data devem ser null para o Postgres
      const payload = {
        ...form,
        data_nascimento: form.data_nascimento || null
      }

      if (editingId) {
        await update(editingId, payload as Curriculum)
      } else {
        await insert(payload as Curriculum)
      }
      setDialogOpen(false)
      alert('Currículo salvo com sucesso!')
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar currículo: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este currículo?')) {
      try {
        await remove(id)
        await reload()
        alert('Currículo excluído com sucesso!')
      } catch (error: any) {
        console.error('Erro ao excluir:', error)
        alert(`Erro ao excluir currículo: ${error.message || 'Erro desconhecido'}`)
      }
    }
  }

  async function promoteToEmployee(curr: Curriculum) {
    if (confirm(`Deseja cadastrar ${curr.nome} como funcionário(a)?`)) {
      try {
        const newEmployee: Omit<Employee, 'id'> = {
          nome: curr.nome,
          cpf: curr.cpf,
          rg: curr.rg,
          telefone: curr.telefone,
          endereco: curr.endereco,
          cargo: curr.cargo_pretendido || '',
          unidade: 'Vila Moraes',
          turno: 'Diurno',
          escala: '12x36',
          salario: 0,
          status: 'ativo',
          dataAdmissao: new Date().toISOString().slice(0, 10),
          email: '',
          tem_vt: false,
          vt_valor: 0,
          tem_insalubridade: false,
          insalubridade_percentual: 0,
        }
        
        await insertEmployee(newEmployee)
        alert('Funcionário cadastrado com sucesso! Redirecionando para a página de funcionários...')
        navigate('/rh/funcionarios')
      } catch (error) {
        console.error('Erro ao promover:', error)
        alert('Erro ao promover currículo para funcionário')
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Currículos Aprovados</h1>
          <p className="text-muted-foreground">Banco de talentos para novas contratações</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printReport} className="gap-2"><FileText className="h-4 w-4" /> PDF</Button>
          <Button onClick={openNew}>Novo Currículo</Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome ou CPF..." />
          </div>
        </div>

        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Corpo / Idade</TableHead>
                <TableHead>RG / CPF</TableHead>
                <TableHead>Cargo / Cadastro</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState message="Nenhum currículo cadastrado" /></TableCell></TableRow>
              ) : (
                filtered.map((curr) => (
                  <TableRow key={curr.id}>
                    <TableCell className="font-medium">
                      <div>{curr.nome}</div>
                      {curr.data_nascimento && (
                        <div className="text-xs text-muted-foreground">
                          {formatDate(curr.data_nascimento)} ({calculateAge(curr.data_nascimento)} anos)
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{curr.telefone}</TableCell>
                    <TableCell>
                      <div>RG: {curr.rg || '—'}</div>
                      <div className="text-xs text-muted-foreground">CPF: {curr.cpf || '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div>{curr.cargo_pretendido || '—'}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Cadastrado em: {curr.created_at ? formatDate(curr.created_at) : '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        curr.status === 'aprovado' ? 'success' : 
                        curr.status === 'em_analise' ? 'warning' : 
                        curr.status === 'agendar_entrevista' ? 'default' : 
                        'destructive'
                      }>
                        {curr.status === 'aprovado' ? 'Aprovado' : 
                         curr.status === 'em_analise' ? 'Em Análise' : 
                         curr.status === 'agendar_entrevista' ? 'Agendar Entrevista' : 
                         'Rejeitado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        {curr.status === 'agendar_entrevista' && (
                          <Button variant="ghost" size="icon" onClick={() => openSchedule(curr)} title="Agendar Entrevista">
                            <Calendar className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => promoteToEmployee(curr)} title="Contratar (Virar Funcionário)">
                          <UserPlus className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(curr)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(curr.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Currículo' : 'Novo Currículo'}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nome Completo</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Cargo Pretendido</Label>
              <Input value={form.cargo_pretendido} onChange={(e) => setForm({ ...form, cargo_pretendido: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Data de Nascimento</Label>
              <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>RG</Label>
              <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Endereço</Label>
              <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Status do Currículo</Label>
              <Select 
                value={form.status} 
                onChange={(e) => setForm({ ...form, status: e.target.value as Curriculum['status'] })} 
                className="mt-1"
              >
                <option value="em_analise">Em Análise</option>
                <option value="agendar_entrevista">Agendar Entrevista</option>
                <option value="aprovado">Aprovado</option>
                <option value="rejeitado">Rejeitado</option>
              </Select>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingId ? 'Salvar Alterações' : 'Salvar Currículo'}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogHeader>
          <DialogTitle>Agendar Entrevista - {selectedCurriculum?.nome}</DialogTitle>
        </DialogHeader>
        <DialogContent>
          <div className="grid grid-cols-1 gap-4 pt-4">
            <div>
              <Label>Data da Entrevista</Label>
              <div className="relative mt-1">
                <Input 
                  type="date" 
                  value={interviewForm.data} 
                  onChange={(e) => setInterviewForm({ ...interviewForm, data: e.target.value })} 
                />
              </div>
            </div>
            <div>
              <Label>Horário</Label>
              <Input 
                type="time" 
                value={interviewForm.hora} 
                onChange={(e) => setInterviewForm({ ...interviewForm, hora: e.target.value })} 
                className="mt-1"
              />
            </div>
            <div>
              <Label>Local / Link</Label>
              <div className="relative mt-1">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  value={interviewForm.local} 
                  onChange={(e) => setInterviewForm({ ...interviewForm, local: e.target.value })} 
                  className="pl-9"
                  placeholder="Ex: Unidade Vila Moraes ou Link do Meet"
                />
              </div>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSaveSchedule} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Agendar e Gerar PDF
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
