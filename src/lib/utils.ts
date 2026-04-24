import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatCPF(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

export function formatDate(date: string): string {
  if (!date) return '—'
  const d = date.includes('T') ? new Date(date) : new Date(date + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

export function generateId(): string {
  return crypto.randomUUID()
}
