'use client'

import React, { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { AlertCircle, ArrowLeft, Clock, Copy, Image as ImageIcon, RotateCcw, ShoppingBag, Sparkles } from 'lucide-react'

// Sub-component for formatted editable price
const PriceCell = ({ initialValue, onSave, isChecked }: { initialValue: number, onSave: (val: number) => void, isChecked: boolean }) => {
  const [val, setVal] = useState(initialValue ? initialValue.toLocaleString('id-ID') : '0')
  
  const handleBlur = () => {
    const num = parseInt(val.replace(/[^0-9]/g, ''), 10) || 0
    setVal(num.toLocaleString('id-ID'))
    if (num !== initialValue) {
      onSave(num)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value.replace(/[^0-9]/g, '')
    if (inputVal) {
      setVal(parseInt(inputVal, 10).toLocaleString('id-ID'))
    } else {
      setVal('')
    }
  }
  
  return (
    <Input 
      type="text" 
      value={val} 
      onChange={handleChange} 
      onBlur={handleBlur}
      className={`h-8 font-semibold text-right text-xs ${isChecked ? 'bg-transparent border-transparent text-slate-500' : 'text-slate-800'}`}
    />
  )
}

const AdminNoteCell = ({ initialValue, onSave, isChecked }: { initialValue: string, onSave: (val: string) => void, isChecked: boolean }) => {
  const [val, setVal] = useState(initialValue || '')
  
  const handleBlur = () => {
    if (val !== (initialValue || '')) {
      onSave(val)
    }
  }

  return (
    <Input 
      type="text" 
      placeholder="Catatan admin..."
      value={val} 
      onChange={(e) => setVal(e.target.value)} 
      onBlur={handleBlur}
      className={`h-7 text-[10px] w-full mt-1 px-2 ${isChecked ? 'bg-transparent border-transparent text-slate-500' : 'bg-yellow-50/50 border-yellow-200 text-slate-800 focus-visible:ring-yellow-400'}`}
    />
  )
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useAppDialog } from '@/components/AppDialogProvider'
import {
  ComboOrderEntry,
  INSUFFICIENT_SALDO_IMAGE,
  LastMealSuggestion,
  OrderItemPayload,
  TopOrderCombo,
  fetchLiveSaldoAndValidate,
  fetchProfileOrderSuggestions,
  getJakartaDateTime,
  submitOrderBatch,
} from '@/lib/orderClient'

const getTokoName = (order: { kantin_menus?: { kode_unik?: string | null } | null }) => {
  const code = order.kantin_menus?.kode_unik || 'Lainnya'
  return code.includes('-') ? code.split('-')[0] : code
}

export default function RekapanClient({ initialOrders, initialDate, profiles, menus, addons }: { initialOrders: any[], initialDate?: string, profiles?: any[], menus?: any[], addons?: any[] }) {
  const router = useRouter()
  const { showAlert, showConfirm } = useAppDialog()
  const [orders, setOrders] = useState(initialOrders)
  const [selectedDate, setSelectedDate] = useState(() => initialDate || getJakartaDateTime().dateStr)

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value
    setSelectedDate(newDate)
    
    const { data: newOrders } = await supabase
      .from('kantin_orders')
      .select(`
        id, deskripsi_pesanan, deskripsi_addon, harga, harga_addon, status, is_recap_checked, menu_id, addon_id, profile_id, admin_note, created_at,
        kantin_profiles(nama),
        kantin_menus(nama, kode_unik),
        kantin_addons(nama)
      `)
      .eq('tanggal', newDate)
      
    if (newOrders) {
      setOrders(newOrders)
    }
  }

  // Kelompokkan per Toko (A-Z) dan urutkan pemesan per Nama (A-Z) untuk mempermudah pembelian
  const groupedOrders = useMemo<[string, any[]][]>(() => {
    const groups: Record<string, any[]> = {}
    for (const order of orders) {
      const toko = getTokoName(order)
      if (!groups[toko]) groups[toko] = []
      groups[toko].push(order)
    }

    return Object.entries(groups)
      .sort(([tokoA], [tokoB]) => {
        if (tokoA === 'Lainnya' && tokoB !== 'Lainnya') return 1
        if (tokoB === 'Lainnya' && tokoA !== 'Lainnya') return -1
        return tokoA.localeCompare(tokoB, 'id', { sensitivity: 'base' })
      })
      .map(([toko, items]) => {
        const sortedItems = [...items].sort((a, b) => {
          const nameA = (a.kantin_profiles?.nama || 'Unknown').trim()
          const nameB = (b.kantin_profiles?.nama || 'Unknown').trim()
          const nameCmp = nameA.localeCompare(nameB, 'id', { sensitivity: 'base' })
          if (nameCmp !== 0) return nameCmp

          const itemA = a.kantin_menus?.nama || a.kantin_addons?.nama || ''
          const itemB = b.kantin_menus?.nama || b.kantin_addons?.nama || ''
          const itemCmp = itemA.localeCompare(itemB, 'id', { sensitivity: 'base' })
          if (itemCmp !== 0) return itemCmp

          return (a.created_at || '').localeCompare(b.created_at || '')
        })
        return [toko, sortedItems]
      })
  }, [orders])

  const toggleCheck = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus
    const orderStatus = newStatus ? 'selesai' : 'pending'
    setOrders(orders.map(o => o.id === id ? { ...o, is_recap_checked: newStatus, status: orderStatus } : o))
    await supabase.from('kantin_orders').update({ is_recap_checked: newStatus, status: orderStatus }).eq('id', id)
  }

  const handlePriceUpdate = async (orderId: string, field: 'harga' | 'harga_addon', newVal: number) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    
    const oldVal = order[field] || 0
    if (newVal === oldVal) return
    
    const diff = newVal - oldVal
    
    // Update local state
    setOrders(orders.map(o => o.id === orderId ? { ...o, [field]: newVal } : o))
    
    // Update order in DB
    await supabase.from('kantin_orders').update({ [field]: newVal }).eq('id', orderId)
    
    // Adjust profile saldo
    const { data: profile } = await supabase.from('kantin_profiles').select('saldo').eq('id', order.profile_id).single()
    if (profile) {
      const newSaldo = profile.saldo - diff
      await supabase.from('kantin_profiles').update({ saldo: newSaldo }).eq('id', order.profile_id)
      
      // Update transaction history to reflect new total
      const { data: tx } = await supabase.from('kantin_transactions').select('*').eq('order_id', orderId).single()
      if (tx) {
        const newTotal = tx.jumlah + diff
        await supabase.from('kantin_transactions').update({ jumlah: newTotal }).eq('id', tx.id)
      }
    }
  }

  const handleNoteUpdate = async (orderId: string, newVal: string) => {
    const order = orders.find(o => o.id === orderId)
    if (!order) return
    if ((order.admin_note || '') === newVal) return

    setOrders(orders.map(o => o.id === orderId ? { ...o, admin_note: newVal } : o))
    await supabase.from('kantin_orders').update({ admin_note: newVal }).eq('id', orderId)
  }

  const handleCopyWA = () => {
    let text = "*REKAPAN PESANAN HARI INI*\n\n"

    for (const [code, items] of groupedOrders) {
      const validItems = items.filter(i => i.status !== 'dibatalkan')
      if (validItems.length === 0) continue

      text += `*[${code}]*\n`
      validItems.forEach(i => {
        const menuName = i.kantin_menus?.nama || i.kantin_addons?.nama || 'Menu Custom'
        const basePrice = i.harga || 0
        const addonPrice = i.harga_addon || 0
        const total = basePrice + addonPrice
        const totalStr = total.toLocaleString('id-ID')
        
        let desc = i.deskripsi_pesanan ? `${i.deskripsi_pesanan}` : ''
        if (i.addon_id) {
          desc += desc ? ` + ` : ''
          desc += `${i.kantin_addons?.nama} (${i.deskripsi_addon || ''})`
        }

        const userName = i.kantin_profiles?.nama || 'Unknown'
        const formattedDesc = desc ? `-${desc}` : ''
        text += `${code}-${menuName} = ${totalStr}${formattedDesc} ${userName}\n`
      })
      text += '\n'
    }

    navigator.clipboard.writeText(text)
    alert("Berhasil disalin ke clipboard!")
  }

  const getFullOrderString = (order: any) => {
    let str = order.kantin_menus?.nama || ''
    if (order.deskripsi_pesanan) str += ` (${order.deskripsi_pesanan})`
    if (order.addon_id) {
      str += ` + ${order.kantin_addons?.nama}`
      if (order.deskripsi_addon) str += ` (${order.deskripsi_addon})`
    }
    return str
  }

  const handleCopyPerToko = (group: string, items: any[]) => {
    let text = `*${group}*\n`
    let count = 0
    items.forEach(i => {
      if (i.status === 'dibatalkan') return;
      
      const userName = i.kantin_profiles?.nama || 'Unknown'
      const menuName = i.kantin_menus?.nama || i.kantin_addons?.nama || 'Menu Custom'
      let desc = i.deskripsi_pesanan ? `${i.deskripsi_pesanan}` : ''
      if (i.addon_id) {
        desc += desc ? ` + ` : ''
        desc += `${i.kantin_addons?.nama} (${i.deskripsi_addon || ''})`
      }
      
      const formattedDesc = desc ? ` (${desc})` : ''
      text += `- ${userName} pesan ${menuName}${formattedDesc}\n`
      count++
    })
    
    if (count === 0) {
      alert(`Tidak ada pesanan valid di kelompok ${group} (semua batal).`)
      return
    }

    navigator.clipboard.writeText(text)
    alert(`Rekapan ${group} disalin!`)
  }

  // Manual Order State (Admin — bebas jam tutup, tetap sembunyikan toko tutup & perhatikan saldo)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualUser, setManualUser] = useState('')
  const manualUserRef = useRef('')
  const [profileSaldoMap, setProfileSaldoMap] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const p of profiles || []) {
      if (typeof p.saldo === 'number') map[p.id] = p.saldo
    }
    return map
  })
  const [manualLiveSaldo, setManualLiveSaldo] = useState<number | null>(null)
  const [manualStep, setManualStep] = useState<'pick_user' | 'suggestions' | 'normal'>('pick_user')
  const [manualLoadingSuggestions, setManualLoadingSuggestions] = useState(false)
  const [manualLastMeal, setManualLastMeal] = useState<LastMealSuggestion | null>(null)
  const [manualTopCombos, setManualTopCombos] = useState<TopOrderCombo[]>([])
  const [manualSelectedGroup, setManualSelectedGroup] = useState('')
  const [manualSelectedAddonCat, setManualSelectedAddonCat] = useState('none')
  const [manualCheckedItems, setManualCheckedItems] = useState<string[]>([])
  const [manualItemNotes, setManualItemNotes] = useState<Record<string, string>>({})
  const [isSubmittingManual, setIsSubmittingManual] = useState(false)

  const activeProfiles = useMemo(
    () => (profiles || []).filter(p => p.status !== 'inactive'),
    [profiles]
  )
  const activeMenus = useMemo(
    () => (menus || []).filter(m => m.is_active !== false),
    [menus]
  )
  const activeAddons = useMemo(
    () => (addons || []).filter(a => a.is_active !== false),
    [addons]
  )

  // Kelompokkan menu aktif per toko (toko yang ditutup Admin tidak ditampilkan)
  const manualMenuGroups = useMemo(() => {
    const groups = new Set<string>()
    activeMenus.forEach(m => {
      const code = m.kode_unik || ''
      groups.add(code.includes('-') ? code.split('-')[0] : 'Menu Lainnya')
    })
    return Array.from(groups).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }))
  }, [activeMenus])

  const effectiveManualGroup = manualSelectedGroup || manualMenuGroups[0] || ''

  const currentManualGroupMenus = useMemo(() => {
    if (!effectiveManualGroup || effectiveManualGroup === 'none') return []
    return activeMenus
      .filter(m => {
        const code = m.kode_unik || ''
        if (effectiveManualGroup === 'Menu Lainnya') return !code.includes('-')
        return code.startsWith(effectiveManualGroup + '-')
      })
      .sort((a, b) => (a.kode_unik || '').localeCompare(b.kode_unik || ''))
  }, [activeMenus, effectiveManualGroup])

  const manualAddonCategories = useMemo(() => {
    const cats = new Set<string>()
    activeAddons.forEach(a => cats.add(a.kategori || 'Lainnya'))
    return Array.from(cats).sort()
  }, [activeAddons])

  const manualTotalPrice = useMemo(() => {
    return manualCheckedItems.reduce((sum, id) => {
      const m = activeMenus.find(item => item.id === id)
      const a = activeAddons.find(item => item.id === id)
      return sum + (m?.harga || a?.harga || 0)
    }, 0)
  }, [manualCheckedItems, activeMenus, activeAddons])

  const selectedManualProfile = useMemo(
    () => activeProfiles.find(p => p.id === manualUser) || null,
    [activeProfiles, manualUser]
  )

  const resetManualForm = () => {
    manualUserRef.current = ''
    setManualUser('')
    setManualLiveSaldo(null)
    setManualStep('pick_user')
    setManualLastMeal(null)
    setManualTopCombos([])
    setManualCheckedItems([])
    setManualItemNotes({})
    setManualSelectedAddonCat('none')
  }

  const handleSelectManualUser = async (uid: string) => {
    manualUserRef.current = uid
    setManualUser(uid)
    setManualCheckedItems([])
    setManualItemNotes({})
    setManualLastMeal(null)
    setManualTopCombos([])

    if (!uid) {
      setManualLiveSaldo(null)
      setManualStep('pick_user')
      return
    }

    const fallbackSaldo = profileSaldoMap[uid]
    setManualLiveSaldo(typeof fallbackSaldo === 'number' ? fallbackSaldo : null)
    setManualLoadingSuggestions(true)
    setManualStep('suggestions')

    try {
      const todayJakarta = getJakartaDateTime().dateStr
      const [{ data: liveProfile }, suggestions] = await Promise.all([
        supabase.from('kantin_profiles').select('saldo').eq('id', uid).single(),
        fetchProfileOrderSuggestions(uid, activeMenus, activeAddons, todayJakarta, { ignoreCutoff: true }),
      ])

      if (manualUserRef.current !== uid) return

      if (liveProfile && typeof liveProfile.saldo === 'number') {
        setManualLiveSaldo(liveProfile.saldo)
        setProfileSaldoMap(prev => ({ ...prev, [uid]: liveProfile.saldo }))
      }

      setManualLastMeal(suggestions.lastMeal)
      setManualTopCombos(suggestions.topCombos)

      if (!suggestions.lastMeal && suggestions.topCombos.length === 0) {
        setManualStep('normal')
      }
    } finally {
      if (manualUserRef.current === uid) {
        setManualLoadingSuggestions(false)
      }
    }
  }

  const toggleManualItem = (itemId: string, isHabis: boolean) => {
    if (isHabis) return
    setManualCheckedItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    )
  }

  const executeManualOrder = async (entries: ComboOrderEntry[], confirmTitle: string) => {
    if (isSubmittingManual || !manualUser || entries.length === 0) return

    const payloads: OrderItemPayload[] = []
    const summaryLines: string[] = []

    for (const entry of entries) {
      if (entry.menu_id) {
        const liveMenu = activeMenus.find(m => m.id === entry.menu_id)
        if (!liveMenu) {
          showAlert({
            title: 'Toko/Menu Tutup',
            message: `Menu ${entry.nama} sedang ditutup oleh Admin dan tidak dapat dipesan.`,
            type: 'warning',
          })
          return
        }
        if (liveMenu.is_habis) {
          showAlert({
            title: 'Menu Habis',
            message: `Menu ${liveMenu.nama} sedang habis.`,
            type: 'warning',
          })
          return
        }
        const txKet = `${liveMenu.nama}${entry.note ? ` (${entry.note})` : ''} [MANUAL ADMIN]`
        payloads.push({
          p_menu_id: liveMenu.id,
          p_addon_id: null,
          p_deskripsi_pesanan: entry.note,
          p_deskripsi_addon: '',
          p_harga: liveMenu.harga,
          p_harga_addon: 0,
          p_tanggal: selectedDate,
          p_tx_ket: txKet,
        })
        summaryLines.push(`- ${liveMenu.nama}${entry.note ? ` (${entry.note})` : ''} • Rp ${liveMenu.harga.toLocaleString('id-ID')}`)
      } else if (entry.addon_id) {
        const liveAddon = activeAddons.find(a => a.id === entry.addon_id)
        if (!liveAddon) {
          showAlert({
            title: 'Add-On Tutup',
            message: `Add-On ${entry.nama} sedang ditutup oleh Admin.`,
            type: 'warning',
          })
          return
        }
        if (liveAddon.is_habis) {
          showAlert({
            title: 'Add-On Habis',
            message: `Add-On ${liveAddon.nama} sedang habis.`,
            type: 'warning',
          })
          return
        }
        const txKet = `${liveAddon.nama}${entry.addonNote ? ` (${entry.addonNote})` : ''} [MANUAL ADMIN]`
        payloads.push({
          p_menu_id: null,
          p_addon_id: liveAddon.id,
          p_deskripsi_pesanan: '',
          p_deskripsi_addon: entry.addonNote,
          p_harga: 0,
          p_harga_addon: liveAddon.harga,
          p_tanggal: selectedDate,
          p_tx_ket: txKet,
        })
        summaryLines.push(`- ${liveAddon.nama}${entry.addonNote ? ` (${entry.addonNote})` : ''} • Rp ${liveAddon.harga.toLocaleString('id-ID')}`)
      }
    }

    if (payloads.length === 0) return

    const totalOrderPrice = payloads.reduce((sum, item) => sum + item.p_harga + item.p_harga_addon, 0)
    const userName = selectedManualProfile?.nama || 'User'

    setIsSubmittingManual(true)
    try {
      const saldoCheck = await fetchLiveSaldoAndValidate(manualUser, totalOrderPrice)
      if (!saldoCheck.ok) {
        setManualLiveSaldo(saldoCheck.saldo)
        setProfileSaldoMap(prev => ({ ...prev, [manualUser]: saldoCheck.saldo }))
        if (saldoCheck.isInsufficient) {
          showAlert({
            title: `Saldo ${userName} Tidak Cukup 🥺🐾`,
            message:
              `Saldo ${userName} sekarang Rp ${saldoCheck.saldo.toLocaleString('id-ID')}, sedangkan total pesanannya Rp ${totalOrderPrice.toLocaleString('id-ID')}.\n\n` +
              `Pesanan manual tidak bisa dibuat jika saldo menjadi minus. Harap ingatkan user untuk Top Up dulu ya!`,
            type: 'warning',
            imageUrl: INSUFFICIENT_SALDO_IMAGE,
            imageAlt: 'Kucing memohon top up saldo',
          })
        } else {
          showAlert({
            title: saldoCheck.errorTitle || 'Tidak Dapat Memesan',
            message: saldoCheck.errorMessage || 'Profil tidak valid.',
            type: 'error',
          })
        }
        return
      }

      const sisaSaldo = saldoCheck.saldo - totalOrderPrice
      const proceed = await showConfirm({
        title: confirmTitle,
        message:
          `Pemesan: ${userName} (${selectedDate})\n\n` +
          `${summaryLines.join('\n')}\n\n` +
          `Total: Rp ${totalOrderPrice.toLocaleString('id-ID')}\n` +
          `Saldo Saat Ini: Rp ${saldoCheck.saldo.toLocaleString('id-ID')}\n` +
          `Sisa Saldo Nanti: Rp ${sisaSaldo.toLocaleString('id-ID')}`,
        confirmText: 'Simpan Pesanan',
        cancelText: 'Batal',
      })
      if (!proceed) return

      const { orderIds, newSaldo } = await submitOrderBatch(manualUser, payloads, true)

      if (orderIds.length > 0) {
        const { data: fetchedOrders } = await supabase
          .from('kantin_orders')
          .select(`
            id, deskripsi_pesanan, deskripsi_addon, harga, harga_addon, status, is_recap_checked, menu_id, addon_id, profile_id, admin_note, created_at,
            kantin_profiles(nama),
            kantin_menus(nama, kode_unik),
            kantin_addons(nama)
          `)
          .in('id', orderIds)

        if (fetchedOrders && fetchedOrders.length > 0) {
          setOrders(prev => [...fetchedOrders, ...prev])
        }
      }

      if (newSaldo !== null) {
        setManualLiveSaldo(newSaldo)
        setProfileSaldoMap(prev => ({ ...prev, [manualUser]: newSaldo }))
      }

      setManualOpen(false)
      resetManualForm()
      router.refresh()
      showAlert({
        title: 'Berhasil',
        message: `${payloads.length} pesanan manual untuk ${userName} berhasil disimpan!`,
        type: 'success',
      })
    } catch (err: any) {
      showAlert({
        title: 'Gagal Menambahkan',
        message: err?.message || 'Terjadi kesalahan saat menyimpan pesanan manual.',
        type: 'error',
      })
    } finally {
      setIsSubmittingManual(false)
    }
  }

  const handleSubmitManualNormal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualUser) {
      showAlert({ title: 'Perhatian', message: 'Pilih pemesan terlebih dahulu!', type: 'warning' })
      return
    }
    if (manualCheckedItems.length === 0) {
      showAlert({ title: 'Perhatian', message: 'Pilih minimal satu menu atau add-on!', type: 'warning' })
      return
    }

    const entries: ComboOrderEntry[] = []
    for (const itemId of manualCheckedItems) {
      const m = activeMenus.find(item => item.id === itemId)
      const a = activeAddons.find(item => item.id === itemId)
      const note = (manualItemNotes[itemId] || '').trim()
      if (m) {
        entries.push({
          menu_id: m.id,
          addon_id: null,
          note,
          addonNote: '',
          nama: m.nama,
          snapshotHarga: m.harga || 0,
        })
      } else if (a) {
        entries.push({
          menu_id: null,
          addon_id: a.id,
          note: '',
          addonNote: note,
          nama: a.nama,
          snapshotHarga: a.harga || 0,
        })
      }
    }

    await executeManualOrder(entries, 'Konfirmasi Pesanan Manual')
  }

  const currentJakartaTime = getJakartaDateTime().timeStr
  const estimatedRemainingSaldo = manualLiveSaldo !== null ? manualLiveSaldo - manualTotalPrice : null

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <label className="text-sm font-bold text-slate-700">Pilih Tanggal:</label>
          <Input 
            type="date" 
            value={selectedDate}
            onChange={handleDateChange}
            className="h-9 font-bold text-yellow-800 bg-yellow-50 border-yellow-200"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              resetManualForm()
              setManualOpen(true)
            }}
            className="bg-amber-500 hover:bg-amber-600 font-bold text-white"
          >
            + Pesanan Manual
          </Button>
          <Dialog open={manualOpen} onOpenChange={(open) => { setManualOpen(open); if (!open) resetManualForm() }}>
            <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto rounded-2xl border-2 border-amber-200 bg-white p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle className="text-base sm:text-lg font-black text-amber-950">
                  Pesanan Manual (Admin)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Bebas jam tutup • Toko yang ditutup Admin tetap disembunyikan • Saldo user tetap dicek
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* 1. Pilih Pemesan + Info Saldo Live */}
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5">
                  <Label className="text-xs font-black text-amber-900 uppercase tracking-wide">1. Pilih Pemesan</Label>
                  <Select value={manualUser} onValueChange={(v) => handleSelectManualUser(v || '')}>
                    <SelectTrigger className="bg-white border-amber-300 font-semibold text-sm h-10 w-full">
                      <SelectValue placeholder="Pilih nama pemesan...">
                        {(value: string) => {
                          const prof = activeProfiles.find(p => p.id === value)
                          if (!prof) return <span className="text-muted-foreground">Pilih nama pemesan...</span>
                          return prof.nama
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[240px]">
                      {activeProfiles.map(p => {
                        const s = profileSaldoMap[p.id] ?? p.saldo ?? 0
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nama}{p.divisi ? ` (${p.divisi})` : ''} — Rp {Number(s).toLocaleString('id-ID')}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  {manualUser && manualLiveSaldo !== null && (
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs">
                      <div>
                        <span className="text-slate-500 font-medium">Saldo {selectedManualProfile?.nama}: </span>
                        <span className={`font-black ${manualLiveSaldo < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          Rp {manualLiveSaldo.toLocaleString('id-ID')}
                        </span>
                      </div>
                      {manualStep === 'normal' && manualTotalPrice > 0 && estimatedRemainingSaldo !== null && (
                        <div>
                          <span className="text-slate-500 font-medium">Sisa Nanti: </span>
                          <span className={`font-black ${estimatedRemainingSaldo < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                            {estimatedRemainingSaldo < 0
                              ? `-Rp ${Math.abs(estimatedRemainingSaldo).toLocaleString('id-ID')}`
                              : `Rp ${estimatedRemainingSaldo.toLocaleString('id-ID')}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Loading Suggestions */}
                {manualUser && manualLoadingSuggestions && (
                  <div className="py-8 text-center text-xs font-semibold text-amber-700 bg-amber-50/40 rounded-xl border border-amber-100">
                    Memuat saran pesanan {selectedManualProfile?.nama}...
                  </div>
                )}

                {/* 3. Step Saran Terlebih Dahulu */}
                {manualUser && !manualLoadingSuggestions && manualStep === 'suggestions' && (
                  <div className="space-y-4">
                    {manualLastMeal && (
                      <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50/60 to-white p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase tracking-wide flex-wrap">
                            <Clock className="h-3.5 w-3.5 text-amber-600" />
                            <span>A. Pesanan Terakhir</span>
                            {manualLastMeal.hasSoldOut && (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded normal-case">
                                Ada item habis
                              </span>
                            )}
                            {manualLastMeal.hasInactive && !manualLastMeal.hasSoldOut && (
                              <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded normal-case">
                                Toko tutup
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-bold text-amber-800 bg-white border border-amber-200 px-2 py-0.5 rounded-full">
                            {manualLastMeal.date} • Rp {manualLastMeal.totalLivePrice.toLocaleString('id-ID')}
                          </span>
                        </div>

                        <div className="space-y-1 text-xs text-slate-700">
                          {manualLastMeal.entries.map((entry, idx) => (
                            <div key={idx}>
                              • <strong className="text-slate-900">{entry.nama}</strong>
                              {(entry.note || entry.addonNote) && (
                                <span className="text-amber-700 italic"> ({entry.note || entry.addonNote})</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {manualLiveSaldo !== null && manualLiveSaldo - manualLastMeal.totalLivePrice < 0 && (
                          <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Saldo user tidak cukup untuk kombinasi ini.
                          </p>
                        )}

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            disabled={isSubmittingManual || manualLastMeal.hasSoldOut || manualLastMeal.hasInactive}
                            onClick={() => executeManualOrder(manualLastMeal.entries, 'Pesan Ulang Terakhir (Manual Admin)')}
                            className="w-full sm:w-auto h-9 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg"
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Pesan Lagi Terakhir
                          </Button>
                        </div>
                      </div>
                    )}

                    {manualTopCombos.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase tracking-wide px-0.5">
                          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                          <span>B. Top {manualTopCombos.length} Kombinasi Favorit {selectedManualProfile?.nama}</span>
                        </div>
                        <div className="space-y-2">
                          {manualTopCombos.map((combo, idx) => (
                            <div
                              key={combo.signature}
                              className="rounded-xl border border-amber-200 bg-white p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-black">
                                    #{idx + 1}
                                  </span>
                                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                    {combo.count}x
                                  </span>
                                  {combo.hasSoldOut && (
                                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                      Ada item habis
                                    </span>
                                  )}
                                  {combo.hasInactive && !combo.hasSoldOut && (
                                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                      Toko tutup
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
                                    className="inline-flex items-center text-[11px] font-semibold bg-amber-50/70 text-slate-800 border border-amber-100 px-2 py-0.5 rounded-lg"
                                  >
                                    {entry.nama}
                                    {(entry.note || entry.addonNote) && (
                                      <span className="text-amber-700 italic ml-1">({entry.note || entry.addonNote})</span>
                                    )}
                                  </span>
                                ))}
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isSubmittingManual || combo.hasSoldOut || combo.hasInactive}
                                  onClick={() => executeManualOrder(combo.items, `Pesan Favorit #${idx + 1} (Manual Admin)`)}
                                  className="w-full sm:w-auto h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1.5" />
                                  Pesan Kombinasi Ini
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-amber-100">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setManualStep('normal')}
                        className="w-full h-auto py-4 px-5 text-sm font-extrabold text-amber-900 bg-white hover:bg-amber-50 border-2 border-amber-300 rounded-xl"
                      >
                        Tidak Sesuai Saran → Pesan Menu Normal
                      </Button>
                    </div>
                  </div>
                )}

                {/* 4. Step Pesan Normal (Bebas Pilih Menu + Add-On + Keterangan per item, tanpa batas jam) */}
                {manualUser && !manualLoadingSuggestions && manualStep === 'normal' && (
                  <form onSubmit={handleSubmitManualNormal} className="space-y-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-black text-amber-900 uppercase tracking-wide">
                        2. Pilih Menu &amp; Add-On (Bebas Jam Tutup)
                      </span>
                      {(manualLastMeal || manualTopCombos.length > 0) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setManualStep('suggestions')}
                          className="h-7 text-xs font-bold border-amber-300 text-amber-800 hover:bg-amber-50"
                        >
                          <ArrowLeft className="h-3 w-3 mr-1" />
                          Lihat Saran User
                        </Button>
                      )}
                    </div>

                    {!manualLastMeal && manualTopCombos.length === 0 && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        {selectedManualProfile?.nama} belum punya riwayat pesanan untuk saran — silakan pilih menu di bawah.
                      </p>
                    )}

                    {/* Selector Grup Toko & Kategori Add-On */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-amber-50/40 p-2.5 rounded-xl border border-amber-200">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-amber-900">Grup / Toko (Aktif)</Label>
                        <Select value={effectiveManualGroup} onValueChange={(v) => setManualSelectedGroup(v || '')}>
                          <SelectTrigger className="bg-white border-amber-200 h-9 text-xs font-bold text-amber-950 w-full">
                            <SelectValue placeholder="Pilih toko...">
                              {(value: string) => value === 'none' ? '-- Sembunyikan --' : (value || 'Pilih toko...')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-slate-400 text-xs italic">-- Sembunyikan --</SelectItem>
                            {manualMenuGroups.map(grp => (
                              <SelectItem key={grp} value={grp} className="text-xs font-semibold">
                                {grp}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-amber-900">Add-On / Minuman</Label>
                        <Select value={manualSelectedAddonCat} onValueChange={(v) => setManualSelectedAddonCat(v || 'none')}>
                          <SelectTrigger className="bg-white border-amber-200 h-9 text-xs font-bold text-amber-950 w-full">
                            <SelectValue placeholder="Pilih add-on...">
                              {(value: string) => value === 'none' ? '-- Sembunyikan --' : (value || 'Pilih add-on...')}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-slate-400 text-xs italic">-- Sembunyikan --</SelectItem>
                            {manualAddonCategories.map(cat => (
                              <SelectItem key={cat} value={cat} className="text-xs font-semibold">
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Menu Utama Grid */}
                    {effectiveManualGroup && effectiveManualGroup !== 'none' && (
                      <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
                        <div className="px-3.5 py-2 bg-amber-50/70 border-b border-amber-200 text-xs font-black text-amber-900">
                          Menu Utama: {effectiveManualGroup}
                        </div>
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto">
                          {currentManualGroupMenus.length === 0 ? (
                            <p className="col-span-full text-center text-xs text-slate-400 py-4">Tidak ada menu aktif di grup ini.</p>
                          ) : (
                            currentManualGroupMenus.map(menu => {
                              const isHabis = menu.is_habis === true
                              const isPastCutoff = !!menu.jam_tutup && currentJakartaTime >= menu.jam_tutup.substring(0, 5)
                              const isChecked = manualCheckedItems.includes(menu.id)
                              return (
                                <div
                                  key={menu.id}
                                  className={`rounded-lg border p-2.5 transition-all ${
                                    isChecked
                                      ? 'border-amber-400 bg-amber-50/70 ring-1 ring-amber-300/60'
                                      : 'border-amber-100 bg-white hover:border-amber-300'
                                  }`}
                                >
                                  <div
                                    className={`flex items-center gap-2.5 ${isHabis ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                                    onClick={() => toggleManualItem(menu.id, isHabis)}
                                  >
                                    <Checkbox
                                      checked={isChecked}
                                      disabled={isHabis}
                                      onCheckedChange={() => toggleManualItem(menu.id, isHabis)}
                                      onClick={e => e.stopPropagation()}
                                      className="h-4 w-4 border-amber-400 data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                    {menu.foto_url ? (
                                      <img src={menu.foto_url} alt={menu.nama} className="w-10 h-10 object-cover rounded border border-amber-100 shrink-0" />
                                    ) : (
                                      <div className="w-10 h-10 bg-amber-50 text-amber-400 flex items-center justify-center rounded border border-amber-100 shrink-0">
                                        <ImageIcon className="h-4 w-4" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-1">
                                        <p className={`text-xs font-bold leading-snug line-clamp-2 ${isHabis ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                                          {menu.nama}
                                        </p>
                                        {isHabis && (
                                          <span className="text-[9px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded font-bold uppercase shrink-0">Habis</span>
                                        )}
                                        {isPastCutoff && !isHabis && (
                                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-bold shrink-0">Lewat Jam</span>
                                        )}
                                      </div>
                                      <p className="text-xs font-black text-amber-700 mt-0.5">Rp {menu.harga.toLocaleString('id-ID')}</p>
                                    </div>
                                  </div>
                                  {isChecked && (
                                    <div className="mt-2 pt-2 border-t border-amber-200/60">
                                      <Input
                                        placeholder="Keterangan item..."
                                        value={manualItemNotes[menu.id] || ''}
                                        onChange={e => setManualItemNotes(prev => ({ ...prev, [menu.id]: e.target.value }))}
                                        className="h-8 text-xs bg-white border-amber-300"
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

                    {/* Add-On Grid */}
                    {manualSelectedAddonCat && manualSelectedAddonCat !== 'none' && (
                      <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
                        <div className="px-3.5 py-2 bg-amber-50/50 border-b border-amber-200 text-xs font-black text-amber-900">
                          Add-On: {manualSelectedAddonCat}
                        </div>
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[200px] overflow-y-auto">
                          {activeAddons
                            .filter(a => (a.kategori || 'Lainnya') === manualSelectedAddonCat)
                            .map(addon => {
                              const isHabis = addon.is_habis === true
                              const isChecked = manualCheckedItems.includes(addon.id)
                              return (
                                <div
                                  key={addon.id}
                                  className={`rounded-lg border p-2.5 transition-all ${
                                    isChecked
                                      ? 'border-amber-400 bg-amber-50/70 ring-1 ring-amber-300/60'
                                      : 'border-amber-100 bg-white hover:border-amber-300'
                                  }`}
                                >
                                  <div
                                    className={`flex items-center gap-2.5 ${isHabis ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}`}
                                    onClick={() => toggleManualItem(addon.id, isHabis)}
                                  >
                                    <Checkbox
                                      checked={isChecked}
                                      disabled={isHabis}
                                      onCheckedChange={() => toggleManualItem(addon.id, isHabis)}
                                      onClick={e => e.stopPropagation()}
                                      className="h-4 w-4 border-amber-400 data-[state=checked]:bg-amber-500 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-1">
                                        <p className={`text-xs font-bold leading-snug ${isHabis ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                                          {addon.nama}
                                        </p>
                                        {isHabis && (
                                          <span className="text-[9px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded font-bold uppercase shrink-0">Habis</span>
                                        )}
                                      </div>
                                      <p className="text-xs font-black text-amber-700 mt-0.5">Rp {addon.harga.toLocaleString('id-ID')}</p>
                                    </div>
                                  </div>
                                  {isChecked && (
                                    <div className="mt-2 pt-2 border-t border-amber-200/60">
                                      <Input
                                        placeholder="Keterangan add-on..."
                                        value={manualItemNotes[addon.id] || ''}
                                        onChange={e => setManualItemNotes(prev => ({ ...prev, [addon.id]: e.target.value }))}
                                        className="h-8 text-xs bg-white border-amber-300"
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )}

                    {/* Keranjang Ringkasan + Guard Saldo */}
                    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 space-y-2.5">
                      <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                        <span className="flex items-center gap-1.5">
                          <ShoppingBag className="h-3.5 w-3.5" />
                          Keranjang ({manualCheckedItems.length} item)
                        </span>
                        <span className="text-sm font-black text-amber-700">
                          Total: Rp {manualTotalPrice.toLocaleString('id-ID')}
                        </span>
                      </div>

                      {manualCheckedItems.length > 0 && (
                        <div className="space-y-1 max-h-24 overflow-y-auto border-t border-amber-200/70 pt-2 text-xs">
                          {manualCheckedItems.map(id => {
                            const item = activeMenus.find(m => m.id === id) || activeAddons.find(a => a.id === id)
                            if (!item) return null
                            return (
                              <div key={id} className="flex justify-between gap-2">
                                <span className="text-slate-700 truncate">
                                  • <strong>{item.nama}</strong>
                                  {manualItemNotes[id] && <span className="text-amber-700 italic"> ({manualItemNotes[id]})</span>}
                                </span>
                                <span className="font-bold text-amber-700 shrink-0 tabular-nums">
                                  Rp {item.harga.toLocaleString('id-ID')}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {estimatedRemainingSaldo !== null && estimatedRemainingSaldo < 0 && manualTotalPrice > 0 && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>
                            Saldo tidak cukup! Akan minus Rp {Math.abs(estimatedRemainingSaldo).toLocaleString('id-ID')}. Pesanan manual ditahan agar saldo tidak minus.
                          </span>
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={isSubmittingManual || manualCheckedItems.length === 0}
                        className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm rounded-lg"
                      >
                        {isSubmittingManual ? 'Menyimpan...' : 'Simpan Pesanan Manual'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog>
            <DialogTrigger className="flex items-center justify-center gap-2 font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 px-4 py-2 rounded-md h-10 text-sm">
              <Copy className="h-4 w-4" /> per Toko
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Copy Pesanan per Toko</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 mt-4 max-h-[60vh] overflow-y-auto pr-2">
                {groupedOrders.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Belum ada pesanan.</p>
                ) : (
                  groupedOrders.map(([group, groupOrders]) => (
                    <Button 
                      key={group} 
                      onClick={() => handleCopyPerToko(group, groupOrders)} 
                      className="w-full justify-start text-left bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="h-4 w-4 mr-2" /> {group} ({groupOrders.length} Pesanan)
                    </Button>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Button onClick={handleCopyWA} variant="outline" className="flex gap-2 font-bold text-slate-700 h-10">
            <Copy className="h-4 w-4" /> Copy Semua
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[50px] text-center text-xs">✔</TableHead>
                <TableHead className="w-[120px] text-xs">Pemesan</TableHead>
                <TableHead className="text-xs">Pesanan</TableHead>
                <TableHead className="w-[100px] text-right text-xs">Harga Menu</TableHead>
                <TableHead className="w-[100px] text-right text-xs">Harga Addon</TableHead>
                <TableHead className="w-[80px] text-center text-xs">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500 text-sm">
                    Tidak ada pesanan hari ini.
                  </TableCell>
                </TableRow>
              ) : (
                groupedOrders.map(([group, groupOrders]) => (
                  <React.Fragment key={group}>
                    {/* Group Header */}
                    <TableRow className="bg-yellow-50 hover:bg-yellow-50">
                      <TableCell colSpan={6} className="py-2 px-3 font-black text-xs text-yellow-800 border-t border-yellow-200">
                        KELOMPOK: {group} ({groupOrders.length} Pesanan)
                      </TableCell>
                    </TableRow>
                    
                    {/* Group Items */}
                    {groupOrders.map((order) => {
                      const isChecked = order.is_recap_checked
                      const isBatal = order.status === 'dibatalkan'
                      
                      return (
                        <TableRow key={order.id} className={`${isChecked ? 'bg-slate-100 opacity-60' : 'hover:bg-slate-50/50'} ${isBatal ? 'bg-red-50 opacity-50' : ''}`}>
                          <TableCell className="text-center w-[50px]">
                            <Checkbox 
                              checked={isChecked} 
                              disabled={isBatal}
                              onCheckedChange={() => toggleCheck(order.id, isChecked)} 
                            />
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-slate-800">
                            {order.kantin_profiles?.nama}
                            <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                              {order.created_at ? new Date(order.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </TableCell>
                          <TableCell className="leading-tight">
                            <span className={`text-xs font-medium ${isBatal ? 'line-through text-red-500' : 'text-slate-700'}`}>
                              {order.kantin_menus?.nama || order.kantin_addons?.nama}
                            </span>
                            {(order.deskripsi_pesanan || order.deskripsi_addon) && (
                              <span className="text-[11px] text-slate-600 italic ml-1">
                                ({order.deskripsi_pesanan || order.deskripsi_addon})
                              </span>
                            )}
                            {isBatal && <span className="ml-2 text-[9px] bg-red-200 text-red-800 px-1 py-0.5 rounded font-bold uppercase">Batal/Habis</span>}
                            
                            {!isBatal && (
                              <AdminNoteCell 
                                initialValue={order.admin_note || ''} 
                                isChecked={isChecked}
                                onSave={(newVal) => handleNoteUpdate(order.id, newVal)} 
                              />
                            )}
                          </TableCell>
                          <TableCell className="w-[100px]">
                            {order.kantin_menus && !isBatal ? (
                              <PriceCell 
                                initialValue={order.harga} 
                                isChecked={isChecked} 
                                onSave={(newVal) => handlePriceUpdate(order.id, 'harga', newVal)} 
                              />
                            ) : (
                              <div className="text-right text-slate-400 text-xs">{(order.harga || 0).toLocaleString('id-ID')}</div>
                            )}
                          </TableCell>
                          <TableCell className="w-[100px]">
                            {order.kantin_addons && !isBatal ? (
                              <PriceCell 
                                initialValue={order.harga_addon || order.harga} 
                                isChecked={isChecked} 
                                onSave={(newVal) => handlePriceUpdate(order.id, order.addon_id ? 'harga_addon' : 'harga', newVal)} 
                              />
                            ) : (
                              <div className="text-right text-slate-400 text-xs">{(order.harga_addon || 0).toLocaleString('id-ID')}</div>
                            )}
                          </TableCell>
                          <TableCell className="w-[80px] text-center">
                            {!isBatal && !isChecked && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-6 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                                onClick={async () => {
                                  const c = confirm(`Batalkan pesanan ini karena habis/kosong? Saldo ${order.kantin_profiles?.nama} akan dikembalikan.`)
                                  if (!c) return
                                  try {
                                    const { error } = await supabase.rpc('cancel_user_order', { p_order_id: order.id, p_bypass_time: true })
                                    if (error) throw error
                                    setOrders(orders.map(o => o.id === order.id ? { ...o, status: 'dibatalkan' } : o))
                                  } catch (e: any) {
                                    alert("Gagal membatalkan: " + e.message)
                                  }
                                }}
                              >
                                Batalkan
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </React.Fragment>
                ))
              )}
            </TableBody>
            <TableFooter className="bg-slate-100 font-bold">
              <TableRow>
                <TableCell colSpan={3} className="text-right py-3 text-sm">Total Omset Rekapan Hari Ini:</TableCell>
                <TableCell colSpan={3} className="text-right py-3 text-sm text-yellow-700">
                  Rp {orders.filter(o => o.status !== 'dibatalkan').reduce((sum, o) => sum + Number(o.harga) + Number(o.harga_addon || 0), 0).toLocaleString('id-ID')}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
