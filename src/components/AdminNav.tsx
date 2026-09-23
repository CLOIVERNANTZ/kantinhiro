'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Settings, LogOut, Shield } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AdminNav() {
  const [session, setSession] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="flex items-center gap-4 border-l pl-4 border-slate-200">
      {session ? (
        <>
          <Link href="/admin" className="text-yellow-700 hover:text-yellow-800 flex items-center justify-center rounded-full p-2 hover:bg-yellow-50 transition-colors" title="Admin Panel">
            <Settings className="h-5 w-5" />
          </Link>
          <button onClick={handleLogout} className="text-red-500 hover:text-red-700 flex items-center justify-center rounded-full p-2 hover:bg-red-50 transition-colors ml-1" title="Logout">
            <LogOut className="h-5 w-5" />
          </button>
        </>
      ) : (
        <Link href="/admin/login" className="text-slate-400 hover:text-yellow-600 flex items-center justify-center rounded-full p-2 hover:bg-yellow-50 transition-colors" title="Admin Login">
          <Shield className="h-5 w-5" />
        </Link>
      )}
    </div>
  )
}
