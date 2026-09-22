import { supabase } from '@/lib/supabase'
import RekapanClient from './RekapanClient'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export const revalidate = 0

export default async function RekapanPage() {
  const todayStr = new Date().toISOString().split('T')[0]
  
  // Fetch today's orders with all relations
  const { data: orders, error } = await supabase
    .from('kantin_orders')
    .select(`
      id, deskripsi_pesanan, deskripsi_addon, harga, harga_addon, status, is_recap_checked, menu_id, addon_id, profile_id, admin_note, created_at,
      kantin_profiles(nama),
      kantin_menus(nama, kode_unik),
      kantin_addons(nama)
    `)
    .eq('tanggal', todayStr)
  
  const formattedDate = format(new Date(), 'EEEE, dd MMMM yyyy', { locale: id })

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
      
      <RekapanClient initialOrders={orders || []} />
    </div>
  )
}
