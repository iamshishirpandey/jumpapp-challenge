import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '@/lib/prisma';

export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private embeddingModel: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    this.embeddingModel = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const result = await this.embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
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
      console.error('Error generating summary:', error);
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
      console.log(`Creating document for ${sourceType} with ID ${sourceId}`);
      

      const embedText = `${title || ''} ${content}`.trim().substring(0, 3000); 
      console.log(`Generating embedding for text (length: ${embedText.length})`);
      
      let embeddingString = null;
      try {
        const embedding = await this.generateEmbedding(embedText);
        embeddingString = `[${embedding.join(',')}]`;
        console.log(`Successfully generated embedding (dimension: ${embedding.length})`);
      } catch (embedError) {
        console.error('Failed to generate embedding, storing without vector:', embedError);
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
        ON CONFLICT ("sourceType", "sourceId")
        DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          embedding = EXCLUDED.embedding,
          "updatedAt" = NOW()
        RETURNING id
      `;

      console.log(`Successfully created/updated document for ${sourceType}: ${sourceId}`);
      return document;
    } catch (error) {
      console.error(`Error creating document for ${sourceType} ${sourceId}:`, error);
      throw error;
    }
  }

  // Vector similarity search using pgvector
  async searchSimilarDocuments(
    userId: string,
    query: string,
    limit: number = 10,
    threshold: number = 0.5
  ) {
    try {

      let useVectorSearch = true;
      let queryEmbeddingString = null;
      
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        queryEmbeddingString = `[${queryEmbedding.join(',')}]`;
        console.log('Generated query embedding successfully');
      } catch (embedError) {
        console.error('Failed to generate query embedding:', embedError);
        useVectorSearch = false;
      }
      
      if (useVectorSearch && queryEmbeddingString) {
        // Use cosine similarity search with pgvector
        const results = await prisma.$queryRaw`
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
          console.log(`Found ${(results as any[]).length} results with vector search`);
          return results;
        }
      }

      // If no results with vector search fallback to text search
      if (!results || (results as any[]).length === 0) {
        console.log('No vector results found, falling back to text search');
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
            ts_rank(
              to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')),
              plainto_tsquery('english', ${query})
            ) as similarity
          FROM "Document"
          WHERE "userId" = ${userId}
            AND to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')) @@ plainto_tsquery('english', ${query})
          ORDER BY similarity DESC
          LIMIT ${limit}
        `;
        return fallbackResults;
      }

      return results;
    } catch (error) {
      console.error('Error searching documents:', error);
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

  // Generate RAG response using relevant context
  async generateRAGResponse(userId: string, query: string): Promise<{
    response: string;
    sources: any[];
    relevantDocuments: any[];
  }> {
    try {

      const relevantDocs = await this.searchSimilarDocuments(userId, query, 5, 0.5);
      
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
      console.error('Error analyzing content:', error);
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