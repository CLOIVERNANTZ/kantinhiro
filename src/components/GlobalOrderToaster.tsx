'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { UtensilsCrossed } from 'lucide-react'

type Toast = {
  id: string
  message: string
  title: string
}

export default function GlobalOrderToaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    // Subscribe to new orders being inserted into kantin_orders
    const channel = supabase
      .channel('public:kantin_orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kantin_orders' },
        (payload) => {
          const newOrder = payload.new
          const nama = newOrder.nama_user || 'Seseorang'
          
          const toastId = Math.random().toString()
          setToasts(prev => [...prev, {
            id: toastId,
            title: "Pesanan Baru Masuk! 🍜",
            message: `${nama} baru saja menambahkan pesanan hari ini.`
          }])

          // Auto remove after 5 seconds
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== toastId))
          }, 5000)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div 
          key={t.id} 
          className="bg-white/95 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-yellow-200 rounded-xl p-3 w-64 md:w-72 flex items-center gap-3 pointer-events-auto transform transition-all duration-500 hover:scale-105"
          style={{ animation: 'slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div className="bg-yellow-100 text-yellow-600 rounded-full w-10 h-10 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-black text-slate-800">{t.title}</h4>
            <p className="text-[11px] text-slate-600 leading-tight mt-0.5 font-medium">{t.message}</p>
          </div>
        </div>
      ))}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}} />
    </div>
  )
}
