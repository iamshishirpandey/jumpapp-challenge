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
        select: {
          id: true,
          googleConnectedAt: true,
          hubspotConnectedAt: true,
          googleRefreshToken: true,
          hubspotRefreshToken: true,
          hubspotConnected: true,
          googleConnected: true,
          hubspotPortalId: true,
          _count: {
            select: {
              emails: true,
              hubspotContacts: true,
              hubspotNotes: true,
              calendarEvents: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }


      const [lastEmailDoc, lastContactDoc, lastNoteDoc, lastEventDoc] = await Promise.all([
        prisma.document.findFirst({
          where: { 
            userId: user.id,
            sourceType: 'email'
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        prisma.document.findFirst({
          where: { 
            userId: user.id,
            sourceType: 'hubspot_contact'
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        prisma.document.findFirst({
          where: { 
            userId: user.id,
            sourceType: 'hubspot_note'
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        prisma.document.findFirst({
          where: { 
            userId: user.id,
            sourceType: 'calendar_event'
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);
      const [emailDocCount, contactDocCount, noteDocCount, eventDocCount] = await Promise.all([
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

      const isGoogleConnected = !!(user.googleRefreshToken && user.googleRefreshToken.length > 0);
      const isHubSpotConnected = !!(user.hubspotRefreshToken && user.hubspotRefreshToken.length > 0);

      const syncStatus = {
        gmail: {
          connected: isGoogleConnected,
          lastSync: lastEmailDoc?.createdAt?.toISOString() || null,
          emailCount: emailDocCount || user._count.emails,
        },
        hubspot: {
          connected: isHubSpotConnected,
          lastSync: lastContactDoc?.createdAt?.toISOString() || lastNoteDoc?.createdAt?.toISOString() || null,
          contactCount: contactDocCount || user._count.hubspotContacts,
          noteCount: noteDocCount || user._count.hubspotNotes,
        },
        calendar: {
          connected: isGoogleConnected,
          lastSync: lastEventDoc?.createdAt?.toISOString() || null,
          eventCount: eventDocCount || user._count.calendarEvents,
        },
      };


      return res.status(200).json(syncStatus);
    } catch (error) {
      return res.status(500).json({ 
        error: 'Failed to get sync status', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}