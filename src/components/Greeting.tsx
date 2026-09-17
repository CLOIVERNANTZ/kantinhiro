'use client'

import { useEffect, useState } from 'react'
import { UserCircle2 } from 'lucide-react'

export default function Greeting() {
  const [name, setName] = useState<string | null>(null)
  const [greeting, setGreeting] = useState<string>('Selamat Datang')

  useEffect(() => {
    // Determine time of day
    const hour = new Date().getHours()
    if (hour < 11) setGreeting('Selamat Pagi')
    else if (hour < 15) setGreeting('Selamat Siang')
    else if (hour < 18) setGreeting('Selamat Sore')
    else setGreeting('Selamat Malam')

    // Get name from localStorage
    const savedName = localStorage.getItem('kantin_userName')
    if (savedName) {
      setName(savedName)
    }

    // Listen to potential changes in same window if we want real-time (optional)
    const handleStorageChange = () => {
      setName(localStorage.getItem('kantin_userName'))
    }
    
    // We can also poll or set an interval to update if needed, but simple read is fine.
    // To make it responsive to order form submission without reload, we can dispatch a custom event.
    window.addEventListener('kantin_user_updated', handleStorageChange)
    return () => window.removeEventListener('kantin_user_updated', handleStorageChange)
  }, [])

  if (!name) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 italic px-4 py-2 bg-yellow-50 rounded-full border border-yellow-100">
        <UserCircle2 className="h-4 w-4" />
        Silakan isi form pesanan untuk menyimpan nama Anda
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-yellow-800 px-4 py-2 bg-yellow-50 rounded-full border border-yellow-200 shadow-sm">
      <UserCircle2 className="h-4 w-4 text-yellow-600" />
      {greeting}, {name}!
    </div>
  )
}
