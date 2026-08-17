import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  try {
    const body = await req.json()
    const customer = body.customer || {}
    const requestedItems = Array.isArray(body.items) ? body.items : []
    if (!customer.name || !customer.phone || !customer.address || !customer.pincode || !customer.payment || !requestedItems.length) throw new Error('Please complete delivery details and add at least one product.')
    if (requestedItems.length > 20) throw new Error('Too many items.')
    const grouped = new Map<string, number>()
    for (const item of requestedItems as { id: string, quantity?: number }[]) {
      if (!item.id) continue
      grouped.set(item.id, Math.min(10, (grouped.get(item.id) || 0) + Math.max(1, Number(item.quantity) || 1)))
    }
    const ids = [...grouped.keys()]
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: products, error: productsError } = await admin.from('products').select('id,name,price').eq('active', true).in('id', ids)
    if (productsError || !products || products.length !== ids.length) throw new Error('One or more selected products are unavailable.')
    const items = ids.map(id => {
      const product = products.find(product => product.id === id)
      return { id: product!.id, name: product!.name, price: product!.price, quantity: grouped.get(id)! }
    })
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
    const phone = String(customer.phone).replace(/[^0-9+]/g, '').slice(0, 20)
    const couponCode = String(body.couponCode || '').trim().toUpperCase()
    let discount = 0
    if (couponCode) {
      let { data: coupon, error: couponError } = await admin.from('offers')
        .select('code,discount_percent,minimum_order,minimum_quantity,first_order_only,starts_at,expires_at')
        .eq('active', true).ilike('code', couponCode).limit(1).maybeSingle()
      if (couponError && /starts_at/i.test(couponError.message || '')) {
        const legacyCoupon = await admin.from('offers')
          .select('code,discount_percent,minimum_order,minimum_quantity,first_order_only,expires_at')
          .eq('active', true).ilike('code', couponCode).limit(1).maybeSingle()
        coupon = legacyCoupon.data ? { ...legacyCoupon.data, starts_at: null } : null
        couponError = legacyCoupon.error
      }
      if (couponError || !coupon || !coupon.discount_percent) throw new Error('This coupon code is not available.')
      if (coupon.starts_at && coupon.starts_at > new Date().toISOString().slice(0, 10)) throw new Error('This coupon is not active yet.')
      if (coupon.expires_at && coupon.expires_at < new Date().toISOString().slice(0, 10)) throw new Error('This coupon has expired.')
      if (subtotal < Number(coupon.minimum_order || 0)) throw new Error(`A minimum order of ₹${coupon.minimum_order} is required for this coupon.`)
      if (itemCount < Number(coupon.minimum_quantity || 1)) throw new Error(`Add at least ${coupon.minimum_quantity} items to use this coupon.`)
      if (coupon.first_order_only) {
        const { data: priorOrder } = await admin.from('orders').select('id').eq('phone', phone).limit(1).maybeSingle()
        if (priorOrder) throw new Error('This coupon is available on your first order only.')
      }
      discount = Math.round(subtotal * Number(coupon.discount_percent) / 100)
    }
    const total = Math.max(0, subtotal - discount)
    const { data: branch } = await admin.from('branches').select('id').eq('name', 'Bhavnagar').eq('active', true).maybeSingle()
    const paymentMethod = 'Manual UPI'
    const paymentStatus = 'awaiting_upi' as const
    const orderPayload = {
      customer_name: String(customer.name).slice(0, 100), phone,
      email: String(customer.email || '').slice(0, 160), address: String(customer.address).slice(0, 500), pincode: String(customer.pincode).slice(0, 12),
      payment_method: paymentMethod, payment_status: paymentStatus, items, subtotal, discount, coupon_code: couponCode || null, total, branch_id: branch?.id || null
    }
    let { data: order, error: orderError } = await admin.from('orders').insert(orderPayload)
      .select('order_number,subtotal,discount,total,coupon_code,payment_status').single()

    // Allow deployments to keep accepting orders while the migration is being
    // rolled out. A missing payment_status column is the only error retried.
    const missingPaymentStatus = orderError && (
      orderError.code === 'PGRST204' ||
      /payment_status/i.test(orderError.message || '') && /column|schema cache/i.test(orderError.message || '')
    )
    if (missingPaymentStatus) {
      const { payment_status: _paymentStatus, ...legacyPayload } = orderPayload
      const legacyResult = await admin.from('orders').insert(legacyPayload)
        .select('order_number,subtotal,discount,total,coupon_code').single()
      order = legacyResult.data ? { ...legacyResult.data, payment_status: paymentStatus } : null
      orderError = legacyResult.error
    }
    if (orderError) throw orderError
    return Response.json({ orderNumber: order!.order_number, subtotal: order!.subtotal, discount: order!.discount, total: order!.total, couponCode: order!.coupon_code, paymentStatus: order!.payment_status || paymentStatus }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to place order.' }, { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
})
