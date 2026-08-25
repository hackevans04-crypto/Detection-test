'use client'

import { DetectionEmblem } from '@/components/landing/visuals/detection-emblem'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

type AuthMode = 'login' | 'register'

const profiles = [
  'Psicopedagogo/a',
  'Docente',
  'Orientador/a DECE',
  'Coordinador/a academico',
  'Investigador/a',
]

function BrandHeader() {
  return (
    <header className="auth-brand">
      <Link href="/" className="auth-brand-mark" aria-label="Detection-test">
        <DetectionEmblem className="h-14 w-14" />
        <span>
          <strong>Detection</strong>
          <small>EVALUACION · ANALISIS · INCLUSION</small>
        </span>
      </Link>

      <Link href="/" className="auth-back">
        <ArrowLeft className="size-4" />
        Volver al inicio
      </Link>
    </header>
  )
}

function Hologram({ mode }: { mode: AuthMode }) {
  const isRegister = mode === 'register'

  return (
    <div className={`auth-hologram ${isRegister ? 'auth-hologram-register' : ''}`} aria-hidden="true">
      <div className="auth-orbit auth-orbit-a" />
      <div className="auth-orbit auth-orbit-b" />
      <div className="auth-orbit auth-orbit-c" />
      {isRegister ? (
        <Image
          src="/detection-home/auth/register-hologram.png"
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 82vw, 39vw"
          className="auth-register-hologram-image object-contain"
        />
      ) : (
        <Image
          src="/detection-home/hero/brain-hologram-platform.png"
          alt=""
          fill
          priority
          sizes="(max-width: 900px) 86vw, 46vw"
          className="object-contain"
        />
      )}
      <div className="auth-holo-core" />
      <div className="auth-light-column" />
    </div>
  )
}

