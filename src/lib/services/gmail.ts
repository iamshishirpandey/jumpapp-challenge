import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { OAuth2Client } from 'google-auth-library';

const gmail = google.gmail('v1');

export class GmailService {
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

  async fetchEmails(userId: string, query: string = 'is:unread', maxResults: number = 50) {
    try {
      const response = await gmail.users.messages.list({
        auth: this.oauth2Client,
        userId: 'me',
        q: query,
        maxResults,
      });

      const messages = response.data.messages || [];
      const emails = [];

      for (const message of messages) {
        const emailData = await this.getEmailDetails(message.id!);
        if (emailData) {
          const email = await this.saveEmail(userId, emailData);
          emails.push(email);
        }
      }

      return emails;
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  async getEmailDetails(messageId: string) {
    try {
      const response = await gmail.users.messages.get({
        auth: this.oauth2Client,
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      const parts = message.payload?.parts || [];

      const getHeader = (name: string) => 
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const getBody = (parts: any[]): { text: string; html: string } => {
        let text = '';
        let html = '';

        for (const part of parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            text = Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            html = Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.parts) {
            const nested = getBody(part.parts);
            text = text || nested.text;
            html = html || nested.html;
          }
        }

        if (!text && message.payload?.body?.data) {
          text = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
        }

        return { text, html };
      };

      const body = parts.length > 0 
        ? getBody(parts) 
        : message.payload?.body?.data 
          ? { 
              text: Buffer.from(message.payload.body.data, 'base64').toString('utf-8'),
              html: '' 
            }
          : { text: '', html: '' };

      const attachments = parts
        .filter(part => part.filename && part.body?.attachmentId)
        .map(part => ({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body?.size || 0,
          attachmentId: part.body?.attachmentId,
        }));

      return {
        gmailId: message.id!,
        threadId: message.threadId!,
        labelIds: message.labelIds || [],
        snippet: message.snippet || '',
        from: getHeader('from'),
        to: getHeader('to').split(',').map(e => e.trim()).filter(Boolean),
        cc: getHeader('cc').split(',').map(e => e.trim()).filter(Boolean),
        bcc: getHeader('bcc').split(',').map(e => e.trim()).filter(Boolean),
        subject: getHeader('subject'),
        body: body.text,
        bodyHtml: body.html,
        attachments,
        internalDate: new Date(parseInt(message.internalDate || '0')),
        isRead: !message.labelIds?.includes('UNREAD'),
        isStarred: message.labelIds?.includes('STARRED') || false,
        isImportant: message.labelIds?.includes('IMPORTANT') || false,
      };
    } catch (error) {
      console.error('Error getting email details:', error);
      return null;
    }
  }

  async saveEmail(userId: string, emailData: any) {
    try {
      return await prisma.email.upsert({
        where: { gmailId: emailData.gmailId },
        update: {
          ...emailData,
          userId,
          updatedAt: new Date(),
        },
        create: {
          ...emailData,
          userId,
        },
      });
    } catch (error) {
      console.error('Error saving email:', error);
      throw error;
    }
  }

  async markAsRead(messageId: string) {
    try {
      await gmail.users.messages.modify({
        auth: this.oauth2Client,
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      console.error('Error marking email as read:', error);
      throw error;
    }
  }

  async getAttachment(messageId: string, attachmentId: string) {
    try {
      const response = await gmail.users.messages.attachments.get({
        auth: this.oauth2Client,
        userId: 'me',
        messageId,
        id: attachmentId,
      });

      return response.data;
    } catch (error) {
      console.error('Error getting attachment:', error);
      throw error;
    }
  }
}