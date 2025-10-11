import React, { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { User, Send, SquarePen, LogOut, ChevronUp, X, Paperclip, ThumbsUp, ThumbsDown, Share, MoreHorizontal, Settings, Loader2, ExternalLink } from 'lucide-react'
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
  sender: 'user' | 'ai'
  timestamp: Date
  sources?: any[]
  isLoading?: boolean
}

const Dashboard = () => {
  const { data: sessionData, status } = useSession()
  const router = useRouter()
  const hubspot = useHubSpot()
  const [selectedChat, setSelectedChat] = useState<string | null>('new')
  const [messages, setMessages] = useState<Message[]>([])
  const [chats, setChats] = useState([
    { id: '1', title: 'Sample History 1' },
    { id: '2', title: 'Sample History 2' },
    { id: '3', title: 'Sample History 3' },
    { id: '4', title: 'Sample History 4' },
    { id: '5', title: 'Sample History 5' },
    { id: '6', title: 'Sample History 6' },
  ])
  
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])


  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('hubspot') === 'connected') {
      router.replace('/dashboard', undefined, { shallow: true })
      hubspot.refetch()
    }
  }, [router, hubspot])

  const handleSignOut = () => {
    signOut({ callbackUrl: '/login' })
  }

  const handleNewChat = () => {
    const newChat = {
      id: Date.now().toString(),
      title: 'New conversation'
    }
    setChats([newChat, ...chats])
    setSelectedChat(newChat.id)
    setMessages([])
  }

  const sendMessage = async (content: string) => {
    if (!content.trim()) return

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      sender: 'user',
      timestamp: new Date()
    }
    
    // Add loading AI message
    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      content: 'Thinking...',
      sender: 'ai',
      timestamp: new Date(),
      isLoading: true
    }

    setMessages(prev => [...prev, userMessage, loadingMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      // Update loading message with actual response
      const aiMessage: Message = {
        id: loadingMessage.id,
        content: data.response,
        sender: 'ai',
        timestamp: new Date(),
        sources: data.sources || []
      }

      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? aiMessage : msg
      ))

    } catch (error) {
      console.error('Error sending message:', error)
      
      // Update loading message with error
      const errorMessage: Message = {
        id: loadingMessage.id,
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        sender: 'ai',
        timestamp: new Date()
      }

      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id ? errorMessage : msg
      ))
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated' || !sessionData?.session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Redirecting to login...</div>
      </div>
    )
  }

  const { session } = sessionData
  const { user } = session

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
                {chats.map((chat) => (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      onClick={() => setSelectedChat(chat.id)}
                      isActive={selectedChat === chat.id}
                      tooltip={chat.title}
                      className="px-2"
                    >
                      <span>{chat.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
          {selectedChat ? (
            messages.length === 0 ? (
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
                      <div key={message.id} className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {message.sender === 'ai' && (
                          <div className="flex-shrink-0">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-green-500 to-teal-600">
                              <span className="text-xs font-bold text-white">AI</span>
                            </div>
                          </div>
                        )}
                        <div className={`flex flex-col space-y-2 ${message.sender === 'user' ? 'items-end' : 'items-start max-w-[80%]'}`}>
                          <div className={`rounded-2xl px-4 py-2 ${
                            message.sender === 'user' 
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
                            <div className="text-xs space-y-1">
                              <p className="text-gray-500 font-medium">Sources:</p>
                              {message.sources.map((source, index) => (
                                <div key={index} className="flex items-center gap-1 text-gray-600 bg-gray-50 rounded px-2 py-1">
                                  <ExternalLink className="h-3 w-3" />
                                  <span className="capitalize">{source.sourceType.replace('_', ' ')}</span>
                                  {source.title && <span>: {source.title}</span>}
                                  <span className="ml-auto text-gray-400">
                                    {Math.round((source.similarity || 0) * 100)}% match
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {message.sender === 'ai' && (
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
                        {message.sender === 'user' && (
                          <div className="flex-shrink-0">
                            {sessionData?.session?.user?.image ? (
                              <img 
                                src={sessionData.session.user.image} 
                                alt={sessionData.session.user.name || ''} 
                                className="h-8 w-8 rounded-full"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-600">
                                <User className="h-4 w-4 text-white" />
                              </div>
                            )}
                          </div>
                        )}
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
            )
          ) : null}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Dashboard