import type { CompanySettings } from './types'
import { getClinicLogoSrc } from './pdf'

function safeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function downloadWordDocument(
  title: string,
  bodyHtml: string,
  clinic?: Partial<CompanySettings> | null,
  options?: { hideClinicHeader?: boolean; hideTitle?: boolean }
) {
  const clinicName = clinic?.razao_social || clinic?.name || (clinic as any)?.nome_fantasia || ''
  const logoSrc = clinic ? getClinicLogoSrc(clinic) : ''
  const clinicHeader = clinic && !options?.hideClinicHeader
    ? `<div style="text-align:center;border-bottom:2px solid #1a1f2e;padding-bottom:14px;margin-bottom:24px;">
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="max-height:90px;width:auto;" />` : ''}
        <h1 style="font-size:16pt;margin:6px 0 2px;">${clinicName}</h1>
        <p style="font-size:9pt;margin:0;">CNPJ: ${clinic.cnpj || ''}</p>
        <p style="font-size:9pt;margin:0;">${clinic.address || (clinic as any).endereco || ''}</p>
      </div>`
    : ''

  const documentHtml = `<!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->
        <style>
          @page { size: A4; margin: 2cm; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; line-height: 1.5; color: #000; }
          h2 { font-size: 14pt; text-align: center; }
          h3 { font-size: 12pt; margin-top: 20pt; }
          p { margin: 6pt 0; }
          .abnt-text p { text-align: justify; text-indent: 1.5cm; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 6px; }
        </style>
      </head>
      <body>
        ${clinicHeader}
        ${options?.hideTitle ? '' : `<h2>${title}</h2>`}
        ${bodyHtml}
      </body>
    </html>`

  const blob = new Blob(['\ufeff', documentHtml], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFileName(title) || 'documento'}.doc`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
