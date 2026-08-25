import { execFileSync, spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const host = '127.0.0.1'

function portIsOpen(targetPort) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port: targetPort })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }

    socket.setTimeout(500)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function findWindowsProjectServer() {
  if (process.platform !== 'win32') return null

  // Next bloquea por directorio, no por puerto. Una instancia anterior puede
  // estar en 3001/3010/3100 aunque el nuevo comando solicite el 3000.
  const script = String.raw`
    $root = $env:DETECTION_PROJECT_ROOT
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -like "*$root*" -and $_.CommandLine -match 'next\\dist\\server\\lib\\start-server' }
    $result = @(foreach ($process in $processes) {
      Get-NetTCPConnection -State Listen -OwningProcess $process.ProcessId -ErrorAction SilentlyContinue |
        Select-Object -First 1 @{Name='pid';Expression={$process.ProcessId}}, @{Name='port';Expression={$_.LocalPort}}
    })
    $result | ConvertTo-Json -Compress
  `

  try {
    const output = execFileSync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ], {
      encoding: 'utf8',
      env: { ...process.env, DETECTION_PROJECT_ROOT: projectRoot },
      windowsHide: true,
    }).trim()

    if (!output) return null
    const result = JSON.parse(output)
    return Array.isArray(result) ? result[0] : result
  } catch {
    // Si PowerShell no está disponible, queda la comprobación portable.
    return null
  }
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Puerto inválido: ${process.env.PORT}`)
  process.exit(1)
}

const existing = findWindowsProjectServer()

if (existing && await portIsOpen(Number(existing.port))) {
  console.warn(`⚠️ Se detectó una instancia previa de Detection-test en http://localhost:${existing.port} (PID ${existing.pid}).`)
  console.warn('  Se reinicia la instancia para evitar rutas obsoletas como /login en 404.')

  try {
    process.kill(existing.pid)
  } catch {
    // Si el proceso ya terminó, continuamos con el arranque limpio.
  }

  await new Promise((resolve) => setTimeout(resolve, 500))
}

if (await portIsOpen(port)) {
  console.log(`✓ El puerto ${port} ya está ocupado en http://localhost:${port}`)
  console.log('  No se iniciará otro proceso hasta elegir un puerto libre.')
  process.exit(0)
}

const nextCli = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextCli, 'dev', '--port', String(port)], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(port) },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.once('error', (error) => {
  console.error(`No se pudo iniciar Next.js: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
