'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App Error:', error)
  }, [error])

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-6 text-center px-4">
      <div className="bg-red-50 p-6 rounded-full border-8 border-red-100">
        <AlertTriangle className="h-16 w-16 text-red-500" />
      </div>
      
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-800">Oops! Terjadi Kesalahan</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          Sistem kami mengalami kendala teknis. Hal ini biasanya terjadi karena masalah koneksi atau konfigurasi database.
        </p>
      </div>

      <div className="flex gap-4">
        <Button onClick={() => window.location.reload()} variant="outline" className="border-yellow-500 text-yellow-700 hover:bg-yellow-50">
          Muat Ulang Halaman
        </Button>
        <Button onClick={() => reset()} className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold">
          Coba Lagi
        </Button>
      </div>
    </div>
  )
}
