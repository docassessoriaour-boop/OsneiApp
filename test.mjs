import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://aeaqqhblkhiqegjubszj.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlYXFxaGJsa2hpcWVnanVic3pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODQ1OTYsImV4cCI6MjA5MTI2MDU5Nn0.YR7V0sGV7LZANsbA8UnNAgsz1fuWg4LZk3h80tJj2Ag'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { error: err1 } = await supabase.from('products').insert({ estoqueMinimo: 0 });
  console.log('estoqueMinimo:', err1?.message);

  const { error: err2 } = await supabase.from('products').insert({ estoque_minimo: 0 });
  console.log('estoque_minimo:', err2?.message);
}

test()
