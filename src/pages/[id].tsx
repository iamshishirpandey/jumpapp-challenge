import React, { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { User, Send, SquarePen, LogOut, ChevronUp, X, Settings, Loader2, ExternalLink, Mail, Calendar, Users, FileText, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useHubSpot } from '@/hooks/useHubSpot'
import Head from 'next/head'
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
import { SyncChips } from '@/components/SyncChips'

const SidebarHeaderContent = () => {
  const { state, toggleSidebar } = useSidebar()
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
        <button 
          onClick={toggleSidebar}
          className="md:hidden ml-auto p-1 hover:bg-gray-100 rounded"
        >
          <X className="h-5 w-5 text-gray-600" />
        </button>
        {!isCollapsed && <SidebarTrigger className="ml-auto hidden md:block" />}
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
  emailCards?: EmailCard[]
  toolsUsed?: any[]
}

interface EmailCard {
  type: 'email_sent'
  messageId: string
  to: string
  subject: string
  body: string
  timestamp: string
}

interface Chat {
  id: string
  title: string
  createdAt?: string
  updatedAt?: string
  messages?: Message[]
}

const MobileSidebarTrigger = () => {
  const { toggleSidebar } = useSidebar()
  
  return (
    <button 
      className="md:hidden -ml-4 mr-4 p-2"
      onClick={toggleSidebar}
    >
      <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="text-gray-600">
        <path d="M11.6663 12.6686L11.801 12.6823C12.1038 12.7445 12.3313 13.0125 12.3313 13.3337C12.3311 13.6547 12.1038 13.9229 11.801 13.985L11.6663 13.9987H3.33325C2.96609 13.9987 2.66839 13.7008 2.66821 13.3337C2.66821 12.9664 2.96598 12.6686 3.33325 12.6686H11.6663ZM16.6663 6.00163L16.801 6.0153C17.1038 6.07747 17.3313 6.34546 17.3313 6.66667C17.3313 6.98788 17.1038 7.25586 16.801 7.31803L16.6663 7.33171H3.33325C2.96598 7.33171 2.66821 7.03394 2.66821 6.66667C2.66821 6.2994 2.96598 6.00163 3.33325 6.00163H16.6663Z"></path>
      </svg>
    </button>
  )
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
  const [mobileTab, setMobileTab] = useState('chat')
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [chatCache, setChatCache] = useState<{[key: string]: {chat: Chat, messages: Message[]}}>({})
  const [lastLoadedId, setLastLoadedId] = useState<string | null>(null)

  useEffect(() => {
    if (user && chats.length === 0) {
      loadChats()
    }
  }, [user, chats.length])

  useEffect(() => {
    if (skipLoadMessages) {
      setSkipLoadMessages(false)
      return
    }
    
    if (id && id !== 'new' && !isCreatingChat) {
      const chatId = id as string
      
      if (chatCache[chatId] && currentChat?.id !== chatId) {
        const cached = chatCache[chatId]
        setCurrentChat(cached.chat)
        setMessages(cached.messages)
        setLastLoadedId(chatId)
      } 
      else if (!chatCache[chatId] && chatId !== lastLoadedId && !isLoadingMessages) {
        loadChatMessages(chatId)
      }
    } 
    else if (!id && !isCreatingChat && !isLoadingMessages && messages.some(m => !m.isLoading)) {
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

  const loadChats = async (forceRefresh = false) => {
    if (chats.length > 0 && !forceRefresh) return
    
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
      setIsLoadingMessages(true)
      const response = await fetch(`/api/chats/${chatId}`)
      const data = await response.json()
      
      if (response.ok) {
        const chat = data
        const formattedMessages = (data.messages || []).map((msg: any) => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          createdAt: new Date(msg.createdAt),
          sources: msg.metadata?.sources || [],
          emailCards: msg.metadata?.emailCards || [],
          toolsUsed: msg.metadata?.toolsUsed || []
        }))
        
        setChatCache(prev => ({
          ...prev,
          [chatId]: { chat, messages: formattedMessages }
        }))
        
        setCurrentChat(chat)
        setMessages(formattedMessages)
      }
    } catch (error) {
      console.error('Error loading chat messages:', error)
    } finally {
      setIsLoadingMessages(false)
    }
  }

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' })
  }

  const handleNewChat = () => {
    setCurrentChat(null)
    setMessages([])
    setIsLoadingMessages(false)
    router.push('/')
  }

  const sendMessage = async (content: string) => {
    if (!content.trim()) return
    
    console.log('SendMessage called with:', { content, id, currentChat: currentChat?.id })

    let chatId = id as string
    let newChatCreated = false
    
    if (currentChat) {
      chatId = currentChat.id
    } else if (!chatId || chatId === 'new') {
      setIsCreatingChat(true)
      newChatCreated = true
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
          setLastLoadedId(newChat.id)
          // Update URL immediately but tell useEffect to not reload
          window.history.replaceState(null, '', `/${newChat.id}`)
        } else {
          setIsCreatingChat(false)
          return
        }
      } catch (error) {
        console.error('Error creating chat:', error)
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
    
    if (chatId && chatId !== 'new') {
      const chatToCache = currentChat || { id: chatId, title: content.slice(0, 50) }
      setChatCache(prevCache => ({
        ...prevCache,
        [chatId]: {
          chat: chatToCache,
          messages: [...(prevCache[chatId]?.messages || []), userMessage, loadingMessage]
        }
      }))
    }

    try {
      // Determine if this requires tool calling (sending emails, creating events, etc.)
      const toolActionPatterns = [
        /\b(send|email|mail)\b.*\b(to|@)\b/i, // Send email patterns
        /\b(reply|respond)\b.*\b(email|message)\b/i, // Reply patterns
        /\b(create|schedule|make|add)\b.*\b(meeting|event|appointment|calendar)\b/i, // Calendar patterns
        /\b(create|add|new)\b.*\b(contact|person)\b/i, // Contact patterns
        /\b(create|add|make)\b.*\b(task|todo|reminder)\b/i, // Task patterns
        /\b(write|compose|draft)\b.*\b(email|message)\b/i, // Email composition
        /\b(which|what|where|when|who)\b.*\b(email|mail|message)\b/i, // Email search questions
        /\b(find|search|show|get)\b.*\b(email|mail|message)\b/i, // Email search commands
        /\b(email|mail)\b.*\b(mentioned|about|from|to|contains)\b/i, // Email content questions
      ]
      
      const isToolAction = toolActionPatterns.some(pattern => pattern.test(content.toLowerCase()))
      
      const apiEndpoint = isToolAction ? '/api/chat' : '/api/search'
      const conversationHistory = messages.filter(m => !m.isLoading && m.content.trim()).map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }]
      }))

      const requestBody = isToolAction ? {
        message: content,
        chatId: chatId,
        conversationHistory: conversationHistory
      } : {
        query: content,
        chatId: chatId,
        limit: 10,
        threshold: 0.3
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const aiMessage: Message = {
        id: loadingMessage.id,
        content: data.response || (data.resultsCount > 0 ? `Found ${data.resultsCount} relevant results for your query.` : 'No results found.'),
        role: 'assistant',
        createdAt: new Date(),
        sources: isToolAction ? (data.sources || []) : (data.results || []), // Chat API uses sources, Search API uses results
        emailCards: data.emailCards || [],
        toolsUsed: data.toolsUsed || []
      }

      setMessages(prev => {
        const newMessages = prev.map(msg => 
          msg.id === loadingMessage.id ? aiMessage : msg
        )
        
        if (chatId && chatId !== 'new') {
          const chatToCache = currentChat || { id: chatId, title: content.slice(0, 50) }
          setChatCache(prevCache => ({
            ...prevCache,
            [chatId]: {
              chat: chatToCache,
              messages: newMessages
            }
          }))
        }
        
        return newMessages
      })

      if (newChatCreated) {
        setIsCreatingChat(false)
      }

    } catch (error) {
      
      const errorMessage: Message = {
        id: loadingMessage.id,
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        role: 'assistant',
        createdAt: new Date()
      }

      setMessages(prev => {
        const newMessages = prev.map(msg => 
          msg.id === loadingMessage.id ? errorMessage : msg
        )
        
        if (chatId && chatId !== 'new') {
          const chatToCache = currentChat || { id: chatId, title: content.slice(0, 50) }
          setChatCache(prevCache => ({
            ...prevCache,
            [chatId]: {
              chat: chatToCache,
              messages: newMessages
            }
          }))
        }
        
        return newMessages
      })
      
      if (newChatCreated) {
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
    router.push('/login')
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Redirecting to login...</div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <style jsx>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.3s ease-out;
          }
          .chat-transition {
            transition: all 0.2s ease-in-out;
          }
          .smooth-hover:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          }
        `}</style>
      </Head>
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
                          onClick={async () => {
                            try {
                              await fetch('/api/hubspot/sync', { method: 'POST' })
                            } catch (error) {
                              console.error('Sync error:', error)
                            }
                          }}
                          className="text-blue-500 hover:text-blue-700 transition-colors mr-2"
                          title="Manual Sync"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>
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
                        onClick={() => {
                          if (id !== chat.id) {
                            router.push(`/${chat.id}`)
                          }
                        }}
                        isActive={id === chat.id}
                        tooltip={chat.title || 'Untitled Chat'}
                        className="px-2 chat-transition smooth-hover"
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
        <header className="flex h-16 shrink-0 items-center gap-2 border-b md:border-b-0 sticky top-0 bg-white z-10 md:static">
          <div className="flex items-center w-full px-4">
            <MobileSidebarTrigger />
            <div className="md:hidden flex items-center justify-between w-full">
              <div className="flex bg-white rounded-lg p-1">
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                    mobileTab === 'chat' ? 'bg-gray-100 text-black' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setMobileTab('history')}
                  className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors ${
                    mobileTab === 'history' ? 'bg-gray-100 text-black' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  History
                </button>
              </div>
              <button
                onClick={() => {
                  handleNewChat()
                  setMobileTab('chat')
                }}
                className="flex items-center gap-1 text-sm font-medium px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Plus className="h-3 w-3" />
                New thread
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-0">
          {mobileTab === 'history' ? (
            <div className="md:hidden flex-1 overflow-y-auto px-4 py-6">
              <div className="mx-auto max-w-3xl">
                <h2 className="text-lg font-semibold mb-4">Chat History</h2>
                {isLoadingChats ? (
                  <div className="text-sm text-muted-foreground">Loading chats...</div>
                ) : chats.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No chat history yet</div>
                ) : (
                  <div className="space-y-2">
                    {chats.map((chat) => (
                      <div
                        key={chat.id}
                        onClick={() => {
                          if (id !== chat.id) {
                            router.push(`/${chat.id}`)
                          }
                          setMobileTab('chat')
                        }}
                        className={`p-3 rounded-lg border cursor-pointer chat-transition smooth-hover ${
                          id === chat.id ? 'bg-gray-100 border-gray-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-sm font-medium">{chat.title || 'Untitled Chat'}</span>
                        {chat.createdAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(chat.createdAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center px-4 pb-[20vh]">
                <h1 className="text-[28px] font-normal mb-8" style={{ color: '#0d0d0d' }}>Where should we begin?</h1>
                <div className="w-full max-w-3xl">
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ask anything about your meetings..."
                        className="flex h-16 w-full rounded-lg border border-input bg-background px-6 py-4 text-base shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-14"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            e.preventDefault()
                            const content = e.currentTarget.value
                            e.currentTarget.value = ''
                            sendMessage(content)
                          }
                        }}
                      />
                      <button 
                        onClick={(e) => {
                          const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement
                          if (input && input.value.trim()) {
                            const content = input.value
                            input.value = ''
                            sendMessage(content)
                          }
                        }}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Send className="h-5 w-5" />
                      </button>
                    </div>
                    <SyncChips />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="mx-auto max-w-3xl space-y-6">
                  {messages.length === 0 && !isLoadingMessages ? (
                    <div className="text-center py-12">
                      <div className="mb-8">
                        <div className="size-20 mx-auto mb-4 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                          <span className="text-2xl font-bold text-gray-600">J</span>
                        </div>
                        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Welcome to JumpApp</h1>
                        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                          Your AI assistant that helps you search through your emails, calendar, and contacts. Ask me anything!
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => (
                    <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                      <div className={`flex flex-col space-y-2 ${message.role === 'user' ? 'items-end' : 'items-start max-w-[80%]'}`}>
                        <div className={`rounded-lg py-2 ${
                          message.role === 'user' 
                            ? 'bg-[#f0f5f5] text-gray-900 px-4' 
                            : 'text-gray-900 dark:text-gray-100 pl-0 pr-4'
                        }`}>
                          {message.isLoading ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <p className="text-base chat-message">{message.content}</p>
                            </div>
                          ) : (
                            <p className="text-base whitespace-pre-wrap chat-message">{message.content}</p>
                          )}
                        </div>
                        
                        {/* Email Cards */}
                        {message.emailCards && message.emailCards.length > 0 && (
                          <div className="mt-4 space-y-3">
                            {message.emailCards.map((emailCard, index) => (
                              <div key={index} className="border border-green-200 rounded-lg p-4 bg-green-50">
                                <div className="flex items-center gap-2 mb-2">
                                  <Mail className="h-4 w-4 text-green-600" />
                                  <span className="text-sm font-medium text-green-700">Email Sent</span>
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                    ✓ Delivered
                                  </span>
                                </div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-1">
                                  {emailCard.subject}
                                </h4>
                                <p className="text-xs text-gray-600 mb-2">
                                  <span className="font-medium">To:</span> {emailCard.to}
                                </p>
                                <p className="text-sm text-gray-700 line-clamp-3">
                                  {emailCard.body}
                                </p>
                                <div className="flex items-center gap-4 mt-2">
                                  <span className="text-xs text-gray-500">
                                    {new Date(emailCard.timestamp).toLocaleTimeString()}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    ID: {emailCard.messageId}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-4">
                            {(() => {
                              // Check if we have multiple calendar events
                              const calendarEvents = message.sources.filter(source => 
                                source.sourceType === 'calendar_event' &&
                                // Filter out generic availability blocks and low-relevance events
                                !source.title?.toLowerCase().includes('available') &&
                                !source.title?.toLowerCase().includes('busy') &&
                                !source.title?.toLowerCase().includes('out of office') &&
                                source.similarity >= 0.4 // Only show high-relevance events
                              );
                              
                              if (calendarEvents.length > 1) {
                                // Show up to 3 calendar cards, sorted by similarity
                                const eventsToShow = calendarEvents
                                  .sort((a, b) => b.similarity - a.similarity)
                                  .slice(0, 3);
                                return (
                                  <div className="space-y-4">
                                    {eventsToShow.map((source, index) => {
                                      const startDate = source.metadata?.startDateTime ? new Date(source.metadata.startDateTime) : null;
                                      const endDate = source.metadata?.endDateTime ? new Date(source.metadata.endDateTime) : null;
                                      const attendees = source.metadata?.attendees || [];
                                      
                                      return (
                                        <div key={index} className="min-w-80 w-full md:w-auto">
                                          {/* Date header */}
                                          {startDate && (
                                            <div className="text-left mb-2">
                                              <div className="text-lg text-gray-900">
                                                {startDate.getDate()} <span className="font-semibold">{startDate.toLocaleDateString('en-US', { weekday: 'long' })}</span>
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Time and title card */}
                                          <div className="border border-gray-200 rounded-xl p-4">
                                            {/* Time */}
                                            {startDate && endDate && (
                                              <div className="text-sm font-medium text-gray-600 mb-2">
                                                {startDate.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})} – {endDate.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}
                                              </div>
                                            )}
                                            
                                            {/* Meeting title */}
                                            {source.title && (
                                              <h4 className="text-base font-semibold text-gray-900 mb-3">{source.title}</h4>
                                            )}
                                            
                                            {/* Attendee avatars */}
                                            {attendees.length > 0 && (
                                              <div className="flex -space-x-2">
                                                {attendees.slice(0, 4).map((attendee: any, idx: number) => (
                                                  <div 
                                                    key={idx} 
                                                    className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center text-white text-sm font-medium border-2 border-white"
                                                    title={attendee.displayName || attendee.email || 'Unknown'}
                                                  >
                                                    {(attendee.displayName || attendee.email || 'U').charAt(0).toUpperCase()}
                                                  </div>
                                                ))}
                                                {attendees.length > 4 && (
                                                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium border-2 border-white">
                                                    +{attendees.length - 4}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {calendarEvents.length > 3 && (
                                      <div className="text-sm text-gray-500 mt-2">
                                        And {calendarEvents.length - 3} more meeting{calendarEvents.length - 3 !== 1 ? 's' : ''}...
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              
                              // Original single source display logic
                              const primarySource = message.sources[0];
                              const sourceType = primarySource.sourceType;
                              
                              if (sourceType === 'email') {
                                return (
                                  <div className="border border-gray-200 rounded-lg p-4 bg-white">
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
                                );
                              } else if (sourceType === 'calendar_event') {
                                const startDate = primarySource.metadata?.startDateTime ? new Date(primarySource.metadata.startDateTime) : null;
                                const endDate = primarySource.metadata?.endDateTime ? new Date(primarySource.metadata.endDateTime) : null;
                                const attendees = primarySource.metadata?.attendees || [];
                                
                                return (
                                  <div className="min-w-80 w-full md:w-auto">
                                    {/* Date header */}
                                    {startDate && (
                                      <div className="text-left mb-2">
                                        <div className="text-lg text-gray-900">
                                          {startDate.getDate()} <span className="font-semibold">{startDate.toLocaleDateString('en-US', { weekday: 'long' })}</span>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Time and title card */}
                                    <div className="border border-gray-200 rounded-xl p-4">
                                      {/* Time */}
                                      {startDate && endDate && (
                                        <div className="text-sm font-medium text-gray-600 mb-2">
                                          {startDate.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})} – {endDate.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}
                                        </div>
                                      )}
                                      
                                      {/* Meeting title */}
                                      {primarySource.title && (
                                        <h4 className="text-base font-semibold text-gray-900 mb-3">{primarySource.title}</h4>
                                      )}
                                      
                                      {/* Attendee avatars */}
                                      {attendees.length > 0 && (
                                        <div className="flex -space-x-2">
                                          {attendees.slice(0, 4).map((attendee: any, idx: number) => (
                                            <div 
                                              key={idx} 
                                              className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center text-white text-sm font-medium border-2 border-white"
                                              title={attendee.displayName || attendee.email || 'Unknown'}
                                            >
                                              {(attendee.displayName || attendee.email || 'U').charAt(0).toUpperCase()}
                                            </div>
                                          ))}
                                          {attendees.length > 4 && (
                                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-xs font-medium border-2 border-white">
                                              +{attendees.length - 4}
                                            </div>
                                          )}
                                        </div>
                                      )}
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
                      </div>
                    </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t bg-background p-6">
                <div className="mx-auto max-w-3xl">
                  <div className="space-y-4">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Send a message..."
                        className="flex h-16 w-full rounded-lg border border-input bg-background px-6 py-4 text-base shadow-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-14"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            e.preventDefault()
                            const content = e.currentTarget.value
                            e.currentTarget.value = ''
                            sendMessage(content)
                          }
                        }}
                      />
                      <button 
                        onClick={(e) => {
                          const input = e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement
                          if (input && input.value.trim()) {
                            const content = input.value
                            input.value = ''
                            sendMessage(content)
                          }
                        }}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Send className="h-5 w-5" />
                      </button>
                    </div>
                    <SyncChips />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
    </>
  )
}

export default ChatPage