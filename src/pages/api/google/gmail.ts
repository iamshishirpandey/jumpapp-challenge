import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { google } from 'googleapis'
import { authOptions } from '../auth/[...nextauth]'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const session = await getServerSession(req, res, authOptions)
    
    if (!session?.accessToken) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({ access_token: session.accessToken })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10
    })

    return res.status(200).json({ messages: response.data.messages })
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch emails' })
  }
}