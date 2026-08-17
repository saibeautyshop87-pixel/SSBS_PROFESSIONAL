const RETURN_CLOSED = ['refund completed','rejected'];
const RETURN_STATUSES = ['requested','approved','returned','refund completed','rejected'];

window.renderOrderManager = function(){
  const root=document.querySelector('#admin-orders'),search=document.querySelector('#order-search'),statusFilter=document.querySelector('#order-status-filter'),branchFilter=document.querySelector('#order-branch-filter'),summary=document.querySelector('#order-results-summary'),pagination=document.querySelector('#order-pagination');
  if(!root||!search||!statusFilter||!branchFilter)return;
  const selectedBranch=branchFilter.value||'all';
  branchFilter.innerHTML=`<option value="all">All branches</option>${branches().map(branch=>`<option value="${branch.id}" ${selectedBranch===branch.id?'selected':''}>${branch.name}</option>`).join('')}`;
  const query=search.value.trim().toLowerCase(),status=statusFilter.value,branch=branchFilter.value,requests=returnRequests();
  const all=orders().filter(order=>{
    const request=requests.find(item=>item.order_number===(order.id||order.order_number));
    const openReturn=request&&!RETURN_CLOSED.includes(request.status);
    const haystack=`${order.id||''} ${order.customer_name||order.customer?.name||''} ${order.phone||order.customer?.phone||''}`.toLowerCase();
    const statusMatch=status==='all'||(status==='active'?!['delivered','rto'].includes(order.status)||Boolean(openReturn):status==='returns'?Boolean(request):status==='archived'?['delivered','rto'].includes(order.status)&&!openReturn:order.status===status);
    return(!query||haystack.includes(query))&&statusMatch&&(branch==='all'||order.branch===branch||order.branch_id===branch);
  });
  const pages=Math.max(1,Math.ceil(all.length/ORDERS_PER_PAGE));
  orderPage=Math.min(Math.max(1,orderPage),pages);
  const start=(orderPage-1)*ORDERS_PER_PAGE,pageItems=all.slice(start,start+ORDERS_PER_PAGE);
  if(summary)summary.innerHTML=`<span>Showing <b>${all.length?start+1:0}–${Math.min(start+ORDERS_PER_PAGE,all.length)}</b> of <b>${all.length}</b> matching orders</span><span>Page ${orderPage} of ${pages}</span>`;
  root.innerHTML=pageItems.length?pageItems.map(order=>{
    const customer=order.customer||{},request=requests.find(item=>item.order_number===(order.id||order.order_number)),refunded=request?.status==='refund completed',displayStatus=refunded?'refunded':order.status||'confirmed',branchName=branches().find(item=>item.id===(order.branch||order.branch_id))?.name||'Unassigned';
    const items=(order.items||[]).map(item=>`${item.name}${item.quantity>1?` ×${item.quantity}`:''}`).join(', ');
    const panelLabel=refunded?'REFUND COMPLETED':request?.status==='returned'?'PRODUCT RETURNED':'RETURN REQUEST';
    const returnPanel=request?`<section class="return-admin-panel ${refunded?'is-refunded':''}"><div class="return-admin-copy">${refunded?'<i>✓</i>':''}<div><p class="eyebrow">${panelLabel}</p><h3>${refunded?'Manual refund marked as sent':request.reason}</h3>${refunded?`<p>${request.reason} · Confirm the UPI refund reference before closing this return.</p>`:request.details?`<p>${request.details}</p>`:''}<small>${refunded?'Recorded':'Received'} ${new Date(refunded?(request.updated_at||request.created_at):request.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</small></div></div><label><span>Return status</span><select data-return-status="${request.id}">${RETURN_STATUSES.map(item=>`<option value="${item}" ${item===request.status?'selected':''}>${item}</option>`).join('')}</select></label></section>`:'';
    return `<article class="order-card ${request?'has-return':''} ${refunded?'order-refunded':''}"><div class="order-card-head"><div><p class="eyebrow">${order.id||order.order_number}</p><h2>${customer.name||order.customer_name||'Customer order'}</h2><span>${customer.phone||order.phone||'No phone'} · ${money(order.total||0)}</span></div><span class="order-status status-${displayStatus.replaceAll(' ','-')}">${displayStatus}</span></div><div class="order-product-line">${items||'Order items pending'}</div><div class="order-customer"><span><b>Delivery</b>${customer.address||order.address||'Address pending'}${customer.pincode||order.pincode?`, ${customer.pincode||order.pincode}`:''}</span><span><b>Payment</b>${customer.payment||order.payment_method||'Not selected'}</span><span><b>Fulfilment</b>${branchName}</span></div>${returnPanel}<div class="order-controls"><select data-order-branch="${order.id}">${branchOptions(order.branch||order.branch_id)}</select><select data-order-status="${order.id}">${['confirmed','preparing','shipped','out for delivery','delivered','rto'].map(item=>`<option ${item===order.status?'selected':''}>${item}</option>`).join('')}</select><input data-order-courier="${order.id}" value="${order.courier||''}" placeholder="Courier partner"><input data-order-awb="${order.id}" value="${order.awb||''}" placeholder="AWB / consignment no."><input data-order-tracking-url="${order.id}" value="${order.tracking_url||''}" placeholder="Tracking URL"></div></article>`;
  }).join(''):'<div class="empty-orders"><h2>No matching orders.</h2><p>Try another filter, or new customer orders will appear here.</p></div>';
  if(pagination)pagination.innerHTML=all.length>ORDERS_PER_PAGE?`<button type="button" data-order-page="${orderPage-1}" ${orderPage===1?'disabled':''}>← Previous</button><div>${Array.from({length:pages},(_,i)=>i+1).filter(page=>page===1||page===pages||Math.abs(page-orderPage)<=1).map((page,index,array)=>`${index&&page-array[index-1]>1?'<span>…</span>':''}<button type="button" data-order-page="${page}" class="${page===orderPage?'active':''}">${page}</button>`).join('')}</div><button type="button" data-order-page="${orderPage+1}" ${orderPage===pages?'disabled':''}>Next →</button>`:'';
};

