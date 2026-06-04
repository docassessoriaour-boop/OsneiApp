import { useState } from 'react'
import { useDb } from '@/hooks/useDb'
import type { Patient, Medication, BaseMedication, MedicationEntry } from '@/lib/types'
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
import { formatCurrency, formatDate } from '@/lib/utils'
import { Pencil, Trash2, Loader2, FileText, Plus, History, PackagePlus } from 'lucide-react'

export default function Medicacao() {
  const [clinic] = useClinic()
  const { data: rawPatients } = useDb<Patient>('patients')
  const { data: rawMedications, loading, update: updateMed, reload: reloadMeds } = useDb<Medication>('medications')
  const { data: medEntries, insert: insertMedEntry, loading: entriesLoading } = useDb<MedicationEntry>('medication_entries')

  const patients = rawPatients.filter(p => p.status !== 'inativo').sort((a, b) => a.nome.localeCompare(b.nome))
  const activePatientIds = patients.map(p => p.id)
  const medications = rawMedications.filter(m => activePatientIds.includes(m.pacienteId || (m as any).paciente_id))
  const { data: rawProducts, insert: insertBaseMed } = useDb<any>('products')
  const baseMeds = rawProducts.filter((p: any) => p.tipo === 'medicamento')
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  
  // Stock Entry Dialog State
  const [stockEntryOpen, setStockEntryOpen] = useState(false)
  const [selectedMedKey, setSelectedMedKey] = useState('')
  const [totalQuantity, setTotalQuantity] = useState<number>(0)
  const [distribution, setDistribution] = useState<Record<string, number>>({})
  const [entryResponsavel, setEntryResponsavel] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [isProcessingEntry, setIsProcessingEntry] = useState(false)

  const [selectedPatientId, setSelectedPatientId] = useState('all')
  const [selectedUnit, setSelectedUnit] = useState('all')

  const filtered = medications.filter(m => {
    const patient = patients.find(p => p.id === (m.pacienteId || (m as any).paciente_id))
    const matchesUnit = selectedUnit === 'all' || (patient && patient.unidade === selectedUnit)
    const matchesPatient = selectedPatientId === 'all' || (m.pacienteId || (m as any).paciente_id) === selectedPatientId
    const matchesSearch = (m.pacienteNome || '').toLowerCase().includes(search.toLowerCase()) ||
                        m.medicamento.toLowerCase().includes(search.toLowerCase())
    
    return matchesUnit && matchesPatient && matchesSearch
  }).sort((a, b) => {
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

    const getHeader = () => `
      <div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #1a1f2e;padding-bottom:16px;">
        <img src="/logo.png" alt="Logo" style="max-height:80px; width: auto; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;" />
        <h1 style="margin:0;font-size:20px;color:#1a1f2e;">${clinic.razao_social || (clinic as any).name || (clinic as any).nome_fantasia || ''}</h1>
        <p style="margin:4px 0 0;font-size:11px;color:#555;">CNPJ: ${clinic.cnpj || ''}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#555;">${clinic.address || (clinic as any).endereco || ''}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#555;">Tel: ${clinic.phone || (clinic as any).telefone || ''}</p>
      </div>
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="font-size: 16pt; text-transform: uppercase; margin-bottom: 5px;">Escala de Medicação</h2>
        <p style="font-size: 9pt; color: #666;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
      </div>
    `;

    const htmlContent = targetPatients.map((patient, pIdx) => {
      const patientMeds = medications.filter(m => (m.pacienteId || (m as any).paciente_id) === patient.id)
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
          <div style="margin-bottom: 20px; page-break-before: always;">
              ${getHeader()}
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

  function printTimeTableReport() {
    // Identificar todos os horários únicos que possuem medicamentos (apenas para escala regular)
    const activeTimes = Array.from(new Set(
      filtered
        .filter(m => m.tipo_escala === 'regular' || !m.tipo_escala)
        .flatMap(m => m.horario ? m.horario.split(',').map(t => t.trim()) : [])
    )).sort((a, b) => a.localeCompare(b));

    // Agrupar por paciente
    const medsByPatient: Record<string, { patientName: string, meds: Medication[] }> = {};
    filtered.forEach(m => {
      const pId = m.pacienteId || (m as any).paciente_id;
      if (!medsByPatient[pId]) {
        medsByPatient[pId] = { patientName: m.pacienteNome || (m as any).paciente_nome || 'Desconhecido', meds: [] };
      }
      medsByPatient[pId].meds.push(m);
    });

    const patientIds = Object.keys(medsByPatient).sort((a, b) => 
      medsByPatient[a].patientName.localeCompare(medsByPatient[b].patientName)
    );

    const getHeader = (title: string) => `
      <div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #1a1f2e;padding-bottom:16px;">
        <img src="/logo.png" alt="Logo" style="max-height:80px; width: auto; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;" />
        <h1 style="margin:0;font-size:20px;color:#1a1f2e;">${clinic.razao_social || (clinic as any).name || (clinic as any).nome_fantasia || ''}</h1>
        <p style="margin:4px 0 0;font-size:11px;color:#555;">CNPJ: ${clinic.cnpj || ''}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#555;">${clinic.address || (clinic as any).endereco || ''}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#555;">Tel: ${clinic.phone || (clinic as any).telefone || ''}</p>
      </div>
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="font-size: 16pt; text-transform: uppercase; margin-bottom: 5px;">${title}</h2>
        <p style="font-size: 9pt; color: #666;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
      </div>
    `;

    const fullHtml = patientIds.map(pId => {
      const { patientName, meds } = medsByPatient[pId];
      
      // Identificar horários ativos para ESTE paciente específico
      const patientActiveTimes = Array.from(new Set(
        meds
          .filter(m => m.tipo_escala === 'regular' || !m.tipo_escala)
          .flatMap(m => m.horario ? m.horario.split(',').map(t => t.trim()) : [])
      )).sort((a, b) => a.localeCompare(b));

      if (patientActiveTimes.length === 0 && meds.length === 0) return '';

      return `
        <div style="page-break-after: always; margin-bottom: 30px;">
          ${getHeader('Quadro de Horários Individualizado')}
          <h2 style="font-size: 14px; background: #334155; color: white; padding: 6px; border-radius: 4px; margin-bottom: 10px;">
            Paciente: ${patientName}
          </h2>
          <table class="report-table">
            <thead>
              <tr>
                ${patientActiveTimes.map(time => `<th style="width: ${100 / (patientActiveTimes.length + 1)}%;">${time}</th>`).join('')}
                <th style="width: ${100 / (patientActiveTimes.length + 1)}%;">Especiais / Outros</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                ${patientActiveTimes.map(time => {
                  const medsAtTime = meds.filter(m => 
                    (m.tipo_escala === 'regular' || !m.tipo_escala) && 
                    m.horario?.split(',').map(t => t.trim()).includes(time)
                  );
                  return `
                    <td>
                      ${medsAtTime.map(m => `
                        <div class="med-item">
                          <span class="med-name">${m.medicamento}</span>
                          <span class="med-info">${m.dosagem || ''} • ${m.qtd_por_dose || 1}${m.unidade_medida || 'un'}</span>
                          ${m.observacoes ? `<div style="font-size: 8px; margin-top: 2px; border-top: 1px solid #e2e8f0; color: #475569;">${m.observacoes}</div>` : ''}
                        </div>
                      `).join('')}
                    </td>
                  `;
                }).join('')}
                <td class="special-section">
                  ${meds.filter(m => m.tipo_escala && m.tipo_escala !== 'regular').map(m => `
                    <div class="med-item" style="border-color: #fcd34d; background: white;">
                      <span class="med-name">${m.medicamento}</span>
                      <span class="med-info" style="color: #92400e; font-weight: bold;">
                        ${m.tipo_escala === 'se_necessario' ? 'Se Nec.' : 
                          m.tipo_escala === 'dias_impares' ? 'Ímpares' :
                          m.tipo_escala === 'dias_pares' ? 'Pares' : 
                          m.tipo_escala === 'dias_semana' ? `Dias: ${m.dias_semana?.join(',')}` : 'Espec.'}
                      </span>
                      <div class="med-info">${m.dosagem || ''} • ${m.qtd_por_dose || 1}${m.unidade_medida || 'un'}</div>
                    </div>
                  `).join('')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    const containerHtml = `
      <style>
        .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .report-table th, .report-table td { border: 1px solid #cbd5e1; padding: 6px; font-size: 10px; vertical-align: top; word-break: break-word; }
        .report-table th { background: #f1f5f9; font-weight: bold; text-align: center; color: #1e293b; }
        .med-item { margin-bottom: 6px; padding: 4px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
        .med-name { font-weight: bold; color: #0f172a; display: block; font-size: 10px; margin-bottom: 2px; }
        .med-info { color: #64748b; font-size: 9px; }
        .special-section { background: #fffbeb; border: 1px solid #fde68a; }
      </style>
      ${fullHtml || '<p>Nenhuma medicação encontrada para o filtro selecionado.</p>'}
    `;

    printPDF('Quadro de Horários Individualizado', containerHtml, clinic, { orientation: 'landscape', compactLayout: true, hideClinicHeader: true })
  }

  function printStockReport() {
    const medsToReport = medications.filter(m => (m.estoque_atual || 0) <= (m.estoque_minimo || 0))
    
    const rows = medsToReport.map(m => `
      <tr>
        <td>${m.pacienteNome}</td>
        <td>${m.medicamento}</td>
        <td style="text-align:center; color:${(m.estoque_atual || 0) <= (m.estoque_minimo || 0) ? 'red' : 'inherit'}; font-weight:bold;">
          ${m.estoque_atual} ${m.unidade_medida}
          ${m.embalagem_completa && m.embalagem_completa > 0 ? `<br/><span style="font-size:9px; color:#666; font-weight:normal;">${Math.floor((m.estoque_atual || 0) / m.embalagem_completa)} emb. fechada(s) + ${(m.estoque_atual || 0) % m.embalagem_completa} ${m.unidade_medida}</span>` : ''}
        </td>
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
    `, clinic)
  }

  function printConsolidatedMedicationReport() {
    const groupedMeds: Record<string, { 
      medicamento: string, 
      dosagem: string,
      pacientes: string[], 
      estoqueTotal: number, 
      consumoDiario: number,
      unidade: string,
      embalagem_completa: number
    }> = {};

    medications.forEach(m => {
      const nomeMed = m.medicamento.trim().toUpperCase();
      const dosagemUpper = (m.dosagem || '').trim().toUpperCase();
      const key = `${nomeMed}__${dosagemUpper}`;
      
      if (!groupedMeds[key]) {
        groupedMeds[key] = {
          medicamento: m.medicamento.trim(),
          dosagem: m.dosagem || '',
          pacientes: [],
          estoqueTotal: 0,
          consumoDiario: 0,
          unidade: m.unidade_medida || 'un',
          embalagem_completa: m.embalagem_completa || 0
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
      const tituloMed = m.dosagem ? `${m.medicamento} - ${m.dosagem}` : m.medicamento;
      
      return `
        <tr>
          <td>
            <strong>${tituloMed}</strong><br/>
            <span style="font-size: 10px; color: #666;">Pacientes: ${m.pacientes.join(', ')}</span>
          </td>
          <td style="text-align: center;">
            ${m.estoqueTotal} ${m.unidade}
            ${(m as any).embalagem_completa && (m as any).embalagem_completa > 0 ? `<br/><span style="font-size:9px; color:#666;">${Math.floor(m.estoqueTotal / (m as any).embalagem_completa)} emb. fechada(s) + ${m.estoqueTotal % (m as any).embalagem_completa} ${m.unidade}</span>` : ''}
          </td>
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
    `, clinic)
  }

  async function exportToCatalog() {
    if (!baseMeds) {
      alert("Aguarde, carregando dados do catálogo...");
      return;
    }

    if (!confirm('Deseja cadastrar os medicamentos consolidados no Catálogo de Medicamentos? (Medicamentos já existentes serão ignorados)')) return;

    setExporting(true);
    try {
      const groupedMeds: Record<string, { 
        medicamento: string, 
        dosagem: string,
        unidade: string
      }> = {};

      medications.forEach(m => {
        const nomeMed = m.medicamento.trim().toUpperCase();
        const dosagemUpper = (m.dosagem || '').trim().toUpperCase();
        const key = `${nomeMed}__${dosagemUpper}`;
        
        if (!groupedMeds[key]) {
          groupedMeds[key] = {
            medicamento: m.medicamento.trim(),
            dosagem: m.dosagem || '',
            unidade: m.unidade_medida || 'comprimido'
          };
        }
      });

      const existingNames = new Set(baseMeds.map(m => m.nome.trim().toUpperCase()));
      let importedCount = 0;

      for (const data of Object.values(groupedMeds)) {
        const tituloMed = data.dosagem ? `${data.medicamento} - ${data.dosagem}` : data.medicamento;
        const upperTitulo = tituloMed.trim().toUpperCase();

        if (!existingNames.has(upperTitulo)) {
          await insertBaseMed({
            nome: tituloMed,
            tipo: 'medicamento',
            unidade: data.unidade
          });
          existingNames.add(upperTitulo);
          importedCount++;
        }
      }

      alert(`${importedCount} novos medicamentos foram cadastrados no catálogo com sucesso!`);
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao exportar: ${error.message || 'Verifique sua conexão.'}`);
    } finally {
      setExporting(false);
    }
  }

  // Group medications for selection in global entry
  const groupedMedKeys = Array.from(new Set(medications.map(m => `${m.medicamento}__${(m.dosagem || '').trim()}`))).sort()

  const handleOpenStockEntry = (medKey: string) => {
    setSelectedMedKey(medKey)
    const [name, dosage] = medKey.split('__')
    const users = medications.filter(m => m.medicamento === name && (m.dosagem || '').trim() === dosage)
    
    const initialDist: Record<string, number> = {}
    users.forEach(u => {
      initialDist[u.id] = 0
    })
    
    setDistribution(initialDist)
    setTotalQuantity(0)
    setStockEntryOpen(true)
  }

  const handleApplyProportional = () => {
    const [name, dosage] = selectedMedKey.split('__')
    const users = medications.filter(m => m.medicamento === name && (m.dosagem || '').trim() === dosage)
    const totalDaily = users.reduce((acc, m) => acc + calculateDailyConsumption(m), 0)
    
    if (totalDaily === 0) return

    const newDist: Record<string, number> = {}
    let remaining = totalQuantity
    
    users.forEach((u, idx) => {
      if (idx === users.length - 1) {
        newDist[u.id] = remaining
      } else {
        const share = Math.floor((calculateDailyConsumption(u) / totalDaily) * totalQuantity)
        newDist[u.id] = share
        remaining -= share
      }
    })
    
    setDistribution(newDist)
  }

  async function handleSaveGlobalEntry() {
    if (!selectedMedKey || totalQuantity <= 0) return
    
    const sumDist = Object.values(distribution).reduce((a, b) => a + b, 0)
    if (sumDist !== totalQuantity) {
      if (!confirm(`A soma das quantidades (${sumDist}) é diferente do total recebido (${totalQuantity}). Deseja prosseguir assim mesmo?`)) return
    }

    setIsProcessingEntry(true)
    try {
      for (const [medId, qty] of Object.entries(distribution)) {
        if (qty <= 0) continue
        
        const med = medications.find(m => m.id === medId)
        if (!med) continue

        // 1. Create Entry
        await insertMedEntry({
          medication_id: med.id,
          paciente_id: med.pacienteId || (med as any).paciente_id,
          data: entryDate,
          quantidade: qty,
          responsavel: entryResponsavel
        } as any)

        // 2. Update Stock
        const currentStock = med.estoque_atual || 0
        await updateMed(med.id, {
          estoque_atual: currentStock + qty
        } as any)
      }

      alert('Estoque atualizado com sucesso para todos os pacientes selecionados!')
      setStockEntryOpen(false)
      reloadMeds()
    } catch (error: any) {
      console.error(error)
      alert('Erro ao salvar entrada global: ' + error.message)
    } finally {
      setIsProcessingEntry(false)
    }
  }

  function printEntriesReport() {
    if (entriesLoading) {
      alert('Aguarde, carregando histórico de entradas...')
      return
    }
    
    if (medEntries.length === 0) {
      alert('Nenhuma entrada de estoque encontrada no histórico.')
      return
    }

    const sortedEntries = [...medEntries].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    
    // Group by Patient - Using raw data to ensure even inactive/not filtered data shows up
    const grouped: Record<string, any[]> = {}
    sortedEntries.forEach(entry => {
      const patient = rawPatients.find(p => p.id === entry.paciente_id)
      const patientName = patient?.nome || 'Paciente não encontrado'
      if (!grouped[patientName]) grouped[patientName] = []
      
      const med = rawMedications.find(m => m.id === entry.medication_id)
      grouped[patientName].push({
        ...entry,
        medName: med?.medicamento || 'Medicamento não encontrado',
        medDosage: med?.dosagem || ''
      })
    })

    const patientRows = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([name, entries]) => {
      const entryRows = entries.map(e => `
        <tr>
          <td>${formatDate(e.data)}</td>
          <td><strong>${e.medName}</strong> ${e.medDosage}</td>
          <td style="text-align:center; font-weight:bold; color:green;">+${e.quantidade}</td>
          <td>${e.responsavel || '-'}</td>
        </tr>
      `).join('')

      return `
        <div style="margin-top: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid;">
          <div style="background: #f8fafc; padding: 10px; font-weight: bold; border-bottom: 1px solid #e2e8f0; color: #1e293b;">
            Paciente: ${name}
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #fff; border-bottom: 1px solid #e2e8f0;">
                <th style="padding: 8px; text-align: left; font-size: 10px; width: 20%;">Data</th>
                <th style="padding: 8px; text-align: left; font-size: 10px; width: 40%;">Medicamento</th>
                <th style="padding: 8px; text-align: center; font-size: 10px; width: 15%;">Quantidade</th>
                <th style="padding: 8px; text-align: left; font-size: 10px; width: 25%;">Responsável</th>
              </tr>
            </thead>
            <tbody>
              ${entryRows}
            </tbody>
          </table>
        </div>
      `
    }).join('')

    printPDF('Histórico de Entradas de Medicamentos (Por Paciente)', `
      <style>
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px; font-size: 11px; border-bottom: 1px solid #f1f5f9; }
      </style>
      <p style="font-size: 12px; color: #666; margin-bottom: 10px;">Relatório detalhado de todas as entradas de estoque registradas no sistema.</p>
      ${patientRows || '<p>Nenhuma entrada registrada.</p>'}
    `, clinic)
  }

  return (
    <div>
      <PageHeader title="Medicação" description="Relatórios e escalas de medicação (Gerenciamento individual no cadastro do paciente)" />

      <Card className="p-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[250px]">
              <SearchBar value={search} onChange={setSearch} placeholder="Buscar por paciente ou medicamento..." />
            </div>
            
            <div className="flex bg-muted p-1 rounded-lg shrink-0">
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

            <div className="flex gap-2 flex-wrap">
              <Select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)} className="h-9 w-40 text-xs">
                <option value="all">Todas Unidades</option>
                <option value="Vila Moraes">Vila Moraes</option>
                <option value="Jardim Matilde">Jardim Matilde</option>
              </Select>

              <Select value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} className="h-9 w-48 text-xs">
                <option value="all">Todos os Pacientes</option>
                {patients.filter(p => selectedUnit === 'all' || p.unidade === selectedUnit).map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
            <Button variant="outline" size="sm" onClick={printStockReport} className="gap-2 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50">
                <FileText className="h-4 w-4" /> Alertas de Estoque
            </Button>
            <Button variant="outline" size="sm" onClick={printConsolidatedMedicationReport} className="gap-2 h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                <FileText className="h-4 w-4" /> Consumo Consolidado
            </Button>
            <Button variant="outline" size="sm" onClick={exportToCatalog} disabled={exporting} className="gap-2 h-8 text-xs text-green-600 border-green-200 hover:bg-green-50">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Catálogo
            </Button>
            <Button variant="outline" size="sm" onClick={printEntriesReport} className="gap-2 h-8 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50">
                <History className="h-4 w-4" /> Histórico de Entradas
            </Button>
            <Button variant="default" size="sm" onClick={() => setStockEntryOpen(true)} className="gap-2 h-8 text-xs bg-green-600 hover:bg-green-700 shadow-sm">
                <PackagePlus className="h-4 w-4" /> Lançar Estoque (Global)
            </Button>
            <Button variant="outline" size="sm" onClick={printReport} className="gap-2 h-8 text-xs">
                <FileText className="h-4 w-4" /> PDF Escala
            </Button>
            <Button variant="default" size="sm" onClick={printTimeTableReport} className="gap-2 h-8 text-xs shadow-sm">
                <FileText className="h-4 w-4" /> PDF Quadro Horários
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
                        {m.embalagem_completa && m.embalagem_completa > 0 ? (
                          <span className="text-[10px] text-muted-foreground mt-1">
                            {Math.floor((m.estoque_atual || 0) / m.embalagem_completa)} cx/frasco(s) + {(m.estoque_atual || 0) % m.embalagem_completa} avulsos
                          </span>
                        ) : null}
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
                const pId = m.pacienteId || (m as any).paciente_id;
                if (!medsByPatient[pId]) {
                  medsByPatient[pId] = { patientName: m.pacienteNome || (m as any).paciente_nome || 'Desconhecido', meds: [] };
                }
                medsByPatient[pId].meds.push(m);
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

      <Dialog open={stockEntryOpen} onOpenChange={setStockEntryOpen}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-green-600" />
            Lançar Entrada de Estoque (Global)
          </DialogTitle>
          <DialogClose onClick={() => setStockEntryOpen(false)} />
        </DialogHeader>
        <DialogContent className="max-w-2xl">
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Medicamento</Label>
                <Select 
                  value={selectedMedKey} 
                  onChange={(e) => {
                    const val = e.target.value
                    setSelectedMedKey(val)
                    const [name, dosage] = val.split('__')
                    const users = medications.filter(m => m.medicamento === name && (m.dosagem || '').trim() === dosage)
                    const newDist: Record<string, number> = {}
                    users.forEach(u => newDist[u.id] = 0)
                    setDistribution(newDist)
                  }}
                >
                  <option value="">Selecione o medicamento...</option>
                  {groupedMedKeys.map(key => (
                    <option key={key} value={key}>{key.replace('__', ' - ')}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data de Entrada</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade Total Recebida</Label>
                <div className="flex gap-2">
                  <Input 
                    type="number" 
                    value={totalQuantity} 
                    onChange={(e) => setTotalQuantity(Number(e.target.value))} 
                    placeholder="Ex: 100"
                  />
                  <Button variant="outline" size="sm" onClick={handleApplyProportional} disabled={!selectedMedKey || totalQuantity <= 0}>
                    Distribuir Proporcional
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input 
                  value={entryResponsavel} 
                  onChange={(e) => setEntryResponsavel(e.target.value)} 
                  placeholder="Nome de quem recebeu"
                />
              </div>
            </div>

            {selectedMedKey && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Paciente</TableHead>
                      <TableHead className="text-center">Estoque Atual</TableHead>
                      <TableHead className="text-center">Consumo Diário</TableHead>
                      <TableHead className="w-[120px] text-right">Lançar Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {medications
                      .filter(m => {
                        const [name, dosage] = selectedMedKey.split('__')
                        return m.medicamento === name && (m.dosagem || '').trim() === dosage
                      })
                      .map(m => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium text-xs">{m.pacienteNome}</TableCell>
                          <TableCell className="text-center text-xs">{m.estoque_atual} {m.unidade_medida}</TableCell>
                          <TableCell className="text-center text-xs">{calculateDailyConsumption(m)} /dia</TableCell>
                          <TableCell className="text-right">
                            <Input 
                              type="number" 
                              className="h-8 text-right text-xs" 
                              value={distribution[m.id] || 0} 
                              onChange={(e) => setDistribution({ ...distribution, [m.id]: Number(e.target.value) })}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            <div className="flex justify-between items-center text-sm p-3 bg-muted/30 rounded-lg">
              <span className="text-muted-foreground">Soma da Distribuição:</span>
              <span className={`font-bold ${Object.values(distribution).reduce((a,b) => a+b, 0) === totalQuantity ? 'text-green-600' : 'text-amber-600'}`}>
                {Object.values(distribution).reduce((a,b) => a+b, 0)} / {totalQuantity}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockEntryOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleSaveGlobalEntry} 
              disabled={isProcessingEntry || !selectedMedKey || totalQuantity <= 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {isProcessingEntry ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackagePlus className="h-4 w-4 mr-2" />}
              Salvar Entrada Global
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
