import { prisma } from '@/lib/prisma'
import { LLMService } from '@/lib/services/llm'
import { sendEmail } from './email-tools'

async function getHubSpotClient(userId: string) {
  console.log('🔧 Getting HubSpot client for userId:', userId)
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      hubspotConnected: true, 
      hubspotRefreshToken: true, 
      hubspotPortalId: true 
    }
  })

  console.log('🔧 User HubSpot status:', {
    found: !!user,
    hubspotConnected: user?.hubspotConnected,
    hasRefreshToken: !!user?.hubspotRefreshToken,
    refreshTokenLength: user?.hubspotRefreshToken?.length,
    portalId: user?.hubspotPortalId
  })

  if (!user?.hubspotConnected || !user.hubspotRefreshToken) {
    throw new Error('HubSpot integration not found or access token missing. Please connect your HubSpot account first using the Connect HubSpot button in Settings.')
  }

  // Get fresh access token using refresh token
  console.log('🔧 Refreshing HubSpot access token...')
  const accessToken = await refreshHubSpotToken(userId, user.hubspotRefreshToken)

  return {
    accessToken,
    portalId: user.hubspotPortalId
  }
}

async function refreshHubSpotToken(userId: string, refreshToken: string): Promise<string> {
  try {
    console.log('🔧 Refreshing HubSpot token for userId:', userId, 'refreshToken length:', refreshToken.length)
    
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    })

    console.log('🔧 HubSpot token refresh response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('🔧 HubSpot token refresh failed:', errorText)
      throw new Error(`Failed to refresh HubSpot token: ${response.status} - ${errorText}`)
    }

    const tokenData = await response.json()
    console.log('🔧 HubSpot token refresh successful, access token length:', tokenData.access_token?.length)

    // Update the user with new refresh token if provided
    if (tokenData.refresh_token) {
      console.log('🔧 Updating user with new refresh token')
      await prisma.user.update({
        where: { id: userId },
        data: {
          hubspotRefreshToken: tokenData.refresh_token,
          updatedAt: new Date()
        }
      })
    }

    return tokenData.access_token
  } catch (error) {
    console.error('🔧 Error refreshing HubSpot token:', error)
    throw error
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

export async function updateHubSpotContact(parameters: Record<string, any>, userId: string) {
  const { contactId, email, firstName, lastName, company, phone, jobTitle, website } = parameters
  
  try {
    console.log('🔧 Updating HubSpot contact:', contactId)
    
    const { accessToken } = await getHubSpotClient(userId)
    
    const contactData = {
      properties: {
        ...(email && { email }),
        ...(firstName && { firstname: firstName }),
        ...(lastName && { lastname: lastName }),
        ...(company && { company }),
        ...(phone && { phone }),
        ...(jobTitle && { jobtitle: jobTitle }),
        ...(website && { website })
      }
    }

    const result = await hubspotRequest(
      `/crm/v3/objects/contacts/${contactId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(contactData)
      },
      accessToken
    )

    return {
      contactId: result.id,
      success: true,
      message: `Contact updated successfully`,
      properties: result.properties
    }
  } catch (error) {
    console.error('🔧 HubSpot contact update error:', error)
    throw new Error(`Failed to update HubSpot contact: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function createHubSpotContact(parameters: Record<string, any>, userId: string) {
  const { email, firstName, lastName, company, phone, jobTitle, website } = parameters
  
  try {
    console.log('🔧 Creating HubSpot contact for userId:', userId)
    console.log('🔧 Contact parameters:', { email, firstName, lastName, company, phone, jobTitle, website })
    
    const { accessToken } = await getHubSpotClient(userId)
    console.log('🔧 Got HubSpot access token, length:', accessToken?.length)
    
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

    console.log('🔧 Sending HubSpot contact data:', contactData)
    
    try {
      const result = await hubspotRequest(
        '/crm/v3/objects/contacts',
        {
          method: 'POST',
          body: JSON.stringify(contactData)
        },
        accessToken
      )

      console.log('🔧 HubSpot contact created successfully:', result.id)
      
      // Send thank you email with LLM-generated message
      try {
        const llmService = new LLMService()
        const contactName = firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || 'there'
        
        // Get user information for signature
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { 
            email: true,
            name: true
          }
        })
        
        const userName = user?.name || 'Your AI Assistant'
        const userEmail = user?.email || ''
        
        const emailPrompt = `Generate a warm, professional thank you email for a new client. The contact's name is ${contactName}${company ? ` from ${company}` : ''}. 
        
        The email should:
        - Thank them for becoming a client
        - Be warm but professional 
        - Be concise (2-3 short paragraphs)
        - Express appreciation for their trust
        - Mention that we look forward to working together
        - End with just "Best regards," followed by the name "${userName}" and email "${userEmail}" on separate lines
        - Do NOT include placeholder text like [Your Company Name], [Your Title], etc.
        
        Return only the email body content, no subject line.`
        
        const emailBody = await llmService.generateSimpleText(emailPrompt)
        const subject = `Thank you for choosing us, ${contactName}!`
        
        console.log('🔧 Sending thank you email to:', email)
        await sendEmail({
          to: email,
          subject: subject,
          body: emailBody
        }, userId)
        
        console.log('🔧 Thank you email sent successfully')
        
        return {
          contactId: result.id,
          success: true,
          message: `Contact created successfully for ${email} and thank you email sent`,
          properties: result.properties
        }
      } catch (emailError) {
        console.error('🔧 Failed to send thank you email:', emailError)
        return {
          contactId: result.id,
          success: true,
          message: `Contact created successfully for ${email}, but failed to send thank you email: ${emailError instanceof Error ? emailError.message : 'Unknown error'}`,
          properties: result.properties
        }
      }
    } catch (hubspotError: any) {
      // Handle "Contact already exists" case
      if (hubspotError.message?.includes('409') && hubspotError.message?.includes('Contact already exists')) {
        const existingIdMatch = hubspotError.message.match(/Existing ID: (\d+)/)
        const existingId = existingIdMatch ? existingIdMatch[1] : 'unknown'
        
        console.log('🔧 Contact already exists with ID:', existingId)
        return {
          contactId: existingId,
          success: true,
          message: `Contact ${email} already exists in HubSpot (ID: ${existingId}). No thank you email sent for existing contact.`,
          alreadyExists: true
        }
      }
      // Re-throw other errors
      throw hubspotError
    }
  } catch (error) {
    console.error('🔧 HubSpot contact creation error:', error)
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