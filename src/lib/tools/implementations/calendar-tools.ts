import { calendar_v3, google } from 'googleapis'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

async function getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    throw new Error('No access token available')
  }

  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({
    access_token: (session as any).accessToken,
    refresh_token: (session as any).refreshToken
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

export async function createCalendarEvent(parameters: Record<string, any>, userId: string) {
  const { title, description, startDateTime, endDateTime, attendees, location, sendNotifications = true } = parameters
  
  try {
    const calendar = await getCalendarClient(userId)
    
    const attendeeList = attendees ? attendees.split(',').map((email: string) => ({ email: email.trim() })) : []

    const event: calendar_v3.Schema$Event = {
      summary: title,
      description,
      location,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/New_York',
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

    return {
      eventId: response.data.id,
      eventUrl: response.data.htmlLink,
      success: true,
      message: `Event "${title}" created successfully`,
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
        timeZone: 'America/New_York'
      }
    }

    if (endDateTime) {
      updatedEvent.end = {
        dateTime: endDateTime,
        timeZone: 'America/New_York'
      }
    }

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: updatedEvent,
      sendUpdates: 'all'
    })

    return {
      eventId: response.data.id,
      success: true,
      message: `Event updated successfully`,
      updatedFields: { title, description, startDateTime, endDateTime, location }
    }
  } catch (error) {
    throw new Error(`Failed to update calendar event: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}