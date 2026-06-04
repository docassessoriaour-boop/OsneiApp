import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://aeaqqhblkhiqegjubszj.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlYXFxaGJsa2hpcWVnanVic3pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODQ1OTYsImV4cCI6MjA5MTI2MDU5Nn0.YR7V0sGV7LZANsbA8UnNAgsz1fuWg4LZk3h80tJj2Ag'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  console.log('Testing categories...');
  const { data: catData, error: catErr } = await supabase.from('transaction_categories').select('*').limit(1);
  console.log(catErr || catData);

  console.log('Testing entities...');
  const { data: entData, error: entErr } = await supabase.from('entities').select('*').limit(1);
  console.log(entErr || entData);

  console.log('Testing products...');
  const { data: prodData, error: prodErr } = await supabase.from('products').select('*').limit(1);
  console.log(prodErr || prodData);

  console.log('Testing bills...');
  const { data: billsData, error: billsErr } = await supabase.from('bills').select('*').limit(1);
  console.log(billsErr || billsData);
}

test()
