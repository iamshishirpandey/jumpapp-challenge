import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get document counts by type
      const [totalDocs, emailDocs, contactDocs, noteDocs, eventDocs] = await Promise.all([
        prisma.document.count({
          where: { userId: user.id }
        }),
        prisma.document.count({
          where: { 
            userId: user.id,
            sourceType: 'email'
          }
        }),
        prisma.document.count({
          where: { 
            userId: user.id,
            sourceType: 'hubspot_contact'
          }
        }),
        prisma.document.count({
          where: { 
            userId: user.id,
            sourceType: 'hubspot_note'
          }
        }),
        prisma.document.count({
          where: { 
            userId: user.id,
            sourceType: 'calendar_event'
          }
        }),
      ]);

      // Get sample documents
      const sampleDocs = await prisma.document.findMany({
        where: { userId: user.id },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          sourceType: true,
          sourceId: true,
          title: true,
          createdAt: true,
          metadata: true
        }
      });

      // Check if embeddings exist
      const docsWithEmbeddings = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM "Document" 
        WHERE "userId" = ${user.id} 
        AND embedding IS NOT NULL
      `;

      return res.status(200).json({
        totalDocuments: totalDocs,
        documentsByType: {
          email: emailDocs,
          hubspot_contact: contactDocs,
          hubspot_note: noteDocs,
          calendar_event: eventDocs
        },
        documentsWithEmbeddings: docsWithEmbeddings,
        sampleDocuments: sampleDocs,
        message: 'PGVector data debug info'
      });
    } catch (error) {
      console.error('Debug pgvector error:', error);
      return res.status(500).json({ 
        error: 'Failed to get debug info', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}