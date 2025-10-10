import 'next-auth'

declare module 'next-auth' {
  interface Session {
    session: {
      user: {
        id: string
        name: string
        email: string
        image?: string
      }
      expires: string
    }
    accessToken?: string
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
  }

  interface JWT {
    accessToken?: string
    refreshToken?: string
    id?: string
  }
}