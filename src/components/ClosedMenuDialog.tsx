'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { AlertCircle, MessageCircle } from 'lucide-react'
import { buildLateReasonWaUrl, CLOSED_MENU_IMAGE, MenuClosedReason } from '@/lib/orderClient'

export interface ClosedMenuDialogTarget {
  menuName: string
  reason: Exclude<MenuClosedReason, null>
  jamTutup?: string | null
}

interface ClosedMenuDialogProps {
  target: ClosedMenuDialogTarget | null
  onClose: () => void
  userName: string
  userSaldo: number
  lateFeatureEnabled: boolean
}

export default function ClosedMenuDialog({
  target,
  onClose,
  userName,
  userSaldo,
  lateFeatureEnabled,
}: ClosedMenuDialogProps) {
  const [showWaForm, setShowWaForm] = useState(false)
  const [reasonText, setReasonText] = useState('')
  const [formError, setFormError] = useState('')

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setShowWaForm(false)
      setReasonText('')
      setFormError('')
      onClose()
    }
  }

  const handleSendWa = () => {
    const trimmed = reasonText.trim()
    if (trimmed.length < 5) {
      setFormError('Tulis alasan singkat minimal 5 karakter ya Kak.')
      return
    }
    if (!target) return

    const url = buildLateReasonWaUrl({
      userName: userName || 'Karyawan',
      menuName: target.menuName,
      jamTutup: target.jamTutup,
      reason: trimmed,
    })
    window.open(url, '_blank', 'noopener,noreferrer')
    handleOpenChange(false)
  }

  const isInactive = target?.reason === 'inactive'
  const jamLabel = target?.jamTutup ? ` (${target.jamTutup.substring(0, 5)} WIB)` : ''

  return (
    <Dialog open={!!target} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md w-[92vw] mx-auto rounded-2xl border-2 border-amber-200 bg-white p-5">
        <DialogHeader>
          <DialogTitle className="text-center text-amber-900 font-black text-base sm:text-lg">
            {isInactive ? 'Yah, Tokonya Lagi Tutup Nih Kak 😿🐾' : 'Yah, Udah Lewat Jam Tutup Nih Kak 😿🐾'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-center pt-1">
          <img
            src={CLOSED_MENU_IMAGE}
            alt="Kucing imut mengabari pesanan sedang tutup"
            className="max-h-52 w-auto rounded-xl object-cover shadow-md border-2 border-amber-200"
          />
        </div>

        <div className="py-2 text-center text-xs sm:text-sm text-slate-600 leading-relaxed space-y-2">
          {isInactive ? (
            <p>
              Menu <strong className="text-slate-800">{target?.menuName}</strong> sedang ditutup oleh Admin untuk hari ini.
              <br />
              Yuk pilih menu atau warung lain yang masih buka biar si meong gak ikutan sedih ya! 🍜💛
            </p>
          ) : (
            <p>
              Batas waktu pemesanan untuk <strong className="text-slate-800">{target?.menuName}</strong>
              {jamLabel} sudah lewat nih...
              <br />
              Yuk pilih menu lain yang jam tutupnya masih buka! 🍜✨
            </p>
          )}
        </div>

        {!isInactive && !lateFeatureEnabled && (
          <p className="text-[11px] text-center text-slate-400 italic">
            Layanan izin pesanan telat sedang dinonaktifkan oleh Admin.
          </p>
        )}

        {!isInactive && lateFeatureEnabled && showWaForm && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-2.5 text-left">
            {userSaldo <= 0 && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Saldomu saat ini Rp {userSaldo.toLocaleString('id-ID')}. Pastikan Top Up dulu agar bisa checkout jika diizinkan.</span>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-bold text-amber-900">
                Alasan Mendesak (Wajib Diisi)
              </Label>
              <Textarea
                value={reasonText}
                onChange={(e) => {
                  setReasonText(e.target.value)
                  if (formError) setFormError('')
                }}
                placeholder="Contoh: Baru selesai meeting / dinas luar..."
                className="bg-white border-amber-300 text-xs min-h-[68px]"
                maxLength={200}
              />
              {formError && <p className="text-[11px] font-semibold text-red-600">{formError}</p>}
            </div>

            <p className="text-[11px] text-slate-500 leading-snug">
              Setelah Mas Yana menyetujui &amp; mencentang namamu, akses pesan terbuka <strong>15 menit</strong> untuk <strong>1x checkout</strong>.
            </p>

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowWaForm(false)}
                className="text-xs font-semibold border-slate-200"
              >
                Batal
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSendWa}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                Kirim Alasan ke WA Mas Yana
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-col mt-1">
          <Button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="w-full font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl h-10"
          >
            {isInactive ? 'OK Mengerti' : 'Pilih Menu Lain'}
          </Button>

          {!isInactive && lateFeatureEnabled && !showWaForm && (
            <button
              type="button"
              onClick={() => setShowWaForm(true)}
              className="w-full text-center text-[11px] font-semibold text-slate-400 hover:text-amber-700 underline underline-offset-2 py-1 transition-colors"
            >
              Kondisi mendesak? Hubungi Mas Yana via WA untuk minta izin 15 menit
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
