import { calendar_v3, google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { CalendarEmailNotificationService } from '@/lib/services/calendar-email-notifications'

async function getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      accounts: {
        where: { provider: 'google' }
      }
    }
  })

  if (!user || !user.accounts.length) {
    throw new Error('No Google account found for user')
  }

  const googleAccount = user.accounts[0]
  if (!googleAccount.access_token) {
    throw new Error('No access token available')
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  
  oauth2Client.setCredentials({
    access_token: googleAccount.access_token,
    refresh_token: googleAccount.refresh_token
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

async function getUserTimezone(userId: string): Promise<string> {
  try {
    const calendar = await getCalendarClient(userId)
    const settings = await calendar.settings.get({
      setting: 'timezone'
    })
    return settings.data.value || 'America/Denver'
  } catch (error) {
    console.log('Could not fetch user timezone, using default America/Denver')
    return 'America/Denver'
  }
}

export async function createCalendarEvent(parameters: Record<string, any>, userId: string) {
  const { title, description, startDateTime, endDateTime, attendees, location = 'Video Call', sendNotifications = true } = parameters
  
  try {
    const calendar = await getCalendarClient(userId)
    const userTimezone = await getUserTimezone(userId)
    
    console.log('📅 Creating calendar event:', { title, startDateTime, endDateTime, attendees, location })
    
    const attendeeList = attendees ? attendees.split(',').map((email: string) => ({ email: email.trim() })) : []

    const event: calendar_v3.Schema$Event = {
      summary: title,
      description,
      location,
      start: {
        dateTime: startDateTime,
        timeZone: userTimezone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: userTimezone,
      },
      attendees: attendeeList,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: sendNotifications ? 'all' : 'none'
    })

    // Send AI-generated email notifications to attendees if there are any
    if (attendeeList.length > 0) {
      try {
        console.log('📧 Sending AI-generated email notifications for chat-created appointment');
        const notificationService = new CalendarEmailNotificationService();
        
        const notificationResult = await notificationService.sendAppointmentNotifications(
          userId,
          {
            summary: title,
            description,
            startDateTime: new Date(startDateTime),
            endDateTime: new Date(endDateTime),
            location,
            attendees: attendeeList,
            organizer: null
          },
          'created'
        );

        console.log('Email notification result:', notificationResult);
      } catch (emailError) {
        console.error('Error sending AI-generated email notifications:', emailError);
        // Continue even if email fails - the event was still created successfully
      }
    }

    return {
      eventId: response.data.id,
      eventUrl: response.data.htmlLink,
      success: true,
      message: `Event "${title}" created successfully${attendeeList.length > 0 ? ' and invitations sent' : ''}`,
      startTime: startDateTime,
      endTime: endDateTime,
      attendees: attendeeList.map((a: any) => a.email)
    }
  } catch (error) {
    throw new Error(`Failed to create calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function checkCalendarAvailability(parameters: Record<string, any>, userId: string) {
  const { startDate, endDate, timeMin = '09:00', timeMax = '17:00', durationMinutes = 60 } = parameters
  
  try {
    const calendar = await getCalendarClient(userId)
    
    const timeMinDate = new Date(`${startDate}T${timeMin}:00`)
    const timeMaxDate = new Date(`${endDate}T${timeMax}:00`)

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMinDate.toISOString(),
      timeMax: timeMaxDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    })

    const busyTimes = (response.data.items || []).map(event => ({
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      title: event.summary
    }))

    const availableSlots = []
    const duration = durationMinutes * 60 * 1000

    let currentDate = new Date(startDate)
    const endDateObj = new Date(endDate)

    while (currentDate <= endDateObj) {
      const dayStart = new Date(currentDate)
      const [hours, minutes] = timeMin.split(':')
      dayStart.setHours(parseInt(hours), parseInt(minutes), 0, 0)

      const dayEnd = new Date(currentDate)
      const [endHours, endMinutes] = timeMax.split(':')
      dayEnd.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0)

      let slotStart = new Date(dayStart)
      
      while (slotStart.getTime() + duration <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + duration)
        
        const isConflict = busyTimes.some(busy => {
          const busyStart = new Date(busy.start!)
          const busyEnd = new Date(busy.end!)
          return (slotStart < busyEnd && slotEnd > busyStart)
        })

        if (!isConflict) {
          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            date: slotStart.toDateString(),
            time: `${slotStart.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${slotEnd.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`
          })
        }

        slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000)
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return {
      availableSlots: availableSlots.slice(0, 20),
      busyTimes,
      searchPeriod: {
        start: timeMinDate.toISOString(),
        end: timeMaxDate.toISOString(),
        duration: durationMinutes
      }
    }
  } catch (error) {
    throw new Error(`Failed to check calendar availability: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function searchCalendarEvents(parameters: Record<string, any>, userId: string) {
  const { query, startDate, endDate, attendee, limit = 10 } = parameters
  
  try {
    const calendar = await getCalendarClient(userId)
    
    const searchParams: any = {
      calendarId: 'primary',
      maxResults: limit,
      singleEvents: true,
      orderBy: 'startTime'
    }

    if (startDate) {
      searchParams.timeMin = new Date(`${startDate}T00:00:00`).toISOString()
    }
    if (endDate) {
      searchParams.timeMax = new Date(`${endDate}T23:59:59`).toISOString()
    }
    if (query) {
      searchParams.q = query
    }

    const response = await calendar.events.list(searchParams)

    let events = response.data.items || []

    if (attendee) {
      events = events.filter(event => 
        event.attendees?.some(att => att.email?.toLowerCase().includes(attendee.toLowerCase()))
      )
    }

    const formattedEvents = events.map(event => ({
      id: event.id,
      title: event.summary,
      description: event.description,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location,
      attendees: event.attendees?.map(att => ({
        email: att.email,
        name: att.displayName,
        status: att.responseStatus
      })) || [],
      organizer: event.organizer,
      htmlLink: event.htmlLink
    }))

    return {
      events: formattedEvents,
      totalFound: formattedEvents.length,
      searchCriteria: { query, startDate, endDate, attendee }
    }
  } catch (error) {
    throw new Error(`Failed to search calendar events: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function updateCalendarEvent(parameters: Record<string, any>, userId: string) {
  const { eventId, title, description, startDateTime, endDateTime, location } = parameters
  
  try {
    const calendar = await getCalendarClient(userId)
    const userTimezone = await getUserTimezone(userId)
    
    const existingEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId
    })

    const updatedEvent: calendar_v3.Schema$Event = {
      ...existingEvent.data,
      summary: title || existingEvent.data.summary,
      description: description || existingEvent.data.description,
      location: location || existingEvent.data.location
    }

    if (startDateTime) {
      updatedEvent.start = {
        dateTime: startDateTime,
        timeZone: userTimezone
      }
    }

    if (endDateTime) {
      updatedEvent.end = {
        dateTime: endDateTime,
        timeZone: userTimezone
      }
    }

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: updatedEvent,
      sendUpdates: 'all'
    })

    // Send AI-generated update notifications to attendees if there are any
    if (response.data.attendees && response.data.attendees.length > 0) {
      try {
        console.log('📧 Sending AI-generated update notifications for chat-updated appointment');
        const notificationService = new CalendarEmailNotificationService();
        
        const startDate = response.data.start?.dateTime ? new Date(response.data.start.dateTime) : new Date();
        const endDate = response.data.end?.dateTime ? new Date(response.data.end.dateTime) : new Date();
        
        const notificationResult = await notificationService.sendAppointmentNotifications(
          userId,
          {
            summary: response.data.summary || 'Untitled Event',
            description: response.data.description,
            startDateTime: startDate,
            endDateTime: endDate,
            location: response.data.location,
            attendees: response.data.attendees,
            organizer: response.data.organizer
          },
          'updated'
        );

        console.log('Email update notification result:', notificationResult);
      } catch (emailError) {
        console.error('Error sending AI-generated update notifications:', emailError);
        // Continue even if email fails - the event was still updated successfully
      }
    }

    return {
      eventId: response.data.id,
      success: true,
      message: `Event updated successfully${response.data.attendees && response.data.attendees.length > 0 ? ' and notifications sent' : ''}`,
      updatedFields: { title, description, startDateTime, endDateTime, location }
    }
  } catch (error) {
    throw new Error(`Failed to update calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}