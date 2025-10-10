import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]'
import { HubSpotTokenManager } from '@/lib/hubspot'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions)
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    try {
      const response = await HubSpotTokenManager.makeHubSpotRequest(
        session.user.email!,
        '/crm/v3/objects/contacts?limit=10'
      )

      if (!response) {
        return res.status(400).json({ error: 'HubSpot not connected or token invalid' })
      }

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status}`)
      }

      const data = await response.json()
      res.json(data)
    } catch (error) {
      console.error('Error fetching HubSpot contacts:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  } else {
    res.setHeader('Allow', ['GET'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}