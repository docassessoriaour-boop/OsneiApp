import { useState } from 'react'

export interface AddressData {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  erro?: boolean
}

export function useCep() {
  const [loading, setLoading] = useState(false)

  const fetchCep = async (cep: string): Promise<AddressData | null> => {
    const cleanCep = cep.replace(/\D/g, '')
    if (cleanCep.length !== 8) return null

    setLoading(true)
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
      const data = await response.json()
      
      if (data.erro) {
        console.warn('CEP não encontrado')
        return null
      }

      return data as AddressData
    } catch (error) {
      console.error('Erro ao buscar CEP:', error)
      return null
    } finally {
      setLoading(true)
      // Small delay to prevent flickering
      setTimeout(() => setLoading(false), 300)
    }
  }

  return { fetchCep, loading }
}
