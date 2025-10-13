import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { WebhookService } from '@/lib/services/webhook';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
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

      // Get webhook subscriptions - we don't need Google token for this query
      const subscriptions = await prisma.webhookSubscription.findMany({
        where: {
          userId: user.id,
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.status(200).json({
        webhooks: subscriptions.map(sub => ({
          id: sub.id,
          channelId: sub.channelId,
          resourceType: sub.resourceType,
          resourceId: sub.resourceId,
          isActive: sub.isActive,
          expiresAt: sub.expiresAt,
          lastProcessedAt: sub.lastProcessedAt,
          createdAt: sub.createdAt,
          metadata: sub.metadata
        })),
        total: subscriptions.length
      });

    } catch (error) {
      console.error('Webhook status error:', error);
      return res.status(500).json({ 
        error: 'Failed to get webhook status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else if (req.method === 'DELETE') {
    try {
      const session = await getServerSession(req, res, authOptions);
      
      if (!session?.user?.email) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
      });

      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      const { channelId } = req.body;

      if (!channelId) {
        return res.status(400).json({ error: 'Channel ID is required' });
      }

      const subscription = await prisma.webhookSubscription.findUnique({
        where: { channelId },
      });

      if (!subscription) {
        return res.status(404).json({ error: 'Webhook subscription not found' });
      }

      if (subscription.userId !== user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this webhook' });
      }

      // Handle different webhook types
      if (subscription.resourceType === 'gmail' || subscription.resourceType === 'calendar') {
        if (!user.googleRefreshToken) {
          return res.status(400).json({ error: 'Google account not connected' });
        }
        
        const webhookService = new WebhookService(user.googleRefreshToken);
        
        if (subscription.resourceType === 'gmail') {
          await webhookService.stopGmailWebhook(channelId, subscription.resourceId || '');
        } else if (subscription.resourceType === 'calendar') {
          await webhookService.stopCalendarWebhook(channelId, subscription.resourceId || '');
        }
      } else if (subscription.resourceType === 'hubspot') {
        if (!user.hubspotConnected) {
          return res.status(400).json({ error: 'HubSpot account not connected' });
        }
        
        const webhookService = new WebhookService(''); // HubSpot doesn't need Google token
        await webhookService.stopHubSpotWebhooks(user.id, channelId);
      }

      return res.status(200).json({
        success: true,
        message: 'Webhook stopped successfully'
      });

    } catch (error) {
      console.error('Webhook deletion error:', error);
      return res.status(500).json({ 
        error: 'Failed to stop webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else {
    res.setHeader('Allow', ['GET', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}