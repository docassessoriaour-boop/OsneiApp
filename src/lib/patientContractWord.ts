import type { CompanySettings, Contract, Patient } from './types'
import { formatCurrencyPDF, formatDatePDF } from './pdf'
import { downloadWordDocument } from './word'
import { DEMO_COMPANY_ADDRESS, DEMO_COMPANY_CNPJ, DEMO_COMPANY_LEGAL_NAME } from './companies'

export function downloadPatientContractWord(
  patient: Patient,
  contract: Contract,
  clinic?: Partial<CompanySettings> | null
) {
  const companyName = clinic?.razao_social || clinic?.name || (clinic as any)?.nome_fantasia || DEMO_COMPANY_LEGAL_NAME
  const companyCnpj = clinic?.cnpj || DEMO_COMPANY_CNPJ
  const companyAddress = (clinic as any)?.endereco || clinic?.address || DEMO_COMPANY_ADDRESS
  const startDate = contract.dataInicio || (contract as any).data_inicio
  const endDate = contract.dataFim || (contract as any).data_fim
  const extraValue = contract.valorExtra || (contract as any).valor_extra || 0
  const extraDescription = contract.descricaoExtra || (contract as any).descricao_extra || ''
  const contractNumber = contract.numero_contrato || contract.id.slice(0, 8).toUpperCase()
  const responsibleAddress = [patient.resp_endereco, patient.resp_cep, patient.resp_cidade, patient.resp_uf].filter(Boolean).join(', ')
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  const additionalResponsibles = (patient.outros_responsaveis || []).map((responsible, index) => `
    <p style="text-indent:0"><strong>CO-CONTRATANTE ${index + 1}:</strong> ${responsible.nome}, CPF nº ${responsible.cpf || '---'}, RG nº ${responsible.rg || '---'}, residente em ${responsible.endereco || responsibleAddress || '---'}.</p>
  `).join('')

  const bodyHtml = `
    <div style="text-align:center;margin-bottom:28px;">
      <h2>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ACOLHIMENTO E CUIDADOS PARA IDOSOS</h2>
      <p><strong>CONTRATO Nº ${contractNumber}</strong></p>
    </div>
    <div class="abnt-text">
      <p style="text-indent:0"><strong>CONTRATADA:</strong> ${companyName.toUpperCase()}, inscrita no CNPJ sob nº ${companyCnpj}, com sede em ${companyAddress}.</p>
      <p style="text-indent:0"><strong>CONTRATANTE:</strong> ${patient.responsavel || '---'}, CPF nº ${patient.resp_cpf || '---'}, RG nº ${patient.resp_rg || '---'}, residente em ${responsibleAddress || '---'}.</p>
      ${additionalResponsibles}
      <p style="text-indent:0"><strong>RESIDENTE ASSISTIDO(A):</strong> ${patient.nome}, CPF nº ${patient.cpf || '---'}, RG nº ${patient.rg || '---'}.</p>

      <p>As partes acima qualificadas celebram o presente contrato de prestação de serviços de acolhimento e cuidados para idosos, regido pelas cláusulas seguintes.</p>

      <h3>CLÁUSULA PRIMEIRA — DO OBJETO</h3>
      <p>O presente contrato tem por objeto a prestação de serviços de acolhimento, moradia e cuidados personalizados ao(à) residente assistido(a), incluindo suporte da equipe de cuidadores, alimentação, higiene, limpeza, lavanderia, atividades de convivência e acompanhamento das rotinas diárias, respeitadas as necessidades individuais e as normas aplicáveis às Instituições de Longa Permanência para Idosos.</p>

      <h3>CLÁUSULA SEGUNDA — DOS VALORES E PAGAMENTO</h3>
      <p>O valor mensal será de <strong>${formatCurrencyPDF(contract.valor)}</strong>, com vencimento no 5º dia útil de cada mês.</p>
      ${extraValue > 0 ? `<p>Será devido ainda o valor de <strong>${formatCurrencyPDF(extraValue)}</strong>, referente a ${extraDescription || 'serviços adicionais'}.</p>` : ''}
      <p>Em caso de atraso, incidirão multa de 2% e juros de 1% ao mês. Os valores poderão ser reajustados anualmente ou quando houver mudança relevante no grau de dependência do residente, mediante comunicação ao responsável.</p>

      <h3>CLÁUSULA TERCEIRA — DAS OBRIGAÇÕES DO CONTRATANTE</h3>
      <p>O CONTRATANTE deverá fornecer documentos, informações de saúde, receitas e medicamentos atualizados; manter contatos de emergência; cumprir as normas internas da instituição; e ressarcir despesas particulares do residente não incluídas na mensalidade, quando comprovadas.</p>

      <h3>CLÁUSULA QUARTA — DAS OBRIGAÇÕES DA CONTRATADA</h3>
      <p>A CONTRATADA deverá oferecer ambiente seguro e adequado, cuidados compatíveis com sua estrutura assistencial, alimentação, higiene, preservação da dignidade e comunicação aos responsáveis sobre intercorrências relevantes.</p>

      <h3>CLÁUSULA QUINTA — DOS SERVIÇOS NÃO INCLUÍDOS</h3>
      <p>Não estão incluídos, salvo ajuste expresso, acompanhamento hospitalar ou externo, consultas particulares, medicamentos, fraldas, materiais especiais, produtos de higiene pessoal, vestuário e demais itens de uso individual.</p>

      <h3>CLÁUSULA SEXTA — DA VIGÊNCIA E RESCISÃO</h3>
      <p>O contrato inicia-se em <strong>${formatDatePDF(startDate)}</strong>${endDate ? ` e tem término previsto em <strong>${formatDatePDF(endDate)}</strong>` : ''}. Poderá ser rescindido por qualquer das partes mediante comunicação por escrito, observadas as obrigações vencidas e os serviços já prestados.</p>

      <h3>CLÁUSULA SÉTIMA — DO FORO</h3>
      <p>Fica eleito o foro da Comarca de Ourinhos/SP para dirimir questões decorrentes deste contrato.</p>

      <p style="text-indent:0;margin-top:40px;">Ourinhos/SP, ${today}.</p>
      <table style="margin-top:70px;border:0;">
        <tr>
          <td style="width:48%;text-align:center;border:0;border-top:1px solid #000;"><strong>CONTRATADA</strong><br/>${companyName}</td>
          <td style="width:4%;border:0;"></td>
          <td style="width:48%;text-align:center;border:0;border-top:1px solid #000;"><strong>CONTRATANTE</strong><br/>${patient.responsavel || '---'}</td>
        </tr>
      </table>
    </div>
  `

  downloadWordDocument(`Contrato - ${patient.nome}`, bodyHtml, clinic, { hideClinicHeader: true, hideTitle: true })
}
