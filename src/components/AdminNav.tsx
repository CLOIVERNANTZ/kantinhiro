'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Settings, LogOut, LogIn } from 'lucide-react'
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
          <Link href="/admin" className="text-sm font-bold text-yellow-700 hover:text-yellow-800 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>Admin Panel</span>
          </Link>
          <button onClick={handleLogout} className="text-sm font-semibold text-red-500 hover:text-red-700 flex items-center gap-2 ml-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </>
      ) : (
        <Link href="/admin/login" className="text-sm font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-2">
          <LogIn className="h-4 w-4" />
          <span>Login Admin</span>
        </Link>
      )}
    </div>
  )
}
