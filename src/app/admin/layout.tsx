'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FileText, List, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session && pathname !== '/admin/login') {
        router.replace('/admin/login')
      } else {
        setIsLoading(false)
      }
    }
    
    // Set up auth state listener
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && pathname !== '/admin/login') {
        router.replace('/admin/login')
      }
    })

    checkAuth()

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [pathname, router])

  // Hide the admin tabs if we are on the login page
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  // Prevent flash of protected content before redirect
  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
      </div>
    )
  }

  const tabs = [
    { name: 'Daftar Saldo User', href: '/admin', icon: Wallet },
    { name: 'Rekapan', href: '/admin/rekapan', icon: FileText },
    { name: 'Kelola Menu', href: '/admin/menus', icon: List },
  ]

  return (
    <div className="space-y-6">
      {/* Secondary Admin Navigation Tabs */}
      <div className="bg-white border-b border-yellow-200 shadow-sm rounded-lg overflow-hidden">
        <nav className="flex items-center">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href
            const Icon = tab.icon
            return (
              <Link 
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors
                  ${isActive 
                    ? 'bg-yellow-50 text-yellow-700 border-b-2 border-yellow-500' 
                    : 'text-slate-500 hover:text-yellow-600 hover:bg-slate-50'
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.name}</span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div>
        {children}
      </div>
    </div>
  )
}
