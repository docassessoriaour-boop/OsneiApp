import type { CompanySettings, Invoice, Patient } from './types'

/**
 * Opens a styled print window with the provided HTML content.
 * Works for both "Print" and "Save as PDF" via the browser's native dialog.
 */
export function printPDF(title: string, bodyHtml: string, clinic?: CompanySettings, options?: { hideLogo?: boolean, hideClinicHeader?: boolean, compactLayout?: boolean }) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return

  const logoHtml = options?.hideLogo ? '' : `<img src="/logo.png" alt="Logo" style="max-height:120px; width: auto; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;" />`

  const clinicHeader = (clinic && !options?.hideClinicHeader)
    ? `
      <div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #1a1f2e;padding-bottom:16px;">
        ${logoHtml}
        <h1 style="margin:0;font-size:22px;color:#1a1f2e;">${clinic.razao_social || (clinic as any).name || (clinic as any).nome_fantasia || ''}</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#555;">CNPJ: ${clinic.cnpj || ''} ${clinic.inscricao_estadual ? ` | IE: ${clinic.inscricao_estadual}` : ''}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#555;">${clinic.address || (clinic as any).endereco || ''}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#555;">Tel: ${clinic.phone || (clinic as any).telefone || ''} | ${clinic.email || ''}</p>
      </div>
    `
    : ''

  const bodyPadding = options?.compactLayout ? '1.0cm' : '3.5cm 2.0cm 2.5cm 2.0cm';

  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    @page { margin: 0 !important; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      padding: ${bodyPadding};

      font-family: Arial, Helvetica, sans-serif;
      color: #000;
      font-size: 12pt;
      line-height: 1.5;
      text-align: justify;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .abnt-text p {
      text-indent: 1.5cm;
      margin-top: 6pt;
      margin-bottom: 6pt;
    }
    h2 { font-size: 16pt; margin-bottom: 12pt; color: #1a1f2e; text-align: center; text-transform: uppercase; }
    h3 { font-size: 14pt; margin: 20pt 0 10pt; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4pt; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15pt 0;
    }
    th, td {
      text-align: left;
      padding: 10pt 12pt;
      border: 1px solid #e0e0e0;
      font-size: 11pt;
    }
    th {
      background: #f8f9fa;
      font-weight: bold;
      text-transform: uppercase;
      color: #333;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .text-green { color: #16a34a; }
    .text-red { color: #dc2626; }
    .text-amber { color: #d97706; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .divider { border-top: 2px solid #1a1f2e; margin: 16px 0; }
    .section { margin-bottom: 20px; }
    .flex-between { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-success { background: #dcfce7; color: #16a34a; }
    .badge-warning { background: #fef9c3; color: #a16207; }
    .badge-danger { background: #fee2e2; color: #dc2626; }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #ccc;
      padding-top: 12px;
      font-size: 10px;
      color: #999;
      text-align: center;
    }
    .signature {
      margin-top: 60px;
      display: flex;
      justify-content: space-around;
    }
    .signature-line {
      text-align: center;
      width: 200px;
    }
    .signature-line hr {
      border: none;
      border-top: 1px solid #333;
      margin-bottom: 4px;
    }
    @media print {
      body { padding: 16px; }
    }
  </style>
</head>
<body>
  ${clinicHeader}
  <div style="text-align: center; margin-bottom: 20px;">
    <h2>${title}</h2>
    <p style="font-size: 10pt; color: #666; margin-top: -8pt;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
  </div>
  ${bodyHtml}
</body>
</html>`)
  win.document.close()
  setTimeout(() => win.print(), 400)
}

export function formatDatePDF(date: string): string {
  if (!date) return '—'
  // Garante que a data seja interpretada no meio do dia para evitar problemas de fuso horário
  const d = date.includes('T') ? new Date(date) : new Date(date + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

export function formatCurrencyPDF(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function printReceipt(invoice: Invoice, patient: Patient | undefined, clinic: CompanySettings) {
  const amountStr = formatCurrencyPDF(invoice.total_amount)
  const paymentDateStr = invoice.payment_date ? formatDatePDF(invoice.payment_date) : new Date().toLocaleDateString('pt-BR')
  
  const bodyHtml = `
    <div style="margin-bottom: 24px; padding: 12px; border: 1px solid #eee; border-radius: 6px; background: #fafafa;">
      <div style="display: grid; grid-template-cols: 1fr 1fr; gap: 12px;">
        <div>
          <p style="font-size: 11px; color: #666; margin-bottom: 2px;">PAGADOR / RESPONSÁVEL</p>
          <p><strong>${patient?.responsavel || invoice.client_name}</strong></p>
          <p style="font-size: 11px;">CPF: ${patient?.resp_cpf || invoice.client_document || '—'}</p>
        </div>
        <div>
          <p style="font-size: 11px; color: #666; margin-bottom: 2px;">PACIENTE</p>
          <p><strong>${patient?.nome || invoice.client_name}</strong></p>
          <p style="font-size: 11px;">CPF: ${patient?.cpf || '—'}</p>
        </div>
      </div>
    </div>

    <div style="font-size: 16px; line-height: 1.8; text-align: justify; margin-bottom: 40px; margin-top: 20px;">
      <p>Confirmamos o recebimento da importância de <strong>${amountStr}</strong>, 
      referente ao pagamento de <strong>${invoice.items?.[0]?.description || 'Serviços Assistenciais'}</strong>,
      realizado em <strong>${paymentDateStr}</strong>.</p>
      
      <p>Pelo que firmamos o presente recibo para que produza os efeitos legais.</p>
    </div>

    <div style="margin-top: 60px; text-align: center;">
      <p>${clinic.city || 'Ourinhos'} (SP), ${invoice.payment_date ? formatDatePDF(invoice.payment_date) : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      
      <div style="margin-top: 50px;">
        <div style="border-top: 1px solid #000; width: 300px; margin: 0 auto;"></div>
        <p style="margin-top: 5px;"><strong>${clinic.razao_social || clinic.name}</strong><br/>CNPJ: ${clinic.cnpj || ''}</p>
      </div>
    </div>
  `
  printPDF('RECIBO DE PAGAMENTO', bodyHtml, clinic)
}
