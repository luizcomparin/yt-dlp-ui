import { PRESET_KEYS, type Preset, type PresetValues, type Settings } from './ipc'

/** Valores de um preset a partir das configurações atuais. */
export function presetValuesFrom(s: Settings): PresetValues {
  return Object.fromEntries(PRESET_KEYS.map((k) => [k, s[k]])) as PresetValues
}

/** Valores para chaves que presets antigos (salvos antes de a chave existir) não têm. */
const PRESET_FALLBACK: Partial<PresetValues> = { numberMode: 'batch' }

/** Valores completos de um preset (completa chaves ausentes em presets antigos). */
export const presetValuesOf = (p: Preset): PresetValues => ({ ...PRESET_FALLBACK, ...p.values }) as PresetValues

/** Preset cujos valores são iguais às configurações atuais (para mostrar qual está ativo). */
export function matchingPreset(s: Settings, presets: Preset[]): Preset | null {
  return presets.find((p) => {
    const v = presetValuesOf(p)
    return PRESET_KEYS.every((k) => v[k] === s[k])
  }) ?? null
}

/** Cria/atualiza um preset pelo nome (nome igual, ignorando caixa, sobrescreve). */
export function upsertPreset(presets: Preset[], name: string, values: PresetValues, newId: () => string): Preset[] {
  const clean = name.trim()
  if (!clean) throw new Error('Dê um nome ao preset.')
  const i = presets.findIndex((p) => p.name.toLowerCase() === clean.toLowerCase())
  if (i >= 0) return presets.map((p, j) => (j === i ? { ...p, name: clean, values } : p))
  return [...presets, { id: newId(), name: clean, values }]
}
