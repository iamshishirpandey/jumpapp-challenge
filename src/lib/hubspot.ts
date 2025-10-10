import { prisma } from './prisma'

interface HubSpotTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export class HubSpotTokenManager {
  private static async refreshTokens(refreshToken: string): Promise<HubSpotTokens> {
    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to refresh HubSpot token')
    }

    const data = await response.json()
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // HubSpot may not always return a new refresh token
      expiresIn: data.expires_in,
    }
  }

  public static async getValidAccessToken(userEmail: string): Promise<string | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { email: userEmail },
        select: {
          hubspotConnected: true,
          hubspotRefreshToken: true,
        },
      })

      if (!user?.hubspotConnected || !user.hubspotRefreshToken) {
        return null
      }

      const tokens = await this.refreshTokens(user.hubspotRefreshToken)

      if (tokens.refreshToken !== user.hubspotRefreshToken) {
        await prisma.user.update({
          where: { email: userEmail },
          data: { hubspotRefreshToken: tokens.refreshToken },
        })
      }

      return tokens.accessToken
    } catch (error) {
      console.error('Error getting HubSpot access token:', error)
      
      // If refresh fails, disconnect the user's HubSpot account
      await prisma.user.update({
        where: { email: userEmail },
        data: {
          hubspotConnected: false,
          hubspotRefreshToken: null,
          hubspotPortalId: null,
          hubspotConnectedAt: null,
        },
      })
      
      return null
    }
  }

  public static async makeHubSpotRequest(
    userEmail: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response | null> {
    const accessToken = await this.getValidAccessToken(userEmail)
    
    if (!accessToken) {
      return null
    }

    return fetch(`https://api.hubapi.com${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
  }
}