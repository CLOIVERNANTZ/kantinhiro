import UserLoginForm from './UserLoginForm'
import { supabase } from '@/lib/supabase'

export const revalidate = 0

export default async function LoginPage() {
  const { data: profiles } = await supabase.from('kantin_profiles').select('id, nama').order('nama')
  
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-black text-yellow-800 tracking-tight">Kantin Hiro</h1>
          <p className="text-slate-500 mt-2">Silakan login atau daftar untuk mulai memesan.</p>
        </div>
        
        <UserLoginForm profiles={profiles || []} />
      </div>
    </div>
  )
}
