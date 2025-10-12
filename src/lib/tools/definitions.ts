export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description: string
      required?: boolean
      enum?: string[]
    }>
    required: string[]
  }
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'send_email',
    description: 'Send an email to one or more recipients',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Email address of the recipient (comma-separated for multiple recipients)'
        },
        subject: {
          type: 'string',
          description: 'Subject line of the email'
        },
        body: {
          type: 'string',
          description: 'Body content of the email'
        },
        cc: {
          type: 'string',
          description: 'CC email addresses (comma-separated, optional)'
        },
        bcc: {
          type: 'string',
          description: 'BCC email addresses (comma-separated, optional)'
        }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'reply_to_email',
    description: 'Reply to an existing email',
    parameters: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Gmail thread ID to reply to'
        },
        body: {
          type: 'string',
          description: 'Reply message content'
        },
        replyAll: {
          type: 'boolean',
          description: 'Whether to reply to all recipients (default: false)'
        }
      },
      required: ['threadId', 'body']
    }
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event. Can intelligently parse natural language requests like "Schedule a meeting with John at john@email.com for tomorrow at 3 PM" or "Set up a call with Sonia Aryal on soniaaryal12@gmail.com for October 15, 2025 at 2 PM". Automatically extracts attendee names, emails, dates, and times from natural language.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the calendar event. If not explicitly provided, generate based on the request (e.g., "Meeting with John", "Call with Sonia Aryal")'
        },
        description: {
          type: 'string',
          description: 'Description of the event. Include any additional context from the request.'
        },
        startDateTime: {
          type: 'string',
          description: 'Start date and time in ISO format (e.g., 2024-01-15T15:00:00). Parse natural language like "tomorrow at 3 PM", "day after tomorrow", "October 15, 2025 at 2 PM". Use current date context to resolve relative dates. Current date is October 12, 2025.'
        },
        endDateTime: {
          type: 'string',
          description: 'End date and time in ISO format. Default to 1 hour after start time unless specified otherwise.'
        },
        attendees: {
          type: 'string',
          description: 'Comma-separated list of attendee email addresses. Extract emails from the request (e.g., "soniaaryal12@gmail.com"). If only a name is provided, search previous conversations for matching emails.'
        },
        location: {
          type: 'string',
          description: 'Location of the meeting. Default to "Video Call" if not specified.'
        },
        sendNotifications: {
          type: 'boolean',
          description: 'Whether to send email notifications to attendees (default: true)'
        }
      },
      required: ['title', 'startDateTime', 'endDateTime']
    }
  },
  {
    name: 'check_calendar_availability',
    description: 'Check calendar availability for a specific time range',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date to check availability (YYYY-MM-DD)'
        },
        endDate: {
          type: 'string',
          description: 'End date to check availability (YYYY-MM-DD)'
        },
        timeMin: {
          type: 'string',
          description: 'Minimum time of day (HH:MM, optional, default: 09:00)'
        },
        timeMax: {
          type: 'string',
          description: 'Maximum time of day (HH:MM, optional, default: 17:00)'
        },
        durationMinutes: {
          type: 'number',
          description: 'Duration of the meeting in minutes (default: 60)'
        }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'create_hubspot_contact',
    description: 'Create a new contact in HubSpot',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Email address of the contact'
        },
        firstName: {
          type: 'string',
          description: 'First name of the contact'
        },
        lastName: {
          type: 'string',
          description: 'Last name of the contact'
        },
        company: {
          type: 'string',
          description: 'Company name (optional)'
        },
        phone: {
          type: 'string',
          description: 'Phone number (optional)'
        },
        jobTitle: {
          type: 'string',
          description: 'Job title (optional)'
        },
        website: {
          type: 'string',
          description: 'Website URL (optional)'
        }
      },
      required: ['email']
    }
  },
  {
    name: 'update_hubspot_contact',
    description: 'Update an existing contact in HubSpot',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'HubSpot contact ID'
        },
        email: {
          type: 'string',
          description: 'Email address of the contact'
        },
        firstName: {
          type: 'string',
          description: 'First name of the contact'
        },
        lastName: {
          type: 'string',
          description: 'Last name of the contact'
        },
        company: {
          type: 'string',
          description: 'Company name (optional)'
        },
        phone: {
          type: 'string',
          description: 'Phone number (optional)'
        },
        jobTitle: {
          type: 'string',
          description: 'Job title (optional)'
        },
        website: {
          type: 'string',
          description: 'Website URL (optional)'
        }
      },
      required: ['contactId']
    }
  },
  {
    name: 'create_hubspot_note',
    description: 'Create a note for a HubSpot contact',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'HubSpot contact ID'
        },
        noteText: {
          type: 'string',
          description: 'Content of the note'
        },
        noteType: {
          type: 'string',
          description: 'Type of note',
          enum: ['EMAIL', 'CALL', 'MEETING', 'TASK', 'NOTE']
        }
      },
      required: ['contactId', 'noteText']
    }
  },
  {
    name: 'search_hubspot_contacts',
    description: 'Search for contacts in HubSpot',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (name, email, company, etc.)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'search_emails',
    description: 'Search through Gmail emails using various criteria',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (can include sender, subject, keywords, etc.)'
        },
        from: {
          type: 'string',
          description: 'Email address of sender to filter by'
        },
        to: {
          type: 'string',
          description: 'Email address of recipient to filter by'
        },
        subject: {
          type: 'string',
          description: 'Subject line keywords to search for'
        },
        after: {
          type: 'string',
          description: 'Search emails after this date (YYYY-MM-DD)'
        },
        before: {
          type: 'string',
          description: 'Search emails before this date (YYYY-MM-DD)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of emails to return (default: 10)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_email_thread',
    description: 'Get full email thread/conversation details',
    parameters: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'Gmail thread ID'
        }
      },
      required: ['threadId']
    }
  },
  {
    name: 'search_calendar_events',
    description: 'Search for calendar events',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for event title or description'
        },
        startDate: {
          type: 'string',
          description: 'Start date to search from (YYYY-MM-DD)'
        },
        endDate: {
          type: 'string',
          description: 'End date to search until (YYYY-MM-DD)'
        },
        attendee: {
          type: 'string',
          description: 'Email address of attendee to filter by'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default: 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event',
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'Google Calendar event ID'
        },
        title: {
          type: 'string',
          description: 'New title for the event'
        },
        description: {
          type: 'string',
          description: 'New description for the event'
        },
        startDateTime: {
          type: 'string',
          description: 'New start date and time in ISO format'
        },
        endDateTime: {
          type: 'string',
          description: 'New end date and time in ISO format'
        },
        location: {
          type: 'string',
          description: 'New location for the event'
        }
      },
      required: ['eventId']
    }
  },
  {
    name: 'create_task',
    description: 'Create a new task to be executed later or remembered',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the task'
        },
        description: {
          type: 'string',
          description: 'Detailed description of what needs to be done'
        },
        dueDate: {
          type: 'string',
          description: 'Due date for the task (YYYY-MM-DD, optional)'
        },
        priority: {
          type: 'string',
          description: 'Priority level of the task',
          enum: ['low', 'medium', 'high', 'urgent']
        },
        assignedTo: {
          type: 'string',
          description: 'Email address of person assigned to the task (optional)'
        },
        relatedTo: {
          type: 'string',
          description: 'Related contact, email, or event ID (optional)'
        }
      },
      required: ['title', 'description']
    }
  },
  {
    name: 'save_ongoing_instruction',
    description: 'Save an ongoing instruction that should be remembered and applied automatically',
    parameters: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'The ongoing instruction to remember'
        },
        triggerEvents: {
          type: 'string',
          description: 'Comma-separated list of events that should trigger this instruction (email_received, contact_created, event_created, etc.)'
        },
        priority: {
          type: 'number',
          description: 'Priority of this instruction (1-10, higher number = higher priority)'
        },
        active: {
          type: 'boolean',
          description: 'Whether this instruction is currently active (default: true)'
        }
      },
      required: ['instruction', 'triggerEvents']
    }
  }
]