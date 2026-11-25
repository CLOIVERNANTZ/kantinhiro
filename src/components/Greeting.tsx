'use client'

import { useEffect, useState } from 'react'
import { UserCircle2 } from 'lucide-react'
import { getJakartaWelcomeGreeting } from '@/lib/greetings'

export default function Greeting() {
  const [name, setName] = useState<string | null>(null)
  const [greeting, setGreeting] = useState<string>('Selamat Datang')
  const [sweetRemark, setSweetRemark] = useState<string>('')

  useEffect(() => {
    const timer = setTimeout(() => {
      const welcome = getJakartaWelcomeGreeting()
      setGreeting(welcome.timeGreeting)
      setSweetRemark(welcome.sweetRemark)

      const savedName = localStorage.getItem('kantin_userName')
      if (savedName) {
        setName(savedName)
      }
    }, 0)

    const handleStorageChange = () => {
      setName(localStorage.getItem('kantin_userName'))
    }

    window.addEventListener('kantin_user_updated', handleStorageChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('kantin_user_updated', handleStorageChange)
    }
  }, [])

  if (!name) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700/80 italic px-4 py-1.5 bg-amber-50/70 rounded-full border border-amber-200/70">
        <UserCircle2 className="h-4 w-4 shrink-0 text-amber-600" />
        <span>{sweetRemark || 'Silakan masuk untuk mulai memesan makanan favoritmu'}</span>
      </div>
    )
  }

  return (
    <div
      title={sweetRemark}
      className="flex items-center gap-2 text-xs lg:text-sm font-semibold text-amber-900 px-3.5 py-1.5 bg-amber-50 rounded-full border border-amber-200 shadow-xs max-w-md truncate"
    >
      <UserCircle2 className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="truncate">
        {greeting}, {name}! {sweetRemark && <span className="font-normal text-amber-700 hidden xl:inline">— {sweetRemark}</span>}
      </span>
    </div>
  )
}
