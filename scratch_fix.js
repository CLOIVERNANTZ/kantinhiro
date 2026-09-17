const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fix() {
  // Fetch all transactions with an order_id
  const { data: txs, error: txErr } = await supabase
    .from('kantin_transactions')
    .select('*, kantin_orders(*, kantin_menus(nama), kantin_addons(nama))')
    .not('order_id', 'is', null);

  if (txErr) {
    console.error(txErr);
    return;
  }

  console.log(`Found ${txs.length} transactions to update`);

  for (const tx of txs) {
    const order = tx.kantin_orders;
    if (!order) continue;

    let str = order.kantin_menus?.nama || order.deskripsi_pesanan || 'Pesanan';
    if (order.deskripsi_pesanan && order.kantin_menus?.nama) {
      str += ` (${order.deskripsi_pesanan})`;
    }
    if (order.addon_id) {
      str += ` + ${order.kantin_addons?.nama}`;
      if (order.deskripsi_addon) {
        str += ` (${order.deskripsi_addon})`;
      }
    }

    if (tx.keterangan !== str) {
      console.log(`Updating TX ${tx.id} from "${tx.keterangan}" to "${str}"`);
      await supabase.from('kantin_transactions').update({ keterangan: str }).eq('id', tx.id);
    }
  }
  console.log("Done updating!");
}

fix();
