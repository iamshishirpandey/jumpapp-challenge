import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmbeddingService } from '@/lib/services/embeddings'
import { LLMService, ChatMessage } from '@/lib/services/llm'
import { toolRegistry } from '@/lib/tools/registry'
import { ensureToolsSetup } from '@/lib/tools/setup'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const session = await getServerSession(req, res, authOptions)
    if (!session?.user?.email) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    ensureToolsSetup()

    const { message, chatId, conversationHistory } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const embeddingService = new EmbeddingService()
    const llmService = new LLMService()

    const ragResult = await embeddingService.generateRAGResponse(user.id, message)

    const messages: ChatMessage[] = [
      ...(conversationHistory || []),
      { role: 'user', parts: [{ text: message }] }
    ]

    let response = await llmService.generateResponse(messages, user.id, ragResult.sources)

    if (response.needsToolExecution && response.toolCalls) {
      const toolResults = await Promise.allSettled(
        response.toolCalls.map(toolCall => 
          toolRegistry.executeTool(toolCall, user.id)
        )
      )

      const processedResults = toolResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return {
            ...result.value,
            toolName: response.toolCalls![index].name
          }
        } else {
          return {
            toolCallId: response.toolCalls![index].id,
            toolName: response.toolCalls![index].name,
            result: null,
            error: result.reason?.message || 'Unknown error',
            success: false
          }
        }
      })

      const assistantMessageWithTools: ChatMessage = {
        role: 'model',
        parts: [
          { text: response.message },
          ...response.toolCalls.map(tc => ({
            functionCall: {
              name: tc.name,
              args: tc.parameters
            }
          }))
        ]
      }

      const updatedMessages = [...messages, assistantMessageWithTools]

      const finalResponse = await llmService.continueConversationWithToolResults(
        updatedMessages,
        processedResults,
        ragResult.sources
      )

      if (chatId) {
        await prisma.message.createMany({
          data: [
            {
              chatId,
              role: 'user',
              content: message
            },
            {
              chatId,
              role: 'assistant',
              content: finalResponse.message
            }
          ]
        })
      }

      return res.status(200).json({
        success: true,
        response: finalResponse.message,
        sources: ragResult.sources,
        toolsUsed: response.toolCalls,
        toolResults: processedResults,
        relevantDocuments: ragResult.relevantDocuments
      })
    }

    if (chatId) {
      await prisma.message.createMany({
        data: [
          {
            chatId,
            role: 'user',
            content: message
          },
          {
            chatId,
            role: 'assistant',
            content: response.message
          }
        ]
      })
    }

    return res.status(200).json({
      success: true,
      response: response.message,
      sources: ragResult.sources,
      relevantDocuments: ragResult.relevantDocuments
    })

  } catch (error) {
    console.error('Chat agent error:', error)
    return res.status(500).json({ 
      error: 'Failed to generate response', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    })
  }
}