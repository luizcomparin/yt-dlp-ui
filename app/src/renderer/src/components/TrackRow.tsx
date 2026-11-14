import { memo, useState } from 'react'
import type { Availability } from '@shared/ipc'
import { formatLabel, isUnavailable, needsReplacement, pickFormat } from '@shared/tracks'
import { fileMatch, usePlaylist } from '@renderer/store/playlist'
import { useSettings } from '@renderer/store/settings'
import { useQueue } from '@renderer/store/queue'
import { currentOrderedTracks } from '@renderer/store/useVisibleTracks'
import { formatBytes, formatDate, formatDuration } from '@renderer/lib/format'

/** Status do download desta faixa (fila ou archive), exibido ao lado do título. Usa o vídeo EFETIVO (substituto, se houver). */
function useDownloadBadge(rowId: string): { label: string; cls: string; title?: string } | null {
  const videoId = usePlaylist((s) => s.tracks[rowId]?.videoId ?? rowId)
  const job = useQueue((s) => {
    const id = s.byVideo[videoId]
    return id ? s.jobs[id] : undefined
  })
  const archived = usePlaylist((s) => !!s.archived[videoId])
  const sameName = usePlaylist((s) => (s.tracks[rowId] ? fileMatch(s.tracks[rowId], s.fileKeys) : null))
  const elsewhere = usePlaylist((s) => s.elsewhere[videoId])
  const outputDir = useSettings((s) => s.settings?.outputDir)
  if (job) {
    switch (job.status) {
      case 'running': {
        const p = job.progress
        const pct = p?.totalBytes ? Math.round((p.downloadedBytes / p.totalBytes) * 100) : null
        const label = job.postprocessor ? 'processando' : !p ? 'preparando' : `baixando${pct != null ? ` ${pct}%` : ''}`
        return { label, cls: 'bg-sky-500/15 text-sky-300' }
      }
      case 'queued':
        return { label: 'na fila', cls: 'bg-white/10 text-white/60' }
      case 'paused':
        return { label: 'pausado', cls: 'bg-amber-500/15 text-amber-300' }
      case 'error':
        return { label: 'erro', cls: 'bg-rose-500/15 text-rose-300' }
      default:
        break // done/skipped: cai na marca "baixada" abaixo
    }
  }
  // job concluído só conta se foi na pasta atual (trocar a pasta muda o que está "baixado")
  const doneHere = (job?.status === 'done' || job?.status === 'skipped') && job.outputDir === outputDir
  if (archived || doneHere) return { label: '✓ baixada', cls: 'bg-emerald-500/15 text-emerald-300' }
  // R14: arquivo com o mesmo nome na pasta (baixado fora do app ou antes do histórico)
  if (sameName) return { label: 'já existe na pasta', cls: 'bg-amber-500/15 text-amber-300', title: `Arquivo com o mesmo nome: ${sameName}` }
  if (elsewhere) return { label: 'baixada em outra pasta', cls: 'bg-white/10 text-white/50', title: elsewhere }
  return null
}

const BADGE: Record<Availability, { label: string; cls: string }> = {
  pending: { label: '', cls: '' },
  available: { label: '', cls: '' },
  private: { label: 'privado', cls: 'bg-rose-500/15 text-rose-300' },
  deleted: { label: 'removido', cls: 'bg-rose-500/15 text-rose-300' },
  unavailable: { label: 'indisponível', cls: 'bg-rose-500/15 text-rose-300' },
  restricted: { label: 'restrito', cls: 'bg-amber-500/15 text-amber-300' }
}

/** Larguras das colunas, compartilhadas com o cabeçalho da tabela. */
export const COLS = {
  check: 'w-6',
  index: 'w-9',
  thumb: 'w-16',
  // escondida quando a tabela é estreita (container query no PlaylistView)
  date: 'w-20 hidden @4xl:block',
  duration: 'w-12',
  format: 'w-24',
  size: 'w-16',
  action: 'w-7'
}

