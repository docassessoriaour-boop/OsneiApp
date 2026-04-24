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
import { Pencil, Trash2, FileText, Loader2 } from 'lucide-react'

const emptyPatient: Omit<Patient, 'id'> = {
  nome: '', cpf: '', rg: '', idade: 0, data_nascimento: '', responsavel: '', telefoneResponsavel: '',
  resp_rg: '', resp_cpf: '', resp_endereco: '', resp_cidade: '', resp_uf: '', resp_cep: '', resp_email: '',
  resp_nacionalidade: 'Brasileira', resp_estado_civil: 'Casado(a)', resp_profissao: '',
  status: 'ativo', unidade: 'Vila Moraes', dataEntrada: new Date().toISOString().slice(0, 10), observacoes: '',
  outros_responsaveis: []
}

export default function Cadastro() {
  const { data: patients, loading, insert, update, remove } = useDb<Patient>('patients')
  const [clinic] = useClinic()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('todos')
  const [unidadeFilter, setUnidadeFilter] = useState<'todos' | 'Vila Moraes' | 'Jardim Matilde'>('todos')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyPatient)

  const filtered = patients.filter((p) => {
    const matchesSearch = p.nome.toLowerCase().includes(search.toLowerCase()) || p.cpf.includes(search)
    const matchesStatus = statusFilter === 'todos' || p.status === statusFilter
    const matchesUnidade = unidadeFilter === 'todos' || (p.unidade || 'Vila Moraes') === unidadeFilter
    return matchesSearch && matchesStatus && matchesUnidade
  })

  function openNew() { setForm(emptyPatient); setEditingId(null); setDialogOpen(true) }

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
              {loading ? (
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen} className="max-w-5xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Editar Paciente' : 'Novo Paciente'}</DialogTitle>
        </DialogHeader>
        <DialogContent className="p-8">
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
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
