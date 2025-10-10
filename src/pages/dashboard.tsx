import React, { useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { MessageCircle, Plus, User, Send, SquarePen, LogOut, ChevronUp } from 'lucide-react'
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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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

const Dashboard = () => {
  const { data: sessionData, status } = useSession()
  const router = useRouter()
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
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
                  <SidebarMenuButton onClick={handleNewChat} tooltip="New Chat" className="font-medium px-2 h-10">
                    <SquarePen className="h-5 w-5 shrink-0" />
                    <span className="text-sm">New chat</span>
                  </SidebarMenuButton>
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
            {/* Trigger moved to sidebar header */}
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {selectedChat ? (
            <div className="min-h-[100vh] flex-1 rounded-xl  md:min-h-min p-8">
              <div className="mx-auto max-w-3xl">
                <div className="text-center mb-8">
                  <h2 className="text-xl font-semibold tracking-tight mb-2">Chat Interface</h2>
                  <p className="text-sm text-muted-foreground">Start a conversation with AI</p>
                </div>
                
                <div className="bg-background border rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-600">
                      <span className="text-xs font-medium text-white">AI</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">Hello! How can I help you today?</p>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Send a message..."
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pr-10"
                  />
                  <button className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-[100vh] flex-1 rounded-xl md:min-h-min flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h2 className="text-xl font-semibold tracking-tight mb-2">Welcome to Jump</h2>
                <p className="text-sm text-muted-foreground mb-6">Select a chat from the sidebar or start a new conversation</p>
                <Button onClick={handleNewChat} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Start new chat
                </Button>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default Dashboard