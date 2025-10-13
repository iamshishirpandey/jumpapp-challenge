import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { WebhookService } from '@/lib/services/webhook';

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

    if (!user || !user.googleRefreshToken) {
      return res.status(400).json({ error: 'Google account not connected' });
    }

    const { type, calendarId } = req.body;

    if (!type || !['gmail', 'calendar'].includes(type)) {
      return res.status(400).json({ error: 'Invalid webhook type. Must be "gmail" or "calendar"' });
    }

    const webhookService = new WebhookService(user.googleRefreshToken);

    let result;
    if (type === 'gmail') {
      result = await webhookService.setupGmailWebhook(user.id);
    } else if (type === 'calendar') {
      result = await webhookService.setupCalendarWebhook(user.id, calendarId);
    }

    return res.status(200).json({
      success: true,
      type,
      channelId: result?.channelId,
      resourceId: result?.resourceId,
      message: `${type} webhook set up successfully`
    });

  } catch (error) {
    console.error('Webhook setup error:', error);
    return res.status(500).json({ 
      error: 'Failed to set up webhook',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}