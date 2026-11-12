import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// node:sqlite só é estável sem flag a partir do Node 22.13; o Electron 45 (Node 24) já tem.
// Para os testes rodarem no Node do sistema, habilitamos a flag quando necessário.
const [major, minor] = process.versions.node.split('.').map(Number)
const needsSqliteFlag = major < 22 || (major === 22 && minor < 13)

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    execArgv: needsSqliteFlag ? ['--experimental-sqlite', '--no-warnings=ExperimentalWarning'] : []
  }
})
