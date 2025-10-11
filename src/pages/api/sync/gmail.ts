import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { GmailService } from '@/lib/services/gmail';
import { EmbeddingService } from '@/lib/services/embeddings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
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

      const { query = 'newer_than:7d', maxResults = 50 } = req.body;

      const gmailService = new GmailService(user.googleRefreshToken);
      const emails = await gmailService.fetchEmails(user.id, query, maxResults);

      // Process emails for RAG
      const embeddingService = new EmbeddingService();
      const embeddings = await Promise.allSettled(
        emails.map(email => embeddingService.processEmailForRAG(user.id, email))
      );

      const successCount = embeddings.filter(r => r.status === 'fulfilled').length;

      return res.status(200).json({
        success: true,
        emailsCount: emails.length,
        embeddingsCreated: successCount,
        emails: emails.slice(0, 10), // Return first 10 emails as preview
      });
    } catch (error) {
      console.error('Gmail sync error:', error);
      return res.status(500).json({ 
        error: 'Failed to sync Gmail', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else if (req.method === 'GET') {
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

      const limit = parseInt(req.query.limit as string || '50');
      const offset = parseInt(req.query.offset as string || '0');

      const emails = await prisma.email.findMany({
        where: { userId: user.id },
        orderBy: { internalDate: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.email.count({
        where: { userId: user.id },
      });

      return res.status(200).json({
        emails,
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Get emails error:', error);
      return res.status(500).json({ 
        error: 'Failed to get emails', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}