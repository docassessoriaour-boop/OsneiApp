import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  DollarSign,
  Palmtree,
  Calculator,
  Heart,
  Pill,
  Calendar,
  FileText,
  CreditCard,
  HandCoins,
  Building2,
  BarChart3,
  Landmark,
  Package,
  ClipboardList,
  Settings,
  Receipt,
  Tag,
  Upload,
  X,
  LogOut,
  UserCircle
} from 'lucide-react'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function AppSidebar({ open, onClose }: SidebarProps) {
  const location = useLocation()
  const { profile, isAdmin, signOut } = useAuth()

  const navigation = [
    {
      section: 'PRINCIPAL',
      items: [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      ],
    },
    {
      section: 'RH',
      items: [
        { name: 'Funcionários', href: '/rh/funcionarios', icon: Users },
        { name: 'Currículos', href: '/rh/curriculos', icon: FileText },
        { name: 'Escalas', href: '/rh/escalas', icon: CalendarDays },
        { name: 'Folha de Pagamento', href: '/rh/folha-pagamento', icon: DollarSign },
        { name: 'Férias', href: '/rh/ferias', icon: Palmtree },
        { name: 'Calculadora de Acerto', href: '/rh/calculadora-acerto', icon: Calculator },
      ],
    },
    {
      section: 'PACIENTES',
      items: [
        { name: 'Cadastro', href: '/pacientes/cadastro', icon: Heart },
        { name: 'Medicação', href: '/pacientes/medicacao', icon: Pill },
        { name: 'Catálogo de Medicamentos', href: '/pacientes/catalogo-medicos', icon: ClipboardList },
        { name: 'Agendamentos', href: '/pacientes/agendamentos', icon: Calendar },
        { name: 'Contratos', href: '/pacientes/contratos', icon: FileText },
      ],
    },
    {
      section: 'FINANCEIRO',
      items: [
        { name: 'Contas a Pagar', href: '/financeiro/contas-pagar', icon: CreditCard },
        { name: 'Contas a Receber', href: '/financeiro/contas-receber', icon: HandCoins },
        { name: 'Faturamento', href: '/financeiro/faturamento', icon: Receipt },
        { name: 'Movimentação Financeira', href: '/financeiro/conciliacao', icon: Building2 },
        { name: 'Balanço / DRE', href: '/financeiro/balanco-dre', icon: BarChart3 },
        { name: 'Contas Bancárias', href: '/financeiro/bancos', icon: Landmark },
        { name: 'Categorias', href: '/financeiro/categorias', icon: Tag },
      ],
    },
    {
      section: 'ESTOQUE',
      items: [
        { name: 'Produtos', href: '/estoque/produtos', icon: Package },
        { name: 'Entrada NF-e', href: '/estoque/entrada-nfe', icon: Upload },
      ],
    },
    {
      section: 'RELATÓRIOS',
      items: [
        { name: 'Relatórios', href: '/relatorios', icon: ClipboardList },
      ],
    },
    {
      section: 'SISTEMA',
      items: [
        { name: 'Configurações', href: '/configuracoes', icon: Settings },
        ...(isAdmin ? [{ name: 'Usuários', href: '/usuarios', icon: UserCircle }] : []),
      ],
    },
  ]

  const sidebarContent = (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border/50 bg-gradient-to-b from-white/5 to-transparent shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-blue-50 p-1 flex items-center justify-center shrink-0 shadow-lg border border-white/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-blue-500/10 blur-md"></div>
          <img src="/logo.png" alt="Novo Horizonte" className="h-auto w-full object-contain relative z-10 drop-shadow-sm" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-extrabold text-white leading-tight tracking-wide uppercase drop-shadow-md">
            Novo Horizonte
          </h1>
          <p className="text-[10px] uppercase font-bold text-blue-300/80 tracking-widest mt-0.5">
            Casa dos Idosos
          </p>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-lg text-sidebar-foreground hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* User Profile */}
      <div className="px-4 py-4 border-b border-sidebar-border/30">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
            {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{profile?.full_name || 'Usuário'}</p>
            <p className="text-[10px] text-blue-300/60 truncate capitalize">{profile?.role}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navigation.map((group) => (
          <div key={group.section}>
            <div className="sidebar-section-title">{group.section}</div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={onClose}
                    className={cn(
                      'sidebar-link',
                      isActive && 'sidebar-link-active'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-sidebar-border/30">
        <button 
          onClick={() => signOut()}
          className="flex items-center gap-2 w-full p-2 text-xs font-medium text-sidebar-foreground hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair do Sistema
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 lg:z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          <aside className="fixed inset-y-0 left-0 w-72 z-50 shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
