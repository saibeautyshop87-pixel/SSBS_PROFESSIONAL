import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const digits = (value: unknown) => String(value || '').replace(/\D/g, '').slice(-10)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  try {
    const body = await req.json()
    const orderNumber = String(body.orderNumber || '').trim().toUpperCase().slice(0, 40)
    const phone = digits(body.phone)
    const reason = String(body.reason || '').trim().slice(0, 120)
    const details = String(body.details || '').trim().slice(0, 1000)
    if (!orderNumber || phone.length < 10 || !reason) throw new Error('Please enter the order number, mobile number and return reason.')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: order } = await admin.from('orders').select('id,order_number,phone,status').eq('order_number', orderNumber).limit(1).maybeSingle()
    if (!order || digits(order.phone) !== phone) throw new Error('We could not verify this order number and mobile number.')
    if (order.status !== 'delivered') throw new Error('A return request can be submitted only after the order is delivered.')
    const { error } = await admin.from('return_requests').insert({ order_id: order.id, order_number: order.order_number, phone, reason, details })
    if (error?.code === '23505') throw new Error('A return request already exists for this order.')
    if (error) throw error
    return Response.json({ success: true, message: 'Your return request has been submitted for review.' }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to submit the return request.' }, { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
