import { Navigate } from 'react-router-dom'
import { Download, ExternalLink, FileText, Printer } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { isLarSabedoria } from '@/lib/companies'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const modelos = [
  { titulo: 'Escala de funcionários', arquivo: '01-escala-funcionarios.pdf', descricao: 'Tabela mensal com data, funcionário, função, entrada, saída, intervalo e assinatura.' },
  { titulo: 'Recibo de funcionário', arquivo: '02-recibo-funcionario.pdf', descricao: 'Recibo em branco com valor, referência, forma de pagamento, data e assinaturas.' },
  { titulo: 'Recibo de paciente', arquivo: '03-recibo-paciente.pdf', descricao: 'Recibo em branco para paciente ou responsável, com valor, referência e assinaturas.' },
  { titulo: 'Prontuário de funcionário', arquivo: '04-prontuario-funcionario.pdf', descricao: 'Identificação, histórico e tabela de acompanhamento e ocorrências.' },
  { titulo: 'Prontuário de paciente', arquivo: '05-prontuario-paciente.pdf', descricao: 'Identificação, informações importantes e páginas para evolução e registros.' },
  { titulo: 'Contrato de funcionário', arquivo: '06-contrato-funcionario.pdf', descricao: 'Modelo com espaços para qualificação, condições, valores, vigência, cláusulas e assinaturas.' },
  { titulo: 'Contrato de paciente', arquivo: '07-contrato-paciente.pdf', descricao: 'Modelo com espaços para acolhimento, cuidados, valores, vigência, cláusulas e assinaturas.' },
]

export default function DocumentosManuais() {
  const { profile, isAdmin, isManager } = useAuth()
  if (!profile?.company_id || !isLarSabedoria(profile.company) || (!isAdmin && !isManager)) return <Navigate to="/" replace />

  return <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold">Modelos para impressão e preenchimento manual</h1>
      <p className="text-muted-foreground">Lar de Convivência da Sabedoria - arquivos PDF prontos para imprimir e preencher à mão.</p>
    </div>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 flex gap-3">
      <Printer className="h-5 w-5 shrink-0" />
      <p>Clique em <strong>Abrir PDF</strong> e use o botão de impressão do navegador. Para guardar uma cópia no computador, clique em <strong>Baixar</strong>.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modelos.map(modelo => {
        const url = `/modelos-documentos-lar/${modelo.arquivo}`
        return <article key={modelo.arquivo} className="rounded-xl border bg-card p-5 flex flex-col gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-700"><FileText className="h-6 w-6" /></div>
            <div><h2 className="font-semibold text-lg">{modelo.titulo}</h2><p className="mt-1 text-sm text-muted-foreground">{modelo.descricao}</p></div>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <a className={buttonVariants()} href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir PDF</a>
            <a className={cn(buttonVariants({ variant: 'outline' }))} href={url} download={modelo.arquivo}><Download className="h-4 w-4" />Baixar</a>
          </div>
        </article>
      })}
    </div>
  </div>
}
