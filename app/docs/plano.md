# Plano do projeto: yt-dlp UI

> Status: **todas as fases (0–8) concluídas**. Próximos passos: features futuras F1–F6. Stack: Electron + React + TypeScript (ver [decisoes/0001-stack.md](decisoes/0001-stack.md)).
> Última revisão: 2026-11-10.

## 1. Objetivo

UI desktop que encapsula **yt-dlp + ffmpeg** (e outras ferramentas) para baixar playlists de música do YouTube na melhor qualidade de áudio. Referências: MediaHuman YouTube to MP3 Converter e Stacher.

- **Uso:** pessoal, por enquanto.
- **Execução:** `npm run dev` (ou equivalente) e, opcionalmente, um executável.

## 2. Requisitos

### 2.1 Escopo inicial (MVP)

| # | Requisito |
|---|---|
| R1 | Baixar a playlist na melhor qualidade de áudio, com escolha entre os formatos disponíveis. **Padrão: original (opus/m4a), sem recodificar.** |
| R2 | Thumbnail embutida como capa e título do vídeo no nome do arquivo. |
| R3 | Opção para ligar/desligar o **crop quadrado** da capa. Desligado, a thumbnail mantém a proporção original. |
| R4 | Ordenação da playlist: ordem original, inversa, mais recentes, mais antigas, título, duração. |
| R5 | Após informar o link, listar os vídeos com título, thumbnail, tamanho (KB/MB) e duração. |
| R6 | Filtro para exibir/ocultar vídeos públicos e privados/excluídos/indisponíveis. |
| R7 | Download com pausar/retomar, seleção de faixas, erros tratados sem travar a fila e log de erros exportável. |
| R8 | Console para comandos customizados (yt-dlp, ffmpeg, ffprobe…) e campo de "argumentos extras". |
| R9 | **Sincronizar playlist:** baixar só as faixas novas (download archive). |
| R10 | Gerar `.m3u` da playlist na ordem escolhida. |
| R11 | Monitor de área de transferência: detectar link do YouTube copiado e oferecer adicionar. |
| R12 | Cookies do navegador (`--cookies-from-browser`) para conteúdo com restrição de idade ou privado do usuário. |
| R13 | **Anti-bloqueio (prioridade alta):** pausas aleatórias, limite de velocidade e de concorrência, backoff em 429/bot-check. |
| R14 | Detecção de duplicadas (entre playlists e na pasta de destino). |
| R15 | Notificação do sistema ao terminar a fila. |

### 2.2 Features futuras (baixa prioridade)

| # | Feature |
|---|---|
| F1 | Conversão para mp3 (e outros formatos com recodificação: flac, wav…). |
| F2 | Suporte dedicado ao YouTube Music (metadados de artista/álbum/ano). |
| F3 | SponsorBlock: `--sponsorblock-remove music_offtopic`. |
| F4 | Normalização de volume (ffmpeg `loudnorm`) ou tag ReplayGain. |
| F5 | Dividir por capítulos (`--split-chapters`) para álbuns em vídeo único. |
| F6 | Editor de tags (artista/título) e preview de áudio. |
| F7 | Exportar para CD (CD de áudio ou de MP3): conversão, divisão por disco, numeração pela playlist, tags/CD-Text, volume uniforme. Levantamento completo e decisões em aberto em [propostas/cd-player.md](propostas/cd-player.md). Depende de F1 (conversão) e se beneficia de F4 (volume). |

## 3. Dependências externas

O app gerencia estas ferramentas: verifica na 1ª execução, baixa se faltar e atualiza.

| Ferramenta | Uso | Observação |
|---|---|---|
| `yt-dlp.exe` | Extração de metadados e download | Binário standalone, que já inclui `mutagen` (necessário para embutir capa em opus). Atualização via `yt-dlp -U`. |
| `ffmpeg` / `ffprobe` | Extração de áudio, embed de capa, crop | Já instalado na máquina (WinGet), mas o app deve aceitar caminho configurável. |
| `deno` | Runtime JS que o yt-dlp exige para resolver os desafios do YouTube | Requisito do yt-dlp desde o fim de 2025. |

Decisão de design: o yt-dlp roda **como subprocesso** (não como biblioteca), por estes motivos:
- **Pausar:** basta matar o processo. O `.part` fica no disco e é retomado com `--continue`.
- **Console customizado:** fica trivial.
- **Atualização:** o yt-dlp é atualizado sem rebuild do app.
- **Isolamento:** a falha de uma faixa não derruba a UI.

## 4. Arquitetura (independente da stack)

