import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';

const gmail = google.gmail('v1');
const calendar = google.calendar('v3');

export class WebhookService {
  private oauth2Client: OAuth2Client;

  constructor(refreshToken: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
  }

  /**
   * Set up Gmail push notifications
   */
  async setupGmailWebhook(userId: string): Promise<{ channelId: string; resourceId: string }> {
    try {
      if (!process.env.GMAIL_PUBSUB_TOPIC) {
        throw new Error('GMAIL_PUBSUB_TOPIC environment variable is required');
      }

      // Generate a unique channel ID
      const channelId = `gmail_${userId}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      
      // Set up Gmail push notification using Pub/Sub
      const response = await gmail.users.watch({
        auth: this.oauth2Client,
        userId: 'me',
        requestBody: {
          topicName: process.env.GMAIL_PUBSUB_TOPIC,
          labelIds: [], // Watch all emails (empty array means all labels)
          labelFilterAction: 'include'
        }
      });


      if (!response.data.historyId) {
        throw new Error('Failed to set up Gmail webhook - no historyId received');
      }

      // Save the subscription to database
      await prisma.webhookSubscription.create({
        data: {
          userId,
          channelId,
          resourceId: response.data.historyId,
          resourceType: 'gmail',
          expiresAt: response.data.expiration ? new Date(parseInt(response.data.expiration)) : undefined,
          isActive: true,
          metadata: {
            historyId: response.data.historyId,
            topicName: process.env.GMAIL_PUBSUB_TOPIC
          }
        }
      });

      return {
        channelId,
        resourceId: response.data.historyId
      };
    } catch (error) {
      console.error('Error setting up Gmail webhook:', error);
      throw error;
    }
  }

  /**
   * Set up Google Calendar push notifications
   */
  async setupCalendarWebhook(userId: string, calendarId: string = 'primary'): Promise<{ channelId: string; resourceId: string }> {
    try {
      // Generate a unique channel ID
      const channelId = `calendar_${userId}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      
      // Create webhook URL for calendar events
      const webhookUrl = `${process.env.NEXTAUTH_URL}/api/webhooks/calendar`;
      
      console.log('Setting up calendar webhook:', {
        userId,
        channelId,
        calendarId,
        webhookUrl
      });
      
      // Set up Calendar push notification
      const response = await calendar.events.watch({
        auth: this.oauth2Client,
        calendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          token: crypto.randomBytes(32).toString('hex'), // Optional verification token
          expiration: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days from now
        }
      });

      console.log('Calendar webhook response:', response.data);


      if (!response.data.resourceId) {
        throw new Error('Failed to set up Calendar webhook - no resourceId received');
      }

      // Save the subscription to database
      await prisma.webhookSubscription.create({
        data: {
          userId,
          channelId,
          resourceId: response.data.resourceId,
          resourceType: 'calendar',
          resourceUri: response.data.resourceUri,
          expiresAt: response.data.expiration ? new Date(parseInt(response.data.expiration)) : undefined,
          isActive: true,
          metadata: {
            calendarId,
            token: response.data.token
          }
        }
      });

      return {
        channelId,
        resourceId: response.data.resourceId
      };
    } catch (error) {
      console.error('Error setting up Calendar webhook:', error);
      throw error;
    }
  }

  /**
   * Stop Gmail push notifications
   */
  async stopGmailWebhook(channelId: string, resourceId: string): Promise<void> {
    try {
      await gmail.users.stop({
        auth: this.oauth2Client,
        userId: 'me',
        requestBody: {
          // Gmail uses a different approach - we need to use the Pub/Sub subscription management
          // This is typically handled through the Google Cloud Console
        }
      });

      // Mark subscription as inactive
      await prisma.webhookSubscription.updateMany({
        where: { channelId },
        data: { isActive: false }
      });

    } catch (error) {
      console.error('Error stopping Gmail webhook:', error);
      throw error;
    }
  }

  /**
   * Stop Calendar push notifications
   */
  async stopCalendarWebhook(channelId: string, resourceId: string): Promise<void> {
    try {
      await calendar.channels.stop({
        auth: this.oauth2Client,
        requestBody: {
          id: channelId,
          resourceId: resourceId
        }
      });

      // Mark subscription as inactive
      await prisma.webhookSubscription.updateMany({
        where: { channelId },
        data: { isActive: false }
      });

    } catch (error) {
      console.error('Error stopping Calendar webhook:', error);
      throw error;
    }
  }

  /**
   * Get active webhook subscriptions for a user
   */
  async getUserWebhookSubscriptions(userId: string) {
    return await prisma.webhookSubscription.findMany({
      where: {
        userId,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Cleanup expired webhook subscriptions
   */
  async cleanupExpiredSubscriptions(): Promise<void> {
    try {
      const expiredSubscriptions = await prisma.webhookSubscription.findMany({
        where: {
          isActive: true,
          expiresAt: { lt: new Date() }
        }
      });

      for (const subscription of expiredSubscriptions) {
        try {
          if (subscription.resourceType === 'calendar') {
            await this.stopCalendarWebhook(subscription.channelId, subscription.resourceId || '');
          }
          // Note: Gmail subscriptions typically auto-expire and don't need explicit stopping
        } catch (error) {
          console.error(`Error stopping expired subscription ${subscription.id}:`, error);
        }
      }

      // Mark all expired subscriptions as inactive
      await prisma.webhookSubscription.updateMany({
        where: {
          isActive: true,
          expiresAt: { lt: new Date() }
        },
        data: { isActive: false }
      });

    } catch (error) {
      console.error('Error cleaning up expired subscriptions:', error);
      throw error;
    }
  }

  /**
   * Refresh webhook subscriptions that are about to expire
   */
  async refreshExpiringSubscriptions(userId: string): Promise<void> {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const expiringSubscriptions = await prisma.webhookSubscription.findMany({
        where: {
          userId,
          isActive: true,
          expiresAt: { lt: tomorrow }
        },
        include: { user: true }
      });

      for (const subscription of expiringSubscriptions) {
        try {
          if (!subscription.user.googleRefreshToken) {
            console.log('User has no refresh token, skipping webhook refresh');
            continue;
          }

          // Stop the old subscription
          if (subscription.resourceType === 'calendar') {
            await this.stopCalendarWebhook(subscription.channelId, subscription.resourceId || '');
          }

          // Create a new subscription
          if (subscription.resourceType === 'gmail') {
            await this.setupGmailWebhook(userId);
          } else if (subscription.resourceType === 'calendar') {
            const calendarId = (subscription.metadata as any)?.calendarId || 'primary';
            await this.setupCalendarWebhook(userId, calendarId);
          }
        } catch (error) {
          console.error(`Error refreshing subscription ${subscription.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error refreshing expiring subscriptions:', error);
      throw error;
    }
  }
}