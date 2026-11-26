import { supabase } from '@/lib/supabase'

export interface KantinProfile {
  id: string
  nama: string
  divisi?: string | null
  saldo: number
  status?: string | null
}

export interface OrderItemPayload {
  p_menu_id: string | null
  p_addon_id: string | null
  p_deskripsi_pesanan: string
  p_deskripsi_addon: string
  p_harga: number
  p_harga_addon: number
  p_tanggal: string
  p_tx_ket: string
}

export interface LiveSaldoCheckResult {
  ok: boolean
  saldo: number
  isInsufficient?: boolean
  requiredAmount?: number
  errorTitle?: string
  errorMessage?: string
}

/**
 * Returns current Jakarta (WIB) date (`YYYY-MM-DD`) and time (`HH:mm`).
 */
export function getJakartaDateTime(): { dateStr: string; timeStr: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())

  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  const rawHour = get('hour')
  const hour = rawHour === '24' ? '00' : rawHour

  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    timeStr: `${hour}:${get('minute')}`,
  }
}

export const INSUFFICIENT_SALDO_TITLE = 'Saldonya belum cukup nih, Kak 🥺🐾'
export const INSUFFICIENT_SALDO_IMAGE = '/saldo-tipis.jpg'

export function buildInsufficientSaldoMessage(saldo: number, requiredAmount: number): string {
  return (
    `Saldo kamu sekarang Rp ${saldo.toLocaleString('id-ID')}, sedangkan total pesananmu Rp ${requiredAmount.toLocaleString('id-ID')}.\n\n` +
    `Jangan biarin si meong nunggu kelamaan ya... yuk isi saldo sebentar biar bisa langsung pesan makan enak! 🍜✨`
  )
}

export interface DialogHandlers {
  showAlert: (opts: { title: string; message: string; type?: 'info' | 'error' | 'success' | 'warning'; imageUrl?: string; imageAlt?: string }) => void
  showConfirm: (opts: { title: string; message: string; confirmText?: string; cancelText?: string; imageUrl?: string; imageAlt?: string }) => Promise<boolean>
}

/**
 * Fetches live profile status & balance from DB and blocks orders whenever
 * resulting balance after the order would be negative (`saldo - requiredAmount < 0`).
 */
export async function fetchLiveSaldoAndValidate(
  profileId: string,
  requiredAmount = 0
): Promise<LiveSaldoCheckResult> {
  const { data: liveProfile, error } = await supabase
    .from('kantin_profiles')
    .select('id, saldo, status')
    .eq('id', profileId)
    .single()

  if (error || !liveProfile) {
    return {
      ok: false,
      saldo: 0,
      errorTitle: 'Sesi Tidak Valid',
      errorMessage: 'Data profil tidak ditemukan. Silakan login ulang.',
    }
  }

  if (liveProfile.status === 'inactive') {
    return {
      ok: false,
      saldo: liveProfile.saldo,
      errorTitle: 'Akun Nonaktif',
      errorMessage: 'Akun ini telah dinonaktifkan oleh Admin. Silakan hubungi Admin.',
    }
  }

  if (liveProfile.saldo - requiredAmount < 0) {
    return {
      ok: false,
      saldo: liveProfile.saldo,
      isInsufficient: true,
      requiredAmount,
      errorTitle: INSUFFICIENT_SALDO_TITLE,
      errorMessage: buildInsufficientSaldoMessage(liveProfile.saldo, requiredAmount),
    }
  }

  return { ok: true, saldo: liveProfile.saldo }
}

/**
 * Shows a cute dramatic Top Up prompt with the pleading cat image when balance is insufficient,
 * or a standard error alert otherwise.
 */
export async function handleFailedSaldoCheck(
  saldoCheck: LiveSaldoCheckResult,
  dialogs: DialogHandlers,
  onGoTopUp: () => void
): Promise<void> {
  if (saldoCheck.isInsufficient) {
    const goToTopUp = await dialogs.showConfirm({
      title: saldoCheck.errorTitle || INSUFFICIENT_SALDO_TITLE,
      message: saldoCheck.errorMessage || 'Yuk isi saldo sebentar biar bisa langsung pesan makan enak!',
      confirmText: 'Top Up Sekarang Yuk',
      cancelText: 'Nanti Dulu Ya',
      imageUrl: INSUFFICIENT_SALDO_IMAGE,
      imageAlt: 'Kucing imut memohon top up saldo',
    })
    if (goToTopUp) {
      onGoTopUp()
    }
    return
  }

  dialogs.showAlert({
    title: saldoCheck.errorTitle || 'Pemesanan Ditolak',
    message: saldoCheck.errorMessage || 'Tidak dapat memproses pesanan.',
    type: 'error',
  })
}

