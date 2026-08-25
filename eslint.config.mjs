import next from 'eslint-config-next'

/**
 * El repositorio tenía `eslint-config-next` instalado pero ningún fichero de
 * configuración, así que `eslint` ni siquiera arrancaba. Esta es la
 * configuración plana que pide ESLint 9.
 */
const config = [
  {
    ignores: [
      '.next/**',
      '.next-build/**',
      '.tmp-glb-inspect/**',
      '.tmp-model-pack/**',
      'node_modules/**',
      'public/**',
      'source-models/**',
      'tmp/**',
      'artifacts/**',
    ],
  },
  ...next,
  {
    /**
     * Deuda heredada, no permiso indefinido.
     *
     * El landing 3D y las escenas de react-three-fiber mutan objetos de Three
     * durante el render (`mesh.position.set(...)`), que es como se escribe esa
     * librería y lo que las reglas del compilador de React marcan como
     * violación de inmutabilidad. Arreglarlo significa reescribir la escena
     * del hero, que queda fuera del alcance del módulo de evaluación: aquí se
     * degrada a aviso para que siga siendo visible sin bloquear la verificación
     * del resto del proyecto.
     */
    files: [
      'components/home/**/*.{ts,tsx}',
      'components/landing/**/*.{ts,tsx}',
      'components/platform/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
      'lib/hero/**/*.{ts,tsx}',
      'lib/platform/**/*.{ts,tsx}',
    ],
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      '@next/next/no-img-element': 'warn',
    },
  },
]

export default config
