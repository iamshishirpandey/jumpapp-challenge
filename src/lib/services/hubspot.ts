import { Client } from '@hubspot/api-client';
import { prisma } from '@/lib/prisma';

export class HubSpotService {
  private client: Client;

  constructor(refreshToken: string) {
    this.client = new Client({
      accessToken: refreshToken,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
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
      });

      const data = await response.json();
      
      if (data.access_token) {
        this.client.setAccessToken(data.access_token);
        return data.access_token;
      }
      
      throw new Error('Failed to refresh token');
    } catch (error) {
      console.error('Error refreshing HubSpot token:', error);
      throw error;
    }
  }

  async fetchContacts(userId: string, limit: number = 100) {
    try {
      const response = await this.client.crm.contacts.basicApi.getPage(
        limit,
        undefined,
        [
          'firstname',
          'lastname',
          'email',
          'phone',
          'company',
          'jobtitle',
          'lifecyclestage',
          'createdate',
          'lastmodifieddate',
        ],
        undefined,
        undefined,
        undefined
      );

      const contacts = [];
      
      for (const contact of response.results) {
        const savedContact = await this.saveContact(userId, contact);
        contacts.push(savedContact);
      }

      return contacts;
    } catch (error) {
      console.error('Error fetching contacts:', error);
      throw error;
    }
  }

  async saveContact(userId: string, contactData: any) {
    try {
      const contact = {
        hubspotId: contactData.id,
        email: contactData.properties.email || null,
        firstname: contactData.properties.firstname || null,
        lastname: contactData.properties.lastname || null,
        phone: contactData.properties.phone || null,
        company: contactData.properties.company || null,
        jobtitle: contactData.properties.jobtitle || null,
        lifecyclestage: contactData.properties.lifecyclestage || null,
        properties: contactData.properties,
        associations: contactData.associations || null,
        hubspotCreatedAt: new Date(contactData.properties.createdate || contactData.createdAt),
        hubspotUpdatedAt: new Date(contactData.properties.lastmodifieddate || contactData.updatedAt),
      };

      return await prisma.hubSpotContact.upsert({
        where: { hubspotId: contact.hubspotId },
        update: {
          ...contact,
          userId,
          updatedAt: new Date(),
        },
        create: {
          ...contact,
          userId,
        },
      });
    } catch (error) {
      console.error('Error saving contact:', error);
      throw error;
    }
  }

  async fetchNotes(userId: string, limit: number = 100) {
    try {
      const response = await this.client.crm.objects.notes.basicApi.getPage(
        limit,
        undefined,
        ['hs_note_body', 'hs_timestamp', 'hs_lastmodifieddate'],
        undefined,
        ['contacts'],
        undefined
      );

      const notes = [];
      
      for (const note of response.results) {
        const savedNote = await this.saveNote(userId, note);
        notes.push(savedNote);
      }

      return notes;
    } catch (error) {
      console.error('Error fetching notes:', error);
      throw error;
    }
  }

  async saveNote(userId: string, noteData: any) {
    try {
      let contactId = null;
      
      if (noteData.associations?.contacts?.results?.length > 0) {
        const hubspotContactId = noteData.associations.contacts.results[0].id;
        const contact = await prisma.hubSpotContact.findUnique({
          where: { hubspotId: hubspotContactId },
        });
        contactId = contact?.id || null;
      }

      const note = {
        hubspotId: noteData.id,
        noteBody: noteData.properties.hs_note_body || '',
        properties: noteData.properties,
        associations: noteData.associations || null,
        hubspotCreatedAt: new Date(noteData.properties.hs_timestamp || noteData.createdAt),
        hubspotUpdatedAt: new Date(noteData.properties.hs_lastmodifieddate || noteData.updatedAt),
        contactId,
      };

      return await prisma.hubSpotNote.upsert({
        where: { hubspotId: note.hubspotId },
        update: {
          ...note,
          userId,
          updatedAt: new Date(),
        },
        create: {
          ...note,
          userId,
        },
      });
    } catch (error) {
      console.error('Error saving note:', error);
      throw error;
    }
  }

  async createContact(properties: Record<string, any>) {
    try {
      const response = await this.client.crm.contacts.basicApi.create({
        properties,
        associations: [],
      });
      
      return response;
    } catch (error) {
      console.error('Error creating contact:', error);
      throw error;
    }
  }

  async updateContact(contactId: string, properties: Record<string, any>) {
    try {
      const response = await this.client.crm.contacts.basicApi.update(contactId, {
        properties,
      });
      
      return response;
    } catch (error) {
      console.error('Error updating contact:', error);
      throw error;
    }
  }

  async createNote(contactId: string, noteBody: string) {
    try {
      const response = await this.client.crm.objects.notes.basicApi.create({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: Date.now().toString(),
        },
        associations: contactId ? [
          {
            to: { id: contactId },
            types: [{ 
              associationTypeId: 202, 
              associationCategory: 'HUBSPOT_DEFINED' as any 
            }],
          },
        ] : [],
      } as any);
      
      return response;
    } catch (error) {
      console.error('Error creating note:', error);
      throw error;
    }
  }
}