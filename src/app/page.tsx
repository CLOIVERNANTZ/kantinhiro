import { supabase } from '@/lib/supabase'
import OrderForm from './OrderForm'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function Home() {
  const jakartaTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }))
  const todayStr = jakartaTime.toISOString().split('T')[0]
  
  // Fetch all data in parallel for much faster page loads!
  const [
    { data: profiles },
    { data: menus },
    { data: addons },
    { data: orders }
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
      .order('created_at', { ascending: false })
  ])

  const formattedDate = format(new Date(), 'EEEE, dd MMM yyyy', { locale: id })

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Title area removed as requested */}

      <OrderForm 
        profiles={profiles || []} 
        menus={menus || []} 
        addons={addons || []}
        initialOrders={orders || []}
      />
    </div>
  )
}
