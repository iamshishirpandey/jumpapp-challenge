import React, { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { User, Send, SquarePen, LogOut, ChevronUp, X, Paperclip, ThumbsUp, ThumbsDown, Share, MoreHorizontal, Settings, Loader2, ExternalLink, Mail, Calendar, Users, FileText } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useHubSpot } from '@/hooks/useHubSpot'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SettingsDialog } from '@/components/SettingsDialog'

const SidebarHeaderContent = () => {
  const { state } = useSidebar()
  const [isHovered, setIsHovered] = useState(false)
  const isCollapsed = state === 'collapsed'

  return (
    <SidebarHeader className="p-2">
      <div className="flex items-center justify-between">
        <div 
          className="relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {isCollapsed && isHovered ? (
            <SidebarTrigger className="h-8 w-8" />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <span className="text-xs font-semibold">J</span>
            </div>
          )}
        </div>
        {!isCollapsed && <SidebarTrigger className="ml-auto" />}
      </div>
    </SidebarHeader>
  )
}

interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  createdAt: Date
  sources?: any[]
  isLoading?: boolean
}

interface Chat {
  id: string
  title: string
  createdAt?: string
  updatedAt?: string
  messages?: Message[]
}

const ChatPage = () => {
  const { user, isLoading: isAuthLoading } = useAuth()
  const router = useRouter()
  const { id } = router.query
  const hubspot = useHubSpot()
  const [currentChat, setCurrentChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chats, setChats] = useState<Chat[]>([])
  const [isLoadingChats, setIsLoadingChats] = useState(true)
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [skipLoadMessages, setSkipLoadMessages] = useState(false)

  useEffect(() => {
    if (user) {
      loadChats()
    }
  }, [user])

  useEffect(() => {
    if (skipLoadMessages) {
      setSkipLoadMessages(false)
      return
    }
    
    if (id && id !== 'new' && !isCreatingChat) {
      loadChatMessages(id as string)
    } else if (!id && !isCreatingChat) {
      setMessages([])
      setCurrentChat(null)
    }
  }, [id])

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('hubspot') === 'connected') {
      router.replace(router.pathname, undefined, { shallow: true })
      hubspot.refetch()
    }
  }, [router, hubspot])

  const loadChats = async () => {
    try {
      setIsLoadingChats(true)
      const response = await fetch('/api/chats')
      const data = await response.json()
      
      if (response.ok) {
        setChats(data)
      }
    } catch (error) {
    } finally {
      setIsLoadingChats(false)
    }
  }

  const loadChatMessages = async (chatId: string) => {
    try {
      const response = await fetch(`/api/chats/${chatId}`)
      const data = await response.json()
      
      if (response.ok) {
        setCurrentChat(data)
        setMessages(data.messages || [])
      }
    } catch (error) {
    }
  }

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' })
  }

  const handleNewChat = () => {
    router.push('/')
  }

  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    let chatId = id as string
    
    if (!chatId || chatId === 'new') {
      setIsCreatingChat(true)
      try {
        const response = await fetch('/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: content.slice(0, 50) })
        })
        const newChat = await response.json()
        if (response.ok) {
          chatId = newChat.id
          setCurrentChat(newChat)
          setChats(prevChats => [newChat, ...prevChats])
          setSkipLoadMessages(true)
          
          window.history.pushState(null, '', `/${newChat.id}`)
        } else {
          setIsCreatingChat(false)
          return
        }
      } catch (error) {
        setIsCreatingChat(false)
        return
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      createdAt: new Date()
    }
    
    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: 'Thinking...',
      role: 'assistant',
      createdAt: new Date(),
      isLoading: true
    }

    setMessages(prev => [...prev, userMessage, loadingMessage])

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: content,
          chatId: chatId 
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const aiMessage: Message = {
        id: loadingMessage.id,
        content: data.response || `Found ${data.resultsCount || 0} relevant results for your query.`,
        role: 'assistant',
        createdAt: new Date(),
        sources: data.results || []
      }

      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? aiMessage : msg
      ))

      if (isCreatingChat) {
        setIsCreatingChat(false)
      }

    } catch (error) {
      
      const errorMessage: Message = {
        id: loadingMessage.id,
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        role: 'assistant',
        createdAt: new Date()
      }

      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? errorMessage : msg
      ))
      
      if (isCreatingChat) {
        setIsCreatingChat(false)
      }
    }
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeaderContent />

        <SidebarContent className="px-0">
          <SidebarGroup className="px-1 pt-2 pb-0">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={handleNewChat} tooltip="New Chat" className="font-medium px-2 h-10 flex items-center">
                    <SquarePen className="h-7 w-7 shrink-0 mr-0.5" />
                    <span className="text-sm font-medium">New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                  {hubspot.connected ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2 mx-1">
                      <div className="flex items-center gap-2">
                
                        <img 
                          src="/assets/hubspot_logo.png" 
                          alt="HubSpot" 
                          className="h-6 w-6 shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-green-800">HubSpot Connected</span>
                          </div>
                          {hubspot.portalId && (
                            <span className="text-xs text-green-600">Portal: {hubspot.portalId}</span>
                          )}
                        </div>
                        <button
                          onClick={hubspot.disconnect}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="Disconnect HubSpot"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <SidebarMenuButton 
                      onClick={hubspot.connect}
                      tooltip="Connect to HubSpot" 
                      className="font-medium pl-1 pr-2 h-10 flex items-center"
                    >
                      <img 
                        src="/assets/hubspot_logo.png" 
                        alt="HubSpot" 
                        className="h-7 w-7 shrink-0 mr-0.5"
                      />
                      <span className="text-sm font-medium">Connect to HubSpot</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="px-1 group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel className="px-2">History</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isLoadingChats ? (
                  <SidebarMenuItem>
                    <div className="px-3 py-2 text-sm text-muted-foreground">Loading chats...</div>
                  </SidebarMenuItem>
                ) : chats.length === 0 ? (
                  <SidebarMenuItem>
                    <div className="px-3 py-2 text-sm text-muted-foreground">No chat history yet</div>
                  </SidebarMenuItem>
                ) : (
                  chats.map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        onClick={() => router.push(`/${chat.id}`)}
                        isActive={id === chat.id}
                        tooltip={chat.title || 'Untitled Chat'}
                        className="px-2"
                      >
                        <span>{chat.title || 'Untitled Chat'}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="px-1 py-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg" className="px-2">
                    {user.image ? (
                      <img 
                        src={user.image} 
                        alt={user.name || ''} 
                        className="size-7 rounded-full"
                      />
                    ) : (
                      <div className="flex aspect-square size-8 items-center justify-center rounded-full bg-slate-600">
                        <User className="size-4 text-white" />
                      </div>
                    )}
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                    <ChevronUp className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  side="top" 
                  className="w-[--radix-dropdown-menu-trigger-width]"
                >
                  <SettingsDialog>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Settings className="mr-2 size-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                  </SettingsDialog>
                  <DropdownMenuItem 
                    onClick={handleSignOut}
                    className="text-red-600 focus:text-red-600"
                  >
                    <LogOut className="mr-2 size-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="md:hidden" />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-0">
          {messages.length === 0 ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center px-4 pb-[20vh]">
                <h1 className="text-3xl font-semibold mb-8 text-gray-700 dark:text-gray-300">Where should we begin?</h1>
                <div className="w-full max-w-3xl">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ask anything"
                      className="flex h-14 w-full rounded-full border border-input bg-background px-6 py-3 text-sm shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 pr-12"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          const content = e.currentTarget.value
                          e.currentTarget.value = ''
                          sendMessage(content)
                        }
                      }}
                    />
                    <button className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="mx-auto max-w-3xl space-y-6">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex flex-col space-y-2 ${message.role === 'user' ? 'items-end' : 'items-start max-w-[80%]'}`}>
                        <div className={`rounded-2xl px-4 py-2 ${
                          message.role === 'user' 
                            ? 'bg-[#f0f5f5] text-gray-900' 
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                        }`}>
                          {message.isLoading ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <p className="text-base">{message.content}</p>
                            </div>
                          ) : (
                            <p className="text-base whitespace-pre-wrap">{message.content}</p>
                          )}
                        </div>
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-4">
                            {(() => {
                              const primarySource = message.sources[0];
                              const sourceType = primarySource.sourceType;
                              
                              if (sourceType === 'email') {
                                return (
                                  <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Mail className="h-4 w-4 text-red-600" />
                                          <span className="text-sm font-medium text-gray-700">Email</span>
                                          <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                                            {Math.round((primarySource.similarity || 0) * 100)}% match
                                          </span>
                                        </div>
                                        {primarySource.title && (
                                          <h4 className="text-sm font-semibold text-gray-900 mb-2">{primarySource.title}</h4>
                                        )}
                                        {primarySource.metadata?.from && (
                                          <p className="text-xs text-gray-600 mb-1">From: {primarySource.metadata.from}</p>
                                        )}
                                        {primarySource.metadata?.date && (
                                          <p className="text-xs text-gray-600 mb-2">
                                            Date: {new Date(primarySource.metadata.date).toLocaleDateString()}
                                          </p>
                                        )}
                                        <p className="text-sm text-gray-700 line-clamp-3">{primarySource.preview}</p>
                                      </div>
                                      {primarySource.gmailId && (
                                        <button
                                          onClick={() => {
                                            const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${primarySource.gmailId}`;
                                            window.open(gmailUrl, '_blank');
                                          }}
                                          className="ml-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded transition-colors"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          Open in Gmail
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              } else if (sourceType === 'calendar_event') {
                                const startDate = primarySource.metadata?.startDateTime ? new Date(primarySource.metadata.startDateTime) : null;
                                const endDate = primarySource.metadata?.endDateTime ? new Date(primarySource.metadata.endDateTime) : null;
                                const attendees = primarySource.metadata?.attendees || [];
                                
                                return (
                                  <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-3">
                                          <Calendar className="h-5 w-5 text-blue-600" />
                                          <span className="text-sm font-medium text-gray-700">Calendar Event</span>
                                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                                            {Math.round((primarySource.similarity || 0) * 100)}% match
                                          </span>
                                        </div>
                                        
                                        {primarySource.title && (
                                          <h4 className="text-lg font-semibold text-gray-900 mb-3">{primarySource.title}</h4>
                                        )}
                                        
                                        <div className="space-y-2 mb-3">
                                          {startDate && (
                                            <div className="flex items-center gap-2">
                                              <div className="text-xs font-medium text-gray-500 w-12">Start:</div>
                                              <div className="text-sm text-gray-900">
                                                {startDate.toLocaleDateString()} at {startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                              </div>
                                            </div>
                                          )}
                                          {endDate && (
                                            <div className="flex items-center gap-2">
                                              <div className="text-xs font-medium text-gray-500 w-12">End:</div>
                                              <div className="text-sm text-gray-900">
                                                {endDate.toLocaleDateString()} at {endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                              </div>
                                            </div>
                                          )}
                                          {primarySource.metadata?.location && (
                                            <div className="flex items-center gap-2">
                                              <div className="text-xs font-medium text-gray-500 w-12">Location:</div>
                                              <div className="text-sm text-gray-900">{primarySource.metadata.location}</div>
                                            </div>
                                          )}
                                        </div>
                                        
                                        {attendees.length > 0 && (
                                          <div className="mb-3">
                                            <div className="text-xs font-medium text-gray-500 mb-2">Attendees ({attendees.length}):</div>
                                            <div className="flex flex-wrap gap-2">
                                              {attendees.slice(0, 5).map((attendee: any, idx: number) => (
                                                <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1">
                                                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
                                                    {(attendee.email || attendee.displayName || 'U').charAt(0).toUpperCase()}
                                                  </div>
                                                  <span className="text-xs text-gray-700">
                                                    {attendee.displayName || attendee.email || 'Unknown'}
                                                  </span>
                                                </div>
                                              ))}
                                              {attendees.length > 5 && (
                                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                                  +{attendees.length - 5} more
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        
                                        {primarySource.preview && (
                                          <div className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                                            {primarySource.preview}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              } else if (sourceType === 'hubspot_contact') {
                                return (
                                  <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Users className="h-4 w-4 text-orange-600" />
                                          <span className="text-sm font-medium text-gray-700">HubSpot Contact</span>
                                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                                            {Math.round((primarySource.similarity || 0) * 100)}% match
                                          </span>
                                        </div>
                                        {primarySource.title && (
                                          <h4 className="text-sm font-semibold text-gray-900 mb-2">{primarySource.title}</h4>
                                        )}
                                        {primarySource.metadata?.email && (
                                          <p className="text-xs text-gray-600 mb-1">Email: {primarySource.metadata.email}</p>
                                        )}
                                        {primarySource.metadata?.company && (
                                          <p className="text-xs text-gray-600 mb-2">Company: {primarySource.metadata.company}</p>
                                        )}
                                        <p className="text-sm text-gray-700 line-clamp-3">{primarySource.preview}</p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              } else if (sourceType === 'hubspot_note') {
                                return (
                                  <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <FileText className="h-4 w-4 text-green-600" />
                                          <span className="text-sm font-medium text-gray-700">HubSpot Note</span>
                                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                            {Math.round((primarySource.similarity || 0) * 100)}% match
                                          </span>
                                        </div>
                                        {primarySource.metadata?.createdAt && (
                                          <p className="text-xs text-gray-600 mb-2">
                                            Created: {new Date(primarySource.metadata.createdAt).toLocaleDateString()}
                                          </p>
                                        )}
                                        <p className="text-sm text-gray-700 line-clamp-3">{primarySource.preview}</p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              
                              return null;
                            })()}
                          </div>
                        )}
                        {message.role === 'assistant' && (
                          <div className="flex items-center gap-1 px-2">
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                              <Paperclip className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                              <ThumbsUp className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                              <ThumbsDown className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                              <Share className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                            <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                              <MoreHorizontal className="h-3.5 w-3.5 text-gray-500" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t bg-background p-6">
                <div className="mx-auto max-w-3xl">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Send a message..."
                      className="flex h-14 w-full rounded-full border border-input bg-background px-6 py-3 text-sm shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 pr-12"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          const content = e.currentTarget.value
                          e.currentTarget.value = ''
                          sendMessage(content)
                        }
                      }}
                    />
                    <button className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default ChatPage