import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
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

  if (req.method === 'GET') {
    try {
      const chats = await prisma.chat.findMany({
        where: { userId: user.id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return res.status(200).json(chats);
    } catch (error) {
      console.error('Error fetching chats:', error);
      return res.status(500).json({ error: 'Failed to fetch chats' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { title } = req.body;

      const chat = await prisma.chat.create({
        data: {
          userId: user.id,
          title: title || 'New Chat',
        },
      });

      return res.status(201).json(chat);
    } catch (error) {
      console.error('Error creating chat:', error);
      return res.status(500).json({ error: 'Failed to create chat' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}