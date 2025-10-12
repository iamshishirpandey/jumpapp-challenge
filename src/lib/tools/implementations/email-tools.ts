import { gmail_v1, google } from 'googleapis'
import { prisma } from '@/lib/prisma'

async function getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: {
        where: { provider: 'google' }
      }
    }
  })

  if (!user || !user.accounts.length) {
    throw new Error('No Google account found for user')
  }

  const googleAccount = user.accounts[0]
  if (!googleAccount.access_token) {
    throw new Error('No access token available')
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  
  oauth2Client.setCredentials({
    access_token: googleAccount.access_token,
    refresh_token: googleAccount.refresh_token
  })

  // Set up token refresh callback
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await prisma.account.update({
        where: { id: googleAccount.id },
        data: { 
          access_token: tokens.access_token,
          expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null
        }
      })
    }
  })

  return google.gmail({ version: 'v1', auth: oauth2Client })
}

export async function sendEmail(parameters: Record<string, any>, userId: string) {
  const { to, subject, body, cc, bcc } = parameters
  
  try {
    console.log(`Attempting to send email to ${to} for user ${userId}`)
    const gmail = await getGmailClient(userId)
    
    // Get user's email address
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    })
    
    if (!user?.email) {
      throw new Error('User email not found')
    }
    
    // Default values if not provided
    const emailSubject = subject || 'Message from your AI Assistant'
    const emailBody = body || 'This is a message sent via your AI assistant.'
    
    let emailContent = `From: ${user.email}\r\n`
    emailContent += `To: ${to}\r\n`
    if (cc) emailContent += `Cc: ${cc}\r\n`
    if (bcc) emailContent += `Bcc: ${bcc}\r\n`
    emailContent += `Subject: ${emailSubject}\r\n`
    emailContent += `Content-Type: text/html; charset=utf-8\r\n\r\n`
    emailContent += emailBody

    const encodedMessage = Buffer.from(emailContent).toString('base64url')

    console.log('Sending email via Gmail API...')
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    })

    console.log('Email sent successfully, message ID:', response.data.id)
    return {
      messageId: response.data.id,
      success: true,
      message: `Email sent successfully to ${to}`
    }
  } catch (error) {
    console.error('Email sending error:', error)
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function replyToEmail(parameters: Record<string, any>, userId: string) {
  const { threadId, body, replyAll = false } = parameters
  
  try {
    const gmail = await getGmailClient(userId)
    
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId
    })

    if (!thread.data.messages || thread.data.messages.length === 0) {
      throw new Error('Thread not found or empty')
    }

    const lastMessage = thread.data.messages[thread.data.messages.length - 1]
    const headers = lastMessage.payload?.headers || []
    
    const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
    
    const originalFrom = getHeader('from')
    const originalTo = getHeader('to')
    const originalCc = getHeader('cc')
    const originalSubject = getHeader('subject')

    let replyTo = originalFrom
    let replyCc = ''
    
    if (replyAll) {
      const allRecipients = [originalTo, originalCc].filter(Boolean).join(', ')
      replyCc = allRecipients
    }

    const replySubject = originalSubject.startsWith('Re: ') ? originalSubject : `Re: ${originalSubject}`

    let emailContent = `To: ${replyTo}\r\n`
    if (replyCc) emailContent += `Cc: ${replyCc}\r\n`
    emailContent += `Subject: ${replySubject}\r\n`
    emailContent += `In-Reply-To: ${lastMessage.id}\r\n`
    emailContent += `References: ${lastMessage.id}\r\n`
    emailContent += `Content-Type: text/html; charset=utf-8\r\n\r\n`
    emailContent += body

    const encodedMessage = Buffer.from(emailContent).toString('base64url')

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: threadId
      }
    })

    return {
      messageId: response.data.id,
      threadId: threadId,
      success: true,
      message: `Reply sent successfully`
    }
  } catch (error) {
    throw new Error(`Failed to reply to email: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function searchEmails(parameters: Record<string, any>, userId: string) {
  const { query, from, to, subject, after, before, limit = 10 } = parameters
  
  try {
    const { EmbeddingService } = await import('@/lib/services/embeddings')
    const embeddingService = new EmbeddingService()
    
    // Build enhanced query with filters
    let searchQuery = query || ''
    if (from) searchQuery += ` from ${from}`
    if (to) searchQuery += ` to ${to}`
    if (subject) searchQuery += ` subject ${subject}`
    if (after) searchQuery += ` after ${after}`
    if (before) searchQuery += ` before ${before}`
    
    // Use RAG search for emails specifically
    const results = await embeddingService.searchSimilarDocuments(
      userId,
      searchQuery,
      limit,
      0.3 // Lower threshold for broader search
    )

    if (!results || results.length === 0) {
      return { 
        emails: [], 
        totalCount: 0, 
        message: 'No relevant emails found. Try syncing your Gmail data first.' 
      }
    }

    // Filter for email documents and enrich with actual email data
    const emailDocs = (results as any[]).filter(doc => doc.sourceType === 'email')
    
    const emailDetails = await Promise.all(
      emailDocs.map(async (doc) => {
        try {
          const emailData = await prisma.email.findUnique({
            where: { id: doc.sourceId },
            select: {
              id: true,
              gmailId: true,
              threadId: true,
              from: true,
              to: true,
              subject: true,
              snippet: true,
              internalDate: true,
              isRead: true,
              isStarred: true
            }
          })

          if (emailData) {
            return {
              id: emailData.gmailId,
              threadId: emailData.threadId,
              from: emailData.from,
              to: emailData.to,
              subject: emailData.subject,
              date: emailData.internalDate?.toISOString(),
              snippet: emailData.snippet,
              similarity: doc.similarity,
              isRead: emailData.isRead,
              isStarred: emailData.isStarred
            }
          }
          return null
        } catch (emailError) {
          console.error('Error fetching email details:', emailError)
          return null
        }
      })
    )

    const validEmails = emailDetails.filter(email => email !== null)

    return {
      emails: validEmails,
      totalCount: validEmails.length,
      query: searchQuery,
      message: `Found ${validEmails.length} relevant emails`
    }
  } catch (error) {
    console.error('Email search error:', error)
    throw new Error(`Failed to search emails: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function getEmailThread(parameters: Record<string, any>, userId: string) {
  const { threadId } = parameters
  
  try {
    const gmail = await getGmailClient(userId)
    
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId
    })

    const messages = (thread.data.messages || []).map(message => {
      const headers = message.payload?.headers || []
      const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

      let body = ''
      if (message.payload?.body?.data) {
        body = Buffer.from(message.payload.body.data, 'base64url').toString()
      } else if (message.payload?.parts) {
        const textPart = message.payload.parts.find(part => part.mimeType === 'text/plain' || part.mimeType === 'text/html')
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64url').toString()
        }
      }

      return {
        id: message.id,
        from: getHeader('from'),
        to: getHeader('to'),
        subject: getHeader('subject'),
        date: getHeader('date'),
        body: body.substring(0, 1000),
        snippet: message.snippet || ''
      }
    })

    return {
      threadId,
      messages,
      messageCount: messages.length
    }
  } catch (error) {
    throw new Error(`Failed to get email thread: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}