document.querySelector('#return-form')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.target,button=form.querySelector('button[type="submit"]'),message=document.querySelector('#return-message'),data=new FormData(form);
  button.disabled=true;button.textContent='Submitting…';message.className='return-message';message.textContent='';
  try{
    const response=await fetch(`${SUPABASE_URL}/functions/v1/request-return`,{method:'POST',headers:{...sbHeaders(),'Content-Type':'application/json'},body:JSON.stringify({orderNumber:data.get('order_number'),phone:data.get('phone'),reason:data.get('reason'),details:data.get('details')})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to submit the return request.');
    message.className='return-message success';message.textContent=result.message;form.reset();
  }catch(error){message.className='return-message error';message.textContent=error.message==='Failed to fetch'?'Return service is not active yet. Please contact SSBS support or try again later.':error.message||'Unable to submit the return request.'}
  finally{button.disabled=false;button.textContent='Submit return request'}
});

document.addEventListener('change',event=>{
  const id=event.target.dataset.returnStatus;if(!id)return;
  const requests=returnRequests(),request=requests.find(item=>item.id===id);if(!request)return;
  request.status=event.target.value;request.updated_at=new Date().toISOString();localStorage.setItem('ssbs_return_requests',JSON.stringify(requests));
  adminWrite('return_requests','PATCH',{status:request.status,updated_at:request.updated_at},`?id=eq.${id}`).catch(()=>{});renderOrderManager();
});

const returnOrder=new URLSearchParams(location.search).get('order');
if(returnOrder&&document.querySelector('#return-form'))document.querySelector('#return-form').elements.order_number.value=returnOrder;
function addCustomerReturnLinks(){document.querySelectorAll('.customer-order').forEach(card=>{const order=card.querySelector('h2')?.textContent.trim(),actions=card.lastElementChild;if(order&&actions&&!actions.querySelector('.return-order-link'))actions.insertAdjacentHTML('beforeend',`<a class="text-link return-order-link" href="return-request.html?order=${encodeURIComponent(order)}">Request return →</a>`)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addCustomerReturnLinks,{once:true});else addCustomerReturnLinks();
document.querySelector('#clear-device-orders')?.addEventListener('click',()=>{if(!confirm('Clear saved order history from this browser? This does not delete live admin records.'))return;localStorage.removeItem('ssbs_customer_orders');renderCustomerOrders()});
const originalTrackingCard=window.trackingCard;
if(originalTrackingCard)window.trackingCard=order=>{let html=originalTrackingCard(order),request=order.returnRequest;if(!request)return html;let status=String(request.status||'requested'),labels=['Request received','Return approved','Product returned','Refund marked as sent'],index={requested:0,approved:1,returned:2,'refund completed':3}[status]??0,rejected=status==='rejected',refunded=status==='refund completed',steps=labels.map((label,step)=>`<div class="refund-step ${!rejected&&(refunded||step<index)?'completed':!rejected&&step===index?'current':'pending'}"><i>${!rejected&&(refunded||step<index)?'✓':step+1}</i><span>${label}</span></div>`).join(''),title=rejected?'Return request not approved':refunded?'SSBS marked your refund as sent.':status==='returned'?'Your returned product has been received.':status==='approved'?'Your return request is approved.':'We have received your return request.',copy=rejected?'Please contact SSBS support if you need more information.':refunded?`The manual UPI refund was marked as sent${request.refundReference?` · Reference ${request.refundReference}`:''}${request.refundAmount?` · ${money(request.refundAmount)}`:''}. Bank processing time may vary.`:`Reason: ${request.reason}`,badge=refunded?'Refund marked sent':status.replace(/\b\w/g,letter=>letter.toUpperCase());let panel=`<section class="refund-tracking ${rejected?'is-rejected':refunded?'is-complete':''}"><header><div class="refund-icon">${rejected?'!':'↺'}</div><div><p class="eyebrow">RETURN & REFUND</p><h3>${title}</h3><p>${copy}</p></div><span>${badge}</span></header>${rejected?'':`<div class="refund-progress">${steps}</div>`}</section>`;return html.replace('</article>',panel+'</article>')};
