import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const { code, state } = req.query

  if (!code || !state) {
    return res.redirect('/dashboard?error=missing_code_or_state')
  }

  try {
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/hubspot/callback`,
        code: code as string,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token')
    }

    const tokenData = await tokenResponse.json()


    const accountResponse = await fetch('https://api.hubapi.com/oauth/v1/access-tokens/' + tokenData.access_token)
    const accountData = await accountResponse.json()



    const userEmail = decodeURIComponent(state as string)
    
    await prisma.user.update({
      where: { email: userEmail },
      data: {
        hubspotConnected: true,
        hubspotRefreshToken: tokenData.refresh_token,
        hubspotPortalId: accountData.hub_id?.toString(),
        hubspotConnectedAt: new Date(),
      },
    })


    res.redirect('/dashboard?hubspot=connected')
  } catch (error) {
    console.error('HubSpot OAuth error:', error)
    res.redirect('/dashboard?error=hubspot_connection_failed')
  }
}