import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'

import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Funcionarios from '@/pages/rh/Funcionarios'
import Escalas from '@/pages/rh/Escalas'
import FolhaPagamento from '@/pages/rh/FolhaPagamento'
import Ferias from '@/pages/rh/Ferias'
import Cadastro from '@/pages/pacientes/Cadastro'
import Medicacao from '@/pages/pacientes/Medicacao'
import Agendamentos from '@/pages/pacientes/Agendamentos'
import Contratos from '@/pages/pacientes/Contratos'
import MedicamentosBase from '@/pages/pacientes/MedicamentosBase'
import ContasPagar from '@/pages/financeiro/ContasPagar'
import ContasReceber from '@/pages/financeiro/ContasReceber'
import Faturamento from '@/pages/financeiro/Faturamento'
import Conciliacao from '@/pages/financeiro/Conciliacao'
import BalancoDRE from '@/pages/financeiro/BalancoDRE'
import Bancos from '@/pages/financeiro/Bancos'
import Categorias from '@/pages/financeiro/Categorias'
import Produtos from '@/pages/estoque/Produtos'
import EntradaNfe from '@/pages/estoque/EntradaNfe'
import Relatorios from '@/pages/Relatorios'
import Configuracoes from '@/pages/Configuracoes'
import Usuarios from '@/pages/Usuarios'
import Curriculos from '@/pages/rh/Curriculos'
import CalculadoraAcerto from '@/pages/rh/CalculadoraAcerto'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        
        <Route element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Dashboard />} />
          {/* RH */}
          <Route path="/rh/funcionarios" element={<Funcionarios />} />
          <Route path="/rh/curriculos" element={<Curriculos />} />
          <Route path="/rh/escalas" element={<Escalas />} />
          <Route path="/rh/folha-pagamento" element={<FolhaPagamento />} />
          <Route path="/rh/ferias" element={<Ferias />} />
          <Route path="/rh/calculadora-acerto" element={<CalculadoraAcerto />} />
          {/* Pacientes */}
          <Route path="/pacientes/cadastro" element={<Cadastro />} />
          <Route path="/pacientes/medicacao" element={<Medicacao />} />
          <Route path="/pacientes/catalogo-medicos" element={<MedicamentosBase />} />
          <Route path="/pacientes/agendamentos" element={<Agendamentos />} />
          <Route path="/pacientes/contratos" element={<Contratos />} />
          {/* Financeiro */}
          <Route path="/financeiro/contas-pagar" element={<ContasPagar />} />
          <Route path="/financeiro/contas-receber" element={<ContasReceber />} />
          <Route path="/financeiro/faturamento" element={<Faturamento />} />
          <Route path="/financeiro/conciliacao" element={<Conciliacao />} />
          <Route path="/financeiro/balanco-dre" element={<BalancoDRE />} />
          <Route path="/financeiro/bancos" element={<Bancos />} />
          <Route path="/financeiro/categorias" element={<Categorias />} />
          {/* Estoque */}
          <Route path="/estoque/produtos" element={<Produtos />} />
          <Route path="/estoque/entrada-nfe" element={<EntradaNfe />} />
          {/* Relatórios */}
          <Route path="/relatorios" element={<Relatorios />} />
          {/* Configurações */}
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/usuarios" element={<Usuarios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
