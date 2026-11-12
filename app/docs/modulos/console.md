# Módulo: console

> Arquivos: `src/main/console/index.ts` · UI: `store/console.ts`, `components/ConsoleDialog.tsx` (botão `>_` no cabeçalho)
> Fase: 6 · Requisito: R8 (comandos customizados)

## Responsabilidade
Executar **yt-dlp, ffmpeg, ffprobe ou deno** com argumentos livres, usando os binários gerenciados pelo app, e mostrar a saída ao vivo. Serve para:
- investigar um vídeo (`-F` lista formatos);
- testar opções antes de colocá-las nos "argumentos extras";
- fazer qualquer operação que a UI não cobre.

## Fluxo
```
UI (Enter / ▶ executar) ─ console:run { tool, args, useAppArgs } ─▶ runConsole
   1. resolve o binário (yt-dlp gerenciado; ffmpeg/ffprobe da pasta do ffmpeg; deno)
   2. splitArgs(args): divide como um shell (aspas); aspas não fechadas → erro legível
   3. yt-dlp + "usar config. do app": antepõe --encoding utf-8 --color never
      --ffmpeg-location … --js-runtimes deno:… + cookies (sem --no-playlist)
   4. run() com cwd = pasta de destino (arquivos gerados caem lá)
   5. eventos console:event: start (comando + pasta) → lines (lotes a cada 100 ms) → exit (código, tempo)
```
- **Uma execução por vez:** um segundo `run` é recusado com mensagem.
- **Parar** (botão ou **Ctrl+C** no campo): mata a árvore do processo, como na fila.
- **Ao fechar o app:** o comando em execução é encerrado.

## UI
- **Ferramenta:** escolhida no seletor, ou digitada na frente ("`yt-dlp -F URL`" é reconhecido).
- **Histórico:** ↑/↓ percorre os últimos 50 comandos (`localStorage`).
- **Saída:** mantida enquanto o app estiver aberto, mesmo com a tela fechada (até 5000 linhas).
  - Cores: comando/meta em azul, `ERROR:` em vermelho, `WARNING:` em amarelo.
  - A rolagem é automática, a menos que você suba para ler.
- **Com o console vazio:** aparecem exemplos clicáveis (listar formatos, imprimir título/duração/data, baixar áudio manualmente, versões, ffprobe).
- **Botões:** copiar saída, limpar.

## Interface (IPC)
`console:run`, `console:kill`. Evento: `console:event`.

## Validação (2026-11-11)
| Caso | Resultado |
|---|---|
| `yt-dlp -F` com config. do app | Comando com `--ffmpeg-location`/`--js-runtimes`; tabela de formatos; código 0 |
| `ffprobe -version` | OK |
| Aspas não fechadas | "Aspas " não fechadas em: …" |
| Segundo comando com outro rodando | Recusado com mensagem |
| Parar um download lento | `exit { killed: true }`, nenhum yt-dlp órfão, `.part` na pasta de destino |
| Cookies configurados | O console os inclui (`--cookies …`) |
| "yt-dlp -F URL" digitado pela UI | Ferramenta reconhecida; saída mostrando `[jsc:deno] Solving JS challenges` |
