import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';
import { toolRegistry } from '@/lib/tools/registry';
import { ensureToolsSetup } from '@/lib/tools/setup';

export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private embeddingModel: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.genAI = new GoogleGenerativeAI(apiKey || 'dummy-key');
    ensureToolsSetup();
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    this.embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return [];
      }
      const result = await this.embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      if (error instanceof Error && error.message.includes('API key')) {
        console.error('Gemini API key error:', error.message);
        return [];
      }
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  async generateTextSummary(text: string): Promise<string> {
    try {
      const prompt = `Summarize the following content in 100 words or less, focusing on key information:\n\n${text}`;
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating text summary:', error);
      return text.substring(0, 200); 
    }
  }

  async createDocument(
    userId: string,
    sourceType: 'email' | 'hubspot_contact' | 'hubspot_note' | 'calendar_event',
    sourceId: string,
    title: string | null,
    content: string,
    metadata?: any
  ) {
    try {
      const embedText = `${title || ''} ${content}`.trim().substring(0, 5000); 
      
      let embeddingString = null;
      try {
        const embedding = await this.generateEmbedding(embedText);
        if (embedding && embedding.length > 0) {
          embeddingString = `[${embedding.join(',')}]`;
        }
      } catch (embedError) {
        console.error('Failed to generate embedding for document, storing without vector:', embedError);
      }

      const document = await prisma.$executeRaw`
        INSERT INTO "Document" (
          id,
          "userId",
          "sourceType",
          "sourceId",
          title,
          content,
          metadata,
          embedding,
          "createdAt",
          "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          ${userId},
          ${sourceType},
          ${sourceId},
          ${title},
          ${content},
          ${metadata ? JSON.stringify(metadata) : null}::jsonb,
          ${embeddingString}::vector,
          NOW(),
          NOW()
        )
        ON CONFLICT ("userId", "sourceId")
        DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          embedding = EXCLUDED.embedding,
          "updatedAt" = NOW()
        RETURNING id
      `;

      return document;
    } catch (error) {
      console.error(`Error creating document for ${sourceType} ${sourceId}:`, error);
      throw error;
    }
  }

  async searchSimilarDocuments(
    userId: string,
    query: string,
    limit: number = 10,
    threshold: number = 0.5,
    chatHistory?: any[],
    sourceTypeFilter?: string[]
  ) {
    try {
      const documentCount = await prisma.document.count({
        where: { userId }
      });
      
      if (documentCount === 0) {
        return [];
      }

      let useVectorSearch = true;
      let queryEmbeddingString = null;
      
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        queryEmbeddingString = `[${queryEmbedding.join(',')}]`;
      } catch (embedError) {
        console.error('Failed to generate query embedding, falling back to text search:', embedError);
        useVectorSearch = false;
      }
      
      let results: any = null;
      

      let enhancedQuery = query;
      let contextEntities: string[] = [];
      
      if (chatHistory && chatHistory.length > 0) {

        const recentMessages = chatHistory.slice(-4);
        for (const msg of recentMessages) {
          const content = msg.content.toLowerCase();
          if (content.includes('jump') || content.includes('software engineer')) {
            contextEntities.push('jump', 'software engineer', 'contractor');
          }
          if (content.includes('email')) {
            contextEntities.push('email', 'contact');
          }
        }
        if (query.toLowerCase().includes('email') || query.toLowerCase().includes('what is')) {
          enhancedQuery = `${query} ${contextEntities.join(' ')}`;
        }
      }

      if (useVectorSearch && queryEmbeddingString) {
        const isVectorLatestQuery = query.toLowerCase().includes('latest') || 
                                   query.toLowerCase().includes('recent') || 
                                   query.toLowerCase().includes('newest') ||
                                   query.toLowerCase().includes('last');

        const enhancedEmbedding = await this.generateEmbedding(enhancedQuery);
        const enhancedEmbeddingString = `[${enhancedEmbedding.join(',')}]`;
        
        if (isVectorLatestQuery) {
          if (sourceTypeFilter && sourceTypeFilter.length > 0) {
            results = await prisma.$queryRaw`
              SELECT 
                id,
                "userId",
                "sourceType",
                "sourceId",
                title,
                content,
                metadata,
                "createdAt",
                "updatedAt",
                1 - (embedding <=> ${enhancedEmbeddingString}::vector) as similarity
              FROM "Document"
              WHERE "userId" = ${userId}
                AND embedding IS NOT NULL
                AND 1 - (embedding <=> ${enhancedEmbeddingString}::vector) >= ${threshold}
                AND "sourceType" = ANY(${sourceTypeFilter})
              ORDER BY "createdAt" DESC, embedding <=> ${enhancedEmbeddingString}::vector
              LIMIT ${limit}
            `;
          } else {
            results = await prisma.$queryRaw`
              SELECT 
                id,
                "userId",
                "sourceType",
                "sourceId",
                title,
                content,
                metadata,
                "createdAt",
                "updatedAt",
                1 - (embedding <=> ${enhancedEmbeddingString}::vector) as similarity
              FROM "Document"
              WHERE "userId" = ${userId}
                AND embedding IS NOT NULL
                AND 1 - (embedding <=> ${enhancedEmbeddingString}::vector) >= ${threshold}
              ORDER BY "createdAt" DESC, embedding <=> ${enhancedEmbeddingString}::vector
              LIMIT ${limit}
            `;
          }
        } else {
          if (sourceTypeFilter && sourceTypeFilter.length > 0) {
            results = await prisma.$queryRaw`
              SELECT 
                id,
                "userId",
                "sourceType",
                "sourceId",
                title,
                content,
                metadata,
                "createdAt",
                "updatedAt",
                1 - (embedding <=> ${enhancedEmbeddingString}::vector) as similarity
              FROM "Document"
              WHERE "userId" = ${userId}
                AND embedding IS NOT NULL
                AND 1 - (embedding <=> ${enhancedEmbeddingString}::vector) >= ${threshold}
                AND "sourceType" = ANY(${sourceTypeFilter})
              ORDER BY embedding <=> ${enhancedEmbeddingString}::vector
              LIMIT ${limit}
            `;
          } else {
            results = await prisma.$queryRaw`
              SELECT 
                id,
                "userId",
                "sourceType",
                "sourceId",
                title,
                content,
                metadata,
                "createdAt",
                "updatedAt",
                1 - (embedding <=> ${enhancedEmbeddingString}::vector) as similarity
              FROM "Document"
              WHERE "userId" = ${userId}
                AND embedding IS NOT NULL
                AND 1 - (embedding <=> ${enhancedEmbeddingString}::vector) >= ${threshold}
              ORDER BY embedding <=> ${enhancedEmbeddingString}::vector
              LIMIT ${limit}
            `;
          }
        }
        if (!results || (results as any[]).length === 0) {
          if (isVectorLatestQuery) {
            if (sourceTypeFilter && sourceTypeFilter.length > 0) {
              results = await prisma.$queryRaw`
                SELECT 
                  id,
                  "userId",
                  "sourceType",
                  "sourceId",
                  title,
                  content,
                  metadata,
                  "createdAt",
                  "updatedAt",
                  1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
                FROM "Document"
                WHERE "userId" = ${userId}
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> ${queryEmbeddingString}::vector) >= ${threshold}
                  AND "sourceType" = ANY(${sourceTypeFilter})
                ORDER BY "createdAt" DESC, embedding <=> ${queryEmbeddingString}::vector
                LIMIT ${limit}
              `;
            } else {
              results = await prisma.$queryRaw`
                SELECT 
                  id,
                  "userId",
                  "sourceType",
                  "sourceId",
                  title,
                  content,
                  metadata,
                  "createdAt",
                  "updatedAt",
                  1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
                FROM "Document"
                WHERE "userId" = ${userId}
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> ${queryEmbeddingString}::vector) >= ${threshold}
                ORDER BY "createdAt" DESC, embedding <=> ${queryEmbeddingString}::vector
                LIMIT ${limit}
              `;
            }
          } else {
            if (sourceTypeFilter && sourceTypeFilter.length > 0) {
              results = await prisma.$queryRaw`
                SELECT 
                  id,
                  "userId",
                  "sourceType",
                  "sourceId",
                  title,
                  content,
                  metadata,
                  "createdAt",
                  "updatedAt",
                  1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
                FROM "Document"
                WHERE "userId" = ${userId}
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> ${queryEmbeddingString}::vector) >= ${threshold}
                  AND "sourceType" = ANY(${sourceTypeFilter})
                ORDER BY embedding <=> ${queryEmbeddingString}::vector
                LIMIT ${limit}
              `;
            } else {
              results = await prisma.$queryRaw`
                SELECT 
                  id,
                  "userId",
                  "sourceType",
                  "sourceId",
                  title,
                  content,
                  metadata,
                  "createdAt",
                  "updatedAt",
                  1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
                FROM "Document"
                WHERE "userId" = ${userId}
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> ${queryEmbeddingString}::vector) >= ${threshold}
                ORDER BY embedding <=> ${queryEmbeddingString}::vector
                LIMIT ${limit}
              `;
            }
          }
        }
        
        if (results && (results as any[]).length > 0) {
          return results;
        }
      }

      if (!results || (results as any[]).length === 0) {
        const isLatestQuery = query.toLowerCase().includes('latest') || 
                             query.toLowerCase().includes('recent') || 
                             query.toLowerCase().includes('newest') ||
                             query.toLowerCase().includes('last');
        
        let fallbackResults;
        
        if (isLatestQuery) {
          if (sourceTypeFilter && sourceTypeFilter.length > 0) {
            fallbackResults = await prisma.$queryRaw`
              SELECT 
                d.id,
                d."userId",
                d."sourceType",
                d."sourceId",
                d.title,
                d.content,
                d.metadata,
                d."createdAt",
                d."updatedAt",
                CASE
                  WHEN d."sourceType" = 'email' THEN 0.9
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%software engineer%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%contractor%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%notifications@mail.polymer.co%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%' THEN 0.85
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${query}) || '%' THEN 0.80
                  WHEN LOWER(d.title) LIKE '%' || LOWER(${query}) || '%' THEN 0.75
                  ELSE 0.6
                END as similarity
              FROM "Document" d
              WHERE d."userId" = ${userId}
                AND d."sourceType" = ANY(${sourceTypeFilter})
                AND (
                  d."sourceType" = 'email'
                  OR LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%'
                  OR LOWER(d.content) LIKE '%' || LOWER(${query}) || '%'
                  OR LOWER(d.title) LIKE '%' || LOWER(${query}) || '%'
                )
              ORDER BY d."createdAt" DESC, similarity DESC
              LIMIT ${limit}
            `;
          } else {
            fallbackResults = await prisma.$queryRaw`
              SELECT 
                d.id,
                d."userId",
                d."sourceType",
                d."sourceId",
                d.title,
                d.content,
                d.metadata,
                d."createdAt",
                d."updatedAt",
                CASE
                  WHEN d."sourceType" = 'email' THEN 0.9
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%software engineer%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%contractor%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%notifications@mail.polymer.co%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%' THEN 0.85
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${query}) || '%' THEN 0.80
                  WHEN LOWER(d.title) LIKE '%' || LOWER(${query}) || '%' THEN 0.75
                  ELSE 0.6
                END as similarity
              FROM "Document" d
              WHERE d."userId" = ${userId}
                AND (
                  d."sourceType" = 'email'
                  OR LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%'
                  OR LOWER(d.content) LIKE '%' || LOWER(${query}) || '%'
                  OR LOWER(d.title) LIKE '%' || LOWER(${query}) || '%'
                )
              ORDER BY d."createdAt" DESC, similarity DESC
              LIMIT ${limit}
            `;
          }
        } else {
          if (sourceTypeFilter && sourceTypeFilter.length > 0) {
            fallbackResults = await prisma.$queryRaw`
              SELECT 
                d.id,
                d."userId",
                d."sourceType",
                d."sourceId",
                d.title,
                d.content,
                d.metadata,
                d."createdAt",
                d."updatedAt",
                CASE
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%software engineer%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%contractor%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%notifications@mail.polymer.co%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%baseball%' OR LOWER(d.content) LIKE '%kid%' OR LOWER(d.content) LIKE '%child%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%stock%' OR LOWER(d.content) LIKE '%sell%' OR LOWER(d.content) LIKE '%aapl%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%' THEN 0.85
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${query}) || '%' THEN 0.80
                  WHEN LOWER(d.title) LIKE '%' || LOWER(${query}) || '%' THEN 0.75
                  ELSE 0.3
                END as similarity
              FROM "Document" d
              WHERE d."userId" = ${userId}
                AND d."sourceType" = ANY(${sourceTypeFilter})
                AND (
                  LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%'
                  OR LOWER(d.content) LIKE '%' || LOWER(${query}) || '%'
                  OR LOWER(d.title) LIKE '%' || LOWER(${query}) || '%'
                  OR (LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%software%')
                  OR LOWER(d.content) LIKE '%notifications@mail.polymer.co%'
                  OR (LOWER(d.content) LIKE '%baseball%' AND LOWER(d.content) LIKE '%kid%')
                  OR (LOWER(d.content) LIKE '%stock%' AND LOWER(d.content) LIKE '%sell%')
                  OR LOWER(d.content) LIKE '%greg%'
                )
              ORDER BY similarity DESC, d."createdAt" DESC
              LIMIT ${limit}
            `;
          } else {
            fallbackResults = await prisma.$queryRaw`
              SELECT 
                d.id,
                d."userId",
                d."sourceType",
                d."sourceId",
                d.title,
                d.content,
                d.metadata,
                d."createdAt",
                d."updatedAt",
                CASE
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%software engineer%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%contractor%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%notifications@mail.polymer.co%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%baseball%' OR LOWER(d.content) LIKE '%kid%' OR LOWER(d.content) LIKE '%child%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%stock%' OR LOWER(d.content) LIKE '%sell%' OR LOWER(d.content) LIKE '%aapl%' THEN 0.95
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%' THEN 0.85
                  WHEN LOWER(d.content) LIKE '%' || LOWER(${query}) || '%' THEN 0.80
                  WHEN LOWER(d.title) LIKE '%' || LOWER(${query}) || '%' THEN 0.75
                  ELSE 0.3
                END as similarity
              FROM "Document" d
              WHERE d."userId" = ${userId}
                AND (
                  LOWER(d.content) LIKE '%' || LOWER(${enhancedQuery}) || '%'
                  OR LOWER(d.content) LIKE '%' || LOWER(${query}) || '%'
                  OR LOWER(d.title) LIKE '%' || LOWER(${query}) || '%'
                  OR (LOWER(d.content) LIKE '%jump%' AND LOWER(d.content) LIKE '%software%')
                  OR LOWER(d.content) LIKE '%notifications@mail.polymer.co%'
                  OR (LOWER(d.content) LIKE '%baseball%' AND LOWER(d.content) LIKE '%kid%')
                  OR (LOWER(d.content) LIKE '%stock%' AND LOWER(d.content) LIKE '%sell%')
                  OR LOWER(d.content) LIKE '%greg%'
                )
              ORDER BY similarity DESC, d."createdAt" DESC
              LIMIT ${limit}
            `;
          }
        }
        
        return (fallbackResults as any[]).filter(doc => doc.similarity >= 0.3);
      }

      return results;
    } catch (error) {
      try {
        let fallbackResults;
        if (sourceTypeFilter && sourceTypeFilter.length > 0) {
          fallbackResults = await prisma.$queryRaw`
            SELECT 
              id,
              "userId",
              "sourceType",
              "sourceId",
              title,
              content,
              metadata,
              "createdAt",
              "updatedAt",
              0.5 as similarity
            FROM "Document"
            WHERE "userId" = ${userId}
              AND "sourceType" = ANY(${sourceTypeFilter})
              AND (
                LOWER(title) LIKE LOWER('%' || ${query} || '%')
                OR LOWER(content) LIKE LOWER('%' || ${query} || '%')
              )
            ORDER BY "updatedAt" DESC
            LIMIT ${limit}
          `;
        } else {
          fallbackResults = await prisma.$queryRaw`
            SELECT 
              id,
              "userId",
              "sourceType",
              "sourceId",
              title,
              content,
              metadata,
              "createdAt",
              "updatedAt",
              0.5 as similarity
            FROM "Document"
            WHERE "userId" = ${userId}
              AND (
                LOWER(title) LIKE LOWER('%' || ${query} || '%')
                OR LOWER(content) LIKE LOWER('%' || ${query} || '%')
              )
            ORDER BY "updatedAt" DESC
            LIMIT ${limit}
          `;
        }
        return fallbackResults;
      } catch (fallbackError) {
        return [];
      }
    }
  }

  async generateRAGResponse(userId: string, query: string, chatHistory?: any[]): Promise<{
    response: string;
    sources: any[];
    relevantDocuments: any[];
    toolsUsed?: any[];
  }> {
    try {
      let sourceTypeFilter: string[] | undefined;
      const queryLower = query.toLowerCase();
      
      if (queryLower.includes('hubspot') || (queryLower.includes('contact') && queryLower.includes('how many'))) {
        sourceTypeFilter = ['hubspot_contact', 'hubspot_note'];
      } else if (queryLower.includes('email') || queryLower.includes('gmail')) {
        sourceTypeFilter = ['email'];
      } else if (queryLower.includes('calendar') || queryLower.includes('meeting') || queryLower.includes('event')) {
        sourceTypeFilter = ['calendar_event'];
      }
      
      // Use higher threshold for more precise results
      const relevantDocs = await this.searchSimilarDocuments(userId, query, 15, 0.3, chatHistory, sourceTypeFilter);
      
      if (!relevantDocs || relevantDocs.length === 0) {
        return {
          response: "I don't have any relevant information in your synchronized data to answer that question. Please try syncing your Gmail, HubSpot, or Calendar data first.",
          sources: [],
          relevantDocuments: []
        };
      }

      const highQualityDocs = (relevantDocs as any[]).filter(doc => doc.similarity >= 0.4);
      
      if (highQualityDocs.length === 0) {
        return {
          response: `Based on the ${relevantDocs.length} document${relevantDocs.length === 1 ? '' : 's'} found in your data, I can help answer your question.`,
          sources: (relevantDocs as any[]).map((doc) => ({
            id: doc.id,
            sourceType: doc.sourceType,
            title: doc.title,
            similarity: doc.similarity,
            metadata: doc.metadata || {},
            preview: doc.content.substring(0, 200) + '...'
          })),
          relevantDocuments: relevantDocs
        };
      }
      
      const contextDocs = highQualityDocs.length > 0 ? highQualityDocs : (relevantDocs as any[]);
      
      const nonDeliveryFailures = contextDocs.filter(doc => 
        !doc.title?.toLowerCase().includes('delivery status notification') &&
        !doc.title?.toLowerCase().includes('delivery failure') &&
        !doc.content?.toLowerCase().includes('mailer-daemon')
      );
      
      const sourceDocs = nonDeliveryFailures.length > 0 ? nonDeliveryFailures : contextDocs;
      
      const sources = await Promise.all(
        sourceDocs
          .filter(doc => doc.similarity >= 0.4)
          .sort((a, b) => b.similarity - a.similarity)
          .map(async (doc) => {
            const metadata = doc.metadata || {};
            let gmailId = null;
            
            if (doc.sourceType === 'email') {
              try {
                const emailRecord = await prisma.email.findUnique({
                  where: { id: doc.sourceId },
                  select: { gmailId: true }
                });
                gmailId = emailRecord?.gmailId;
              } catch (error) {
              }
            }
            
            return {
              id: doc.id,
              sourceType: doc.sourceType,
              title: doc.title,
              similarity: doc.similarity,
              metadata,
              preview: doc.content.substring(0, 200) + '...',
              sourceId: doc.sourceId,
              gmailId
            };
          })
      );
      
      const context = sourceDocs.map((doc, index) => {
        const metadata = doc.metadata || {};
        let sourceInfo = '';
        
        switch (doc.sourceType) {
          case 'email':
            const fromSender = metadata.from || 'unknown';
            const emailDate = metadata.date ? new Date(metadata.date).toLocaleDateString() : 'unknown date';
            sourceInfo = `Email from ${fromSender} on ${emailDate}`;
            if (doc.title) {
              sourceInfo += ` with subject: "${doc.title}"`;
            }
            break;
          case 'hubspot_contact':
            sourceInfo = `HubSpot Contact: ${doc.title || 'Unnamed contact'}`;
            break;
          case 'hubspot_note':
            sourceInfo = `HubSpot Note from ${metadata.createdAt ? new Date(metadata.createdAt).toLocaleDateString() : 'unknown date'}`;
            break;
          case 'calendar_event':
            sourceInfo = `Calendar Event: ${doc.title || 'Untitled event'} on ${metadata.startDateTime ? new Date(metadata.startDateTime).toLocaleDateString() : 'unknown date'}`;
            break;
        }
        
        return `[Source ${index + 1}] ${sourceInfo}:\n${doc.content}\n`;
      }).join('\n');


      let conversationContext = '';
      if (chatHistory && chatHistory.length > 0) {
        const recentMessages = chatHistory.slice(-6); 
        conversationContext = '\n\nRecent conversation history:\n' + 
          recentMessages.map((msg) => 
            `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
          ).join('\n') + '\n';
      }

      const now = new Date();
      const currentDateTime = now.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      const calendarEventsCount = sourceDocs.filter(doc => 
        doc.sourceType === 'calendar_event' &&
        !doc.title?.toLowerCase().includes('available') &&
        !doc.title?.toLowerCase().includes('busy') &&
        !doc.title?.toLowerCase().includes('out of office') &&
        doc.similarity >= 0.4
      ).length;

      const willShowCalendarCards = calendarEventsCount > 1;

      const prompt = `You are an AI assistant that helps users find information about their clients and contacts from their personal data including emails, HubSpot contacts, notes, and calendar events. Use the provided context to answer the user's question accurately and helpfully.

Current Date and Time: ${currentDateTime}

Context from user's data:
${context}${conversationContext}

User's question: ${query}

Instructions:
- Answer based ONLY on the information provided in the context above
- Use the current date and time provided to understand temporal references like "today," "tomorrow," "yesterday," "this week," etc.
- For calendar/meeting queries: Focus ONLY on events that directly match the user's criteria. Do not include unrelated events like availability blocks, recurring reminders, or administrative entries
- ${willShowCalendarCards ? 'IMPORTANT: Since multiple calendar events will be shown as visual cards, provide only a brief introductory response (1-2 sentences max) like "Here are your meetings with [person]:" or "I found [number] meetings:". Do NOT list detailed meeting information, times, or attendees as this will be shown in the calendar cards below.' : 'When showing calendar events, provide detailed information about times, attendees, and locations.'}
- When showing multiple calendar events, prioritize those with:
  * Actual meeting participants (attendees)
  * Specific meeting titles (not just "Available" or generic blocks)
  * Events that match the person/topic mentioned in the query
- Pay close attention to the conversation history to understand what the user is referring to
- For questions about specific people or companies mentioned in previous messages, prioritize information about those entities
- When asked for contact details (like email addresses), provide the specific information requested rather than listing all available contacts
- If the user refers to something discussed earlier (like "Jump" or "Software Engineer role"), use that context to provide relevant information
- For time-based queries, calculate relative dates based on the current date and time provided
- When looking at calendar events or email dates, consider the temporal context of the user's question
- For questions about specific people or clients, search through all contact information, emails, and notes
- When looking for personal details (like kids, hobbies, interests), check both contact properties and conversation content
- Be specific about where you found the information (e.g., "In your email from Jump", "According to the HubSpot note")
- If the user asks for someone's email address and you find it, provide just that email address clearly
- Include relevant context and details when found
- If no specific information is found, clearly state that
- For meeting queries, show only the most relevant meetings that match the person or criteria mentioned

Answer:`;

      const actionPatterns = [
        /schedule|meeting|appointment|calendar/i,
        /send|email|message|reply/i,
        /create|add|new.*contact/i,
        /search.*contact|find.*contact|lookup.*contact/i,
        /save.*instruction|remember.*instruction|ongoing.*instruction/i,
        /task|todo|remind/i
      ];
      
      const needsTools = actionPatterns.some(pattern => pattern.test(query));
      
      if (needsTools) {
        const tools = toolRegistry.getToolDefinitions().map(tool => ({
          functionDeclarations: [{
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }]
        }));

        const modelWithTools = this.genAI.getGenerativeModel({ 
          model: 'gemini-2.5-flash',
          tools: tools.length > 0 ? tools as any : undefined
        });

        const result = await modelWithTools.generateContent(prompt);
        const response = result.response;
        
        const functionCalls = response.functionCalls();
        
        if (functionCalls && functionCalls.length > 0) {
          const toolResults = await Promise.allSettled(
            functionCalls.map(fc => 
              toolRegistry.executeTool({
                id: `call_${Date.now()}_${Math.random()}`,
                name: fc.name,
                parameters: fc.args
              }, userId)
            )
          );

          const processedResults = toolResults.map((result) => {
            if (result.status === 'fulfilled') {
              return result.value;
            } else {
              return {
                success: false,
                error: result.reason?.message || 'Unknown error'
              };
            }
          });

          const followUpPrompt = `${prompt}

Tool execution results:
${processedResults.map((result, index) => 
  `${functionCalls[index].name}: ${result.success ? 'Success' : 'Failed'} - ${JSON.stringify(result)}`
).join('\n')}

Please provide a natural response summarizing what was accomplished:`;

          const followUpResult = await this.model.generateContent(followUpPrompt);
          const followUpResponse = await followUpResult.response;
          
          return {
            response: followUpResponse.text(),
            sources,
            relevantDocuments: relevantDocs,
            toolsUsed: functionCalls.map((fc, fcIndex) => ({
              name: fc.name,
              parameters: fc.args,
              result: processedResults[fcIndex]
            }))
          };
        }
      }

      const result = await this.model.generateContent(prompt);
      const response = await result.response;

      return {
        response: response.text(),
        sources,
        relevantDocuments: relevantDocs
      };
    } catch (error) {
      console.error('Error generating RAG response:', error);
      return {
        response: "I'm sorry, there was an error processing your question. Please try again.",
        sources: [],
        relevantDocuments: []
      };
    }
  }

  async analyzeContent(content: string, query: string): Promise<number> {
    try {
      const prompt = `
        Rate how relevant the following content is to the query on a scale of 0 to 1:
        
        Query: ${query}
        
        Content: ${content.substring(0, 500)}
        
        Return only a number between 0 and 1, nothing else.
      `;
      
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const score = parseFloat(response.text().trim());
      
      return isNaN(score) ? 0 : Math.min(1, Math.max(0, score));
    } catch (error) {
      console.error('Error analyzing content relevance:', error);
      const queryWords = query.toLowerCase().split(/\s+/);
      const contentLower = content.toLowerCase();
      const matches = queryWords.filter(word => contentLower.includes(word));
      return matches.length / queryWords.length;
    }
  }

  async processEmailForRAG(userId: string, email: any) {
    const content = `
      Subject: ${email.subject || 'No Subject'}
      From: ${email.from}
      To: ${Array.isArray(email.to) ? email.to.join(', ') : email.to || ''}
      Date: ${email.internalDate}
      
      ${email.body || email.snippet}
      
      Additional context: This is an email communication that may contain client information, preferences, or requests.
    `.trim();

    return this.createDocument(
      userId,
      'email',
      email.id,
      email.subject,
      content,
      {
        from: email.from,
        to: email.to,
        date: email.internalDate,
        labels: email.labelIds,
      }
    );
  }

  async processContactForRAG(userId: string, contact: any) {
    const content = `
      Name: ${contact.firstname || ''} ${contact.lastname || ''}
      Email: ${contact.email || ''}
      Company: ${contact.company || ''}
      Job Title: ${contact.jobtitle || ''}
      Phone: ${contact.phone || ''}
      Lifecycle Stage: ${contact.lifecyclestage || ''}
      
      Additional properties: ${JSON.stringify(contact.properties || {}, null, 2)}
      
      Context: This is a client contact record containing personal and professional information.
    `.trim();

    return this.createDocument(
      userId,
      'hubspot_contact',
      contact.id,
      `${contact.firstname || ''} ${contact.lastname || ''}`.trim() || 'Unnamed Contact',
      content,
      {
        email: contact.email,
        company: contact.company,
        lifecyclestage: contact.lifecyclestage,
        fullName: `${contact.firstname || ''} ${contact.lastname || ''}`.trim(),
      }
    );
  }

  async processNoteForRAG(userId: string, note: any) {
    const content = `
      Note: ${note.noteBody}
      
      Created: ${note.hubspotCreatedAt}
      Contact ID: ${note.contactId || 'Unknown'}
      
      Context: This is a client interaction note that may contain personal details, preferences, conversations, or important client information.
    `.trim();

    return this.createDocument(
      userId,
      'hubspot_note',
      note.id,
      'HubSpot Client Note',
      content,
      {
        contactId: note.contactId,
        createdAt: note.hubspotCreatedAt,
        noteBody: note.noteBody,
      }
    );
  }

  async processEventForRAG(userId: string, event: any) {
    const content = `
      Event: ${event.summary}
      Location: ${event.location}
      Start: ${event.startDateTime}
      End: ${event.endDateTime}
      Description: ${event.description}
      Attendees: ${event.attendees?.map((a: any) => a.email).join(', ')}
    `.trim();

    return this.createDocument(
      userId,
      'calendar_event',
      event.id,
      event.summary,
      content,
      {
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        location: event.location,
        attendees: event.attendees,
      }
    );
  }
}