```
Processo principal / backend
├─ deps          localizar, baixar e atualizar yt-dlp, ffmpeg, deno
├─ runner        spawn de processos, leitura de stdout/stderr linha a linha, kill da árvore (taskkill /T /F;
│                matar só o processo pai deixa filhos órfãos no Windows, como já visto na fase 0)
├─ metadata      leitura flat da playlist + enriquecimento por vídeo (com cache)
├─ queue         fila: concorrência, pausa/retomada, retry, anti-bloqueio
├─ args-builder  opções da UI → argumentos do yt-dlp
├─ errors        classificação de erros a partir do stderr
├─ db            SQLite: playlists, tracks, jobs, erros
├─ clipboard     monitor de área de transferência
└─ notify        notificações do sistema

UI
├─ tela principal   URL, lista de faixas, filtros, ordenação, ações
├─ configurações    formato, pasta, template de nome, crop, anti-bloqueio, cookies, presets
├─ console          comandos customizados com saída ao vivo
└─ log de erros     filtros, export CSV, retry
```

A comunicação UI ↔ backend é por eventos (IPC): progresso, status por faixa e linhas de log.

## 5. Funcionamento por requisito

### 5.1 Carregar e listar a playlist (R5, R6)

1. **Leitura rápida:**
   ```
   yt-dlp --flat-playlist -J <url>
   ```
   Retorna id, título, duração e thumbnail em segundos, e a tabela já aparece com esses dados.
2. **Enriquecimento em background**, com 2 workers e respeitando o anti-bloqueio:
   ```
   yt-dlp -J --skip-download <video_url>
   ```
   Retorna:
   - `upload_date`
   - os formatos de áudio
   - `filesize` / `filesize_approx`
   - a disponibilidade da faixa
   
   O resultado fica em cache no SQLite.
3. **Tamanho estimado:** quando não houver `filesize`, usa `tbr × duração`.
4. **Disponibilidade:** a flag `availability`, junto com os erros de extração, classifica cada faixa como pública, privada, excluída ou indisponível. O filtro R6 usa essa classificação.

### 5.2 Ordenação (R4)

- A ordenação é feita **no app**. A fila recebe os IDs já na ordem escolhida.
- "Mais recentes/antigas" dependem do `upload_date` do enriquecimento. Até ele chegar, a UI mostra um indicador.
- **Opcional:** prefixo numérico no nome (`01 - Título`) refletindo a ordem escolhida.

### 5.3 Formato e qualidade (R1)

- **Padrão "original":** `-f bestaudio -x --audio-format best`, que mantém o opus (~160 kbps) ou o m4a sem perda.
- **Seleção manual** entre os formatos de áudio disponíveis (itags 251, 140…), vindos do enriquecimento.
- A conversão para mp3 fica como feature futura (F1).

### 5.4 Capa e nome (R2, R3)

**Argumentos base:**
```
--embed-thumbnail --convert-thumbnails jpg --embed-metadata
-o "<template>"
```
- **Template padrão:** `%(title)s.%(ext)s`, editável na UI. Exemplo: `%(playlist_index)02d - %(title)s.%(ext)s`.

**Crop quadrado (R3)**, ligado por padrão e com toggle nas configurações. Ligado, adiciona:
```
--ppa "ThumbnailsConvertor+FFmpeg_o:-c:v mjpeg -vf crop=\"'if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'\""
```
Desligado, a capa mantém a proporção original (16:9).

**Opcional:** `--parse-metadata "title:%(artist)s - %(title)s"` para separar artista e título.

### 5.5 Fila de download (R7, R9)

- **Um processo por faixa:** uma faixa com erro não afeta as outras.
  - **Concorrência configurável:** padrão 1 a 2 (ver anti-bloqueio).
- **Progresso** por faixa, lendo o JSON emitido a cada linha:
  ```
  --newline --progress-template "download:%(progress)j"
  ```
- **Pausar:**
  - **Faixa:** kill da árvore do processo; o `.part` fica no disco.
  - **Fila:** para de iniciar novas faixas e pausa as ativas.
- **Retomar:** relança a faixa com `--continue`.
- **Seleção:** checkbox por faixa, marcar todas, inverter, filtros (texto, duração, status, disponibilidade).
- **Sincronizar (R9):** `--download-archive <pasta>/archive.txt`. Ao reabrir uma playlist já baixada, só as faixas novas vêm marcadas.

### 5.6 Erros e log (R7)

- **Classificação** (módulo `errors`), feita a partir do stderr:

  | Tipo | Exemplos | Tratamento |
  |---|---|---|
  | Permanente | privado, removido, restrição de idade, members-only, bloqueio regional | Marca como falha; a fila segue |
  | Transitório | rede, HTTP 429, "Sign in to confirm you're not a bot" | Retry com backoff; ver anti-bloqueio |
  | Desconhecido | outros | Marca como falha; guarda a mensagem crua |

- **Registro:** vai para o SQLite e para `logs/errors-YYYYMMDD.jsonl`, com id, título, URL, categoria, mensagem crua e comando executado.
- **Tela de erros:**
  - filtros
  - exportar CSV
  - copiar URLs
  - tentar falhas novamente

