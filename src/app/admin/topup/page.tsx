import { supabase } from '@/lib/supabase'
import PdfTopupManager from './PdfTopupManager'

export const revalidate = 0

export default async function AdminTopupPage() {
  const { data: profiles } = await supabase.from('kantin_profiles').select('id, nama, kode_unik_topup, saldo')
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black text-slate-800">Manajemen Top-Up</h1>
      </div>
      <PdfTopupManager profiles={profiles || []} />
    </div>
  )
}
