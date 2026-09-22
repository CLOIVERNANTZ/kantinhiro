'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function UserLoginForm({ profiles }: { profiles: any[] }) {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const router = useRouter()

  // Login State
  const [loginName, setLoginName] = useState('')
  const [loginPin, setLoginPin] = useState('')

  // Register State
  const [newName, setNewName] = useState('')
  const [newDivisi, setNewDivisi] = useState('')
  const [newPin, setNewPin] = useState('')

  useEffect(() => {
    // Check if already logged in
    if (localStorage.getItem('kantin_profile_id')) {
      router.replace('/')
    }
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginName.trim() || loginPin.length !== 5) {
      setErrorMsg('Ketik nama Anda dan masukkan 5 digit PIN.')
      return
    }

    const profile = profiles.find(p => p.nama?.toLowerCase() === loginName.toLowerCase().trim())
    if (!profile) {
      setErrorMsg('Nama tidak terdaftar. Silakan daftar baru jika Anda belum punya akun.')
      return
    }
    
    setLoading(true)
    setErrorMsg('')

    try {
      const { data: isPinValid, error: pinErr } = await supabase.rpc('verify_pin', { 
        p_profile_id: profile.id, 
        p_pin: loginPin 
      })

      if (pinErr) throw pinErr

      if (!isPinValid) {
        setErrorMsg('PIN salah. Jika lupa, hubungi Admin (Suryana) untuk reset.')
        setLoading(false)
        return
      }

      // Success!
      localStorage.removeItem('kantin_profile_id') // Bersihkan ID jika ada sisa dari percobaan sebelumnya
      localStorage.setItem('kantin_userName', profile.nama)
      localStorage.setItem('kantin_loginTime', Date.now().toString())
      window.dispatchEvent(new Event('kantin_user_updated'))
      router.push('/')
      
    } catch (err: any) {
      setErrorMsg('Terjadi kesalahan: ' + err.message)
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || newPin.length !== 5) {
      setErrorMsg('Nama dan 5 digit PIN wajib diisi.')
      return
    }

    // Cek nama kembar
    if (profiles.some(p => p.nama.toLowerCase() === newName.toLowerCase().trim())) {
      setErrorMsg('Nama ini sudah terdaftar. Silakan gunakan nama lain atau login.')
      return
    }

    setLoading(true)
    setErrorMsg('')

    try {
      const { data: newProfileData, error } = await supabase.rpc('register_user', {
        p_nama: newName,
        p_divisi: newDivisi,
        p_pin: newPin
      })

      if (error) throw error

      alert('Pendaftaran berhasil! Silakan Login dengan PIN Anda.')
      setIsLogin(true)
      setLoginName(newProfileData?.nama || newName)
      setLoginPin(newPin)
    } catch (err: any) {
      setErrorMsg('Gagal mendaftar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-yellow-200 shadow-xl overflow-hidden">
      <div className="flex bg-slate-50 border-b border-yellow-200">
        <button 
          onClick={() => { setIsLogin(true); setErrorMsg(''); }}
          className={`flex-1 py-3 text-sm font-bold transition-colors ${isLogin ? 'bg-yellow-500 text-white' : 'text-slate-500 hover:bg-yellow-100 hover:text-yellow-700'}`}
        >
          Masuk Akun
        </button>
        <button 
          onClick={() => { setIsLogin(false); setErrorMsg(''); }}
          className={`flex-1 py-3 text-sm font-bold transition-colors ${!isLogin ? 'bg-yellow-500 text-white' : 'text-slate-500 hover:bg-yellow-100 hover:text-yellow-700'}`}
        >
          Daftar Baru
        </button>
      </div>

      <CardContent className="pt-6">
        {errorMsg && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-md border border-red-200 mb-4 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{errorMsg}</p>
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Anda</Label>
              <Input 
                list="user-names"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="Ketik nama Anda..."
                className="h-12 bg-white"
              />
              <datalist id="user-names">
                {profiles.map(p => (
                  <option key={p.id} value={p.nama} />
                ))}
              </datalist>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>PIN Keamanan (5 Digit)</Label>
                <a href="https://wa.me/6287885456448?text=Halo%20Admin%20Kantin,%20saya%20lupa%20PIN" target="_blank" rel="noreferrer" className="text-xs text-yellow-600 hover:underline">
                  Lupa PIN?
                </a>
              </div>
              <Input 
                type="password" 
                maxLength={5} 
                inputMode="numeric"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                className="h-12 text-center text-xl tracking-[1em] border-yellow-300 focus-visible:ring-yellow-500"
                placeholder="••••"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full h-12 text-base font-bold bg-yellow-500 hover:bg-yellow-600 mt-2">
              {loading ? 'Memeriksa...' : 'Masuk'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label>Nama Lengkap / Panggilan</Label>
              <Input 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Contoh: Budi Susanto"
                className="h-12"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Divisi (Opsional)</Label>
              <Input 
                value={newDivisi}
                onChange={(e) => setNewDivisi(e.target.value)}
                placeholder="Contoh: IT / Marketing"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label>Buat PIN (5 Angka)</Label>
              <Input 
                type="password" 
                maxLength={5} 
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                className="h-12 text-center text-xl tracking-[1em] border-yellow-300 focus-visible:ring-yellow-500"
                placeholder="•••••"
              />
              <p className="text-[10px] text-slate-500 text-center">PIN ini akan digunakan setiap kali Anda login atau membuat pesanan.</p>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-12 text-base font-bold bg-yellow-500 hover:bg-yellow-600 mt-2">
              {loading ? 'Mendaftarkan...' : 'Daftar Sekarang'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
