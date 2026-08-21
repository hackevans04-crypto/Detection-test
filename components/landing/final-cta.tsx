'use client'

import { CtaLink } from './cta-link'
import { ArrowRight, LogIn } from 'lucide-react'
import Image from 'next/image'
import { DetectionEmblem } from './visuals/detection-emblem'
import { NodeNetwork } from './visuals/node-network'
import { institution } from '@/data/institution'
import { developer } from '@/data/developer'

export function FinalCta() {
  return (
    <section id="recursos" className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 opacity-20">
          <NodeNetwork />
        </div>
        <div className="absolute left-1/2 top-1/2 h-[420px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue/15 blur-[130px]" />
      </div>

      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <div className="flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-2xl glass glow-cyan">
            <DetectionEmblem className="h-10 w-10" />
          </div>
        </div>

        <h2 className="mx-auto mt-8 max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl">
          Tecnología al servicio de una evaluación{' '}
          <span className="text-gradient">más clara y humana.</span>
        </h2>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <CtaLink href="/login" size="lg">
            <LogIn className="size-4" />
            Iniciar sesión
          </CtaLink>
          <CtaLink href="#plataforma" size="lg" variant="outline">
            Conocer la plataforma
            <ArrowRight className="size-4" />
          </CtaLink>
        </div>

        {/* Brand hierarchy */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-muted-foreground">
          <span className="flex items-center gap-2 text-sm">
            <DetectionEmblem className="h-6 w-6" />
            <span className="font-semibold text-foreground">Detection-test</span>
          </span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span className="flex items-center gap-2 text-sm">
            <span className="flex size-7 items-center justify-center rounded-md glass p-1">
              <Image
                src={institution.crest || '/placeholder.svg'}
                alt=""
                width={20}
                height={20}
                className="h-full w-auto object-contain"
              />
            </span>
            {institution.shortName}
          </span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <span className="text-sm">
            Desarrollado por <span className="font-medium text-foreground">{developer.name}</span>
          </span>
        </div>
      </div>
    </section>
  )
}
