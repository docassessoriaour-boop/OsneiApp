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
import Laudos from '@/pages/pacientes/Laudos'
import Profissionais from '@/pages/pacientes/Profissionais'
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
import Administracao from '@/pages/Administracao'
import Configuracoes from '@/pages/Configuracoes'
import Usuarios from '@/pages/Usuarios'
import Curriculos from '@/pages/rh/Curriculos'
import CalculadoraAcerto from '@/pages/rh/CalculadoraAcerto'
import Logs from '@/pages/Logs'

export default function App() {
  const { user, profile, loading, isAdmin, isManager } = useAuth()
  const isStandard = profile?.role === 'user'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const ProtectedRoute = ({ children, allowStandard = false }: { children: React.ReactNode, allowStandard?: boolean }) => {
    if (!allowStandard && isStandard) {
      return <Navigate to="/" replace />
    }
    return <>{children}</>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        
        <Route element={user ? <AppLayout /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<Dashboard />} />
          
          {/* RH */}
          <Route path="/rh/funcionarios" element={<ProtectedRoute><Funcionarios /></ProtectedRoute>} />
          <Route path="/rh/curriculos" element={<ProtectedRoute><Curriculos /></ProtectedRoute>} />
          <Route path="/rh/escalas" element={<ProtectedRoute><Escalas /></ProtectedRoute>} />
          <Route path="/rh/folha-pagamento" element={<ProtectedRoute><FolhaPagamento /></ProtectedRoute>} />
          <Route path="/rh/ferias" element={<ProtectedRoute><Ferias /></ProtectedRoute>} />
          <Route path="/rh/calculadora-acerto" element={<ProtectedRoute><CalculadoraAcerto /></ProtectedRoute>} />
          
          {/* Pacientes */}
          <Route path="/pacientes/cadastro" element={<ProtectedRoute><Cadastro /></ProtectedRoute>} />
          <Route path="/pacientes/medicacao" element={<ProtectedRoute><Medicacao /></ProtectedRoute>} />
          <Route path="/pacientes/laudos" element={<ProtectedRoute><Laudos /></ProtectedRoute>} />
          <Route path="/pacientes/profissionais" element={<ProtectedRoute><Profissionais /></ProtectedRoute>} />
          <Route path="/pacientes/catalogo-medicos" element={<ProtectedRoute><MedicamentosBase /></ProtectedRoute>} />
          <Route path="/pacientes/agendamentos" element={<ProtectedRoute><Agendamentos /></ProtectedRoute>} />
          <Route path="/pacientes/contratos" element={<ProtectedRoute><Contratos /></ProtectedRoute>} />
          
          {/* Financeiro */}
          <Route path="/financeiro/contas-pagar" element={<ProtectedRoute><ContasPagar /></ProtectedRoute>} />
          <Route path="/financeiro/contas-receber" element={<ProtectedRoute><ContasReceber /></ProtectedRoute>} />
          <Route path="/financeiro/faturamento" element={<ProtectedRoute><Faturamento /></ProtectedRoute>} />
          <Route path="/financeiro/conciliacao" element={<ProtectedRoute><Conciliacao /></ProtectedRoute>} />
          <Route path="/financeiro/balanco-dre" element={<ProtectedRoute><BalancoDRE /></ProtectedRoute>} />
          <Route path="/financeiro/bancos" element={<ProtectedRoute><Bancos /></ProtectedRoute>} />
          <Route path="/financeiro/categorias" element={<ProtectedRoute><Categorias /></ProtectedRoute>} />
          
          {/* Estoque */}
          <Route path="/estoque/produtos" element={<ProtectedRoute><Produtos /></ProtectedRoute>} />
          <Route path="/estoque/entrada-nfe" element={<ProtectedRoute><EntradaNfe /></ProtectedRoute>} />
          
          {/* Relatórios */}
          <Route path="/relatorios" element={<ProtectedRoute allowStandard={true}><Relatorios /></ProtectedRoute>} />

          {/* Administração */}
          <Route path="/administracao" element={<ProtectedRoute><Administracao /></ProtectedRoute>} />
          
          {/* Configurações */}
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/usuarios" element={<Usuarios />} />
          <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
