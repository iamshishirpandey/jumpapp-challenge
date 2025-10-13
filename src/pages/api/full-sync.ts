import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { SyncManager } from '@/lib/services/sync-manager';

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

    const syncManager = new SyncManager();
    
    // Use the new sync manager for simultaneous processing
    const results = await syncManager.syncAll(
      user.id, 
      user.googleRefreshToken || '', 
      user.hubspotRefreshToken || undefined
    );

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
      message: `Sync completed. Gmail: ${results.gmail.documents} emails, Calendar: ${results.calendar.documents} events, HubSpot: ${results.hubspot.documents} items processed with vector embeddings.`
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to complete sync', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}