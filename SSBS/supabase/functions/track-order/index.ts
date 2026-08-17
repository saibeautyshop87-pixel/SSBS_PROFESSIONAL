import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { orderNumber, phone } = await req.json()
    if (!orderNumber || !phone) throw new Error('Order number and phone are required.')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const orderQuery = (columns: string) => admin.from('orders').select(columns).eq('order_number', String(orderNumber).trim().toUpperCase()).eq('phone', String(phone).replace(/[^0-9+]/g, '')).maybeSingle()
    let { data, error } = await orderQuery('id,order_number,status,courier,awb,tracking_url,payment_status,payment_reference,branches(name)')
    const missingPaymentFields = error && (
      error.code === 'PGRST200' || error.code === 'PGRST204' ||
      /payment_status|payment_reference/i.test(error.message || '')
    )
    if (missingPaymentFields) ({ data, error } = await orderQuery('id,order_number,status,courier,awb,tracking_url,branches(name)'))
    if (error) throw error
    if (!data) return Response.json({ error: 'Order not found.' }, { status: 404, headers: corsHeaders })
    const returnQuery = (columns: string) => admin.from('return_requests').select(columns).eq('order_id', data.id).maybeSingle()
    let { data: returnRequest, error: returnError } = await returnQuery('status,reason,refund_amount,refund_reference')
    const missingRefundFields = returnError && (
      returnError.code === 'PGRST200' || returnError.code === 'PGRST204' ||
      /refund_amount|refund_reference/i.test(returnError.message || '')
    )
    if (missingRefundFields) ({ data: returnRequest, error: returnError } = await returnQuery('status,reason'))
    if (returnError) throw returnError
    const paymentStatus = 'payment_status' in data ? data.payment_status : 'awaiting_upi'
    const paymentReference = 'payment_reference' in data && ['verified', 'refunded'].includes(paymentStatus || '') ? data.payment_reference : null
    return Response.json({
      orderNumber: data.order_number, status: data.status, courier: data.courier, awb: data.awb,
      trackingUrl: data.tracking_url, branch: (data.branches as { name?: string } | null)?.name || 'SSBS',
      paymentStatus, paymentReference,
      returnRequest: returnRequest ? {
        status: returnRequest.status, reason: returnRequest.reason,
        refundAmount: 'refund_amount' in returnRequest ? returnRequest.refund_amount : null,
        refundReference: 'refund_reference' in returnRequest ? returnRequest.refund_reference : null
      } : null
    }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to track order.' }, { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
})
