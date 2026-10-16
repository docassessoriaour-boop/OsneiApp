import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useClinic } from '@/lib/clinicConfig'
import { downloadContractTemplateWord } from '@/lib/contractTemplates'
import { Download, FileText, ShieldCheck } from 'lucide-react'

export default function ModelosContratos() {
  const [clinic] = useClinic()

  const models = [
    {
      type: 'funcionario' as const,
      title: 'Contrato de Funcionário',
      description: 'Modelo editável para contratos de prestação de serviços de funcionários, autônomos e prestadores.',
    },
    {
      type: 'paciente' as const,
      title: 'Contrato de Paciente',
      description: 'Modelo editável para contratos de acolhimento, moradia e cuidados dos residentes.',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Modelo de Arquivos</h1>
        <p className="text-muted-foreground">Modelos Word para funcionários e pacientes</p>
      </div>

      <Card className="border-l-4 border-l-primary p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-bold">Modelos administrativos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estes arquivos são modelos editáveis. Contratos já lançados no sistema permanecem bloqueados e preservados no histórico.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {models.map(model => (
          <Card key={model.type} className="p-6">
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-lg font-bold">{model.title}</h2>
              </div>
              <p className="mt-4 flex-1 text-sm text-muted-foreground">{model.description}</p>
              <Button className="mt-6 w-full gap-2" onClick={() => downloadContractTemplateWord(model.type, clinic)}>
                <Download className="h-4 w-4" /> Baixar modelo em Word
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
