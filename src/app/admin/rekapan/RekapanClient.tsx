'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Copy } from 'lucide-react'

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

export default function RekapanClient({ initialOrders }: { initialOrders: any[] }) {
  const [orders, setOrders] = useState(initialOrders)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value
    setSelectedDate(newDate)
    
    const { data: newOrders } = await supabase
      .from('kantin_orders')
      .select(`
        id, deskripsi_pesanan, deskripsi_addon, harga, harga_addon, status, is_recap_checked, menu_id, addon_id, profile_id,
        kantin_profiles(nama),
        kantin_menus(nama, kode_unik),
        kantin_addons(nama)
      `)
      .eq('tanggal', newDate)
      
    if (newOrders) {
      setOrders(newOrders)
    }
  }

  // Sort and group logic
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      if (a.is_recap_checked === b.is_recap_checked) {
        const codeA = a.kantin_menus?.kode_unik || 'ZZZ'
        const codeB = b.kantin_menus?.kode_unik || 'ZZZ'
        return codeA.localeCompare(codeB)
      }
      return a.is_recap_checked ? 1 : -1
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

  const handleCopyWA = () => {
    let text = "*REKAPAN PESANAN HARI INI*\n\n"
    
    const grouped: Record<string, any[]> = {}
    orders.forEach(o => {
      let code = o.kantin_menus?.kode_unik || 'Lainnya'
      if (code.includes('-')) code = code.split('-')[0]
      if (!grouped[code]) grouped[code] = []
      grouped[code].push(o)
    })

    for (const [code, items] of Object.entries(grouped)) {
      text += `*[${code}]*\n`
      items.forEach(i => {
        const menuName = i.kantin_menus?.nama || 'Menu Custom'
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <label className="text-sm font-bold text-slate-700">Pilih Tanggal:</label>
          <Input 
            type="date" 
            value={selectedDate}
            onChange={handleDateChange}
            className="h-9 font-bold text-yellow-800 bg-yellow-50 border-yellow-200"
          />
        </div>
        <Button onClick={handleCopyWA} variant="outline" className="flex gap-2 font-bold text-slate-700">
          <Copy className="h-4 w-4" /> Copy for WhatsApp
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[50px] text-center text-xs">✔</TableHead>
                <TableHead className="w-[80px] text-xs">Grup</TableHead>
                <TableHead className="w-[120px] text-xs">Pemesan</TableHead>
                <TableHead className="text-xs">Pesanan</TableHead>
                <TableHead className="w-[130px] text-right text-xs">Harga Menu</TableHead>
                <TableHead className="w-[130px] text-right text-xs">Harga Addon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500 text-sm">
                    Tidak ada pesanan hari ini.
                  </TableCell>
                </TableRow>
              ) : (
                sortedOrders.map((order) => {
                  const isChecked = order.is_recap_checked
                  let baseCode = order.kantin_menus?.kode_unik || '-'
                  if (baseCode.includes('-')) baseCode = baseCode.split('-')[0]

                  return (
                    <TableRow key={order.id} className={isChecked ? 'bg-slate-100 opacity-60' : 'hover:bg-slate-50/50'}>
                      <TableCell className="text-center">
                        <Checkbox 
                          checked={isChecked} 
                          onCheckedChange={() => toggleCheck(order.id, isChecked)} 
                        />
                      </TableCell>
                      <TableCell className="font-mono font-bold text-yellow-600 text-xs">
                        {baseCode}
                      </TableCell>
                      <TableCell className="font-semibold text-xs text-slate-800">
                        {order.kantin_profiles?.nama}
                      </TableCell>
                      <TableCell className="leading-tight">
                        <span className="text-xs font-medium text-slate-700">
                          {order.kantin_menus?.nama}
                        </span>
                        {order.deskripsi_pesanan && (
                          <span className="text-[11px] text-slate-600 italic ml-1">
                            ({order.deskripsi_pesanan})
                          </span>
                        )}
                        {order.addon_id && (
                          <span className="text-[11px] font-semibold text-blue-600 ml-1">
                            + {order.kantin_addons?.nama} {order.deskripsi_addon ? `(${order.deskripsi_addon})` : ''}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <PriceCell 
                          initialValue={order.harga} 
                          isChecked={isChecked} 
                          onSave={(newVal) => handlePriceUpdate(order.id, 'harga', newVal)} 
                        />
                      </TableCell>
                      <TableCell>
                        {order.addon_id ? (
                          <PriceCell 
                            initialValue={order.harga_addon || 0} 
                            isChecked={isChecked} 
                            onSave={(newVal) => handlePriceUpdate(order.id, 'harga_addon', newVal)} 
                          />
                        ) : (
                          <div className="text-center text-slate-400">-</div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
            <TableFooter className="bg-slate-100 font-bold">
              <TableRow>
                <TableCell colSpan={4} className="text-right py-3 text-sm">Total Omset Rekapan Hari Ini:</TableCell>
                <TableCell colSpan={2} className="text-right py-3 text-sm text-yellow-700">
                  Rp {sortedOrders.reduce((sum, o) => sum + Number(o.harga) + Number(o.harga_addon || 0), 0).toLocaleString('id-ID')}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
