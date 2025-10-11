import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { OAuth2Client } from 'google-auth-library';

const calendar = google.calendar('v3');

export class CalendarService {
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

  async fetchEvents(
    userId: string, 
    calendarId: string = 'primary',
    timeMin?: Date,
    timeMax?: Date,
    maxResults: number = 250
  ) {
    try {
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneMonthAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        auth: this.oauth2Client,
        calendarId,
        timeMin: (timeMin || oneMonthAgo).toISOString(),
        timeMax: (timeMax || oneMonthAhead).toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      const savedEvents = [];

      for (const event of events) {
        const savedEvent = await this.saveEvent(userId, calendarId, event);
        if (savedEvent) {
          savedEvents.push(savedEvent);
        }
      }

      return savedEvents;
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  async saveEvent(userId: string, calendarId: string, eventData: any) {
    try {
      if (!eventData.id) return null;

      const startDateTime = eventData.start?.dateTime 
        ? new Date(eventData.start.dateTime)
        : eventData.start?.date 
          ? new Date(eventData.start.date)
          : new Date();

      const endDateTime = eventData.end?.dateTime
        ? new Date(eventData.end.dateTime)
        : eventData.end?.date
          ? new Date(eventData.end.date)
          : new Date();

      const event = {
        googleEventId: eventData.id,
        calendarId,
        summary: eventData.summary || null,
        description: eventData.description || null,
        location: eventData.location || null,
        startDateTime,
        startTimeZone: eventData.start?.timeZone || null,
        endDateTime,
        endTimeZone: eventData.end?.timeZone || null,
        isAllDay: !!eventData.start?.date && !eventData.start?.dateTime,
        status: eventData.status || null,
        organizer: eventData.organizer || null,
        attendees: eventData.attendees || [],
        recurrence: eventData.recurrence || [],
        reminders: eventData.reminders || null,
        attachments: eventData.attachments || [],
        conferenceData: eventData.conferenceData || null,
        googleCreatedAt: new Date(eventData.created || Date.now()),
        googleUpdatedAt: new Date(eventData.updated || Date.now()),
      };

      return await prisma.calendarEvent.upsert({
        where: { googleEventId: event.googleEventId },
        update: {
          ...event,
          userId,
          updatedAt: new Date(),
        },
        create: {
          ...event,
          userId,
        },
      });
    } catch (error) {
      console.error('Error saving event:', error);
      throw error;
    }
  }

  async getCalendarList() {
    try {
      const response = await calendar.calendarList.list({
        auth: this.oauth2Client,
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar list:', error);
      throw error;
    }
  }

  async createEvent(calendarId: string = 'primary', eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: Array<{ email: string }>;
    reminders?: any;
  }) {
    try {
      const response = await calendar.events.insert({
        auth: this.oauth2Client,
        calendarId,
        requestBody: eventData,
        sendNotifications: true,
      });

      return response.data;
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  async updateEvent(calendarId: string = 'primary', eventId: string, eventData: any) {
    try {
      const response = await calendar.events.update({
        auth: this.oauth2Client,
        calendarId,
        eventId,
        requestBody: eventData,
        sendNotifications: true,
      });

      return response.data;
    } catch (error) {
      console.error('Error updating event:', error);
      throw error;
    }
  }

  async deleteEvent(calendarId: string = 'primary', eventId: string) {
    try {
      await calendar.events.delete({
        auth: this.oauth2Client,
        calendarId,
        eventId,
        sendNotifications: true,
      });

      return { success: true };
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  async syncAllCalendars(userId: string) {
    try {
      const calendars = await this.getCalendarList();
      const allEvents = [];

      for (const cal of calendars) {
        if (cal.id) {
          const events = await this.fetchEvents(userId, cal.id);
          allEvents.push(...events);
        }
      }

      return allEvents;
    } catch (error) {
      console.error('Error syncing all calendars:', error);
      throw error;
    }
  }
}