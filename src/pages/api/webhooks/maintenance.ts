import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { WebhookService } from '@/lib/services/webhook';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Simple auth check - you might want to use an API key or other auth method
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.WEBHOOK_MAINTENANCE_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting webhook maintenance...');

    // Get all users with active Google connections
    const users = await prisma.user.findMany({
      where: {
        googleRefreshToken: { not: null },
        googleConnected: true
      },
      select: {
        id: true,
        googleRefreshToken: true
      }
    });

    let cleanedUp = 0;
    let refreshed = 0;
    let errors = 0;

    for (const user of users) {
      if (!user.googleRefreshToken) continue;

      try {
        const webhookService = new WebhookService(user.googleRefreshToken);
        
        // Clean up expired subscriptions
        await webhookService.cleanupExpiredSubscriptions();
        cleanedUp++;

        // Refresh expiring subscriptions
        await webhookService.refreshExpiringSubscriptions(user.id);
        refreshed++;

      } catch (error) {
        console.error(`Error maintaining webhooks for user ${user.id}:`, error);
        errors++;
      }
    }

    console.log(`Webhook maintenance completed: ${cleanedUp} cleaned up, ${refreshed} refreshed, ${errors} errors`);

    return res.status(200).json({
      success: true,
      summary: {
        usersProcessed: users.length,
        subscriptionsCleanedUp: cleanedUp,
        subscriptionsRefreshed: refreshed,
        errors
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook maintenance error:', error);
    return res.status(500).json({ 
      error: 'Failed to perform webhook maintenance',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}