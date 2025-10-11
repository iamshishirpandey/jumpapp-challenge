import React, { useState, useEffect } from 'react'
import { Settings, Check, X, Calendar, Mail, Users, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface SyncStatus {
  gmail: {
    connected: boolean
    lastSync: string | null
    emailCount: number
  }
  hubspot: {
    connected: boolean
    lastSync: string | null
    contactCount: number
    noteCount: number
  }
  calendar: {
    connected: boolean
    lastSync: string | null
    eventCount: number
  }
}

interface SettingsDialogProps {
  children: React.ReactNode
}

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    gmail: { connected: false, lastSync: null, emailCount: 0 },
    hubspot: { connected: false, lastSync: null, contactCount: 0, noteCount: 0 },
    calendar: { connected: false, lastSync: null, eventCount: 0 }
  })
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    fetchSyncStatus()
  }, [])

  const fetchSyncStatus = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setIsRefreshing(true);
      
      const response = await fetch('/api/sync/status')
      
      if (response.ok) {
        const data = await response.json()
        setSyncStatus(data)
      }
    } catch (error) {
    } finally {
      if (showRefreshing) setIsRefreshing(false);
    }
  }

  const handleSync = async (type: string) => {
    setIsLoading(type)
    try {
      const response = await fetch(`/api/sync/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          type === 'gmail' ? { query: 'newer_than:7d', maxResults: 50 } :
          type === 'hubspot' ? { syncContacts: true, syncNotes: true, limit: 100 } :
          type === 'calendar' ? { syncAll: false, maxResults: 100 } :
          {}
        ),
      })

      const data = await response.json()

      if (response.ok) {
        await fetchSyncStatus()
      }
    } catch (error) {
    } finally {
      setIsLoading(null)
    }
  }

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return 'Never'
    const date = new Date(lastSync)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Sync Settings
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fetchSyncStatus(true)}
              disabled={isRefreshing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-50 rounded-lg">
                  <Mail className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-medium">Gmail</h3>
                  <p className="text-sm text-gray-500">{syncStatus.gmail.emailCount} emails synced</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {syncStatus.gmail.connected ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-gray-500">
                    <X className="h-4 w-4" />
                    <span className="text-sm">Not connected</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Last sync: {formatLastSync(syncStatus.gmail.lastSync)}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSync('gmail')}
                disabled={isLoading === 'gmail' || !syncStatus.gmail.connected}
              >
                {isLoading === 'gmail' ? 'Syncing...' : syncStatus.gmail.connected ? 'Sync Now' : 'Not Connected'}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <img 
                    src="/assets/hubspot_logo.png" 
                    alt="HubSpot" 
                    className="h-5 w-5"
                  />
                </div>
                <div>
                  <h3 className="font-medium">HubSpot</h3>
                  <p className="text-sm text-gray-500">
                    {syncStatus.hubspot.contactCount} contacts, {syncStatus.hubspot.noteCount} notes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {syncStatus.hubspot.connected ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-gray-500">
                    <X className="h-4 w-4" />
                    <span className="text-sm">Not connected</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Last sync: {formatLastSync(syncStatus.hubspot.lastSync)}
              </p>
              {syncStatus.hubspot.connected ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSync('hubspot')}
                  disabled={isLoading === 'hubspot'}
                >
                  {isLoading === 'hubspot' ? 'Syncing...' : 'Sync Now'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.href = '/api/hubspot/oauth'}
                >
                  Connect HubSpot
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium">Google Calendar</h3>
                  <p className="text-sm text-gray-500">{syncStatus.calendar.eventCount} events synced</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {syncStatus.calendar.connected ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-gray-500">
                    <X className="h-4 w-4" />
                    <span className="text-sm">Not connected</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Last sync: {formatLastSync(syncStatus.calendar.lastSync)}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSync('calendar')}
                disabled={isLoading === 'calendar' || !syncStatus.calendar.connected}
              >
                {isLoading === 'calendar' ? 'Syncing...' : syncStatus.calendar.connected ? 'Sync Now' : 'Not Connected'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}