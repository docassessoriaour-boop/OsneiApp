import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDb } from '@/hooks/useDb'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import type { Employee, Patient, Bill, Income, Product, Appointment, Contract } from '@/lib/types'
import {
  Users,
  Heart,
  CreditCard,
  HandCoins,
  Calendar,
  Package,
  Loader2,
  RefreshCw
} from 'lucide-react'

export default function Dashboard() {
  const { data: employees, loading: l1, reload: r1 } = useDb<Employee>('employees')
  const { data: patients, loading: l2, reload: r2 } = useDb<Patient>('patients')
  const { data: bills, loading: l3, reload: r3 } = useDb<Bill>('bills')
  const { data: incomes, loading: l4, reload: r4 } = useDb<Income>('incomes')
  const { data: products, loading: l5, reload: r5 } = useDb<Product>('products')
  const { data: appointments, loading: l6, reload: r6 } = useDb<Appointment>('appointments')
  const { data: contracts, loading: l7, reload: r7 } = useDb<Contract>('contracts')

  const reloadAll = () => {
    r1(); r2(); r3(); r4(); r5(); r6(); r7();
  }

  const loading = l1 || l2 || l3 || l4 || l5 || l6 || l7

  const activeEmployees = employees.filter(e => e.status === 'ativo')
  const activePatients = patients.filter(p => p.status === 'ativo')
  const pendingBills = bills.filter(b => b.status === 'pendente')
  const pendingIncomes = incomes.filter(i => i.status === 'pendente')
  const totalBills = pendingBills.reduce((sum, b) => sum + b.valor, 0)
  const totalIncomes = pendingIncomes.reduce((sum, i) => sum + i.valor, 0)

  const today = new Date().toISOString().slice(0, 10)
  const todayAppointments = appointments.filter(a => a.data === today && a.status === 'agendado')

  const totalStock = products.reduce((sum, p) => sum + p.estoque, 0)
  const stockOk = products.length === 0 || products.every(p => p.estoque >= p.estoqueMinimo)

  // Calcular contratos a vencer em 30 dias
  const in30Days = new Date()
  in30Days.setDate(in30Days.getDate() + 30)
  const limitDate = in30Days.toISOString().slice(0, 10)
  
  const expiringContracts = contracts.filter(c => 
    c.status === 'ativo' && 
    c.dataFim <= limitDate && 
    c.dataFim >= today
  ).sort((a, b) => a.dataFim.localeCompare(b.dataFim))

  const stats = [
    {
      title: 'Funcionários Ativos',
      value: activeEmployees.length.toString(),
      icon: Users,
      subtitle: undefined,
    },
    {
      title: 'Pacientes',
      value: activePatients.length.toString(),
      icon: Heart,
      subtitle: undefined,
    },
    {
      title: 'Contas a Pagar',
      value: formatCurrency(totalBills),
      icon: CreditCard,
      subtitle: `${pendingBills.length} pendentes`,
    },
    {
      title: 'Contas a Receber',
      value: formatCurrency(totalIncomes),
      icon: HandCoins,
      subtitle: `${pendingIncomes.length} pendentes`,
    },
    {
      title: 'Agendamentos Hoje',
      value: todayAppointments.length.toString(),
      icon: Calendar,
      subtitle: undefined,
    },
    {
      title: 'Produtos em Estoque',
      value: totalStock.toString(),
      icon: Package,
      subtitle: stockOk ? 'Estoque OK' : 'Atenção ao estoque',
    },
  ]

  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visão geral do sistema</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="sm" onClick={reloadAll} className="gap-2 h-8">
             <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="stat-card">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
              {stat.subtitle && (
                <p className="text-sm text-muted-foreground mt-1">{stat.subtitle}</p>
              )}
            </div>
            <div className="stat-card-icon">
              <stat.icon className="h-5 w-5" />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold text-foreground mb-4">Contratos a Vencer (Próximos 30 dias)</h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Paciente</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Vencimento</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground text-right">Valor</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expiringContracts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum contrato vencendo nos próximos 30 dias.
                    </td>
                  </tr>
                ) : (
                  expiringContracts.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{c.pacienteNome}</td>
                      <td className="px-4 py-3 text-destructive font-semibold">
                        {formatDate(c.dataFim)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(c.valor)}</td>
                      <td className="px-4 py-3 uppercase text-[10px] font-bold tracking-wider">
                        <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Próximo ao Vencimento</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
