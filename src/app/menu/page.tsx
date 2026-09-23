import { supabase } from '@/lib/supabase'
import MenuList from './MenuList'

export const revalidate = 0 // Disable caching for now

export default async function MenuPage() {
  const now = new Date()
  const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}))
  const todayStr = jakartaTime.toISOString().split('T')[0]

  // Fetch all data in parallel!
  const [
    { data: menus, error: menuError },
    { data: addons, error: addonError },
    { data: profiles, error: profileError },
    { data: orders, error: ordersError }
  ] = await Promise.all([
    supabase.from('kantin_menus').select('*').order('nama'),
    supabase.from('kantin_addons').select('*').order('kategori'),
    supabase.from('kantin_profiles').select('*').order('nama'),
    supabase
      .from('kantin_orders')
      .select(`
        *,
        kantin_profiles(nama),
        kantin_menus(nama, kode_unik, jam_tutup),
        kantin_addons(nama)
      `)
      .eq('tanggal', todayStr)
      .order('created_at', { ascending: false })
  ])

  if (menuError) {
    console.error(menuError)
    return <div className="p-4 text-red-500">Gagal memuat menu. Pastikan database sudah terhubung.</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-yellow-800">Daftar Menu</h1>
          <p className="text-slate-500 mt-2">Pilih menu favorit Anda hari ini.</p>
        </div>

        {/* Pembeli Aktif (Admin) Block */}
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs w-full md:w-auto md:min-w-[280px]">
          <div className="font-bold text-blue-800 mb-1 border-b border-blue-200 pb-1">
            Admin Aktif (Pembeli Hari Ini)
          </div>
          <div className="text-blue-900 font-medium">
            <div>Nama: Suryana</div>
            <div>NO.Rek: 0760081566 A/N SURYANA</div>
            <div>NO.Hp: 087885456448</div>
          </div>
        </div>
      </div>

      <MenuList 
        menus={menus || []} 
        addons={addons || []} 
        profiles={profiles || []} 
        orders={orders || []}
      />
    </div>
  )
}
