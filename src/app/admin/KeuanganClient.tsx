'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { useAppDialog } from '@/components/AppDialogProvider'

export default function KeuanganClient({ profiles, recentOrders }: { profiles: any[], recentOrders: any[] }) {
  const { showAlert, showConfirm } = useAppDialog()
  // Sort users: those with recent orders first (by order recency), then alphabetical
  const sortedProfiles = useMemo(() => {
    return [...profiles].sort((a, b) => {
      const orderA = recentOrders.find(o => o.profile_id === a.id)
      const orderB = recentOrders.find(o => o.profile_id === b.id)
      if (orderA && !orderB) return -1
      if (!orderA && orderB) return 1
      if (orderA && orderB) {
        const idxA = recentOrders.indexOf(orderA)
        const idxB = recentOrders.indexOf(orderB)
        return idxA - idxB  // lower index = more recent
      }
      return a.nama.localeCompare(b.nama)
    })
  }, [profiles, recentOrders])

  const [users, setUsers] = useState(sortedProfiles)
  const [depositAmount, setDepositAmount] = useState('')
  const [history, setHistory] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  const filteredUsers = users.filter(user => 
    user.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (user.divisi && user.divisi.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const getFullOrderName = (order: any) => {
    if (!order) return '-'
    let str = order.kantin_menus?.nama || order.deskripsi_pesanan || ''
    if (order.deskripsi_pesanan && order.kantin_menus?.nama) {
      str += ` (${order.deskripsi_pesanan})`
    }
    if (order.addon_id) {
      str += ` + ${order.kantin_addons?.nama}`
      if (order.deskripsi_addon) {
        str += ` (${order.deskripsi_addon})`
      }
    }
    return str
  }

  const handleDeposit = async (userId: string, currentSaldo: number) => {
    const amount = parseInt(depositAmount)
    if (!amount || amount <= 0) {
      showAlert({ title: "Perhatian", message: "Masukkan jumlah deposit yang valid.", type: "warning" })
      return
    }

    const newSaldo = Number(currentSaldo) + amount
    
    // Optimistic UI
    setUsers(users.map(u => u.id === userId ? { ...u, saldo: newSaldo } : u))
    setDepositAmount('')

    // Update DB
    await supabase.from('kantin_profiles').update({ saldo: newSaldo }).eq('id', userId)
    await supabase.from('kantin_transactions').insert([{
      profile_id: userId,
      tipe: 'pemasukan',
      jumlah: amount,
      keterangan: 'Deposit Saldo'
    }])
    showAlert({ title: "Berhasil", message: "Deposit berhasil ditambahkan.", type: "success" })
  }

  const loadHistory = async (userId: string) => {
    const { data } = await supabase
      .from('kantin_transactions')
      .select('*')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false })
      .limit(15)
    
    setHistory(data || [])
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-semibold text-slate-700">Manajemen Saldo User</h2>
        <Input 
          placeholder="Cari nama atau divisi..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs h-9 text-sm"
        />
      </div>
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[180px]">Nama User</TableHead>
                <TableHead className="text-right w-[150px]">Saldo</TableHead>
                <TableHead className="w-[180px] text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-slate-500">Tidak ada user ditemukan.</TableCell>
                </TableRow>
              ) : (
                filteredUsers.map(user => {
                  return (
                    <TableRow key={user.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <div className="font-semibold text-sm text-slate-800">{user.nama}</div>
                        {user.divisi && <div className="text-xs text-slate-500">{user.divisi}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`font-bold text-sm ${user.saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          Rp {user.saldo.toLocaleString('id-ID')}
                        </div>
                      </TableCell>
                      <TableCell className="flex gap-2 justify-center">
                        <Dialog>
                          <DialogTrigger className="border border-slate-200 hover:bg-slate-100 text-xs h-8 px-3 rounded-md font-medium transition-colors">
                            Deposit
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Deposit untuk {user.nama}</DialogTitle>
                            </DialogHeader>
                            <div className="flex gap-2 mt-4">
                              <Input 
                                type="number" 
                                placeholder="Jumlah (Rp)" 
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                                className="text-sm"
                              />
                              <Button onClick={() => handleDeposit(user.id, user.saldo)} className="bg-yellow-500 hover:bg-yellow-600 font-bold">Top Up</Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button 
                          variant="outline" 
                          size="sm"
                          className="text-xs h-8 px-3 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={async () => {
                            const proceed = await showConfirm({
                              title: "Reset PIN",
                              message: `Yakin ingin mereset PIN untuk ${user.nama} menjadi 00000?`,
                              confirmText: "Ya, Reset PIN",
                              variant: "destructive"
                            })
                            if (proceed) {
                              await supabase.from('kantin_profiles').update({ pin: '00000' }).eq('id', user.id)
                              showAlert({ title: "Berhasil", message: `PIN ${user.nama} telah direset menjadi 00000.`, type: "success" })
                            }
                          }}
                        >
                          Reset PIN
                        </Button>

                        <Dialog>
                          <DialogTrigger onClick={() => loadHistory(user.id)} className="bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs h-8 px-3 rounded-md font-medium transition-colors">
                            History
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>History Transaksi - {user.nama}</DialogTitle>
                            </DialogHeader>
                            <div className="mt-4 space-y-3">
                              {history.length === 0 ? (
                                <p className="text-sm text-slate-500 italic text-center py-4">Belum ada transaksi.</p>
                              ) : (
                                history.map(tx => (
                                  <div key={tx.id} className="flex justify-between items-center p-3 rounded-md border border-slate-100 bg-slate-50">
                                    <div>
                                      <div className="text-xs text-slate-500 mb-1">
                                        {format(new Date(tx.created_at), 'dd MMM yyyy, HH:mm', { locale: id })}
                                      </div>
                                      <div className="text-sm font-semibold text-slate-700 leading-tight">
                                        {tx.keterangan}
                                      </div>
                                    </div>
                                <div className={`font-bold text-sm whitespace-nowrap ${tx.tipe === 'pengeluaran' ? 'text-red-500' : 'text-green-500'}`}>
                                  {tx.tipe === 'pengeluaran' ? '-' : '+'} Rp {tx.jumlah.toLocaleString('id-ID')}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              )
            })
          )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </div>
  )
}
