import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '@/lib/services/calendar';
import { EmbeddingService } from '@/lib/services/embeddings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Verify the webhook request is from Google
    const channelId = req.headers['x-goog-channel-id'] as string;
    const resourceState = req.headers['x-goog-resource-state'] as string;
    const resourceId = req.headers['x-goog-resource-id'] as string;
    const messageNumber = req.headers['x-goog-message-number'] as string;
    
    console.log('Calendar webhook received:', {
      channelId,
      resourceState,
      resourceId,
      messageNumber,
      headers: req.headers
    });

    // Accept both 'sync' and 'exists' states for calendar events
    if (resourceState !== 'sync' && resourceState !== 'exists') {
      console.log('Ignoring calendar webhook, resource state:', resourceState);
      return res.status(200).json({ status: 'ignored', reason: `not a sync/exists event: ${resourceState}` });
    }

    const subscription = await prisma.webhookSubscription.findUnique({
      where: { channelId },
      include: { user: true }
    });

    if (!subscription || !subscription.user) {
      return res.status(200).json({ status: 'ignored', reason: 'unknown channel' });
    }

    if (subscription.expiresAt && subscription.expiresAt < new Date()) {
      return res.status(200).json({ status: 'ignored', reason: 'subscription expired' });
    }

    const user = subscription.user;
    
    if (!user.googleRefreshToken) {
      return res.status(200).json({ status: 'ignored', reason: 'no refresh token' });
    }

    // Fetch updated calendar events
    const calendarService = new CalendarService(user.googleRefreshToken);
    const embeddingService = new EmbeddingService();

    // Get events from the last 24 hours and next 7 days to capture updates
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get the calendar ID from subscription metadata, default to primary
    const calendarId = subscription.metadata?.calendarId || 'primary';

    const events = await calendarService.fetchEvents(
      user.id,
      calendarId,
      yesterday,
      nextWeek,
      100
    );

    // Process events for RAG
    const embeddings = await Promise.allSettled(
      events.map(async (event) => {
        try {
          await embeddingService.processEventForRAG(user.id, event);
          return event;
        } catch (error) {
          console.error('Error processing event for RAG:', error);
          throw error;
        }
      })
    );

    const successCount = embeddings.filter(r => r.status === 'fulfilled').length;
    const failureCount = embeddings.filter(r => r.status === 'rejected').length;

    // Update the last processed timestamp
    await prisma.webhookSubscription.update({
      where: { id: subscription.id },
      data: { lastProcessedAt: new Date() }
    });

    return res.status(200).json({
      status: 'success',
      eventsProcessed: events.length,
      embeddingsCreated: successCount,
      embeddingsFailed: failureCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Calendar webhook error:', error);
    return res.status(500).json({ 
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}