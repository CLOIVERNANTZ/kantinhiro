'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

export default function TopUpPage() {
  const [activeProfile, setActiveProfile] = useState<any>(null)
  const [nominalStr, setNominalStr] = useState('')
  const [loadingAlert, setLoadingAlert] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const savedName = localStorage.getItem('kantin_userName')
    const savedDivisi = localStorage.getItem('kantin_divisi') || ''
    const savedProfileId = localStorage.getItem('kantin_profile_id')

    if (!savedName) {
      router.replace('/login')
      return
    }

    // Prefer matching by profile_id (most reliable), fallback to nama+divisi combo
    if (savedProfileId) {
      supabase.from('kantin_profiles').select('*').eq('id', savedProfileId).single().then(({ data }) => {
        if (data) setActiveProfile(data)
        else {
          // ID no longer valid, try by name+divisi
          supabase.from('kantin_profiles').select('*')
            .ilike('nama', savedName)
            .ilike('divisi', savedDivisi || '%')
            .limit(1)
            .single()
            .then(({ data: d }) => { if (d) setActiveProfile(d) })
        }
      })
    } else {
      // Match by nama + divisi to avoid collision when two users share same name
      supabase.from('kantin_profiles').select('*')
        .ilike('nama', savedName)
        .ilike('divisi', savedDivisi ? savedDivisi : '%')
        .limit(1)
        .single()
        .then(({ data }) => { if (data) setActiveProfile(data) })
    }
  }, [router])

  if (!activeProfile) {
    return <div className="min-h-screen flex items-center justify-center">Memuat data...</div>
  }

  const kodeUnik = activeProfile.kode_unik_topup || 0
  const nominalBase = parseInt(nominalStr.replace(/\D/g, '')) || 0

  const handleRemindAdmin = async () => {
    setLoadingAlert(true)
    try {
      const { error } = await supabase.rpc('request_topup', { p_profile_id: activeProfile.id })
      if (error) throw error
      setActiveProfile({ ...activeProfile, is_requesting_topup: true })
      alert('Admin telah diingatkan! Silakan tunggu konfirmasi.')
    } catch (e) {
      alert('Gagal mengirim pengingat.')
    } finally {
      setLoadingAlert(false)
    }
  }

  // Jika nominal di bawah 1000, abaikan kode unik agar tidak membingungkan
  const totalTransfer = nominalBase >= 1000 ? (Math.floor(nominalBase / 1000) * 1000) + kodeUnik : 0

  return (
    <div className="max-w-md mx-auto space-y-6 pb-12">
      <Card className="border-yellow-200">
        <CardHeader className="bg-yellow-50 border-b border-yellow-200">
          <CardTitle className="text-yellow-800">Isi Saldo (Top-Up)</CardTitle>
          <CardDescription>
            Saldo saat ini: <strong className="text-slate-800">Rp {activeProfile.saldo?.toLocaleString('id-ID')}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <Label>Pilih Nominal Kelipatan Ribuan</Label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[20000, 50000, 100000].map(val => (
                <Button 
                  key={val}
                  type="button" 
                  variant="outline" 
                  onClick={() => setNominalStr(val.toString())}
                  className="border-yellow-300 text-yellow-700 hover:bg-yellow-50 font-bold text-xs"
                >
                  {val / 1000}k
                </Button>
              ))}
            </div>
            <Input 
              value={nominalStr}
              onChange={(e) => setNominalStr(e.target.value)}
              placeholder="Atau ketik nominal..."
              className="h-12 text-lg font-bold tracking-wider"
              inputMode="numeric"
            />
          </div>

          {totalTransfer > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <p className="text-sm text-slate-600">Mohon transfer <strong>TEPAT</strong> sesuai nominal berikut hingga 3 digit terakhir agar sistem dapat mengenali pembayaran Anda secara otomatis:</p>
              
              <div className="text-center bg-white p-3 border border-yellow-300 rounded-lg shadow-inner">
                <span className="text-xs text-slate-400 block mb-1">TOTAL TRANSFER</span>
                <span className="text-3xl font-black text-yellow-600">
                  Rp {totalTransfer.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="text-sm space-y-1">
                <p>Transfer ke Rekening BCA:</p>
                <div className="flex items-center justify-between bg-white p-2 border rounded">
                  <span className="font-mono font-bold">0760081566</span>
                  <span className="text-xs text-slate-500">A/N SURYANA</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 text-center mt-2">
                Setelah transfer, tunggu admin memverifikasi (upload mutasi). Saldo akan otomatis bertambah jika nominal persis sama.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex flex-col gap-2">
              <p className="text-xs text-blue-800 font-medium">Sudah transfer tapi saldo belum bertambah?</p>
              <Button 
                variant={activeProfile.is_requesting_topup ? "secondary" : "default"}
                className={`w-full text-xs font-bold ${activeProfile.is_requesting_topup ? 'bg-blue-100 text-blue-800' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                onClick={handleRemindAdmin}
                disabled={activeProfile.is_requesting_topup || loadingAlert}
              >
                {activeProfile.is_requesting_topup ? '✅ Admin Telah Diingatkan' : (loadingAlert ? 'Mengirim...' : '🔔 Ingatkan Admin')}
              </Button>
            </div>

            <Button 
              className="w-full h-12 font-bold"
              variant="outline"
              onClick={() => router.push('/')}
            >
              Kembali ke Beranda
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
