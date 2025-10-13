import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { GmailService } from '@/lib/services/gmail';
import { EmbeddingService } from '@/lib/services/embeddings';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Handle Pub/Sub push message format
    let messageData;
    
    if (req.body.message) {
      // This is a Pub/Sub push message
      const pubsubMessage = req.body.message;
      const data = pubsubMessage.data ? Buffer.from(pubsubMessage.data, 'base64').toString() : '{}';
      
      try {
        messageData = JSON.parse(data);
      } catch (e) {
        messageData = { historyId: pubsubMessage.attributes?.historyId };
      }
      
    } else {
      // Legacy webhook format (keeping for compatibility)
      const channelId = req.headers['x-goog-channel-id'] as string;
      const resourceState = req.headers['x-goog-resource-state'] as string;
      
      if (resourceState !== 'sync') {
        return res.status(200).json({ status: 'ignored', reason: 'not a sync event' });
      }
      
      messageData = { emailAddress: 'me' };
    }

    // Find all active Gmail subscriptions (since Pub/Sub doesn't include user info)
    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        resourceType: 'gmail',
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: { user: true }
    });

    if (subscriptions.length === 0) {
      return res.status(200).json({ status: 'ignored', reason: 'no active subscriptions' });
    }

    let totalEmailsProcessed = 0;
    let totalEmbeddingsCreated = 0;
    let totalEmbeddingsFailed = 0;

    // Process emails for each subscription
    for (const subscription of subscriptions) {
      const user = subscription.user;
      
      if (!user || !user.googleRefreshToken) {
        continue;
      }

      try {

        // Fetch new emails
        const gmailService = new GmailService(user.googleRefreshToken);
        const embeddingService = new EmbeddingService();

        // Get the latest email ID from our database to only fetch newer emails
        const latestEmail = await prisma.email.findFirst({
          where: { userId: user.id },
          orderBy: { internalDate: 'desc' },
          select: { internalDate: true }
        });

        // Fetch emails from the last hour or since the latest email
        const timeQuery = latestEmail 
          ? `newer_than:${Math.floor((Date.now() - latestEmail.internalDate.getTime()) / (1000 * 60 * 60)) + 1}h`
          : 'newer_than:1h';

        const emails = await gmailService.fetchEmails(user.id, timeQuery, 50);
        totalEmailsProcessed += emails.length;

        // Process emails for RAG
        const embeddings = await Promise.allSettled(
          emails.map(async (email) => {
            try {
              await embeddingService.processEmailForRAG(user.id, email);
              return email;
            } catch (error) {
              console.error('Error processing email for RAG:', error);
              throw error;
            }
          })
        );

        const successCount = embeddings.filter(r => r.status === 'fulfilled').length;
        const failureCount = embeddings.filter(r => r.status === 'rejected').length;

        totalEmbeddingsCreated += successCount;
        totalEmbeddingsFailed += failureCount;

        // Update the last processed timestamp
        await prisma.webhookSubscription.update({
          where: { id: subscription.id },
          data: { lastProcessedAt: new Date() }
        });

      } catch (error) {
        // Continue processing other users if one fails
      }
    }

    return res.status(200).json({
      status: 'success',
      usersProcessed: subscriptions.length,
      emailsProcessed: totalEmailsProcessed,
      embeddingsCreated: totalEmbeddingsCreated,
      embeddingsFailed: totalEmbeddingsFailed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Gmail webhook error:', error);
    return res.status(500).json({ 
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}