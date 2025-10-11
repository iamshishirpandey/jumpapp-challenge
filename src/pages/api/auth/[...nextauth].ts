import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { NextAuthOptions } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GmailService } from '@/lib/services/gmail'
import { CalendarService } from '@/lib/services/calendar'
import { EmbeddingService } from '@/lib/services/embeddings'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.modify',
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
    async signIn({ user, account, profile }) {
      try {
        // Ensure user exists in database and save refresh tokens
        if (user.email) {
          const updateData: any = {
            name: user.name || null,
            image: user.image || null,
          };
          
          // Save Google refresh token if available
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
          
          if (account?.provider === 'google' && account.refresh_token) {
            try {
              const embeddingService = new EmbeddingService()
              
              try {
                const gmailService = new GmailService(account.refresh_token)
                const emails = await gmailService.fetchEmails(updatedUser.id, 'newer_than:7d', 50)
                
                await Promise.allSettled(
                  emails.map(email => embeddingService.processEmailForRAG(updatedUser.id, email))
                )
              } catch (gmailError) {}
              
              try {
                const calendarService = new CalendarService(account.refresh_token)
                const events = await calendarService.fetchEvents(updatedUser.id)
                
                await Promise.allSettled(
                  events.map(event => embeddingService.processEventForRAG(updatedUser.id, event))
                )
              } catch (calendarError) {}
            } catch (syncError) {}
          }
        }
        return true
      } catch (error) {
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