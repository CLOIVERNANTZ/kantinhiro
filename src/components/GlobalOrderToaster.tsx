'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { UtensilsCrossed } from 'lucide-react'

type Toast = {
  id: string
  message: string
  title: string
  type?: 'order' | 'topup'
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
          const menuId = newOrder.menu_id
          const addonId = newOrder.addon_id

          const showToast = (foodName: string) => {
            const toastId = Math.random().toString()
            setToasts(prev => [...prev, {
              id: toastId,
              title: "Pesanan Baru Masuk! 🍜",
              message: `${nama} telah berhasil memesan ${foodName}.`
            }])

            // Auto remove after 5 seconds
            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.id !== toastId))
            }, 5000)
          }

          // Fetch the exact food name because Realtime only sends the UUID
          if (menuId) {
             supabase.from('kantin_menus').select('nama').eq('id', menuId).single().then(({data}) => {
                showToast(data?.nama || 'Makanan')
             })
          } else if (addonId) {
             supabase.from('kantin_addons').select('nama').eq('id', addonId).single().then(({data}) => {
                showToast(data?.nama || 'Tambahan')
             })
          } else {
             showToast('Pesanan')
          }
        }
      )
      .subscribe()

    // Subscribe to Top Up reminders (kantin_profiles updates)
    const profileChannel = supabase
      .channel('public:kantin_profiles')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kantin_profiles' },
        (payload) => {
          const oldProfile = payload.old
          const newProfile = payload.new
          
          // Check if they just requested a topup
          if (newProfile.is_requesting_topup && !oldProfile.is_requesting_topup) {
            const toastId = Math.random().toString()
            setToasts(prev => [...prev, {
              id: toastId,
              title: "🔔 Pengingat Top Up!",
              message: `${newProfile.nama} baru saja menekan tombol Ingatkan Admin karena sudah transfer.`,
              type: 'topup'
            }])

            // Auto remove after 8 seconds
            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.id !== toastId))
            }, 8000)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(profileChannel)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const isTopup = t.type === 'topup'
        return (
          <div 
            key={t.id} 
            className={`bg-white/95 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] border rounded-xl p-3 w-64 md:w-72 flex items-center gap-3 pointer-events-auto transform transition-all duration-500 hover:scale-105 ${isTopup ? 'border-red-300' : 'border-yellow-200'}`}
            style={{ animation: 'slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className={`rounded-full w-10 h-10 flex items-center justify-center shrink-0 ${isTopup ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'}`}>
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className={`text-sm font-black ${isTopup ? 'text-red-700' : 'text-slate-800'}`}>{t.title}</h4>
              <p className="text-[11px] text-slate-600 leading-tight mt-0.5 font-medium">{t.message}</p>
            </div>
          </div>
        )
      })}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}} />
    </div>
  )
}
