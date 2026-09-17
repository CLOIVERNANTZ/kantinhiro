import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function seed() {
  console.log("Menghapus data menu lama (jika ada)...")
  await supabase.from('kantin_menus').delete().neq('id', '00000000-0000-0000-0000-000000000000') // Hapus semua

  console.log("Memasukkan Menu Padang Merah...")
  const { error: menuErr } = await supabase.from('kantin_menus').insert([
    { kode_unik: 'P.MERAH-1', nama: 'Nasi Ayam Bakar/Goreng', deskripsi: 'Nasi Padang + Ayam (Bakar/Goreng)', harga: 19000, tipe_form: 'standar', jam_tutup: '11:00:00' },
    { kode_unik: 'P.MERAH-2', nama: 'Nasi Rendang', deskripsi: 'Nasi Padang + Rendang Daging', harga: 19000, tipe_form: 'standar', jam_tutup: '11:00:00' },
    { kode_unik: 'P.MERAH-3', nama: 'Nasi Ayam + Telur', deskripsi: 'Nasi Padang + Ayam + Telur Dadar/Bulat', harga: 24000, tipe_form: 'standar', jam_tutup: '11:00:00' },
    { kode_unik: 'P.MERAH-4', nama: 'Nasi Ayam + Perkedel', deskripsi: 'Nasi Padang + Ayam + Perkedel Kentang', harga: 24000, tipe_form: 'standar', jam_tutup: '11:00:00' },
    { kode_unik: 'P.MERAH-5', nama: 'Nasi Telur', deskripsi: 'Nasi Padang + Telur Dadar/Bulat', harga: 13000, tipe_form: 'standar', jam_tutup: '11:00:00' },
    { kode_unik: 'P.MERAH-6', nama: 'Nasi Telur + Perkedel', deskripsi: 'Nasi Padang + Telur + Perkedel', harga: 18000, tipe_form: 'standar', jam_tutup: '11:00:00' },
    
    // Tambahan untuk testing
    { kode_unik: 'SA-1', nama: 'Sate Ayam Madura', deskripsi: 'Sate ayam 10 tusuk bumbu kacang', harga: 15000, tipe_form: 'standar', jam_tutup: '10:00:00' },
    { kode_unik: 'WT-1', nama: 'Nasi Warteg', deskripsi: 'Pilih nasi, lauk, dan sayur kesukaanmu', harga: 15000, tipe_form: 'warteg', jam_tutup: '09:00:00' }
  ])

  if (menuErr) console.error("Error menu:", menuErr)

  console.log("Memasukkan Addons...")
  const { error: addErr } = await supabase.from('kantin_addons').upsert([
    { nama: 'Es Teh Manis', kategori: 'minuman', harga: 3000 },
    { nama: 'Kerupuk Putih', kategori: 'kerupuk', harga: 1000 },
  ], { onConflict: 'nama' }) // Addons table currently doesn't have unique on nama, might fail if constraint doesn't exist.
  // Actually I'll just delete and insert
  
  await supabase.from('kantin_addons').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('kantin_addons').insert([
    { nama: 'Es Teh Manis', kategori: 'minuman', deskripsi: 'Es teh manis segar', harga: 3000 },
    { nama: 'Es Jeruk', kategori: 'minuman', deskripsi: 'Es jeruk peras', harga: 4000 },
    { nama: 'Semangka', kategori: 'buah', deskripsi: 'Potongan buah semangka segar', harga: 2000 },
    { nama: 'Kerupuk Putih', kategori: 'kerupuk', deskripsi: 'Kerupuk kaleng bulat', harga: 1000 },
    { nama: 'Kerupuk Udang', kategori: 'kerupuk', deskripsi: 'Kerupuk udang renyah', harga: 2000 }
  ])

  console.log("Memasukkan Profiles...")
  await supabase.from('kantin_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  const { error: profErr } = await supabase.from('kantin_profiles').insert([
    { nama: 'Budi', divisi: 'Engineering', saldo: 50000 },
    { nama: 'Siti', divisi: 'Marketing', saldo: -15000 },
    { nama: 'Andi', divisi: 'HRD', saldo: 0 }
  ])

  if (profErr) console.error("Error profiles:", profErr)

  console.log("Seeding selesai!")
}

seed()
