import { useDb } from '@/hooks/useDb'
import type { CompanyInfo } from '@/lib/types'

export function useClinic(): [CompanyInfo | undefined] {
  const { data } = useDb<CompanyInfo>('company_info')
  return [data[0]]
}
