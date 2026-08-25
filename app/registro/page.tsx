import { AuthShell } from '@/components/auth/auth-shell'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Crear cuenta | Detection-test',
  description: 'Registra tu cuenta profesional en Detection-test.',
}

export default function RegisterPage() {
  return <AuthShell mode="register" />
}
