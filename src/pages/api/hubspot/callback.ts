import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { HubSpotService } from '@/lib/services/hubspot'
import { EmbeddingService } from '@/lib/services/embeddings'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const { code, state } = req.query

  if (!code || !state) {
    return res.redirect('/?error=missing_code_or_state')
  }

  try {
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/hubspot/callback`,
        code: code as string,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token')
    }

    const tokenData = await tokenResponse.json()


    const accountResponse = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + tokenData.access_token)
    const accountData = await accountResponse.json()



    const userEmail = decodeURIComponent(state as string)
    
    const updatedUser = await prisma.user.update({
      where: { email: userEmail },
      data: {
        hubspotConnected: true,
        hubspotRefreshToken: tokenData.refresh_token,
        hubspotPortalId: accountData.hub_id?.toString(),
        hubspotConnectedAt: new Date(),
      },
    })

    // Automatically sync HubSpot data after connection
    try {
      console.log('Starting automatic HubSpot sync for user:', userEmail)
      
      const hubspotService = new HubSpotService(tokenData.refresh_token)
      const embeddingService = new EmbeddingService()
      
      // Fetch contacts and notes
      const contacts = await hubspotService.fetchContacts(updatedUser.id, 100)
      const notes = await hubspotService.fetchNotes(updatedUser.id, 100)
      
      console.log(`Fetched ${contacts.length} contacts and ${notes.length} notes`)
      
      // Process for RAG with embeddings
      const contactEmbeddings = await Promise.allSettled(
        contacts.map(contact => embeddingService.processContactForRAG(updatedUser.id, contact))
      )
      
      const noteEmbeddings = await Promise.allSettled(
        notes.map(note => embeddingService.processNoteForRAG(updatedUser.id, note))
      )
      
      const successfulContacts = contactEmbeddings.filter(r => r.status === 'fulfilled').length
      const successfulNotes = noteEmbeddings.filter(r => r.status === 'fulfilled').length
      
      console.log(`Successfully created embeddings for ${successfulContacts} contacts and ${successfulNotes} notes`)
    } catch (syncError) {
      console.error('Error during automatic sync:', syncError)
      // Don't fail the connection if sync fails - user can retry later
    }

    res.redirect('/?hubspot=connected')
  } catch (error) {
    console.error('HubSpot OAuth error:', error)
    res.redirect('/?error=hubspot_connection_failed')
  }
}