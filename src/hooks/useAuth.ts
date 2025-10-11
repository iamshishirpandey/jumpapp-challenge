import { useSession } from 'next-auth/react'

export function useAuth() {
  const { data: sessionData, status } = useSession()
  
  return {
    user: sessionData?.session?.user || sessionData?.user,
    accessToken: sessionData?.accessToken,
    isLoading: status === 'loading',
    isAuthenticated: !!sessionData
  }
}