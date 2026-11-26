import { supabase } from '@/lib/supabase'
import RekapanClient from './RekapanClient'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { getJakartaDateTime } from '@/lib/orderClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function RekapanPage() {
  const { dateStr: todayStr } = getJakartaDateTime()
  
  // Fetch today's orders with all relations
  const [
    { data: orders, error },
    { data: profiles },
    { data: menus },
    { data: addons },
    { data: lateSetting }
  ] = await Promise.all([
    supabase
      .from('kantin_orders')
      .select(`
        id, deskripsi_pesanan, deskripsi_addon, harga, harga_addon, status, is_recap_checked, menu_id, addon_id, profile_id, admin_note, created_at,
        kantin_profiles(nama),
        kantin_menus(nama, kode_unik),
        kantin_addons(nama)
      `)
      .eq('tanggal', todayStr),
    supabase.from('kantin_profiles').select('id, nama, divisi, saldo, status, late_access_until, late_grace_locked').order('nama'),
    supabase.from('kantin_menus').select('*').eq('is_active', true).order('nama'),
    supabase.from('kantin_addons').select('*').eq('is_active', true).order('nama'),
    supabase.from('kantin_settings').select('value').eq('key', 'late_order_feature').maybeSingle()
  ])

  const formattedDate = format(new Date(), 'EEEE, dd MMMM yyyy', { locale: id })
  const initialLateFeatureEnabled = (lateSetting?.value as { enabled?: boolean } | null)?.enabled ?? true

  if (error) {
    return <div className="p-4 text-red-500">Gagal memuat data rekapan.</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-yellow-800">Rekapan Pesanan</h1>
          <p className="text-slate-500 mt-2">{formattedDate} - Panduan Belanja Admin</p>
        </div>
      </div>
      
      <RekapanClient 
        initialOrders={orders || []} 
        initialDate={todayStr}
        profiles={profiles || []}
        menus={menus || []}
        addons={addons || []}
        initialLateFeatureEnabled={initialLateFeatureEnabled}
      />
    </div>
  )
}
