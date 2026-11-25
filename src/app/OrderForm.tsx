'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { AlertCircle, Image as ImageIcon, ShoppingBag, Trash2, KeyRound, Sparkles, RotateCcw, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { id } from 'date-fns/locale'
import { useAppDialog } from '@/components/AppDialogProvider'
import { fetchLiveSaldoAndValidate, getJakartaDateTime, handleFailedSaldoCheck, handleOrderError, KantinProfile, OrderItemPayload, submitOrderBatch } from '@/lib/orderClient'
import { getJakartaWelcomeGreeting, DailyGreetingData } from '@/lib/greetings'

interface ComboOrderEntry {
  menu_id: string | null
  addon_id: string | null
  note: string
  addonNote: string
  nama: string
  snapshotHarga: number
}

interface TopOrderCombo {
  signature: string
  count: number
  lastDate: string
  items: ComboOrderEntry[]
  totalLivePrice: number
  hasSoldOut: boolean
  hasClosed: boolean
}

export default function OrderForm({ profiles, menus, addons, initialOrders }: { profiles: any[], menus: any[], addons: any[], initialOrders: any[] }) {
  const { showAlert, showConfirm } = useAppDialog()
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  
  // Auth State
  const [activeProfile, setActiveProfile] = useState<KantinProfile | null>(null)
  const [authChecking, setAuthChecking] = useState(true)

  // Pin Reset State
  const [showPinModal, setShowPinModal] = useState(false)
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinMsg, setPinMsg] = useState({ type: '', text: '' })
  const [pinLoading, setPinLoading] = useState(false)

  useEffect(() => {
    const savedName = localStorage.getItem('kantin_userName')
    const loginTime = localStorage.getItem('kantin_loginTime')
    
    // Check if missing or expired (1 hour = 3600000 ms)
    if (!savedName || !loginTime || (Date.now() - parseInt(loginTime)) > 3600000) {
      localStorage.removeItem('kantin_userName')
      localStorage.removeItem('kantin_loginTime')
      localStorage.removeItem('kantin_profile_id')
      window.location.href = '/login'
      return
    }
    
    // Auto find active profile by name
    const profile = profiles.find(p => p.nama?.toLowerCase() === savedName.toLowerCase())
    if (profile) {
      setActiveProfile(profile)
      setAuthChecking(false)
    } else {
      localStorage.removeItem('kantin_userName')
      localStorage.removeItem('kantin_loginTime')
      localStorage.removeItem('kantin_profile_id')
      window.location.href = '/login'
    }
  }, [profiles])

  // Warteg State
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [selectedAddonCategory, setSelectedAddonCategory] = useState<string>('')
  
  const [checkedItems, setCheckedItems] = useState<string[]>([]) // Array of menu & addon IDs
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({}) // Per-item notes
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastMeal, setLastMeal] = useState<{ date: string, items: any[] } | null>(null)
  const [topCombos, setTopCombos] = useState<TopOrderCombo[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [welcomeData, setWelcomeData] = useState<DailyGreetingData>(() => getJakartaWelcomeGreeting(0))
  const todayStr = getJakartaDateTime().dateStr
  
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTx, setHistoryTx] = useState<any[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      setWelcomeData(getJakartaWelcomeGreeting())
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!activeProfile?.id) return

    const fetchOrderSuggestions = async () => {
      const { data: pastOrders } = await supabase
        .from('kantin_orders')
        .select(`
          id, tanggal, created_at, menu_id, addon_id,
          deskripsi_pesanan, deskripsi_addon, harga, harga_addon, status,
          kantin_menus(nama, harga, is_active, is_habis, jam_tutup),
          kantin_addons(nama, harga, is_habis)
        `)
        .eq('profile_id', activeProfile.id)
        .neq('status', 'dibatalkan')
        .lt('tanggal', todayStr)
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(300)

      if (!pastOrders || pastOrders.length === 0) return

      // A. Pesanan Terakhir (tanggal paling baru sebelum hari ini)
      const lastDate = pastOrders[0].tanggal
      const lastMealItems = pastOrders.filter(o => o.tanggal === lastDate)
      if (lastMealItems.length > 0) {
        setLastMeal({ date: lastDate, items: lastMealItems })
      }

      // B. Top 5 kombinasi pesanan yang paling sering dibeli (dikelompokkan per tanggal)
      const ordersByDate = new Map<string, typeof pastOrders>()
      for (const row of pastOrders) {
        const key = row.tanggal
        if (!ordersByDate.has(key)) ordersByDate.set(key, [])
        ordersByDate.get(key)!.push(row)
      }

      const comboMap = new Map<string, {
        count: number
        lastDate: string
        entries: ComboOrderEntry[]
      }>()

      for (const [dateKey, rows] of ordersByDate.entries()) {
        const entries: ComboOrderEntry[] = []
        for (const r of rows) {
          const menuRel = Array.isArray(r.kantin_menus) ? r.kantin_menus[0] : r.kantin_menus
          const addonRel = Array.isArray(r.kantin_addons) ? r.kantin_addons[0] : r.kantin_addons
          if (r.menu_id) {
            entries.push({
              menu_id: r.menu_id,
              addon_id: null,
              note: (r.deskripsi_pesanan || '').trim(),
              addonNote: '',
              nama: menuRel?.nama || 'Menu',
              snapshotHarga: r.harga || 0,
            })
          }
          if (r.addon_id) {
            entries.push({
              menu_id: null,
              addon_id: r.addon_id,
              note: '',
              addonNote: (r.deskripsi_addon || '').trim(),
              nama: addonRel?.nama || 'Add-On',
              snapshotHarga: r.addon_id && r.menu_id ? (r.harga_addon || 0) : (r.harga || r.harga_addon || 0),
            })
          }
        }
        if (entries.length === 0) continue

        const signature = entries
          .map(e => (e.menu_id ? `m:${e.menu_id}:${e.note.toLowerCase()}` : `a:${e.addon_id}:${e.addonNote.toLowerCase()}`))
          .sort()
          .join('|')

        const existing = comboMap.get(signature)
        if (existing) {
          existing.count += 1
          if (dateKey > existing.lastDate) existing.lastDate = dateKey
        } else {
          comboMap.set(signature, {
            count: 1,
            lastDate: dateKey,
            entries,
          })
        }
      }

      const jakartaNow = getJakartaDateTime().timeStr
      const rankedCombos: TopOrderCombo[] = Array.from(comboMap.entries())
        .sort((a, b) => {
          if (b[1].count !== a[1].count) return b[1].count - a[1].count
          return b[1].lastDate.localeCompare(a[1].lastDate)
        })
        .slice(0, 5)
        .map(([signature, data]) => {
          let totalLivePrice = 0
          let hasSoldOut = false
          let hasClosed = false
          for (const entry of data.entries) {
            if (entry.menu_id) {
              const liveMenu = menus.find(m => m.id === entry.menu_id)
              if (liveMenu) {
                totalLivePrice += liveMenu.harga || 0
                if (liveMenu.is_habis) hasSoldOut = true
                if (liveMenu.is_active === false || (liveMenu.jam_tutup && jakartaNow >= liveMenu.jam_tutup.substring(0, 5))) {
                  hasClosed = true
                }
              } else {
                totalLivePrice += entry.snapshotHarga
              }
            } else if (entry.addon_id) {
              const liveAddon = addons.find(a => a.id === entry.addon_id)
              if (liveAddon) {
                totalLivePrice += liveAddon.harga || 0
                if (liveAddon.is_habis) hasSoldOut = true
              } else {
                totalLivePrice += entry.snapshotHarga
              }
            }
          }
          return {
            signature,
            count: data.count,
            lastDate: data.lastDate,
            items: data.entries,
            totalLivePrice,
            hasSoldOut,
            hasClosed,
          }
        })

      setTopCombos(rankedCombos)

      // Tampilkan modal saran awal sekali saat login / buka halaman
      const loginKey = localStorage.getItem('kantin_loginTime') || 'session'
      const seenKey = `kantin_suggestion_seen_${loginKey}`
      if (!sessionStorage.getItem(seenKey)) {
        sessionStorage.setItem(seenKey, '1')
        setShowSuggestions(true)
      }
    }

    fetchOrderSuggestions()
  }, [activeProfile?.id, menus, addons, todayStr])

  // Addon categories extraction
  const addonCategories = useMemo(() => {
    const cats = new Set<string>()
    addons.forEach(a => cats.add(a.kategori || 'Lainnya'))
    return Array.from(cats).sort()
  }, [addons])

  const isMenuClosed = (menu: { is_active?: boolean | null; jam_tutup?: string | null }, timeStr: string) => {
    return menu.is_active === false || (!!menu.jam_tutup && timeStr >= menu.jam_tutup.substring(0, 5))
  }

  // Groups extraction with open/closed status (sorted: Open A-Z first, Closed A-Z after)
  const menuGroupsInfo = useMemo(() => {
    const currentJakartaTime = getJakartaDateTime().timeStr
    const groupMap = new Map<string, { is_active?: boolean | null; jam_tutup?: string | null }[]>()

    menus.forEach(m => {
      const code = m.kode_unik || ''
      const grp = code.includes('-') ? code.split('-')[0] : 'Menu Lainnya'
      if (!groupMap.has(grp)) groupMap.set(grp, [])
      groupMap.get(grp)!.push(m)
    })

    return Array.from(groupMap.entries())
      .map(([name, groupMenus]) => ({
        name,
        isClosed: groupMenus.length > 0 && groupMenus.every(m => isMenuClosed(m, currentJakartaTime)),
      }))
      .sort((a, b) => {
        if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1
        return a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
      })
  }, [menus])

  // Prioritize first OPEN group when user hasn't picked one manually
  const effectiveGroup = selectedGroup || (menuGroupsInfo.find(g => !g.isClosed) || menuGroupsInfo[0])?.name || ''

  // Menus in current group
  const currentGroupMenus = useMemo(() => {
    return menus.filter(m => {
      const code = m.kode_unik || ''
      if (effectiveGroup === 'Menu Lainnya') return !code.includes('-')
      return code.startsWith(effectiveGroup + '-')
    }).sort((a, b) => (a.kode_unik || '').localeCompare(b.kode_unik || ''))
  }, [menus, effectiveGroup])

  // Calculate total price
  const totalPrice = useMemo(() => {
    let total = 0
    checkedItems.forEach(id => {
      const m = menus.find(menu => menu.id === id)
      if (m) total += m.harga
      const a = addons.find(addon => addon.id === id)
      if (a) total += a.harga
    })
    return total
  }, [checkedItems, menus, addons])

  const toggleItem = async (itemId: string, isHabis: boolean, isTutup: boolean) => {
    if (isHabis) return // Cannot select sold out items
    
    if (isTutup) {
      const proceed = await showConfirm({
        title: "Menu Ditutup",
        message: "Item ini sedang ditandai TUTUP oleh Admin. Yakin ingin memesannya?",
        confirmText: "Paksakan Pesan"
      })
      if (!proceed) return
    }

    setCheckedItems(prev => 
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    )
  }

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (checkedItems.length === 0) {
      showAlert({ title: "Perhatian", message: "Pilih minimal satu menu atau add-on!", type: "warning" })
      return
    }

    const p_id = activeProfile?.id
    if (!p_id) {
      showAlert({ title: "Sesi Habis", message: "Sesi Anda tidak valid. Silakan login ulang.", type: "error" })
      window.location.href = '/login'
      return
    }

    const { dateStr, timeStr: jakartaTimeStr } = getJakartaDateTime()

    for (const itemId of checkedItems) {
      const isMenu = menus.find(x => x.id === itemId)
      if (isMenu && isMenu.jam_tutup && jakartaTimeStr >= isMenu.jam_tutup.substring(0, 5)) {
        showAlert({
          title: "Batas Waktu Terlewat",
          message: `Menu ${isMenu.nama} sudah melewati batas waktu pemesanan (${isMenu.jam_tutup.substring(0, 5)}).\nSilakan hubungi admin secara langsung.`,
          type: "error"
        })
        return
      }
    }

    setIsSubmitting(true)

    try {
      // --- PRE-BUILD all payloads first ---
      const payloads: OrderItemPayload[] = []
      for (const itemId of checkedItems) {
        const isMenu = menus.find(x => x.id === itemId)
        const isAddon = addons.find(x => x.id === itemId)
        if (!isMenu && !isAddon) continue

        const note = itemNotes[itemId] || ''
        let m_id = null, a_id = null, price = 0, txKet = ''

        if (isMenu) {
          m_id = isMenu.id
          price = isMenu.harga
          txKet = isMenu.nama
        } else if (isAddon) {
          a_id = isAddon.id
          price = isAddon.harga
          txKet = isAddon.nama
        }

        if (note) txKet += ` (${note})`
        payloads.push({
          p_menu_id: m_id,
          p_addon_id: a_id,
          p_deskripsi_pesanan: isMenu ? note : '',
          p_deskripsi_addon: isAddon ? note : '',
          p_harga: isMenu ? price : 0,
          p_harga_addon: isAddon ? price : 0,
          p_tanggal: dateStr,
          p_tx_ket: txKet
        })
      }

      if (payloads.length === 0) {
        showAlert({ title: "Perhatian", message: "Tidak ada item valid untuk dipesan.", type: "warning" })
        return
      }

      // Cek saldo live di DB: saldo akhir dikurang total pesanan tidak boleh minus (< 0)
      const totalOrderPrice = payloads.reduce((sum, item) => sum + item.p_harga + item.p_harga_addon, 0)
      const saldoCheck = await fetchLiveSaldoAndValidate(p_id, totalOrderPrice)
      if (!saldoCheck.ok) {
        setActiveProfile((prev) => prev ? { ...prev, saldo: saldoCheck.saldo } : prev)
        await handleFailedSaldoCheck(saldoCheck, { showAlert, showConfirm }, () => router.push('/topup'))
        return
      }

      const { orderIds, newSaldo } = await submitOrderBatch(p_id, payloads)

      let newOrders: any[] = []
      if (orderIds.length > 0) {
        const { data: fetchedOrders, error: fetchErr } = await supabase
          .from('kantin_orders')
          .select(`*, kantin_profiles(nama, saldo), kantin_menus(nama, kode_unik), kantin_addons(nama)`)
          .in('id', orderIds)

        if (!fetchErr && fetchedOrders) {
          newOrders = fetchedOrders
        }
      }

      // All succeeded
      if (newSaldo !== null) {
        setActiveProfile((prev) => prev ? { ...prev, saldo: newSaldo } : prev)
      }
      setOrders(prev => [...newOrders, ...prev])
      setCheckedItems([])
      setItemNotes({})
      router.refresh()
      showAlert({ title: "Berhasil", message: "Pesanan Anda berhasil dibuat!", type: "success" })
      window.dispatchEvent(new Event('kantin_user_updated'))

    } catch (e: any) {
      await handleOrderError(e, { showAlert, showConfirm }, () => router.push('/topup'), 'Gagal memproses pesanan: ')
    } finally {
      setIsSubmitting(false)
    }
  }

  const reorderEntries = async (
    entries: ComboOrderEntry[],
    confirmTitle: string,
    confirmHeader: string
  ) => {
    if (isSubmitting || entries.length === 0) return

    const p_id = activeProfile?.id
    if (!p_id) return

    // Tutup modal saran lebih dulu agar dialog konfirmasi / peringatan saldo tidak bertumpuk
    setShowSuggestions(false)

    const { dateStr, timeStr: jakartaTimeStr } = getJakartaDateTime()

    // Cek jam tutup & item habis secara live dari master menus/addons
    const availableEntries: { entry: ComboOrderEntry; liveMenu?: any; liveAddon?: any }[] = []
    for (const entry of entries) {
      if (entry.menu_id) {
        const liveMenu = menus.find(m => m.id === entry.menu_id)
        if (!liveMenu) continue
        if (liveMenu.is_habis) {
          showAlert({
            title: 'Menu Habis',
            message: `Menu ${liveMenu.nama} sedang habis hari ini. Silakan pilih menu lain ya.`,
            type: 'warning',
          })
          return
        }
        if (liveMenu.jam_tutup && jakartaTimeStr >= liveMenu.jam_tutup.substring(0, 5)) {
          showAlert({
            title: 'Batas Waktu Terlewat',
            message: `Menu ${liveMenu.nama} sudah melewati batas waktu pemesanan (${liveMenu.jam_tutup.substring(0, 5)}).\nSilakan hubungi admin secara langsung.`,
            type: 'error',
          })
          return
        }
        availableEntries.push({ entry, liveMenu })
      } else if (entry.addon_id) {
        const liveAddon = addons.find(a => a.id === entry.addon_id)
        if (!liveAddon) continue
        if (liveAddon.is_habis) {
          showAlert({
            title: 'Add-On Habis',
            message: `Add-On ${liveAddon.nama} sedang habis hari ini. Silakan pilih menu lain ya.`,
            type: 'warning',
          })
          return
        }
        availableEntries.push({ entry, liveAddon })
      }
    }

    if (availableEntries.length === 0) {
      showAlert({ title: 'Perhatian', message: 'Item pesanan tidak ditemukan di daftar menu aktif.', type: 'warning' })
      return
    }

    const itemLines = availableEntries.map(({ entry, liveMenu, liveAddon }) => {
      const name = liveMenu?.nama || liveAddon?.nama || entry.nama
      const note = entry.note || entry.addonNote
      const price = (liveMenu ? liveMenu.harga : liveAddon?.harga) || 0
      return `- ${name}${note ? ` (${note})` : ''} • Rp ${price.toLocaleString('id-ID')}`
    }).join('\n')

    const estimatedTotal = availableEntries.reduce(
      (sum, { liveMenu, liveAddon }) => sum + ((liveMenu ? liveMenu.harga : liveAddon?.harga) || 0),
      0
    )

    const proceed = await showConfirm({
      title: confirmTitle,
      message: `${confirmHeader}\n\n${itemLines}\n\nTotal: Rp ${estimatedTotal.toLocaleString('id-ID')}`,
      confirmText: 'Ya, Pesan Sekarang',
      cancelText: 'Batal',
    })
    if (!proceed) return

    setIsSubmitting(true)

    try {
      const payloads: OrderItemPayload[] = []
      for (const { entry, liveMenu, liveAddon } of availableEntries) {
        if (liveMenu?.is_active === false) {
          const force = await showConfirm({
            title: 'Menu Ditutup',
            message: `Peringatan: Menu ${liveMenu.nama} sedang ditandai TUTUP. Lanjutkan pesan ini?`,
            confirmText: 'Paksakan Pesan',
          })
          if (!force) continue
        }

        const isMenu = !!liveMenu
        const note = isMenu ? entry.note : entry.addonNote
        const price = (isMenu ? liveMenu.harga : liveAddon?.harga) || 0
        let txKet = isMenu ? liveMenu.nama : liveAddon.nama
        if (note) txKet += ` (${note})`

        payloads.push({
          p_menu_id: isMenu ? liveMenu.id : null,
          p_addon_id: !isMenu ? liveAddon.id : null,
          p_deskripsi_pesanan: isMenu ? note : '',
          p_deskripsi_addon: !isMenu ? note : '',
          p_harga: isMenu ? price : 0,
          p_harga_addon: !isMenu ? price : 0,
          p_tanggal: dateStr,
          p_tx_ket: txKet,
        })
      }

      if (payloads.length === 0) {
        showAlert({ title: 'Perhatian', message: 'Tidak ada item valid untuk dipesan ulang.', type: 'warning' })
        return
      }

      const totalOrderPrice = payloads.reduce((sum, item) => sum + item.p_harga + item.p_harga_addon, 0)
      const saldoCheck = await fetchLiveSaldoAndValidate(p_id, totalOrderPrice)
      if (!saldoCheck.ok) {
        setActiveProfile((prev) => prev ? { ...prev, saldo: saldoCheck.saldo } : prev)
        await handleFailedSaldoCheck(saldoCheck, { showAlert, showConfirm }, () => router.push('/topup'))
        return
      }

      const { orderIds, newSaldo } = await submitOrderBatch(p_id, payloads)

      let newOrders: any[] = []
      if (orderIds.length > 0) {
        const { data: fetchedOrders, error: fetchErr } = await supabase
          .from('kantin_orders')
          .select(`*, kantin_profiles(nama, saldo), kantin_menus(nama, kode_unik, jam_tutup), kantin_addons(nama)`)
          .in('id', orderIds)

        if (!fetchErr && fetchedOrders) {
          newOrders = fetchedOrders
        }
      }

      if (newSaldo !== null) {
        setActiveProfile((prev) => prev ? { ...prev, saldo: newSaldo } : prev)
      }
      setOrders(prev => [...newOrders, ...prev])
      router.refresh()
      showAlert({ title: 'Berhasil', message: 'Pesanan Anda berhasil dibuat!', type: 'success' })
      window.dispatchEvent(new Event('kantin_user_updated'))
    } catch (e: any) {
      await handleOrderError(e, { showAlert, showConfirm }, () => router.push('/topup'), 'Gagal memproses pesanan: ')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReorder = async () => {
    if (!lastMeal || lastMeal.items.length === 0) return
    const entries: ComboOrderEntry[] = []
    for (const r of lastMeal.items) {
      if (r.menu_id) {
        entries.push({
          menu_id: r.menu_id,
          addon_id: null,
          note: (r.deskripsi_pesanan || '').trim(),
          addonNote: '',
          nama: r.kantin_menus?.nama || 'Menu',
          snapshotHarga: r.harga || 0,
        })
      }
      if (r.addon_id) {
        entries.push({
          menu_id: null,
          addon_id: r.addon_id,
          note: '',
          addonNote: (r.deskripsi_addon || '').trim(),
          nama: r.kantin_addons?.nama || 'Add-On',
          snapshotHarga: r.harga_addon || r.harga || 0,
        })
      }
    }
    await reorderEntries(
      entries,
      'Ulangi Pesanan Terakhir',
      `Apakah Anda ingin memesan ulang pesanan terakhir Anda (${lastMeal.date})?`
    )
  }

  const handleOrderCombo = async (combo: TopOrderCombo, rankIndex: number) => {
    await reorderEntries(
      combo.items,
      `Pesan Lagi Favorit #${rankIndex + 1}`,
      `Pesan kombinasi favorit yang sudah ${combo.count}x Anda pesan?`
    )
  }

  const handleDelete = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    
    // Cek jam tutup khusus untuk Menu
    if (order.kantin_menus?.jam_tutup) {
      const jamTutup = order.kantin_menus.jam_tutup
      const now = new Date()
      const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}))
      const hours = jakartaTime.getHours().toString().padStart(2, '0')
      const minutes = jakartaTime.getMinutes().toString().padStart(2, '0')
      const jakartaTimeStr = `${hours}:${minutes}`
      
      if (jakartaTimeStr >= jamTutup.substring(0, 5)) {
        showAlert({
          title: "Batas Waktu Lewat",
          message: `Waktu pembatalan untuk menu ini sudah ditutup (Batas: ${jamTutup.substring(0, 5)}).\nSilakan hubungi admin secara langsung jika ada perubahan mendesak.`,
          type: "error"
        })
        return
      }
    }
    
    const confirmDelete = await showConfirm({
      title: "Batalkan Pesanan",
      message: `Hapus pesanan ${order.kantin_menus?.nama || order.kantin_addons?.nama}?\nSaldo akan dikembalikan secara otomatis.`,
      confirmText: "Ya, Batalkan",
      variant: "destructive"
    })
    if (!confirmDelete) return

    try {
      const { error } = await supabase.rpc('cancel_user_order', { p_order_id: orderId })
      
      if (error) throw error

      setOrders(orders.filter(o => o.id !== orderId))
      router.refresh()
      window.dispatchEvent(new Event('kantin_user_updated'))
      showAlert({ title: "Dibatalkan", message: "Pesanan berhasil dibatalkan dan saldo telah kembali.", type: "success" })
    } catch (e: any) {
      showAlert({ title: "Gagal", message: "Gagal membatalkan pesanan. " + e.message, type: "error" })
    }
  }

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinMsg({ type: '', text: '' })

    if (newPin.length !== 5) {
      setPinMsg({ type: 'error', text: 'PIN baru harus 5 digit angka.' })
      return
    }
    if (oldPin === newPin) {
      setPinMsg({ type: 'error', text: 'PIN baru tidak boleh sama dengan PIN lama.' })
      return
    }

    if (!activeProfile) return

    setPinLoading(true)
    try {
      const { error } = await supabase.rpc('change_user_pin', {
        p_profile_id: activeProfile.id,
        p_old_pin: oldPin,
        p_new_pin: newPin
      })

      if (error) {
        if (error.message.includes('PIN Lama Salah')) {
          setPinMsg({ type: 'error', text: 'PIN Lama salah.' })
          return
        }
        throw error
      }

      setPinMsg({ type: 'success', text: 'PIN berhasil diubah!' })
      setOldPin('')
      setNewPin('')
      setTimeout(() => setShowPinModal(false), 2000)
    } catch (e: any) {
      setPinMsg({ type: 'error', text: 'Gagal mengubah PIN: ' + e.message })
    } finally {
      setPinLoading(false)
    }
  }

  // Filter orders for active user
  const myOrders = useMemo(() => {
    if (!activeProfile) return []
    return orders.filter(o => o.kantin_profiles?.nama === activeProfile.nama)
  }, [orders, activeProfile])

  const openHistory = async () => {
    if (!activeProfile?.id) return
    const { data } = await supabase
      .from('kantin_transactions')
      .select('*')
      .eq('profile_id', activeProfile.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistoryTx(data || [])
    setHistoryOpen(true)
  }

  if (authChecking) {
    return <div className="min-h-[50vh] flex items-center justify-center">Memeriksa sesi...</div>
  }

  const selectedGroupClosed = menuGroupsInfo.find(g => g.name === effectiveGroup)?.isClosed ?? false
  const currentJakartaTime = getJakartaDateTime().timeStr

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 items-start pb-40 lg:pb-8">
      {/* LEFT COLUMN: MENU SELECTION */}
      <div className="lg:col-span-8 space-y-4">
        
        {/* PERSISTENT DEBT WARNING BANNER */}
        {(activeProfile?.saldo ?? 0) < 0 && (
          <div className="bg-red-600 text-white p-3.5 rounded-xl shadow-md border-2 border-red-700 animate-pulse">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-xs uppercase tracking-wider">PERINGATAN TUNGGAKAN!</h3>
                <p className="text-xs mt-1 font-medium">
                  Hutang <strong>Rp {Math.abs(activeProfile?.saldo ?? 0).toLocaleString('id-ID')}</strong>. Yuk top up dulu agar pesananmu bisa diproses!
                </p>
                <a href="/topup" className="inline-block mt-2 bg-white text-red-700 px-3 py-1 text-xs font-bold rounded-lg hover:bg-red-50">
                  Top-Up Sekarang ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Welcome & User Info Card — Gold & White */}
        <div className="bg-white shadow-xs border border-amber-200 p-3.5 md:p-4 rounded-xl space-y-3">
          {/* Sweet Daily Welcome Remark */}
          <div className="bg-gradient-to-r from-amber-50 via-yellow-50/80 to-white border border-amber-200/80 rounded-xl px-3.5 py-2.5">
            <p className="text-xs md:text-sm font-black text-amber-900">
              {welcomeData.timeGreeting}, {activeProfile?.nama}! ✨
            </p>
            <p className="text-[11px] md:text-xs text-amber-800/90 mt-0.5 leading-relaxed">
              {welcomeData.sweetRemark}
            </p>
          </div>

          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="bg-amber-100 text-amber-800 border border-amber-200 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full font-black text-sm md:text-base shrink-0">
                {activeProfile?.nama?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-800 leading-tight truncate">{activeProfile?.nama}</p>
                <p className="text-[11px] text-slate-400 leading-tight truncate">{activeProfile?.divisi || 'Tanpa Divisi'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {(lastMeal || topCombos.length > 0) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSuggestions(true)}
                  className="text-amber-700 border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-[11px] h-7 px-2.5 font-bold rounded-lg"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Saran
                </Button>
              )}
              <Dialog open={showPinModal} onOpenChange={setShowPinModal}>
                <DialogTrigger 
                  render={
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-slate-600 border-slate-200 hover:bg-slate-50 text-[11px] h-7 px-2.5 font-bold rounded-lg"
                    />
                  }
                >
                  <KeyRound className="h-3 w-3 mr-1" />
                  PIN
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Ubah PIN Akun</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleChangePin} className="space-y-4 mt-4">
                    {pinMsg.text && (
                      <div className={`p-3 text-xs font-bold rounded-md ${pinMsg.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                        {pinMsg.text}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>PIN Lama (5 Angka)</Label>
                      <Input 
                        type="password" 
                        maxLength={5} 
                        inputMode="numeric"
                        value={oldPin}
                        onChange={(e) => setOldPin(e.target.value.replace(/\D/g, ''))}
                        className="text-center tracking-widest font-mono"
                        placeholder="•••••"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>PIN Baru (5 Angka)</Label>
                      <Input 
                        type="password" 
                        maxLength={5} 
                        inputMode="numeric"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                        className="text-center tracking-widest font-mono border-amber-300 focus-visible:ring-amber-500"
                        placeholder="•••••"
                      />
                    </div>
                    <Button type="submit" disabled={pinLoading} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold mt-2">
                      {pinLoading ? 'Menyimpan...' : 'Simpan PIN Baru'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Button 
                variant="outline" 
                size="sm" 
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 text-[11px] h-7 px-2.5 font-bold rounded-lg"
                onClick={() => {
                  localStorage.removeItem('kantin_userName')
                  localStorage.removeItem('kantin_loginTime')
                  window.location.href = '/login'
                }}
              >
                Keluar
              </Button>
            </div>
          </div>

          {/* Saldo + Last Meal row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2.5 border-t border-amber-100">
            <div className="bg-amber-50/40 px-3 py-2 rounded-xl flex items-center justify-between border border-amber-100">
              <div>
                <span className="text-[10px] font-bold text-amber-700/70 uppercase tracking-wider block">Saldo Anda</span>
                {(activeProfile?.saldo ?? 0) < 0 ? (
                  <span className="text-sm font-black text-red-600">-Rp {Math.abs(activeProfile?.saldo ?? 0).toLocaleString('id-ID')}</span>
                ) : (
                  <span className="text-sm font-black text-emerald-600">Rp {(activeProfile?.saldo || 0).toLocaleString('id-ID')}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-7 text-[11px] px-2.5 bg-white text-slate-600 border-amber-200 hover:bg-amber-50 rounded-lg font-semibold"
                  onClick={openHistory}
                >
                  Riwayat
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-7 text-[11px] px-2.5 bg-amber-500 text-white border-amber-500 hover:bg-amber-600 hover:text-white rounded-lg font-bold"
                  onClick={() => window.location.href = '/topup'}
                >
                  Top Up
                </Button>
              </div>
            </div>

            {lastMeal && lastMeal.items.length > 0 ? (
              <div 
                className="bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 cursor-pointer hover:bg-amber-100/80 transition-colors flex flex-col justify-center"
                onClick={handleReorder}
              >
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">↩ Ulangi Terakhir ({lastMeal.date})</span>
                <span className="text-xs font-bold text-amber-950 line-clamp-1 mt-0.5">
                  {lastMeal.items.map(i => i.kantin_menus?.nama || i.kantin_addons?.nama).join(', ')}
                </span>
              </div>
            ) : (
              <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex flex-col justify-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pesanan Terakhir</span>
                <span className="text-xs font-medium text-slate-400 italic mt-0.5">Belum ada riwayat pesanan</span>
              </div>
            )}
          </div>
        </div>

        {/* Group & Addon Selectors — balanced 2-column Gold & White bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sticky top-12 md:top-14 z-20 bg-white/95 backdrop-blur-sm p-2.5 rounded-xl border border-amber-200 shadow-xs">
          {/* Menu Utama */}
          <div className="flex items-center gap-2 bg-amber-50/70 border border-amber-200 rounded-lg px-3 py-2">
            <span className="text-xs font-black text-amber-700 shrink-0">🍽</span>
            <Select value={effectiveGroup} onValueChange={(val) => val && setSelectedGroup(val)}>
              <SelectTrigger className={`w-full h-7 border-0 bg-transparent text-xs md:text-sm font-bold p-0 shadow-none focus:ring-0 gap-1 ${selectedGroupClosed ? 'text-slate-500' : 'text-amber-950'}`}>
                <SelectValue placeholder="Pilih Toko / Menu Utama..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-slate-400 text-xs italic">-- Sembunyikan --</SelectItem>
                {menuGroupsInfo.map(({ name, isClosed }) => (
                  <SelectItem
                    key={name}
                    value={name}
                    className={`font-semibold text-xs ${isClosed ? 'text-slate-400 italic' : 'text-amber-950'}`}
                  >
                    {isClosed ? `${name} (Tutup)` : name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add-On — Gold & White palette */}
          <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
            <span className="text-xs font-black text-amber-600 shrink-0">☕</span>
            <Select value={selectedAddonCategory} onValueChange={(val) => val && setSelectedAddonCategory(val)}>
              <SelectTrigger className="w-full h-7 border-0 bg-transparent text-xs md:text-sm font-bold text-amber-900 p-0 shadow-none focus:ring-0 gap-1">
                <SelectValue placeholder="Pilih Add-On / Minuman..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-slate-400 text-xs italic">-- Sembunyikan --</SelectItem>
                {addonCategories.map(cat => (
                  <SelectItem key={cat} value={cat} className="font-semibold text-xs text-amber-950">{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Menu Items Grid */}
        {effectiveGroup && effectiveGroup !== 'none' && (
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-gradient-to-r from-amber-50 to-white border-b border-amber-200 flex items-center justify-between gap-2">
              <div className="font-black text-amber-900 text-sm md:text-base">
                Makanan Utama: {effectiveGroup}
              </div>
              {selectedGroupClosed && (
                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold uppercase">
                  Sedang Tutup
                </span>
              )}
            </div>
            <div className="p-3.5 md:p-4">
              {currentGroupMenus.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">Tidak ada menu di kelompok ini.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {currentGroupMenus.map(menu => {
                    // @ts-ignore
                    const isHabis = menu.is_habis === true
                    const isTutup = isMenuClosed(menu, currentJakartaTime)
                    const isChecked = checkedItems.includes(menu.id)
                    
                    return (
                      <div
                        key={menu.id}
                        className={`rounded-xl border p-3.5 transition-all ${
                          isChecked
                            ? 'border-amber-400 bg-amber-50/70 ring-1 ring-amber-300/60 shadow-xs'
                            : 'border-amber-100 bg-white hover:border-amber-300 hover:bg-amber-50/20'
                        }`}
                      >
                        <div 
                          className={`flex items-center gap-3 ${isHabis ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                          onClick={() => toggleItem(menu.id, isHabis, isTutup)}
                        >
                          <Checkbox 
                            checked={isChecked} 
                            className={`h-5 w-5 border-amber-400 data-[state=checked]:bg-amber-500 ${isHabis ? 'opacity-50' : ''} shrink-0`}
                            onCheckedChange={() => toggleItem(menu.id, isHabis, isTutup)}
                            onClick={e => e.stopPropagation()}
                            disabled={isHabis}
                          />
                          
                          {menu.foto_url ? (
                            <img src={menu.foto_url} alt={menu.nama} className="w-12 h-12 md:w-14 md:h-14 object-cover rounded-lg border border-amber-100 bg-white shrink-0" />
                          ) : (
                            <div className="w-12 h-12 md:w-14 md:h-14 bg-amber-50/70 text-amber-400 flex items-center justify-center rounded-lg border border-amber-100 shrink-0">
                              <ImageIcon className="h-5 w-5" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <p className={`font-bold text-xs md:text-sm leading-snug line-clamp-2 ${isHabis ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                                {menu.nama}
                              </p>
                              {isHabis && <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Habis</span>}
                              {isTutup && !isHabis && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Tutup</span>}
                            </div>
                            <p className="text-xs md:text-sm text-amber-700 font-black">Rp {menu.harga.toLocaleString('id-ID')}</p>
                          </div>
                        </div>
                        
                        {/* Per-Item Note — roomy padding & height */}
                        {isChecked && (
                          <div className="mt-3 pt-2.5 border-t border-amber-200/70">
                            <Input 
                              placeholder="Keterangan... cth: pedas, tambah kuah" 
                              value={itemNotes[menu.id] || ''}
                              onChange={e => setItemNotes(prev => ({...prev, [menu.id]: e.target.value}))}
                              className="h-9 text-xs px-3 bg-white border-amber-300 focus-visible:ring-amber-500 rounded-lg"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Addons Items Grid — Gold & White palette */}
        {selectedAddonCategory && selectedAddonCategory !== 'none' && (
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-gradient-to-r from-amber-50/70 to-white border-b border-amber-200 font-black text-amber-900 text-sm md:text-base">
              Add-On: {selectedAddonCategory}
            </div>
            <div className="p-3.5 md:p-4">
              {addons.filter(a => a.kategori === selectedAddonCategory).length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">Tidak ada add-on.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {addons.filter(a => a.kategori === selectedAddonCategory).map(addon => {
                    // @ts-ignore
                    const isHabis = addon.is_habis === true
                    const isChecked = checkedItems.includes(addon.id)
                    
                    return (
                      <div
                        key={addon.id}
                        className={`rounded-xl border p-3.5 transition-all ${
                          isChecked
                            ? 'border-amber-400 bg-amber-50/70 ring-1 ring-amber-300/60 shadow-xs'
                            : 'border-amber-100 bg-white hover:border-amber-300 hover:bg-amber-50/20'
                        }`}
                      >
                        <div 
                          className={`flex items-center gap-3 ${isHabis ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                          onClick={() => toggleItem(addon.id, isHabis, false)}
                        >
                          <Checkbox 
                            checked={isChecked} 
                            className={`h-5 w-5 border-amber-400 data-[state=checked]:bg-amber-500 ${isHabis ? 'opacity-50' : ''} shrink-0`}
                            onCheckedChange={() => toggleItem(addon.id, isHabis, false)}
                            onClick={e => e.stopPropagation()}
                            disabled={isHabis}
                          />
                          
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-start justify-between gap-1.5">
                              <p className={`font-bold text-xs md:text-sm leading-snug ${isHabis ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                                {addon.nama}
                              </p>
                              {isHabis && <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">Habis</span>}
                            </div>
                            <p className="text-xs md:text-sm text-amber-700 font-black">Rp {addon.harga.toLocaleString('id-ID')}</p>
                          </div>
                        </div>
                        
                        {/* Per-Item Note */}
                        {isChecked && (
                          <div className="mt-3 pt-2.5 border-t border-amber-200/70">
                            <Input 
                              placeholder="Keterangan... cth: es sedikit, manis" 
                              value={itemNotes[addon.id] || ''}
                              onChange={e => setItemNotes(prev => ({...prev, [addon.id]: e.target.value}))}
                              className="h-9 text-xs px-3 bg-white border-amber-300 focus-visible:ring-amber-500 rounded-lg"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT / MOBILE STICKY CART */}
      <div className="lg:col-span-4 lg:sticky lg:top-20 space-y-3">
        
        <div className="fixed bottom-0 left-0 right-0 lg:static lg:bottom-auto z-50">
          <Card className="border-amber-200 shadow-[0_-6px_16px_rgba(0,0,0,0.12)] rounded-none lg:rounded-xl lg:shadow-sm overflow-hidden">
            {/* Cart header bar */}
            <div className="bg-amber-500 px-4 py-2.5 md:py-3 text-white flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-xs md:text-sm">
                <ShoppingBag className="h-4 w-4" />
                <span>Keranjang {checkedItems.length > 0 && `(${checkedItems.length})`}</span>
              </div>
              <div className="text-sm md:text-base font-black">
                Rp {totalPrice.toLocaleString('id-ID')}
              </div>
            </div>

            <div className="px-4 py-3 bg-white">
              {checkedItems.length > 0 ? (
                <div className="mb-3 max-h-[75px] md:max-h-[160px] overflow-y-auto space-y-1.5 border-b border-amber-100 pb-2.5 pr-1">
                  {checkedItems.map(id => {
                    const item = menus.find(m => m.id === id) || addons.find(a => a.id === id)
                    if (!item) return null
                    return (
                      <div key={id} className="flex justify-between items-start text-xs">
                        <div className="flex-1 pr-2">
                          <p className="font-bold text-slate-700 leading-tight">{item.nama}</p>
                          {itemNotes[id] && <p className="text-[10px] text-amber-700 italic mt-0.5">"{itemNotes[id]}"</p>}
                        </div>
                        <div className="font-bold text-amber-700 shrink-0 tabular-nums">
                          {item.harga.toLocaleString('id-ID')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 mb-3 text-center py-1">
                  Belum ada menu dipilih.
                </p>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={handleOrder}
                  disabled={checkedItems.length === 0 || isSubmitting}
                  className="flex-1 h-10 font-bold text-xs md:text-sm bg-amber-500 hover:bg-amber-600 text-white rounded-lg"
                >
                  {isSubmitting ? 'Proses...' : 'Pesan Sekarang'}
                </Button>

                <Dialog>
                  <DialogTrigger 
                    render={
                      <Button variant="outline" className="h-10 border-amber-200 text-amber-800 bg-amber-50/70 hover:bg-amber-100 font-bold text-xs px-3 rounded-lg" />
                    }
                  >
                    <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
                    Saya ({myOrders.length})
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Pesanan Saya Hari Ini</DialogTitle>
                  </DialogHeader>
                  <div className="mt-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="text-xs font-bold text-slate-500 h-8">MENU</TableHead>
                          <TableHead className="text-right text-xs font-bold text-slate-500 h-8">HARGA</TableHead>
                          <TableHead className="w-[40px] h-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-xs text-slate-400 py-6">
                              Belum ada pesanan hari ini.
                            </TableCell>
                          </TableRow>
                        ) : (
                          myOrders.map(order => (
                            <TableRow key={order.id} className="hover:bg-slate-50/50">
                              <TableCell className="py-2 px-2">
                                <div className="text-xs font-semibold text-slate-800 leading-tight flex flex-col gap-0.5">
                                  <span>{order.kantin_menus?.nama || order.kantin_addons?.nama || 'Item'}</span>
                                  {order.status === 'selesai' && <span className="w-fit text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase">Selesai</span>}
                                  {order.status === 'dibatalkan' && <span className="w-fit text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase">Batal</span>}
                                  {order.status === 'pending' && <span className="w-fit text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase">Menunggu</span>}
                                </div>
                                {(order.deskripsi_pesanan || order.deskripsi_addon) && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 italic">"{order.deskripsi_pesanan || order.deskripsi_addon}"</div>
                                )}
                                {order.admin_note && (
                                  <div className="text-[10px] text-red-600 font-bold mt-1 bg-red-50 p-1 rounded italic border border-red-100">
                                    Admin: {order.admin_note}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right py-2 px-2 align-top pt-2">
                                <div className="text-xs font-bold text-yellow-700 whitespace-nowrap tabular-nums">
                                  {((order.harga || 0) + (order.harga_addon || 0)).toLocaleString('id-ID')}
                                </div>
                              </TableCell>
                              <TableCell className="py-2 pr-1 text-right align-top">
                                {order.status === 'pending' && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                    onClick={() => handleDelete(order.id)}
                                    title="Batalkan"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </Card>
        </div>
      </div>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Riwayat Transaksi</DialogTitle>
            <DialogDescription>
              Menampilkan 20 transaksi terakhir Anda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {historyTx.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-8">Belum ada riwayat transaksi.</p>
            ) : (
              historyTx.map(tx => (
                <div key={tx.id} className="flex justify-between items-center p-3 border rounded-lg bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{tx.keterangan || 'Transaksi'}</p>
                    <p className="text-xs text-slate-500">{new Date(tx.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                  <div className={`text-sm font-bold ${tx.tipe === 'pemasukan' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.tipe === 'pemasukan' ? '+' : '-'} Rp {tx.jumlah.toLocaleString('id-ID')}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Saran Awal Modal saat Login (Opsi A: Pesanan Terakhir, B: Top 5 Kombinasi, C: Abaikan Besar) */}
      <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
        <DialogContent className="sm:max-w-lg w-[94vw] max-h-[88vh] overflow-y-auto rounded-2xl border-2 border-amber-200 bg-white p-4 sm:p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full w-fit">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Saran Menu Untukmu
            </div>
            <DialogTitle className="text-base sm:text-lg font-black text-amber-950">
              {welcomeData.timeGreeting}, {activeProfile?.nama}! ✨
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-amber-800/90 leading-relaxed">
              {welcomeData.sweetRemark}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* OPSI A: PESANAN TERAKHIR */}
            {lastMeal && lastMeal.items.length > 0 && (
              <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50/60 to-white p-3.5 sm:p-4 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase tracking-wide">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span>A. Pesanan Terakhir</span>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-700 bg-white border border-amber-200 px-2 py-0.5 rounded-full">
                    {lastMeal.date}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-700">
                  {lastMeal.items.map((item, idx) => {
                    const name = item.kantin_menus?.nama || item.kantin_addons?.nama || 'Menu'
                    const note = item.deskripsi_pesanan || item.deskripsi_addon
                    return (
                      <div key={idx} className="flex items-start justify-between gap-2">
                        <span>
                          • <strong className="text-slate-900">{name}</strong>
                          {note && <span className="text-amber-700 italic"> ({note})</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="pt-1 flex justify-end">
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleReorder}
                    className="w-full sm:w-auto h-9 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg shadow-xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Pesan Lagi Pesanan Terakhir
                  </Button>
                </div>
              </div>
            )}

            {/* OPSI B: TOP 5 KOMBINASI SERING DIBELI */}
            {topCombos.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase tracking-wide px-0.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>B. Top {topCombos.length} Kombinasi Favoritmu</span>
                </div>
                <div className="space-y-2.5">
                  {topCombos.map((combo, idx) => (
                    <div
                      key={combo.signature}
                      className="rounded-xl border border-amber-200 bg-white hover:border-amber-300 p-3.5 transition-colors shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-black">
                            #{idx + 1}
                          </span>
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            {combo.count}x dipesan
                          </span>
                          {combo.hasSoldOut && (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Ada item habis
                            </span>
                          )}
                          {combo.hasClosed && !combo.hasSoldOut && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              Ada menu tutup
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-black text-amber-700 tabular-nums">
                          Rp {combo.totalLivePrice.toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {combo.items.map((entry, itemIdx) => (
                          <span
                            key={itemIdx}
                            className="inline-flex items-center text-[11px] font-semibold bg-amber-50/70 text-slate-800 border border-amber-100 px-2.5 py-1 rounded-lg"
                          >
                            {entry.nama}
                            {(entry.note || entry.addonNote) && (
                              <span className="text-amber-700 italic ml-1">
                                ({entry.note || entry.addonNote})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>

                      <div className="pt-1 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isSubmitting || combo.hasSoldOut}
                          onClick={() => handleOrderCombo(combo, idx)}
                          className="w-full sm:w-auto h-8 px-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg"
                        >
                          <RotateCcw className="h-3 w-3 mr-1.5" />
                          Pesan Lagi
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OPSI C: ABAIKAN (TOMBOL BESAR DENGAN PADDING BESAR) */}
            <div className="pt-2 border-t border-amber-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSuggestions(false)}
                className="w-full h-auto py-5 sm:py-6 px-6 text-sm sm:text-base font-extrabold text-amber-900 bg-white hover:bg-amber-50 border-2 border-amber-300 rounded-xl shadow-xs transition-all"
              >
                Abaikan &amp; Pilih Menu Lain
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
