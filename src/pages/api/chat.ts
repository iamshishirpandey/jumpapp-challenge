import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/prisma';
import { EmbeddingService } from '@/lib/services/embeddings';
import { LLMService, ChatMessage } from '@/lib/services/llm';
import { toolRegistry } from '@/lib/tools/registry';
import { ensureToolsSetup } from '@/lib/tools/setup';

async function getEnrichedResults(sources: any[]) {
  if (!sources || sources.length === 0) return [];

  const enrichedResults = await Promise.all(
    sources.map(async (doc: any) => {
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
        preview: doc.content ? doc.content.substring(0, 200) : '', // Add preview field
        title: doc.title || (sourceData?.subject || sourceData?.summary || ''), // Ensure title is present
        // Add specific metadata based on source type
        ...(doc.sourceType === 'email' && sourceData ? {
          metadata: {
            from: sourceData.from,
            date: sourceData.internalDate,
            subject: sourceData.subject
          },
          gmailId: doc.sourceId
        } : {}),
        ...(doc.sourceType === 'calendar_event' && sourceData ? {
          metadata: {
            startDateTime: sourceData.startDateTime,
            endDateTime: sourceData.endDateTime,
            location: sourceData.location,
            attendees: sourceData.attendees
          }
        } : {}),
        ...(doc.sourceType === 'hubspot_contact' && sourceData ? {
          metadata: {
            email: sourceData.email,
            company: sourceData.company,
            jobtitle: sourceData.jobtitle
          }
        } : {})
      };
    })
  );

  return enrichedResults;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      ensureToolsSetup();

      const { message, chatId, conversationHistory } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Save the user message to database
      let savedUserMessage;
      if (chatId && chatId !== 'new') {
        try {
          savedUserMessage = await prisma.message.create({
            data: {
              chatId,
              role: 'user',
              content: message,
            },
          });
          
          // Update chat timestamp
          await prisma.chat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() },
          });
        } catch (error) {
          console.error('Error saving user message:', error);
        }
      }

      const embeddingService = new EmbeddingService();
      const llmService = new LLMService();

      const ragResult = await embeddingService.generateRAGResponse(user.id, message);

      // Clean and validate conversation history
      const cleanHistory = (conversationHistory || []).filter((msg: any) => {
        return msg && msg.role && msg.parts && Array.isArray(msg.parts) && 
               ['user', 'model', 'function', 'system'].includes(msg.role);
      }).map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role, // Convert assistant to model
        parts: msg.parts
      }));

      const messages: ChatMessage[] = [
        ...cleanHistory,
        { role: 'user', parts: [{ text: message }] }
      ];

      let response;
      try {
        console.log('🤖 Calling LLM with messages:', messages.length);
        response = await llmService.generateResponse(messages, user.id, ragResult.sources);
        console.log('🤖 LLM response:', { needsToolExecution: response.needsToolExecution, toolCallsCount: response.toolCalls?.length || 0 });
      } catch (llmError: any) {
        console.error('LLM error, falling back to RAG only:', llmError.message);
        // Fallback to RAG-only response if LLM fails
        return res.status(200).json({
          success: true,
          response: ragResult.response || 'I found some relevant information for you.',
          sources: ragResult.sources,
          relevantDocuments: ragResult.relevantDocuments
        });
      }

      if (response.needsToolExecution && response.toolCalls) {
        console.log('🔧 Executing tools:', response.toolCalls.map(tc => ({ name: tc.name, id: tc.id })));
        const toolResults = await Promise.allSettled(
          response.toolCalls.map(toolCall => {
            console.log(`🔧 Executing tool: ${toolCall.name} with params:`, toolCall.parameters);
            return toolRegistry.executeTool(toolCall, user.id);
          })
        );
        console.log('🔧 Tool results:', toolResults.map((r, i) => ({ 
          index: i, 
          status: r.status, 
          success: r.status === 'fulfilled' ? r.value?.success : false,
          error: r.status === 'rejected' ? r.reason?.message : undefined
        })));

        const processedResults = toolResults.map((result, index) => {
          if (result.status === 'fulfilled') {
            return {
              ...result.value,
              toolName: response.toolCalls![index].name
            };
          } else {
            return {
              toolCallId: response.toolCalls![index].id,
              toolName: response.toolCalls![index].name,
              result: null,
              error: result.reason?.message || 'Unknown error',
              success: false
            };
          }
        });

        // Handle sent emails for RAG sync
        const emailTools = processedResults.filter(r => r.success && r.toolName === 'send_email');
        if (emailTools.length > 0) {
          for (const emailTool of emailTools) {
            try {
              const emailData = {
                gmailId: emailTool.result.messageId,
                threadId: emailTool.result.messageId,
                from: session.user.email!,
                to: [response.toolCalls!.find(tc => tc.name === 'send_email')?.parameters.to].filter(Boolean),
                subject: response.toolCalls!.find(tc => tc.name === 'send_email')?.parameters.subject || 'Email via AI Assistant',
                body: response.toolCalls!.find(tc => tc.name === 'send_email')?.parameters.body || '',
                snippet: response.toolCalls!.find(tc => tc.name === 'send_email')?.parameters.body?.substring(0, 100) || '',
                internalDate: new Date(),
                isRead: true,
                isStarred: false,
                isImportant: false,
                labelIds: ['SENT']
              };

              // Save to database
              const savedEmail = await prisma.email.create({
                data: {
                  ...emailData,
                  userId: user.id
                }
              });

              // Process for RAG
              await embeddingService.processEmailForRAG(user.id, savedEmail);
            } catch (syncError) {
              console.error('Error syncing sent email:', syncError);
            }
          }
        }

        const successfulTools = processedResults.filter(r => r.success);
        const failedTools = processedResults.filter(r => !r.success);
        
        let finalMessage = '';
        if (successfulTools.length > 0) {
          const toolNames = successfulTools.map(r => r.toolName).join(', ');
          finalMessage = `✅ Successfully executed: ${toolNames}\n`;
          
          successfulTools.forEach(tool => {
            if (tool.result && tool.result.message) {
              finalMessage += `${tool.result.message}\n`;
            }
          });
        }
        
        if (failedTools.length > 0) {
          finalMessage += `❌ Failed to execute: ${failedTools.map(r => r.toolName).join(', ')}`;
        }

        // Get enriched results for card display from relevantDocuments
        const enrichedResults = await getEnrichedResults(ragResult.relevantDocuments || []);

        const emailCards = emailTools.map(tool => ({
          type: 'email_sent',
          messageId: tool.result.messageId,
          to: response.toolCalls!.find(tc => tc.name === 'send_email')?.parameters.to,
          subject: response.toolCalls!.find(tc => tc.name === 'send_email')?.parameters.subject,
          body: response.toolCalls!.find(tc => tc.name === 'send_email')?.parameters.body,
          timestamp: new Date().toISOString()
        }));

        const finalMessageText = finalMessage || 'Tasks completed successfully.';

        // Save assistant response to database
        if (chatId && chatId !== 'new') {
          try {
            await prisma.message.create({
              data: {
                chatId,
                role: 'assistant',
                content: finalMessageText,
                metadata: {
                  sources: enrichedResults,
                  emailCards: emailCards,
                  toolsUsed: response.toolCalls,
                  toolResults: processedResults,
                  relevantDocuments: ragResult.relevantDocuments,
                  resultsCount: enrichedResults.length
                }
              },
            });
          } catch (error) {
            console.error('Error saving assistant message:', error);
          }
        }

        return res.status(200).json({
          success: true,
          response: finalMessageText,
          sources: enrichedResults, // Put enriched results in sources for card display
          results: enrichedResults,
          resultsCount: enrichedResults.length,
          toolsUsed: response.toolCalls,
          toolResults: processedResults,
          relevantDocuments: ragResult.relevantDocuments,
          emailCards: emailCards
        });
      }

      // For non-tool responses, combine LLM response with RAG if available
      let finalResponse = response.message;
      
      // If LLM response is empty/generic and we have RAG results, prefer RAG response
      if ((!finalResponse || finalResponse.includes('I apologize') || finalResponse.includes('could not generate')) && ragResult.response) {
        finalResponse = ragResult.response;
      }

      // Get enriched results for card display from relevantDocuments (which contains the pgvector results)
      const enrichedResults = await getEnrichedResults(ragResult.relevantDocuments || []);

      // Save assistant response to database
      if (chatId && chatId !== 'new') {
        try {
          await prisma.message.create({
            data: {
              chatId,
              role: 'assistant',
              content: finalResponse,
              metadata: {
                sources: enrichedResults,
                relevantDocuments: ragResult.relevantDocuments,
                resultsCount: enrichedResults.length
              }
            },
          });
        } catch (error) {
          console.error('Error saving assistant message:', error);
        }
      }

      return res.status(200).json({
        success: true,
        response: finalResponse,
        sources: enrichedResults, // Put enriched results in sources for card display
        results: enrichedResults,
        resultsCount: enrichedResults.length,
        relevantDocuments: ragResult.relevantDocuments
      });
    } catch (error) {
      console.error('Chat API error:', error);
      return res.status(500).json({ 
        error: 'Failed to generate response', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}