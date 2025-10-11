import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { HubSpotService } from '@/lib/services/hubspot';
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

      if (!user || !user.hubspotRefreshToken) {
        return res.status(400).json({ error: 'HubSpot account not connected' });
      }

      const { syncContacts = true, syncNotes = true, limit = 100 } = req.body;

      const hubspotService = new HubSpotService(user.hubspotRefreshToken);
      
      // Refresh token if needed
      await hubspotService.refreshAccessToken(user.hubspotRefreshToken);

      let contacts: any[] = [];
      let notes: any[] = [];

      if (syncContacts) {
        contacts = await hubspotService.fetchContacts(user.id, limit);
      }

      if (syncNotes) {
        notes = await hubspotService.fetchNotes(user.id, limit);
      }

      // Process for RAG
      const embeddingService = new EmbeddingService();
      
      const contactEmbeddings = await Promise.allSettled(
        contacts.map(contact => embeddingService.processContactForRAG(user.id, contact))
      );
      
      const noteEmbeddings = await Promise.allSettled(
        notes.map(note => embeddingService.processNoteForRAG(user.id, note))
      );

      const contactEmbeddingsSuccess = contactEmbeddings.filter(r => r.status === 'fulfilled').length;
      const noteEmbeddingsSuccess = noteEmbeddings.filter(r => r.status === 'fulfilled').length;

      return res.status(200).json({
        success: true,
        contactsCount: contacts.length,
        notesCount: notes.length,
        contactEmbeddingsCreated: contactEmbeddingsSuccess,
        noteEmbeddingsCreated: noteEmbeddingsSuccess,
        contacts: contacts.slice(0, 5), // Return first 5 as preview
        notes: notes.slice(0, 5),
      });
    } catch (error) {
      console.error('HubSpot sync error:', error);
      return res.status(500).json({ 
        error: 'Failed to sync HubSpot', 
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

      const type = req.query.type as string || 'contacts';
      const limit = parseInt(req.query.limit as string || '50');
      const offset = parseInt(req.query.offset as string || '0');

      if (type === 'contacts') {
        const contacts = await prisma.hubSpotContact.findMany({
          where: { userId: user.id },
          orderBy: { hubspotUpdatedAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            notes: {
              take: 5,
              orderBy: { hubspotCreatedAt: 'desc' },
            },
          },
        });

        const total = await prisma.hubSpotContact.count({
          where: { userId: user.id },
        });

        return res.status(200).json({
          contacts,
          total,
          limit,
          offset,
        });
      } else if (type === 'notes') {
        const notes = await prisma.hubSpotNote.findMany({
          where: { userId: user.id },
          orderBy: { hubspotCreatedAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            contact: true,
          },
        });

        const total = await prisma.hubSpotNote.count({
          where: { userId: user.id },
        });

        return res.status(200).json({
          notes,
          total,
          limit,
          offset,
        });
      }

      return res.status(400).json({ error: 'Invalid type parameter' });
    } catch (error) {
      console.error('Get HubSpot data error:', error);
      return res.status(500).json({ 
        error: 'Failed to get HubSpot data', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}