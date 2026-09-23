import { supabase } from '@/lib/supabase'
import OrderForm from './OrderForm'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export const revalidate = 0 // Disable caching

export default async function Home() {
  const todayStr = new Date().toISOString().split('T')[0]
  
  // Fetch profiles
  const { data: profiles } = await supabase.from('kantin_profiles').select('*').order('nama')
  
  // Fetch menus
  const { data: menus } = await supabase.from('kantin_menus').select('*')
  
  // Fetch addons
  const { data: addons } = await supabase.from('kantin_addons').select('*')

  // Fetch today's orders
  const { data: orders } = await supabase
    .from('kantin_orders')
    .select(`
      *,
      kantin_profiles(nama),
      kantin_menus(nama, kode_unik),
      kantin_addons(nama)
    `)
    .eq('tanggal', todayStr)
    .order('created_at', { ascending: false })

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
