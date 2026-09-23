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
import { AlertCircle, Image as ImageIcon, ShoppingBag, Trash2, KeyRound } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { id } from 'date-fns/locale'
import { useAppDialog } from '@/components/AppDialogProvider'

export default function OrderForm({ profiles, menus, addons, initialOrders }: { profiles: any[], menus: any[], addons: any[], initialOrders: any[] }) {
  const { showAlert, showConfirm } = useAppDialog()
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  
  // Auth State
  const [activeProfile, setActiveProfile] = useState<any>(null)
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
  const todayStr = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" })).toISOString().split('T')[0]
  
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyTx, setHistoryTx] = useState<any[]>([])

  useEffect(() => {
    if (!activeProfile?.id) return

    const fetchLastMeal = async () => {
      // 1. Get the most recent order date EXCLUDING today
      const { data: latest } = await supabase
        .from('kantin_orders')
        .select('tanggal')
        .eq('profile_id', activeProfile.id)
        .lt('tanggal', todayStr)
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)

      if (!latest || latest.length === 0) return
      
      const lastDate = latest[0].tanggal
      
      // 2. Fetch all items from that date
      const { data: mealItems } = await supabase
        .from('kantin_orders')
        .select(`*, kantin_menus(nama, harga, is_active), kantin_addons(nama, harga, is_habis)`)
        .eq('profile_id', activeProfile.id)
        .eq('tanggal', lastDate)
        .order('created_at', { ascending: true })
        
      if (mealItems && mealItems.length > 0) {
        setLastMeal({ date: lastDate, items: mealItems })
      }
    }

    fetchLastMeal()
  }, [activeProfile?.id])

  // Addon categories extraction
  const addonCategories = useMemo(() => {
    const cats = new Set<string>()
    addons.forEach(a => cats.add(a.kategori || 'Lainnya'))
    return Array.from(cats).sort()
  }, [addons])

  // Groups extraction
  const menuGroups = useMemo(() => {
    const groups = new Set<string>()
    menus.forEach(m => {
      const code = m.kode_unik || ''
      if (code.includes('-')) {
        groups.add(code.split('-')[0])
      } else {
        groups.add('Menu Lainnya')
      }
    })
    return Array.from(groups).sort()
  }, [menus])

  // Set default group
  useEffect(() => {
    if (menuGroups.length > 0 && !selectedGroup) {
      setSelectedGroup(menuGroups[0])
    }
  }, [menuGroups, selectedGroup])

  // Menus in current group
  const currentGroupMenus = useMemo(() => {
    return menus.filter(m => {
      const code = m.kode_unik || ''
      if (selectedGroup === 'Menu Lainnya') return !code.includes('-')
      return code.startsWith(selectedGroup + '-')
    }).sort((a, b) => (a.kode_unik || '').localeCompare(b.kode_unik || ''))
  }, [menus, selectedGroup])

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

    // CEK JAM TUTUP SEMUA MENU YANG DIPILIH
    const now = new Date()
    const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}))
    const hours = jakartaTime.getHours().toString().padStart(2, '0')
    const minutes = jakartaTime.getMinutes().toString().padStart(2, '0')
    const jakartaTimeStr = `${hours}:${minutes}`

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

    // BLOCK JIKA SALDO SUDAH MINUS
    if (activeProfile.saldo < 0) {
      showAlert({
        title: "Pemesanan Ditolak",
        message: `Saldo Anda minus (Rp ${Math.abs(activeProfile.saldo).toLocaleString('id-ID')}).\nHarap selesaikan pembayaran sebelumnya untuk memesan kembali.`,
        type: "error"
      })
      return
    }

    setIsSubmitting(true)

    try {
      // --- PRE-BUILD all payloads first to fail fast before touching DB ---
      const payloads: any[] = []
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
          p_profile_id: p_id,
          p_menu_id: m_id,
          p_addon_id: a_id,
          p_deskripsi_pesanan: isMenu ? note : '',
          p_deskripsi_addon: isAddon ? note : '',
          p_harga: isMenu ? price : 0,
          p_harga_addon: isAddon ? price : 0,
          p_tanggal: todayStr,
          p_tx_ket: txKet
        })
      }

      if (payloads.length === 0) {
        showAlert({ title: "Perhatian", message: "Tidak ada item valid untuk dipesan.", type: "warning" })
        return
      }

      // --- EXECUTE all RPCs; if ANY fails, rollback all already-created orders ---
      const createdOrderIds: string[] = []
      const newOrders: any[] = []

      for (const payload of payloads) {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('process_order', payload)

        if (rpcErr) {
          // ROLLBACK: cancel all orders that already succeeded
          for (const id of createdOrderIds) {
            await supabase.rpc('cancel_user_order', { p_order_id: id })
          }
          throw rpcErr
        }

        createdOrderIds.push(rpcData.order_id)

        const { data: newOrder, error: fetchErr } = await supabase
          .from('kantin_orders')
          .select(`*, kantin_profiles(nama, saldo), kantin_menus(nama, kode_unik), kantin_addons(nama)`)
          .eq('id', rpcData.order_id)
          .single()

        if (!fetchErr && newOrder) {
          newOrders.push(newOrder)
        }
      }

      // All succeeded
      setOrders(prev => [...newOrders, ...prev])
      setCheckedItems([])
      setItemNotes({})
      router.refresh()
      showAlert({ title: "Berhasil", message: "Pesanan Anda berhasil dibuat!", type: "success" })
      window.dispatchEvent(new Event('kantin_user_updated'))

    } catch (e: any) {
      showAlert({ title: "Gagal", message: "Gagal memproses pesanan: " + e.message, type: "error" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReorder = async () => {
    if (!lastMeal || lastMeal.items.length === 0) return
    
    // Format the items list for the prompt
    const itemNames = lastMeal.items.map(item => {
      const name = item.kantin_menus?.nama || item.kantin_addons?.nama || 'Item'
      const note = item.deskripsi_pesanan || item.deskripsi_addon ? ` (${item.deskripsi_pesanan || item.deskripsi_addon})` : ''
      return `- ${name}${note}`
    }).join('\n')

    const proceed = await showConfirm({
      title: "Pesan Ulang",
      message: `Apakah Anda ingin memesan ulang pesanan terakhir Anda (Tgl: ${lastMeal.date})?\n\nDetail:\n${itemNames}`,
      confirmText: "Ya, Pesan Sekarang"
    })
    if (!proceed) return

    const p_id = activeProfile?.id
    if (!p_id) return

    // CEK JAM TUTUP SEMUA MENU YANG AKAN DI-REORDER
    const now = new Date()
    const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}))
    const hours = jakartaTime.getHours().toString().padStart(2, '0')
    const minutes = jakartaTime.getMinutes().toString().padStart(2, '0')
    const jakartaTimeStr = `${hours}:${minutes}`

    for (const oldOrder of lastMeal.items) {
      if (oldOrder.kantin_menus?.jam_tutup && jakartaTimeStr >= oldOrder.kantin_menus.jam_tutup.substring(0, 5)) {
        showAlert({
          title: "Batas Waktu Terlewat",
          message: `Menu ${oldOrder.kantin_menus.nama} sudah melewati batas waktu pemesanan (${oldOrder.kantin_menus.jam_tutup.substring(0, 5)}).\nSilakan hubungi admin secara langsung.`,
          type: "error"
        })
        return
      }
    }

    // BLOCK JIKA SALDO SUDAH MINUS
    if (activeProfile.saldo < 0) {
      showAlert({
        title: "Pemesanan Ditolak",
        message: `Saldo Anda minus (Rp ${Math.abs(activeProfile.saldo).toLocaleString('id-ID')}).\nHarap selesaikan pembayaran sebelumnya untuk memesan kembali.`,
        type: "error"
      })
      return
    }

    setIsSubmitting(true)

    try {
      const newOrders: any[] = []
      for (const oldOrder of lastMeal.items) {
        // Quick check if menu is active
        if (oldOrder.kantin_menus?.is_active === false) {
          const force = await showConfirm({
            title: "Menu Ditutup",
            message: `Peringatan: Menu ${oldOrder.kantin_menus.nama} sedang ditandai TUTUP. Lanjutkan pesan ini?`,
            confirmText: "Paksakan Pesan"
          })
          if (!force) continue
        }

        const isMenu = !!oldOrder.menu_id
        const isAddon = !!oldOrder.addon_id
        const note = oldOrder.deskripsi_pesanan || oldOrder.deskripsi_addon || ''
        const m_id = oldOrder.menu_id
        const a_id = oldOrder.addon_id
        const price = isMenu ? oldOrder.kantin_menus?.harga : (isAddon ? oldOrder.kantin_addons?.harga : 0)
        let txKet = isMenu ? oldOrder.kantin_menus?.nama : (isAddon ? oldOrder.kantin_addons?.nama : '')
        
        if (note) txKet += ` (${note})`

        const { data: rpcData, error: rpcErr } = await supabase.rpc('process_order', {
          p_profile_id: p_id,
          p_menu_id: m_id,
          p_addon_id: a_id,
          p_deskripsi_pesanan: isMenu ? note : '',
          p_deskripsi_addon: isAddon ? note : '',
          p_harga: isMenu ? price : 0,
          p_harga_addon: isAddon ? price : 0,
          p_tanggal: todayStr,
          p_tx_ket: txKet
        })

        if (rpcErr) throw rpcErr

        const { data: newOrder, error: fetchErr } = await supabase
          .from('kantin_orders')
          .select(`*, kantin_profiles(nama, saldo), kantin_menus(nama, kode_unik, jam_tutup), kantin_addons(nama)`)
          .eq('id', rpcData.order_id)
          .single()

        if (!fetchErr && newOrder) {
          newOrders.push(newOrder)
        }
      }

      setOrders(prev => [...newOrders, ...prev])
      router.refresh()
      showAlert({ title: "Berhasil", message: "Pemesanan ulang berhasil!", type: "success" })
      window.dispatchEvent(new Event('kantin_user_updated'))
      
    } catch (e: any) {
      showAlert({ title: "Gagal", message: "Gagal memproses pesanan: " + e.message, type: "error" })
    } finally {
      setIsSubmitting(false)
    }
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-24 lg:pb-0">
      {/* LEFT COLUMN: WARTEG SELECTION */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-4">
        
        {/* PERSISTENT DEBT WARNING BANNER */}
        {activeProfile?.saldo < 0 && (
          <div className="bg-red-600 text-white p-3 rounded-lg shadow-md border-2 border-red-700 animate-pulse">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-6 w-6 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider">PERINGATAN TUNGGAKAN!</h3>
                <p className="text-xs mt-1 font-medium">
                  Anda memiliki hutang sebesar <strong>Rp {Math.abs(activeProfile.saldo).toLocaleString('id-ID')}</strong>. 
                  Anda tetap bisa memesan, namun <strong>pesanan Anda mungkin TIDAK AKAN DIPROSES / DIANTARKAN</strong> hingga tunggakan ini dilunasi!
                </p>
                <a href="/topup" className="inline-block mt-2 bg-white text-red-700 px-3 py-1 text-xs font-bold rounded hover:bg-red-50">
                  Top-Up Sekarang ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* User Info Bar */}
        <div className="bg-white shadow-sm border border-yellow-200 p-3 rounded-lg flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 text-yellow-700 w-10 h-10 flex items-center justify-center rounded-full font-bold text-lg shrink-0">
                {activeProfile?.nama?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">{activeProfile?.nama}</p>
                <p className="text-[10px] text-slate-500">{activeProfile?.divisi || 'Tanpa Divisi'} • {format(new Date(), 'EEEE, dd MMM yyyy', { locale: id })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Dialog open={showPinModal} onOpenChange={setShowPinModal}>
                <DialogTrigger 
                  render={
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-slate-600 border-slate-200 hover:bg-slate-50 text-[10px] h-6 px-2 font-bold"
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
                        className="text-center tracking-widest font-mono border-yellow-300 focus-visible:ring-yellow-500"
                        placeholder="•••••"
                      />
                    </div>
                    <Button type="submit" disabled={pinLoading} className="w-full bg-yellow-500 hover:bg-yellow-600 font-bold mt-2">
                      {pinLoading ? 'Menyimpan...' : 'Simpan PIN Baru'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Button 
                variant="outline" 
                size="sm" 
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 text-[10px] h-6 px-2 font-bold"
                onClick={() => {
                  localStorage.removeItem('kantin_userName')
                  localStorage.removeItem('kantin_loginTime')
                  window.location.href = '/login'
                }}
              >
                Logout
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 mt-1">
            <div className="bg-slate-50 p-2 rounded flex flex-col justify-center border border-slate-100 relative">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Saldo Anda</span>
              {activeProfile?.saldo < 0 ? (
                <span className="text-sm font-black text-red-600">- Rp {Math.abs(activeProfile?.saldo).toLocaleString('id-ID')}</span>
              ) : (
                <span className="text-sm font-black text-green-600">Rp {(activeProfile?.saldo || 0).toLocaleString('id-ID')}</span>
              )}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-6 text-[10px] px-2 bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                  onClick={openHistory}
                >
                  History
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-6 text-[10px] px-2 bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => window.location.href = '/topup'}
                >
                  Top Up
                </Button>
              </div>
            </div>

            {lastMeal && lastMeal.items.length > 0 ? (
              <div 
                className="bg-yellow-50 p-2 rounded flex flex-col justify-center border border-yellow-200 cursor-pointer hover:bg-yellow-100 transition-colors"
                onClick={handleReorder}
              >
                <span className="text-[9px] font-bold text-yellow-700 uppercase tracking-wider mb-0.5">
                  Ulangi Pesanan ({lastMeal.date})
                </span>
                <span className="text-[10px] font-bold text-yellow-900 line-clamp-1">
                  {lastMeal.items.map(i => i.kantin_menus?.nama || i.kantin_addons?.nama).join(', ')}
                </span>
              </div>
            ) : (
              <div className="bg-slate-50 p-2 rounded flex flex-col justify-center border border-slate-100">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pesanan Terakhir</span>
                <span className="text-[10px] font-bold text-slate-500 italic">Belum ada riwayat</span>
              </div>
            )}
          </div>
        </div>

        {/* Group & Addon Selectors */}
        <div className="grid grid-cols-2 gap-3 sticky top-16 z-20">
          <Card className="border-yellow-200 shadow-md">
            <CardHeader className="p-2 bg-yellow-50 border-b border-yellow-100">
              <CardTitle className="text-[11px] font-bold text-yellow-800 uppercase tracking-wider text-center">
                Pilih Menu Utama
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <Select value={selectedGroup} onValueChange={(val) => val && setSelectedGroup(val)}>
                <SelectTrigger className="h-10 bg-white text-xs font-bold">
                  <SelectValue placeholder="Pilih..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-slate-400 text-xs italic">-- Sembunyikan --</SelectItem>
                  {menuGroups.map(grp => (
                    <SelectItem key={grp} value={grp} className="font-semibold text-xs">{grp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 shadow-md">
            <CardHeader className="p-2 bg-blue-50 border-b border-blue-100">
              <CardTitle className="text-[11px] font-bold text-blue-800 uppercase tracking-wider text-center">
                Pilih Add-On
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <Select value={selectedAddonCategory} onValueChange={(val) => val && setSelectedAddonCategory(val)}>
                <SelectTrigger className="h-10 bg-white text-xs font-bold">
                  <SelectValue placeholder="Pilih Add-on..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-slate-400 text-xs italic">-- Sembunyikan --</SelectItem>
                  {addonCategories.map(cat => (
                    <SelectItem key={cat} value={cat} className="font-semibold text-xs">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        {/* Menu Items Checkboxes */}
        {selectedGroup && selectedGroup !== 'none' && (
          <div className="bg-white rounded-lg border border-yellow-200 overflow-hidden shadow-sm">
            <div className="p-3 bg-yellow-50 border-b border-yellow-200 font-bold text-yellow-800 text-sm">
              Makanan Utama: {selectedGroup}
            </div>
            <div className="divide-y divide-yellow-100">
              {currentGroupMenus.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">Tidak ada menu di kelompok ini.</p>
              ) : (
                currentGroupMenus.map(menu => {
                  // @ts-ignore
                  const isHabis = menu.is_habis === true
                  const isTutup = menu.is_active === false
                  const isChecked = checkedItems.includes(menu.id)
                  
                  return (
                    <div key={menu.id} className="transition-colors hover:bg-slate-50">
                      <div 
                        className={`p-3 flex items-center gap-3 ${isChecked ? 'bg-yellow-50/50' : ''} ${isHabis ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => toggleItem(menu.id, isHabis, isTutup)}
                      >
                        <Checkbox 
                          checked={isChecked} 
                          className={`h-5 w-5 border-yellow-400 data-[state=checked]:bg-yellow-500 ${isHabis ? 'opacity-50' : ''}`}
                          onCheckedChange={() => toggleItem(menu.id, isHabis, isTutup)}
                          onClick={e => e.stopPropagation()}
                          disabled={isHabis}
                        />
                        
                        {menu.foto_url ? (
                          <img src={menu.foto_url} alt={menu.nama} className="w-12 h-12 object-cover rounded-md border bg-white shrink-0" />
                        ) : (
                          <div className="w-12 h-12 bg-slate-100 text-slate-400 flex items-center justify-center rounded-md shrink-0">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`font-bold text-sm truncate ${isHabis ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                              {menu.nama}
                            </p>
                            {isHabis && <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">Habis</span>}
                            {isTutup && !isHabis && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">Tutup</span>}
                          </div>
                          <p className="text-xs text-yellow-600 font-bold mt-0.5">Rp {menu.harga.toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                      
                      {/* Per-Item Note */}
                      {isChecked && (
                        <div className="pl-[3.25rem] pr-3 pb-3 pt-1">
                          <Input 
                            placeholder="Catatan (opsional)... cth: pedas, tambah kuah" 
                            value={itemNotes[menu.id] || ''}
                            onChange={e => setItemNotes(prev => ({...prev, [menu.id]: e.target.value}))}
                            className="h-8 text-[11px] bg-white border-yellow-300 focus-visible:ring-yellow-500 shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Addons Items Checkboxes */}
        {selectedAddonCategory && selectedAddonCategory !== 'none' && (
          <div className="bg-white rounded-lg border border-blue-200 overflow-hidden shadow-sm mt-4">
            <div className="p-3 bg-blue-50 border-b border-blue-200 font-bold text-blue-800 text-sm">
              Add-On: {selectedAddonCategory}
            </div>
            <div className="divide-y divide-blue-100">
              {addons.filter(a => a.kategori === selectedAddonCategory).length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">Tidak ada add-on.</p>
              ) : (
                addons.filter(a => a.kategori === selectedAddonCategory).map(addon => {
                  // @ts-ignore
                  const isHabis = addon.is_habis === true
                  const isChecked = checkedItems.includes(addon.id)
                  
                  return (
                    <div key={addon.id} className="transition-colors hover:bg-slate-50">
                      <div 
                        className={`p-3 flex items-center gap-3 ${isChecked ? 'bg-blue-50/50' : ''} ${isHabis ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => toggleItem(addon.id, isHabis, false)}
                      >
                        <Checkbox 
                          checked={isChecked} 
                          className={`h-5 w-5 border-blue-400 data-[state=checked]:bg-blue-600 ${isHabis ? 'opacity-50' : ''}`}
                          onCheckedChange={() => toggleItem(addon.id, isHabis, false)}
                          onClick={e => e.stopPropagation()}
                          disabled={isHabis}
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`font-bold text-sm truncate ${isHabis ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                              {addon.nama}
                            </p>
                            {isHabis && <span className="text-[9px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">Habis</span>}
                          </div>
                          <p className="text-xs text-blue-600 font-bold mt-0.5">Rp {addon.harga.toLocaleString('id-ID')}</p>
                        </div>
                      </div>
                      
                      {/* Per-Item Note */}
                      {isChecked && (
                        <div className="pl-11 pr-3 pb-3 pt-1">
                          <Input 
                            placeholder="Catatan (opsional)... cth: es sedikit" 
                            value={itemNotes[addon.id] || ''}
                            onChange={e => setItemNotes(prev => ({...prev, [addon.id]: e.target.value}))}
                            className="h-8 text-[11px] bg-white border-blue-300 focus-visible:ring-blue-500 shadow-sm"
                          />
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: REKAPAN & MOBILE STICKY CART */}
      <div className="lg:col-span-5 xl:col-span-4 space-y-4">
        
        {/* Sticky Mobile/Desktop Cart Button */}
        <div className="fixed bottom-0 left-0 right-0 p-0 lg:sticky lg:top-24 lg:p-0 z-50">
          <Card className="border-yellow-200 shadow-[0_-10px_20px_rgba(0,0,0,0.15)] rounded-none lg:rounded-xl lg:shadow-sm overflow-hidden">
            <div className="bg-yellow-500 p-2 px-3 lg:p-3 text-white flex justify-between items-center">
              <div className="flex items-center gap-1.5 lg:gap-2 font-bold text-xs lg:text-base">
                <ShoppingBag className="h-4 w-4 lg:h-5 lg:w-5" />
                <span>Total Keranjang {checkedItems.length > 0 && `(${checkedItems.length})`}</span>
              </div>
              <div className="text-sm lg:text-lg font-black">
                Rp {totalPrice.toLocaleString('id-ID')}
              </div>
            </div>
            <div className="p-2 px-3 lg:p-3 bg-white">
              <div className="block">
                {checkedItems.length > 0 ? (
                  <div className="mb-2 max-h-[80px] lg:max-h-[160px] overflow-y-auto space-y-1.5 lg:space-y-2 border-b border-slate-100 pb-2 pr-1">
                    {checkedItems.map(id => {
                      const item = menus.find(m => m.id === id) || addons.find(a => a.id === id)
                      if (!item) return null
                      return (
                        <div key={id} className="flex justify-between items-start text-[11px] lg:text-xs">
                          <div className="flex-1 pr-2">
                            <p className="font-bold text-slate-700 leading-tight">{item.nama}</p>
                            {itemNotes[id] && <p className="text-[9px] lg:text-[10px] text-slate-500 italic mt-0.5">"{itemNotes[id]}"</p>}
                          </div>
                          <div className="font-bold text-yellow-700 shrink-0">
                            {item.harga.toLocaleString('id-ID')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] lg:text-xs text-slate-500 mb-2 text-center">
                    Belum ada menu yang dipilih.
                  </p>
                )}
              </div>

              <div className="flex flex-row lg:flex-col gap-2">
                <Button 
                  onClick={handleOrder}
                  disabled={checkedItems.length === 0 || isSubmitting}
                  className="flex-1 h-9 lg:h-12 font-bold text-[11px] lg:text-base bg-yellow-500 hover:bg-yellow-600 text-white"
                >
                  {isSubmitting ? 'Proses...' : 'Pesan Sekarang'}
                </Button>

                <Dialog>
                  <DialogTrigger 
                    render={
                      <Button variant="outline" className="flex-1 h-9 border-yellow-200 text-yellow-700 bg-yellow-50/50 hover:bg-yellow-100 font-bold text-[10px] lg:text-sm px-1 lg:px-4 lg:mt-1" />
                    }
                  >
                    <ShoppingBag className="w-3 h-3 lg:w-4 lg:h-4 mr-1 lg:mr-2" />
                    Pesanan Saya ({myOrders.length})
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
                                <div className="text-sm font-semibold text-slate-800 line-clamp-2 leading-tight flex flex-col gap-1">
                                  <span>{order.kantin_menus?.nama || order.kantin_addons?.nama || 'Item'}</span>
                                  {order.status === 'selesai' && <span className="w-fit text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Selesai</span>}
                                  {order.status === 'dibatalkan' && <span className="w-fit text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Habis / Batal</span>}
                                  {order.status === 'pending' && <span className="w-fit text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Menunggu</span>}
                                </div>
                                {(order.deskripsi_pesanan || order.deskripsi_addon) && (
                                  <div className="text-xs text-slate-500 mt-1 italic">"{order.deskripsi_pesanan || order.deskripsi_addon}"</div>
                                )}
                                {order.admin_note && (
                                  <div className="text-[10px] text-red-600 font-bold mt-1 bg-red-50 p-1.5 rounded italic border border-red-100">
                                    Pesan Admin: {order.admin_note}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right py-2 px-2 align-top pt-2.5">
                                <div className="text-sm font-bold text-yellow-700 whitespace-nowrap">
                                  {((order.harga || 0) + (order.harga_addon || 0)).toLocaleString('id-ID')}
                                </div>
                              </TableCell>
                              <TableCell className="py-2 pr-2 text-right align-top pt-1.5">
                                {order.status === 'pending' && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                    onClick={() => handleDelete(order.id)}
                                    title="Batalkan / Hapus"
                                  >
                                    <Trash2 className="h-4 w-4" />
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
              Menampilkan 20 transaksi (pesanan & top up) terakhir Anda.
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
    </div>
    </div>
  )
}