/**
 * Handles errors thrown during order submission; converts DB-level insufficient balance
 * exceptions into the same cute Top Up dialog instead of a generic error alert.
 */
export async function handleOrderError(
  err: unknown,
  dialogs: DialogHandlers,
  onGoTopUp: () => void,
  fallbackPrefix = 'Gagal memproses pesanan: '
): Promise<void> {
  const errMessage = err instanceof Error ? err.message : String((err as { message?: string })?.message || err || 'Unknown error')
  const match = errMessage.match(/Saldo kamu sekarang Rp\s*(-?\d+),\s*sedangkan total pesanannya Rp\s*(-?\d+)/i)
  if (match) {
    const saldo = parseInt(match[1], 10)
    const requiredAmount = parseInt(match[2], 10)
    await handleFailedSaldoCheck(
      {
        ok: false,
        saldo,
        isInsufficient: true,
        requiredAmount,
        errorTitle: INSUFFICIENT_SALDO_TITLE,
        errorMessage: buildInsufficientSaldoMessage(saldo, requiredAmount),
      },
      dialogs,
      onGoTopUp
    )
    return
  }

  if (/saldo.*(tidak mencukupi|minus)/i.test(errMessage)) {
    await handleFailedSaldoCheck(
      {
        ok: false,
        saldo: 0,
        isInsufficient: true,
        errorTitle: INSUFFICIENT_SALDO_TITLE,
        errorMessage: `${errMessage}\n\nJangan biarin si meong nunggu kelamaan ya... yuk isi saldo sebentar biar bisa langsung pesan makan enak! 🍜✨`,
      },
      dialogs,
      onGoTopUp
    )
    return
  }

  dialogs.showAlert({
    title: 'Gagal',
    message: `${fallbackPrefix}${errMessage}`,
    type: 'error',
  })
}

export interface ComboOrderEntry {
  menu_id: string | null
  addon_id: string | null
  note: string
  addonNote: string
  nama: string
  snapshotHarga: number
}

export interface TopOrderCombo {
  signature: string
  count: number
  lastDate: string
  items: ComboOrderEntry[]
  totalLivePrice: number
  hasSoldOut: boolean
  hasInactive: boolean
  hasCutoff: boolean
  hasClosed: boolean
}

export interface LastMealSuggestion {
  date: string
  items: any[]
  entries: ComboOrderEntry[]
  totalLivePrice: number
  hasSoldOut: boolean
  hasInactive: boolean
  hasCutoff: boolean
  hasClosed: boolean
}

export type MenuClosedReason = 'inactive' | 'cutoff' | null

export const CLOSED_MENU_IMAGE = '/pesanan-tutup.jpg'

export function getMenuClosedReason(
  menu: { is_active?: boolean | null; jam_tutup?: string | null },
  timeStr: string
): MenuClosedReason {
  if (menu.is_active === false) return 'inactive'
  if (menu.jam_tutup && timeStr >= menu.jam_tutup.substring(0, 5)) return 'cutoff'
  return null
}

export function isMenuClosed(
  menu: { is_active?: boolean | null; jam_tutup?: string | null },
  timeStr: string
): boolean {
  return getMenuClosedReason(menu, timeStr) !== null
}

export function showClosedMenuAlert(
  showAlert: DialogHandlers['showAlert'],
  menuName: string,
  reason: Exclude<MenuClosedReason, null>,
  jamTutup?: string | null
): void {
  if (reason === 'inactive') {
    showAlert({
      title: 'Yah, Tokonya Lagi Tutup Nih Kak 😿🐾',
      message:
        `Menu ${menuName} sedang ditutup oleh Admin nih...\n\n` +
        `Yuk pilih menu atau warung lain yang masih buka biar si meong gak ikutan sedih ya! 🍜💛`,
      type: 'warning',
      imageUrl: CLOSED_MENU_IMAGE,
      imageAlt: 'Kucing imut mengabari menu sedang tutup',
    })
    return
  }

  const jamLabel = jamTutup ? ` (${jamTutup.substring(0, 5)} WIB)` : ''
  showAlert({
    title: 'Yah, Udah Lewat Jam Tutup Nih Kak 😿🐾',
    message:
      `Batas waktu pemesanan untuk ${menuName}${jamLabel} sudah lewat nih...\n\n` +
      `Kalau memang butuh banget, coba langsung hubungi Mas Yana via WA ya Kak! 🙏✨`,
    type: 'warning',
    imageUrl: CLOSED_MENU_IMAGE,
    imageAlt: 'Kucing imut mengabari jam pesan sudah tutup',
  })
}

