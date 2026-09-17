'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { AlertCircle, Image as ImageIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

export default function OrderForm({ profiles, menus, addons, initialOrders }: { profiles: any[], menus: any[], addons: any[], initialOrders: any[] }) {
  const [orders, setOrders] = useState(initialOrders)
  
  // Form State
  const [profileName, setProfileName] = useState('')
  const [profileDivisi, setProfileDivisi] = useState('')

  useEffect(() => {
    const savedName = localStorage.getItem('kantin_userName')
    if (savedName) setProfileName(savedName)
    const savedDivisi = localStorage.getItem('kantin_userDivisi')
    if (savedDivisi) setProfileDivisi(savedDivisi)
  }, [])
  
  const [selectedMenuId, setSelectedMenuId] = useState<string>('')
  const [customDesc, setCustomDesc] = useState('')
  const [wartegNasi, setWartegNasi] = useState('')
  const [wartegLauk, setWartegLauk] = useState('')
  const [wartegSayur, setWartegSayur] = useState('')
  const [selectedWartegItemIds, setSelectedWartegItemIds] = useState<string[]>([])
  const [selectedAddon, setSelectedAddon] = useState<string>('none')
  const [addonDesc, setAddonDesc] = useState('')
  const [pin, setPin] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showImagePopup, setShowImagePopup] = useState(false)

  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm' | 'prompt-pin';
    title: string;
    message: string;
    resolve?: (val: any) => void;
  }>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: ''
  })
  const [promptPinValue, setPromptPinValue] = useState('')

  const showAppDialog = (type: 'alert' | 'confirm' | 'prompt-pin', title: string, message: string): Promise<any> => {
    return new Promise((resolve) => {
      setPromptPinValue('')
      setDialogConfig({ isOpen: true, type, title, message, resolve })
    })
  }

  const handleDialogClose = (result: any) => {
    setDialogConfig(prev => ({ ...prev, isOpen: false }))
    if (dialogConfig.resolve) {
      dialogConfig.resolve(result)
    }
  }

  // Konfirmasi sebelum menutup tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (customDesc.length > 0 || addonDesc.length > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [customDesc, addonDesc])

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value
    setSelectedDate(newDate)
    
    const { data: newOrders } = await supabase
      .from('kantin_orders')
      .select(`*, kantin_profiles(nama, saldo), kantin_menus(nama, kode_unik), kantin_addons(nama)`)
      .eq('tanggal', newDate)
      .order('created_at', { ascending: false })
      
    if (newOrders) {
      setOrders(newOrders)
    }
  }

  const handleCancelOrder = async (orderId: string, profileId: string, totalHarga: number) => {
    if (!activeProfile) {
      await showAppDialog('alert', 'Perhatian', "Untuk membatalkan pesanan, ketik Nama Anda di kotak kiri, lalu coba lagi.")
      return
    }
    if (activeProfile.id !== profileId) {
      await showAppDialog('alert', 'Gagal', "Anda hanya bisa membatalkan pesanan Anda sendiri!")
      return
    }

    const enteredPin = await showAppDialog('prompt-pin', 'Konfirmasi PIN', 'Masukkan PIN 4 digit Anda untuk membatalkan pesanan:')
    if (!enteredPin) return // user cancelled
    
    // Live verify PIN for cancel order
    const { data: dbProfile } = await supabase.from('kantin_profiles').select('pin').eq('id', activeProfile.id).single()
    const currentPin = dbProfile?.pin || '0000'
    
    if (enteredPin !== currentPin) {
      await showAppDialog('alert', 'Gagal', "PIN yang Anda masukkan salah!")
      return
    }

    const confirmCancel = await showAppDialog('confirm', 'Batalkan Pesanan', "Yakin ingin membatalkan pesanan ini? Saldo akan dikembalikan otomatis.")
    if (!confirmCancel) return
    
    try {
      // 1. Hapus transaksi pengeluaran dari history
      await supabase.from('kantin_transactions').delete().eq('order_id', orderId)
      
      // 2. Kembalikan saldo user
      const { data: profile } = await supabase.from('kantin_profiles').select('saldo').eq('id', profileId).single()
      if (profile) {
        const newSaldo = profile.saldo + totalHarga
        await supabase.from('kantin_profiles').update({ saldo: newSaldo }).eq('id', profileId)
      }

      // 3. Hapus pesanan (atau set dibatalkan)
      await supabase.from('kantin_orders').delete().eq('id', orderId)
      
      // Update UI
      setOrders(orders.filter(o => o.id !== orderId))
      window.dispatchEvent(new Event('kantin_user_updated'))
    } catch (e) {
      await showAppDialog('alert', 'Gagal', "Gagal membatalkan pesanan.")
    }
  }

  // Find if user exists and their balance
  const activeProfile = useMemo(() => {
    return profiles.find(p => p.nama.toLowerCase() === profileName.toLowerCase())
  }, [profileName, profiles])

  const selectedMenu = useMemo(() => {
    return menus.find(m => {
      let baseCode = m.kode_unik
      if (baseCode.includes('-')) baseCode = baseCode.split('-')[0]
      const formatStr = `${baseCode} - ${m.nama}${m.is_active === false ? ' [TUTUP]' : ''}`
      return formatStr === selectedMenuId
    })
  }, [selectedMenuId, menus])

  useEffect(() => {
    if (selectedMenu && selectedMenu.foto_url) {
      setShowImagePopup(true)
    }
  }, [selectedMenu])

  const selectedAddonObj = useMemo(() => {
    return addons.find(a => a.id === selectedAddon)
  }, [selectedAddon, addons])

  const estimasiHarga = useMemo(() => {
    let base = (selectedMenu?.harga || 0) + (selectedAddonObj?.harga || 0)
    if (selectedMenu?.tipe_form === 'warteg') {
      const wartegPrice = selectedWartegItemIds.reduce((sum, id) => {
        const item = addons.find(a => a.id === id)
        return sum + (item?.harga || 0)
      }, 0)
      base += wartegPrice
    }
    return base
  }, [selectedMenu, selectedAddonObj, selectedWartegItemIds, addons])

  // Sinkronisasi otomatis dari checkbox ke input teks
  useEffect(() => {
    const nasi = selectedWartegItemIds.map(id => addons.find(a => a.id === id)).filter(a => a?.kategori === 'Warteg - Nasi').map(a => a?.nama).join(', ')
    const lauk = selectedWartegItemIds.map(id => addons.find(a => a.id === id)).filter(a => a?.kategori === 'Warteg - Lauk').map(a => a?.nama).join(', ')
    const sayur = selectedWartegItemIds.map(id => addons.find(a => a.id === id)).filter(a => a?.kategori === 'Warteg - Sayur').map(a => a?.nama).join(', ')
    
    // Hanya overwrite jika ada item yang di ceklis di kategori tersebut, 
    // atau jika sebelumnya sudah diisi oleh sistem (agar user masih bisa edit manual setelah ceklis)
    setWartegNasi(nasi)
    setWartegLauk(lauk)
    setWartegSayur(sayur)
  }, [selectedWartegItemIds, addons])

  const addonsByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    addons.forEach(a => {
      if (a.is_active === false) return
      const cat = a.kategori || 'Lainnya'
      if (!cat.startsWith('Warteg')) {
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(a)
      }
    })
    return grouped
  }, [addons])

  const wartegItemsByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    addons.forEach(a => {
      if (a.is_active === false) return
      const cat = a.kategori || ''
      if (cat.startsWith('Warteg')) {
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(a)
      }
    })
    return grouped
  }, [addons])

  const handleOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileName) {
      await showAppDialog('alert', 'Perhatian', "Nama pemesan wajib diisi!")
      return
    }
    if (!selectedMenu) {
      await showAppDialog('alert', 'Perhatian', "Pilih menu yang valid terlebih dahulu!")
      return
    }
    if (selectedMenu.is_active === false) {
      const proceed = await showAppDialog('confirm', 'Menu Sedang Tutup', "Menu/Grup ini sedang ditandai TUTUP oleh Admin. Apakah Anda yakin ingin memaksa pesan?")
      if (!proceed) return
    }

    if (pin.length !== 4) {
      await showAppDialog('alert', 'Perhatian', "PIN harus 4 digit angka!")
      return
    }

    setIsSubmitting(true)

    try {
      // Live verify PIN from DB using RPC to prevent using stale '0000' or old PINs
      if (activeProfile) {
        const { data: isPinValid, error: pinErr } = await supabase.rpc('verify_pin', { p_profile_id: activeProfile.id, p_pin: pin })
        if (pinErr) throw pinErr
        
        if (!isPinValid) {
          setIsSubmitting(false)
          await showAppDialog('alert', 'Gagal', "PIN Anda salah! Jika lupa, klik 'Lupa PIN?' di bawah.")
          return
        }
      }

      let profileId = activeProfile?.id
      if (!profileId) {
        const { data: newProfile, error: profileErr } = await supabase
          .from('kantin_profiles')
          .insert([{ nama: profileName, divisi: profileDivisi, pin: pin }])
          .select()
          .single()
        
        if (profileErr) throw profileErr
        profileId = newProfile.id
      } else {
        if (!activeProfile.pin || activeProfile.pin === '0000') {
          await supabase.from('kantin_profiles').update({ pin }).eq('id', profileId)
        }
      }

      // Sync to localStorage
      localStorage.setItem('kantin_userName', profileName)
      localStorage.setItem('kantin_userDivisi', profileDivisi)
      window.dispatchEvent(new Event('kantin_user_updated'))

      // Cutoff time validation - soft warning only
      let lateOrderNote = ''
      const todayStr = new Date().toISOString().split('T')[0]
      if (selectedMenu.jam_tutup && selectedDate === todayStr) {
        const now = new Date()
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`
        if (currentTime > selectedMenu.jam_tutup) {
          setIsSubmitting(false) // Temporarily pause spinner for dialog
          const proceed = await showAppDialog(
            'confirm',
            'Pesan Lewat Jam',
            `${selectedMenu.nama} sudah lewat batas jam ${selectedMenu.jam_tutup.substring(0, 5)}.\n\nLanjutkan pesan? Admin akan diinfokan.`
          )
          if (!proceed) {
            return
          }
          setIsSubmitting(true)
          lateOrderNote = `⚠️ Pesan lewat jam ${selectedMenu.jam_tutup.substring(0,5)}`
        }
      }

      let baseDesc = customDesc
      if (selectedMenu.tipe_form === 'warteg') {
        const parts = []
        if (wartegNasi) parts.push(`Nasi: ${wartegNasi}`)
        if (wartegLauk) parts.push(`Lauk: ${wartegLauk}`)
        if (wartegSayur) parts.push(`Sayur: ${wartegSayur}`)
        baseDesc = parts.join(', ') || 'Kombinasi Warteg'
      }

      const finalDesc = lateOrderNote
        ? (baseDesc ? `${baseDesc} | ${lateOrderNote}` : lateOrderNote)
        : baseDesc

      // Format description for history
      let txKet = selectedMenu.nama || customDesc || 'Pesanan'
      if (customDesc && selectedMenu.nama) txKet += ` (${customDesc})`
      if (selectedAddonObj) {
        txKet += ` + ${selectedAddonObj.nama}`
        if (addonDesc) txKet += ` (${addonDesc})`
      }

      // Use RPC for atomic order creation and balance deduction
      const { data: rpcData, error: rpcErr } = await supabase.rpc('process_order', {
        p_profile_id: profileId,
        p_menu_id: selectedMenu.id,
        p_addon_id: selectedAddonObj?.id || null,
        p_deskripsi_pesanan: finalDesc,
        p_deskripsi_addon: addonDesc,
        p_harga: selectedMenu.harga,
        p_harga_addon: selectedAddonObj?.harga || 0,
        p_tanggal: selectedDate,
        p_tx_ket: txKet
      })

      if (rpcErr) throw rpcErr

      // Fetch the newly created order for the UI
      const { data: newOrder, error: fetchErr } = await supabase
        .from('kantin_orders')
        .select(`*, kantin_profiles(nama, saldo), kantin_menus(nama, kode_unik), kantin_addons(nama)`)
        .eq('id', rpcData.order_id)
        .single()

      if (fetchErr) throw fetchErr

      // Update local state
      setOrders([newOrder, ...orders])
      
      // Reset form (kecuali profil)
      setSelectedMenuId('')
      setCustomDesc('')
      setWartegNasi('')
      setWartegLauk('')
      setWartegSayur('')
      setSelectedWartegItemIds([])
      setSelectedAddon('none')
      setAddonDesc('')
      await showAppDialog('alert', 'Sukses', "Pesanan berhasil ditambahkan!")
      
    } catch (err) {
      console.error(err)
      await showAppDialog('alert', 'Gagal', "Terjadi kesalahan saat memesan.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Sort orders by kode_unik to group them nicely, as requested
  // Sort orders by kode_unik, but put current user's orders at the very top
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const isAUser = a.kantin_profiles?.nama?.toLowerCase() === profileName.toLowerCase()
      const isBUser = b.kantin_profiles?.nama?.toLowerCase() === profileName.toLowerCase()
      
      if (isAUser && !isBUser) return -1
      if (!isAUser && isBUser) return 1
      
      const codeA = a.kantin_menus?.kode_unik || ''
      const codeB = b.kantin_menus?.kode_unik || ''
      return codeA.localeCompare(codeB)
    })
  }, [orders, profileName])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN: COMPACT FORM */}
      <div className="lg:col-span-4 sticky top-24">
        <Card className="border-yellow-200 shadow-sm">
          <CardHeader className="bg-yellow-50/80 p-2 pb-1.5">
            <CardTitle className="text-xs font-bold text-yellow-800">Form Pesanan Baru</CardTitle>
          </CardHeader>
          <CardContent className="p-2 pt-2">
            <form onSubmit={handleOrder} className="space-y-2">
              
              <div className="flex gap-1.5">
                <div className="w-1/2">
                  <Input 
                    id="nama" 
                    placeholder="Ketik nama..." 
                    value={profileName}
                    onChange={(e) => {
                      const val = e.target.value
                      setProfileName(val.replace(/\b\w/g, char => char.toUpperCase()))
                    }}
                    required 
                    list="profile-list"
                    className="text-[10px] h-6 px-1.5"
                  />
                  <datalist id="profile-list">
                    {profiles.map(p => <option key={p.id} value={p.nama} />)}
                  </datalist>
                </div>
                <div className="w-1/2">
                  <Input 
                    id="divisi" 
                    placeholder={activeProfile ? activeProfile.divisi || 'Divisi' : 'Divisi'} 
                    value={profileDivisi}
                    onChange={(e) => {
                      const val = e.target.value
                      setProfileDivisi(val.replace(/\b\w/g, char => char.toUpperCase()))
                    }}
                    disabled={!!activeProfile}
                    className="text-[10px] h-6 px-1.5"
                  />
                </div>
              </div>

              {/* Pin Field */}
              <div className="w-full">
                <Input 
                  type="password"
                  maxLength={4}
                  placeholder={activeProfile && activeProfile.pin && activeProfile.pin !== '0000' ? "Masukkan PIN (4 Angka)" : "Buat PIN Baru (4 Angka)"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  required
                  className="text-[10px] h-6 px-1.5"
                />
                <a href={`https://wa.me/${process.env.NODE_ENV === 'development' ? '6285162563828' : '6287885456448'}?text=Halo%20Admin%20Kantin,%20saya%20${profileName || 'user'}%20lupa%20PIN%20akun%20saya.%20Tolong%20bantu%20reset%20PIN%20saya%20ya,%20terima%20kasih.`} target="_blank" className="text-[9px] text-blue-500 hover:underline mt-1 inline-block">Lupa PIN? Reset via WA</a>
              </div>

              {activeProfile && activeProfile.saldo < 0 && (
                <div className="bg-red-50 text-red-700 text-[9px] p-1.5 rounded border border-red-100 flex items-center gap-1 font-semibold">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>Tagihan: Rp {Math.abs(activeProfile.saldo).toLocaleString('id-ID')}</span>
                </div>
              )}

              <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Pilih Menu</Label>
                    <a href="/menu" className="text-[8px] font-bold text-yellow-600 hover:underline">
                      Katalog ↗
                    </a>
                  </div>
                  <Input 
                    placeholder="Ketik menu..." 
                    value={selectedMenuId} 
                    onChange={(e) => setSelectedMenuId(e.target.value)} 
                    required
                    list="menus-list"
                    className="text-[10px] h-6 px-1.5"
                  />
                  <datalist id="menus-list">
                    {menus.map(menu => {
                      let baseCode = menu.kode_unik
                      if (baseCode.includes('-')) baseCode = baseCode.split('-')[0]
                      const label = `${baseCode} - ${menu.nama}${menu.is_active === false ? ' [TUTUP]' : ''}`
                      return <option key={menu.id} value={label} />
                    })}
                  </datalist>
                </div>

                {/* Show Image & Estimated Price dynamically */}
                {selectedMenu && (
                  <div className="bg-slate-50 border rounded p-1.5 flex gap-2 items-center">
                    {selectedMenu.foto_url ? (
                      <img src={selectedMenu.foto_url} alt="Menu" className="w-8 h-8 object-cover rounded border bg-white" />
                    ) : (
                      <div className="w-8 h-8 bg-slate-200 text-slate-400 flex items-center justify-center rounded shrink-0">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold truncate text-slate-800 leading-tight">{selectedMenu.nama}</div>
                      {selectedMenu.jam_tutup && (
                        <div className="text-[7px] text-red-500 font-bold uppercase mt-0.5">Batas: {selectedMenu.jam_tutup.substring(0,5)}</div>
                      )}
                      <div className="text-[10px] font-black text-yellow-600 mt-0.5 leading-tight">
                        Est: Rp {estimasiHarga.toLocaleString('id-ID')}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  {selectedMenu?.tipe_form === 'warteg' ? (
                    <div className="space-y-1.5 mt-2 bg-slate-50 p-2 border rounded border-slate-100">
                      <Label className="text-[9px] font-bold text-slate-600 block mb-1">KOMBINASI WARTEG (Wajib Diisi)</Label>
                      
                      <div className="bg-yellow-50/80 p-1.5 rounded border border-yellow-200 text-[8px] text-yellow-900 mb-2">
                        <div className="font-bold mb-1 border-b border-yellow-200/50 pb-0.5">Pilih Kombinasi (Opsional):</div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-medium leading-tight">
                           {Object.keys(wartegItemsByCategory).length > 0 ? (
                             Object.entries(wartegItemsByCategory).flatMap(([cat, items]) => 
                               items.map(item => (
                                 <label key={item.id} className="flex items-center gap-1 cursor-pointer hover:bg-yellow-100 rounded px-0.5">
                                   <input 
                                     type="checkbox" 
                                     className="accent-yellow-600 w-2.5 h-2.5"
                                     checked={selectedWartegItemIds.includes(item.id)}
                                     onChange={(e) => {
                                       if (e.target.checked) setSelectedWartegItemIds([...selectedWartegItemIds, item.id])
                                       else setSelectedWartegItemIds(selectedWartegItemIds.filter(id => id !== item.id))
                                     }}
                                   />
                                   <span>{item.nama} <span className="text-[7px] text-yellow-700">({item.harga / 1000}k)</span></span>
                                 </label>
                               ))
                             )
                           ) : (
                             <span className="text-slate-400 italic">Belum ada acuan harga.</span>
                           )}
                        </div>
                        <div className="text-[7px] italic mt-1 text-yellow-700">*Ceklis untuk isi otomatis form di bawah & kalkulasi estimasi harga. Total akhir bisa disesuaikan Admin.</div>
                      </div>

                      <div className="flex gap-1.5">
                        <Input value={wartegNasi} onChange={(e) => setWartegNasi(e.target.value)} placeholder="Nasi (Merah/Putih/Setengah)" className="text-[10px] h-6 px-1.5 bg-white" />
                      </div>
                      <div className="flex gap-1.5">
                        <Input value={wartegLauk} onChange={(e) => setWartegLauk(e.target.value)} placeholder="Lauk (Ayam, Ikan, Telor...)" className="text-[10px] h-6 px-1.5 bg-white" />
                      </div>
                      <div className="flex gap-1.5">
                        <Input value={wartegSayur} onChange={(e) => setWartegSayur(e.target.value)} placeholder="Sayur (Sayur, Oreg, Mustofa...)" className="text-[10px] h-6 px-1.5 bg-white" />
                      </div>
                    </div>
                  ) : (
                    <Textarea 
                      placeholder="Catatan pesanan" 
                      value={customDesc}
                      onChange={(e) => setCustomDesc(e.target.value)}
                      className="min-h-[40px] text-[10px] resize-none p-1.5"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                <Label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Add-ons</Label>
                <div className="flex gap-1.5">
                  <select 
                    value={selectedAddon} 
                    onChange={(e) => setSelectedAddon(e.target.value)}
                    className="flex h-6 w-full rounded border border-slate-200 bg-white px-1 text-[9px]"
                  >
                    <option value="none">Tanpa Add-on</option>
                    {Object.entries(addonsByCategory).map(([cat, items]) => (
                      <optgroup key={cat} label={cat.toUpperCase()}>
                        {items.map(addon => (
                          <option key={addon.id} value={addon.id}>
                            {addon.nama} (+Rp {addon.harga.toLocaleString('id-ID')})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {selectedAddon !== 'none' && (
                  <Input 
                    placeholder="Catatan Add-on" 
                    value={addonDesc}
                    onChange={(e) => setAddonDesc(e.target.value)}
                    className="text-[10px] h-6 px-1.5"
                  />
                )}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white text-[10px] h-6 font-bold mt-1">
                {isSubmitting ? 'Memproses...' : 'Kirim Pesanan'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Pembeli Aktif (Admin) Block */}
        <div className="mt-4 bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs">
          <div className="flex items-center gap-2 font-bold text-blue-800 mb-2 border-b border-blue-200 pb-1">
            <AlertCircle className="h-4 w-4" /> 
            Admin Aktif (Pembeli Hari Ini)
          </div>
          <div className="text-blue-900 font-medium space-y-1">
            <div>Nama: Suryana</div>
            <div>NO.Rek: 0760081566 A/N SURYANA</div>
            <div>NO.Hp: 087885456448</div>
            <div className="text-[10px] text-blue-600 italic mt-2">
              *Silakan transfer top-up saldo ke rekening di atas.
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: LARGER LIST AREA */}
      <div className="lg:col-span-8">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-700">Daftar Pesanan</h2>
            <Input 
              type="date" 
              value={selectedDate} 
              onChange={handleDateChange}
              className="h-6 text-[10px] w-auto py-0 px-2 bg-yellow-50/50 border-yellow-200 font-bold text-yellow-800"
            />
          </div>
          <span className="text-[10px] text-slate-500 font-semibold">{sortedOrders.length} Pesanan</span>
        </div>
        
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[50px] text-[10px] py-1.5 h-auto">Grup</TableHead>
                  <TableHead className="w-[100px] text-[10px] py-1.5 h-auto">Pemesan</TableHead>
                  <TableHead className="text-[10px] py-1.5 h-auto">Pesanan & Catatan</TableHead>
                  <TableHead className="text-right text-[10px] py-1.5 h-auto">Harga</TableHead>
                  <TableHead className="w-[70px] text-center text-[10px] py-1.5 h-auto">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-xs">
                      Belum ada pesanan masuk hari ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedOrders.map(order => {
                    const totalHarga = Number(order.harga) + Number(order.harga_addon || 0)
                    let baseCode = order.kantin_menus?.kode_unik || '-'
                    if (baseCode.includes('-')) baseCode = baseCode.split('-')[0]
                    const isUserOrder = order.kantin_profiles?.nama?.toLowerCase() === profileName.toLowerCase()
                    
                    return (
                      <TableRow key={order.id} className={isUserOrder ? "bg-yellow-50 hover:bg-yellow-100" : "hover:bg-slate-50/50"}>
                        <TableCell className="font-mono font-bold text-yellow-600 text-[9px] py-1">
                          {baseCode}
                        </TableCell>
                        <TableCell className="font-semibold text-[10px] py-1">
                          {order.kantin_profiles?.nama}
                        </TableCell>
                        <TableCell className="py-1 leading-tight">
                          <span className="font-bold text-[10px] text-slate-700">
                            {order.kantin_menus?.nama}
                          </span>
                          {order.deskripsi_pesanan && (
                            <span className="text-[9px] text-slate-600 italic ml-1">
                              ({order.deskripsi_pesanan})
                            </span>
                          )}
                          {order.addon_id && (
                            <span className="text-[9px] font-semibold text-blue-600 ml-1">
                              + {order.kantin_addons?.nama} {order.deskripsi_addon ? `(${order.deskripsi_addon})` : ''}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-bold text-[10px] text-right py-1">
                          {totalHarga > 0 ? `Rp ${totalHarga.toLocaleString('id-ID')}` : '-'}
                        </TableCell>
                        <TableCell className="text-center py-1 flex flex-col gap-1 items-center justify-center h-full">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase ${
                            order.status === 'selesai' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {order.status}
                          </span>
                          {order.status === 'pending' && (
                            <button 
                              onClick={() => handleCancelOrder(order.id, order.profile_id, totalHarga)}
                              className="text-[8px] text-red-500 hover:text-red-700 font-semibold underline"
                            >
                              Batalkan
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
              <TableFooter className="bg-slate-100 font-bold">
                <TableRow>
                  <TableCell colSpan={3} className="text-right py-2 text-[10px]">Total Belanja Hari Ini:</TableCell>
                  <TableCell className="text-right py-2 text-[10px] text-yellow-700">
                    Rp {sortedOrders.reduce((sum, o) => sum + Number(o.harga) + Number(o.harga_addon || 0), 0).toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogConfig.isOpen} onOpenChange={(open) => {
        if(!open) handleDialogClose(dialogConfig.type === 'prompt-pin' ? null : false)
      }}>
        <DialogContent className="sm:max-w-[400px] bg-white border-2 border-yellow-500 rounded-xl shadow-lg p-0 overflow-hidden">
          <div className="bg-yellow-50 px-6 py-4 border-b border-yellow-100 flex items-center gap-3">
            <AlertCircle className={`h-6 w-6 ${dialogConfig.type === 'alert' && dialogConfig.title.toLowerCase().includes('gagal') ? 'text-red-500' : 'text-yellow-600'}`} />
            <DialogTitle className={`text-lg font-bold ${dialogConfig.type === 'alert' && dialogConfig.title.toLowerCase().includes('gagal') ? 'text-red-600' : 'text-yellow-700'}`}>
              {dialogConfig.title}
            </DialogTitle>
          </div>
          <div className="px-6 py-6">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{dialogConfig.message}</p>
            {dialogConfig.type === 'prompt-pin' && (
              <div className="mt-6">
                <Input 
                  type="password"
                  maxLength={4}
                  value={promptPinValue}
                  onChange={(e) => setPromptPinValue(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-[1em] font-bold text-2xl h-14 border-2 border-yellow-300 focus-visible:ring-yellow-500 rounded-xl"
                  placeholder="••••"
                  autoFocus
                />
              </div>
            )}
          </div>
          <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
            {(dialogConfig.type === 'confirm' || dialogConfig.type === 'prompt-pin') && (
              <Button 
                variant="outline" 
                onClick={() => handleDialogClose(dialogConfig.type === 'prompt-pin' ? null : false)}
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-semibold px-6"
              >
                Batal
              </Button>
            )}
            <Button 
              onClick={() => {
                if (dialogConfig.type === 'prompt-pin') {
                  handleDialogClose(promptPinValue)
                } else {
                  handleDialogClose(true)
                }
              }}
              className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold px-6"
            >
              {dialogConfig.type === 'alert' ? 'OK' : 'Lanjutkan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pop-up Gambar Layar Penuh saat menu dipilih */}
      <Dialog open={showImagePopup} onOpenChange={setShowImagePopup}>
        <DialogContent className="max-w-2xl bg-black border-none p-0 overflow-hidden rounded-xl shadow-2xl">
          <div className="relative">
            {selectedMenu?.foto_url && (
              <img 
                src={selectedMenu.foto_url} 
                alt={selectedMenu.nama} 
                className="w-full max-h-[85vh] object-contain"
              />
            )}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-20">
              <h2 className="text-white text-3xl font-black drop-shadow-md">{selectedMenu?.nama}</h2>
              <p className="text-yellow-400 text-xl font-bold mt-1 drop-shadow-md">
                Rp {estimasiHarga.toLocaleString('id-ID')}
              </p>
            </div>
            {/* Tombol tutup X di kanan atas (sudah bawaan shadcn, tapi kita bisa tambah jika perlu. Bawaan shadcn sudah ada) */}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
