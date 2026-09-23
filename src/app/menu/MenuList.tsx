'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useMemo, useEffect } from 'react'
import { Search, ShoppingBag } from 'lucide-react'
import { useAppDialog } from '@/components/AppDialogProvider'

export default function MenuList({ menus, addons, profiles, orders }: { menus: any[], addons: any[], profiles: any[], orders: any[] }) {
  const { showAlert, showConfirm } = useAppDialog()
  const [selectedMenu, setSelectedMenu] = useState<any>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
  
  // Form State
  const [profileName, setProfileName] = useState('')
  const [profileDivisi, setProfileDivisi] = useState('')
  const [activeProfile, setActiveProfile] = useState<any>(null)
  const [authChecking, setAuthChecking] = useState(true)

  useEffect(() => {
    const savedName = localStorage.getItem('kantin_userName')
    if (!savedName) {
      window.location.href = '/login'
      return
    }
    
    // Auto find active profile by name
    const profile = profiles.find(p => p.nama?.toLowerCase() === savedName.toLowerCase())
    if (profile) {
      setActiveProfile(profile)
      setProfileName(profile.nama)
      setProfileDivisi(profile.divisi || '')
      setAuthChecking(false)
    } else {
      localStorage.removeItem('kantin_userName')
      window.location.href = '/login'
    }
  }, [profiles])


  
  const [customDesc, setCustomDesc] = useState('') // For standar
  const [wartegNasi, setWartegNasi] = useState('')
  const [wartegLauk, setWartegLauk] = useState('')
  const [wartegSayur, setWartegSayur] = useState('')
  const [selectedWartegItemIds, setSelectedWartegItemIds] = useState<string[]>([])
  
  const [selectedAddon, setSelectedAddon] = useState<string>('none')
  const [addonDesc, setAddonDesc] = useState('')
  const [pin, setPin] = useState('')

  const handlePesan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileName) {
      showAlert({ title: "Perhatian", message: "Nama wajib diisi!", type: "warning" })
      return
    }

    if (selectedMenu?.is_active === false) {
      const proceed = await showConfirm({
        title: "Menu Ditutup",
        message: "Menu/Grup ini sedang ditandai TUTUP oleh Admin.\n\nApakah Anda yakin ingin memaksa pesan?",
        confirmText: "Paksakan Pesan"
      })
      if (!proceed) return
    }

    const p_id = activeProfile?.id
    if (!p_id) {
      showAlert({ title: "Sesi Habis", message: "Sesi Anda tidak valid. Silakan login ulang.", type: "error" })
      window.location.href = '/login'
      return
    }

    let profileId = p_id

    // 2. Format description based on menu type
    let finalDesc = customDesc
    if (selectedMenu?.tipe_form === 'warteg') {
      const parts = []
      if (wartegNasi) parts.push(`Nasi: ${wartegNasi}`)
      if (wartegLauk) parts.push(`Lauk: ${wartegLauk}`)
      if (wartegSayur) parts.push(`Sayur: ${wartegSayur}`)
      finalDesc = parts.join(', ') || 'Kombinasi Warteg'
    }

    // Cutoff time - soft warning only
    if (selectedMenu.jam_tutup) {
      const now = new Date()
      const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}))
      const hours = jakartaTime.getHours().toString().padStart(2, '0')
      const minutes = jakartaTime.getMinutes().toString().padStart(2, '0')
      const jakartaTimeStr = `${hours}:${minutes}`

      if (jakartaTimeStr >= selectedMenu.jam_tutup.substring(0, 5)) {
        showAlert({
          title: "Batas Waktu Terlewat",
          message: `Menu ${selectedMenu.nama} sudah melewati batas waktu pemesanan (${selectedMenu.jam_tutup.substring(0, 5)}).\nSilakan hubungi admin secara langsung.`,
          type: "error"
        })
        return
      }
    }

    // 3. Addon details
    let finalAddonId = null
    let addonPrice = 0
    let addonName = ''
    if (selectedAddon !== 'none') {
      const addonObj = addons.find(a => a.id === selectedAddon)
      if (addonObj) {
        finalAddonId = addonObj.id
        addonPrice = addonObj.harga
        addonName = addonObj.nama
      }
    }

    // 4. Format description for history
    let txKet = selectedMenu.nama || 'Pesanan'
    if (finalDesc) txKet += ` (${finalDesc})`
    if (finalAddonId) {
      txKet += ` + ${addonName}`
      if (addonDesc) txKet += ` (${addonDesc})`
    }

    // 5. Atomic RPC Call
    const { error: rpcErr } = await supabase.rpc('process_order', {
      p_profile_id: profileId,
      p_menu_id: selectedMenu.id,
      p_addon_id: finalAddonId,
      p_deskripsi_pesanan: finalDesc,
      p_deskripsi_addon: addonDesc,
      p_harga: selectedMenu.harga,
      p_harga_addon: addonPrice,
      p_tanggal: new Date().toISOString().split('T')[0],
      p_tx_ket: txKet
    })

    if (rpcErr) {
      showAlert({ title: "Gagal", message: "Gagal membuat pesanan: " + rpcErr.message, type: "error" })
    } else {
      showAlert({ title: "Berhasil", message: "Pesanan berhasil dibuat!", type: "success" })
      setIsOpen(false)
      // Reset form
      setProfileName('')
      setProfileDivisi('')
      setCustomDesc('')
      setWartegNasi('')
      setWartegLauk('')
      setWartegSayur('')
      setSelectedWartegItemIds([])
      setSelectedAddon('none')
      setAddonDesc('')
    }
  }

  // Sinkronisasi otomatis dari checkbox ke input teks
  useEffect(() => {
    const nasi = selectedWartegItemIds.map(id => addons.find(a => a.id === id)).filter(a => a?.kategori === 'Warteg - Nasi').map(a => a?.nama).join(', ')
    const lauk = selectedWartegItemIds.map(id => addons.find(a => a.id === id)).filter(a => a?.kategori === 'Warteg - Lauk').map(a => a?.nama).join(', ')
    const sayur = selectedWartegItemIds.map(id => addons.find(a => a.id === id)).filter(a => a?.kategori === 'Warteg - Sayur').map(a => a?.nama).join(', ')
    
    setWartegNasi(nasi)
    setWartegLauk(lauk)
    setWartegSayur(sayur)
  }, [selectedWartegItemIds, addons])

  // Estimasi Harga untuk MenuList
  const estimasiHarga = useMemo(() => {
    const baseHarga = selectedMenu?.harga || 0
    let addonPrice = 0
    if (selectedAddon !== 'none') {
      addonPrice = addons.find(a => a.id === selectedAddon)?.harga || 0
    }
    
    let wartegPrice = 0
    if (selectedMenu?.tipe_form === 'warteg') {
      wartegPrice = selectedWartegItemIds.reduce((sum, id) => {
        const item = addons.find(a => a.id === id)
        return sum + (item?.harga || 0)
      }, 0)
    }
    return baseHarga + addonPrice + wartegPrice
  }, [selectedMenu, selectedAddon, selectedWartegItemIds, addons])

  const filteredMenus = useMemo(() => {
    if (!searchQuery.trim()) return menus
    const q = searchQuery.toLowerCase()
    return menus.filter(m => m.nama?.toLowerCase().includes(q) || m.kode_unik?.toLowerCase().includes(q))
  }, [menus, searchQuery])

  const groupedMenus = useMemo(() => {
    const groups: Record<string, any[]> = {}
    filteredMenus.forEach(menu => {
      let groupName = 'Menu Lainnya'
      const kCode = menu.kode_unik || ''
      if (kCode && kCode.includes('-')) {
        groupName = kCode.split('-')[0]
      }
      if (!groups[groupName]) {
        groups[groupName] = []
      }
      groups[groupName].push(menu)
    })
    return groups
  }, [filteredMenus])

  // Group all today's orders
  const groupedOrders = useMemo(() => {
    if (!orders) return []
    const map = new Map<string, any[]>()
    orders.forEach(o => {
      if (o.status === 'dibatalkan') return
      const nama = o.kantin_profiles?.nama || o.nama_user || 'Unknown'
      if (!map.has(nama)) map.set(nama, [])
      map.get(nama)!.push(o)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [orders])

  const handleSamain = async (nama: string, userOrders: any[]) => {
    if (!activeProfile) {
      showAlert({ title: "Sesi Habis", message: "Silakan login terlebih dahulu.", type: "error" })
      return
    }

    const confirm = await showConfirm({
      title: "Samain Pesanan?",
      message: `Anda akan langsung memesan makanan yang sama persis dengan yang dipesan oleh ${nama}.\n\nLanjutkan pesanan?`
    })

    if (!confirm) return

    let successCount = 0
    let lastError = null
    for (const o of userOrders) {
       const txKetName = o.kantin_menus?.nama || o.kantin_addons?.nama || 'Item'
       const notes = o.deskripsi_pesanan || o.deskripsi_addon ? ` (${o.deskripsi_pesanan || o.deskripsi_addon})` : ''
       const { error } = await supabase.rpc('process_order', {
         p_profile_id: activeProfile.id,
         p_menu_id: o.menu_id,
         p_addon_id: o.addon_id,
         p_deskripsi_pesanan: o.deskripsi_pesanan || '',
         p_deskripsi_addon: o.deskripsi_addon || '',
         p_harga: o.harga || 0,
         p_harga_addon: o.harga_addon || 0,
         p_tanggal: o.tanggal,
         p_tx_ket: txKetName + notes
       })
       if (!error) {
         successCount++
       } else {
         lastError = error.message
       }
    }

    if (successCount > 0) {
      showAlert({ title: "Berhasil", message: `${successCount} pesanan berhasil ditambahkan!`, type: "success" })
      setTimeout(() => window.location.reload(), 2000)
    } else {
      showAlert({ title: "Gagal", message: "Gagal menambahkan pesanan: " + (lastError || 'Unknown error'), type: "error" })
    }
  }

  if (authChecking) {
    return <div className="min-h-[50vh] flex items-center justify-center">Memeriksa sesi...</div>
  }

  return (
    <div className="space-y-6">
      {groupedOrders.length > 0 && (
        <div className="bg-white rounded-xl p-4 lg:p-5 shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500"></div>
          <h2 className="font-black text-sm lg:text-base text-slate-800 mb-3 border-b border-slate-100 pb-2 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-yellow-600" />
            Rekap Pesanan Hari Ini
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
            {groupedOrders.map(([nama, userOrders]) => (
               <div key={nama} className="text-sm flex flex-col justify-start pb-2 border-b border-slate-50 last:border-0 md:[&:nth-last-child(-n+2)]:border-0">
                 <div className="flex items-center gap-2 mb-1">
                   <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">{nama}</span>
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="h-5 text-[9px] px-2 py-0 border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 rounded-full"
                     onClick={() => handleSamain(nama, userOrders)}
                   >
                     Samain
                   </Button>
                 </div>
                 <ul className="list-disc pl-5 text-slate-600 text-[11px] lg:text-xs space-y-0.5">
                   {userOrders.map(o => (
                     <li key={o.id}>
                       {o.kantin_menus?.nama || o.kantin_addons?.nama}
                       {(o.deskripsi_pesanan || o.deskripsi_addon) && (
                         <span className="italic text-slate-400"> ({o.deskripsi_pesanan || o.deskripsi_addon})</span>
                       )}
                     </li>
                   ))}
                 </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Bar - Sticky at Top */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md py-3 -mx-4 px-4 md:mx-0 md:px-0 border-b md:border-b-0 border-yellow-200">
        <div className="relative max-w-lg mx-auto md:mx-0 shadow-sm rounded-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input 
            type="text"
            placeholder="Cari menu favorit Anda..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 bg-white rounded-full border-yellow-300 focus-visible:ring-yellow-500 text-base"
          />
        </div>
      </div>

      <div className="space-y-10">
        {Object.keys(groupedMenus).length === 0 ? (
          <p className="text-slate-500">Tidak ada menu yang cocok dengan pencarian Anda.</p>
        ) : null}

        {Object.entries(groupedMenus).map(([groupName, groupItems]) => (
          <div key={groupName} className="space-y-4">
            {/* Category Header with Divider */}
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-black text-yellow-800">{groupName}</h2>
              <div className="flex-1 h-[2px] bg-yellow-100 rounded-full"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupItems.map((menu) => {
                const isTutup = menu.is_active === false
                return (
        <Card key={menu.id} className={`overflow-hidden border-yellow-200 flex flex-col ${isTutup ? 'opacity-60 grayscale' : ''}`}>
          {menu.foto_url && (
            <div className="h-48 w-full bg-slate-100">
              <img src={menu.foto_url} alt={menu.nama} className="object-cover w-full h-full" />
            </div>
          )}
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex gap-2 items-center">
                  <CardTitle>{menu.nama}</CardTitle>
                  {isTutup && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">TUTUP</span>}
                </div>
                <CardDescription className="font-mono mt-1 text-yellow-600 font-bold">{menu.kode_unik}</CardDescription>
              </div>
              <span className="font-bold text-lg text-slate-700">Rp {menu.harga.toLocaleString('id-ID')}</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="text-sm text-slate-600 line-clamp-3">{menu.deskripsi}</p>
            {menu.jam_tutup && (
              <p className="text-xs text-red-500 font-semibold mt-2">Close: {menu.jam_tutup.substring(0, 5)}</p>
            )}
          </CardContent>
          <CardFooter>
            <Dialog open={isOpen && selectedMenu?.id === menu.id} onOpenChange={(open) => {
              if (open && !isTutup) {
                setSelectedMenu(menu)
                setCustomDesc('')
                setWartegNasi('')
                setWartegLauk('')
                setWartegSayur('')
                setSelectedWartegItemIds([])
                setSelectedAddon('none')
                setAddonDesc('')
                setPin('')
                setIsOpen(true)
              } else {
                setIsOpen(false)
                setSelectedMenu(null)
              }
            }}>
              <DialogTrigger className={`w-full text-white h-10 rounded-md text-sm font-semibold transition-colors ${isTutup ? 'bg-red-500 hover:bg-red-600' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                {isTutup ? 'Pesan (Menu Sedang Tutup)' : 'Ingin Pesan'}
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Pesan {menu.nama}</DialogTitle>
                  <DialogDescription>
                    Isi detail pesanan Anda di bawah ini.
                  </DialogDescription>
                </DialogHeader>
                
                {menu.foto_url && (
                  <img src={menu.foto_url} alt={menu.nama} className="w-full h-32 object-cover rounded-md mb-4" />
                )}

                <form onSubmit={handlePesan} className="space-y-4">
                  <div className="flex justify-between items-center bg-slate-50 border p-2 rounded mb-2">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{activeProfile?.nama}</p>
                      <p className="text-[10px] text-slate-500">{activeProfile?.divisi || 'Tanpa Divisi'}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        localStorage.removeItem('kantin_userName')
                        window.location.href = '/login'
                      }}
                      type="button"
                    >
                      Logout
                    </Button>
                  </div>



                  <div className="border-t border-slate-200 my-4 pt-4">
                    <h4 className="font-semibold text-sm mb-3">Detail Makanan</h4>
                    {menu.tipe_form === 'warteg' ? (
                      <div className="space-y-3 bg-slate-50 p-3 border rounded-md border-slate-200">
                        <div className="bg-yellow-50/80 p-2.5 rounded border border-yellow-200 text-xs text-yellow-900 mb-2">
                          <div className="font-bold mb-2 border-b border-yellow-200/50 pb-1">Pilih Kombinasi (Opsional):</div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-medium">
                             {Object.keys(wartegItemsByCategory).length > 0 ? (
                               Object.entries(wartegItemsByCategory).flatMap(([cat, items]) => 
                                 items.map(item => (
                                   <label key={item.id} className="flex items-center gap-1.5 cursor-pointer hover:bg-yellow-100 rounded px-1 py-0.5">
                                     <input 
                                       type="checkbox" 
                                       className="accent-yellow-600 w-3 h-3"
                                       checked={selectedWartegItemIds.includes(item.id)}
                                       onChange={(e) => {
                                         if (e.target.checked) setSelectedWartegItemIds([...selectedWartegItemIds, item.id])
                                         else setSelectedWartegItemIds(selectedWartegItemIds.filter(id => id !== item.id))
                                       }}
                                     />
                                     <span>{item.nama} <span className="text-[10px] text-yellow-700">({item.harga / 1000}k)</span></span>
                                   </label>
                                 ))
                               )
                             ) : (
                               <span className="text-slate-400 italic">Belum ada acuan harga.</span>
                             )}
                          </div>
                          <div className="text-[10px] italic mt-2 text-yellow-700">*Ceklis untuk isi otomatis form di bawah & kalkulasi estimasi harga. Total akhir disesuaikan Admin.</div>
                        </div>

                        <div className="grid gap-2">
                          <Label>Nasi</Label>
                          <Input value={wartegNasi} onChange={(e) => setWartegNasi(e.target.value)} placeholder="Putih / Merah / Setengah" className="bg-white" />
                        </div>
                        <div className="grid gap-2">
                          <Label>Lauk</Label>
                          <Input value={wartegLauk} onChange={(e) => setWartegLauk(e.target.value)} placeholder="Ayam, Ikan, Telor..." className="bg-white" />
                        </div>
                        <div className="grid gap-2">
                          <Label>Sayur</Label>
                          <Input value={wartegSayur} onChange={(e) => setWartegSayur(e.target.value)} placeholder="Sayur Nangka, Oreg, Mustofa..." className="bg-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <Label>Catatan (Opsional)</Label>
                        <Textarea 
                          placeholder="Misal: pedas, tambah kecap, dll" 
                          value={customDesc}
                          onChange={(e) => setCustomDesc(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 my-4 pt-4">
                    <h4 className="font-semibold text-sm mb-3">Tambahan (Add-ons)</h4>
                    <div className="grid gap-2">
                      <Label>Pilih Minuman / Buah / Kerupuk</Label>
                      <select 
                        value={selectedAddon} 
                        onChange={(e) => setSelectedAddon(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="none">Tidak ada tambahan</option>
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
                      <div className="grid gap-2 mt-3">
                        <Label>Catatan Add-on</Label>
                        <Input 
                          placeholder="Misal: Es teh manis, dingin, dll" 
                          value={addonDesc}
                          onChange={(e) => setAddonDesc(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-4 flex items-center justify-between border-t border-slate-200">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Estimasi Harga</span>
                      <span className="text-lg font-black text-yellow-600">Rp {estimasiHarga.toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Batal</Button>
                      <Button type="submit" className="bg-yellow-500 hover:bg-yellow-600 text-white">Kirim Pesanan</Button>
                    </div>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardFooter>
        </Card>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
