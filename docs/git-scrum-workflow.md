# Flujo de trabajo Scrum y Git

## Rama actual preparada

- Repositorio: `hackevans04-crypto/Detection-test`
- Rama: `feature/auth-dashboard`
- Base: `origin/main`
- Estrategia: Pull Request hacia `main`

## Reglas de trabajo

1. Cada historia de usuario o tarea tecnica del sprint debe vivir en una rama `feature/*` o `fix/*`.
2. `main` debe mantenerse estable y protegida.
3. Antes de abrir un Pull Request, ejecutar:

```bash
npx.cmd tsc --noEmit
npx.cmd vitest run lib/evaluation-engine.test.ts
npm.cmd run build
```

4. El Pull Request debe incluir:

- Objetivo de la tarea.
- Capturas o pasos de prueba cuando aplique.
- Riesgos o limitaciones.
- Checklist de verificacion.

## Sincronizar una rama con main

```bash
git checkout main
git pull origin main
git checkout feature/nombre-modulo
git merge main
```

Resolver conflictos, probar y subir:

```bash
git add .
git commit
git push
```

## Autenticacion recomendada

Se recomienda SSH para evitar conflictos de credenciales HTTPS en Windows.

```bash
ssh-keygen -t ed25519 -C "TU_CORREO_DE_GITHUB"
type $env:USERPROFILE\.ssh\id_ed25519.pub
git remote set-url origin git@github.com:hackevans04-crypto/Detection-test.git
ssh -T git@github.com
git push -u origin feature/auth-dashboard
```

Si se usa HTTPS, limpiar credenciales antiguas en:

```text
Panel de control -> Administrador de credenciales -> Credenciales de Windows
```

Eliminar entradas de `github.com` asociadas a cuentas sin permiso.
