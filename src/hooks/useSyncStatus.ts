import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'

interface SyncStatusData {
  gmail: {
    connected: boolean
    lastSync: string | null
    emailCount: number
    syncing?: boolean
  }
  hubspot: {
    connected: boolean
    lastSync: string | null
    contactCount: number
    noteCount: number
    syncing?: boolean
  }
  calendar: {
    connected: boolean
    lastSync: string | null
    eventCount: number
    syncing?: boolean
  }
}

export function useSyncStatus() {
  const { user, isAuthenticated } = useAuth()
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSyncStatus = async () => {
    if (!isAuthenticated || !user) return

    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/sync/status')
      
      if (!response.ok) {
        throw new Error('Failed to fetch sync status')
      }
      
      const data = await response.json()
      setSyncStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const triggerSync = async (service?: 'gmail' | 'calendar' | 'hubspot') => {
    if (!isAuthenticated || !user) return

    try {
      setSyncStatus(prev => {
        if (!prev) return prev
        const updated = { ...prev }
        
        if (!service || service === 'gmail') {
          updated.gmail = { ...updated.gmail, syncing: true }
        }
        if (!service || service === 'calendar') {
          updated.calendar = { ...updated.calendar, syncing: true }
        }
        if (!service || service === 'hubspot') {
          updated.hubspot = { ...updated.hubspot, syncing: true }
        }
        
        return updated
      })

      const endpoint = service ? `/api/sync/${service}` : '/api/full-sync'
      const response = await fetch(endpoint, { method: 'POST' })
      
      if (!response.ok) {
        throw new Error(`Failed to sync ${service || 'all services'}`)
      }
      
      // Refresh status after sync
      setTimeout(fetchSyncStatus, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
      setSyncStatus(prev => {
        if (!prev) return prev
        const updated = { ...prev }
        
        if (!service || service === 'gmail') {
          updated.gmail = { ...updated.gmail, syncing: false }
        }
        if (!service || service === 'calendar') {
          updated.calendar = { ...updated.calendar, syncing: false }
        }
        if (!service || service === 'hubspot') {
          updated.hubspot = { ...updated.hubspot, syncing: false }
        }
        
        return updated
      })
    }
  }

  const isAnySyncing = syncStatus ? (
    syncStatus.gmail.syncing || 
    syncStatus.calendar.syncing || 
    syncStatus.hubspot.syncing
  ) : false

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchSyncStatus()
    }
  }, [isAuthenticated, user])

  return {
    syncStatus,
    isLoading,
    error,
    isAnySyncing,
    refetch: fetchSyncStatus,
    triggerSync
  }
}