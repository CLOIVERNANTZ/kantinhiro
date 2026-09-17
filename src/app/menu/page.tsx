import { supabase } from '@/lib/supabase'
import MenuList from './MenuList'

export const revalidate = 0 // Disable caching for now

export default async function MenuPage() {
  // Fetch menus
  const { data: menus, error: menuError } = await supabase
    .from('kantin_menus')
    .select('*')
    .order('nama')
  
  // Fetch addons
  const { data: addons, error: addonError } = await supabase
    .from('kantin_addons')
    .select('*')
    .order('kategori')
    
  // Fetch profiles for the dropdown
  const { data: profiles, error: profileError } = await supabase
    .from('kantin_profiles')
    .select('*')
    .order('nama')

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
      />
    </div>
  )
}
