import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { EmbeddingService } from '@/lib/services/embeddings';

function getGreetingResponse(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  if (lowerQuery.includes('good morning')) {
    return "Good morning! How can I help you today?";
  } else if (lowerQuery.includes('good afternoon')) {
    return "Good afternoon! How can I assist you?";
  } else if (lowerQuery.includes('good evening')) {
    return "Good evening! What can I help you with?";
  } else if (lowerQuery.includes('how are you') || lowerQuery.includes('how\'s it going') || lowerQuery.includes('what\'s up')) {
    return "I'm doing well, thank you! I'm here to help you find information from your emails, contacts, and calendar. What would you like to know?";
  } else if (lowerQuery.includes('thanks') || lowerQuery.includes('thank you')) {
    return "You're welcome! Is there anything else I can help you with?";
  } else if (lowerQuery.includes('bye') || lowerQuery.includes('goodbye')) {
    return "Goodbye! Feel free to come back anytime if you need help finding information.";
  } else {
    return "Hi there! I'm here to help you find information from your emails, contacts, and calendar. What would you like to know?";
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { query, limit = 5, threshold = 0.3, chatId } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    const greetingPatterns = [
      /^(hi|hello|hey|good morning|good afternoon|good evening)$/i,
      /^(hi|hello|hey)\s*[!.]*$/i,
      /^(how are you|how's it going|what's up)\s*[?!.]*$/i,
      /^(thanks|thank you|bye|goodbye)\s*[!.]*$/i
    ];

    const isGreeting = greetingPatterns.some(pattern => pattern.test(query.trim()));
    
    if (chatId) {
      try {
        await prisma.message.create({
          data: {
            chatId,
            role: 'user',
            content: query,
          },
        });

        await prisma.chat.update({
          where: { id: chatId },
          data: { updatedAt: new Date() },
        });
      } catch (error) {
      }
    }

    if (isGreeting) {
      const greetingResponse = getGreetingResponse(query.trim());
      
      if (chatId) {
        try {
          await prisma.message.create({
            data: {
              chatId,
              role: 'assistant', 
              content: greetingResponse,
            },
          });
        } catch (error) {
        }
      }

      return res.status(200).json({
        success: true,
        results: [],
        query,
        resultsCount: 0,
        response: greetingResponse,
        chatId,
      });
    }

    const embeddingService = new EmbeddingService();
    

    let searchChatHistory: any[] = [];
    if (chatId) {
      try {
        const chat = await prisma.chat.findFirst({
          where: {
            id: chatId,
            userId: user.id,
          },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 8, 
            },
          },
        });
        searchChatHistory = chat?.messages || [];
      } catch (error) {
       console.log(error)
      }
    }
    
    const results: any = await embeddingService.searchSimilarDocuments(
      user.id,
      query,
      limit,
      threshold,
      searchChatHistory
    );

    const enrichedResults = await Promise.all(
      (results as any[]).map(async (doc: any) => {
        let sourceData = null;
        
        switch (doc.sourceType) {
          case 'email':
            sourceData = await prisma.email.findUnique({
              where: { id: doc.sourceId },
              select: {
                subject: true,
                from: true,
                to: true,
                internalDate: true,
                snippet: true,
              },
            });
            break;
          case 'hubspot_contact':
            sourceData = await prisma.hubSpotContact.findUnique({
              where: { id: doc.sourceId },
              select: {
                firstname: true,
                lastname: true,
                email: true,
                company: true,
                jobtitle: true,
              },
            });
            break;
          case 'hubspot_note':
            sourceData = await prisma.hubSpotNote.findUnique({
              where: { id: doc.sourceId },
              select: {
                noteBody: true,
                hubspotCreatedAt: true,
                contact: {
                  select: {
                    firstname: true,
                    lastname: true,
                    email: true,
                  },
                },
              },
            });
            break;
          case 'calendar_event':
            sourceData = await prisma.calendarEvent.findUnique({
              where: { id: doc.sourceId },
              select: {
                summary: true,
                description: true,
                startDateTime: true,
                endDateTime: true,
                location: true,
                attendees: true,
              },
            });
            break;
        }

        return {
          ...doc,
          sourceData,
        };
      })
    );

    
    let aiResponse = '';
    
    if (enrichedResults.length > 0) {
      try {
        let chatHistory: any[] = [];
        if (chatId) {
          try {
            const chat = await prisma.chat.findFirst({
              where: {
                id: chatId,
                userId: user.id,
              },
              include: {
                messages: {
                  orderBy: { createdAt: 'asc' },
                  take: 10, 
                },
              },
            });
            chatHistory = chat?.messages || [];
          } catch (error) {
      console.log(error)
          }
        }

        const ragResponse = await embeddingService.generateRAGResponse(user.id, query, chatHistory);
        aiResponse = ragResponse.response;
        
        if (ragResponse.sources && ragResponse.sources.length > 0) {
          return res.status(200).json({
            success: true,
            results: enrichedResults,
            query,
            resultsCount: enrichedResults.length,
            response: aiResponse,
            sources: ragResponse.sources,
            toolsUsed: ragResponse.toolsUsed,
            chatId,
          });
        }
      } catch (ragError) {
        aiResponse = `Found ${enrichedResults.length} relevant results for your query.`;
      }
    } else {
      aiResponse = 'No relevant results found for your query. Try syncing your data first.';
    }

    if (chatId) {
      try {
        await prisma.message.create({
          data: {
            chatId,
            role: 'assistant',
            content: aiResponse,
          },
        });
      } catch (error) {
      }
    }

    return res.status(200).json({
      success: true,
      results: enrichedResults,
      query,
      resultsCount: enrichedResults.length,
      response: aiResponse,
      chatId,
    });
  } catch (error) {
    return res.status(500).json({ 
      error: 'Search failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}