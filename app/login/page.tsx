import { Button } from '@/components/ui/button'
import { DetectionEmblem } from '@/components/landing/visuals/detection-emblem'
import { NodeNetwork } from '@/components/landing/visuals/node-network'
import { ArrowLeft, Lock, Mail } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Iniciar sesión | Detection-test',
  description: 'Accede a la plataforma Detection-test.',
}

export default function LoginPage() {
  return (
    <main className="login-stage relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid bg-grid-fade" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-25">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2">
          <NodeNetwork />
        </div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-blue/15 blur-[130px]" />

      <div className="w-full max-w-md">
        <Link
          href="/"
          className="login-enter login-back mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a la experiencia
        </Link>

        <div className="login-panel rounded-3xl glass-strong p-8 glow-blue">
          <div className="flex flex-col items-center text-center">
            <div className="login-enter login-mark flex size-14 items-center justify-center rounded-2xl glass">
              <DetectionEmblem className="h-9 w-9" />
            </div>
            <h1 className="login-enter login-title mt-5 font-display text-2xl font-bold tracking-tight text-foreground">
              Bienvenido de nuevo
            </h1>
            <p className="login-enter login-title mt-2 text-sm text-muted-foreground">
              Ingresa a tu cuenta de Detection-test
            </p>
          </div>

          <form className="login-enter login-form mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  className="w-full rounded-lg border border-input bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-cyan focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-input bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-cyan focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="mt-2 h-11 w-full bg-gradient-to-r from-blue to-cyan text-primary-foreground hover:opacity-90"
            >
              Iniciar sesión
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            El sistema interno se habilitará en una fase posterior.
          </p>
        </div>
      </div>
    </main>
  )
}
