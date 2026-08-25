import { AuthShell } from '@/components/auth/auth-shell'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Iniciar sesion | Detection-test',
  description: 'Accede a la plataforma Detection-test.',
}

export default function LoginPage() {
  return <AuthShell mode="login" />
}
