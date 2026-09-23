import { supabase } from '@/lib/supabase'
import MenuManager from './MenuManager'

export const revalidate = 0

export default async function AdminMenusPage() {
  const [
    { data: menus, error: menuErr },
    { data: addons, error: addonErr }
  ] = await Promise.all([
    supabase.from('kantin_menus').select('*').order('kode_unik'),
    supabase.from('kantin_addons').select('*').order('nama')
  ])

  if (menuErr || addonErr) {
    return <div className="p-4 text-red-500">Gagal memuat data menu/addons dari database.</div>
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-yellow-800">Kelola Menu Kantin</h1>
          <p className="text-slate-500 mt-2">Tambah, ubah, atau hapus menu makanan dan add-ons.</p>
        </div>
      </div>
      
      <MenuManager initialMenus={menus || []} initialAddons={addons || []} />
    </div>
  )
}
