import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { HubSpotService } from '@/lib/services/hubspot';
import { GmailService } from '@/lib/services/gmail';
import { CalendarService } from '@/lib/services/calendar';
import { EmbeddingService } from '@/lib/services/embeddings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const { service } = req.body; // 'hubspot', 'gmail', 'calendar', or 'all'
      
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const results: any = {};
      const embeddingService = new EmbeddingService();

      // Force sync HubSpot
      if ((service === 'hubspot' || service === 'all') && user.hubspotRefreshToken) {
        try {
          console.log('Starting HubSpot force sync...');
          const hubspotService = new HubSpotService(user.hubspotRefreshToken);
          
          // Fetch contacts
          const contacts = await hubspotService.fetchContacts(user.id, 50);
          console.log(`Fetched ${contacts.length} contacts`);
          
          // Fetch notes
          const notes = await hubspotService.fetchNotes(user.id, 50);
          console.log(`Fetched ${notes.length} notes`);
          
          // Process contacts for embeddings
          const contactResults = [];
          for (const contact of contacts) {
            try {
              await embeddingService.processContactForRAG(user.id, contact);
              contactResults.push({ id: contact.id, success: true });
            } catch (err) {
              console.error(`Failed to process contact ${contact.id}:`, err);
              contactResults.push({ id: contact.id, success: false, error: err });
            }
          }
          
          // Process notes for embeddings
          const noteResults = [];
          for (const note of notes) {
            try {
              await embeddingService.processNoteForRAG(user.id, note);
              noteResults.push({ id: note.id, success: true });
            } catch (err) {
              console.error(`Failed to process note ${note.id}:`, err);
              noteResults.push({ id: note.id, success: false, error: err });
            }
          }
          
          results.hubspot = {
            contacts: {
              total: contacts.length,
              processed: contactResults.filter(r => r.success).length,
              failed: contactResults.filter(r => !r.success).length,
              details: contactResults
            },
            notes: {
              total: notes.length,
              processed: noteResults.filter(r => r.success).length,
              failed: noteResults.filter(r => !r.success).length,
              details: noteResults
            }
          };
        } catch (error) {
          console.error('HubSpot sync error:', error);
          results.hubspot = { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }

      // Force sync Gmail
      if ((service === 'gmail' || service === 'all') && user.googleRefreshToken) {
        try {
          console.log('Starting Gmail force sync...');
          const gmailService = new GmailService(user.googleRefreshToken);
          const emails = await gmailService.fetchEmails(user.id, 'newer_than:7d', 30);
          console.log(`Fetched ${emails.length} emails`);
          
          const emailResults = [];
          for (const email of emails) {
            try {
              await embeddingService.processEmailForRAG(user.id, email);
              emailResults.push({ id: email.id, success: true });
            } catch (err) {
              console.error(`Failed to process email ${email.id}:`, err);
              emailResults.push({ id: email.id, success: false, error: err });
            }
          }
          
          results.gmail = {
            total: emails.length,
            processed: emailResults.filter(r => r.success).length,
            failed: emailResults.filter(r => !r.success).length,
            details: emailResults
          };
        } catch (error) {
          console.error('Gmail sync error:', error);
          results.gmail = { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }

      // Force sync Calendar
      if ((service === 'calendar' || service === 'all') && user.googleRefreshToken) {
        try {
          console.log('Starting Calendar force sync...');
          const calendarService = new CalendarService(user.googleRefreshToken);
          const events = await calendarService.fetchEvents(user.id);
          console.log(`Fetched ${events.length} events`);
          
          const eventResults = [];
          for (const event of events) {
            try {
              await embeddingService.processEventForRAG(user.id, event);
              eventResults.push({ id: event.id, success: true });
            } catch (err) {
              console.error(`Failed to process event ${event.id}:`, err);
              eventResults.push({ id: event.id, success: false, error: err });
            }
          }
          
          results.calendar = {
            total: events.length,
            processed: eventResults.filter(r => r.success).length,
            failed: eventResults.filter(r => !r.success).length,
            details: eventResults
          };
        } catch (error) {
          console.error('Calendar sync error:', error);
          results.calendar = { error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }

      // Get final document counts
      const documentCounts = await prisma.document.groupBy({
        by: ['sourceType'],
        where: { userId: user.id },
        _count: true
      });

      return res.status(200).json({
        success: true,
        results,
        documentCounts,
        message: 'Force sync completed. Check server logs for details.'
      });
    } catch (error) {
      console.error('Force sync error:', error);
      return res.status(500).json({ 
        error: 'Failed to force sync', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}