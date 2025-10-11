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

      // Debug logging
      console.log('=== SYNC STATUS DEBUG ===');
      console.log('User email:', session.user.email);
      console.log('User ID:', user.id);
      console.log('Google refresh token exists:', !!user.googleRefreshToken);
      console.log('Google refresh token length:', user.googleRefreshToken?.length || 0);
      console.log('HubSpot refresh token exists:', !!user.hubspotRefreshToken);
      console.log('HubSpot refresh token length:', user.hubspotRefreshToken?.length || 0);
      console.log('HubSpot connected flag:', user.hubspotConnected);
      console.log('HubSpot connected at:', user.hubspotConnectedAt);
      console.log('HubSpot portal ID:', user.hubspotPortalId);
      console.log('Google connected flag:', user.googleConnected);
      console.log('Google connected at:', user.googleConnectedAt);
      console.log('Email count:', user._count.emails);
      console.log('HubSpot contact count:', user._count.hubspotContacts);
      console.log('HubSpot note count:', user._count.hubspotNotes);
      console.log('Calendar event count:', user._count.calendarEvents);
      console.log('========================');

      // Get last sync times from documents in pgvector
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
      
      // Also get counts from Documents table for accurate pgvector data
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

      // More robust connection checking
      const isGoogleConnected = !!(user.googleRefreshToken && user.googleRefreshToken.length > 0);
      const isHubSpotConnected = !!(user.hubspotRefreshToken && user.hubspotRefreshToken.length > 0);
      
      console.log('Computed connection states:');
      console.log('Google connected (computed):', isGoogleConnected);
      console.log('HubSpot connected (computed):', isHubSpotConnected);
      
      // Validate HubSpot token is not null/undefined/empty string
      if (user.hubspotRefreshToken) {
        console.log('HubSpot token validation:');
        console.log('Token is not null:', user.hubspotRefreshToken !== null);
        console.log('Token is not undefined:', user.hubspotRefreshToken !== undefined);
        console.log('Token is not empty string:', user.hubspotRefreshToken !== '');
        console.log('Token starts with expected format:', user.hubspotRefreshToken.startsWith('1//') || user.hubspotRefreshToken.startsWith('ya29') || user.hubspotRefreshToken.length > 10);
      }

      const syncStatus = {
        gmail: {
          connected: isGoogleConnected,
          lastSync: lastEmailDoc?.createdAt?.toISOString() || null,
          emailCount: emailDocCount || user._count.emails, // Prioritize pgvector document count
        },
        hubspot: {
          connected: isHubSpotConnected,
          lastSync: lastContactDoc?.createdAt?.toISOString() || lastNoteDoc?.createdAt?.toISOString() || null,
          contactCount: contactDocCount || user._count.hubspotContacts, // Prioritize pgvector document count
          noteCount: noteDocCount || user._count.hubspotNotes, // Prioritize pgvector document count
        },
        calendar: {
          connected: isGoogleConnected,
          lastSync: lastEventDoc?.createdAt?.toISOString() || null,
          eventCount: eventDocCount || user._count.calendarEvents, // Prioritize pgvector document count
        },
      };

      console.log('Document counts from pgvector:');
      console.log('Email documents:', emailDocCount);
      console.log('Contact documents:', contactDocCount);
      console.log('Note documents:', noteDocCount);
      console.log('Calendar event documents:', eventDocCount);
      console.log('Sync status response:', JSON.stringify(syncStatus, null, 2));

      return res.status(200).json(syncStatus);
    } catch (error) {
      console.error('Get sync status error:', error);
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