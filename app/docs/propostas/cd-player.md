# Proposta: exportar para CD (CD player)

> Status: **levantamento, nada implementado**. Todas as decisões estão em aberto (ver [Decisões em aberto](#9-decisões-em-aberto)).
> Data do levantamento: 2026-11-11 · Feature futura **F7** no [plano](../plano.md).

## 1. Objetivo
Usar as músicas baixadas pelo app para gravar CDs que toquem num **CD player** (aparelho de som, carro, portátil).

**Ponto de partida:** a biblioteca atual está em **opus** (padrão "Melhor disponível") ou **m4a**.
- **opus:** não toca em nenhum CD player, e a maioria dos programas de gravação não aceita.
- **m4a (AAC):** só alguns aparelhos mais novos tocam.

Por isso, qualquer caminho para CD exige **conversão**.

## 2. Os dois tipos de CD

| | **CD de áudio** (CD-DA, "Red Book") | **CD de MP3** (CD de dados) |
|---|---|---|
| Toca em | **Qualquer** CD player, inclusive antigos e de carro | Só aparelhos com suporte a MP3 (logo "MP3" no aparelho/manual) |
| Formato no disco | Áudio PCM 44,1 kHz / 16 bits / estéreo (gerado a partir de WAV) | Arquivos `.mp3` (alguns aparelhos aceitam WMA; quase nenhum aceita opus ou m4a) |
| Capacidade | **~80 min e no máximo 99 faixas** por disco (CD-R de 700 MB) | ~700 MB por disco ≈ **8 h a 192 kbps**, ~6 h a 256 kbps, ~5 h a 320 kbps |
| Playlist de referência (637 faixas, 612 disponíveis, ~48 h) | **~37 discos** | **~6 discos** a 192k, ~8 a 256k, ~10 a 320k |
| Nome da música no display | Só com **CD-Text**, e nem todo aparelho mostra | Pelas tags ID3 ou pelo nome do arquivo |
| Precisa de mp3? | **Não** (WAV) | **Sim** (ou WMA) |

**Variação:** alguns aparelhos (principalmente DVD players) leem **DVD de MP3** (~4,3 GB, ~50 h a 192k). A playlist inteira caberia num disco, mas é preciso confirmar o suporte do aparelho.

## 3. Qualidade e conversão
- **opus → mp3:** é perda sobre perda (duas compressões). Para não ficar audível, use **mp3 CBR de 256 a 320 kbps**. 192 kbps é aceitável e cabe mais por disco.
- **opus → WAV** (CD de áudio): não perde nada além do que já foi perdido no download.
- **CBR em vez de VBR:** aparelhos antigos mostram tempo errado e avançam errado com VBR.
- **Ferramenta:** o **ffmpeg**, que o app já gerencia:
  - MP3: `-c:a libmp3lame -b:a 320k -ar 44100 -ac 2`
  - WAV: `-c:a pcm_s16le -ar 44100 -ac 2`

## 4. O que adicionar

### 4.A Conversão (base de tudo; relacionada à feature futura **F1**, "conversão para mp3")
- Converter a partir dos arquivos já baixados (tabela `downloads` + arquivos da pasta), **sem baixar de novo**.
- Fila de conversão com progresso, erros e cancelar, reaproveitando o modelo da fila de download (um processo ffmpeg por arquivo, matar a árvore de processos ao cancelar, log de erros).
- **Exportar cópias** numa pasta separada (ex.: `<pasta>/CD export/`), mantendo a biblioteca original em opus intacta. A alternativa (baixar direto em mp3) está nas [Decisões em aberto](#9-decisões-em-aberto).

### 4.B Ajustes para **CD de MP3** (aparelhos são exigentes)

| Item | Detalhe | Por quê |
|---|---|---|
| **Numeração no nome** | `001 - Título.mp3`, pela **posição na playlist** (o "#" da tabela) | Muitos aparelhos tocam em ordem de **nome** ou de **gravação**; a numeração resolve os dois. As **datas** que o app ajusta hoje ([extras](../modulos/extras.md#datas-dos-arquivos-na-ordem-da-playlist)) **não servem para CD** |
| **Nomes curtos e seguros** | Sem `⧸ ？ ：` (as trocas que o yt-dlp faz no Windows), sem emoji, até ~60 caracteres; coreano/japonês pode precisar de transliteração ou fallback | Limites do sistema de arquivos do CD (ISO 9660/Joliet) e dos displays |
| **Tags** | **ID3v2.3 + ID3v1** (`-id3v2_version 3 -write_id3v1 1`); título, artista, álbum = "<playlist> CD1", **número da faixa** (`n/total`) | Aparelhos antigos não leem ID3v2.4. O número da faixa ajuda a ordenar e aparece no display |
| **Capa** | Pequena (≤ 500×500, JPEG baseline) **ou sem capa** (opção) | Capas grandes embutidas travam ou pulam faixas em alguns aparelhos |
| **Taxa** | CBR 320/256/192 configurável | Ver seção 3 |
| **Divisão em discos** | Pastas `CD1/`, `CD2/`… respeitando: ~700 MB (configurável: 650/700 MB, 4,3 GB para DVD), **~255 arquivos por pasta**, **~999 por disco** | Limites comuns dos aparelhos |

### 4.C Ajustes para **CD de áudio**
- **WAV** 44,1 kHz / 16 bits / estéreo, um por faixa.
- **Divisão em discos** de até **~79 min e 99 faixas**.
- **Arquivo `.cue` por disco com CD-Text** (TITLE/PERFORMER de cada faixa). Programas como o ImgBurn gravam o CD já com os nomes, e aparelhos com CD-Text mostram no display.
- **Pausa entre faixas:** 2 s (padrão de CD) ou 0 s (sem pausa). Configurável.

### 4.D Volume uniforme (relacionada à feature futura **F4**)
- **Problema:** faixas de canais diferentes têm volumes muito diferentes. No computador isso se resolve com ReplayGain (tags), mas **CD player ignora essas tags**.
- **Solução:** ajustar o volume **na própria conversão**, com o filtro `loudnorm` do ffmpeg (EBU R128), alvo em torno de **−14 LUFS**. De preferência em duas passagens (medir, depois aplicar), para não distorcer.
- **Escopo:** vale para os dois tipos de CD. Deixar como opção.

### 4.E Planejador de discos (interface)
- **Entrada:** as faixas **selecionadas, na ordem escolhida** (as mesmas da tabela, incluindo [substituídas](../modulos/replace.md)).
- **Divisão:** mostra quantos discos dá e quais faixas vão em cada um, com duração e tamanho estimado por disco, conforme o tipo de CD e a taxa escolhidos.
- **Ajuste manual:** permite mover o corte entre discos (ex.: "começar o CD2 nesta faixa").
- **Exportar:** gera as pastas `CD1…CDn`, prontas para gravar.

### 4.F Gravação do CD
**Recomendação:** o app **não grava**, pelo menos num primeiro momento. Ele prepara as pastas, e a gravação usa ferramentas que já existem.

| Tipo | Como gravar |
|---|---|
| CD/DVD de MP3 | Arrastar a pasta `CDn` para o gravador no Explorador de Arquivos do Windows (gravação de dados nativa) |
| CD de áudio | ImgBurn ou CDBurnerXP (abrir o `.cue`, que já traz o CD-Text), ou o Windows Media Player (aba Gravar, modo "CD de áudio") |

**Gravar pelo app** seria possível pela API de gravação do Windows (**IMAPI2**, via COM/PowerShell). Mas é bastante trabalho e difícil de testar sem gravar discos de verdade. Fica como evolução possível.

## 5. Peças do app que já existem e seriam reaproveitadas
| Peça | Uso na exportação |
|---|---|
| ffmpeg gerenciado ([deps](../modulos/deps.md)) | Conversão MP3/WAV, `loudnorm`, capa |
| Ordem escolhida + seleção da tabela ([ui-playlist](../modulos/ui-playlist.md)) | Quais faixas e em que ordem |
| Fila (processos, progresso, erros, cancelar; [queue](../modulos/queue.md)) | Modelo para a fila de conversão |
| Tabela `downloads` + chave de nome ([extras](../modulos/extras.md)) | Achar o arquivo original de cada faixa |
| Substituições ([replace](../modulos/replace.md)) | Faixas trocadas entram normalmente, na posição original |
| Log de erros ([errors](../modulos/errors.md)) | Falhas de conversão |

## 6. Pré-requisito: numeração pela posição na playlist
**Hoje:** a opção "Numerar arquivos" (`numberFiles`) numera por padrão **pela ordem do lote enfileirado** (`numberMode: 'batch'`): se você enfileirar 25 faixas depois, elas recebem `01…25`. Já existe o modo `position`, que usa o "#" da ordem escolhida (inclusive a ordem personalizada), mas ele é aplicado no download.

**Para CD:** a numeração precisa seguir sempre a **posição na playlist** (ou a ordem escolhida), aplicada **na exportação**, não no download.

## 7. Ordem de implementação sugerida
1. **Exportar CD de MP3:** conversão, numeração pela playlist, nomes seguros, ID3v2.3, capa pequena e divisão por disco. Resolve a playlist de referência com ~6–10 discos.
2. **Volume uniforme** como opção da exportação.
3. **Exportar CD de áudio:** WAV, `.cue` com CD-Text, discos de 80 min e 99 faixas.
4. **Planejador** com ajuste manual dos cortes entre discos.
5. (Opcional) **Gravar pelo app** via IMAPI2.

## 8. Riscos e cuidados
- **Compatibilidade varia muito entre aparelhos** (MP3, VBR, capa, profundidade de pastas, quantidade de arquivos, caracteres). Vale gravar **um CD-RW de teste** antes de gravar todos.
- **Caracteres não latinos** (coreano, japonês) podem aparecer como "?" ou não aparecer no display. Pode ser preciso transliterar ou usar só o número da faixa.
- **Espaço em disco:** a exportação em WAV de ~48 h ocupa **~29 GB** (~10 MB/min). Em MP3 320k, **~6,6 GB**.
- **Perda de qualidade** na conversão opus → mp3 (seção 3).

## 9. Decisões em aberto
| # | Decisão | Opções | Depende de |
|---|---|---|---|
| D1 | **Tipo de CD** | CD de áudio · CD de MP3 · DVD de MP3 | O aparelho tocar MP3 (procurar logo "MP3" no aparelho ou manual) e/ou DVD |
| D2 | **Origem dos arquivos** | Manter biblioteca em opus e **exportar cópias** (recomendado) · baixar direto em mp3 | Se a biblioteca também será usada fora do CD |
| D3 | **Taxa do MP3** | 320 kbps (melhor, ~10 discos) · 256 kbps (~8) · 192 kbps (~6) | Qualidade × quantidade de discos |
| D4 | **Display do aparelho** | Mostra nomes (ID3/CD-Text) · só número da faixa | Define se vale investir em tags, CD-Text e nomes |
| D5 | **Capa no MP3** | Pequena · sem capa | Comportamento do aparelho |
| D6 | **Volume uniforme** | Sim (`loudnorm`) · não | Preferência ao ouvir |
| D7 | **Pausa entre faixas** (CD de áudio) | 2 s · 0 s | Preferência (mixes contínuos pedem 0 s) |
| D8 | **Gravação** | Ferramentas externas (recomendado) · gravar pelo app | Frequência de uso |
| D9 | **Mídia** | CD-R (definitivo) · CD-RW (regravável; alguns aparelhos antigos não leem) | Aparelho e uso |
