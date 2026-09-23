import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Coffee, Settings, FileText, LayoutDashboard, UtensilsCrossed } from "lucide-react";
import Greeting from "@/components/Greeting";
import AdminNav from "@/components/AdminNav";
import { AppDialogProvider } from "@/components/AppDialogProvider";
import GlobalOrderToaster from "@/components/GlobalOrderToaster";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
});

export const metadata: Metadata = {
  title: "Kantin Suryana",
  description: "Aplikasi Kantin Hiro",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${nunito.variable} h-full antialiased font-sans`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <AppDialogProvider>
          <header className="bg-white border-b border-yellow-200 sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 text-yellow-600 hover:text-yellow-700 transition-colors">
                <Coffee className="h-6 w-6" />
                <span className="font-bold text-xl">Kantin Hiro</span>
              </Link>

              <div className="hidden md:block">
                <Greeting />
              </div>
              
              <nav className="flex items-center gap-6">
                <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-yellow-600 flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4" />
                  <span>Pemesanan</span>
                </Link>
                <Link href="/menu" className="text-sm font-semibold text-slate-600 hover:text-yellow-600 flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Menu</span>
                </Link>
                <AdminNav />
              </nav>
            </div>
          </header>
          
          <main className="flex-1 container mx-auto px-4 py-8">
            {children}
          </main>
          <GlobalOrderToaster />
        </AppDialogProvider>
      </body>
    </html>
  );
}
