import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';

export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private embeddingModel: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.genAI = new GoogleGenerativeAI(apiKey || 'dummy-key');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
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
      const embedText = `${title || ''} ${content}`.trim().substring(0, 3000); 
      
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
    threshold: number = 0.5
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
      
      if (useVectorSearch && queryEmbeddingString) {
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
            AND 1 - (embedding <=> ${queryEmbeddingString}::vector) > ${threshold}
          ORDER BY embedding <=> ${queryEmbeddingString}::vector
          LIMIT ${limit}
        `;
        
        if (results && (results as any[]).length > 0) {
          return results;
        }
      }

      if (!results || (results as any[]).length === 0) {
        const keywords = query.toLowerCase().split(' ').filter(word => word.length > 2);
        const searchPattern = keywords.map(k => `%${k}%`).join(' OR ');
        
        const fallbackResults = await prisma.$queryRaw`
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
              WHEN LOWER(d.content) LIKE '%' || LOWER(${query}) || '%' THEN 1.0
              WHEN LOWER(d.title) LIKE '%' || LOWER(${query}) || '%' THEN 0.9
              ELSE 0.5
            END as similarity
          FROM "Document" d
          WHERE d."userId" = ${userId}
            AND (
              LOWER(d.content) LIKE '%' || LOWER(${query}) || '%'
              OR LOWER(d.title) LIKE '%' || LOWER(${query}) || '%'
              OR EXISTS (
                SELECT 1 FROM unnest(string_to_array(LOWER(${query}), ' ')) AS keyword
                WHERE LOWER(d.content) LIKE '%' || keyword || '%'
                  AND length(keyword) > 2
              )
            )
          ORDER BY similarity DESC, d."createdAt" DESC
          LIMIT ${limit}
        `;
        
        return fallbackResults;
      }

      return results;
    } catch (error) {
      console.error('Error in searchSimilarDocuments:', error);
      try {
        const fallbackResults = await prisma.$queryRaw`
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
        return fallbackResults;
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
        return [];
      }
    }
  }

  async generateRAGResponse(userId: string, query: string): Promise<{
    response: string;
    sources: any[];
    relevantDocuments: any[];
  }> {
    try {
      const relevantDocs = await this.searchSimilarDocuments(userId, query, 5, 0.3);
      
      if (!relevantDocs || relevantDocs.length === 0) {
        return {
          response: "I don't have any relevant information in your synchronized data to answer that question. Please try syncing your Gmail, HubSpot, or Calendar data first.",
          sources: [],
          relevantDocuments: []
        };
      }

      const context = (relevantDocs as any[]).map((doc, index) => {
        const metadata = doc.metadata || {};
        let sourceInfo = '';
        
        switch (doc.sourceType) {
          case 'email':
            sourceInfo = `Email from ${metadata.from || 'unknown'} on ${metadata.date ? new Date(metadata.date).toLocaleDateString() : 'unknown date'}`;
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

      const prompt = `You are an AI assistant that helps users find information from their personal data including emails, contacts, calendar events, and notes. Use the provided context to answer the user's question accurately and helpfully.

Context from user's data:
${context}

User's question: ${query}

Instructions:
- Answer based only on the information provided in the context
- If the context doesn't contain relevant information, say so clearly
- Cite specific sources when mentioning information (e.g., "According to your email from John...")
- Be conversational and helpful
- If you find relevant information, provide specific details and context

Answer:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      
      const sources = (relevantDocs as any[]).map((doc, index) => {
        const metadata = doc.metadata || {};
        return {
          id: doc.id,
          sourceType: doc.sourceType,
          title: doc.title,
          similarity: doc.similarity,
          metadata,
          preview: doc.content.substring(0, 200) + '...'
        };
      });

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
      Date: ${email.internalDate}
      
      ${email.body || email.snippet}
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
      Name: ${contact.firstname} ${contact.lastname}
      Email: ${contact.email}
      Company: ${contact.company}
      Job Title: ${contact.jobtitle}
      Phone: ${contact.phone}
      Lifecycle Stage: ${contact.lifecyclestage}
    `.trim();

    return this.createDocument(
      userId,
      'hubspot_contact',
      contact.id,
      `${contact.firstname} ${contact.lastname}`.trim(),
      content,
      {
        email: contact.email,
        company: contact.company,
        lifecyclestage: contact.lifecyclestage,
      }
    );
  }

  async processNoteForRAG(userId: string, note: any) {
    return this.createDocument(
      userId,
      'hubspot_note',
      note.id,
      'HubSpot Note',
      note.noteBody,
      {
        contactId: note.contactId,
        createdAt: note.hubspotCreatedAt,
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