import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ComponentProps } from 'react'

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-[opacity,color,background-color,border-color,box-shadow,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:size-4 [&_svg]:shrink-0'

const sizes = {
  md: 'h-10 px-4',
  lg: 'h-12 px-6 text-[0.95rem]',
} as const

const variants = {
  primary:
    'bg-gradient-to-r from-blue to-cyan text-primary-foreground hover:opacity-90 glow-blue',
  outline: 'border border-border bg-surface text-foreground hover:bg-muted',
  ghost: 'text-muted-foreground hover:text-foreground',
} as const

type CtaLinkProps = ComponentProps<typeof Link> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

/** A link styled as a button. Avoids Slot/asChild (unsupported by base-ui Button). */
export function CtaLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: CtaLinkProps) {
  return (
    <Link className={cn(base, sizes[size], variants[variant], className)} {...props} />
  )
}
