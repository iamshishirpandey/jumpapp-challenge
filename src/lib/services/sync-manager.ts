import { prisma } from '@/lib/prisma';
import { GmailService } from './gmail';
import { CalendarService } from './calendar';
import { HubSpotService } from './hubspot';
import { EmbeddingService } from './embeddings';

interface SyncProgress {
  stage: 'fetching' | 'processing' | 'embedding' | 'complete' | 'error';
  service: 'gmail' | 'calendar' | 'hubspot';
  processed: number;
  total: number;
  message: string;
}

interface SyncResult {
  gmail: { emails: number; documents: number; errors: number };
  calendar: { events: number; documents: number; errors: number };
  hubspot: { contacts: number; notes: number; documents: number; errors: number };
  totalDocuments: number;
}

export class SyncManager {
  private embeddingService: EmbeddingService;
  private progressCallbacks: Set<(progress: SyncProgress) => void> = new Set();

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  onProgress(callback: (progress: SyncProgress) => void) {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  private notifyProgress(progress: SyncProgress) {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  async syncAll(userId: string, refreshToken: string, hubspotToken?: string): Promise<SyncResult> {
    const result: SyncResult = {
      gmail: { emails: 0, documents: 0, errors: 0 },
      calendar: { events: 0, documents: 0, errors: 0 },
      hubspot: { contacts: 0, notes: 0, documents: 0, errors: 0 },
      totalDocuments: 0
    };

    // Start all syncs simultaneously
    const syncPromises: Promise<void>[] = [];

    // Gmail sync
    if (refreshToken) {
      syncPromises.push(this.syncGmail(userId, refreshToken, result));
    }

    // Calendar sync
    if (refreshToken) {
      syncPromises.push(this.syncCalendar(userId, refreshToken, result));
    }

    // HubSpot sync
    if (hubspotToken) {
      syncPromises.push(this.syncHubSpot(userId, hubspotToken, result));
    }

    // Wait for all syncs to complete
    await Promise.allSettled(syncPromises);

    // Get final document count
    result.totalDocuments = await prisma.document.count({
      where: { userId }
    });

    return result;
  }

  private async syncGmail(userId: string, refreshToken: string, result: SyncResult): Promise<void> {
    try {
      this.notifyProgress({
        stage: 'fetching',
        service: 'gmail',
        processed: 0,
        total: 0,
        message: 'Fetching Gmail emails...'
      });

      const gmailService = new GmailService(refreshToken);
      const emails = await gmailService.fetchEmails(userId, 'newer_than:30d', 100);
      
      result.gmail.emails = emails.length;

      if (emails.length === 0) {
        this.notifyProgress({
          stage: 'complete',
          service: 'gmail',
          processed: 0,
          total: 0,
          message: 'No new emails to sync'
        });
        return;
      }

      this.notifyProgress({
        stage: 'processing',
        service: 'gmail',
        processed: 0,
        total: emails.length,
        message: `Processing ${emails.length} emails...`
      });

      // Process emails in batches of 5 for better performance
      const batchSize = 5;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (email, index) => {
          try {
            await this.embeddingService.processEmailForRAG(userId, email);
            result.gmail.documents++;
            
            this.notifyProgress({
              stage: 'embedding',
              service: 'gmail',
              processed: i + index + 1,
              total: emails.length,
              message: `Creating embeddings for email ${i + index + 1}/${emails.length}...`
            });
          } catch (error) {
            result.gmail.errors++;
            console.error(`Error processing email ${email.id}:`, error);
          }
        });

        await Promise.allSettled(batchPromises);
      }

      this.notifyProgress({
        stage: 'complete',
        service: 'gmail',
        processed: emails.length,
        total: emails.length,
        message: `Gmail sync complete: ${result.gmail.documents} emails processed`
      });

    } catch (error) {
      console.error('Gmail sync error:', error);
      this.notifyProgress({
        stage: 'error',
        service: 'gmail',
        processed: 0,
        total: 0,
        message: 'Gmail sync failed'
      });
    }
  }

