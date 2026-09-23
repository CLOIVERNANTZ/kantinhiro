'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FileText, List, Wallet, LogOut, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  
  // Password change state
  const [showPassModal, setShowPassModal] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [passLoading, setPassLoading] = useState(false)
  const [passMsg, setPassMsg] = useState({ type: '', text: '' })

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

  const handleChangeAdminPass = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassMsg({ type: '', text: '' })
    
    if (newPass.length < 6) {
      setPassMsg({ type: 'error', text: 'Password minimal 6 karakter.' })
      return
    }

    setPassLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error
      
      setPassMsg({ type: 'success', text: 'Password berhasil diubah!' })
      setNewPass('')
      setTimeout(() => setShowPassModal(false), 2000)
    } catch (err: any) {
      setPassMsg({ type: 'error', text: 'Gagal mengubah password: ' + err.message })
    } finally {
      setPassLoading(false)
    }
  }

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
    { name: 'Rekapan', href: '/admin/rekapan', icon: FileText },
    { name: 'Daftar Saldo User', href: '/admin', icon: Wallet },
    { name: 'Kelola Menu', href: '/admin/menus', icon: List },
    { name: 'Top-Up PDF', href: '/admin/topup', icon: Wallet },
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
          
          <Dialog open={showPassModal} onOpenChange={setShowPassModal}>
            <DialogTrigger 
              render={
                <button 
                  className="flex-none px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors border-l border-yellow-200"
                  title="Ubah Password Admin"
                />
              }
            >
              <KeyRound className="h-4 w-4" />
              <span className="hidden sm:inline">Ubah Sandi</span>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Ubah Password Admin</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleChangeAdminPass} className="space-y-4 mt-4">
                {passMsg.text && (
                  <div className={`p-3 text-xs font-bold rounded-md ${passMsg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                    {passMsg.text}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Password Baru (Min. 6 Karakter)</Label>
                  <Input 
                    type="password" 
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="Ketik password baru..."
                    className="h-11"
                  />
                </div>
                <Button type="submit" disabled={passLoading} className="w-full bg-yellow-500 hover:bg-yellow-600 font-bold mt-2 h-11">
                  {passLoading ? 'Menyimpan...' : 'Simpan Password'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <button 
            onClick={async () => {
              await supabase.auth.signOut()
            }}
            className="flex-none px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors border-l border-yellow-200"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </nav>
      </div>

      <div>
        {children}
      </div>
    </div>
  )
}
