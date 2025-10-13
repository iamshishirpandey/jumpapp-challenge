import React from 'react'
import { Mail, Calendar, Users, Loader2 } from 'lucide-react'
import { useSyncStatus } from '@/hooks/useSyncStatus'

export const SyncChips = () => {
  const { syncStatus, isLoading, isAnySyncing } = useSyncStatus()

  if (isLoading || !syncStatus) {
    return (
      <div className="space-y-3 mb-4">
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
          <div className="flex items-center gap-2 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs sm:text-sm animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading sync status...</span>
          </div>
        </div>
      </div>
    )
  }

  const isFirstTimeUser = syncStatus.gmail.emailCount === 0 && syncStatus.calendar.eventCount === 0 && syncStatus.hubspot.contactCount === 0

  const chips = [
    {
      key: 'gmail',
      icon: Mail,
      label: 'Gmail',
      connected: syncStatus.gmail.connected,
      count: syncStatus.gmail.emailCount,
      syncing: syncStatus.gmail.syncing,
      bgColor: 'border-gray-200',
      textColor: syncStatus.gmail.connected ? 'text-gray-900' : 'text-gray-500',
      iconColor: syncStatus.gmail.connected ? 'text-red-600' : 'text-gray-400',
    },
    {
      key: 'calendar',
      icon: Calendar,
      label: 'Calendar',
      connected: syncStatus.calendar.connected,
      count: syncStatus.calendar.eventCount,
      syncing: syncStatus.calendar.syncing,
      bgColor: 'border-gray-200',
      textColor: syncStatus.calendar.connected ? 'text-gray-900' : 'text-gray-500',
      iconColor: syncStatus.calendar.connected ? 'text-blue-600' : 'text-gray-400',
    },
    {
      key: 'hubspot',
      icon: Users,
      label: 'HubSpot',
      connected: syncStatus.hubspot.connected,
      count: syncStatus.hubspot.contactCount + syncStatus.hubspot.noteCount,
      syncing: syncStatus.hubspot.syncing,
      bgColor: 'border-gray-200',
      textColor: syncStatus.hubspot.connected ? 'text-gray-900' : 'text-gray-500',
      iconColor: syncStatus.hubspot.connected ? 'text-orange-600' : 'text-gray-400',
    },
  ]

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
        {chips.map((chip) => {
          const Icon = chip.icon
          
          return (
            <div
              key={chip.key}
              className={`flex items-center gap-2 border px-3 py-1.5 rounded-full text-xs sm:text-sm transition-colors ${chip.bgColor} ${chip.textColor}`}
            >
              <div className="flex items-center gap-1.5">
                {chip.syncing ? (
                  <Loader2 className={`h-3 w-3 animate-spin ${chip.iconColor}`} />
                ) : (
                  <Icon className={`h-3 w-3 ${chip.iconColor}`} />
                )}
              </div>
              <span className="font-medium whitespace-nowrap">
                {chip.syncing 
                  ? `Syncing ${chip.label}...` 
                  : chip.connected 
                    ? `${chip.label} synced` 
                    : `${chip.label} not connected`
                }
              </span>
              {chip.connected && !chip.syncing && chip.count > 0 && (
                <span className="text-xs bg-white/70 px-2 py-0.5 rounded-full font-semibold">
                  {chip.count.toLocaleString()}
                </span>
              )}
            </div>
          )
        })}
        
        {isAnySyncing && (
          <div className="flex items-center gap-2 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full text-xs sm:text-sm">
            <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
            <span className="font-medium whitespace-nowrap">Syncing in progress...</span>
          </div>
        )}
      </div>
      
      {(isAnySyncing || isFirstTimeUser) && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg text-sm">
            <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">
              {isAnySyncing 
                ? "⚡ Sync in progress - responses will improve once complete!" 
                : "🔄 Initial sync starting - this may take a few minutes for better AI responses"
              }
            </span>
          </div>
        </div>
      )}
    </div>
  )
}