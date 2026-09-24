import UserLoginForm from './UserLoginForm'
import { supabase } from '@/lib/supabase'

export const revalidate = 0

export default async function LoginPage() {
  const { data: profiles } = await supabase.from('kantin_profiles').select('id, nama').order('nama')
  
  return (
    <div 
      className="min-h-[80vh] flex flex-col items-center justify-center p-4 bg-cover bg-center bg-no-repeat relative rounded-xl overflow-hidden"
      style={{ backgroundImage: "url('/bg.webp')" }}
    >
      {/* Overlay transparan jika ingin background-nya digelapkan sedikit */}
      <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[2px]"></div>

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/icon.webp" alt="Icon Kantin" className="w-24 h-24 object-contain drop-shadow-md rounded-2xl" />
          </div>
          <h1 className="text-4xl font-black text-yellow-800 tracking-tight">Kantin Hiro</h1>
          <p className="text-slate-600 mt-2 font-medium">Silakan login atau daftar untuk mulai memesan.</p>
        </div>
        
        <UserLoginForm profiles={profiles || []} />
        
        <div className="text-center mt-8 pb-4">
          <p className="text-xs font-bold text-slate-500">
            &copy; 2026 System by Cloivernantz
          </p>
        </div>
      </div>
    </div>
  )
}
