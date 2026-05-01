import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import type { Patient, Medication } from '@/lib/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchBar } from '@/components/shared/SearchBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { useClinic } from '@/lib/clinicConfig'
import { printPDF } from '@/lib/pdf'
import { Pencil, Trash2, Loader2, FileText } from 'lucide-react'

export default function Medicacao() {
  const [clinic] = useClinic()
  const { data: rawPatients } = useDb<Patient>('patients')
  const { data: rawMedications, loading } = useDb<Medication>('medications')

  const patients = rawPatients.filter(p => p.status !== 'inativo').sort((a, b) => a.nome.localeCompare(b.nome))
  const activePatientIds = patients.map(p => p.id)
  const medications = rawMedications.filter(m => activePatientIds.includes(m.pacienteId))
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')

  const [selectedPatientId, setSelectedPatientId] = useState('all')

  const filtered = medications.filter(m =>
    (m.pacienteNome || '').toLowerCase().includes(search.toLowerCase()) ||
    m.medicamento.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    const patientCompare = (a.pacienteNome || '').localeCompare(b.pacienteNome || '');
    if (patientCompare !== 0) return patientCompare;

    const getFirstTime = (m: Medication) => {
      if (m.tipo_escala !== 'regular' || !m.horario) return '99:99';
      const times = m.horario.split(',').map(t => t.trim()).filter(t => /^([01]\d|2[0-3]):([0-5]\d)$/.test(t));
      return times.length > 0 ? times.sort()[0] : '99:99';
    };

    return getFirstTime(a).localeCompare(getFirstTime(b));
  })

  function calculateDailyConsumption(m: Medication) {
    if (!m.horario) return 0
    const timesPerDay = m.horario.split(',').length
    return timesPerDay * (m.qtd_por_dose || 0)
  }

  function calculateDaysRemaining(m: Medication) {
    const consumption = calculateDailyConsumption(m)
    if (consumption <= 0 || !m.estoque_atual) return 0
    return Math.floor(m.estoque_atual / consumption)
  }

  function printReport() {
    let targetPatients = patients
    
    if (selectedPatientId !== 'all') {
      targetPatients = patients.filter(p => p.id === selectedPatientId)
    } else if (search) {
      targetPatients = patients.filter(p => p.nome.toLowerCase().includes(search.toLowerCase()))
    }

    targetPatients = [...targetPatients].sort((a, b) => a.nome.localeCompare(b.nome))

    const htmlContent = targetPatients.map(patient => {
      const patientMeds = medications.filter(m => m.pacienteId === patient.id)
      if (patientMeds.length === 0) return ''

      const standardTimes = ['06:00', '08:00', '12:00', '14:00', '18:00', '20:30'];
      const standardGroups: Record<string, Medication[]> = {};
      standardTimes.forEach(st => { standardGroups[st] = []; });
      const specialItems: { med: Medication, timeStr: string }[] = [];

      patientMeds.forEach(m => {
          // Send all non-regular or special cases directly to the special (red) list
          if (m.tipo_escala !== 'regular' && m.tipo_escala !== null && m.tipo_escala !== undefined) {
              let timeStr = m.horario || '-';
              if (m.tipo_escala === 'se_necessario') timeStr = 'Se Necessário';
              else if (m.tipo_escala === 'dias_impares') timeStr += ' (Ímpares)';
              else if (m.tipo_escala === 'dias_pares') timeStr += ' (Pares)';
              else if (m.tipo_escala === 'dias_semana') timeStr += ` (${m.dias_semana?.join(', ')})`;
              
              specialItems.push({ med: m, timeStr });
              return;
          }

          const times = m.horario ? m.horario.split(',').map(t => t.trim()) : [];
          
          if (times.length === 0) {
              specialItems.push({ med: m, timeStr: 'Horário não definido' });
              return;
          }

          times.forEach(t => {
              if (standardTimes.includes(t)) {
                  standardGroups[t].push(m);
              } else {
                  specialItems.push({ med: m, timeStr: t });
              }
          });
      });

      let mainTableHtml = '';
      standardTimes.forEach(st => {
          const meds = standardGroups[st];
          if (meds.length > 0) {
              mainTableHtml += `
                  <div style="margin-bottom: 6px; page-break-inside: avoid; break-inside: avoid;">
                      <h4 style="margin: 0; background: #f8fafc; padding: 3px; border: 1px solid #cbd5e1; border-bottom: none; text-align: center; color: #1e293b; font-size: 11px;">${st}</h4>
                      <table style="width: 100%; border-collapse: collapse; margin-top: 0;">
                          <thead>
                              <tr>
                                  <th style="border: 1px solid #cbd5e1; padding: 3px 4px; width: 40%; font-size:10px; background: #fff;">Medicamento</th>
                                  <th style="border: 1px solid #cbd5e1; padding: 3px 4px; width: 30%; font-size:10px; background: #fff;">Dosagem</th>
                                  <th style="border: 1px solid #cbd5e1; padding: 3px 4px; width: 30%; font-size:10px; background: #fff;">Posologia</th>
                              </tr>
                          </thead>
                          <tbody>
                              ${meds.map(m => `
                                  <tr>
                                      <td style="border: 1px solid #cbd5e1; padding: 3px 4px; font-weight: bold; font-size:11px;">${m.medicamento}</td>
                                      <td style="border: 1px solid #cbd5e1; padding: 3px 4px; font-size:11px;">${m.dosagem || '-'}</td>
                                      <td style="border: 1px solid #cbd5e1; padding: 3px 4px; font-size:11px;">${m.qtd_por_dose || 1} ${m.unidade_medida || 'un'}</td>
                                  </tr>
                              `).join('')}
                          </tbody>
                      </table>
                  </div>
              `;
          }
      });

      if (!mainTableHtml) {
          mainTableHtml = `<p style="font-size: 11px; color: #666; margin-bottom: 8px;">Nenhum medicamento nos horários padrão.</p>`;
      }

      const specialHtml = specialItems.length > 0 ? `
          <div style="margin-top: 8px; border: 2px solid #fee2e2; background: #fff5f5; padding: 6px; border-radius: 4px; page-break-inside: avoid; break-inside: avoid;">
              <h4 style="color: #dc2626; margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase;">Atenção: Horários Fora do Padrão / Especiais</h4>
              <table style="width: 100%; border-collapse: collapse; margin-top: 0;">
                  <thead>
                      <tr>
                          <th style="color: #dc2626; background: #fee2e2; padding: 3px 4px; border: 1px solid #fca5a5; width: 25%; font-size:10px;">Horário</th>
                          <th style="color: #dc2626; background: #fee2e2; padding: 3px 4px; border: 1px solid #fca5a5; width: 30%; font-size:10px;">Medicamento</th>
                          <th style="color: #dc2626; background: #fee2e2; padding: 3px 4px; border: 1px solid #fca5a5; width: 15%; font-size:10px;">Quantidade</th>
                          <th style="color: #dc2626; background: #fee2e2; padding: 3px 4px; border: 1px solid #fca5a5; font-size:10px;">Observações</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${specialItems.map(item => `
                          <tr>
                              <td style="color: #dc2626; font-weight: bold; padding: 3px 4px; border: 1px solid #fca5a5; font-size:11px;">${item.timeStr}</td>
                              <td style="color: #dc2626; padding: 3px 4px; border: 1px solid #fca5a5; font-size:11px;"><b>${item.med.medicamento}</b><br/><span style="font-size:9px;">${item.med.dosagem || ''}</span></td>
                              <td style="color: #dc2626; font-weight: bold; padding: 3px 4px; border: 1px solid #fca5a5; text-align:center; font-size:11px;">${item.med.qtd_por_dose || 1} ${item.med.unidade_medida || ''}</td>
                              <td style="color: #dc2626; font-size: 10px; padding: 3px 4px; border: 1px solid #fca5a5;">${item.med.observacoes || '-'}</td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          </div>
      ` : '';

      return `
          <div style="margin-bottom: 20px; page-break-inside: avoid;">
              <h3 style="background: #e2e8f0; padding: 6px; border-radius: 4px; margin-bottom: 8px; font-size: 14px; border-left: 4px solid #334155;">
                  Paciente: ${patient.nome}
              </h3>
              ${mainTableHtml}
              ${specialHtml}
          </div>
      `;
    }).join('')

    printPDF('Escala de Medicação', `
      <style>
        table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        th, td { border: 1px solid #cbd5e1; padding: 4px; text-align: left; vertical-align: middle; }
        th { background-color: #f8fafc; font-size: 11px; font-weight: bold; color:#334155; }
        td { line-height: 1.2; font-size: 11px; }
      </style>
      ${htmlContent || '<p>Nenhuma medicação encontrada para o filtro selecionado.</p>'}
    `, clinic, { hideClinicHeader: true, compactLayout: true })
  }

  function printStockReport() {
    const medsToReport = medications.filter(m => (m.estoque_atual || 0) <= (m.estoque_minimo || 0))
    
    const rows = medsToReport.map(m => `
      <tr>
        <td>${m.pacienteNome}</td>
        <td>${m.medicamento}</td>
        <td style="text-align:center; color:${(m.estoque_atual || 0) <= (m.estoque_minimo || 0) ? 'red' : 'inherit'}; font-weight:bold;">${m.estoque_atual} ${m.unidade_medida}</td>
        <td style="text-align:center;">${m.estoque_minimo}</td>
        <td style="text-align:center;">${calculateDailyConsumption(m)} /dia</td>
        <td style="text-align:center; background:${calculateDaysRemaining(m) <= 5 ? '#fee2e2' : 'transparent'};">${calculateDaysRemaining(m)} dias</td>
      </tr>
    `).join('')

    printPDF('Relatório de Controle de Estoque (Alertas)', `
      <style>
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background-color: #f8fafc; font-size: 12px; }
        td { font-size: 11px; }
      </style>
      <p>As seguintes medicações estão com estoque baixo ou próximo do fim, baseado no consumo diário.</p>
      <table>
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Medicamento</th>
            <th>Estoque Atual</th>
            <th>Mínimo</th>
            <th>Consumo Diário</th>
            <th>Previsão Restante</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center;">Nenhum alerta de estoque crítico no momento.</td></tr>'}
        </tbody>
      </table>
    `, clinic, { hideClinicHeader: true })
  }

  function printConsolidatedMedicationReport() {
    const groupedMeds: Record<string, { 
      medicamento: string, 
      pacientes: string[], 
      estoqueTotal: number, 
      consumoDiario: number,
      unidade: string
    }> = {};

    medications.forEach(m => {
      const key = m.medicamento.trim().toUpperCase();
      if (!groupedMeds[key]) {
        groupedMeds[key] = {
          medicamento: m.medicamento.trim(),
          pacientes: [],
          estoqueTotal: 0,
          consumoDiario: 0,
          unidade: m.unidade_medida || 'un'
        };
      }
      
      if (!groupedMeds[key].pacientes.includes(m.pacienteNome || 'Desconhecido')) {
        groupedMeds[key].pacientes.push(m.pacienteNome || 'Desconhecido');
      }
      
      groupedMeds[key].estoqueTotal += (m.estoque_atual || 0);
      groupedMeds[key].consumoDiario += calculateDailyConsumption(m);
    });

    const sortedMeds = Object.values(groupedMeds).sort((a, b) => a.medicamento.localeCompare(b.medicamento));

    const rows = sortedMeds.map(m => {
      const consumoQuinzenal = m.consumoDiario * 15;
      const consumoMensal = m.consumoDiario * 30;
      
      return `
        <tr>
          <td>
            <strong>${m.medicamento}</strong><br/>
            <span style="font-size: 10px; color: #666;">Pacientes: ${m.pacientes.join(', ')}</span>
          </td>
          <td style="text-align: center;">${m.estoqueTotal} ${m.unidade}</td>
          <td style="text-align: center;">${m.consumoDiario.toFixed(1)}</td>
          <td style="text-align: center;">${consumoQuinzenal.toFixed(1)}</td>
          <td style="text-align: center;">${consumoMensal.toFixed(1)}</td>
        </tr>
      `;
    }).join('');

    printPDF('Consolidado de Consumo de Medicamentos', `
      <style>
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
        th { background-color: #f8fafc; font-size: 11px; font-weight: bold; color:#334155; }
        td { font-size: 11px; vertical-align: top; }
      </style>
      <p style="font-size: 12px; margin-bottom: 10px;">Relatório consolidado por medicamento, apresentando a soma do estoque e projeção de consumo.</p>
      <table>
        <thead>
          <tr>
            <th style="width: 40%;">Medicamento / Pacientes</th>
            <th style="width: 15%; text-align: center;">Estoque Total</th>
            <th style="width: 15%; text-align: center;">Consumo Diário</th>
            <th style="width: 15%; text-align: center;">Consumo 15 dias</th>
            <th style="width: 15%; text-align: center;">Consumo Mensal</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="5" style="text-align:center;">Nenhuma medicação cadastrada.</td></tr>'}
        </tbody>
      </table>
    `, clinic, { hideClinicHeader: true })
  }

  return (
    <div>
      <PageHeader title="Medicação" description="Relatórios e escalas de medicação (Gerenciamento individual no cadastro do paciente)" />

      <Card className="p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center justify-between">
          <div className="flex-1 w-full">
            <SearchBar value={search} onChange={setSearch} placeholder="Buscar por paciente ou medicamento..." />
          </div>
          <div className="flex bg-muted p-1 rounded-lg">
            <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('list')}
                className="px-4 h-8"
            >
                Lista
            </Button>
            <Button 
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('grid')}
                className="px-4 h-8"
            >
                Quadro de Horários
            </Button>
          </div>
          <div className="flex gap-2">
            <Select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} className="h-9 w-48 text-sm">
              <option value="all">Todos os Pacientes</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
            <Button variant="outline" size="sm" onClick={printStockReport} className="gap-2 h-9 text-red-600 border-red-200 hover:bg-red-50">
                <FileText className="h-4 w-4" /> Alertas de Estoque
            </Button>
            <Button variant="outline" size="sm" onClick={printConsolidatedMedicationReport} className="gap-2 h-9 text-blue-600 border-blue-200 hover:bg-blue-50">
                <FileText className="h-4 w-4" /> Consumo Consolidado
            </Button>
            <Button variant="outline" size="sm" onClick={printReport} className="gap-2 h-9">
                <FileText className="h-4 w-4" /> PDF da Escala
            </Button>
          </div>
        </div>

        {viewMode === 'list' ? (
          <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Medicamento</TableHead>
                <TableHead>Horário/Freq</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Consumo Diário</TableHead>
                <TableHead>Previsão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState message="Nenhuma medicação cadastrada" /></TableCell></TableRow>
              ) : (
                filtered.map(m => (
                  <TableRow key={m.id} className={ (m.estoque_atual || 0) <= (m.estoque_minimo || 0) ? "bg-red-50" : ""}>
                    <TableCell className="font-medium">{m.pacienteNome}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{m.medicamento}</div>
                      <div className="text-xs text-muted-foreground">{m.dosagem}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs">{m.horario}</div>
                      <Badge variant="outline" className="mt-1">{m.frequencia}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-bold ${ (m.estoque_atual || 0) <= (m.estoque_minimo || 0) ? "text-red-600" : ""}`}>
                          {m.estoque_atual} {m.unidade_medida}
                        </span>
                        <span className="text-[10px] text-muted-foreground">Mín: {m.estoque_minimo}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {calculateDailyConsumption(m)} {m.unidade_medida}/dia
                    </TableCell>
                    <TableCell>
                      <Badge variant={calculateDaysRemaining(m) <= 5 ? "destructive" : "secondary"}>
                        {calculateDaysRemaining(m)} dias
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        ) : (
          <div className="overflow-x-auto pb-4 mt-4">
            {(() => {
              // Identificar todos os horários únicos que possuem medicamentos (apenas para escala regular)
              const activeTimes = Array.from(new Set(
                filtered
                  .filter(m => m.tipo_escala === 'regular' || !m.tipo_escala)
                  .flatMap(m => m.horario ? m.horario.split(',').map(t => t.trim()) : [])
              )).sort((a, b) => a.localeCompare(b));

              // Agrupar por paciente
              const medsByPatient: Record<string, { patientName: string, meds: Medication[] }> = {};
              filtered.forEach(m => {
                if (!medsByPatient[m.pacienteId]) {
                  medsByPatient[m.pacienteId] = { patientName: m.pacienteNome || 'Desconhecido', meds: [] };
                }
                medsByPatient[m.pacienteId].meds.push(m);
              });

              const patientIds = Object.keys(medsByPatient).sort((a, b) => 
                medsByPatient[a].patientName.localeCompare(medsByPatient[b].patientName)
              );

              return (
                <Table className="w-max min-w-full border-separate border-spacing-0">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="min-w-[200px] sticky left-0 bg-muted z-30 border-b-2 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Paciente</TableHead>
                      {activeTimes.map(time => (
                        <TableHead key={time} className="text-center font-bold min-w-[160px] border-b-2 border-r bg-muted/80">{time}</TableHead>
                      ))}
                      <TableHead className="text-center font-bold min-w-[180px] border-b-2 bg-muted/80">Outros / Especiais</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patientIds.length === 0 ? (
                      <TableRow><TableCell colSpan={activeTimes.length + 2} className="h-32"><EmptyState message="Nenhuma medicação encontrada" /></TableCell></TableRow>
                    ) : (
                      patientIds.map(pId => {
                        const { patientName, meds } = medsByPatient[pId];
                        return (
                          <TableRow key={pId} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-bold sticky left-0 bg-background z-10 border-b border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] py-4">
                              {patientName}
                            </TableCell>
                            {activeTimes.map(time => {
                              const medsAtTime = meds.filter(m => 
                                (m.tipo_escala === 'regular' || !m.tipo_escala) && 
                                m.horario?.split(',').map(t => t.trim()).includes(time)
                              );

                              return (
                                <TableCell key={time} className="p-2 border-r border-b align-top">
                                  <div className="flex flex-col gap-2">
                                    {medsAtTime.map(m => (
                                      <div key={m.id} className="p-2 bg-primary/5 rounded-md border border-primary/10 shadow-sm">
                                        <div className="font-bold text-[11px] leading-tight text-primary">{m.medicamento}</div>
                                        <div className="text-[10px] text-muted-foreground mt-1">{m.dosagem} • {m.qtd_por_dose} {m.unidade_medida}</div>
                                        {m.observacoes && <div className="text-[9px] text-muted-foreground/70 italic mt-1 border-t pt-1 line-clamp-2">{m.observacoes}</div>}
                                      </div>
                                    ))}
                                  </div>
                                </TableCell>
                              );
                            })}
                            <TableCell className="p-2 border-b align-top bg-amber-50/20">
                              <div className="flex flex-col gap-2">
                                {meds.filter(m => m.tipo_escala && m.tipo_escala !== 'regular').map(m => (
                                  <div key={m.id} className="p-2 bg-amber-50 rounded-md border border-amber-200 shadow-sm">
                                    <div className="font-bold text-[11px] leading-tight text-amber-900">{m.medicamento}</div>
                                    <div className="text-[10px] text-amber-700 font-semibold mt-1">
                                      {m.tipo_escala === 'se_necessario' ? 'Se Necessário' : 
                                       m.tipo_escala === 'dias_impares' ? 'Dias Ímpares' :
                                       m.tipo_escala === 'dias_pares' ? 'Dias Pares' :
                                       `Dias: ${m.dias_semana?.join(', ')}`}
                                    </div>
                                    <div className="text-[9px] text-amber-600 mt-1">{m.dosagem} • {m.qtd_por_dose} {m.unidade_medida}</div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              );
            })()}
          </div>
        )}
      </Card>
    </div>
  )
}
