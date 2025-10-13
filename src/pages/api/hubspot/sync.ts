import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { prisma } from '@/lib/prisma'
import { HubSpotService } from '@/lib/services/hubspot'
import { EmbeddingService } from '@/lib/services/embeddings'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  try {
    const session = await getServerSession(req, res, authOptions)
    
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!user.hubspotConnected || !user.hubspotRefreshToken) {
      return res.status(400).json({ error: 'HubSpot not connected' })
    }

    const hubspotService = new HubSpotService(user.hubspotRefreshToken)
    const embeddingService = new EmbeddingService()
    
    try {
      const accessToken = await hubspotService.refreshAccessToken(user.hubspotRefreshToken)
      hubspotService.setAccessToken(accessToken)
    } catch (tokenError) {
      console.error('Failed to refresh HubSpot access token:', tokenError)
      return res.status(400).json({ 
        error: 'Failed to refresh HubSpot access token. Please reconnect HubSpot.' 
      })
    }
    
    const contacts = await hubspotService.fetchContacts(user.id, 100)
    const notes = await hubspotService.fetchNotes(user.id, 100)
    
    const contactResults = await Promise.allSettled(
      contacts.map(contact => embeddingService.processContactForRAG(user.id, contact))
    )
    
    const noteResults = await Promise.allSettled(
      notes.map(note => embeddingService.processNoteForRAG(user.id, note))
    )
    
    const successfulContacts = contactResults.filter(r => r.status === 'fulfilled').length
    const successfulNotes = noteResults.filter(r => r.status === 'fulfilled').length
    const failedContacts = contactResults.filter(r => r.status === 'rejected').length
    const failedNotes = noteResults.filter(r => r.status === 'rejected').length

    return res.status(200).json({
      success: true,
      summary: {
        contactsFetched: contacts.length,
        notesFetched: notes.length,
        contactsProcessed: successfulContacts,
        notesProcessed: successfulNotes,
        contactsFailed: failedContacts,
        notesFailed: failedNotes
      }
    })
  } catch (error) {
    console.error('Manual HubSpot sync error:', error)
    return res.status(500).json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
}