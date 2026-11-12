# ADR 0002: SQLite via `node:sqlite` (em vez de better-sqlite3)

- **Status:** aceita
- **Data:** 2026-11-10
- **Substitui:** a sugestão de `better-sqlite3` na [ADR 0001](0001-stack.md)

## Contexto
O app precisa de um banco local para o cache de playlists e vídeos (fase 2) e, depois, para a fila e os erros. O `better-sqlite3` é um módulo **nativo**: precisa ser recompilado para o ABI de cada versão do Electron, o que complica o `npm install` e o empacotamento.

## Opções
| Opção | Prós | Contras |
|---|---|---|
| `better-sqlite3` | Maduro, API síncrona e rápida | Módulo nativo: rebuild a cada atualização do Electron |
| `node:sqlite` (embutido no Node) | Nada para instalar ou compilar. API síncrona (`DatabaseSync`) parecida com a do better-sqlite3 | API mais nova. No Node do sistema (22.12) ainda exige `--experimental-sqlite` |
| JSON em arquivo | Trivial | Não escala para milhares de faixas, sem consultas |

## Decisão
**`node:sqlite`.** Foi verificado que o Electron 45 (Node 24.22, SQLite 3.53) carrega o módulo sem flag e sem aviso.

## Consequências
- Nenhuma dependência nativa no projeto.
- **Testes:** o vitest roda no Node do sistema. Por isso o `vitest.config.mts` passa `--experimental-sqlite` quando o Node é anterior à 22.13.
- **Migrações:** são feitas à mão, com `PRAGMA user_version` (ver `src/main/db/index.ts`).