export function getProfileLookupFromStorage(): {
  savedName: string | null
  savedProfileId: string | null
  loginTime: string | null
} {
  return {
    savedName: localStorage.getItem('kantin_userName'),
    savedProfileId: localStorage.getItem('kantin_profile_id'),
    loginTime: localStorage.getItem('kantin_loginTime'),
  }
}

export function clearUserSessionStorage(): void {
  localStorage.removeItem('kantin_userName')
  localStorage.removeItem('kantin_loginTime')
  localStorage.removeItem('kantin_profile_id')
}

export function findProfileFromSession(profiles: KantinProfile[]): KantinProfile | undefined {
  const { savedName, savedProfileId } = getProfileLookupFromStorage()
  if (savedProfileId) {
    const byId = profiles.find(p => p.id === savedProfileId)
    if (byId) return byId
  }
  if (savedName) {
    return profiles.find(p => p.nama?.toLowerCase() === savedName.toLowerCase())
  }
  return undefined
}

export async function fetchProfileOrderSuggestions(
  profileId: string,
  menus: any[],
  addons: any[],
  beforeDateStr: string,
  options?: { ignoreCutoff?: boolean }
): Promise<{ lastMeal: LastMealSuggestion | null; topCombos: TopOrderCombo[] }> {
  const { data: pastOrders } = await supabase
    .from('kantin_orders')
    .select(`
      id, tanggal, created_at, menu_id, addon_id,
      deskripsi_pesanan, deskripsi_addon, harga, harga_addon, status,
      kantin_menus(nama, harga, is_active, is_habis, jam_tutup),
      kantin_addons(nama, harga, is_active, is_habis)
    `)
    .eq('profile_id', profileId)
    .neq('status', 'dibatalkan')
    .lt('tanggal', beforeDateStr)
    .order('tanggal', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(300)

  if (!pastOrders || pastOrders.length === 0) {
    return { lastMeal: null, topCombos: [] }
  }

  const jakartaNow = getJakartaDateTime().timeStr

  const evaluateEntries = (entries: ComboOrderEntry[]) => {
    let totalLivePrice = 0
    let hasSoldOut = false
    let hasInactive = false
    let hasCutoff = false

    for (const entry of entries) {
      if (entry.menu_id) {
        const liveMenu = menus.find(m => m.id === entry.menu_id)
        if (!liveMenu || liveMenu.is_active === false) {
          hasInactive = true
          totalLivePrice += liveMenu?.harga ?? entry.snapshotHarga
        } else {
          totalLivePrice += liveMenu.harga || 0
          if (liveMenu.is_habis) hasSoldOut = true
          if (liveMenu.jam_tutup && jakartaNow >= liveMenu.jam_tutup.substring(0, 5)) {
            hasCutoff = true
          }
        }
      } else if (entry.addon_id) {
        const liveAddon = addons.find(a => a.id === entry.addon_id)
        if (!liveAddon || liveAddon.is_active === false) {
          hasInactive = true
          totalLivePrice += liveAddon?.harga ?? entry.snapshotHarga
        } else {
          totalLivePrice += liveAddon.harga || 0
          if (liveAddon.is_habis) hasSoldOut = true
        }
      }
    }

    const hasClosed = hasInactive || (!options?.ignoreCutoff && hasCutoff)
    return { totalLivePrice, hasSoldOut, hasInactive, hasCutoff, hasClosed }
  }

  const mapRowsToEntries = (rows: any[]): ComboOrderEntry[] => {
    const entries: ComboOrderEntry[] = []
    for (const r of rows) {
      const menuRel = Array.isArray(r.kantin_menus) ? r.kantin_menus[0] : r.kantin_menus
      const addonRel = Array.isArray(r.kantin_addons) ? r.kantin_addons[0] : r.kantin_addons
      if (r.menu_id) {
        entries.push({
          menu_id: r.menu_id,
          addon_id: null,
          note: (r.deskripsi_pesanan || '').trim(),
          addonNote: '',
          nama: menuRel?.nama || 'Menu',
          snapshotHarga: r.harga || 0,
        })
      }
      if (r.addon_id) {
        entries.push({
          menu_id: null,
          addon_id: r.addon_id,
          note: '',
          addonNote: (r.deskripsi_addon || '').trim(),
          nama: addonRel?.nama || 'Add-On',
          snapshotHarga: r.addon_id && r.menu_id ? (r.harga_addon || 0) : (r.harga || r.harga_addon || 0),
        })
      }
    }
    return entries
  }

  // A. Pesanan Terakhir
  const lastDate = pastOrders[0].tanggal
  const lastMealItems = pastOrders.filter(o => o.tanggal === lastDate)
  const lastEntries = mapRowsToEntries(lastMealItems)
  const lastMeal: LastMealSuggestion | null =
    lastEntries.length > 0
      ? {
          date: lastDate,
          items: lastMealItems,
          entries: lastEntries,
          ...evaluateEntries(lastEntries),
        }
      : null

  // B. Top 5 kombinasi paling sering dibeli per tanggal
  const ordersByDate = new Map<string, any[]>()
  for (const row of pastOrders) {
    const key = row.tanggal
    if (!ordersByDate.has(key)) ordersByDate.set(key, [])
    ordersByDate.get(key)!.push(row)
  }

  const comboMap = new Map<string, { count: number; lastDate: string; entries: ComboOrderEntry[] }>()
  for (const [dateKey, rows] of ordersByDate.entries()) {
    const entries = mapRowsToEntries(rows)
    if (entries.length === 0) continue

    const signature = entries
      .map(e => (e.menu_id ? `m:${e.menu_id}:${e.note.toLowerCase()}` : `a:${e.addon_id}:${e.addonNote.toLowerCase()}`))
      .sort()
      .join('|')

    const existing = comboMap.get(signature)
    if (existing) {
      existing.count += 1
      if (dateKey > existing.lastDate) existing.lastDate = dateKey
    } else {
      comboMap.set(signature, { count: 1, lastDate: dateKey, entries })
    }
  }

  const topCombos: TopOrderCombo[] = Array.from(comboMap.entries())
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count
      return b[1].lastDate.localeCompare(a[1].lastDate)
    })
    .slice(0, 5)
    .map(([signature, data]) => ({
      signature,
      count: data.count,
      lastDate: data.lastDate,
      items: data.entries,
      ...evaluateEntries(data.entries),
    }))

  return { lastMeal, topCombos }
}

