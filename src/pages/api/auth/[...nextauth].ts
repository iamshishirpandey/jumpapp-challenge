import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from '@/lib/prisma'
import { SyncManager } from '@/lib/services/sync-manager'
import { WebhookService } from '@/lib/services/webhook'

export const authOptions: NextAuthOptions = {
  // adapter: PrismaAdapter(prisma), // Temporarily disabled
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify',
          access_type: 'offline',
          prompt: 'consent',
        }
      },
      httpOptions: {
        timeout: 10000, // 10 seconds timeout instead of default 3.5 seconds
      },
    })
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      if (user) {
        token.id = user.id
        token.name = user.name
        token.email = user.email
        token.image = user.image
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      if (token.id) {
        session.user = {
          ...session.user,
          id: token.id as string
        }
      }
      return session
    },
    async signIn({ user, account }) {
      try {
        if (user.email) {
          const updateData: any = {
            name: user.name || null,
            image: user.image || null,
          };
          
          if (account?.provider === 'google' && account.refresh_token) {
            updateData.googleRefreshToken = account.refresh_token;
            updateData.googleConnected = true;
            updateData.googleConnectedAt = new Date();
          }
          
          const updatedUser = await prisma.user.upsert({
            where: { email: user.email },
            update: updateData,
            create: {
              email: user.email,
              name: user.name || null,
              image: user.image || null,
              googleRefreshToken: account?.refresh_token || null,
              googleConnected: account?.provider === 'google',
              googleConnectedAt: account?.provider === 'google' ? new Date() : null,
            },
          })

          if (account?.provider === 'google') {
            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider: 'google',
                  providerAccountId: account.providerAccountId
                }
              },
              update: {
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
              create: {
                userId: updatedUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              }
            })
          }
          
          if (account?.provider === 'google' && account.refresh_token) {
            setImmediate(async () => {
              try {
                const webhookService = new WebhookService(account.refresh_token!)
                
                // Check if this is first-time sync
                const existingDocCount = await prisma.document.count({
                  where: { userId: updatedUser.id }
                })
                
                if (existingDocCount === 0) {
                  // Start background sync for first-time users
                  const syncManager = new SyncManager()
                  syncManager.syncAll(updatedUser.id, account.refresh_token!, updatedUser.hubspotRefreshToken || undefined)
                    .catch(error => console.error('Background sync error:', error))
                }
                
                // Setup webhooks
                try {
                  const existingWebhooks = await webhookService.getUserWebhookSubscriptions(updatedUser.id)
                  const hasGmailWebhook = existingWebhooks.some(w => w.resourceType === 'gmail' && w.isActive)
                  const hasCalendarWebhook = existingWebhooks.some(w => w.resourceType === 'calendar' && w.isActive)
                  
                  if (!hasGmailWebhook) {
                    await webhookService.setupGmailWebhook(updatedUser.id)
                  }
                  
                  if (!hasCalendarWebhook && process.env.NODE_ENV === 'production') {
                    await webhookService.setupCalendarWebhook(updatedUser.id, 'primary')
                  }
                } catch (webhookError) {
                  console.error('Webhook setup error:', webhookError)
                }
              } catch (syncError) {
                console.error('Auth sync error:', syncError)
              }
            })
          }
        }
        return true
      } catch (error) {
        console.error('Sign in error:', error)
        return false
      }
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) {
        return `${baseUrl}${url}`
      } else if (url.startsWith(baseUrl)) {
        return url
      }
      return baseUrl
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  debug: process.env.NODE_ENV === 'development'
}

export default NextAuth(authOptions)