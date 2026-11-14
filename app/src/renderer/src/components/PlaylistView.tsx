import { useMemo, useState } from 'react'
import type { AudioPreference } from '@shared/ipc'
import { AVAILABILITY_FILTERS, CUSTOM_SORT_ID, CUSTOM_SORT_LABEL, isUnavailable, matchesAvailability, numberPrefix, SORT_PRESETS, type AvailabilityFilter } from '@shared/tracks'
import { alreadyInFolder, fileMatch, usePlaylist } from '@renderer/store/playlist'
import { useSettings } from '@renderer/store/settings'
import { useQueue } from '@renderer/store/queue'
import { useErrorVideoIds, useOrderedTracks, useSelectionSummary, useVisibleTracks, writeCurrentM3u } from '@renderer/store/useVisibleTracks'
import { formatBytes, formatDuration } from '@renderer/lib/format'
import { TrackTable } from './TrackTable'
import { ReplaceDialog } from './ReplaceDialog'

const control = 'rounded border border-white/10 bg-[#1a1d23] px-2 py-1 text-xs outline-none focus:border-sky-500'
const button = 'shrink-0 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40'

const AUDIO_OPTIONS: Array<{ value: AudioPreference; label: string }> = [
  { value: 'best', label: 'Melhor disponível' },
  { value: 'opus', label: 'Opus (.opus)' },
  { value: 'm4a', label: 'AAC (.m4a)' }
]