/**
 * Submits one or more orders atomically via `process_order_batch`, enforcing saldo >= 0 in PostgreSQL.
 */
export async function submitOrderBatch(
  profileId: string,
  items: OrderItemPayload[],
  bypassTimeCheck = false
): Promise<{ orderIds: string[]; newSaldo: number | null }> {
  const { data: batchData, error: batchErr } = await supabase.rpc('process_order_batch', {
    p_profile_id: profileId,
    p_items: items,
    p_bypass_time_check: bypassTimeCheck,
  })

  if (!batchErr && batchData) {
    const orderIds: string[] = Array.isArray(batchData.order_ids)
      ? batchData.order_ids
      : batchData.order_id
        ? [batchData.order_id]
        : []
    const newSaldo = typeof batchData.new_saldo === 'number' ? batchData.new_saldo : null
    return { orderIds, newSaldo }
  }

  const msg = batchErr?.message || ''
  const isMissingBatchFn =
    batchErr?.code === 'PGRST202' ||
    batchErr?.code === '42883' ||
    /Could not find the function.*process_order_batch/i.test(msg) ||
    /function process_order_batch.*does not exist/i.test(msg)

  if (!isMissingBatchFn) {
    throw batchErr
  }

  // Fallback when SQL migration for process_order_batch has not yet been applied
  const createdOrderIds: string[] = []
  let latestSaldo: number | null = null

  for (const item of items) {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('process_order', {
      p_profile_id: profileId,
      ...item,
      p_bypass_time_check: bypassTimeCheck,
    })

    if (rpcErr) {
      for (const id of createdOrderIds) {
        await supabase.rpc('cancel_user_order', { p_order_id: id, p_bypass_time: true })
      }
      throw rpcErr
    }

    if (rpcData?.order_id) createdOrderIds.push(rpcData.order_id)
    if (typeof rpcData?.new_saldo === 'number') latestSaldo = rpcData.new_saldo
  }

  return { orderIds: createdOrderIds, newSaldo: latestSaldo }
}
