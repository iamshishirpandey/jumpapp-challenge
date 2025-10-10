import '@/styles/globals.css'
import { Inter } from 'next/font/google'
import type { AppProps } from 'next/app'
import { HeroUIProvider } from '@heroui/react'

const inter = Inter({ subsets: ['latin'] })
export default function App({ Component, pageProps }: AppProps) {
  return (
    <HeroUIProvider>
      <main className={inter.className}>
        <Component {...pageProps} />
      </main>
    </HeroUIProvider>
  )
}
