import '@/styles/globals.css'
import { Inter } from 'next/font/google'
import type { AppProps } from 'next/app'
import { HeroUIProvider } from '@heroui/react'
import { SessionProvider } from 'next-auth/react'

const inter = Inter({ subsets: ['latin'] })

export default function App({ 
  Component, 
  pageProps: { session, ...pageProps } 
}: AppProps) {
  return (
    <SessionProvider session={session}>
      <HeroUIProvider>
        <main className={inter.className}>
          <Component {...pageProps} />
        </main>
      </HeroUIProvider>
    </SessionProvider>
  )
}
