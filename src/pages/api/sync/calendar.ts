import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '@/lib/services/calendar';
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

      const { 
        calendarId = 'primary', 
        syncAll = false,
        timeMin,
        timeMax,
        maxResults = 250 
      } = req.body;

      const calendarService = new CalendarService(user.googleRefreshToken);
      
      let events = [];
      
      if (syncAll) {
        events = await calendarService.syncAllCalendars(user.id);
      } else {
        events = await calendarService.fetchEvents(
          user.id,
          calendarId,
          timeMin ? new Date(timeMin) : undefined,
          timeMax ? new Date(timeMax) : undefined,
          maxResults
        );
      }

      // Process events for RAG
      const embeddingService = new EmbeddingService();
      const embeddings = await Promise.allSettled(
        events.map(event => embeddingService.processEventForRAG(user.id, event))
      );

      const successCount = embeddings.filter(r => r.status === 'fulfilled').length;

      return res.status(200).json({
        success: true,
        eventsCount: events.length,
        embeddingsCreated: successCount,
        events: events.slice(0, 10), // Return first 10 events as preview
      });
    } catch (error) {
      console.error('Calendar sync error:', error);
      return res.status(500).json({ 
        error: 'Failed to sync calendar', 
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
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      const whereClause: any = { userId: user.id };
      
      if (startDate || endDate) {
        whereClause.startDateTime = {};
        if (startDate) whereClause.startDateTime.gte = new Date(startDate);
        if (endDate) whereClause.startDateTime.lte = new Date(endDate);
      }

      const events = await prisma.calendarEvent.findMany({
        where: whereClause,
        orderBy: { startDateTime: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.calendarEvent.count({
        where: whereClause,
      });

      return res.status(200).json({
        events,
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('Get calendar events error:', error);
      return res.status(500).json({ 
        error: 'Failed to get calendar events', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}