  private async syncCalendar(userId: string, refreshToken: string, result: SyncResult): Promise<void> {
    try {
      this.notifyProgress({
        stage: 'fetching',
        service: 'calendar',
        processed: 0,
        total: 0,
        message: 'Fetching calendar events...'
      });

      const calendarService = new CalendarService(refreshToken);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      
      const threeMonthsAhead = new Date();
      threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

      const events = await calendarService.fetchEvents(
        userId, 
        'primary', 
        threeMonthsAgo, 
        threeMonthsAhead, 
        100
      );
      
      result.calendar.events = events.length;

      if (events.length === 0) {
        this.notifyProgress({
          stage: 'complete',
          service: 'calendar',
          processed: 0,
          total: 0,
          message: 'No new events to sync'
        });
        return;
      }

      this.notifyProgress({
        stage: 'processing',
        service: 'calendar',
        processed: 0,
        total: events.length,
        message: `Processing ${events.length} events...`
      });

      // Process events in batches of 5
      const batchSize = 5;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (event, index) => {
          try {
            await this.embeddingService.processEventForRAG(userId, event);
            result.calendar.documents++;
            
            this.notifyProgress({
              stage: 'embedding',
              service: 'calendar',
              processed: i + index + 1,
              total: events.length,
              message: `Creating embeddings for event ${i + index + 1}/${events.length}...`
            });
          } catch (error) {
            result.calendar.errors++;
            console.error(`Error processing event ${event.id}:`, error);
          }
        });

        await Promise.allSettled(batchPromises);
      }

      this.notifyProgress({
        stage: 'complete',
        service: 'calendar',
        processed: events.length,
        total: events.length,
        message: `Calendar sync complete: ${result.calendar.documents} events processed`
      });

    } catch (error) {
      console.error('Calendar sync error:', error);
      this.notifyProgress({
        stage: 'error',
        service: 'calendar',
        processed: 0,
        total: 0,
        message: 'Calendar sync failed'
      });
    }
  }

  private async syncHubSpot(userId: string, hubspotToken: string, result: SyncResult): Promise<void> {
    try {
      this.notifyProgress({
        stage: 'fetching',
        service: 'hubspot',
        processed: 0,
        total: 0,
        message: 'Fetching HubSpot data...'
      });

      const hubspotService = new HubSpotService(hubspotToken);
      
      // Fetch contacts and notes simultaneously
      const [contacts, notes] = await Promise.all([
        hubspotService.fetchContacts(userId, 50),
        hubspotService.fetchNotes(userId, 50)
      ]);

      result.hubspot.contacts = contacts.length;
      result.hubspot.notes = notes.length;

      const totalItems = contacts.length + notes.length;

      if (totalItems === 0) {
        this.notifyProgress({
          stage: 'complete',
          service: 'hubspot',
          processed: 0,
          total: 0,
          message: 'No new HubSpot data to sync'
        });
        return;
      }

      this.notifyProgress({
        stage: 'processing',
        service: 'hubspot',
        processed: 0,
        total: totalItems,
        message: `Processing ${totalItems} HubSpot items...`
      });

      let processed = 0;

      // Process contacts in batches
      const batchSize = 5;
      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (contact) => {
          try {
            await this.embeddingService.processContactForRAG(userId, contact);
            result.hubspot.documents++;
          } catch (error) {
            result.hubspot.errors++;
            console.error(`Error processing contact ${contact.id}:`, error);
          }
          
          processed++;
          this.notifyProgress({
            stage: 'embedding',
            service: 'hubspot',
            processed,
            total: totalItems,
            message: `Creating embeddings for HubSpot item ${processed}/${totalItems}...`
          });
        });

        await Promise.allSettled(batchPromises);
      }

      // Process notes in batches
      for (let i = 0; i < notes.length; i += batchSize) {
        const batch = notes.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (note) => {
          try {
            await this.embeddingService.processNoteForRAG(userId, note);
            result.hubspot.documents++;
          } catch (error) {
            result.hubspot.errors++;
            console.error(`Error processing note ${note.id}:`, error);
          }
          
          processed++;
          this.notifyProgress({
            stage: 'embedding',
            service: 'hubspot',
            processed,
            total: totalItems,
            message: `Creating embeddings for HubSpot item ${processed}/${totalItems}...`
          });
        });

        await Promise.allSettled(batchPromises);
      }

      this.notifyProgress({
        stage: 'complete',
        service: 'hubspot',
        processed: totalItems,
        total: totalItems,
        message: `HubSpot sync complete: ${result.hubspot.documents} items processed`
      });

    } catch (error) {
      console.error('HubSpot sync error:', error);
      this.notifyProgress({
        stage: 'error',
        service: 'hubspot',
        processed: 0,
        total: 0,
        message: 'HubSpot sync failed'
      });
    }
  }
}