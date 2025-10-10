import { useState, useEffect } from 'react'

interface HubSpotStatus {
  connected: boolean
  connectedAt?: string
  portalId?: string
}

export function useHubSpot() {
  const [status, setStatus] = useState<HubSpotStatus>({ connected: false })
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/hubspot/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Error fetching HubSpot status:', error)
    } finally {
      setLoading(false)
    }
  }

  const connect = () => {
    window.location.href = '/api/hubspot/oauth'
  }

  const disconnect = async () => {
    try {
      const response = await fetch('/api/hubspot/status', {
        method: 'DELETE',
      })
      if (response.ok) {
        setStatus({ connected: false })
      }
    } catch (error) {
      console.error('Error disconnecting HubSpot:', error)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  return {
    ...status,
    loading,
    connect,
    disconnect,
    refetch: fetchStatus,
  }
}