export function PlaylistView() {
  const playlist = usePlaylist((s) => s.playlist)
  const order = usePlaylist((s) => s.order)
  const tracks = usePlaylist((s) => s.tracks)
  const status = usePlaylist((s) => s.status)
  const enrich = usePlaylist((s) => s.enrich)
  const warnings = usePlaylist((s) => s.warnings)
  const error = usePlaylist((s) => s.error)
  const url = usePlaylist((s) => s.url)
  const sortId = usePlaylist((s) => s.sortId)
  const hasCustomOrder = usePlaylist((s) => !!s.customOrder)
  const filterText = usePlaylist((s) => s.filterText)
  const availabilityFilter = usePlaylist((s) => s.availabilityFilter)
  const { load, cancel, setSort, setFilterText, setAvailabilityFilter, setSelected, invertSelection } = usePlaylist.getState()
  const audioFormat = useSettings((s) => s.settings?.audioFormat ?? 'best')
  const saveSettings = useSettings((s) => s.save)

  const archived = usePlaylist((s) => s.archived)
  const replacing = usePlaylist((s) => s.replacing)
  const setReplacing = usePlaylist((s) => s.setReplacing)
  const fileKeys = usePlaylist((s) => s.fileKeys)
  const ordered = useOrderedTracks()
  const visible = useVisibleTracks(ordered)
  // posição de cada linha na ordem escolhida (independe dos filtros): coluna #, numeração e mover faixa
  const positions = useMemo(() => new Map(ordered.map((t, i) => [t.rowId, i + 1])), [ordered])
  const errorVideoIds = useErrorVideoIds()
  const selection = useSelectionSummary()
  const [notice, setNotice] = useState<string | null>(null)

  const stats = useMemo(() => {
    let unavailable = 0
    let pending = 0
    let downloaded = 0
    let sameName = 0
    const byFilter = Object.fromEntries(AVAILABILITY_FILTERS.map((f) => [f.id, 0])) as Record<AvailabilityFilter, number>
    for (const id of order) {
      const t = tracks[id]
      if (!t) continue
      if (isUnavailable(t.availability)) unavailable++
      if (t.availability === 'pending') pending++
      if (archived[t.videoId]) downloaded++ // vídeo efetivo (substituto, se houver)
      else if (fileMatch(t, fileKeys)) sameName++
      for (const f of AVAILABILITY_FILTERS) if (matchesAvailability(t, f.id, errorVideoIds)) byFilter[f.id]++
    }
    return { unavailable, pending, downloaded, sameName, byFilter }
  }, [order, tracks, archived, fileKeys, errorVideoIds])

  // selecionadas que ainda NÃO estão na fila (pendentes/concluídas) nem baixadas — erros contam (serão re-tentados no lugar)
  const queueJobs = useQueue((s) => s.jobs)
  const queueByVideo = useQueue((s) => s.byVideo)
  const outputDir = useSettings((s) => s.settings?.outputDir)
  const selectedMap = usePlaylist((s) => s.selected)
  // `batch` = as que viram arquivo NOVO no próximo "Baixar selecionadas" (base da numeração por lote);
  // as com erro também contam no botão, mas são re-tentadas no job antigo (mantêm o nome que já tinham)
  const { newToDownload, batch } = useMemo(() => {
    let retry = 0
    const batch: string[] = []
    for (const t of visible) {
      if (!selectedMap[t.rowId] || isUnavailable(t.availability) || archived[t.videoId]) continue
      const jid = queueByVideo[t.videoId]
      const j = jid ? queueJobs[jid] : undefined
      if (j && j.outputDir === outputDir) {
        if (j.status === 'error') retry++
        continue
      }
      batch.push(t.rowId)
    }
    return { newToDownload: batch.length + retry, batch }
  }, [visible, selectedMap, archived, queueByVideo, queueJobs, outputDir])

  // numeração dos arquivos ("Numerar arquivos"): mesmo número na prévia do título e no download
  const numberFiles = useSettings((s) => !!s.settings?.numberFiles)
  const numberMode = useSettings((s) => s.settings?.numberMode ?? 'batch')
  const numbering = useMemo((): Map<string, { number: number; total: number }> => {
    if (numberMode === 'position') return new Map(ordered.map((t, i) => [t.rowId, { number: i + 1, total: ordered.length }]))
    return new Map(batch.map((id, i) => [id, { number: i + 1, total: batch.length }]))
  }, [numberMode, ordered, batch])
  const numberLabels = useMemo(
    () => (numberFiles ? new Map([...numbering].map(([id, n]) => [id, numberPrefix(n.number, n.total)])) : null),
    [numberFiles, numbering]
  )

  /** Enfileira as selecionadas na ordem visível (= ordem escolhida, R4). */
  const enqueueSelected = async (): Promise<void> => {
    const { selected, formatOverride, playlist: pl } = usePlaylist.getState()
    const items = visible
      .filter((t) => selected[t.rowId] && !isUnavailable(t.availability))
      .map((t) => ({
        videoId: t.videoId, url: t.url, title: t.title, playlistId: pl?.id ?? null, formatId: formatOverride[t.rowId],
        // fora de `numbering` (lote): já na fila/baixadas/re-tentativas, que não geram arquivo novo
        number: numbering.get(t.rowId)?.number, numberTotal: numbering.get(t.rowId)?.total
      }))
    if (!items.length) return
    const r = await window.api.queue.add(items)
    setNotice(
      `${r.added} faixas adicionadas à fila` + (r.retried ? `, ${r.retried} com erro re-tentadas no lugar` : '') + (r.skippedDuplicates ? ` (${r.skippedDuplicates} já estavam na fila)` : '') +
        (visible.length < order.length ? '. Faixas ocultas pelos filtros não foram incluídas.' : '.')
    )
    setTimeout(() => setNotice(null), 6000)
  }

  /** Sincronizar (R9): seleciona só as visíveis que ainda não foram baixadas. */
  const selectNotDownloaded = (): void => {
    const ids = visible.map((t) => t.rowId)
    setSelected(ids, false)
    const s = usePlaylist.getState()
    setSelected(ids.filter((id) => s.tracks[id] && !alreadyInFolder(s.tracks[id], s)), true)
  }

  const makeM3u = async (): Promise<void> => {
    const r = await writeCurrentM3u()
    if (!r) return
    setNotice(
      r.path
        ? `M3U com ${r.written} faixas salvo${r.missing ? ` (${r.missing} ainda não baixadas ficaram de fora)` : ''}${r.dated ? `; datas de ${r.dated} arquivos ajustadas na ordem` : ''}: ${r.path}`
        : 'Nenhuma faixa desta playlist foi encontrada na pasta ainda.'
    )
    setTimeout(() => setNotice(null), 8000)
  }

  if (status === 'idle') {
    return <div className="flex h-full items-center justify-center text-sm text-white/40">Cole o link de uma playlist ou vídeo e clique em Carregar.</div>
  }

  if (status === 'error' && order.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
      </div>
    )
  }

  const busy = status === 'listing' || status === 'enriching'
  const sortNeedsDate = sortId === 'newest' || sortId === 'oldest'
  const visibleIds = visible.map((t) => t.rowId)

  return (
    <div className="@container flex h-full flex-col">
      {/* cabeçalho da playlist */}
      <div className="border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{playlist?.title ?? (status === 'listing' ? 'Carregando…' : '—')}</div>
            <div className="text-xs text-white/40">
              {playlist?.channel && `${playlist.channel} · `}
              {order.length} faixas
              {stats.downloaded > 0 && ` · ${stats.downloaded} já baixadas`}
              {stats.sameName > 0 && ` · ${stats.sameName} já existem na pasta`}
              {stats.unavailable > 0 && ` · ${stats.unavailable} indisponíveis`}
              {stats.byFilter.replaced > 0 && ` · ${stats.byFilter.replaced} substituídas`}
              {status === 'listing' && ' · listando…'}
              {enrich && status === 'enriching' && ` · buscando detalhes ${enrich.done}/${enrich.total}`}
            </div>
          </div>
          {busy ? (
            <button className={button} onClick={() => void cancel()}>parar</button>
          ) : (
            <button className={button} onClick={() => void load(url, true)} title="Ignora o cache e busca todos os detalhes de novo">
              atualizar tudo
            </button>
          )}
        </div>
        {enrich && status === 'enriching' && (
          <div className="mt-2 h-1 overflow-hidden rounded bg-white/10">
            <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${(enrich.done / Math.max(1, enrich.total)) * 100}%` }} />
          </div>
        )}
        {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}
        {warnings.map((w, i) => (
          <div key={i} className="mt-1 text-xs text-amber-300/80">⚠ {w}</div>
        ))}
      </div>

      {/* barra de ferramentas: busca, ordenação, filtros, formato */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-xs">
        <input
          className={`${control} w-56`}
          placeholder="Buscar título ou canal…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <label className="flex items-center gap-1.5">
          <span className="text-white/50">Ordenar</span>
          <select
            className={control}
            value={sortId}
            onChange={(e) => setSort(e.target.value)}
            title="Também é a ordem de download. Para mover uma faixa, clique no número da posição (#) e digite a nova posição."
          >
            {SORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
            {(hasCustomOrder || sortId === CUSTOM_SORT_ID) && <option value={CUSTOM_SORT_ID}>{CUSTOM_SORT_LABEL}</option>}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-white/50">Formato</span>
          <select
            className={control}
            value={audioFormat}
            onChange={(e) => void saveSettings({ audioFormat: e.target.value as AudioPreference })}
            title="Formato padrão (sem recodificar). Pode ser trocado por faixa na coluna Formato."
          >
            {AUDIO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-white/50">Exibir</span>
          <select
            className={`${control} ${availabilityFilter === 'needs-replacement' ? 'border-sky-500/60 text-sky-300' : availabilityFilter === 'errors' ? 'border-rose-500/60 text-rose-300' : ''}`}
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as AvailabilityFilter)}
            title="Filtrar por disponibilidade. 'Precisam substituir' = privadas, removidas, bloqueadas e restritas sem formatos, ainda não substituídas."
          >
            {AVAILABILITY_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({stats.byFilter[f.id]})
              </option>
            ))}
          </select>
        </label>
        {sortNeedsDate && stats.pending > 0 && (
          <span className="text-amber-300/70" title="A data de publicação chega com o enriquecimento">
            {stats.pending} faixas ainda sem data (no fim da lista)
          </span>
        )}
      </div>

      <TrackTable tracks={visible} positions={positions} total={ordered.length} numberLabels={numberLabels} />

      {replacing && <ReplaceDialog rowId={replacing} onClose={() => setReplacing(null)} />}

      {/* barra de seleção */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-white/10 bg-white/2 px-3 py-2 text-xs">
        <span className="whitespace-nowrap">
          <b>{selection.count}</b> selecionadas · {formatDuration(selection.duration)} ·{' '}
          {selection.sizeIsEstimate ? '~' : ''}
          {formatBytes(selection.size)}
        </span>
        <span className="text-white/30">
          {visible.length !== order.length && `(${visible.length} visíveis)`}
        </span>
        <span className="flex-1" />
        {notice && <span className="text-emerald-300/90">{notice}</span>}
        <button className={button} onClick={() => void makeM3u()} title="Gera/atualiza a playlist .m3u8 na pasta de destino, na ordem exibida">
          M3U
        </button>
        <button className={button} onClick={selectNotDownloaded} title="Seleciona as visíveis que ainda não estão na pasta (sincronizar)">
          só não baixadas
        </button>
        <button className={button} onClick={() => setSelected(visibleIds, true)}>marcar visíveis</button>
        <button className={button} onClick={() => setSelected(visibleIds, false)}>desmarcar visíveis</button>
        <button className={button} onClick={() => invertSelection(visibleIds)}>inverter</button>
        <button
          className="shrink-0 rounded bg-sky-600 px-3 py-1 text-xs font-medium hover:bg-sky-500 disabled:opacity-40"
          disabled={newToDownload === 0}
          onClick={() => void enqueueSelected()}
          title={
            selection.count > 0 && newToDownload === 0
              ? 'As selecionadas já estão na fila ou já foram baixadas'
              : 'Adiciona à fila as selecionadas que ainda não estão nela, na ordem exibida (erros são re-tentados na mesma posição)'
          }
        >
          Baixar selecionadas ({newToDownload})
        </button>
      </div>
    </div>
  )
}
