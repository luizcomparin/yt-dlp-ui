// Wrapper do CLI do electron-vite.
// Remove ELECTRON_RUN_AS_NODE, que alguns ambientes (ex.: processos filhos do VS Code)
// herdam. Com ela definida, o Electron roda como Node puro e `require('electron')` quebra.
import { spawn } from 'node:child_process'

delete process.env.ELECTRON_RUN_AS_NODE

const child = spawn('electron-vite', process.argv.slice(2), {
  stdio: 'inherit',
  shell: true,
  env: process.env
})
child.on('exit', (code) => process.exit(code ?? 0))
