import type { CompanySettings } from './types'
import { downloadWordDocument } from './word'

const blank = '____________________________________________________________'

export function downloadContractTemplateWord(
  type: 'funcionario' | 'paciente',
  clinic?: Partial<CompanySettings>,
) {
  const isEmployee = type === 'funcionario'
  const party = isEmployee ? 'CONTRATADO(A)' : 'RESIDENTE / RESPONSÁVEL'
  const title = isEmployee
    ? 'MODELO DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS — FUNCIONÁRIO'
    : 'MODELO DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS — PACIENTE'

  const html = `
    <div style="text-align:center;margin-bottom:30px"><h2>${title}</h2></div>
    <div class="abnt-text" style="text-align:justify;line-height:1.6;font-size:12pt">
      <p style="text-indent:0"><strong>CONTRATANTE:</strong> ${blank}</p>
      <p style="text-indent:0"><strong>${party}:</strong> ${blank}</p>
      <p style="text-indent:0"><strong>CPF/CNPJ:</strong> ${blank}</p>
      <p style="text-indent:0"><strong>ENDEREÇO:</strong> ${blank}</p>

      <h3>CLÁUSULA PRIMEIRA — DO OBJETO</h3>
      <p>${isEmployee
        ? 'O presente instrumento tem por objeto a prestação dos serviços descritos a seguir: ' + blank
        : 'O presente instrumento tem por objeto a prestação de serviços de acolhimento, moradia e cuidados ao residente acima identificado.'}</p>

      <h3>CLÁUSULA SEGUNDA — DO VALOR E PAGAMENTO</h3>
      <p>O valor ajustado é de R$ ____________________, com vencimento no dia __________ de cada mês.</p>

      <h3>CLÁUSULA TERCEIRA — DA VIGÊNCIA</h3>
      <p>Início em ____/____/________ e término em ____/____/________, salvo renovação, substituição, baixa ou cancelamento formal.</p>

      <h3>CLÁUSULA QUARTA — DAS OBRIGAÇÕES</h3>
      <p>As partes comprometem-se a cumprir as obrigações legais e as condições específicas registradas neste instrumento e em seus anexos.</p>

      <h3>CLÁUSULA QUINTA — DA RESCISÃO</h3>
      <p>O contrato poderá ser encerrado mediante comunicação formal, com registro do motivo e preservação do histórico documental.</p>

      <h3>CLÁUSULA SEXTA — DO FORO</h3>
      <p>Fica eleito o foro da comarca de ______________________________ para dirimir questões decorrentes deste contrato.</p>

      <p style="margin-top:50px;text-indent:0">______________________________, ____ de ____________________ de ________.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:80px">
        <div style="text-align:center;border-top:1px solid #000;padding-top:8px">CONTRATANTE</div>
        <div style="text-align:center;border-top:1px solid #000;padding-top:8px">${party}</div>
      </div>
    </div>
  `

  downloadWordDocument(`Modelo de Contrato - ${isEmployee ? 'Funcionário' : 'Paciente'}`, html, clinic, { hideTitle: true })
}
