'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import * as pdfjsLib from 'pdfjs-dist'

// Worker setup needed for pdf.js in browser
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

interface MutasiItem {
  tanggal: string
  keterangan: string
  nominal: number
  matchedProfile?: any // if 3 digits match a user
  status: 'new' | 'already_processed' | 'ready' | 'processing' | 'done' | 'error'
  errorMsg?: string
}

export default function PdfTopupManager({ profiles }: { profiles: any[] }) {
  const [loading, setLoading] = useState(false)
  const [mutasiList, setMutasiList] = useState<MutasiItem[]>([])
  // Debounce: require second click within 3s to confirm Approve
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      
      const foundItems: MutasiItem[] = []

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        
        const items = content.items.map((item: any) => item.str.trim()).filter((str: string) => str.length > 0)

        // Iterate through all text chunks looking for BCA currency format
        for (let j = 0; j < items.length; j++) {
          let str = items[j]
          
          // Kadang string gabung dengan CR: "30,001.00 CR"
          if (str.endsWith(' CR') || str.endsWith(' DB')) {
            str = str.substring(0, str.length - 3).trim()
          }

          // Regex supports both "30.001,00" and "30,001.00"
          if (/^\d{1,3}(?:[.,]\d{3})*[.,]\d{2}$/.test(str)) {
            // Remove ALL non-digits (dots, commas). Example: "30,001.00" -> "3000100"
            const onlyDigits = str.replace(/\D/g, '')
            // Divide by 100 because we know there are exactly 2 decimals at the end
            const nominal = Math.floor(parseInt(onlyDigits, 10) / 100)

            if (nominal > 0) {
              const nominalStrFull = nominal.toString()
              const last3 = nominalStrFull.slice(-3)
              
              const profile = profiles.find(p => {
                if (!p.kode_unik_topup) return false
                const pCode = p.kode_unik_topup.toString().padStart(3, '0')
                return last3 === pCode
              })

              if (profile) {
                // We found a matching amount!
                // Try to grab some context. Walk backwards from j-1 up to j-15.
                // Stop if we hit another monetary amount or a known date boundary to avoid mixing transactions.
                const rawContextItems: string[] = []
                for (let k = j - 1; k >= Math.max(0, j - 15); k--) {
                  const c = items[k]
                  // If we hit another amount like 50,000.00, stop grabbing!
                  if (/^\d{1,3}(?:[.,]\d{3})*[.,]\d{2}$/.test(c)) break
                  rawContextItems.unshift(c)
                }

                // Coba cari "DD/MM" (standar BCA)
                let dateStr = 'PDF'
                const exactDate = rawContextItems.find(c => /^\d{2}\/\d{2}$/.test(c))
                if (exactDate) {
                  dateStr = exactDate
                } else if (rawContextItems.includes('PEND')) {
                  // Coba cari pola "2209/" dalam keterangan yang berarti 22 Sept
                  const descDate = rawContextItems.find(c => /^\d{4}\//.test(c))
                  if (descDate) {
                    const d = descDate.substring(0, 4) // "2209"
                    dateStr = `${d.substring(0,2)}/${d.substring(2,4)} (PEND)` // "22/09 (PEND)"
                  } else {
                    dateStr = 'PEND'
                  }
                }

                // Clean up context strings: remove BCA boilerplate and very long strings
                const cleanContext = rawContextItems.filter(c => {
                  const upper = c.trim().toUpperCase()
                  // Known huge paragraph fragments
                  if (upper.includes('APABILA NASABAH')) return false
                  if (upper.includes('BCA BERHAK')) return false
                  if (upper.includes('TERCANTUM PADA')) return false
                  
                  // Standalone header words that pdfjs splits
                  const badWords = ['MATA UANG', 'IDR', ': IDR', 'CATATAN:', 'REKENING', 'TANGGAL', 'KETERANGAN', 'MUTASI', 'HALAMAN', 'PEND', ':', 'DB', 'CR']
                  if (badWords.includes(upper)) return false
                  
                  if (c.length > 80) return false // Ignore huge paragraphs
                  return true
                })

                const descStr = cleanContext.join(' ').trim()

                foundItems.push({
                  tanggal: dateStr,
                  keterangan: descStr,
                  nominal,
                  matchedProfile: profile,
                  status: 'new'
                })
              }
            }
          }
        }
      }

      // Remove exact duplicates from parsing
      const unique = foundItems.filter((v, idx, a) => a.findIndex(t => (t.nominal === v.nominal && t.matchedProfile.id === v.matchedProfile.id)) === idx)
      checkDatabaseForProcessed(unique)
    } catch (err) {
      console.error(err)
      alert("Gagal membaca PDF. Pastikan file valid PDF Mutasi BCA.")
    } finally {
      setLoading(false)
    }
  }

  const checkDatabaseForProcessed = async (list: MutasiItem[]) => {
    if (list.length === 0) {
      setMutasiList([])
      alert("Tidak ada setoran masuk yang cocok dengan kode unik user ditemukan dalam PDF ini.")
      return
    }
    
    const newList = [...list]
    for (let i = 0; i < newList.length; i++) {
      const item = newList[i]
      const { data } = await supabase
        .from('kantin_mutasi_bca')
        .select('id')
        .eq('tanggal_mutasi', item.tanggal)
        .eq('keterangan', item.keterangan)
        .eq('nominal', item.nominal)
        .maybeSingle()
        
      if (data) {
        item.status = 'already_processed'
      } else {
        item.status = 'ready'
      }
    }
    setMutasiList(newList)
  }

  const handleApprove = async (index: number) => {
    const item = mutasiList[index]
    if (item.status !== 'ready') return

    // Update UI status
    const newList = [...mutasiList]
    newList[index].status = 'processing'
    setMutasiList(newList)

    try {
      // Call RPC
      const { data, error } = await supabase.rpc('process_topup_mutasi', {
        p_profile_id: item.matchedProfile.id,
        p_nominal: item.nominal,
        p_tanggal_mutasi: item.tanggal,
        p_keterangan: item.keterangan
      })

      if (error) throw error

      // If successful, clear their request flag automatically just in case
      await supabase.from('kantin_profiles').update({ is_requesting_topup: false }).eq('id', item.matchedProfile.id)

      newList[index].status = 'done'
    } catch (err: any) {
      console.error(err)
      newList[index].status = 'error'
      newList[index].errorMsg = err.message
    }
    setMutasiList(newList)
  }

  // Two-click confirmation: first click arms it, second click within 3s fires it
  const handleApproveClick = (idx: number) => {
    if (confirmingIndex === idx) {
      // Second click — execute
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirmingIndex(null)
      handleApprove(idx)
    } else {
      // First click — arm with 3s timeout
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      setConfirmingIndex(idx)
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingIndex(null)
      }, 3000)
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Top Up Alerts / Pengingat */}
      {profiles.filter(p => p.is_requesting_topup).length > 0 && (
        <Card className="border-red-300 shadow-md animate-pulse border-2">
          <CardHeader className="bg-red-50 py-3">
            <CardTitle className="text-red-700 text-sm flex items-center gap-2">
              <span className="text-lg">🚨</span> Notifikasi Transfer User!
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 bg-white">
            <p className="text-xs text-slate-600 mb-3">User berikut mengklaim sudah transfer namun saldo belum masuk. Anda bisa baca PDF Mutasi, atau Proses Manual.</p>
            <div className="flex gap-2 flex-wrap">
              {profiles.filter(p => p.is_requesting_topup).map(p => (
                <div key={p.id} className="bg-red-100 text-red-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-2 border border-red-200">
                  <span>{p.nama}</span>
                  <div className="flex items-center gap-1 ml-2 border-l border-red-300 pl-2">
                    <button 
                      className="text-green-700 hover:text-green-900 bg-green-200 px-2 py-0.5 rounded text-[10px]"
                      onClick={async () => {
                        const val = prompt(`Masukkan nominal Top Up MANUAL untuk ${p.nama} (tanpa titik, misal 50000):`)
                        const nominal = parseInt(val || '0')
                        if (nominal > 0) {
                          try {
                            const { error } = await supabase.rpc('process_topup_mutasi', {
                              p_profile_id: p.id,
                              p_nominal: nominal,
                              p_tanggal_mutasi: new Date().toISOString().split('T')[0],
                              p_keterangan: 'Top Up Manual / Auto'
                            })
                            if (error) throw error
                            await supabase.from('kantin_profiles').update({ is_requesting_topup: false }).eq('id', p.id)
                            alert(`Berhasil Top Up Rp ${nominal.toLocaleString('id-ID')} ke ${p.nama}`)
                            window.location.reload()
                          } catch (e: any) {
                            alert("Gagal memproses manual: " + e.message)
                          }
                        }
                      }}
                      title="Proses Manual (Tanpa PDF)"
                    >
                      Proses Manual
                    </button>
                    <button 
                      className="text-red-500 hover:text-red-900 px-1 bg-red-200 rounded"
                      onClick={async () => {
                        await supabase.from('kantin_profiles').update({ is_requesting_topup: false }).eq('id', p.id)
                        alert(`Pengingat disembunyikan. Refresh halaman.`)
                      }}
                      title="Abaikan Pengingat"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top-Up Otomatis via PDF Mutasi BCA</CardTitle>
          <CardDescription>
            Upload file PDF hasil download dari KlikBCA. Sistem akan otomatis mencari transfer dengan 3 digit unik yang cocok dengan user.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input 
            type="file" 
            accept="application/pdf" 
            onChange={handleFileUpload} 
            disabled={loading}
          />
          {loading && <p className="text-sm mt-2 text-yellow-600 animate-pulse">Sedang membaca PDF...</p>}
        </CardContent>
      </Card>

      {mutasiList.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold text-sm text-slate-700">Ditemukan {mutasiList.length} Kecocokan</h3>
          {mutasiList.map((item, idx) => (
            <div key={idx} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border-l-4 border-y border-r shadow-sm ${item.status === 'ready' ? 'border-l-yellow-500 bg-white border-slate-200' : item.status === 'done' ? 'border-l-green-500 bg-green-50 border-green-100' : item.status === 'already_processed' ? 'border-l-slate-300 bg-slate-50 border-slate-200' : 'border-l-red-500 bg-red-50 border-red-200'}`}>
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-base text-slate-800">Rp {item.nominal.toLocaleString('id-ID')}</span>
                  <select 
                    className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold border border-yellow-300 outline-none max-w-[120px]"
                    value={item.matchedProfile.id}
                    onChange={(e) => {
                      const selectedProfile = profiles.find(p => p.id === e.target.value)
                      if (selectedProfile) {
                        const newList = [...mutasiList]
                        newList[idx].matchedProfile = selectedProfile
                        setMutasiList(newList)
                      }
                    }}
                    disabled={item.status !== 'ready'}
                  >
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight line-clamp-2" title={item.keterangan}>
                  {item.tanggal} - {item.keterangan}
                </p>
                {item.errorMsg && <p className="text-[10px] text-red-600 mt-0.5 font-semibold">{item.errorMsg}</p>}
              </div>
              <div className="mt-2 sm:mt-0 shrink-0">
                {item.status === 'ready' && (
                  <Button 
                    size="sm"
                    className={`font-bold h-7 text-[11px] px-3 w-full sm:w-auto transition-all ${confirmingIndex === idx ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-yellow-500 hover:bg-yellow-600'}`}
                    onClick={() => handleApproveClick(idx)}
                  >
                    {confirmingIndex === idx ? '⚠️ Klik lagi untuk konfirmasi' : 'Approve'}
                  </Button>
                )}
                {item.status === 'processing' && (
                  <Button size="sm" disabled className="bg-yellow-500 font-bold h-7 text-[11px] px-3 w-full sm:w-auto animate-pulse">
                    Memproses...
                  </Button>
                )}
                {(item.status === 'already_processed' || item.status === 'done') && (
                  <Button size="sm" disabled className="bg-green-600 font-bold h-7 text-[11px] px-3 w-full sm:w-auto opacity-100 cursor-not-allowed">
                    Approved
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
