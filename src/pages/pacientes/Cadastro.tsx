import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import type { Patient } from '@/lib/types'

import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Pencil, Trash2, FileText, Loader2, Pill, Plus, Calendar } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { Medication } from '@/lib/types'

const emptyPatient: Omit<Patient, 'id'> = {
  nome: '', cpf: '', rg: '', idade: 0, data_nascimento: '', responsavel: '', telefoneResponsavel: '',
  resp_rg: '', resp_cpf: '', resp_endereco: '', resp_cidade: '', resp_uf: '', resp_cep: '', resp_email: '',
  resp_nacionalidade: 'Brasileira', resp_estado_civil: 'Casado(a)', resp_profissao: '',
  status: 'ativo', unidade: 'Vila Moraes', dataEntrada: new Date().toISOString().slice(0, 10), observacoes: '',
  outros_responsaveis: []
}

export default function Cadastro() {
  const { data: patients, loading: loadingPatients, insert, update, remove } = useDb<Patient>('patients')
  const { data: allMedications, insert: insertMed, update: updateMed, remove: removeMed, reload: reloadMeds } = useDb<Medication>('medications')
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos')
  const [unidadeFilter, setUnidadeFilter] = useState<'todos' | 'Vila Moraes' | 'Jardim Matilde'>('todos')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPatient)
  const [medDialogOpen, setMedDialogOpen] = useState(false)
  const [editingMedId, setEditingMedId] = useState<string | null>(null)
  const [medForm, setMedForm] = useState<Partial<Medication>>({
    medicamento: '', dosagem: '', horario: '', frequencia: '', observacoes: '',
    estoque_atual: 0, estoque_minimo: 0, qtd_por_dose: 1, unidade_medida: 'comprimido',
    tipo_escala: 'regular', dias_semana: []
  })
  const [genStartTime, setGenStartTime] = useState('08:00')
  const [genFrequency, setGenFrequency] = useState('1')
  const [activeTab, setActiveTab] = useState('dados')

  const patientMedications = allMedications.filter(m => m.pacienteId === editingId)

  const filtered = patients.filter((p) => {
    const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) || p.cpf.includes(search)
    const matchesStatus = statusFilter === 'todos' || p.status === statusFilter
    const matchesUnidade = unidadeFilter === 'todos' || (p.unidade || 'Vila Moraes') === unidadeFilter
    return matchesSearch && matchesStatus && matchesUnidade
  })

  function openNew() { 
    setForm(emptyPatient); 
    setEditingId(null); 
    setActiveTab('dados');
    setDialogOpen(true) 
  }

  const calculateAge = (dob: string) => {
    if (!dob) return 0;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  function openEdit(patient: Patient) {
    const age = patient.idade || calculateAge(patient.data_nascimento);
    setForm({ ...emptyPatient, ...patient, idade: age });
    setEditingId(patient.id);
    setActiveTab('dados');
    setDialogOpen(true);
  }

  const handleDobChange = (dob: string) => {
    if (!dob) return;
    const age = calculateAge(dob);
    setForm({ ...form, data_nascimento: dob, idade: age });
  };

  async function handleSave() {
    if (!form.nome || !form.cpf) {
      alert('Nome e CPF são obrigatórios.')
      return
    }

    try {
      const { id, ...formData } = form as any
      const payload = {
        ...formData,
        data_nascimento: formData.data_nascimento || null,
        dataEntrada: formData.dataEntrada || null
      }

      if (editingId) {
        await update(editingId, payload)
        alert('Paciente atualizado com sucesso!')
      } else {
        await insert(payload)
        alert('Paciente cadastrado com sucesso!')
      }
      setDialogOpen(false)
    } catch (error: any) {
      console.error('Erro ao salvar:', error)
      alert(`Erro ao salvar paciente: ${error.message || 'Erro desconhecido'}`)
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este paciente?')) {
      try {
        await remove(id)
      } catch (error) {
        console.error('Erro ao excluir:', error)
        alert('Erro ao excluir paciente')
      }
    }
  }

  function printReport() {
    const statusLabel = statusFilter === 'todos' ? 'Todos' : statusFilter === 'ativo' ? 'Ativos' : 'Inativos'
    const unidadeLabel = unidadeFilter === 'todos' ? 'Todas as Unidades' : unidadeFilter
    const rows = filtered.map(p => `<tr><td>${p.nome}</td><td>${p.cpf}</td><td>${p.unidade || 'Vila Moraes'}</td><td>${p.responsavel}</td><td>${p.status}</td></tr>`).join('')
    printPDF(`Relatório de Pacientes - ${unidadeLabel} (${statusLabel})`, `
      <table><thead><tr><th>Nome</th><th>CPF</th><th>Unidade</th><th>Responsável</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="divider"></div>
      <div style="font-weight:700;">Total: ${filtered.length} pacientes (${unidadeLabel} - ${statusLabel.toLowerCase()})</div>
    `, clinic)
  }

  function printPatientFile(p: Patient) {
    printPDF(`Ficha Cadastral - ${p.nome}`, `
      <div style="font-size: 1.5rem; font-weight: 700; margin-bottom: 2rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; color: #1a1a1a;">
        FICHA CADASTRAL DO PACIENTE
      </div>
      
      <div style="margin-bottom: 2rem;">
        <h3 style="background: #f3f4f6; padding: 0.5rem; font-size: 1rem; text-transform: uppercase; margin-bottom: 1rem; border-left: 4px solid #3b82f6;">Dados Pessoais</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div><strong>Nome:</strong> ${p.nome}</div>
          <div><strong>CPF:</strong> ${p.cpf}</div>
          <div><strong>Unidade:</strong> ${p.unidade || 'Vila Moraes'}</div>
          <div><strong>RG:</strong> ${p.rg || '---'}</div>
          <div><strong>Data Nasc.:</strong> ${formatDate(p.data_nascimento)} (${p.idade} anos)</div>
          <div><strong>Data de Entrada:</strong> ${formatDate(p.dataEntrada)}</div>
          <div><strong>Status:</strong> ${p.status === 'ativo' ? 'Ativo' : 'Inativo'}</div>
        </div>
      </div>

      <div style="margin-bottom: 2rem;">
        <h3 style="background: #f3f4f6; padding: 0.5rem; font-size: 1rem; text-transform: uppercase; margin-bottom: 1rem; border-left: 4px solid #3b82f6;">Dados do Responsável</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div style="grid-column: span 2;"><strong>Responsável Principal:</strong> ${p.responsavel}</div>
          <div><strong>Telefone:</strong> ${p.telefoneResponsavel}</div>
          <div><strong>Email:</strong> ${p.resp_email || '---'}</div>
          <div><strong>CPF:</strong> ${p.resp_cpf || '---'}</div>
          <div><strong>RG:</strong> ${p.resp_rg || '---'}</div>
          <div style="grid-column: span 2;"><strong>Endereço:</strong> ${p.resp_endereco}</div>
          <div><strong>Cidade/UF:</strong> ${p.resp_cidade}</div>
          <div><strong>CEP:</strong> ${p.resp_cep}</div>
        </div>
        ${p.outros_responsaveis && p.outros_responsaveis.length > 0 ? `
          <h4 style="margin-top: 1rem; margin-bottom: 0.5rem; font-size: 0.9rem; border-bottom: 1px dotted #ccc;">Responsáveis Adicionais</h4>
          ${p.outros_responsaveis.map((r, i) => `
            <div style="margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid #eee; border-radius: 4px;">
              <div><strong>Responsável ${i + 2}:</strong> ${r.nome}</div>
              <div style="font-size: 0.8rem; color: #444;">CPF: ${r.cpf} | RG: ${r.rg || '---'} | Telefone: ${r.telefone || '---'}</div>
              <div style="font-size: 0.8rem; color: #444;">Nacionalidade: ${r.nacionalidade || '---'} | Estado Civil: ${r.estado_civil || '---'} | Profissão: ${r.profissao || '---'}</div>
            </div>
          `).join('')}
        ` : ''}
      </div>

      <div>
        <h3 style="background: #f3f4f6; padding: 0.5rem; font-size: 1rem; text-transform: uppercase; margin-bottom: 1rem; border-left: 4px solid #3b82f6;">Observações Gerais</h3>
        <div style="min-height: 100px; padding: 0.5rem; border: 1px solid #e5e7eb; border-radius: 4px; white-space: pre-wrap;">
          ${p.observacoes || 'Nenhuma observação registrada.'}
        </div>
      </div>

      <div style="margin-top: 5rem; display: flex; justify-content: space-around;">
        <div style="text-align: center; width: 250px;">
          <div style="border-top: 1px solid #000; margin-bottom: 0.5rem;"></div>
          <div style="font-size: 0.875rem;">Assinatura do Responsável</div>
        </div>
        <div style="text-align: center; width: 250px;">
          <div style="border-top: 1px solid #000; margin-bottom: 0.5rem;"></div>
          <div style="font-size: 0.875rem;">Assinatura da Direção</div>
        </div>
      </div>
    `, clinic)
  }

  async function handleSaveMed() {
    if (!medForm.medicamento || !editingId) return

    try {
      const payload = {
        ...medForm,
        pacienteId: editingId,
        pacienteNome: form.nome
      }

      if (editingMedId) {
        await updateMed(editingMedId, payload as any)
      } else {
        await insertMed(payload as any)
      }
      setMedDialogOpen(false)
      reloadMeds()
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar medicação')
    }
  }

  function generateSchedule(startTime: string, timesPerDay: number) {
    if (!startTime || !timesPerDay) return

    const [hour, minute] = startTime.split(':').map(Number)
    const interval = 24 / timesPerDay
    const schedule = []

    for (let i = 0; i < timesPerDay; i++) {
      const totalHours = hour + (i * interval)
      const h = Math.floor(totalHours % 24)
      let time = `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      
      // Regra específica da clínica: Substituir 20:00 por 20:30
      if (time === '20:00') {
        time = '20:30'
      }
      
      schedule.push(time)
    }

    setMedForm({
      ...medForm,
      horario: schedule.join(', '),
      frequencia: `${timesPerDay}x ao dia`
    })
  }

  function printPatientPlan() {
    if (!form.nome) return

    const rows = patientMedications.map(m => {
      let escala = m.horario || '-';
      if (m.tipo_escala === 'dias_impares') escala = 'Dias Ímpares';
      else if (m.tipo_escala === 'dias_pares') escala = 'Dias Pares';
      else if (m.tipo_escala === 'dias_semana') escala = `Dias: ${m.dias_semana?.join(', ')}`;
      else if (m.tipo_escala === 'se_necessario') escala = 'Se Necessário';
      else if (m.tipo_escala === 'regular') escala = `Horários: ${m.horario} <br/><span style="font-size:11px; color:#666;">${m.frequencia || ''}</span>`;

      return `
        <tr>
          <td>
            <strong>${m.medicamento}</strong><br/>
            <span style="font-size: 11px; color: #555;">${m.dosagem || ''}</span>
          </td>
          <td>${escala}</td>
          <td>${m.qtd_por_dose || 1} ${m.unidade_medida || 'un'}</td>
          <td>${m.observacoes || '-'}</td>
        </tr>
      `
    }).join('')

    printPDF(`Plano Terapêutico - ${form.nome}`, `
      <style>
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: middle; }
        th { background-color: #f8fafc; font-size: 13px; font-weight: bold; color:#334155; }
        td { font-size: 13px; line-height: 1.4; }
      </style>
      <div style="margin-bottom: 20px;">
        <h3 style="background: #e2e8f0; padding: 10px; border-radius: 4px; margin-bottom: 8px; font-size: 16px; border-left: 4px solid #334155;">
            Paciente: ${form.nome}
        </h3>
        <p style="font-size: 12px; color: #666; margin-left: 5px;">Plano Terapêutico de Medicações - Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
      </div>
      
      ${patientMedications.length === 0 ? '<p>Nenhuma medicação cadastrada para este paciente.</p>' : `
        <table>
          <thead>
            <tr>
              <th style="width: 35%;">Medicamento</th>
              <th style="width: 30%;">Posologia / Escala</th>
              <th style="width: 15%;">Qtd por Dose</th>
              <th style="width: 20%;">Observações</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `}
    `, clinic, { hideClinicHeader: true })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
          <p className="text-muted-foreground">Cadastro completo de pacientes e responsáveis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printReport} className="gap-2"><FileText className="h-4 w-4" /> PDF</Button>
          <Button onClick={openNew}>Novo Paciente</Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome ou CPF..." />
          </div>
          <div className="w-full md:w-36">
            <Select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="todos">Status</option>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
            </Select>
          </div>
          <div className="w-full md:w-44">
            <Select 
              value={unidadeFilter} 
              onChange={(e) => setUnidadeFilter(e.target.value as any)}
            >
              <option value="todos">Todas as Unidades</option>
              <option value="Vila Moraes">Vila Moraes</option>
              <option value="Jardim Matilde">Jardim Matilde</option>
            </Select>
          </div>
        </div>
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Unidade / Idade</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingPatients ? (
                <TableRow><TableCell colSpan={6}><div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState message="Nenhum paciente cadastrado" /></TableCell></TableRow>
              ) : (
                filtered.map((patient) => (
                  <TableRow key={patient.id}>
                    <TableCell className="font-medium">{patient.nome}</TableCell>
                    <TableCell>{patient.cpf}</TableCell>
                    <TableCell>
                      <div>{patient.unidade || 'Vila Moraes'}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {patient.idade || calculateAge(patient.data_nascimento)} anos
                      </div>
                    </TableCell>
                    <TableCell>{patient.responsavel}</TableCell>
                    <TableCell>
                      <Badge variant={patient.status === 'ativo' ? 'success' : 'destructive'}>
                        {patient.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Ficha Cadastral" onClick={() => printPatientFile(patient)}><FileText className="h-4 w-4 text-blue-600" /></Button>
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(patient)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Excluir" onClick={() => handleDelete(patient.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} className="max-w-7xl w-[98vw] max-h-[95vh]">
        <DialogContent className="p-0 overflow-hidden flex flex-col h-[95vh]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{editingId ? 'Editar Paciente' : 'Novo Paciente'}</DialogTitle>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
            <div className="px-6 pt-4 border-b bg-muted/20">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="dados" className="gap-2"><FileText className="h-4 w-4" /> Dados do Paciente</TabsTrigger>
                <TabsTrigger value="medicacao" disabled={!editingId} className="gap-2">
                  <Pill className="h-4 w-4" /> Medicações {!editingId && <span className="text-[10px] ml-1">(Salvar primeiro)</span>}
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="dados" className="m-0 border-0 p-0">
                <div className="space-y-6">
            {/* Seção Paciente */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Dados do Paciente</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="md:col-span-1"><Label>Nome Completo</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1" /></div>
                <div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="mt-1" /></div>
                <div><Label>RG</Label><Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} className="mt-1" /></div>
                <div><Label>Data de Nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e) => handleDobChange(e.target.value)} className="mt-1" /></div>
                <div><Label>Idade</Label><Input type="number" value={form.idade} readOnly className="mt-1 bg-muted" /></div>
                <div><Label>Data de Entrada</Label><Input type="date" value={form.dataEntrada} onChange={(e) => setForm({ ...form, dataEntrada: e.target.value })} className="mt-1" /></div>
                <div><Label>Status</Label><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Patient['status'] })} className="mt-1"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></Select></div>
                <div>
                  <Label>Unidade de Internação</Label>
                  <Select value={form.unidade || 'Vila Moraes'} onChange={(e) => setForm({ ...form, unidade: e.target.value as Patient['unidade'] })} className="mt-1">
                    <option value="Vila Moraes">Vila Moraes</option>
                    <option value="Jardim Matilde">Jardim Matilde</option>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Dados do Responsável</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="md:col-span-2"><Label>Nome do Responsável Principal</Label><Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="mt-1" /></div>
                <div><Label>Telefone</Label><Input value={form.telefoneResponsavel} onChange={(e) => setForm({ ...form, telefoneResponsavel: e.target.value })} className="mt-1" /></div>
                <div><Label>RG</Label><Input value={form.resp_rg} onChange={(e) => setForm({ ...form, resp_rg: e.target.value })} className="mt-1" /></div>
                <div><Label>CPF</Label><Input value={form.resp_cpf} onChange={(e) => setForm({ ...form, resp_cpf: e.target.value })} className="mt-1" /></div>
                <div><Label>CEP</Label><Input value={form.resp_cep} onChange={(e) => setForm({ ...form, resp_cep: e.target.value })} className="mt-1" /></div>
                <div className="md:col-span-2"><Label>Endereço</Label><Input value={form.resp_endereco} onChange={(e) => setForm({ ...form, resp_endereco: e.target.value })} className="mt-1" /></div>
                <div><Label>Cidade (UF)</Label><Input value={form.resp_cidade} onChange={(e) => setForm({ ...form, resp_cidade: e.target.value })} placeholder="Ex: São Paulo - SP" className="mt-1" /></div>
                <div className="md:col-span-2"><Label>E-mail</Label><Input type="email" value={form.resp_email} onChange={(e) => setForm({ ...form, resp_email: e.target.value })} className="mt-1" /></div>
                <div><Label>Nacionalidade</Label><Input value={form.resp_nacionalidade} onChange={(e) => setForm({ ...form, resp_nacionalidade: e.target.value })} className="mt-1" /></div>
                <div><Label>Estado Civil</Label><Input value={form.resp_estado_civil} onChange={(e) => setForm({ ...form, resp_estado_civil: e.target.value })} className="mt-1" /></div>
                <div><Label>Profissão</Label><Input value={form.resp_profissao} onChange={(e) => setForm({ ...form, resp_profissao: e.target.value })} className="mt-1" /></div>
              </div>
            </div>

            {/* Seção Responsáveis Adicionais */}
            <div className="border-t pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Responsáveis Adicionais</h3>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const others = form.outros_responsaveis || [];
                    setForm({ ...form, outros_responsaveis: [...others, { nome: '', cpf: '', rg: '', telefone: '', email: '', endereco: '', cidade: '', uf: '', cep: '', nacionalidade: 'Brasileira', estado_civil: 'Casado(a)', profissao: '' }] });
                  }}
                >
                  + Adicionar Responsável
                </Button>
              </div>
              
              <div className="space-y-4">
                {(form.outros_responsaveis || []).map((resp, idx) => (
                  <Card key={idx} className="p-4 bg-muted/30 relative">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 text-destructive"
                      onClick={() => {
                        const others = [...(form.outros_responsaveis || [])];
                        others.splice(idx, 1);
                        setForm({ ...form, outros_responsaveis: others });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <Label>Nome do Responsável {idx + 2}</Label>
                        <Input 
                          value={resp.nome} 
                          onChange={(e) => {
                            const others = [...(form.outros_responsaveis || [])];
                            others[idx].nome = e.target.value;
                            setForm({ ...form, outros_responsaveis: others });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                      <div>
                        <Label>CPF</Label>
                        <Input 
                          value={resp.cpf} 
                          onChange={(e) => {
                            const others = [...(form.outros_responsaveis || [])];
                            others[idx].cpf = e.target.value;
                            setForm({ ...form, outros_responsaveis: others });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                      <div>
                        <Label>Telefone</Label>
                        <Input 
                          value={resp.telefone} 
                          onChange={(e) => {
                            const others = [...(form.outros_responsaveis || [])];
                            others[idx].telefone = e.target.value;
                            setForm({ ...form, outros_responsaveis: others });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                      <div>
                        <Label>E-mail</Label>
                        <Input 
                          value={resp.email} 
                          onChange={(e) => {
                            const others = [...(form.outros_responsaveis || [])];
                            others[idx].email = e.target.value;
                            setForm({ ...form, outros_responsaveis: others });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                      <div>
                        <Label>RG</Label>
                        <Input 
                          value={resp.rg} 
                          onChange={(e) => {
                            const others = [...(form.outros_responsaveis || [])];
                            others[idx].rg = e.target.value;
                            setForm({ ...form, outros_responsaveis: others });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                      <div>
                        <Label>Nacionalidade</Label>
                        <Input 
                          value={resp.nacionalidade} 
                          onChange={(e) => {
                            const others = [...(form.outros_responsaveis || [])];
                            others[idx].nacionalidade = e.target.value;
                            setForm({ ...form, outros_responsaveis: others });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                      <div>
                        <Label>Estado Civil</Label>
                        <Input 
                          value={resp.estado_civil} 
                          onChange={(e) => {
                            const others = [...(form.outros_responsaveis || [])];
                            others[idx].estado_civil = e.target.value;
                            setForm({ ...form, outros_responsaveis: others });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                      <div>
                        <Label>Profissão</Label>
                        <Input 
                          value={resp.profissao} 
                          onChange={(e) => {
                            const castedOthers = [...(form.outros_responsaveis || [])] as any[];
                            castedOthers[idx].profissao = e.target.value;
                            setForm({ ...form, outros_responsaveis: castedOthers });
                          }} 
                          className="mt-1" 
                        />
                      </div>
                    </div>
                  </Card>
                ))}
                {(form.outros_responsaveis || []).length === 0 && (
                  <p className="text-xs text-muted-foreground italic text-center py-2">Nenhum responsável adicional cadastrado.</p>
                )}
              </div>
            </div>

            <div className=""><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1 min-h-[150px] text-base" /></div>
          </div>
        </TabsContent>

        <TabsContent value="medicacao" className="m-0 border-0 p-0">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold">Plano Terapêutico de Medicações</h3>
              <p className="text-sm text-muted-foreground">Gerencie as medicações e horários de {form.nome}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={printPatientPlan} variant="outline" className="gap-2">
                <FileText className="h-4 w-4" /> Imprimir Plano
              </Button>
              <Button onClick={() => {
                setMedForm({
                  medicamento: '', dosagem: '', horario: '', frequencia: '', observacoes: '',
                  estoque_atual: 0, estoque_minimo: 0, qtd_por_dose: 1, unidade_medida: 'comprimido',
                  tipo_escala: 'regular', dias_semana: []
                })
                setEditingMedId(null)
                setMedDialogOpen(true)
              }} className="gap-2">
                <Plus className="h-4 w-4" /> Adicionar Medicação
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {patientMedications.length === 0 ? (
              <EmptyState message="Nenhuma medicação cadastrada para este paciente." />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medicamento</TableHead>
                      <TableHead>Posologia / Escala</TableHead>
                      <TableHead>Estoque</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patientMedications.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-bold">{m.medicamento}</div>
                          <div className="text-xs text-muted-foreground">{m.dosagem}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {m.tipo_escala === 'regular' ? (
                              <>
                                <span className="font-medium">Horários:</span> {m.horario}
                                <div className="text-[10px] text-muted-foreground">{m.frequencia}</div>
                              </>
                            ) : m.tipo_escala === 'dias_impares' ? (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Dias Ímpares</Badge>
                            ) : m.tipo_escala === 'dias_pares' ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Dias Pares</Badge>
                            ) : m.tipo_escala === 'se_necessario' ? (
                              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Se Necessário</Badge>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Dias Específicos</Badge>
                                <span className="text-[10px]">{m.dias_semana?.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">
                            {m.estoque_atual} {m.unidade_medida}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => {
                              setMedForm(m)
                              setEditingMedId(m.id)
                              setMedDialogOpen(true)
                            }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={async () => {
                              if (confirm('Excluir esta medicação?')) {
                                await removeMed(m.id)
                                await reloadMeds()
                              }
                            }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          </TabsContent>
        </div>
        <DialogFooter className="px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Fechar</Button>
          <Button onClick={handleSave}>Salvar Paciente</Button>
        </DialogFooter>
      </Tabs>
    </DialogContent>
  </Dialog>

      {/* Dialog de Cadastro de Medicação */}
      <Dialog open={medDialogOpen} onOpenChange={setMedDialogOpen} className="max-w-2xl w-[90vw]">
        <DialogContent className="">
          <DialogHeader>
            <DialogTitle>{editingMedId ? 'Editar Medicação' : 'Nova Medicação'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Medicamento</Label><Input value={medForm.medicamento} onChange={(e) => setMedForm({ ...medForm, medicamento: e.target.value })} className="mt-1" /></div>
              <div><Label>Dosagem</Label><Input value={medForm.dosagem} onChange={(e) => setMedForm({ ...medForm, dosagem: e.target.value })} placeholder="Ex: 10mg" className="mt-1" /></div>
            </div>

            <div>
              <Label>Tipo de Escala / Posologia</Label>
              <Select 
                value={medForm.tipo_escala || 'regular'} 
                onChange={(e) => setMedForm({ ...medForm, tipo_escala: e.target.value as any })}
                className="mt-1"
              >
                <option value="regular">Regular (Horários fixos)</option>
                <option value="dias_impares">Tomar em Dias Ímpares</option>
                <option value="dias_pares">Tomar em Dias Pares</option>
                <option value="dias_semana">Dias da Semana Específicos</option>
                <option value="se_necessario">Se Necessário</option>
              </Select>
            </div>

            {medForm.tipo_escala === 'regular' && (
              <div className="bg-muted/30 p-3 rounded-lg border space-y-3">
                <p className="text-[10px] font-semibold text-primary uppercase">Gerador de Horários</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[10px]">Horário Inicial</Label>
                    <Input type="time" value={genStartTime} onChange={(e) => setGenStartTime(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-[10px]">Vezes ao dia</Label>
                    <Select value={genFrequency} onChange={(e) => setGenFrequency(e.target.value)} className="h-8 text-sm">
                      <option value="1">1x ao dia</option>
                      <option value="2">2x ao dia</option>
                      <option value="3">3x ao dia</option>
                      <option value="4">4x ao dia</option>
                      <option value="6">6x ao dia</option>
                      <option value="8">8x ao dia</option>
                      <option value="12">12x ao dia</option>
                    </Select>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full h-7 text-[10px]" onClick={() => generateSchedule(genStartTime, Number(genFrequency))}>
                  Gerar Escala de Horários
                </Button>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label className="text-xs">Horário (Final)</Label><Input value={medForm.horario} onChange={(e) => setMedForm({ ...medForm, horario: e.target.value })} placeholder="08:00, 20:00" className="mt-1 h-8" /></div>
                  <div><Label className="text-xs">Frequência (Final)</Label><Input value={medForm.frequencia} onChange={(e) => setMedForm({ ...medForm, frequencia: e.target.value })} placeholder="2x ao dia" className="mt-1 h-8" /></div>
                </div>
              </div>
            )}

            {medForm.tipo_escala === 'dias_semana' && (
              <div className="bg-muted/30 p-3 rounded-lg border">
                <Label className="text-xs mb-2 block">Selecione os dias:</Label>
                <div className="flex flex-wrap gap-2">
                  {['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map(dia => (
                    <Button 
                      key={dia} 
                      variant={medForm.dias_semana?.includes(dia) ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => {
                        const dias = medForm.dias_semana || []
                        if (dias.includes(dia)) {
                          setMedForm({ ...medForm, dias_semana: dias.filter(d => d !== dia) })
                        } else {
                          setMedForm({ ...medForm, dias_semana: [...dias, dia] })
                        }
                      }}
                    >
                      {dia}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
              <p className="text-[10px] font-semibold text-primary uppercase mb-3">Estoque e Dose</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <Label className="text-xs">Qtd. por Dose</Label>
                  <div className="flex gap-1 mt-1">
                    <Input type="number" step="0.5" value={medForm.qtd_por_dose} onChange={(e) => setMedForm({ ...medForm, qtd_por_dose: Number(e.target.value) })} />
                    <Button variant="outline" size="sm" onClick={() => setMedForm({ ...medForm, qtd_por_dose: 0.5 })} className="px-2 text-[10px]">1/2</Button>
                  </div>
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Unidade</Label>
                  <Select value={medForm.unidade_medida} onChange={(e) => setMedForm({ ...medForm, unidade_medida: e.target.value })} className="mt-1">
                    <option value="comprimido">Comp.</option>
                    <option value="ml">ml</option>
                    <option value="gotas">Gotas</option>
                    <option value="ampola">Amp.</option>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Estoque Atual</Label>
                  <Input type="number" value={medForm.estoque_atual} onChange={(e) => setMedForm({ ...medForm, estoque_atual: Number(e.target.value) })} className="mt-1" />
                </div>
              </div>
            </div>

            <div><Label>Observações / Instruções</Label><Textarea value={medForm.observacoes} onChange={(e) => setMedForm({ ...medForm, observacoes: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMedDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveMed}>Salvar Medicação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
