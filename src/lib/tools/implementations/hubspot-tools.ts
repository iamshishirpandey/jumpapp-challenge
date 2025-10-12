import { prisma } from '@/lib/prisma'

async function getHubSpotClient(userId: string) {
  const integration = await prisma.integration.findFirst({
    where: {
      userId,
      type: 'HUBSPOT',
      isActive: true
    }
  })

  if (!integration?.accessToken) {
    throw new Error('HubSpot integration not found or access token missing')
  }

  return {
    accessToken: integration.accessToken,
    portalId: integration.portalId
  }
}

async function hubspotRequest(endpoint: string, options: RequestInit, accessToken: string) {
  const response = await fetch(`https://api.hubapi.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`HubSpot API error: ${response.status} - ${error}`)
  }

  return response.json()
}

export async function createHubSpotContact(parameters: Record<string, any>, userId: string) {
  const { email, firstName, lastName, company, phone, jobTitle, website } = parameters
  
  try {
    const { accessToken } = await getHubSpotClient(userId)
    
    const contactData = {
      properties: {
        email,
        firstname: firstName,
        lastname: lastName,
        company,
        phone,
        jobtitle: jobTitle,
        website
      }
    }

    const result = await hubspotRequest(
      '/crm/v3/objects/contacts',
      {
        method: 'POST',
        body: JSON.stringify(contactData)
      },
      accessToken
    )

    return {
      contactId: result.id,
      success: true,
      message: `Contact created successfully for ${email}`,
      properties: result.properties
    }
  } catch (error) {
    throw new Error(`Failed to create HubSpot contact: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function createHubSpotNote(parameters: Record<string, any>, userId: string) {
  const { contactId, noteText, noteType = 'NOTE' } = parameters
  
  try {
    const { accessToken } = await getHubSpotClient(userId)
    
    const noteData = {
      properties: {
        hs_note_body: noteText,
        hs_attachment_ids: '',
        hs_timestamp: Date.now().toString()
      },
      associations: [
        {
          to: {
            id: contactId
          },
          types: [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 202
            }
          ]
        }
      ]
    }

    const result = await hubspotRequest(
      '/crm/v3/objects/notes',
      {
        method: 'POST',
        body: JSON.stringify(noteData)
      },
      accessToken
    )

    return {
      noteId: result.id,
      contactId,
      success: true,
      message: `Note added successfully to contact ${contactId}`,
      noteText
    }
  } catch (error) {
    throw new Error(`Failed to create HubSpot note: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function searchHubSpotContacts(parameters: Record<string, any>, userId: string) {
  const { query, limit = 10 } = parameters
  
  try {
    const { accessToken } = await getHubSpotClient(userId)
    
    const searchData = {
      query,
      limit,
      properties: [
        'email',
        'firstname',
        'lastname',
        'company',
        'phone',
        'jobtitle',
        'website',
        'createdate',
        'lastmodifieddate'
      ]
    }

    const result = await hubspotRequest(
      '/crm/v3/objects/contacts/search',
      {
        method: 'POST',
        body: JSON.stringify(searchData)
      },
      accessToken
    )

    const contacts = result.results.map((contact: any) => ({
      id: contact.id,
      email: contact.properties.email,
      firstName: contact.properties.firstname,
      lastName: contact.properties.lastname,
      company: contact.properties.company,
      phone: contact.properties.phone,
      jobTitle: contact.properties.jobtitle,
      website: contact.properties.website,
      createdDate: contact.properties.createdate,
      lastModified: contact.properties.lastmodifieddate
    }))

    return {
      contacts,
      totalResults: result.total,
      query,
      resultsFound: contacts.length
    }
  } catch (error) {
    throw new Error(`Failed to search HubSpot contacts: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}