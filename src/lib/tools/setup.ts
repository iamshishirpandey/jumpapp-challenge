import { toolRegistry } from './registry'

import { 
  sendEmail, 
  replyToEmail, 
  searchEmails, 
  getEmailThread 
} from './implementations/email-tools'

import { 
  createCalendarEvent, 
  checkCalendarAvailability, 
  searchCalendarEvents, 
  updateCalendarEvent 
} from './implementations/calendar-tools'

import { 
  createHubSpotContact, 
  createHubSpotNote, 
  searchHubSpotContacts 
} from './implementations/hubspot-tools'

import { 
  createTask, 
  saveOngoingInstruction 
} from './implementations/task-tools'

export function setupTools() {
  toolRegistry.registerTool('send_email', sendEmail)
  toolRegistry.registerTool('reply_to_email', replyToEmail)
  toolRegistry.registerTool('search_emails', searchEmails)
  toolRegistry.registerTool('get_email_thread', getEmailThread)
  
  toolRegistry.registerTool('create_calendar_event', createCalendarEvent)
  toolRegistry.registerTool('check_calendar_availability', checkCalendarAvailability)
  toolRegistry.registerTool('search_calendar_events', searchCalendarEvents)
  toolRegistry.registerTool('update_calendar_event', updateCalendarEvent)
  
  toolRegistry.registerTool('create_hubspot_contact', createHubSpotContact)
  toolRegistry.registerTool('create_hubspot_note', createHubSpotNote)
  toolRegistry.registerTool('search_hubspot_contacts', searchHubSpotContacts)
  
  toolRegistry.registerTool('create_task', createTask)
  toolRegistry.registerTool('save_ongoing_instruction', saveOngoingInstruction)
}

let toolsSetup = false

export function ensureToolsSetup() {
  if (!toolsSetup) {
    setupTools()
    toolsSetup = true
  }
}