interface Props {
  /** Identidade da linha (vídeo original). */
  rowId: string
  /** Ordem visível atual (para seleção com shift). */
  visibleIds: string[]
  /** Posição na ordem escolhida (1 = primeira), sem considerar filtros. */
  position: number
  /** Total de faixas (largura da numeração e limite da posição). */
  total: number
  /** Prévia do prefixo do arquivo ("007"); ausente = sem numeração ou faixa fora do próximo lote. */
  numberLabel?: string
}

/** Número da posição; clicar vira um campo para mover a faixa (ordem "Personalizada"). */
function PositionCell({ rowId, position, total, playlistIndex, className }: { rowId: string; position: number; total: number; playlistIndex: number; className: string }) {
  const [editing, setEditing] = useState(false)
  const commit = (raw: string): void => {
    setEditing(false)
    const n = Number(raw)
    if (!raw.trim() || !Number.isFinite(n) || Math.round(n) === position) return
    usePlaylist.getState().moveTrack(rowId, n, currentOrderedTracks().map((t) => t.rowId))
  }
  if (editing) {
    return (
      <input
        type="number"
        min={1}
        max={total}
        autoFocus
        defaultValue={position}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') setEditing(false)
        }}
        className={`${COLS.index} shrink-0 [appearance:textfield] rounded border border-sky-500 bg-[#1a1d23] px-0.5 text-right tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none`}
        aria-label="Nova posição"
      />
    )
  }
  return (
    <button
      className={`${COLS.index} shrink-0 rounded text-right text-white/30 tabular-nums hover:bg-white/10 hover:text-white ${className}`}
      onClick={() => setEditing(true)}
      title={`Posição ${position}${playlistIndex !== position ? ` (nº ${playlistIndex} na playlist do YouTube)` : ''}. Clique para mover para outra posição.`}
    >
      {position}
    </button>
  )
}

