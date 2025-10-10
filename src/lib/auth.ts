import { getServerSession } from 'next-auth'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'

export async function getServerAuthSession(ctx: {
  req: GetServerSidePropsContext['req']
  res: GetServerSidePropsContext['res']
}) {
  return await getServerSession(ctx.req, ctx.res, authOptions)
}

export async function requireAuth(ctx: {
  req: GetServerSidePropsContext['req']
  res: GetServerSidePropsContext['res']
}): Promise<GetServerSidePropsResult<any>> {
  const session = await getServerAuthSession(ctx)
  
  console.log('requireAuth session:', session)
  
  if (!session || !session.user) {
    console.log('No session or user, redirecting...')
    return {
      redirect: {
        destination: '/login',
        permanent: false
      }
    }
  }
  
  const sessionData = {
    user: {
      id: session.user.id || '',
      name: session.user.name || '',
      email: session.user.email || '',
      image: session.user.image || ''
    },
    expires: session.expires || '',
    accessToken: session.accessToken || ''
  }
  
  console.log('Returning session data:', sessionData)
  
  return { 
    props: { 
      session: JSON.parse(JSON.stringify(sessionData))
    } 
  }
}