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

/**
 * Submits one or more orders atomically via `process_order_batch`, allowing a single batch
 * starting from saldo >= 0 to go negative while enforcing saldo >= 0 in PostgreSQL.
 */
export async function submitOrderBatch(
  profileId: string,
  items: OrderItemPayload[]
): Promise<{ orderIds: string[]; newSaldo: number | null }> {
  const { data: batchData, error: batchErr } = await supabase.rpc('process_order_batch', {
    p_profile_id: profileId,
    p_items: items,
    p_bypass_time_check: false,
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
    })

    if (rpcErr) {
      for (const id of createdOrderIds) {
        await supabase.rpc('cancel_user_order', { p_order_id: id })
      }
      throw rpcErr
    }

    if (rpcData?.order_id) createdOrderIds.push(rpcData.order_id)
    if (typeof rpcData?.new_saldo === 'number') latestSaldo = rpcData.new_saldo
  }

  return { orderIds: createdOrderIds, newSaldo: latestSaldo }
}
