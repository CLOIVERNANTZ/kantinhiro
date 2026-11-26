import { supabase } from '@/lib/supabase'
import OrderForm from './OrderForm'
import { getJakartaDateTime } from '@/lib/orderClient'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function Home() {
  const { dateStr: todayStr } = getJakartaDateTime()
  
  // Fetch all data in parallel for much faster page loads!
  const [
    { data: profiles },
    { data: menus },
    { data: addons },
    { data: orders },
    { data: lateSetting }
  ] = await Promise.all([
    supabase.from('kantin_profiles').select('*').order('nama'),
    supabase.from('kantin_menus').select('*'),
    supabase.from('kantin_addons').select('*'),
    supabase
      .from('kantin_orders')
      .select(`
        *,
        kantin_profiles(nama),
        kantin_menus(nama, kode_unik, jam_tutup),
        kantin_addons(nama)
      `)
      .eq('tanggal', todayStr)
      .order('created_at', { ascending: false }),
    supabase.from('kantin_settings').select('value').eq('key', 'late_order_feature').maybeSingle()
  ])

  const initialLateFeatureEnabled = (lateSetting?.value as { enabled?: boolean } | null)?.enabled ?? true

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Title area removed as requested */}

      <OrderForm 
        profiles={profiles || []} 
        menus={menus || []} 
        addons={addons || []}
        initialOrders={orders || []}
        initialLateFeatureEnabled={initialLateFeatureEnabled}
      />
    </div>
  )
}