### 5.7 Comandos customizados (R8)

- **Argumentos extras:** campo global e por preset, anexado a todo comando do yt-dlp.
- **Aba Console:**
  - Roda `yt-dlp`, `ffmpeg`, `ffprobe` ou `deno` usando os binários gerenciados pelo app.
  - Mostra a saída ao vivo e guarda histórico (↑/↓).
- **"Ver comando"** por faixa: mostra o comando exato, que pode ser copiado.
- **Presets** salvos em JSON.

### 5.8 Anti-bloqueio (R13) — prioridade alta

- **Pausas entre requisições e entre downloads:**
  - `--sleep-requests <s>`
  - `--sleep-interval <min> --max-sleep-interval <max>`, com intervalo aleatório
- **Limite de velocidade:** `--limit-rate`, opcional.
- **Concorrência baixa por padrão (1 a 2)**, tanto no enriquecimento quanto no download.
- **Backoff global:** ao detectar 429 ou bot-check, **pausa a fila inteira** por um tempo crescente (ex.: 1 → 5 → 15 min) e avisa na UI.
- **Cookies do navegador (R12)** reduzem bloqueios. No Windows, o Chrome trava o banco de cookies quando está aberto, então o Firefox é recomendado.
- **yt-dlp atualizado:** botão de update e opção de canal nightly. Quando o YouTube muda, a correção normalmente chega primeiro por aí.
- **Perfis prontos:** "Seguro" (padrão), "Normal" e "Rápido".

### 5.9 Extras do MVP (R10, R11, R14, R15)

- **M3U (R10):** ao fim da fila, gera um `.m3u8` na pasta com as faixas na ordem escolhida.
- **Clipboard (R11):** polling leve da área de transferência. Ao detectar uma URL do YouTube nova, mostra um toast "Adicionar?". O recurso pode ser desligado.
- **Duplicadas (R14):**
  - por `video_id`, no archive e no banco;
  - por nome de arquivo na pasta de destino;
  - a faixa duplicada é marcada e desmarcada por padrão.
- **Notificação (R15):** notificação nativa do Windows ao terminar a fila, com o resumo (ok / falhas).

## 6. Modelo de dados (SQLite)

- `playlists(id, url, title, last_fetched, output_dir)`
- `tracks(video_id, playlist_id, idx, title, channel, duration, upload_date, thumb_url, size_est, formats_json, availability)`
- `jobs(id, video_id, preset, status, progress, output_path, started_at, finished_at)`
- `errors(id, job_id, video_id, category, message, command, created_at)`

## 7. Fases de entrega

| Fase | Entrega | Requisitos |
|---|---|---|
| 0 ✅ | Decisão de stack + esqueleto do projeto + `npm run dev` | — |
| 1 ✅ | Núcleo: `deps`, `runner`, `args-builder`, download de 1 vídeo com capa/metadados (com e sem crop) | R1, R2, R3 |
| 2 ✅ | Playlist: listagem flat, enriquecimento, cache SQLite, disponibilidade | R5, R6 |
| 3 ✅ | UI básica: tabela com thumbs, seleção, ordenação, filtros, pasta, formato | R4, R6 |
| 4 ✅ | Fila: concorrência, progresso, pausa/retomada, archive/sincronizar, anti-bloqueio | R7, R9, R13 |
| 5 ✅ | Erros: classificação, retry, tela de log, export CSV | R7 |
| 6 ✅ | Power user: console, argumentos extras, presets, "ver comando", cookies | R8, R12 |
| 7 ✅ | Extras: M3U, clipboard, duplicadas, notificações | R10, R11, R14, R15 |
| 8 ✅ | Empacotamento: executável, auto-update do yt-dlp, download das dependências | — |

### 2.3 Adicionado após o plano

| # | Feature |
|---|---|
| A2 | Reabrir de onde parou (última playlist, filtros, seleção, rolagem). Ver [modulos/ui-playlist.md](modulos/ui-playlist.md#reabrir-de-onde-parou-sessão) ✅ |
| A1 | Substituir faixa indisponível por outro vídeo (link ou busca), mantendo a posição. Ver [modulos/replace.md](modulos/replace.md) ✅ |

## 8. Decisões

| Tema | Decisão |
|---|---|
| Formato padrão | Original (opus/m4a). mp3 é feature futura (F1). |
| Distribuição | Uso pessoal; rodar com `npm run dev` ou executável. |
| Stack | Electron + React + TypeScript (Zustand, Tailwind, electron-vite, electron-builder): ver [decisoes/0001-stack.md](decisoes/0001-stack.md). |
| Banco | SQLite via `node:sqlite` embutido, sem módulo nativo: ver [decisoes/0002-sqlite.md](decisoes/0002-sqlite.md). |
