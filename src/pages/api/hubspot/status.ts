import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    try {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email! },
        select: {
          hubspotConnected: true,
          hubspotConnectedAt: true,
          hubspotPortalId: true,
        },
      })

      res.json({
        connected: user?.hubspotConnected || false,
        connectedAt: user?.hubspotConnectedAt,
        portalId: user?.hubspotPortalId,
      })
    } catch (error) {
      console.error('Error fetching HubSpot status:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  } else if (req.method === 'DELETE') {
    // Disconnect HubSpot
    try {
      await prisma.user.update({
        where: { email: session.user.email! },
        data: {
          hubspotConnected: false,
          hubspotRefreshToken: null,
          hubspotPortalId: null,
          hubspotConnectedAt: null,
        },
      })

      res.json({ success: true })
    } catch (error) {
      console.error('Error disconnecting HubSpot:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  } else {
    res.setHeader('Allow', ['GET', 'DELETE'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}