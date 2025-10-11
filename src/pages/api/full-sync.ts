import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { GmailService } from '@/lib/services/gmail';
import { CalendarService } from '@/lib/services/calendar';
import { HubSpotService } from '@/lib/services/hubspot';
import { EmbeddingService } from '@/lib/services/embeddings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { resetFirst = false } = req.body;

    if (resetFirst) {
      await prisma.document.deleteMany({ where: { userId: user.id } });
      await prisma.message.deleteMany({ 
        where: { 
          chat: { userId: user.id } 
        } 
      });
      await prisma.chat.deleteMany({ where: { userId: user.id } });
    }

    const results = {
      gmail: { emails: 0, documents: 0, errors: 0 },
      calendar: { events: 0, documents: 0, errors: 0 },
      hubspot: { contacts: 0, notes: 0, documents: 0, errors: 0 },
      totalDocuments: 0
    };

    const embeddingService = new EmbeddingService();

    if (user.googleRefreshToken) {
      try {
        const gmailService = new GmailService(user.googleRefreshToken);
        const emails = await gmailService.fetchEmails(user.id, 'newer_than:7d', 30);
        results.gmail.emails = emails.length;
        
        for (const email of emails) {
          try {
            await embeddingService.processEmailForRAG(user.id, email);
            results.gmail.documents++;
          } catch (error) {
            results.gmail.errors++;
          }
        }
        const calendarService = new CalendarService(user.googleRefreshToken);
        const events = await calendarService.fetchEvents(user.id, 'primary', undefined, undefined, 30);
        results.calendar.events = events.length;
        
        for (const event of events) {
          try {
            await embeddingService.processEventForRAG(user.id, event);
            results.calendar.documents++;
          } catch (error) {
            results.calendar.errors++;
          }
        }
      } catch (error) {
      }
    }

    if (user.hubspotRefreshToken) {
      try {
        const hubspotService = new HubSpotService(user.hubspotRefreshToken);
        
        const contacts = await hubspotService.fetchContacts(user.id, 30);
        results.hubspot.contacts = contacts.length;
        
        for (const contact of contacts) {
          try {
            await embeddingService.processContactForRAG(user.id, contact);
            results.hubspot.documents++;
          } catch (error) {
            results.hubspot.errors++;
          }
        }
        
        const notes = await hubspotService.fetchNotes(user.id, 30);
        results.hubspot.notes = notes.length;
        
        for (const note of notes) {
          try {
            await embeddingService.processNoteForRAG(user.id, note);
            results.hubspot.documents++;
          } catch (error) {
            results.hubspot.errors++;
          }
        }
      } catch (error) {
      }
    }

    results.totalDocuments = await prisma.document.count({
      where: { userId: user.id }
    });

    const documentsWithEmbeddings = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "Document"
      WHERE "userId" = ${user.id}
        AND embedding IS NOT NULL
    `;


    return res.status(200).json({
      success: true,
      results,
      documentsWithEmbeddings: (documentsWithEmbeddings as any)[0]?.count || 0,
      message: `Sync completed. Created ${results.totalDocuments} documents.`
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to complete sync', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}