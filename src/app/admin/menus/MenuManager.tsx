'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { supabase } from '@/lib/supabase'
import { PlusCircle, Trash2, Edit, Image as ImageIcon, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function MenuManager({ initialMenus, initialAddons }: { initialMenus: any[], initialAddons: any[] }) {
  const [menus, setMenus] = useState(initialMenus)
  const [addons, setAddons] = useState(initialAddons)

  // Group menus by base code (P.MERAH-1 → P.MERAH)
  const groupedMenus = useMemo(() => {
    const groups: Record<string, any[]> = {}
    menus.forEach(m => {
      let baseCode = m.kode_unik
      if (baseCode.includes('-')) baseCode = baseCode.split('-')[0]
      if (!groups[baseCode]) groups[baseCode] = []
      groups[baseCode].push(m)
    })
    for (const code of Object.keys(groups)) {
      groups[code].sort((a: any, b: any) => {
        const numA = a.kode_unik.includes('-') ? parseInt(a.kode_unik.split('-')[1]) : 0
        const numB = b.kode_unik.includes('-') ? parseInt(b.kode_unik.split('-')[1]) : 0
        return numA - numB
      })
    }
    return groups
  }, [menus])

  // Menu form states
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [groupCode, setGroupCode] = useState('')
  const [namaMenu, setNamaMenu] = useState('')
  const [deskripsi, setDeskripsi] = useState('')
  const [harga, setHarga] = useState('')
  const [jamTutup, setJamTutup] = useState('')
  const [tipeForm, setTipeForm] = useState('standar')
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isNewGroup, setIsNewGroup] = useState(false)

  // Add-on form states
  const [isAddonDialogOpen, setIsAddonDialogOpen] = useState(false)
  const [isAddonEdit, setIsAddonEdit] = useState(false)
  const [addonEditId, setAddonEditId] = useState<string | null>(null)
  const [addonNama, setAddonNama] = useState('')
  const [addonHarga, setAddonHarga] = useState('')
  const [addonKategori, setAddonKategori] = useState('Minuman')

  const resetForm = () => {
    setGroupCode('')
    setNamaMenu('')
    setDeskripsi('')
    setHarga('')
    setJamTutup('')
    setTipeForm('standar')
    setFotoFile(null)
    setIsEditMode(false)
    setEditId(null)
    setIsNewGroup(false)
  }

  const getNextNumber = (baseCode: string) => {
    const items = groupedMenus[baseCode] || []
    let maxNum = 0
    items.forEach((item: any) => {
      if (item.kode_unik.includes('-')) {
        const num = parseInt(item.kode_unik.split('-')[1])
        if (num > maxNum) maxNum = num
      }
    })
    return maxNum + 1
  }

  const openNewGroup = () => {
    resetForm()
    setIsNewGroup(true)
    setIsDialogOpen(true)
  }

  const openAddToGroup = (baseCode: string) => {
    resetForm()
    setGroupCode(baseCode)
    const items = groupedMenus[baseCode]
    if (items && items.length > 0) {
      setJamTutup(items[0].jam_tutup || '')
      setTipeForm(items[0].tipe_form || 'standar')
    }
    setIsDialogOpen(true)
  }

  const openEditItem = (menu: any) => {
    let baseCode = menu.kode_unik
    if (baseCode.includes('-')) baseCode = baseCode.split('-')[0]
    setGroupCode(baseCode)
    setNamaMenu(menu.nama || '')
    setDeskripsi(menu.deskripsi || '')
    setHarga(menu.harga?.toString() || '')
    setJamTutup(menu.jam_tutup || '')
    setTipeForm(menu.tipe_form || 'standar')
    setFotoFile(null)
    setEditId(menu.id)
    setIsEditMode(true)
    setIsNewGroup(false)
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUploading(true)
    try {
      let fotoUrl: string | undefined = undefined
      if (fotoFile) {
        const fileExt = fotoFile.name.split('.').pop()
        const fileName = `${Date.now()}.${fileExt}`
        const { error: uploadErr } = await supabase.storage
          .from('kantin_assets').upload(`menus/${fileName}`, fotoFile)
        if (uploadErr) throw uploadErr
        const { data: pub } = supabase.storage.from('kantin_assets').getPublicUrl(`menus/${fileName}`)
        fotoUrl = pub.publicUrl
      }

      if (isEditMode && editId) {
        const menuData: any = {
          nama: namaMenu, deskripsi, harga: parseInt(harga),
          jam_tutup: jamTutup || null, tipe_form: tipeForm,
        }
        if (fotoUrl !== undefined) menuData.foto_url = fotoUrl
        const { data, error } = await supabase.from('kantin_menus').update(menuData).eq('id', editId).select().single()
        if (error) throw error
        setMenus(menus.map(m => m.id === editId ? data : m))
        alert("Menu berhasil diubah!")
      } else {
        const code = groupCode.toUpperCase()
        const num = getNextNumber(code)
        const kodeUnik = `${code}-${num}`
        const menuData: any = {
          kode_unik: kodeUnik, nama: namaMenu, deskripsi,
          harga: parseInt(harga), jam_tutup: jamTutup || null,
          tipe_form: tipeForm, foto_url: fotoUrl || null,
        }
        const { data, error } = await supabase.from('kantin_menus').insert([menuData]).select().single()
        if (error) throw error
        setMenus([...menus, data])
        alert(`Menu ditambahkan sebagai ${kodeUnik}!`)
      }
      setIsDialogOpen(false)
      resetForm()
    } catch (err: any) {
      alert("Gagal: " + (err.message || 'Error'))
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteMenu = async (id: string) => {
    if (!confirm('Yakin ingin menghapus menu ini?')) return
    await supabase.from('kantin_menus').delete().eq('id', id)
    setMenus(menus.filter(m => m.id !== id))
  }

  // Add-on CRUD
  const openAddAddon = () => {
    setAddonNama(''); setAddonHarga(''); setAddonKategori('Minuman'); setIsAddonEdit(false); setAddonEditId(null)
    setIsAddonDialogOpen(true)
  }
  const openEditAddon = (addon: any) => {
    setAddonNama(addon.nama); setAddonHarga(addon.harga?.toString() || ''); setAddonKategori(addon.kategori || 'Minuman')
    setIsAddonEdit(true); setAddonEditId(addon.id)
    setIsAddonDialogOpen(true)
  }
  const handleAddonSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const d = { nama: addonNama, harga: parseInt(addonHarga), kategori: addonKategori }
      if (isAddonEdit && addonEditId) {
        const { data, error } = await supabase.from('kantin_addons').update(d).eq('id', addonEditId).select().single()
        if (error) throw error
        setAddons(addons.map(a => a.id === addonEditId ? data : a))
        alert("Add-on berhasil diubah!")
      } else {
        const { data, error } = await supabase.from('kantin_addons').insert([d]).select().single()
        if (error) throw error
        setAddons([...addons, data])
        alert("Add-on berhasil ditambahkan!")
      }
      setIsAddonDialogOpen(false)
    } catch (err: any) {
      alert("Gagal: " + (err.message || 'Error'))
    }
  }
  const handleDeleteAddon = async (id: string) => {
    if (!confirm('Yakin ingin menghapus add-on ini?')) return
    await supabase.from('kantin_addons').delete().eq('id', id)
    setAddons(addons.filter(a => a.id !== id))
  }

  // Toggle Buka/Tutup Grup
  const toggleGroupActive = async (groupCode: string, items: any[]) => {
    const isCurrentlyActive = items.some(item => item.is_active !== false)
    const newStatus = !isCurrentlyActive
    
    if (!confirm(`Yakin ingin ${newStatus ? 'MEMBUKA' : 'MENUTUP'} grup ${groupCode}?`)) return
    
    const { error } = await supabase
      .from('kantin_menus')
      .update({ is_active: newStatus })
      .like('kode_unik', `${groupCode}%`)
      
    if (error) {
      alert("Gagal merubah status grup: " + error.message)
    } else {
      setMenus(menus.map(m => m.kode_unik.startsWith(groupCode) ? { ...m, is_active: newStatus } : m))
    }
  }

  // Copy WA Ganti Pesanan
  const copyWAGantiPesanan = async (groupCode: string) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data: orders, error } = await supabase
        .from('kantin_orders')
        .select(`*, kantin_profiles(nama, divisi), kantin_menus(nama, kode_unik)`)
        .eq('tanggal', today)
        .eq('status', 'pending')
        .like('kantin_menus.kode_unik', `${groupCode}%`)

      if (error) throw error

      // Need to filter locally because supabase like on joined table might not work as expected in some configurations
      const validOrders = orders?.filter(o => o.kantin_menus?.kode_unik?.startsWith(groupCode)) || []
      
      if (validOrders.length === 0) {
        alert("Tidak ada pesanan pending untuk grup ini hari ini.")
        return
      }

      // Group by divisi
      const byDivisi: Record<string, any[]> = {}
      validOrders.forEach(o => {
        const div = o.kantin_profiles?.divisi || 'Lainnya'
        if (!byDivisi[div]) byDivisi[div] = []
        byDivisi[div].push(o)
      })

      let waText = `*INFO PESANAN TUTUP*\nMohon maaf, menu dari warung *${groupCode}* sedang tutup. Mohon bantuannya untuk mengganti pesanan Anda:\n\n`
      
      Object.entries(byDivisi).forEach(([divisi, pesanan]) => {
        waText += `*DIVISI ${divisi.toUpperCase()}*\n`
        pesanan.forEach(p => {
          waText += `- ${p.kantin_profiles?.nama}: ${p.kantin_menus?.kode_unik} - ${p.kantin_menus?.nama}\n`
        })
        waText += `\n`
      })

      await navigator.clipboard.writeText(waText)
      
      const shouldCancel = confirm("Teks berhasil disalin ke clipboard!\n\nApakah Anda ingin MENGHAPUS otomatis pesanan-pesanan tersebut dan mengembalikan saldo mereka?")
      if (shouldCancel) {
        for (const order of validOrders) {
          const totalHarga = order.harga + order.harga_addon
          
          // 1. Hapus transaksi
          await supabase.from('kantin_transactions').delete().eq('order_id', order.id)
          
          // 2. Kembalikan saldo (ambil data live terbaru untuk amannya)
          const { data: profile } = await supabase.from('kantin_profiles').select('saldo').eq('id', order.profile_id).single()
          if (profile) {
            await supabase.from('kantin_profiles').update({ saldo: profile.saldo + totalHarga }).eq('id', order.profile_id)
          }
          
          // 3. Hapus pesanan
          await supabase.from('kantin_orders').delete().eq('id', order.id)
        }
        alert(`Berhasil menghapus ${validOrders.length} pesanan dan mengembalikan saldo mereka.`)
      }

    } catch (err: any) {
      alert("Gagal menyalin: " + (err.message || 'Error'))
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Menu Utama ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-700">🍽️ Menu Utama</h2>
          <Button onClick={openNewGroup} className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold text-sm">
            <PlusCircle className="h-4 w-4" /> Grup Baru
          </Button>
        </div>

        {Object.keys(groupedMenus).length === 0 ? (
          <Card><CardContent className="py-10 text-center text-slate-400">Belum ada menu. Klik "Grup Baru" untuk mulai.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedMenus).map(([code, items]) => {
              const isActive = items.some(item => item.is_active !== false)
              return (
              <Card key={code} className={`border-yellow-100 ${!isActive ? 'opacity-70' : ''}`}>
                <CardHeader className="bg-yellow-50/60 p-3 pb-2 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-sm font-bold text-yellow-800 font-mono">
                      {code} <span className="text-xs text-slate-500 font-normal ml-2">({items.length} item)</span>
                    </CardTitle>
                    {!isActive && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded">TUTUP</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyWAGantiPesanan(code)} className="h-7 text-xs gap-1 border-blue-200 text-blue-600 hover:bg-blue-50">
                      Copy WA Batal
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleGroupActive(code, items)} className={`h-7 text-xs gap-1 ${isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                      {isActive ? 'Tutup Grup' : 'Buka Grup'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openAddToGroup(code)} className="h-7 text-xs gap-1 bg-white">
                      <Plus className="h-3 w-3" /> Tambah Item
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="w-[40px] text-xs">No</TableHead>
                        <TableHead className="w-[55px] text-xs">Foto</TableHead>
                        <TableHead className="text-xs">Nama Menu</TableHead>
                        <TableHead className="text-xs w-[100px]">Harga</TableHead>
                        <TableHead className="text-xs w-[70px]">Jam</TableHead>
                        <TableHead className="text-xs w-[80px]">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((menu: any) => {
                        const num = menu.kode_unik.includes('-') ? menu.kode_unik.split('-')[1] : '1'
                        return (
                          <TableRow key={menu.id}>
                            <TableCell className="font-mono font-bold text-yellow-600 text-xs">{num}</TableCell>
                            <TableCell>
                              {menu.foto_url ? (
                                <img src={menu.foto_url} alt="" className="w-9 h-9 object-cover rounded border" />
                              ) : (
                                <div className="w-9 h-9 bg-slate-100 flex items-center justify-center rounded border text-slate-300">
                                  <ImageIcon className="h-4 w-4" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold text-sm">{menu.nama}</div>
                              {menu.deskripsi && <div className="text-xs text-slate-500">{menu.deskripsi}</div>}
                            </TableCell>
                            <TableCell className="font-medium text-sm">Rp {menu.harga.toLocaleString('id-ID')}</TableCell>
                            <TableCell>
                              {menu.jam_tutup ? (
                                <span className="text-red-500 font-semibold text-xs">{menu.jam_tutup.substring(0,5)}</span>
                              ) : <span className="text-slate-400 text-xs">-</span>}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => openEditItem(menu)}>
                                  <Edit className="h-3.5 w-3.5 text-blue-600" />
                                </Button>
                                <Button variant="destructive" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteMenu(menu.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add-ons ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-700">☕ Add-ons</h2>
          <Button onClick={openAddAddon} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm">
            <PlusCircle className="h-4 w-4" /> Tambah Add-on
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs">Nama Add-on</TableHead>
                  <TableHead className="text-xs w-[120px]">Kategori</TableHead>
                  <TableHead className="text-xs w-[120px]">Harga</TableHead>
                  <TableHead className="text-xs w-[80px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-slate-400 text-sm">Belum ada add-on.</TableCell>
                  </TableRow>
                ) : addons.map((addon: any) => (
                  <TableRow key={addon.id} className={addon.is_active === false ? 'opacity-50 grayscale' : ''}>
                    <TableCell className="font-semibold text-sm">
                      {addon.nama} 
                      {addon.is_active === false && <span className="ml-2 bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded">TUTUP</span>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      <span className="bg-slate-100 px-2 py-1 rounded border">{addon.kategori || 'Lainnya'}</span>
                    </TableCell>
                    <TableCell className="font-medium text-sm">Rp {addon.harga.toLocaleString('id-ID')}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className={`h-7 px-2 text-xs font-semibold ${addon.is_active === false ? 'text-green-600 hover:bg-green-50 border-green-200' : 'text-red-600 hover:bg-red-50 border-red-200'}`}
                          onClick={async () => {
                            const newStatus = addon.is_active === false ? true : false
                            if (!confirm(`Yakin ingin ${newStatus ? 'MEMBUKA' : 'MENUTUP'} add-on ${addon.nama}?`)) return
                            const { error } = await supabase.from('kantin_addons').update({ is_active: newStatus }).eq('id', addon.id)
                            if (!error) {
                              setAddons(addons.map(a => a.id === addon.id ? { ...a, is_active: newStatus } : a))
                            }
                          }}
                        >
                          {addon.is_active === false ? 'Buka' : 'Tutup'}
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => openEditAddon(addon)}>
                          <Edit className="h-3.5 w-3.5 text-blue-600" />
                        </Button>
                        <Button variant="destructive" size="sm" className="h-7 w-7 p-0" onClick={() => handleDeleteAddon(addon.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Menu Dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? 'Edit Menu' : isNewGroup ? 'Buat Grup Baru' : `Tambah Item ke ${groupCode}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3 mt-2">
            {isNewGroup && (
              <div className="grid gap-1.5">
                <Label className="text-xs font-bold">Kode Grup (Huruf Besar)</Label>
                <Input placeholder="Contoh: P.MERAH" value={groupCode} onChange={(e) => setGroupCode(e.target.value.toUpperCase())} required />
                <p className="text-[11px] text-slate-500">Kode unik otomatis: <b>{groupCode || '...'}-1</b></p>
              </div>
            )}
            {!isNewGroup && !isEditMode && (
              <div className="bg-yellow-50 border border-yellow-200 p-2.5 rounded text-xs font-bold text-yellow-800">
                Kode otomatis: {groupCode}-{getNextNumber(groupCode)}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs font-bold">Nama Makanan</Label>
              <Input placeholder="Nasi Rendang" value={namaMenu} onChange={(e) => setNamaMenu(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-bold">Deskripsi Singkat</Label>
              <Input placeholder="Isian makanan..." value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-bold">Harga (Rp)</Label>
                <Input type="number" placeholder="19000" value={harga} onChange={(e) => setHarga(e.target.value)} required />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-bold">Batas Jam</Label>
                <Input type="time" value={jamTutup} onChange={(e) => setJamTutup(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-bold">Tipe Form</Label>
              <select value={tipeForm} onChange={(e) => setTipeForm(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm">
                <option value="standar">Standar</option>
                <option value="warteg">Warteg</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-bold">Foto ({isEditMode ? 'Kosongkan jika tidak ubah' : 'Opsional'})</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] || null)} />
            </div>
            <Button type="submit" disabled={isUploading} className="w-full bg-yellow-500 hover:bg-yellow-600 font-bold">
              {isUploading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add-on Dialog ── */}
      <Dialog open={isAddonDialogOpen} onOpenChange={setIsAddonDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{isAddonEdit ? 'Edit Add-on' : 'Tambah Add-on Baru'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddonSubmit} className="space-y-3 mt-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-bold">Nama Add-on</Label>
              <Input placeholder="Es Teh Manis" value={addonNama} onChange={(e) => setAddonNama(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-bold">Harga (Rp)</Label>
              <Input type="number" placeholder="5000" value={addonHarga} onChange={(e) => setAddonHarga(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-bold">Kategori</Label>
              <select 
                value={addonKategori} 
                onChange={(e) => setAddonKategori(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm"
              >
                <option value="Minuman">Minuman</option>
                <option value="Buah">Buah</option>
                <option value="Kerupuk">Kerupuk</option>
                <option value="Lainnya">Lainnya</option>
                <option disabled>──────────</option>
                <option value="Warteg - Nasi">Warteg - Nasi</option>
                <option value="Warteg - Lauk">Warteg - Lauk</option>
                <option value="Warteg - Sayur">Warteg - Sayur</option>
              </select>
            </div>
            <Button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 font-bold">Simpan</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
