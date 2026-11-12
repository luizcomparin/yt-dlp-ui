# Módulo: substituir faixa

> Arquivos:
> - main: `src/main/playlist/replace.ts` (busca, validação, desfazer), `src/main/db/library.ts` (`getRow`, `setReplacement`, `clearReplacement`, `indexOf`)
> - UI: `components/ReplaceDialog.tsx`, botão "⇄ substituir" e marca "⇄ substituída" em `components/TrackRow.tsx`, `setRow`/`replacing` em `store/playlist.ts`
>
> Pedido pelo usuário depois da fase 8 (não estava no plano original).

## Problema
Faixas privadas, removidas ou bloqueadas continuam na playlist, muitas vezes com o título visível. O mesmo áudio costuma existir em outro vídeo (reupload, canal oficial, outro canal). A ideia é trocar o vídeo **mantendo a posição** da faixa na playlist, para a ordem, a numeração e o M3U continuarem certos.

## Encontrar as faixas
O filtro **Exibir → "Precisam substituir (N)"** lista só as faixas que precisam de um substituto (`needsReplacement`, a mesma regra do botão). **"Substituídas (N)"** lista as já trocadas. Ver [ui-playlist](ui-playlist.md#filtros-r6).

## Conceito: `rowId` × `videoId`
`Track` tem dois identificadores:

| Campo | O que é | Usado para |
|---|---|---|
| `rowId` | Vídeo **original** da playlist (identidade da linha) | Chave da tabela, ordem, seleção, formato escolhido por faixa |
| `videoId` | Vídeo que será **baixado** (o substituto, se houver) | Fila, archive ("✓ baixada"), "baixada em outra pasta", M3U |

Sem substituição os dois são iguais. Com substituição, `replacedFrom` traz título, disponibilidade e motivo do original.

## Fluxo
```
"⇄ substituir" (linha indisponível, ou restrita sem formatos)
  └ ReplaceDialog
       ├ busca automática com o título original (sem "[Official…]" etc.); vazia se a faixa não tem título
       │    playlist:search → yt-dlp --flat-playlist "ytsearch8:<busca>" → 8 candidatos (capa, canal, duração)
       ├ "ver" abre o vídeo no navegador (só links do YouTube são aceitos)
       └ "usar" / "usar link" → playlist:replace { playlistId, originalId, url }
            1. aceita link (watch?v=, youtu.be, shorts…) ou id de 11 caracteres
            2. valida com extração completa (mesmos campos do enriquecimento + título/canal)
            3. recusa se o substituto também estiver indisponível ("Esse vídeo também está indisponível…")
            4. grava o vídeo no cache (videos) e a substituição (replacements, migração 5)
            5. devolve a linha atualizada → setRow (marcada para download; formato manual da linha é descartado)
"⇄ substituída" (clique) → mesma janela, com "desfazer substituição" → playlist:unreplace
```

**Persistência:**
- **Por playlist:** a tabela `replacements` é chaveada por `(playlist_id, original_id)` e aplicada sempre que a playlist é lida (`getPlaylistTracks`, `getRow`), do cache ou de uma nova listagem.
- **Enriquecimento:** linhas substituídas não são re-enriquecidas, porque o substituto já foi validado ao substituir.

## Mensagens de erro
| Caso | Mensagem |
|---|---|
| Texto que não é link | "Link inválido: cole um link de vídeo do YouTube (watch?v=…, youtu.be/…) ou o id." |
| O próprio vídeo original | "Esse é o próprio vídeo original." |
| Substituto privado ou removido | "Não foi possível usar esse vídeo: vídeo privado (Private video.)" (só a 1ª frase do yt-dlp) |

## Validação (2026-11-11, cópia dos dados do usuário via `YTUI_USER_DATA`)
| Caso | Resultado |
|---|---|
| #61 "Raver Dimension" (indisponível) → busca automática → 1º resultado | Validado em 8 s. Linha continua #61, com data, formatos, 3,7 MB e "⇄ substituída", marcada para download |
| Recarregar a playlist | Substituição mantida |
| ↓ na #61 | Baixou `L6OjgvlRkcA` ("Raver Dimension - S3RL feat Emcee M.opus"); "✓ baixada"; M3U com o substituto |
| #68 (sem título) → busca vazia → colar link | Substituída; "desfazer" voltou a "removido · conta do canal encerrada" |
| Erros (link inválido, o próprio original, vídeo privado) | Mensagens da tabela acima |

O teste rodou numa **cópia** do banco do usuário, porque o app dele estava aberto. Os dados reais não receberam nenhuma substituição.