function PasswordInput({
  id,
  placeholder,
  autoComplete,
}: {
  id: string
  placeholder: string
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="auth-input-wrap">
      <Lock className="auth-input-icon" />
      <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder} />
      <button
        type="button"
        className="auth-field-action"
        aria-label={visible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

function Field({
  id,
  label,
  type = 'text',
  icon,
  placeholder,
  autoComplete,
}: {
  id: string
  label: string
  type?: string
  icon: React.ReactNode
  placeholder: string
  autoComplete?: string
}) {
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <div className="auth-input-wrap">
        <span className="auth-input-icon">{icon}</span>
        <input id={id} type={type} autoComplete={autoComplete} placeholder={placeholder} />
      </div>
    </label>
  )
}

function LoginForm() {
  return (
    <form className="auth-form" action="/dashboard">
      <Field
        id="email"
        label="Correo electronico"
        type="email"
        icon={<Mail className="size-4" />}
        autoComplete="email"
        placeholder="Ingresa tu correo electronico"
      />

      <label className="auth-field" htmlFor="password">
        <span>Contrasena</span>
        <PasswordInput id="password" autoComplete="current-password" placeholder="Ingresa tu contrasena" />
      </label>

      <div className="auth-row auth-row-between">
        <label className="auth-check">
          <input type="checkbox" />
          <span>Recordarme</span>
        </label>
        <Link href="/login" className="auth-link">
          ¿Olvidaste tu contrasena?
        </Link>
      </div>

      <button className="auth-submit" type="submit">
        <UsersRound className="size-5" />
        Iniciar sesion
        <ArrowRight className="auth-submit-arrow size-5" />
      </button>
    </form>
  )
}

function RegisterForm() {
  return (
    <form className="auth-form auth-form-register" action="/dashboard">
      <div className="auth-form-grid">
        <Field
          id="name"
          label="Nombre completo"
          icon={<User className="size-4" />}
          autoComplete="name"
          placeholder="Ingresa tu nombre completo"
        />
        <Field
          id="register-email"
          label="Correo electronico"
          type="email"
          icon={<Mail className="size-4" />}
          autoComplete="email"
          placeholder="Ingresa tu correo electronico"
        />
        <label className="auth-field" htmlFor="register-password">
          <span>Contrasena</span>
          <PasswordInput id="register-password" autoComplete="new-password" placeholder="Crea una contrasena" />
        </label>
        <label className="auth-field" htmlFor="confirm-password">
          <span>Confirmar contrasena</span>
          <PasswordInput id="confirm-password" autoComplete="new-password" placeholder="Confirma tu contrasena" />
        </label>
      </div>

      <label className="auth-field auth-field-full" htmlFor="profile">
        <span>Perfil profesional</span>
        <div className="auth-input-wrap">
          <UsersRound className="auth-input-icon" />
          <select id="profile" defaultValue="">
            <option value="" disabled>
              Selecciona tu perfil profesional
            </option>
            {profiles.map((profile) => (
              <option key={profile}>{profile}</option>
            ))}
          </select>
          <ChevronDown className="auth-select-icon size-4" />
        </div>
      </label>

      <div className="auth-form-grid">
        <Field
          id="institution"
          label="Institucion (opcional)"
          icon={<Building2 className="size-4" />}
          placeholder="Nombre de la institucion"
        />
        <Field
          id="phone"
          label="Telefono (opcional)"
          type="tel"
          icon={<Phone className="size-4" />}
          autoComplete="tel"
          placeholder="Ingresa tu numero de telefono"
        />
      </div>

      <label className="auth-check auth-terms">
        <input type="checkbox" />
        <span>
          Acepto los <Link href="/registro">Terminos de servicio</Link> y la{' '}
          <Link href="/registro">Politica de privacidad</Link>
        </span>
      </label>

      <button className="auth-submit" type="submit">
        <UserRoundPlus className="size-5" />
        Crear cuenta
        <ArrowRight className="auth-submit-arrow size-5" />
      </button>
    </form>
  )
}

const loginFeatures = [
  {
    icon: <ShieldCheck className="size-7" />,
    title: 'Seguridad de datos',
    text: 'Protegemos tu informacion con altos estandares',
  },
  {
    icon: <Lock className="size-7" />,
    title: 'Evaluacion integral',
    text: 'Procesos psicopedagogicos con tecnologia avanzada',
  },
  {
    icon: <BarChart3 className="size-7" />,
    title: 'Analisis inteligente',
    text: 'Resultados precisos para mejores decisiones',
  },
  {
    icon: <UsersRound className="size-7" />,
    title: 'Inclusion educativa',
    text: 'Comprometidos con la igualdad de oportunidades',
  },
]

export function AuthShell({ mode }: { mode: AuthMode }) {
  const isRegister = mode === 'register'

  return (
    <main className={`auth-page ${isRegister ? 'auth-page-register' : ''}`}>
      <div className="auth-bg">
        <Image
          src="/detection-home/hero/background-mountains-night.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <Image src="/detection-home/hero/starfield-particles.png" alt="" fill sizes="100vw" className="auth-stars object-cover" />
        <Image src="/detection-home/hero/tech-network.png" alt="" fill sizes="100vw" className="auth-network object-cover" />
        <Image src="/detection-home/hero/fog-back.png" alt="" fill sizes="100vw" className="auth-fog auth-fog-back object-cover" />
        <Image src="/detection-home/hero/fog-front.png" alt="" fill sizes="100vw" className="auth-fog auth-fog-front object-cover" />
        <div className="auth-veil" />
        <div className="auth-scanlines" />
      </div>

      <div className={`auth-shell ${isRegister ? 'auth-register-shell' : 'auth-login-shell'}`}>
        <BrandHeader />

        <section className={isRegister ? 'auth-hero' : 'auth-login-stage'}>
          {isRegister ? (
            <>
              <div className="auth-copy">
                <p>Unete a Detection-test</p>
                <h1>
                  Crea tu cuenta <br />y <span>comienza</span>
                </h1>
                <small>
                  Forma parte de una plataforma inteligente disenada para profesionales que evaluan, analizan y acompanan
                  procesos psicopedagogicos.
                </small>
              </div>
              <Hologram mode={mode} />
            </>
          ) : (
            <Hologram mode={mode} />
          )}
        </section>

        <section className={`auth-card ${isRegister ? 'auth-card-wide' : 'auth-login-card'}`}>
          {!isRegister && (
            <div className="auth-card-heading">
              <p>Bienvenido de nuevo</p>
              <h1>
                Inicia sesion en <br />tu <span>cuenta</span>
              </h1>
            </div>
          )}

          {isRegister ? <RegisterForm /> : <LoginForm />}

          <div className="auth-divider">
            <span />
            <p>o continua con</p>
            <span />
          </div>

          <div className="auth-socials">
            <button type="button" className="auth-social auth-google">
              <span>G</span>
              Google
            </button>
            <button type="button" className="auth-social auth-microsoft">
              <span />
              Microsoft
            </button>
          </div>

          <p className="auth-switch">
            {isRegister ? '¿Ya tienes una cuenta?' : '¿No tienes una cuenta?'}{' '}
            <Link href={isRegister ? '/login' : '/registro'}>
              {isRegister ? 'Inicia sesion aqui' : 'Registrate aqui'}
            </Link>
          </p>
        </section>

        <section className="auth-login-features" aria-label="Beneficios de la plataforma">
          {loginFeatures.map((feature) => (
            <article key={feature.title} className="auth-login-feature">
              {feature.icon}
              <span>
                <strong>{feature.title}</strong>
                <small>{feature.text}</small>
              </span>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
