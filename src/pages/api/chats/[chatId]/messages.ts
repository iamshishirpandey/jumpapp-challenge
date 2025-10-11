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


  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      userId: user.id,
    },
  });

  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }

  if (req.method === 'POST') {
    try {
      const { role, content } = req.body;

      if (!role || !content) {
        return res.status(400).json({ error: 'Role and content are required' });
      }

      const message = await prisma.message.create({
        data: {
          chatId,
          role,
          content,
        },
      });


      await prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() },
      });


      if (!chat.title && role === 'user') {
        const firstWords = content.slice(0, 50);
        await prisma.chat.update({
          where: { id: chatId },
          data: { title: firstWords },
        });
      }

      return res.status(201).json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      return res.status(500).json({ error: 'Failed to create message' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}