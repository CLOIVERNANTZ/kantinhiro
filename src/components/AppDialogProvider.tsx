'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type AlertOptions = {
  title: string
  message: string
  type?: 'info' | 'error' | 'success' | 'warning'
  imageUrl?: string
  imageAlt?: string
}
type ConfirmOptions = {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
  imageUrl?: string
  imageAlt?: string
}

type AppDialogContextType = {
  showAlert: (options: AlertOptions) => void
  showConfirm: (options: ConfirmOptions) => Promise<boolean>
}

const AppDialogContext = createContext<AppDialogContextType | null>(null)

export const useAppDialog = () => {
  const context = useContext(AppDialogContext)
  if (!context) throw new Error('useAppDialog must be used within AppDialogProvider')
  return context
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertConfig, setAlertConfig] = useState<AlertOptions | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<ConfirmOptions | null>(null)
  
  // Ref to store the resolve function for the Promise
  const confirmResolveRef = React.useRef<((value: boolean) => void) | null>(null)

  const showAlert = (options: AlertOptions) => {
    setAlertConfig(options)
    setAlertOpen(true)
  }

  const showConfirm = (options: ConfirmOptions): Promise<boolean> => {
    setConfirmConfig(options)
    setConfirmOpen(true)
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve
    })
  }

  const handleConfirmClose = (result: boolean) => {
    setConfirmOpen(false)
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result)
    }
  }

  return (
    <AppDialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      
      {/* Alert Dialog */}
      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent className="sm:max-w-md w-[90vw] mx-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className={`${alertConfig?.imageUrl ? 'text-center ' : ''}${alertConfig?.type === 'error' ? 'text-red-600' : alertConfig?.type === 'warning' ? 'text-yellow-600' : alertConfig?.type === 'success' ? 'text-green-600' : 'text-blue-600'}`}>
              {alertConfig?.title}
            </DialogTitle>
          </DialogHeader>
          {alertConfig?.imageUrl && (
            <div className="flex justify-center pt-1">
              <img
                src={alertConfig.imageUrl}
                alt={alertConfig.imageAlt || 'Ilustrasi'}
                className="max-h-56 w-auto rounded-xl object-cover shadow-md border-2 border-yellow-200"
              />
            </div>
          )}
          <div className={`py-3 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed ${alertConfig?.imageUrl ? 'text-center' : ''}`}>
            {alertConfig?.message}
          </div>
          <DialogFooter>
            <Button onClick={() => setAlertOpen(false)} className="w-full sm:w-auto font-bold bg-yellow-500 hover:bg-yellow-600 text-white">OK Mengerti</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) handleConfirmClose(false) }}>
        <DialogContent className="sm:max-w-md w-[90vw] mx-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className={confirmConfig?.imageUrl ? 'text-center text-yellow-700' : ''}>
              {confirmConfig?.title}
            </DialogTitle>
          </DialogHeader>
          {confirmConfig?.imageUrl && (
            <div className="flex justify-center pt-1">
              <img
                src={confirmConfig.imageUrl}
                alt={confirmConfig.imageAlt || 'Ilustrasi'}
                className="max-h-56 w-auto rounded-xl object-cover shadow-md border-2 border-yellow-200"
              />
            </div>
          )}
          <div className={`py-3 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed ${confirmConfig?.imageUrl ? 'text-center' : ''}`}>
            {confirmConfig?.message}
          </div>
          <DialogFooter className={`flex flex-col-reverse sm:flex-row gap-2 mt-2 ${confirmConfig?.imageUrl ? 'sm:justify-center' : 'sm:justify-end'}`}>
            <Button variant="outline" onClick={() => handleConfirmClose(false)} className="w-full sm:w-auto font-bold border-slate-200">
              {confirmConfig?.cancelText || 'Batal'}
            </Button>
            <Button 
              variant={confirmConfig?.variant === 'destructive' ? 'destructive' : 'default'} 
              onClick={() => handleConfirmClose(true)} 
              className={`w-full sm:w-auto font-bold ${confirmConfig?.variant !== 'destructive' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : ''}`}
            >
              {confirmConfig?.confirmText || 'Ya, Lanjutkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppDialogContext.Provider>
  )
}
