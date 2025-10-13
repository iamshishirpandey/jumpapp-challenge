import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { HubSpotService } from '@/lib/services/hubspot'
import { EmbeddingService } from '@/lib/services/embeddings'

async function setupHubSpotWebhooks(accessToken: string, portalId: string) {
  const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/hubspot`
  
  const subscriptions = [
    {
      eventType: 'contact.creation',
      propertyName: null
    },
    {
      eventType: 'contact.deletion',
      propertyName: null
    },
    {
      eventType: 'contact.propertyChange',
      propertyName: 'email'
    },
    {
      eventType: 'contact.propertyChange', 
      propertyName: 'firstname'
    },
    {
      eventType: 'contact.propertyChange',
      propertyName: 'lastname'
    },
    {
      eventType: 'contact.propertyChange',
      propertyName: 'company'
    },
    {
      eventType: 'engagement.creation',
      propertyName: null
    },
    {
      eventType: 'engagement.deletion', 
      propertyName: null
    },
    {
      eventType: 'engagement.propertyChange',
      propertyName: 'hs_note_body'
    }
  ]

  try {
    for (const subscription of subscriptions) {
      const webhookData = {
        subscriptionDetails: {
          subscriptionType: subscription.eventType.split('.')[0], // 'contact' or 'engagement'
          eventType: subscription.eventType,
          propertyName: subscription.propertyName
        },
        webhookOptions: {
          targetUrl: webhookUrl
        }
      }

      const response = await fetch(`https://api.hubapi.com/webhooks/v3/${portalId}/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookData)
      })

      if (!response.ok) {
        console.error(`Failed to create webhook subscription for ${subscription.eventType}`)
      }
    }
  } catch (error) {
    console.error('Error setting up HubSpot webhooks:', error)
  }
}

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

    try {
      const hubspotService = new HubSpotService(tokenData.access_token)
      const embeddingService = new EmbeddingService()
      
      let contacts = []
      let notes = []
      
      try {
        contacts = await hubspotService.fetchContacts(updatedUser.id, 100)
      } catch (contactError) {
        console.error('Error fetching contacts:', contactError)
        throw new Error(`Failed to fetch contacts: ${contactError instanceof Error ? contactError.message : 'Unknown error'}`)
      }
      
      try {
        notes = await hubspotService.fetchNotes(updatedUser.id, 100)
      } catch (notesError) {
        console.error('Error fetching notes:', notesError)
      }
      
      const contactEmbeddings = await Promise.allSettled(
        contacts.map(contact => embeddingService.processContactForRAG(updatedUser.id, contact))
      )
      
      const noteEmbeddings = await Promise.allSettled(
        notes.map(note => embeddingService.processNoteForRAG(updatedUser.id, note))
      )
      
      await setupHubSpotWebhooks(tokenData.access_token, accountData.hub_id)
    } catch (syncError) {
      console.error('Error during automatic sync:', syncError)
    }

    res.redirect('/?hubspot=connected')
  } catch (error) {
    console.error('HubSpot OAuth error:', error)
    res.redirect('/?error=hubspot_connection_failed')
  }
}