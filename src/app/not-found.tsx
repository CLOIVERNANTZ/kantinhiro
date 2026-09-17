import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-6 text-center px-4">
      <div className="bg-slate-100 p-6 rounded-full border-8 border-slate-200">
        <FileQuestion className="h-16 w-16 text-slate-400" />
      </div>
      
      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-800">404 - Halaman Tidak Ditemukan</h2>
        <p className="text-slate-500 max-w-md mx-auto">
          Maaf, halaman yang Anda cari mungkin telah dipindahkan, dihapus, atau tidak pernah ada.
        </p>
      </div>

      <div className="pt-4">
        <Link href="/">
          <Button className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold h-11 px-8 rounded-full">
            Kembali ke Beranda
          </Button>
        </Link>
      </div>
    </div>
  )
}
