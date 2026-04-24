import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Profile, UserRole } from '@/hooks/useAuth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Loader2, 
  UserPlus, 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Mail, 
  Trash2,
  AlertTriangle
} from 'lucide-react'
import {
  Select,
} from "@/components/ui/select"

export default function Usuarios() {
  const { isAdmin, user: currentUser } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers(data as Profile[])
    } catch (error) {
      console.error('Error fetching users:', error)
      alert('Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    if (userId === currentUser?.id) {
      alert('Você não pode alterar sua própria permissão.')
      return
    }

    setUpdating(userId)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)

      if (error) throw error
      
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
      alert('Permissão atualizada com sucesso!')
    } catch (error) {
      console.error('Error updating role:', error)
      alert('Erro ao atualizar permissão.')
    } finally {
      setUpdating(null)
    }
  }

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newUserInfo, setNewUserInfo] = useState({ email: '', password: '', fullName: '', role: 'user' as UserRole })
  const [adding, setAdding] = useState(false)

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)

    try {
      // Usando a API de Admin (já que a chave configurada no projeto permite)
      // Isso evita o limite de taxa de e-mails, não desloga o admin e auto-confirma o email
      const { data, error } = await supabase.auth.admin.createUser({
        email: newUserInfo.email,
        password: newUserInfo.password,
        email_confirm: true,
        user_metadata: {
          full_name: newUserInfo.fullName,
          role: newUserInfo.role
        }
      })

      if (error) throw error

      alert('Usuário criado com sucesso!')
      setIsAddModalOpen(false)
      fetchUsers()
    } catch (error: any) {
      console.error('Error adding user:', error)
      alert('Erro ao criar usuário: ' + error.message)
    } finally {
      setAdding(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="p-4 bg-red-100 rounded-full text-red-600 mb-4">
          <AlertTriangle className="h-12 w-12" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Acesso Negado</h1>
        <p className="text-slate-500 max-w-md mt-2">
          Você não tem permissão de administrador para gerenciar usuários do sistema.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestão de Usuários</h1>
          <p className="text-muted-foreground">Controle quem tem acesso ao sistema e suas permissões</p>
        </div>
        <Button className="gap-2" onClick={() => setIsAddModalOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md p-6 bg-white animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-4">Cadastrar Novo Usuário</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="add-name">Nome Completo</Label>
                <Input 
                  id="add-name"
                  value={newUserInfo.fullName}
                  onChange={(e) => setNewUserInfo({...newUserInfo, fullName: e.target.value})}
                  placeholder="Nome do colaborador"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-email">Email</Label>
                <Input 
                  id="add-email"
                  type="email"
                  value={newUserInfo.email}
                  onChange={(e) => setNewUserInfo({...newUserInfo, email: e.target.value})}
                  placeholder="email@empresa.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-password">Senha Temporária</Label>
                <Input 
                  id="add-password"
                  type="password"
                  value={newUserInfo.password}
                  onChange={(e) => setNewUserInfo({...newUserInfo, password: e.target.value})}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-role">Nível de Acesso</Label>
                <Select
                  value={newUserInfo.role}
                  onChange={(e) => setNewUserInfo({...newUserInfo, role: e.target.value as UserRole})}
                  className="w-full"
                >
                  <option value="user">Padrão</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={adding}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Criar Usuário
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <div className="grid gap-4">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : users.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            Nenhum usuário encontrado.
          </Card>
        ) : (
          users.map((user) => (
            <Card key={user.id} className="p-6 transition-all hover:shadow-md border-slate-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {user.full_name?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg">
                      {user.full_name || 'Sem nome'}
                      {user.id === currentUser?.id && (
                        <Badge variant="outline" className="ml-2 bg-slate-100">Você</Badge>
                      )}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {user.email}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-500">Nível de Acesso:</span>
                    <Select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                      disabled={updating === user.id || user.id === currentUser?.id}
                      className="w-[140px]"
                    >
                      <option value="user">Padrão</option>
                      <option value="manager">Gerente</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500" disabled={user.id === currentUser?.id}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Card className="p-6 bg-blue-50 border-blue-100">
        <div className="flex gap-4">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600 h-fit">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-semibold text-blue-900">Sobre os níveis de acesso</h4>
            <ul className="mt-2 space-y-1 text-sm text-blue-800/80">
              <li>• <strong>Admin:</strong> Acesso total ao sistema, configurações e gestão de usuários.</li>
              <li>• <strong>Gerente:</strong> Acesso aos módulos de RH, Pacientes e Financeiro (exceto configurações críticas).</li>
              <li>• <strong>Padrão:</strong> Acesso básico para visualização e operações rotineiras conforme atribuído.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
