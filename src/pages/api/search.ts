import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
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

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { query, limit = 10, threshold = 0.7 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const embeddingService = new EmbeddingService();
    const results: any = await embeddingService.searchSimilarDocuments(
      user.id,
      query,
      limit,
      threshold
    );

    // Enrich results with source data
    const enrichedResults = await Promise.all(
      (results as any[]).map(async (doc: any) => {
        let sourceData = null;
        
        switch (doc.sourceType) {
          case 'email':
            sourceData = await prisma.email.findUnique({
              where: { id: doc.sourceId },
              select: {
                subject: true,
                from: true,
                to: true,
                internalDate: true,
                snippet: true,
              },
            });
            break;
          case 'hubspot_contact':
            sourceData = await prisma.hubSpotContact.findUnique({
              where: { id: doc.sourceId },
              select: {
                firstname: true,
                lastname: true,
                email: true,
                company: true,
                jobtitle: true,
              },
            });
            break;
          case 'hubspot_note':
            sourceData = await prisma.hubSpotNote.findUnique({
              where: { id: doc.sourceId },
              select: {
                noteBody: true,
                hubspotCreatedAt: true,
                contact: {
                  select: {
                    firstname: true,
                    lastname: true,
                    email: true,
                  },
                },
              },
            });
            break;
          case 'calendar_event':
            sourceData = await prisma.calendarEvent.findUnique({
              where: { id: doc.sourceId },
              select: {
                summary: true,
                description: true,
                startDateTime: true,
                endDateTime: true,
                location: true,
                attendees: true,
              },
            });
            break;
        }

        return {
          ...doc,
          sourceData,
        };
      })
    );

    return res.status(200).json({
      success: true,
      results: enrichedResults,
      query,
      resultsCount: enrichedResults.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: 'Search failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}