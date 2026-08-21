import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Detection-test | Evaluación · Análisis · Inclusión',
  description:
    'Detection-test es un entorno digital para organizar, analizar y acompañar procesos de evaluación psicopedagógica, desarrollado por Olbrox Tech para la Universidad Técnica Estatal de Quevedo.',
  generator: 'v0.app',
  keywords: [
    'evaluación psicopedagógica',
    'Detection-test',
    'UTEQ',
    'Olbrox Tech',
    'inclusión educativa',
  ],
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#020817',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`dark ${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-background text-foreground antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
