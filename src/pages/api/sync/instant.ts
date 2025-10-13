import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { GmailService } from '@/lib/services/gmail';
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

    if (!user || !user.googleRefreshToken) {
      return res.status(400).json({ error: 'Google account not connected' });
    }

    // Fetch very recent emails (last 10 minutes)
    const gmailService = new GmailService(user.googleRefreshToken);
    const embeddingService = new EmbeddingService();

    // Search for emails from the last 10 minutes
    const recentEmails = await gmailService.fetchEmails(user.id, 'newer_than:10m', 10);
    
    // Process each email for RAG
    const embeddings = await Promise.allSettled(
      recentEmails.map(async (email) => {
        try {
          await embeddingService.processEmailForRAG(user.id, email);
          return email;
        } catch (error) {
          throw error;
        }
      })
    );

    const successCount = embeddings.filter(r => r.status === 'fulfilled').length;

    return res.status(200).json({
      success: true,
      emailsProcessed: recentEmails.length,
      embeddingsCreated: successCount,
      emails: recentEmails.map(email => ({
        id: email.gmailId,
        subject: email.subject,
        from: email.from,
        to: email.to,
        date: email.internalDate
      }))
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to sync recent emails',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}