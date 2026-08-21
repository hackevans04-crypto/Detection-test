import { cn } from '@/lib/utils'

/** Compact, static Detection-test emblem (split brain + network) for chrome/UI. */
export function DetectionEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn('h-9 w-9', className)} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="de-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0879f9" />
          <stop offset="100%" stopColor="#09c6d9" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="44" stroke="url(#de-line)" strokeWidth="2.5" strokeOpacity="0.7" />
      {/* left brain */}
      <path
        d="M50 20 C36 19 27 27 26 37 C17 40 15 52 24 58 C20 68 28 78 40 77 C43 82 50 82 50 80 Z"
        fill="#0a2e63"
        stroke="#0879f9"
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <path d="M50 30 C40 33 38 43 44 48" stroke="#1c4b8a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M50 55 C40 58 38 68 46 72" stroke="#1c4b8a" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* right network */}
      <path d="M50 20 C64 19 73 27 74 37 C83 40 85 52 76 58 C80 68 72 78 60 77 C57 82 50 82 50 80"
        stroke="url(#de-line)" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
      {[
        [62, 32], [72, 44], [58, 50], [72, 60], [60, 70],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#09c6d9" />
      ))}
      <path d="M62 32 L72 44 M62 32 L58 50 M72 44 L58 50 M58 50 L72 60 M58 50 L60 70 M72 60 L60 70"
        stroke="url(#de-line)" strokeWidth="1.4" strokeOpacity="0.7" />
    </svg>
  )
}
