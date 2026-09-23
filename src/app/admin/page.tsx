import { supabase } from '@/lib/supabase'
import KeuanganClient from './KeuanganClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function AdminKeuanganPage() {
  const [
    { data: profiles, error },
    { data: recentOrders }
  ] = await Promise.all([
    supabase.from('kantin_profiles').select('*').order('nama'),
    supabase
      .from('kantin_orders')
      .select('*, kantin_menus(nama), kantin_addons(nama)')
      .order('created_at', { ascending: false })
  ])

  if (error) {
    return <div className="p-4 text-red-500">Gagal memuat data profil.</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-yellow-800">Daftar Saldo User</h1>
          <p className="text-slate-500 mt-2">Kelola deposit user dan pantau history transaksi.</p>
        </div>
      </div>

      <KeuanganClient profiles={profiles || []} recentOrders={recentOrders || []} />
    </div>
  )
}
