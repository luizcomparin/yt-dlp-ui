# Módulo: ytdlp (args-builder + parser)

> Arquivos: `src/main/ytdlp/args.ts`, `parse.ts`, `split-args.ts`, `info.ts`, `errors.ts`
> Fases: 1–2 · Requisitos: R1, R2, R3, R5, R6, R8

## Responsabilidade
- **`args.ts`:** traduz as opções do app em argumentos do yt-dlp. É uma função pura e testável.
- **`parse.ts`:** interpreta cada linha da saída do yt-dlp.
- **`split-args.ts`:** divide a string de "argumentos extras" do usuário como um shell faria e formata o comando para exibição.

## Comando gerado (download de áudio)
```
yt-dlp --encoding utf-8 --color never --no-playlist
  --ffmpeg-location <pasta> --js-runtimes deno:<caminho>
  --newline --progress
  --progress-template "download:[ytui:progress] %(progress)j"
  --progress-template "postprocess:[ytui:pp] %(progress)j"
  --print "after_move:[ytui:file] %(filepath)j"
  -f bestaudio -x --audio-format best
  --embed-thumbnail --convert-thumbnails jpg --embed-metadata
  [--ppa "ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -vf crop=..."]   ← só com crop ligado
  -P <pasta> -o <template>
  --download-archive <pasta>/.yt-dlp-archive.txt          ← fase 4 (sincronizar)
  [--cookies-from-browser <nav>[:perfil] | --cookies <arquivo>]   ← fase 6 (cookieArgs; também na listagem/enriquecimento/console)
  [--sleep-requests … --sleep-interval … --max-sleep-interval … --limit-rate …]   ← perfil anti-bloqueio
  [argumentos extras]
  -- <url>
```

| Trecho | Por quê |
|---|---|
| `-f bestaudio -x --audio-format best` | Melhor áudio, mantido no formato original (opus/m4a) sem recodificar |
| `--embed-thumbnail --convert-thumbnails jpg` | Capa embutida. JPG é o formato mais compatível com players |
| `--ppa ... crop=...` | Recorta a capa para um quadrado centralizado usando o menor lado (1280×720 → 720×720) |
| `--embed-metadata` | Título, artista (canal) e data nas tags |
| `[ytui:*]` | Prefixos que tornam as linhas estruturadas fáceis de identificar |
| `--encoding utf-8` | **Obrigatório no Windows**: com stdout em pipe, o yt-dlp usa a code page do console e **descarta** caracteres não ASCII. `PYTHONUTF8` sozinho não resolve |
| `%(filepath)j` | Caminho final como string JSON com escapes `\uXXXX`, que chega íntegro mesmo se o encoding falhar |
| `--print` implica modo quiet | O yt-dlp **não** imprime "already been recorded in the archive". Por isso a fila confere o archive antes de iniciar, e trata código 0 sem arquivo final como "pulado" |
| Argumentos extras antes de `--` | Permite sobrescrever os padrões, e a URL nunca é confundida com uma opção |

## Comandos de listagem e enriquecimento (fase 2)
```
# listagem flat (sem --no-playlist, para watch?v=X&list=Y virar playlist)
yt-dlp --encoding utf-8 --color never --js-runtimes deno:<caminho>
  --flat-playlist --ignore-errors
  --print "[ytui:entry] %(.{id,title,duration,channel,…,playlist_title,playlist_index})j" -- <url>

# enriquecimento em lote (--print implica --simulate: nada é baixado)
yt-dlp --encoding utf-8 --color never --no-playlist --js-runtimes deno:<caminho>
  --ignore-errors -f bestaudio
  --print "[ytui:info] %(.{id,upload_date,availability,format_id,filesize,…,formats})j" -- URL1 URL2 …
```
- `%(.{a,b})j` imprime só os campos pedidos (o yt-dlp omite os nulos).
- Com `-f bestaudio`, os campos de formato no topo do JSON (`format_id`, `filesize`, `abr`…) são **os do formato que o download vai usar**. Por isso o tamanho mostrado é exato.

## Classificação de erros (`errors.ts`)
`classifyError(msg)` → `{ kind, availability, transient, reason }`. As regras são aplicadas da mais específica para a mais genérica:

| Tipo | `kind` |
|---|---|
| Rate limit (429, "not a bot") | `rate-limit` |
| Privado | `private` |
| Removido / conta encerrada | `deleted` |
| Restrição de idade | `age` |
| Exclusivo de membros | `members` |
| YouTube Premium | `premium` |
| Bloqueio regional | `geo` |
| Live ou estreia | `live` |
| Erro de rede | `network` |
| "Unavailable" genérico | `unavailable` |
| Qualquer outro | `unknown` |

`splitVideoError` extrai o ID de `[youtube] <id>: mensagem`. A mesma classificação é usada na fila (retry, [queue](queue.md)) e no [log de erros](errors.md).

## Parser (`parseLine`)
| Linha | Resultado |
|---|---|
| `[ytui:progress] {json}` | `progress` (bytes, total ou estimativa, velocidade, ETA, status) |
| `[ytui:pp] {json}` | `postprocess` (ex.: `ExtractAudio`, `EmbedThumbnail`) |
| `[ytui:file] "json"` | `file` (caminho final) |
| `[ytui:entry] {json}` | `entry` (item da listagem flat) |
| `[ytui:info] {json}` | `info` (resultado do enriquecimento) |
| `ERROR: ...` | `error` |
| `WARNING: ...` | `warning` |
| outras | `other` (vão para o log) |

## Testes
`args.test.ts`, `parse.test.ts`, `split-args.test.ts`, `info.test.ts` e `errors.test.ts`. Os casos de parser usam linhas reais capturadas do yt-dlp 2026.10.26.
