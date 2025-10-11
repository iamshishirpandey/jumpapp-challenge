import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { prisma } from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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

  const chatId = req.query.chatId as string;

  if (req.method === 'GET') {
    try {
      const chat = await prisma.chat.findFirst({
        where: {
          id: chatId,
          userId: user.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }

      return res.status(200).json(chat);
    } catch (error) {
      console.error('Error fetching chat:', error);
      return res.status(500).json({ error: 'Failed to fetch chat' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { title } = req.body;

      const chat = await prisma.chat.update({
        where: {
          id: chatId,
        },
        data: {
          title,
        },
      });

      return res.status(200).json(chat);
    } catch (error) {
      console.error('Error updating chat:', error);
      return res.status(500).json({ error: 'Failed to update chat' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.chat.delete({
        where: {
          id: chatId,
        },
      });

      return res.status(204).end();
    } catch (error) {
      console.error('Error deleting chat:', error);
      return res.status(500).json({ error: 'Failed to delete chat' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}