export const TrackRow = memo(function TrackRow({ rowId, visibleIds, position, total, numberLabel }: Props) {
  // seletores por faixa: só a linha afetada re-renderiza
  const t = usePlaylist((s) => s.tracks[rowId])
  const checked = usePlaylist((s) => !!s.selected[rowId])
  const override = usePlaylist((s) => s.formatOverride[rowId])
  const setReplacing = usePlaylist((s) => s.setReplacing)
  const toggle = usePlaylist((s) => s.toggle)
  const setFormatOverride = usePlaylist((s) => s.setFormatOverride)
  const pref = useSettings((s) => s.settings?.audioFormat ?? 'best')
  const numberMode = useSettings((s) => s.settings?.numberMode ?? 'batch')
  const playlistId = usePlaylist((s) => s.playlist?.id ?? null)
  const dl = useDownloadBadge(rowId)
  if (!t) return null

  const blocked = isUnavailable(t.availability)
  const dim = blocked ? 'opacity-45' : ''
  // mesma regra do filtro "Precisam substituir"
  const replaceable = needsReplacement(t)
  const badge = BADGE[t.availability]
  const fmt = pickFormat(t, pref, override)
  const size = fmt?.filesize ?? t.sizeBytes
  const sizeEstimate = fmt ? fmt.filesizeIsEstimate : t.sizeIsEstimate

  const download = (): void => {
    // só esta faixa: por lote vira "01"; pela posição, o número da coluna #
    const n = numberMode === 'position' ? { number: position, numberTotal: total } : { number: 1, numberTotal: 1 }
    void window.api.queue.add([{ videoId: t.videoId, url: t.url, title: t.title, playlistId, formatId: override, ...n }])
  }

  return (
    <div
      className={`flex h-full items-center gap-3 border-b border-white/5 px-3 text-xs ${checked ? 'bg-sky-500/5' : ''}`}
    >
      <span className={`${COLS.check} ${dim}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={blocked}
          onChange={() => {}}
          onClick={(e) => toggle(rowId, e.shiftKey, visibleIds)}
          aria-label={`Selecionar ${t.title}`}
        />
      </span>
      <PositionCell rowId={rowId} position={position} total={total} playlistIndex={t.index} className={dim} />
      <img src={t.thumbnail} alt="" loading="lazy" className={`h-9 ${COLS.thumb} shrink-0 rounded bg-white/5 object-cover ${dim}`} />
      {/* marcas na 2ª linha, junto do canal: o título nunca é espremido por elas */}
      <div className={`min-w-0 flex-1 ${dim}`}>
        {/* com "Numerar arquivos": prévia do nome ("001 - Título"), mesmo número usado no download */}
        <div className="truncate font-medium" title={numberLabel ? `${numberLabel} - ${t.title}` : t.title}>
          {numberLabel && (
            <span
              className="text-sky-300/70 tabular-nums"
              title={numberMode === 'batch' ? 'Número que o arquivo vai receber no próximo "Baixar selecionadas" (muda com a seleção e os filtros)' : 'Número do arquivo = posição na ordem escolhida'}
            >
              {numberLabel} -{' '}
            </span>
          )}
          {t.title}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-white/40">
          {t.replacedFrom && (
            <button
              className="shrink-0 rounded bg-sky-500/15 px-1 text-[10px] leading-4 text-sky-300 hover:bg-sky-500/30"
              title={`Substituída. Original: ${t.replacedFrom.title}${t.replacedFrom.availabilityReason ? ` (${t.replacedFrom.availabilityReason})` : ''}. Clique para trocar ou desfazer.`}
              onClick={() => setReplacing(rowId)}
            >
              ⇄ substituída
            </button>
          )}
          {dl && <span className={`shrink-0 rounded px-1 text-[10px] leading-4 tabular-nums ${dl.cls}`} title={dl.title}>{dl.label}</span>}
          {badge.label && <span className={`shrink-0 rounded px-1 text-[10px] leading-4 ${badge.cls}`}>{badge.label}</span>}
          <span className="truncate">
            {t.channel ?? '—'}
            {t.availabilityReason && t.availability !== 'available' && ` · ${t.availabilityReason}`}
          </span>
        </div>
      </div>
      <span className={`${COLS.date} shrink-0 text-right text-white/50 tabular-nums ${dim}`}>
        {t.availability === 'pending' && !t.uploadDate ? <span className="text-white/20">…</span> : formatDate(t.uploadDate)}
      </span>
      <span className={`${COLS.duration} shrink-0 text-right tabular-nums ${dim}`}>{formatDuration(t.duration)}</span>
      <span className={`${COLS.format} shrink-0`}>
        {replaceable ? (
          <button
            className="w-full rounded border border-sky-500/40 px-1 py-0.5 text-[11px] text-sky-300 hover:bg-sky-500/15"
            onClick={() => setReplacing(rowId)}
            title="Trocar por outro vídeo (link ou busca), mantendo a posição na playlist"
          >
            ⇄ substituir
          </button>
        ) : t.formats.length > 0 ? (
          <select
            className={`w-full rounded border bg-transparent px-1 py-0.5 text-[11px] hover:border-white/20 focus:bg-[#1a1d23] ${override ? 'border-sky-500/50 text-sky-300' : 'border-transparent text-white/60'}`}
            value={override ?? ''}
            onChange={(e) => setFormatOverride(rowId, e.target.value || null)}
            title="Formato desta faixa"
          >
            <option value="">{fmt ? formatLabel(fmt) : 'auto'}</option>
            {t.formats.map((f) => (
              <option key={f.formatId} value={f.formatId}>
                {formatLabel(f)} · {f.ext}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-white/20">—</span>
        )}
      </span>
      <span className={`${COLS.size} shrink-0 text-right text-white/60 tabular-nums ${dim}`}>
        {size != null ? `${sizeEstimate ? '~' : ''}${formatBytes(size)}` : '—'}
      </span>
      <span className={`${COLS.action} shrink-0 text-right ${dim}`}>
        <button
          className="rounded px-1.5 py-0.5 text-sm text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30"
          disabled={blocked}
          onClick={download}
          title="Adicionar só esta faixa à fila"
          aria-label={`Baixar ${t.title}`}
        >
          ↓
        </button>
      </span>
    </div>
  )
})
