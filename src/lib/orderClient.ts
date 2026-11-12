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

/**
 * Fetches live profile status & balance from DB and blocks users whose balance is already negative (< 0).
 * Users with saldo >= 0 (e.g., 234) are allowed to place one batch even if the batch takes them negative.
 */
export async function fetchLiveSaldoAndValidate(profileId: string): Promise<LiveSaldoCheckResult> {
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

  if (liveProfile.saldo < 0) {
    return {
      ok: false,
      saldo: liveProfile.saldo,
      errorTitle: 'Pemesanan Ditolak',
      errorMessage: `Saldo Anda minus (Rp ${Math.abs(liveProfile.saldo).toLocaleString('id-ID')}).\nHarap top up terlebih dahulu sebelum memesan kembali.`,
    }
  }

  return { ok: true, saldo: liveProfile.saldo }
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
