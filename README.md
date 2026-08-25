# Detection-test

Plataforma de evaluacion psicopedagogica construida con Next.js, React y TypeScript.

## Entorno local

```bash
npm install
npm run dev:next
```

Servidor local por defecto:

```text
http://localhost:3000
```

## Verificacion

```bash
npx.cmd tsc --noEmit
npx.cmd vitest run lib/evaluation-engine.test.ts
npm.cmd run build
```

En Windows se recomienda usar `npm.cmd` y `npx.cmd` si PowerShell bloquea los shims `.ps1`.

## Flujo Git del equipo

No trabajar directo sobre `main`.

```bash
git checkout main
git pull origin main
git checkout -b feature/nombre-modulo
```

Despues de trabajar:

```bash
git add .
git commit -m "feat: descripcion del cambio"
git push -u origin feature/nombre-modulo
```

Crear Pull Request hacia `main`.

## Ramas sugeridas

```text
main
feature/auth-dashboard
feature/tests
feature/instruments
feature/diagnosis
feature/pdf-report
feature/admin
fix/nombre-del-arreglo
```

## Convencion de commits

```text
feat: implementar login y registro
feat: agregar dashboard del estudiante
feat: implementar Test ABC
feat: exportar diagnostico a PDF
fix: corregir calculo de puntuacion
refactor: reorganizar modulo de instrumentos
docs: actualizar documentacion
```
