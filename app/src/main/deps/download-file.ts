import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { once } from 'node:events'

/**
 * Baixa uma URL para `dest` (via arquivo temporário `.download`, renomeado no fim).
 * `onProgress` é chamado no máximo a cada ~200 ms.
 */
export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (received: number, total: number | null) => void
): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ao baixar ${url}`)

  const total = Number(res.headers.get('content-length')) || null
  const tmp = `${dest}.download`
  const file = createWriteStream(tmp)
  let received = 0
  let lastEmit = 0

  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.length
      if (!file.write(chunk)) await once(file, 'drain')
      const now = Date.now()
      if (now - lastEmit > 200) {
        lastEmit = now
        onProgress?.(received, total)
      }
    }
    file.end()
    await once(file, 'finish')
  } catch (e) {
    file.destroy()
    await rm(tmp, { force: true })
    throw e
  }

  onProgress?.(received, total)
  await rename(tmp, dest)
}
