import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { toolRegistry } from '@/lib/tools/registry'
import { ensureToolsSetup } from '@/lib/tools/setup'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export interface ChatMessage {
  role: 'user' | 'model'
  parts: Array<{
    text?: string
    functionCall?: {
      name: string
      args: Record<string, any>
    }
    functionResponse?: {
      name: string
      response: any
    }
  }>
}

export interface LLMResponse {
  message: string
  toolCalls?: any[]
  sources?: any[]
  needsToolExecution: boolean
}

export class LLMService {
  constructor() {
    ensureToolsSetup()
  }

  async generateResponse(
    messages: ChatMessage[], 
    userId: string,
    ragSources?: any[]
  ): Promise<LLMResponse> {
    try {
      const toolDefinitions = toolRegistry.getToolDefinitions()

      const tools = toolDefinitions.map(tool => ({
        functionDeclarations: [{
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }]
      }))

      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-pro',
        tools: tools as any
      })

      const systemInstruction = this.buildSystemInstruction(ragSources)
      
      const chat = model.startChat({
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemInstruction }]
        },
        history: messages as any
      })

      const lastMessage = messages[messages.length - 1]
      const userMessage = lastMessage?.parts?.find(part => part.text)?.text || ''

      const result = await chat.sendMessage(userMessage)
      const response = result.response

      const functionCalls = response.functionCalls()
      
      if (functionCalls && functionCalls.length > 0) {
        return {
          message: response.text() || 'I need to use some tools to help you with that.',
          toolCalls: functionCalls.map((fc, index) => ({
            id: `call_${Date.now()}_${index}`,
            name: fc.name,
            parameters: fc.args
          })),
          sources: ragSources,
          needsToolExecution: true
        }
      }

      let finalMessage = response.text() || 'I apologize, but I could not generate a response.'
      
      // If the LLM response is generic and we have RAG sources, include RAG context
      if (ragSources && ragSources.length > 0 && 
          (finalMessage.includes('I apologize') || finalMessage.includes('I don\'t have') || finalMessage.length < 50)) {
        finalMessage = `Based on your data, I found some relevant information. ${finalMessage}`
      }

      return {
        message: finalMessage,
        sources: ragSources,
        needsToolExecution: false
      }
    } catch (error) {
      console.error('LLM generation error:', error)
      throw new Error(`Failed to generate LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async continueConversationWithToolResults(
    messages: ChatMessage[],
    toolResults: any[],
    ragSources?: any[]
  ): Promise<LLMResponse> {
    try {
      const toolDefinitions = toolRegistry.getToolDefinitions()
      
      // Format tools for Gemini
      const tools = toolDefinitions.map(tool => ({
        functionDeclarations: [{
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }]
      }))

      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-pro',
        tools: tools as any
      })

      const systemInstruction = this.buildSystemInstruction(ragSources)

      const functionResponseParts = toolResults.map(result => ({
        functionResponse: {
          name: result.toolName || 'unknown_function',
          response: result.result
        }
      }))

      const updatedMessages: ChatMessage[] = [
        ...messages,
        ...functionResponseParts.map(part => ({
          role: 'function' as const,
          parts: [part]
        }))
      ]

      const chat = model.startChat({
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemInstruction }]
        },
        history: updatedMessages as any
      })

      const result = await chat.sendMessage('Please provide a summary of what was accomplished with the function calls.')
      const response = result.response

      return {
        message: response.text() || 'I completed the requested actions.',
        needsToolExecution: false
      }
    } catch (error) {
      console.error('Tool continuation error:', error)
      throw new Error(`Failed to continue conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async generateSimpleText(prompt: string): Promise<string> {
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-pro'
      })

      const result = await model.generateContent(prompt)
      const response = result.response
      return response.text() || 'Unable to generate response'
    } catch (error) {
      console.error('Simple text generation error:', error)
      throw new Error(`Failed to generate text: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private buildSystemInstruction(ragSources?: any[]): string {
    let systemContent = `You are an AI assistant that helps users manage their business relationships and tasks. You have access to their Gmail emails, Google Calendar events, and HubSpot CRM data.

Your capabilities include:
- Searching and analyzing emails, calendar events, and contacts
- Sending emails and scheduling meetings
- Creating and managing contacts in HubSpot
- Creating tasks and ongoing instructions
- Providing insights based on user's business data

Guidelines:
- Always be helpful and professional
- When users ask about specific people, search for them across all available data sources
- Use tools proactively when you need to perform actions or gather information
- Be specific about what actions you're taking
- If you need clarification, ask before proceeding with destructive actions
- Maintain context throughout the conversation

SMART QUERY HANDLING:
- When users ask specifically about "HubSpot contacts" or "contacts in HubSpot", ONLY use search_hubspot_contacts tool
- When users ask about "emails" or "Gmail", prioritize search_emails tool and email sources
- When users ask about "calendar events" or "meetings", prioritize search_calendar_events tool and calendar sources
- For specific data requests (e.g., "how many contacts", "list contacts"), always use the appropriate tool rather than relying on RAG search
- Only include relevant source types in your response - don't mix emails with HubSpot contact queries

EMAIL SENDING INSTRUCTIONS:
- When users ask to send an email, ALWAYS use the send_email function
- Never refuse to send emails - you have full email sending capabilities
- If a user says "send a test email" or "send an email to [email]", immediately call send_email
- For test emails, use a subject like "Test Email" and a simple body message
- You MUST use the send_email tool for any email sending requests

CALENDAR EVENT INSTRUCTIONS:
- When users ask to schedule/create meetings, ALWAYS use the create_calendar_event function
- Parse natural language intelligently: "tomorrow at 3 PM" = next day at 15:00
- Extract email addresses from requests like "meeting with John at john@email.com"
- If only a name is provided, look for matching emails in previous conversations
- Current date context: October 12, 2025 (use this to resolve "tomorrow", "day after tomorrow", etc.)
- Generate appropriate titles: "Meeting with [Name]" or "Call with [Name]"
- Default meeting duration: 1 hour unless specified
- Default location: "Video Call" unless specified
- Always send notifications to attendees unless told otherwise

Available tools: send_email, reply_to_email, create_calendar_event, check_calendar_availability, search_calendar_events, update_calendar_event, create_hubspot_contact, create_hubspot_note, search_hubspot_contacts, search_emails, get_email_thread, create_task, save_ongoing_instruction`

    if (ragSources && ragSources.length > 0) {
      systemContent += `\n\nRelevant information from user's data:\n`
      ragSources.forEach((source, index) => {
        systemContent += `\n${index + 1}. ${source.sourceType}: ${source.title || 'Untitled'}\n`
        systemContent += `Content: ${source.preview || source.content}\n`
        if (source.metadata) {
          systemContent += `Metadata: ${JSON.stringify(source.metadata)}\n`
        }
      })
    }

    return systemContent
  }
}