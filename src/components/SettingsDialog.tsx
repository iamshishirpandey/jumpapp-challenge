import React, { useState, useEffect } from 'react'
import { Settings, Check, X, Calendar, Mail, Users, RefreshCw, Webhook } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { WebhookSettings } from "@/components/WebhookSettings"
import { cn } from "@/lib/utils"

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

type TabType = 'general' | 'webhooks'

export function SettingsDialog({ children }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general')
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

  const tabs = [
    {
      id: 'general' as TabType,
      label: 'General',
      icon: Settings,
      description: 'Manage sync settings and connections'
    },
    {
      id: 'webhooks' as TabType,
      label: 'Webhooks',
      icon: Webhook,
      description: 'Real-time synchronization settings'
    }
  ]

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">General Settings</h2>
                <p className="text-sm text-gray-500">Manage your sync connections and data</p>
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
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1">
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-xs text-gray-500">
                  Last sync: {formatLastSync(syncStatus.gmail.lastSync)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSync('gmail')}
                  disabled={isLoading === 'gmail' || !syncStatus.gmail.connected}
                  className="w-full sm:w-auto"
                >
                  {isLoading === 'gmail' ? 'Syncing...' : syncStatus.gmail.connected ? 'Sync Now' : 'Not Connected'}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1">
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-xs text-gray-500">
                  Last sync: {formatLastSync(syncStatus.hubspot.lastSync)}
                </p>
                {syncStatus.hubspot.connected ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSync('hubspot')}
                    disabled={isLoading === 'hubspot'}
                    className="w-full sm:w-auto"
                  >
                    {isLoading === 'hubspot' ? 'Syncing...' : 'Sync Now'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.location.href = '/api/hubspot/oauth'}
                    className="w-full sm:w-auto"
                  >
                    Connect HubSpot
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1">
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <p className="text-xs text-gray-500">
                  Last sync: {formatLastSync(syncStatus.calendar.lastSync)}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSync('calendar')}
                  disabled={isLoading === 'calendar' || !syncStatus.calendar.connected}
                  className="w-full sm:w-auto"
                >
                  {isLoading === 'calendar' ? 'Syncing...' : syncStatus.calendar.connected ? 'Sync Now' : 'Not Connected'}
                </Button>
              </div>
            </div>
          </div>
        )
      case 'webhooks':
        return (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">Webhook Settings</h2>
              <p className="text-sm text-gray-500">Configure real-time synchronization</p>
            </div>
            <WebhookSettings isConnected={syncStatus.gmail.connected} />
          </div>
        )
      default:
        return null
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-[800px] max-h-[90vh] p-0 rounded-xl">
        <div className="flex flex-col sm:flex-row h-full">
          {/* Mobile header with tabs */}
          <div className="sm:hidden border-b bg-gray-50/50 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="h-5 w-5" />
              <span className="font-semibold">Settings</span>
            </div>
            
            <nav className="flex gap-2 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-left rounded-lg transition-colors whitespace-nowrap flex-shrink-0",
                      activeTab === tab.id
                        ? "bg-white border border-gray-200 shadow-sm text-gray-900"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <div className="font-medium text-sm">{tab.label}</div>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Desktop sidebar with tabs */}
          <div className="hidden sm:block w-60 border-r bg-gray-50/50 p-4">
            <div className="flex items-center gap-2 mb-6 px-2">
              <Settings className="h-5 w-5" />
              <span className="font-semibold">Settings</span>
            </div>
            
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors",
                      activeTab === tab.id
                        ? "bg-white border border-gray-200 shadow-sm text-gray-900"
                        : "text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{tab.label}</div>
                      <div className="text-xs text-gray-500 truncate">{tab.description}</div>
                    </div>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto">
            <div className="p-4 sm:p-6">
              {renderTabContent()}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}