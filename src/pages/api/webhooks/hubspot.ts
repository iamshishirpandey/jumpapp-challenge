import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { HubSpotService } from '@/lib/services/hubspot'
import { EmbeddingService } from '@/lib/services/embeddings'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  try {
    const webhookData = req.body
    console.log('HubSpot webhook received:', JSON.stringify(webhookData, null, 2))

    // HubSpot sends webhook data as an array of events
    const events = Array.isArray(webhookData) ? webhookData : [webhookData]
    
    // Process each event in the webhook
    for (const event of events) {
      try {
        await processHubSpotWebhookEvent(event)
      } catch (eventError) {
        console.error('Error processing HubSpot event:', eventError)
        // Continue processing other events even if one fails
      }
    }

    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('HubSpot webhook error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function processHubSpotWebhookEvent(event: any) {
  const { eventType, objectId, portalId, subscriptionType } = event
  
  console.log(`Processing HubSpot event: ${eventType} for ${subscriptionType} ${objectId} in portal ${portalId}`)

  // Find user by portal ID
  const user = await prisma.user.findFirst({
    where: {
      hubspotPortalId: portalId.toString(),
      hubspotConnected: true
    }
  })

  if (!user) {
    console.log(`No user found for HubSpot portal ${portalId}`)
    return
  }

  if (!user.hubspotRefreshToken) {
    console.log(`User ${user.email} has no HubSpot refresh token`)
    return
  }

  const hubspotService = new HubSpotService(user.hubspotRefreshToken)
  const embeddingService = new EmbeddingService()

  try {
    switch (subscriptionType) {
      case 'contact':
        await handleContactEvent(eventType, objectId, user.id, hubspotService, embeddingService)
        break
      
      case 'engagement':
        await handleEngagementEvent(eventType, objectId, user.id, hubspotService, embeddingService)
        break
      
      case 'company':
        await handleCompanyEvent(eventType, objectId, user.id, hubspotService, embeddingService)
        break
      
      default:
        console.log(`Unhandled subscription type: ${subscriptionType}`)
    }
  } catch (error) {
    console.error(`Error handling ${subscriptionType} event:`, error)
  }
}

async function handleContactEvent(
  eventType: string, 
  objectId: string, 
  userId: string, 
  hubspotService: HubSpotService, 
  embeddingService: EmbeddingService
) {
  switch (eventType) {
    case 'contact.creation':
    case 'contact.propertyChange':
      // Fetch updated contact data
      const contact = await hubspotService.fetchContactById(objectId)
      if (contact) {
        // Update database
        await hubspotService.saveContact(userId, contact)
        // Update embeddings in pgvector
        await embeddingService.processContactForRAG(userId, contact)
        console.log(`Updated contact ${objectId} in pgvector`)
      }
      break
    
    case 'contact.deletion':
      // Remove from database and embeddings
      await prisma.hubSpotContact.deleteMany({
        where: { hubspotId: objectId, userId }
      })
      await prisma.document.deleteMany({
        where: { sourceId: objectId, userId, sourceType: 'hubspot_contact' }
      })
      console.log(`Deleted contact ${objectId} from database and pgvector`)
      break
  }
}

async function handleEngagementEvent(
  eventType: string, 
  objectId: string, 
  userId: string, 
  hubspotService: HubSpotService, 
  embeddingService: EmbeddingService
) {
  switch (eventType) {
    case 'engagement.creation':
    case 'engagement.propertyChange':
      // Fetch engagement (note) data
      const engagement = await hubspotService.fetchEngagementById(objectId)
      if (engagement && engagement.type === 'NOTE') {
        // Convert to note format
        const note = {
          id: engagement.id,
          hubspotId: engagement.id,
          noteBody: engagement.bodyPreview || engagement.body,
          properties: engagement.properties,
          associations: engagement.associations,
          hubspotCreatedAt: new Date(engagement.createdAt),
          hubspotUpdatedAt: new Date(engagement.updatedAt)
        }
        
        // Update database
        await hubspotService.saveNote(userId, note)
        // Update embeddings in pgvector
        await embeddingService.processNoteForRAG(userId, note)
        console.log(`Updated note ${objectId} in pgvector`)
      }
      break
    
    case 'engagement.deletion':
      // Remove from database and embeddings
      await prisma.hubSpotNote.deleteMany({
        where: { hubspotId: objectId, userId }
      })
      await prisma.document.deleteMany({
        where: { sourceId: objectId, userId, sourceType: 'hubspot_note' }
      })
      console.log(`Deleted note ${objectId} from database and pgvector`)
      break
  }
}

async function handleCompanyEvent(
  eventType: string, 
  objectId: string, 
  userId: string, 
  hubspotService: HubSpotService, 
  embeddingService: EmbeddingService
) {
  // For future implementation if we want to track company changes
  console.log(`Company event ${eventType} for ${objectId} - not implemented yet`)
}