# Módulo: errors (log de erros)

> Arquivos:
> - main: `src/main/errors/log.ts` (repositório + JSONL, testável), `src/main/errors/index.ts` (instância + eventos)
> - classificação: `src/main/ytdlp/errors.ts` (ver [ytdlp-args](ytdlp-args.md#classificação-de-erros-errorsts))
> - CSV: `src/shared/csv.ts`
> - UI: `store/errors.ts`, `components/ErrorsDialog.tsx`, botão "Erros" no cabeçalho (`App.tsx`)
>
> Fase: 5 · Requisito: R7 (tratar erros sem travar e salvar log para examinar)

## Responsabilidade
Guardar um histórico permanente de **cada tentativa de download que falhou**, mostrar numa tela com filtros e permitir exportar, copiar URLs e tentar de novo. A tela também lista as **faixas indisponíveis da playlist atual**, que nem chegam à fila.

## Fluxo
```
queue/manager.finish()  ── outcome retry | rate-limit | error
   └ logFailure(job, mensagem, tipo, tentativa, final)
        └ errors.recordError()
             ├ SQLite: tabela errors (migração 3)
             ├ arquivo: %APPDATA%\yt-dlp UI\logs\errors-AAAAMMDD.jsonl  (1 JSON por linha)
             └ evento errors:event { added } → store/errors (badge "●" no botão Erros)
```
- **Uma entrada por tentativa:**
  - `final: true` quando o job desistiu (ficou em `error`);
  - `final: false` para falhas que foram re-tentadas (rede) e bloqueios temporários.
  - Por padrão a tela mostra só as finais. "Mostrar tentativas intermediárias" inclui as outras.
- **Mensagem:** é gravada sem o prefixo `[youtube] <id>: `, com o tipo (`kind`) e o motivo em português da classificação.
- **Arquivo JSONL:** é auxiliar. Se falhar ao gravar (disco cheio, permissão), o registro no banco e a fila continuam.

## Tela de erros (botão "Erros" no cabeçalho)
- **O botão:** mostra quantos jobs estão em erro na fila e um "●" se houve falhas novas desde a última vez que a tela foi aberta.

| Aba | Fonte | Colunas |
|---|---|---|
| **Falhas de download** | Tabela `errors` (histórico, sobrevive a "limpar concluídos" e a reinícios) | data, título, tipo, motivo, tentativa. Clicar expande URL, mensagem original e **comando exato** |
| **Indisponíveis na playlist** | Faixas da playlist carregada com status privado/removido/indisponível/restrito | posição, título (ou "(sem título) + id"), URL, status, motivo |

**Ações:**
- **Busca e filtro por tipo:** a lista de tipos traz as contagens.
- **Exportar CSV** (`dialog:save-text`): diálogo "Salvar como" em Documentos.
  - O CSV usa `;` como separador e BOM UTF-8, para o Excel em português abrir com acentos e caracteres coreanos/japoneses corretos.
  - Exporta só as linhas filtradas.
- **Copiar URLs:** uma por linha, das linhas filtradas.
- **Tentar falhas de novo** (`queue:retry-failed`): recoloca na fila todos os jobs em `error`, com as tentativas zeradas.
- **Pasta de logs:** abre `%APPDATA%\yt-dlp UI\logs`.
- **Limpar histórico:** apaga a tabela `errors`. Os arquivos `.jsonl` são mantidos.

## 403 Forbidden
O erro dos 6 downloads que falharam na playlist do usuário foi `unable to download video data: HTTP Error 403: Forbidden`.
- **Não é rate limit:** isso seria 429 ou "not a bot". O YouTube recusou ou expirou o link do arquivo de áudio no meio do download.
- **Antes:** era classificado como `unknown`, um erro final.
- **Agora:** é `forbidden` (temporário), com novas tentativas automáticas.

## Formato do JSONL
```json
{"jobId":"…","videoId":"m8zY2kd7EVs","playlistId":"PL-…","title":"…","url":"https://www.youtube.com/watch?v=…",
 "message":"Private video. If the owner…","kind":"private","command":"\"…yt-dlp.exe\" …","attempt":1,"final":true,
 "id":3,"reason":"vídeo privado","createdAt":"2026-11-11T03:33:56.000Z"}
```

## Interface (IPC)
`errors:list`, `errors:clear`, `queue:retry-failed`, `dialog:save-text`, `shell:open-logs`. Evento: `errors:event` (`added` | `cleared`).

## Validação (2026-11-11, vídeos reais da playlist do usuário)
| Caso | Resultado |
|---|---|
| Privado, direitos autorais, conta encerrada, Content ID | `error` na 1ª tentativa, sem retry; motivos "vídeo privado", "removido por direitos autorais", "conta do canal encerrada", "bloqueado por reivindicação de direitos (gravadora)" |
| Rede (simulada com `--proxy` para porta fechada) | 3 tentativas (esperas de 15 s e 30 s), 2 entradas `retry` + 1 `final`, 66 s no total |
| "Tentar falhas de novo" sem o proxy | O de rede **baixou**; os 4 permanentes falharam de novo |
| JSONL | `errors-20261111.jsonl` gravado com todas as entradas |
| Tela | As duas abas, a expansão com o comando e os filtros por tipo funcionando |

**Não testado de ponta a ponta:** o clique no diálogo nativo "Salvar como", que não dá para automatizar via DevTools. O conteúdo do CSV é coberto por `csv.test.ts`.

## Testes
`log.test.ts` (classificação, banco, JSONL, ordem, falha de disco) e `src/shared/csv.test.ts` (escape, BOM, unicode, data).
