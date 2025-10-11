import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname
        const publicRoutes = ['/login', '/auth/signin', '/auth/error']
        if (publicRoutes.includes(pathname)) {
          return true
        }
        return !!token
      }
    },
    pages: {
      signIn: '/login',
      error: '/auth/error'
    }
  }
)
export const config = {
  matcher: [

    '/((?!api/auth|_next/static|_next/image|favicon.ico|assets|public).*)',
  ],
}