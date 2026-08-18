/* SSBS admin workspace
 * Loaded after app.js (and returns.js on order/return pages).
 * This file intentionally owns only the authenticated admin experience.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('admin') || /admin-login\.html$/i.test(location.pathname)) return;

  const pageFile = (location.pathname.split('/').pop() || 'admin.html').toLowerCase();
  const pageByFile = {
    'admin.html': 'today',
    'admin-orders.html': 'orders',
    'admin-returns.html': 'returns',
    'admin-products.html': 'products',
    'admin-upcoming.html': 'upcoming',
    'admin-offers.html': 'coupons',
    'admin-reviews.html': 'reviews',
    'admin-security.html': 'settings'
  };
  const page = pageByFile[pageFile] || 'today';
  const CACHE = {
    products: 'ssbs_products',
    upcoming: 'ssbs_upcoming_products',
    coupons: 'ssbs_offers',
    branches: 'ssbs_branches',
    reviews: 'ssbs_reviews',
    orders: 'ssbs_orders',
    returns: 'ssbs_return_requests',
    activity: 'ssbs_admin_activity'
  };
  const ORDER_STATUSES = ['confirmed', 'preparing', 'shipped', 'out for delivery', 'delivered', 'rto'];
  const PAYMENT_STATUSES = ['awaiting_upi', 'verified', 'failed', 'refunded'];
  const RETURN_STATUSES = ['requested', 'approved', 'returned', 'rejected'];
  const CLOSED_RETURNS = new Set(['refund completed', 'rejected']);
  const state = {
    page,
    orderTab: 'active',
    orderSearch: '',
    orderBranch: 'all',
    returnTab: 'open',
    returnSearch: '',
    productTab: 'active',
    productSearch: '',
    productSelection: new Set(),
    upcomingTab: 'all',
    upcomingSearch: '',
    couponTab: 'all',
    reviewTab: 'pending',
    reviewSearch: '',
    drawer: null,
    renderQueued: false,
    refreshing: false,
    initialActionHandled: false,
    previewObjectUrl: '',
    lastUpdated: localStorage.getItem('ssbs_admin_last_updated') || ''
  };

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const text = value => String(value == null ? '' : value).trim();
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(number(value));
  const titleCase = value => text(value).replace(/\b\w/g, letter => letter.toUpperCase());
  const slug = value => text(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pending';
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowISO = () => new Date().toISOString();
  const formatDate = value => {
    if (!value) return 'Not set';
    const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const formatDateTime = value => {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  };
  const relativeTime = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const ranges = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, size] of ranges) if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
    return 'just now';
  };
  const safeImage = value => {
    const candidate = text(value);
    if (!candidate) return '';
    if (/^(https?:\/\/|\/|\.\/|\.\.\/|assets\/|blob:|data:image\/(?:png|jpe?g|webp);base64,)/i.test(candidate)) return candidate;
    return '';
  };
  const safeHttpUrl = value => {
    const candidate = text(value);
    if (!candidate) return '';
    try {
      const parsed = new URL(candidate, location.href);
      return /^https?:$/i.test(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  };
  const statusChip = (status, extra = '') => `<span class="aw-chip aw-badge is-${esc(slug(status))} ${esc(extra)}">${esc(titleCase(status || 'pending'))}</span>`;

  function readCache(key, fallback = []) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(parsed) ? parsed : fallback;
    } catch { return fallback; }
  }
  function readViaGlobal(globalName, cacheKey, fallback = []) {
    try {
      if (globalName === 'products' && typeof products === 'function') return products();
      if (globalName === 'upcomingProducts' && typeof upcomingProducts === 'function') return upcomingProducts();
      if (globalName === 'offers' && typeof offers === 'function') return offers();
      if (globalName === 'branches' && typeof branches === 'function') return branches();
      if (globalName === 'reviews' && typeof reviews === 'function') return reviews();
      if (globalName === 'orders' && typeof orders === 'function') return orders();
      if (globalName === 'returnRequests' && typeof returnRequests === 'function') return returnRequests();
    } catch { /* fall through to the cache */ }
    return readCache(cacheKey, fallback);
  }
  const getProducts = () => readViaGlobal('products', CACHE.products);
  const getUpcoming = () => readViaGlobal('upcomingProducts', CACHE.upcoming);
  const getCoupons = () => readViaGlobal('offers', CACHE.coupons);
  const getBranches = () => readViaGlobal('branches', CACHE.branches);
  const getReviews = () => readViaGlobal('reviews', CACHE.reviews);
  const getOrders = () => readViaGlobal('orders', CACHE.orders);
  const getReturns = () => readViaGlobal('returnRequests', CACHE.returns);
  const getActivity = () => readCache(CACHE.activity);
  const writeCache = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  function session() {
    try {
      if (typeof adminSession === 'function') return adminSession();
    } catch { /* use local copy */ }
    try { return JSON.parse(localStorage.getItem('ssbs_admin_session') || 'null'); } catch { return null; }
  }
  function sessionUserId() {
    if (window.ssbsAdminUser?.id) return window.ssbsAdminUser.id;
    const current = session();
    if (current?.user?.id) return current.user.id;
    try {
      const payload = JSON.parse(atob(String(current?.access_token || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload.sub || '';
    } catch { return ''; }
  }
  function apiHeaders(extra = {}) {
    const token = session()?.access_token;
    if (!token) throw new Error('Your admin session has expired. Sign in again.');
    let base;
    try { base = typeof sbHeaders === 'function' ? sbHeaders(token) : null; } catch { base = null; }
    if (!base) {
      let anon = '';
      try { anon = SUPABASE_ANON_KEY; } catch { /* handled by request failure */ }
      base = { apikey: anon, Authorization: `Bearer ${token}` };
    }
    return { ...base, ...extra };
  }
  function apiBase() {
    try { return SUPABASE_URL; } catch { return ''; }
  }
  async function apiRequest(table, method = 'GET', body, query = '', options = {}) {
    const response = await fetch(`${apiBase()}/rest/v1/${table}${query}`, {
      method,
      headers: apiHeaders({
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Prefer: options.prefer || 'resolution=merge-duplicates,return=representation'
      }),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
    if (!response.ok) {
      const message = payload?.message || payload?.details || payload?.hint || (typeof payload === 'string' && payload) || `Request failed (${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    if (options.requireRow && Array.isArray(payload) && payload.length === 0) throw new Error('Nothing was saved. Refresh and try again.');
    return payload;
  }
  async function logActivity(action, entityType, entityId, details = {}) {
    const adminUserId = sessionUserId();
    if (!adminUserId) return null;
    try {
      const payload = [{ admin_user_id: adminUserId, action, entity_type: entityType, entity_id: String(entityId || ''), details }];
      const saved = await apiRequest('admin_activity', 'POST', payload, '', { requireRow: true });
      const row = Array.isArray(saved) ? saved[0] : saved;
      if (row) writeCache(CACHE.activity, [row, ...getActivity().filter(item => item.id !== row.id)].slice(0, 50));
      return row;
    } catch (error) {
      console.warn('SSBS activity log unavailable:', error.message);
      return null;
    }
  }

  function toast(message, tone = 'neutral', timeout = 3600) {
    let stack = q('#aw-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'aw-toast-stack';
      stack.className = 'aw-toast-stack aw-no-print';
      stack.setAttribute('aria-live', 'polite');
      document.body.append(stack);
    }
    const node = document.createElement('div');
    node.className = `aw-toast is-${tone}`;
    node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    node.textContent = message;
    stack.prepend(node);
    while (stack.children.length > 4) stack.lastElementChild.remove();
    if (timeout) setTimeout(() => node.remove(), timeout);
    return node;
  }
  function updateToast(node, message, tone, timeout = 3000) {
    if (!node?.isConnected) return;
    node.className = `aw-toast is-${tone}`;
    node.textContent = message;
    node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    if (timeout) setTimeout(() => node.remove(), timeout);
  }
  async function runOperation(label, task, successMessage = `${label} saved.`) {
    const notice = toast(`${label}…`, 'saving', 0);
    try {
      const result = await task();
      state.lastUpdated = nowISO();
      localStorage.setItem('ssbs_admin_last_updated', state.lastUpdated);
      updateLastUpdated();
      updateToast(notice, successMessage, 'success');
      return result;
    } catch (error) {
      updateToast(notice, error?.message || `${label} failed.`, 'error', 6000);
      if (error && typeof error === 'object') error.awToasted = true;
      throw error;
    }
  }

  let confirmResolver = null;
  function confirmAction({ title, message, confirmLabel = 'Confirm', danger = true }) {
    const modal = q('#aw-confirm-modal');
    if (!modal) return Promise.resolve(window.confirm(message));
    q('[data-aw-confirm-title]', modal).textContent = title;
    q('[data-aw-confirm-message]', modal).textContent = message;
    const accept = q('[data-aw-confirm-accept]', modal);
    accept.textContent = confirmLabel;
    accept.classList.toggle('is-danger', danger);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => accept.focus(), 0);
    return new Promise(resolve => { confirmResolver = resolve; });
  }
  function resolveConfirm(value) {
    const modal = q('#aw-confirm-modal');
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve?.(value);
  }

  function navBadge(name) {
    return `<span class="aw-nav-badge" data-aw-badge="${esc(name)}" hidden>0</span>`;
  }
  function navLink(href, key, label, badge = '') {
    const active = state.page === key;
    return `<a class="aw-nav-link ${active ? 'is-active' : ''}" href="${esc(href)}" ${active ? 'aria-current="page"' : ''}><span>${esc(label)}</span>${badge ? navBadge(badge) : ''}</a>`;
  }
  function mountWorkspace() {
    document.body.classList.add('aw-workspace-active');
    const oldBack = q('.page-back');
    oldBack?.remove();
    const currentSession = session();
    const email = window.ssbsAdminUser?.email || currentSession?.user?.email || 'SSBS administrator';
    let header = q('.adminbar');
    if (!header) {
      header = document.createElement('header');
      document.body.prepend(header);
    }
    header.className = 'adminbar aw-topbar aw-no-print';
    header.innerHTML = `<div class="aw-topbar-mobile"><button type="button" class="aw-icon-button" data-aw-mobile-menu aria-label="Open admin navigation" aria-expanded="false">☰</button><a class="logo" href="admin.html" aria-label="SSBS admin home">SSBS<span>PROFESSIONAL</span></a></div><div class="aw-topbar-context"><span>ADMIN WORKSPACE</span><b>${esc(pageTitle())}</b></div><div class="aw-topbar-actions"><span class="aw-last-updated" data-aw-last-updated>${esc(lastUpdatedLabel())}</span><button type="button" class="quiet-button" data-aw-refresh>Refresh</button><a class="quiet-button" href="index.html" target="_blank" rel="noopener">View store ↗</a><span class="aw-user">${esc(email)}</span><button type="button" class="quiet-button" data-aw-logout>Log out</button></div>`;

    let shell = q('.admin-shell');
    if (!shell) {
      shell = document.createElement('main');
      document.body.append(shell);
    }
    shell.className = 'admin-shell aw-app';
    shell.innerHTML = `<aside class="aw-sidebar aw-no-print" id="aw-sidebar" aria-label="Admin navigation"><div class="aw-sidebar-head"><a class="logo" href="admin.html">SSBS<span>PROFESSIONAL</span></a><button type="button" class="aw-icon-button" data-aw-close-menu aria-label="Close admin navigation">×</button></div><div class="aw-sidebar-body"><nav class="aw-nav"><div class="aw-nav-group"><p>OPERATE</p>${navLink('admin.html', 'today', 'Today')}${navLink('admin-orders.html', 'orders', 'Orders', 'orders')}${navLink('admin-returns.html', 'returns', 'Returns', 'returns')}</div><div class="aw-nav-group"><p>GROW</p>${navLink('admin-products.html', 'products', 'Products', 'products')}${navLink('admin-upcoming.html', 'upcoming', 'Launches')}${navLink('admin-offers.html', 'coupons', 'Coupons')}${navLink('admin-reviews.html', 'reviews', 'Reviews', 'reviews')}</div><div class="aw-nav-group"><p>WORKSPACE</p>${navLink('admin-security.html', 'settings', 'Settings')}</div></nav></div><div class="aw-sidebar-foot"><span>Secure Supabase workspace</span><button type="button" data-aw-logout>Log out</button></div></aside><button type="button" class="aw-mobile-backdrop aw-no-print" data-aw-close-menu aria-label="Close admin navigation"></button><section class="aw-main"><div class="aw-page" id="aw-page"></div></section><nav class="aw-mobile-bar aw-no-print" aria-label="Mobile admin navigation"><a class="aw-mobile-link ${state.page === 'today' ? 'is-active' : ''}" href="admin.html" ${state.page === 'today' ? 'aria-current="page"' : ''}>Today</a><a class="aw-mobile-link ${state.page === 'orders' ? 'is-active' : ''}" href="admin-orders.html" ${state.page === 'orders' ? 'aria-current="page"' : ''}>Orders${navBadge('orders')}</a><a class="aw-mobile-link ${state.page === 'products' ? 'is-active' : ''}" href="admin-products.html" ${state.page === 'products' ? 'aria-current="page"' : ''}>Products${navBadge('products')}</a><button type="button" class="aw-mobile-link" data-aw-mobile-menu aria-label="Open all admin sections">More</button></nav>`;

    if (!q('#aw-drawer')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="aw-drawer aw-no-print" id="aw-drawer" aria-hidden="true"><button type="button" class="aw-drawer-backdrop" data-aw-close-drawer aria-label="Close panel"></button><aside class="aw-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="aw-drawer-title"><header class="aw-drawer-header"><div><p class="eyebrow" data-aw-drawer-eyebrow>ADMIN WORKSPACE</p><h2 id="aw-drawer-title" data-aw-drawer-title>Details</h2></div><button type="button" class="aw-icon-button" data-aw-close-drawer aria-label="Close panel">×</button></header><div class="aw-drawer-body" data-aw-drawer-body></div></aside></div>`);
    }
    if (!q('#aw-confirm-modal')) {
      document.body.insertAdjacentHTML('beforeend', `<div class="aw-modal aw-no-print" id="aw-confirm-modal" aria-hidden="true"><button type="button" class="aw-modal-backdrop" data-aw-confirm-cancel aria-label="Cancel"></button><section class="aw-modal-panel" role="alertdialog" aria-modal="true" aria-labelledby="aw-confirm-title"><p class="eyebrow">PLEASE CONFIRM</p><h2 id="aw-confirm-title" data-aw-confirm-title>Confirm action</h2><p data-aw-confirm-message></p><div class="aw-actions"><button type="button" class="quiet-button" data-aw-confirm-cancel>Cancel</button><button type="button" class="button" data-aw-confirm-accept>Confirm</button></div></section></div>`);
    }
    if (!q('#aw-toast-stack')) {
      const stack = document.createElement('div');
      stack.id = 'aw-toast-stack';
      stack.className = 'aw-toast-stack aw-no-print';
      stack.setAttribute('aria-live', 'polite');
      document.body.append(stack);
    }
    updateBadges();
  }

  function pageTitle() {
    return ({ today: 'Today', orders: 'Orders', returns: 'Returns', products: 'Products', upcoming: 'Launches', coupons: 'Coupons', reviews: 'Reviews', settings: 'Settings' })[state.page] || 'Admin';
  }
  function lastUpdatedLabel() {
    return state.lastUpdated ? `Updated ${relativeTime(state.lastUpdated)}` : 'Cached view';
  }
  function updateLastUpdated() {
    qa('[data-aw-last-updated]').forEach(node => { node.textContent = lastUpdatedLabel(); node.title = state.lastUpdated ? formatDateTime(state.lastUpdated) : 'Refresh to load the latest data'; });
  }
  function badgeCount(name) {
    if (name === 'orders') return getOrders().filter(order => !['delivered', 'rto'].includes(text(order.status).toLowerCase())).length;
    if (name === 'returns') return getReturns().filter(item => !CLOSED_RETURNS.has(text(item.status).toLowerCase())).length;
    if (name === 'reviews') return getReviews().filter(item => item.approved === false).length;
    if (name === 'products') return getProducts().filter(item => item.active !== false && number(item.stock_quantity) <= number(item.low_stock_threshold)).length;
    return 0;
  }
  function updateBadges() {
    ['orders', 'returns', 'reviews', 'products'].forEach(name => {
      const count = badgeCount(name);
      qa(`[data-aw-badge="${name}"]`).forEach(node => { node.textContent = String(count); node.hidden = count === 0; });
    });
    updateLastUpdated();
  }

  function pageHead(eyebrow, title, description, actions = '') {
    return `<header class="aw-page-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="aw-page-actions">${actions}</div></header>`;
  }
  function emptyState(title, copy, action = '') {
    return `<div class="aw-empty"><span>✓</span><h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;
  }
  function orderNumber(order) { return text(order.order_number || order.id); }
  function orderDbId(order) { return text(order.db_id || (order.order_number ? order.id : '')); }
  function orderCustomer(order) { return order.customer || {}; }
  function orderCustomerName(order) { return text(order.customer_name || orderCustomer(order).name || 'Customer'); }
  function orderPhone(order) { return text(order.phone || orderCustomer(order).phone); }
  function orderBranchId(order) { return text(order.branch_id || order.branch); }
  function branchName(id) { return getBranches().find(branch => text(branch.id) === text(id))?.name || 'Unassigned'; }
  function paymentStatus(order) {
    const explicit = text(order.payment_status).toLowerCase();
    if (explicit === 'paid') return 'verified';
    if (explicit === 'pending') return 'awaiting_upi';
    if (PAYMENT_STATUSES.includes(explicit)) return explicit;
    return 'awaiting_upi';
  }
  function paymentChip(order) {
    const status = paymentStatus(order);
    const method = text(order.payment_method || orderCustomer(order).payment || 'Payment');
    const label = status === 'verified' ? 'Verified' : status === 'awaiting_upi' ? 'Awaiting UPI' : status === 'refunded' ? 'Marked refunded' : titleCase(status);
    const modifier = status === 'verified' ? 'is-verified is-payment-verified' : status === 'awaiting_upi' ? 'is-awaiting-upi is-payment-pending' : status === 'refunded' ? 'is-refunded' : 'is-failed';
    return `<span class="aw-chip is-${esc(slug(status))} ${modifier}">${esc(label)}</span><small>${esc(method)}</small>`;
  }
  function linkedReturn(order) {
    const numberValue = orderNumber(order);
    return getReturns().find(item => text(item.order_number) === numberValue);
  }

  function renderTodayPage() {
    const root = q('#aw-page');
    if (!root) return;
    const allOrders = getOrders().slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const allReturns = getReturns();
    const allReviews = getReviews();
    const allProducts = getProducts();
    const today = todayISO();
    const todaysOrders = allOrders.filter(order => text(order.created_at).slice(0, 10) === today);
    const newOrders = allOrders.filter(order => text(order.status).toLowerCase() === 'confirmed');
    const unassigned = allOrders.filter(order => !['delivered', 'rto'].includes(text(order.status).toLowerCase()) && !orderBranchId(order));
    const missingDispatch = allOrders.filter(order => ['shipped', 'out for delivery'].includes(text(order.status).toLowerCase()) && (!text(order.awb) || !text(order.courier)));
    const openReturns = allReturns.filter(item => !CLOSED_RETURNS.has(text(item.status).toLowerCase()));
    const pendingReviews = allReviews.filter(item => item.approved === false);
    const lowStock = allProducts.filter(item => item.active !== false && number(item.stock_quantity) <= number(item.low_stock_threshold));
    const verifiedToday = todaysOrders.filter(order => paymentStatus(order) === 'verified').reduce((sum, order) => sum + number(order.total), 0);
    const attention = [
      { count: newOrders.length, label: 'New orders', copy: 'Confirm, assign and prepare', href: 'admin-orders.html?tab=confirmed', tone: newOrders.length ? 'urgent' : 'neutral' },
      { count: openReturns.length, label: 'Open returns', copy: 'Review customer requests', href: 'admin-returns.html?tab=open', tone: openReturns.length ? 'warning' : 'neutral' },
      { count: missingDispatch.length, label: 'Dispatch details missing', copy: 'Add courier and AWB', href: 'admin-orders.html?tab=shipped', tone: missingDispatch.length ? 'warning' : 'neutral' },
      { count: unassigned.length, label: 'Unassigned orders', copy: 'Choose a fulfilment branch', href: 'admin-orders.html?tab=active', tone: unassigned.length ? 'warning' : 'neutral' },
      { count: lowStock.length, label: 'Low-stock products', copy: 'Review inventory levels', href: 'admin-products.html?tab=low', tone: lowStock.length ? 'urgent' : 'neutral' },
      { count: pendingReviews.length, label: 'Reviews awaiting moderation', copy: 'Publish or keep pending', href: 'admin-reviews.html?tab=pending', tone: pendingReviews.length ? 'neutral' : 'neutral' }
    ];
    const activity = getActivity().slice(0, 6);
    root.innerHTML = `${pageHead('Daily command centre', 'Today', 'Start with what needs attention, then move into fulfilment.', `<button type="button" class="button" data-aw-refresh>Refresh workspace</button>`)}
      <section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">NEEDS ATTENTION</p><h2>Act next</h2></div><span>${esc(lastUpdatedLabel())}</span></div><div class="aw-attention-grid">${attention.map(item => `<a class="aw-attention-card is-${item.tone}" href="${esc(item.href)}"><b>${item.count}</b><span>${esc(item.label)}</span><small>${esc(item.copy)} →</small></a>`).join('')}</div></section>
      <section class="aw-kpi-grid"><article class="aw-kpi-card"><span>Orders today</span><b>${todaysOrders.length}</b><small>${newOrders.length} currently new</small></article><article class="aw-kpi-card"><span>Verified sales today</span><b>${money(verifiedToday)}</b><small>Manual payment status: verified</small></article><article class="aw-kpi-card"><span>Active fulfilment</span><b>${allOrders.filter(order => !['delivered', 'rto'].includes(text(order.status).toLowerCase())).length}</b><small>Across ${getBranches().filter(branch => branch.active !== false).length} active branches</small></article><article class="aw-kpi-card"><span>Delivered today</span><b>${todaysOrders.filter(order => text(order.status).toLowerCase() === 'delivered').length}</b><small>Completed customer journeys</small></article></section>
      <section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">LATEST ORDERS</p><h2>Keep fulfilment moving</h2></div><a href="admin-orders.html">View all orders →</a></div><div class="aw-table-wrap">${dashboardOrderRows(allOrders.slice(0, 8))}</div></section>
      <section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">WORKSPACE ACTIVITY</p><h2>Recent admin changes</h2></div></div>${activity.length ? `<div class="aw-list">${activity.map(item => `<article class="aw-row"><div><b>${esc(titleCase(item.action))}</b><small>${esc(titleCase(item.entity_type))}${item.entity_id ? ` · ${esc(item.entity_id)}` : ''}</small></div><time>${esc(relativeTime(item.created_at))}</time></article>`).join('')}</div>` : emptyState('No activity recorded yet', 'New workspace changes will appear here after refresh.')}</section>`;
  }
  function dashboardOrderRows(items) {
    if (!items.length) return emptyState('No orders yet', 'New customer orders will appear here.');
    return `<table class="aw-table" data-aw-responsive="cards"><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Fulfilment</th><th></th></tr></thead><tbody>${items.map(order => `<tr><td data-label="Order"><b>${esc(orderNumber(order))}</b><small>${esc(relativeTime(order.created_at))}</small></td><td data-label="Customer">${esc(orderCustomerName(order))}<small>${esc(orderPhone(order))}</small></td><td data-label="Payment">${paymentChip(order)}</td><td data-label="Fulfilment">${statusChip(order.status || 'confirmed')}<small>${esc(branchName(orderBranchId(order)))}</small></td><td data-label="Action"><button type="button" class="quiet-button" data-aw-open-order="${esc(orderNumber(order))}">Open</button></td></tr>`).join('')}</tbody></table>`;
  }

  function orderTabCount(tab, all = getOrders()) {
    if (tab === 'all') return all.length;
    if (tab === 'active') return all.filter(order => !['delivered', 'rto'].includes(text(order.status).toLowerCase())).length;
    return all.filter(order => text(order.status).toLowerCase() === tab).length;
  }
  function orderMatchesTab(order, tab) {
    const status = text(order.status).toLowerCase();
    if (tab === 'all') return true;
    if (tab === 'active') return !['delivered', 'rto'].includes(status);
    return status === tab;
  }
  function filteredOrders() {
    const needle = state.orderSearch.toLowerCase();
    return getOrders().filter(order => {
      const haystack = [orderNumber(order), orderCustomerName(order), orderPhone(order), order.awb, order.courier, order.payment_reference].join(' ').toLowerCase();
      return orderMatchesTab(order, state.orderTab) && (state.orderBranch === 'all' || orderBranchId(order) === state.orderBranch) && (!needle || haystack.includes(needle));
    }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  function orderTabs() {
    const tabs = [['active', 'Active'], ['confirmed', 'New'], ['preparing', 'Preparing'], ['shipped', 'Shipped'], ['out for delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['rto', 'RTO'], ['all', 'All']];
    return `<div class="aw-tabs" role="tablist" aria-label="Order status">${tabs.map(([value, label]) => `<button type="button" role="tab" class="aw-tab ${state.orderTab === value ? 'is-active' : ''}" aria-selected="${state.orderTab === value}" data-aw-order-tab="${esc(value)}"><span>${esc(label)}</span><b data-aw-order-tab-count="${esc(value)}">${orderTabCount(value)}</b></button>`).join('')}</div>`;
  }
  function renderOrdersPage() {
    const root = q('#aw-page');
    if (!root) return;
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');
    if (requestedTab && ['active', 'confirmed', 'preparing', 'shipped', 'out for delivery', 'delivered', 'rto', 'all'].includes(requestedTab)) state.orderTab = requestedTab;
    const branchesList = getBranches();
    root.innerHTML = `${pageHead('Fulfilment', 'Orders', 'Find the next order, then complete its fulfilment details in one focused panel.', `<button type="button" class="button" data-aw-refresh>Refresh orders</button>`)}
      <section class="aw-section aw-order-workspace">
        ${orderTabs()}
        <div class="aw-toolbar"><label class="aw-search"><span class="aw-cell-label">Search orders</span><input type="search" value="${esc(state.orderSearch)}" placeholder="Order, customer, phone, AWB…" data-aw-order-search></label><label><span class="aw-cell-label">Fulfilment branch</span><select data-aw-order-branch-filter><option value="all">All branches</option>${branchesList.map(branch => `<option value="${esc(branch.id)}" ${state.orderBranch === text(branch.id) ? 'selected' : ''}>${esc(branch.name)}${branch.active === false ? ' (archived)' : ''}</option>`).join('')}</select></label><a class="quiet-button" href="admin-returns.html">Returns ${badgeCount('returns') ? `<b>${badgeCount('returns')}</b>` : ''}</a></div>
        <div class="aw-table-wrap" data-aw-order-list>${orderRows(filteredOrders())}</div>
      </section>`;
  }
  function orderRows(items) {
    if (!items.length) return emptyState('No matching orders', 'Try another status, branch, or search term.');
    return `<table class="aw-table aw-order-list" data-aw-responsive="cards"><thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Branch</th><th>Status</th><th></th></tr></thead><tbody>${items.map(order => {
      const request = linkedReturn(order);
      return `<tr class="aw-order-row"><td data-label="Order"><b>${esc(orderNumber(order))}</b><small>${esc(formatDate(order.created_at))}${request && !CLOSED_RETURNS.has(text(request.status).toLowerCase()) ? ' · Return open' : ''}</small></td><td data-label="Customer">${esc(orderCustomerName(order))}<small>${esc(orderPhone(order))}</small></td><td data-label="Amount"><b>${money(order.total)}</b><small>${(order.items || []).length} line item${(order.items || []).length === 1 ? '' : 's'}</small></td><td data-label="Payment">${paymentChip(order)}</td><td data-label="Branch">${esc(branchName(orderBranchId(order)))}</td><td data-label="Status">${statusChip(order.status || 'confirmed')}</td><td data-label="Action"><button type="button" class="quiet-button" data-aw-open-order="${esc(orderNumber(order))}">Open</button></td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function updateOrderList() {
    const list = q('[data-aw-order-list]');
    if (list) list.innerHTML = orderRows(filteredOrders());
    qa('[data-aw-order-tab]').forEach(button => {
      const active = button.getAttribute('data-aw-order-tab') === state.orderTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    qa('[data-aw-order-tab-count]').forEach(node => { node.textContent = String(orderTabCount(node.getAttribute('data-aw-order-tab-count'))); });
  }

  function branchOptions(selected) {
    return `<option value="">Unassigned</option>${getBranches().map(branch => `<option value="${esc(branch.id)}" ${text(branch.id) === text(selected) ? 'selected' : ''}>${esc(branch.name)}${branch.active === false ? ' (archived)' : ''}</option>`).join('')}`;
  }
  function orderStatusOptions(selected) {
    return ORDER_STATUSES.map(status => `<option value="${esc(status)}" ${status === text(selected).toLowerCase() ? 'selected' : ''}>${esc(titleCase(status))}</option>`).join('');
  }
  function paymentStatusOptions(selected) {
    return PAYMENT_STATUSES.map(status => `<option value="${esc(status)}" ${status === text(selected).toLowerCase() ? 'selected' : ''}>${esc(status === 'verified' ? 'Verified' : status === 'awaiting_upi' ? 'Awaiting UPI' : status === 'refunded' ? 'Marked refunded' : titleCase(status))}</option>`).join('');
  }
  function orderItemsMarkup(order, showPrices = true) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return '<p class="muted">No item details recorded.</p>';
    return `<div class="aw-order-items">${items.map(item => `<div><span><b>${esc(item.name || 'Product')}</b><small>Quantity ${Math.max(1, number(item.quantity))}</small></span>${showPrices ? `<strong>${money(number(item.price) * Math.max(1, number(item.quantity)))}</strong>` : ''}</div>`).join('')}</div>`;
  }
  function openDrawer(type, title, eyebrow, markup, id = '') {
    const drawer = q('#aw-drawer');
    if (!drawer) return;
    state.drawer = { type, id };
    q('[data-aw-drawer-title]', drawer).textContent = title;
    q('[data-aw-drawer-eyebrow]', drawer).textContent = eyebrow;
    q('[data-aw-drawer-body]', drawer).innerHTML = markup;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('aw-drawer-open');
    setTimeout(() => q('input,select,textarea,button', q('[data-aw-drawer-body]', drawer))?.focus(), 0);
  }
  function closeDrawer() {
    const drawer = q('#aw-drawer');
    drawer?.classList.remove('is-open');
    drawer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('aw-drawer-open');
    state.drawer = null;
    if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = '';
  }
  function orderWhatsAppMessage(order, branch) {
    const customer = orderCustomer(order);
    const address = text(order.address || customer.address);
    const pincode = text(order.pincode || customer.pincode);
    const items = (Array.isArray(order.items) ? order.items : []).map((item, index) => `${index + 1}. ${text(item.name || 'Product')} x${Math.max(1, number(item.quantity))} — ${money(number(item.price) * Math.max(1, number(item.quantity)))}`).join('\n');
    return [`*SSBS ORDER ${orderNumber(order)}*`, `Fulfilment branch: ${branch.name}`, '', '*Customer*', `${orderCustomerName(order)}`, `Phone: ${orderPhone(order)}`, `Address: ${address}${pincode ? `, ${pincode}` : ''}`, '', '*Items*', items || 'No item details recorded', '', `Subtotal: ${money(order.subtotal || order.total)}`, `Discount: ${money(order.discount || 0)}`, `Delivery: ${money(order.delivery_charge || 0)}`, `*Order total: ${money(order.total)}*`, `Payment: ${titleCase(paymentStatus(order))}`, `Order status: ${titleCase(order.status || 'confirmed')}`, order.admin_note ? `Admin note: ${text(order.admin_note)}` : ''].filter(Boolean).join('\n');
  }
  function sendOrderToBranch(orderNo, branchId) {
    const order = getOrders().find(item => orderNumber(item) === text(orderNo));
    const branch = getBranches().find(item => text(item.id) === text(branchId));
    if (!order || !branch) return toast('Order or branch could not be found.', 'error');
    const phone = text(branch.whatsapp_phone).replace(/\D/g, '');
    if (!phone) return toast(`Add a WhatsApp number for ${branch.name} in Settings first.`, 'error', 6500);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(orderWhatsAppMessage(order, branch))}`, '_blank', 'noopener');
  }
  function openOrderDrawer(orderNo) {
    const order = getOrders().find(item => orderNumber(item) === text(orderNo));
    if (!order) return toast('That order is no longer in the current list. Refresh and try again.', 'error');
    const customer = orderCustomer(order);
    const address = text(order.address || customer.address);
    const pincode = text(order.pincode || customer.pincode);
    const request = linkedReturn(order);
    const method = text(order.payment_method || customer.payment || 'Not recorded');
    const currentPayment = paymentStatus(order);
    const paymentModifier = currentPayment === 'verified' ? 'is-payment-verified' : currentPayment === 'refunded' ? 'is-refunded' : 'is-payment-pending';
    openDrawer('order', `Order ${orderNumber(order)}`, 'FULFILMENT DETAIL', `<form class="aw-form" data-aw-form="order" data-aw-order-id="${esc(orderNumber(order))}">
      <section class="aw-order-summary"><div><span>Customer</span><b>${esc(orderCustomerName(order))}</b><small>${esc(orderPhone(order))}${order.email || customer.email ? ` · ${esc(order.email || customer.email)}` : ''}</small></div><div><span>Order total</span><b>${money(order.total)}</b><small>Delivery ${money(order.delivery_charge || 0)} · ${esc(formatDateTime(order.created_at))}</small></div></section>
      <section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">DELIVERY</p><h3>${esc(address || 'Address not recorded')}${pincode ? `, ${esc(pincode)}` : ''}</h3></div></div>${orderItemsMarkup(order)}</section>
      ${request ? `<a class="aw-return-summary is-${esc(slug(request.status))}" href="admin-returns.html?return=${encodeURIComponent(request.id)}"><span>Return request</span><b>${esc(titleCase(request.status))}</b><small>${esc(request.reason)} →</small></a>` : ''}
      <section class="aw-payment-panel ${paymentModifier}"><div class="aw-payment-summary"><div><p class="eyebrow">MANUAL PAYMENT VERIFICATION</p><h3>${esc(method)}</h3><p>Only mark a manual UPI/payment-link order Verified after checking the bank or gateway reference.</p></div>${paymentChip(order)}</div><div class="aw-upi-details"><label class="aw-field"><span>Payment status</span><select name="payment_status" required>${paymentStatusOptions(currentPayment)}</select></label><label class="aw-field"><span>Payment / transaction reference</span><input name="payment_reference" value="${esc(order.payment_reference)}" placeholder="Required when verified"></label><div class="aw-payment-proof"><span>Verified at</span><b>${esc(formatDateTime(order.payment_verified_at))}</b></div></div></section>
      <section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">FULFILMENT</p><h3>Save the complete handoff together</h3></div>${statusChip(order.inventory_committed ? 'inventory committed' : 'inventory not committed', order.inventory_committed ? 'is-success' : 'is-warning')}</div>${order.inventory_committed ? '<div class="aw-callout is-success">Inventory has been committed for this order and will not be decremented again.</div>' : '<div class="aw-callout is-warning">Inventory is committed once, automatically, when a verified order first moves into preparation or shipping.</div>'}<div class="aw-form-grid"><label class="aw-field"><span>Branch</span><select name="branch_id">${branchOptions(orderBranchId(order))}</select></label><label class="aw-field"><span>Order status</span><select name="status" required>${orderStatusOptions(order.status || 'confirmed')}</select></label><label class="aw-field"><span>Manual delivery charge</span><input type="number" name="delivery_charge" min="0" step="1" value="${number(order.delivery_charge)}" placeholder="0"></label><label class="aw-field"><span>Courier partner</span><input name="courier" value="${esc(order.courier)}" placeholder="e.g. Mark Express"></label><label class="aw-field"><span>AWB / consignment number</span><input name="awb" value="${esc(order.awb)}" placeholder="Courier reference"></label><label class="aw-field aw-field-wide"><span>Tracking URL</span><input type="url" name="tracking_url" value="${esc(order.tracking_url)}" placeholder="https://…"></label><label class="aw-field aw-field-wide"><span>Private admin note</span><textarea name="admin_note" maxlength="1000" placeholder="Visible only to administrators">${esc(order.admin_note)}</textarea></label></div><div class="aw-callout is-neutral">Use delivery charge after checking customer address/PIN. Order total will include this manual charge.</div></section>
      <div class="aw-drawer-footer"><div class="aw-actions"><button type="button" class="quiet-button" data-aw-print="invoice" data-aw-print-order="${esc(orderNumber(order))}">Invoice</button><button type="button" class="quiet-button" data-aw-print="packing" data-aw-print-order="${esc(orderNumber(order))}">Packing slip</button><button type="button" class="quiet-button" data-aw-print="label" data-aw-print-order="${esc(orderNumber(order))}">Shipping label</button></div><button type="submit" class="button">${currentPayment === 'verified' ? 'Save order' : 'Verify payment & save'}</button></div>
    </form>`, orderNumber(order));
    const handoffBranches = getBranches().filter(branch => branch.active !== false);
    const drawerForm = q('[data-aw-form="order"]');
    drawerForm?.insertAdjacentHTML('beforeend', `<section class="aw-section aw-whatsapp-handoff"><div class="aw-section-head"><div><p class="eyebrow">MANUAL BRANCH HANDOFF</p><h3>Send complete order on WhatsApp</h3></div></div><p>Choose a branch. WhatsApp opens with the complete order ready for you to review and send manually.</p><div class="aw-actions">${handoffBranches.map(branch => `<button type="button" class="quiet-button" data-aw-whatsapp-order="${esc(orderNumber(order))}" data-aw-whatsapp-branch="${esc(branch.id)}">${esc(branch.name)}${branch.whatsapp_phone ? ' ↗' : ' · number needed'}</button>`).join('')}</div></section>`);
  }
  async function saveOrderForm(form) {
    const orderNo = form.getAttribute('data-aw-order-id');
    const all = getOrders();
    const order = all.find(item => orderNumber(item) === orderNo);
    if (!order) throw new Error('Order not found. Refresh and try again.');
    const fields = new FormData(form);
    const nextStatus = text(fields.get('status')).toLowerCase();
    const nextPayment = text(fields.get('payment_status')).toLowerCase();
    const paymentReference = text(fields.get('payment_reference'));
    const deliveryCharge = Math.max(0, number(fields.get('delivery_charge')));
    const baseTotal = Math.max(0, number(order.subtotal || order.total) - number(order.discount));
    const courier = text(fields.get('courier'));
    const awb = text(fields.get('awb'));
    const trackingUrl = text(fields.get('tracking_url'));
    if (['verified', 'refunded'].includes(nextPayment) && !paymentReference) throw new Error('Add the verified payment reference before changing payment status.');
    if (['preparing', 'shipped', 'out for delivery', 'delivered'].includes(nextStatus) && nextPayment !== 'verified') throw new Error('Verify this payment with a real transaction reference before starting fulfilment.');
    if (['shipped', 'out for delivery', 'delivered'].includes(nextStatus) && (!courier || !awb)) throw new Error('Courier partner and AWB are required before an order can be shipped.');
    if (trackingUrl && !safeHttpUrl(trackingUrl)) throw new Error('Enter a complete http:// or https:// tracking URL.');
    const updatedAt = nowISO();
    const patch = {
      branch_id: text(fields.get('branch_id')) || null,
      status: nextStatus,
      payment_status: nextPayment,
      payment_reference: paymentReference || null,
      payment_verified_at: nextPayment === 'verified' ? (order.payment_verified_at || updatedAt) : null,
      courier: courier || null,
      awb: awb || null,
      tracking_url: trackingUrl || null,
      admin_note: text(fields.get('admin_note')) || null,
      delivery_charge: deliveryCharge,
      total: baseTotal + deliveryCharge,
      updated_at: updatedAt
    };
    const dbId = orderDbId(order);
    if (!dbId) throw new Error('This order does not have a database ID. Refresh before saving.');
    form.classList.add('is-saving');
    qa('button,input,select,textarea', form).forEach(control => { control.disabled = true; });
    try {
      await runOperation('Saving order', async () => {
        let inventoryCommitted = Boolean(order.inventory_committed);
        if (!inventoryCommitted && ['preparing', 'shipped', 'out for delivery', 'delivered'].includes(nextStatus)) {
          // The inventory RPC validates the payment status stored in the database.
          // Persist verification first so a newly verified order can be committed.
          if (text(order.payment_status).toLowerCase() !== nextPayment) {
            await apiRequest('orders', 'PATCH', {
              payment_status: patch.payment_status,
              payment_reference: patch.payment_reference,
              payment_verified_at: patch.payment_verified_at,
              updated_at: patch.updated_at
            }, `?id=eq.${encodeURIComponent(dbId)}`, { requireRow: true });
          }
          await apiRequest('rpc/commit_order_inventory', 'POST', { p_order_id: dbId }, '', { prefer: 'return=representation' });
          inventoryCommitted = true;
        }
        await apiRequest('orders', 'PATCH', patch, `?id=eq.${encodeURIComponent(dbId)}`, { requireRow: true });
        Object.assign(order, patch, { branch: patch.branch_id, inventory_committed: inventoryCommitted });
        writeCache(CACHE.orders, all);
        await logActivity('order updated', 'order', orderNo, { status: patch.status, payment_status: patch.payment_status, branch_id: patch.branch_id, courier: patch.courier, awb: patch.awb });
      }, `Order ${orderNo} saved.`);
      form.classList.remove('is-saving');
      form.classList.add('is-success');
      updateBadges();
      if (state.page === 'orders') updateOrderList(); else requestRender();
      openOrderDrawer(orderNo);
    } finally {
      qa('button,input,select,textarea', form).forEach(control => { control.disabled = false; });
      form.classList.remove('is-saving');
    }
  }

  function printOrder(orderNo, mode) {
    const order = getOrders().find(item => orderNumber(item) === text(orderNo));
    if (!order) return toast('Order not found for printing.', 'error');
    const allowed = ['invoice', 'packing', 'label'];
    if (!allowed.includes(mode)) return;
    q('#aw-print-root')?.remove();
    const customer = orderCustomer(order);
    const address = text(order.address || customer.address);
    const pincode = text(order.pincode || customer.pincode);
    const items = Array.isArray(order.items) ? order.items : [];
    let content;
    if (mode === 'label') {
      content = `<div class="aw-print-meta"><span>SHIP TO</span><b>${esc(orderCustomerName(order))}</b></div><div class="aw-print-address">${esc(address)}${pincode ? `<br><strong>${esc(pincode)}</strong>` : ''}<br>${esc(orderPhone(order))}</div><div class="aw-print-meta"><span>ORDER</span><b>${esc(orderNumber(order))}</b><span>COURIER / AWB</span><b>${esc(order.courier || 'Not assigned')} · ${esc(order.awb || 'Not assigned')}</b></div>`;
    } else {
      const showPrices = mode === 'invoice';
      content = `<div class="aw-print-meta"><span>${mode === 'invoice' ? 'INVOICE' : 'PACKING SLIP'}</span><b>${esc(orderNumber(order))}</b><span>DATE</span><b>${esc(formatDate(order.created_at))}</b></div><div class="aw-print-address"><b>${esc(orderCustomerName(order))}</b><br>${esc(address)}${pincode ? `, ${esc(pincode)}` : ''}<br>${esc(orderPhone(order))}</div><table class="aw-print-items"><thead><tr><th>Item</th><th>Qty</th>${showPrices ? '<th>Price</th><th>Total</th>' : ''}</tr></thead><tbody>${items.map(item => `<tr><td>${esc(item.name || 'Product')}</td><td>${Math.max(1, number(item.quantity))}</td>${showPrices ? `<td>${money(item.price)}</td><td>${money(number(item.price) * Math.max(1, number(item.quantity)))}</td>` : ''}</tr>`).join('')}</tbody></table>${showPrices ? `<div class="aw-print-totals"><span>Subtotal <b>${money(order.subtotal ?? order.total)}</b></span>${number(order.discount) ? `<span>Discount <b>−${money(order.discount)}</b></span>` : ''}<strong>Total <b>${money(order.total)}</b></strong><small>Payment: ${esc(order.payment_method || customer.payment || 'Not recorded')} · ${esc(titleCase(paymentStatus(order)))}</small></div>` : '<div class="aw-print-signature">Packed by __________________ &nbsp; Checked by __________________</div>'}`;
    }
    const printRoot = document.createElement('div');
    printRoot.id = 'aw-print-root';
    printRoot.className = 'aw-print-root aw-print-only';
    const documentNode = document.createElement('section');
    documentNode.id = 'aw-print-document';
    documentNode.className = `aw-print-document ${mode === 'invoice' ? 'is-invoice' : mode === 'packing' ? 'is-packing-slip' : 'is-shipping-label'}`;
    documentNode.innerHTML = `<header class="aw-print-header"><div><b>SSBS</b><span>PROFESSIONAL</span></div><p>Hair & Skin Care · Gujarat, India</p></header>${content}`;
    printRoot.append(documentNode);
    document.body.append(printRoot);
    document.body.classList.add('aw-printing');
    const cleanup = () => { document.body.classList.remove('aw-printing'); printRoot.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => { try { window.print(); } catch { cleanup(); } }, 20);
    setTimeout(() => { if (printRoot.isConnected) cleanup(); }, 60000);
  }

  function returnTabCount(tab, all = getReturns()) {
    if (tab === 'all') return all.length;
    if (tab === 'open') return all.filter(item => !CLOSED_RETURNS.has(text(item.status).toLowerCase())).length;
    if (tab === 'refunded') return all.filter(item => text(item.status).toLowerCase() === 'refund completed').length;
    return all.filter(item => text(item.status).toLowerCase() === tab).length;
  }
  function returnMatchesTab(item, tab) {
    const status = text(item.status).toLowerCase();
    if (tab === 'all') return true;
    if (tab === 'open') return !CLOSED_RETURNS.has(status);
    if (tab === 'refunded') return status === 'refund completed';
    return status === tab;
  }
  function linkedOrder(request) {
    return getOrders().find(order => orderNumber(order) === text(request.order_number) || orderDbId(order) === text(request.order_id));
  }
  function filteredReturns() {
    const needle = state.returnSearch.toLowerCase();
    return getReturns().filter(item => {
      const order = linkedOrder(item);
      const haystack = [item.order_number, item.phone, item.reason, item.details, order && orderCustomerName(order)].join(' ').toLowerCase();
      return returnMatchesTab(item, state.returnTab) && (!needle || haystack.includes(needle));
    }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }
  function returnTabs() {
    const tabs = [['open', 'Open'], ['requested', 'Requested'], ['approved', 'Approved'], ['returned', 'Product returned'], ['refunded', 'Marked refunded'], ['rejected', 'Rejected'], ['all', 'All']];
    return `<div class="aw-tabs" role="tablist" aria-label="Return status">${tabs.map(([value, label]) => `<button type="button" role="tab" class="aw-tab ${state.returnTab === value ? 'is-active' : ''}" aria-selected="${state.returnTab === value}" data-aw-return-tab="${esc(value)}"><span>${esc(label)}</span><b data-aw-return-tab-count="${esc(value)}">${returnTabCount(value)}</b></button>`).join('')}</div>`;
  }
  function returnModifier(status) {
    const value = text(status).toLowerCase();
    if (value === 'refund completed') return 'is-refunded';
    return `is-${slug(value || 'requested')}`;
  }
  function renderReturnsPage() {
    const root = q('#aw-page');
    if (!root) return;
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');
    if (requestedTab && ['open', 'requested', 'approved', 'returned', 'refunded', 'rejected', 'all'].includes(requestedTab)) state.returnTab = requestedTab;
    root.innerHTML = `${pageHead('After-sales care', 'Returns', 'Review requests separately from fulfilment. A refund is only recorded after you enter its real reference and amount.', `<button type="button" class="button" data-aw-refresh>Refresh returns</button>`)}
      <section class="aw-section aw-return-workspace">${returnTabs()}<div class="aw-toolbar"><label class="aw-search"><span class="aw-cell-label">Search returns</span><input type="search" value="${esc(state.returnSearch)}" placeholder="Order, customer, phone, reason…" data-aw-return-search></label><a class="quiet-button" href="admin-orders.html">Back to orders</a></div><div class="aw-return-list" data-aw-return-list>${returnRows(filteredReturns())}</div></section>`;
    const requestedReturn = params.get('return');
    if (requestedReturn && !state.initialActionHandled) {
      state.initialActionHandled = true;
      setTimeout(() => openReturnDrawer(requestedReturn), 0);
    }
  }
  function returnRows(items) {
    if (!items.length) return emptyState('No matching return requests', 'There is nothing requiring action in this view.');
    return items.map(item => {
      const order = linkedOrder(item);
      const status = text(item.status).toLowerCase() || 'requested';
      const amount = status === 'refund completed' && item.refund_amount != null ? ` · ${money(item.refund_amount)}` : '';
      return `<article class="aw-return-card ${returnModifier(status)}"><div class="aw-return-summary"><span><b>${esc(item.order_number)}</b><small>${esc(order ? orderCustomerName(order) : item.phone)} · ${esc(relativeTime(item.created_at))}</small></span>${statusChip(status === 'refund completed' ? 'marked refunded' : status)}</div><div class="aw-return-reason"><span>Reason</span><b>${esc(item.reason || 'Not recorded')}</b><small>${esc(item.details || 'No additional details')}${esc(amount)}</small></div><div class="aw-actions"><button type="button" class="quiet-button" data-aw-open-return="${esc(item.id)}">Review</button></div></article>`;
    }).join('');
  }
  function updateReturnList() {
    const list = q('[data-aw-return-list]');
    if (list) list.innerHTML = returnRows(filteredReturns());
    qa('[data-aw-return-tab]').forEach(button => {
      const active = button.getAttribute('data-aw-return-tab') === state.returnTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    qa('[data-aw-return-tab-count]').forEach(node => { node.textContent = String(returnTabCount(node.getAttribute('data-aw-return-tab-count'))); });
  }
  function returnTimeline(status) {
    const current = text(status).toLowerCase();
    const stages = [['requested', 'Request received'], ['approved', 'Approved'], ['returned', 'Product received'], ['refund completed', 'Refund recorded']];
    const currentIndex = stages.findIndex(([value]) => value === current);
    if (current === 'rejected') return `<div class="aw-return-timeline"><div class="aw-return-step is-rejected"><i>!</i><span>Request rejected</span></div></div>`;
    return `<div class="aw-return-timeline">${stages.map(([value, label], index) => `<div class="aw-return-step ${index < currentIndex ? 'is-success' : index === currentIndex ? 'is-active' : ''}"><i>${index < currentIndex ? '✓' : index + 1}</i><span>${esc(label)}</span></div>`).join('')}</div>`;
  }
  function openReturnDrawer(id) {
    const request = getReturns().find(item => text(item.id) === text(id));
    if (!request) return toast('That return request is no longer available. Refresh and try again.', 'error');
    const order = linkedOrder(request);
    const status = text(request.status).toLowerCase() || 'requested';
    const maxRefund = number(order?.total);
    const canRefund = status === 'returned';
    const refundRecorded = status === 'refund completed';
    openDrawer('return', `Return ${request.order_number}`, 'RETURN REVIEW', `<section class="aw-return-summary ${returnModifier(status)}"><div><span>Customer</span><b>${esc(order ? orderCustomerName(order) : request.phone)}</b><small>${esc(order ? orderPhone(order) : request.phone)}</small></div><div><span>Order value</span><b>${money(maxRefund)}</b><small>${esc(formatDateTime(request.created_at))}</small></div>${statusChip(refundRecorded ? 'marked refunded' : status)}</section>
      <section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">CUSTOMER REQUEST</p><h3>${esc(request.reason)}</h3></div></div><p>${esc(request.details || 'No additional details were provided.')}</p>${returnTimeline(status)}</section>
      ${order ? `<section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">ORDER</p><h3>${esc(orderNumber(order))}</h3></div><button type="button" class="quiet-button" data-aw-open-order="${esc(orderNumber(order))}">Open order</button></div>${orderItemsMarkup(order)}</section>` : ''}
      ${refundRecorded ? `<section class="aw-refund-summary is-refunded"><p class="eyebrow">MANUAL REFUND RECORDED</p><h3>${money(request.refund_amount)}</h3><p>Reference <b class="aw-transaction-ref">${esc(request.refund_reference || 'Not recorded')}</b></p><small>Recorded ${esc(formatDateTime(request.updated_at))}. This confirms an administrator recorded an external refund; it is not an automated bank transaction.</small></section>` : `<form class="aw-form" data-aw-form="return" data-aw-return-id="${esc(request.id)}"><section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">REVIEW DECISION</p><h3>Update the return journey</h3></div></div><div class="aw-form-grid"><label class="aw-field"><span>Return status</span><select name="status" required>${RETURN_STATUSES.map(value => `<option value="${esc(value)}" ${value === status ? 'selected' : ''}>${esc(titleCase(value))}</option>`).join('')}</select></label><label class="aw-field aw-field-wide"><span>Private admin notes</span><textarea name="admin_notes" maxlength="1200" placeholder="Checks completed, customer communication, pickup notes…">${esc(request.admin_notes)}</textarea></label></div><div class="aw-drawer-footer"><button type="submit" class="button">Save return decision</button></div></section></form>
      <form class="aw-refund-form" data-aw-form="refund" data-aw-return-id="${esc(request.id)}"><div class="aw-section-head"><div><p class="eyebrow">MANUAL REFUND RECORD</p><h3>Mark refunded only after the external payment is complete</h3></div></div><p>This does not send money. Confirm the refund in your bank/payment provider first, then record the proof here.</p><div class="aw-form-grid"><label class="aw-field"><span>Refund amount</span><input type="number" name="refund_amount" min="1" max="${Math.max(1, maxRefund)}" value="${maxRefund || ''}" required ${canRefund ? '' : 'disabled'}></label><label class="aw-field"><span>Bank / payment refund reference</span><input name="refund_reference" maxlength="160" placeholder="Required proof of refund" required ${canRefund ? '' : 'disabled'}></label><label class="aw-field aw-field-wide"><span>Private refund note</span><textarea name="admin_notes" maxlength="1200" placeholder="Optional internal context" ${canRefund ? '' : 'disabled'}>${esc(request.admin_notes)}</textarea></label></div>${canRefund ? `<button type="submit" class="button">Mark refund as recorded</button>` : `<div class="aw-callout is-warning">Move the return to “Returned” after the product is received before recording a refund.</div>`}</form>`}
    `, request.id);
  }
  async function saveReturnDecision(form) {
    const id = form.getAttribute('data-aw-return-id');
    const all = getReturns();
    const request = all.find(item => text(item.id) === text(id));
    if (!request) throw new Error('Return request not found. Refresh and try again.');
    const fields = new FormData(form);
    const nextStatus = text(fields.get('status')).toLowerCase();
    if (!RETURN_STATUSES.includes(nextStatus)) throw new Error('Choose a valid return status.');
    if (nextStatus === 'rejected') {
      const confirmed = await confirmAction({ title: `Reject return ${request.order_number}?`, message: 'The customer will see this request as rejected. You can change it later, but the decision should be reviewed first.', confirmLabel: 'Reject request' });
      if (!confirmed) return;
    }
    const patch = { status: nextStatus, admin_notes: text(fields.get('admin_notes')) || null, updated_at: nowISO() };
    await runOperation('Saving return decision', async () => {
      await apiRequest('return_requests', 'PATCH', patch, `?id=eq.${encodeURIComponent(id)}`, { requireRow: true });
      Object.assign(request, patch);
      writeCache(CACHE.returns, all);
      await logActivity('return decision updated', 'return_request', id, { order_number: request.order_number, status: nextStatus });
    }, `Return ${request.order_number} updated.`);
    updateBadges();
    if (state.page === 'returns') updateReturnList(); else requestRender();
    openReturnDrawer(id);
  }
  async function saveRefundRecord(form) {
    const id = form.getAttribute('data-aw-return-id');
    const returnsList = getReturns();
    const request = returnsList.find(item => text(item.id) === text(id));
    if (!request) throw new Error('Return request not found. Refresh and try again.');
    if (text(request.status).toLowerCase() !== 'returned') throw new Error('Record the product as returned before marking a refund.');
    const order = linkedOrder(request);
    const fields = new FormData(form);
    const amount = number(fields.get('refund_amount'));
    const reference = text(fields.get('refund_reference'));
    if (!reference) throw new Error('A real bank or payment refund reference is required.');
    if (amount <= 0 || (order && amount > number(order.total))) throw new Error('Enter a valid refund amount no greater than the order total.');
    const confirmed = await confirmAction({ title: `Record ${money(amount)} refunded?`, message: `Confirm that ${money(amount)} was already refunded outside this website. Reference: ${reference}. This action records proof; it does not send money.`, confirmLabel: 'Record completed refund' });
    if (!confirmed) return;
    const patch = { status: 'refund completed', refund_amount: amount, refund_reference: reference, admin_notes: text(fields.get('admin_notes')) || null, updated_at: nowISO() };
    await runOperation('Recording manual refund', async () => {
      await apiRequest('return_requests', 'PATCH', patch, `?id=eq.${encodeURIComponent(id)}`, { requireRow: true });
      Object.assign(request, patch);
      writeCache(CACHE.returns, returnsList);
      if (order && orderDbId(order)) {
        try {
          const orderPatch = { payment_status: 'refunded', updated_at: patch.updated_at };
          await apiRequest('orders', 'PATCH', orderPatch, `?id=eq.${encodeURIComponent(orderDbId(order))}`, { requireRow: true });
          const allOrders = getOrders();
          const cachedOrder = allOrders.find(item => orderNumber(item) === orderNumber(order));
          if (cachedOrder) Object.assign(cachedOrder, orderPatch);
          writeCache(CACHE.orders, allOrders);
        } catch (error) {
          toast(`Refund proof is recorded, but the order payment status could not sync: ${error.message}`, 'error', 7000);
        }
      }
      await logActivity('manual refund recorded', 'return_request', id, { order_number: request.order_number, refund_amount: amount, refund_reference: reference });
    }, `Manual refund recorded for ${request.order_number}.`);
    updateBadges();
    if (state.page === 'returns') updateReturnList(); else requestRender();
    openReturnDrawer(id);
  }

  function productStockState(product) {
    const stock = number(product.stock_quantity);
    const threshold = number(product.low_stock_threshold);
    if (product.active === false) return { key: 'archived', label: 'Archived' };
    if (stock <= 0) return { key: 'urgent', label: 'Out of stock' };
    if (stock <= threshold) return { key: 'warning', label: 'Low stock' };
    return { key: 'success', label: 'In stock' };
  }
  function productMatchesTab(product, tab) {
    const stock = number(product.stock_quantity);
    const threshold = number(product.low_stock_threshold);
    if (tab === 'all') return true;
    if (tab === 'archived') return product.active === false;
    if (tab === 'low') return product.active !== false && stock <= threshold;
    return product.active !== false;
  }
  function filteredProducts() {
    const needle = state.productSearch.toLowerCase();
    return getProducts().filter(product => productMatchesTab(product, state.productTab) && (!needle || [product.name, product.sku, product.type, product.kind].join(' ').toLowerCase().includes(needle)));
  }
  function productTabCount(tab) { return getProducts().filter(product => productMatchesTab(product, tab)).length; }
  function renderProductsPage() {
    const root = q('#aw-page');
    if (!root) return;
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');
    if (requestedTab && ['active', 'low', 'archived', 'all'].includes(requestedTab)) state.productTab = requestedTab;
    const tabs = [['active', 'Active'], ['low', 'Low stock'], ['archived', 'Archived'], ['all', 'All']];
    root.innerHTML = `${pageHead('Catalogue', 'Products', 'Manage publish state, inventory and the storefront image from one catalogue.', `<button type="button" class="button" data-aw-new-product>Add product</button>`)}<section class="aw-section"><div class="aw-tabs" role="tablist" aria-label="Product status">${tabs.map(([value, label]) => `<button type="button" role="tab" class="aw-tab ${state.productTab === value ? 'is-active' : ''}" aria-selected="${state.productTab === value}" data-aw-product-tab="${esc(value)}"><span>${esc(label)}</span><b data-aw-product-tab-count="${esc(value)}">${productTabCount(value)}</b></button>`).join('')}</div><div class="aw-toolbar"><label class="aw-search"><span class="aw-cell-label">Search products</span><input type="search" value="${esc(state.productSearch)}" placeholder="Name, SKU, collection…" data-aw-product-search></label><button type="button" class="quiet-button" data-aw-refresh>Refresh inventory</button></div><div class="aw-table-wrap" data-aw-product-list>${productRows(filteredProducts())}</div></section>`;
    q('.aw-toolbar', root)?.insertAdjacentHTML('beforeend', '<button type="button" class="button" data-aw-bulk-products disabled>Bulk edit <b data-aw-selection-count>0</b></button>');
    enhanceProductSelection();
  }
  function productRows(items) {
    if (!items.length) return emptyState('No matching products', 'Try another inventory view or search term.', '<button type="button" class="button" data-aw-new-product>Add product</button>');
    return `<table class="aw-table aw-product-table" data-aw-responsive="cards"><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Inventory</th><th>Storefront</th><th></th></tr></thead><tbody>${items.map(product => {
      const image = safeImage(product.image_url);
      const stock = productStockState(product);
      return `<tr><td data-label="Product"><div class="aw-product-cell">${image ? `<img src="${esc(image)}" alt="" loading="lazy" decoding="async">` : '<span class="aw-product-placeholder">SSBS</span>'}<span><b>${esc(product.name)}</b><small>${esc(product.type || titleCase(product.kind))}</small></span></div></td><td data-label="SKU"><code>${esc(product.sku || 'Not set')}</code></td><td data-label="Price"><b>${money(product.price)}</b></td><td data-label="Inventory"><b>${number(product.stock_quantity)}</b><small>Alert at ${number(product.low_stock_threshold)}</small>${statusChip(stock.label, `is-${stock.key}`)}</td><td data-label="Storefront">${statusChip(product.active === false ? 'archived' : 'active')}</td><td data-label="Actions"><div class="aw-actions"><button type="button" class="quiet-button" data-aw-edit-product="${esc(product.id)}">Edit</button><button type="button" class="quiet-button ${product.active === false ? '' : 'danger'}" data-aw-toggle-product="${esc(product.id)}" data-aw-next-active="${product.active === false}">${product.active === false ? 'Restore' : 'Archive'}</button></div></td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function updateProductList() {
    const list = q('[data-aw-product-list]');
    if (list) list.innerHTML = productRows(filteredProducts());
    qa('[data-aw-product-tab]').forEach(button => {
      const active = button.getAttribute('data-aw-product-tab') === state.productTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    qa('[data-aw-product-tab-count]').forEach(node => { node.textContent = String(productTabCount(node.getAttribute('data-aw-product-tab-count'))); });
    enhanceProductSelection();
  }
  function enhanceProductSelection() {
    qa('.aw-product-table tbody tr').forEach(row => {
      const id = q('[data-aw-edit-product]', row)?.getAttribute('data-aw-edit-product');
      const cell = q('td', row);
      if (!id || !cell || q('[data-aw-select-product]', row)) return;
      cell.insertAdjacentHTML('afterbegin', `<label class="aw-row-select"><input type="checkbox" data-aw-select-product="${esc(id)}" ${state.productSelection.has(text(id)) ? 'checked' : ''}><span class="sr-only">Select product</span></label>`);
    });
    updateProductSelectionButton();
  }
  function updateProductSelectionButton() {
    const count = state.productSelection.size;
    const button = q('[data-aw-bulk-products]');
    if (button) button.disabled = count === 0;
    const label = q('[data-aw-selection-count]');
    if (label) label.textContent = String(count);
  }
  function openBulkProductDrawer() {
    const ids = [...state.productSelection];
    if (!ids.length) return toast('Select at least one product first.', 'error');
    openDrawer('bulk-product', `Edit ${ids.length} products`, 'BULK CATALOGUE UPDATE', `<form class="aw-form" data-aw-form="bulk-product"><div class="aw-callout is-neutral">Only completed fields will be changed. Existing values in blank fields remain untouched.</div><div class="aw-form-grid"><label class="aw-field"><span>Set MRP</span><input type="number" name="mrp" min="0" step="1" placeholder="No change"></label><label class="aw-field"><span>Set discounted price</span><input type="number" name="price" min="0" step="1" placeholder="No change"></label><label class="aw-field"><span>Adjust stock by</span><input type="number" name="stock_adjustment" step="1" placeholder="e.g. 10 or -5"></label><label class="aw-field"><span>Storefront status</span><select name="active"><option value="">No change</option><option value="true">Active</option><option value="false">Archived</option></select></label></div><div class="aw-drawer-footer"><button type="button" class="quiet-button" data-aw-close-drawer>Cancel</button><button type="submit" class="button">Update ${ids.length} products</button></div></form>`, ids.join(','));
  }
  async function saveBulkProductForm(form) {
    const ids = [...state.productSelection];
    const fields = new FormData(form);
    const hasMrp = text(fields.get('mrp')) !== '', hasPrice = text(fields.get('price')) !== '', hasStock = text(fields.get('stock_adjustment')) !== '', activeValue = text(fields.get('active'));
    if (!hasMrp && !hasPrice && !hasStock && !activeValue) throw new Error('Choose at least one bulk change.');
    const all = getProducts();
    const changed = all.filter(product => ids.includes(text(product.id))).map(product => {
      const next = { ...product, updated_at: nowISO() };
      if (hasMrp) next.mrp = number(fields.get('mrp'));
      if (hasPrice) next.price = number(fields.get('price'));
      if (hasStock) next.stock_quantity = Math.max(0, number(product.stock_quantity) + number(fields.get('stock_adjustment')));
      if (activeValue) next.active = activeValue === 'true';
      if (number(next.mrp || next.price) < number(next.price)) throw new Error(`MRP cannot be lower than price for ${product.name}.`);
      return next;
    });
    await runOperation('Updating selected products', async () => {
      await Promise.all(changed.map(product => apiRequest('products', 'PATCH', { mrp: product.mrp, price: product.price, stock_quantity: product.stock_quantity, active: product.active, updated_at: product.updated_at }, `?id=eq.${encodeURIComponent(product.id)}`, { requireRow: true })));
      const byId = new Map(changed.map(product => [text(product.id), product]));
      writeCache(CACHE.products, all.map(product => byId.get(text(product.id)) || product));
      await logActivity('products bulk updated', 'product', ids.join(','), { count: changed.length });
    }, `${changed.length} products updated.`);
    state.productSelection.clear();
    closeDrawer();
    requestRender();
  }
  function openProductDrawer(id = '', seed = null) {
    const existing = id ? getProducts().find(item => text(item.id) === text(id)) : null;
    if (id && !existing) return toast('That product is no longer available. Refresh and try again.', 'error');
    const item = existing || seed || {};
    const conversionId = text(seed?.source_upcoming_id);
    const image = safeImage(item.image_url);
    openDrawer('product', existing ? `Edit ${item.name}` : conversionId ? 'Convert launch to product' : 'Add product', 'CATALOGUE', `<form class="aw-form" data-aw-form="product" data-aw-product-id="${esc(existing?.id || '')}" data-aw-source-upcoming="${esc(conversionId)}"><div class="aw-media-editor"><div class="aw-image-preview" data-aw-image-preview>${image ? `<img src="${esc(image)}" alt="Product preview">` : '<span>Image preview</span>'}</div><div><label class="aw-field"><span>Main product image</span><input type="file" name="image_file" accept="image/jpeg,image/png,image/webp" data-aw-image-file></label><label class="aw-field"><span>Or image URL</span><input type="url" name="image_url" value="${esc(item.image_url)}" placeholder="https://…" data-aw-image-url></label><small>JPG, PNG or WebP · maximum 5 MB.</small></div></div><div class="aw-form-grid"><label class="aw-field aw-field-wide"><span>Product name</span><input name="name" value="${esc(item.name)}" maxlength="160" required></label><label class="aw-field"><span>SKU</span><input name="sku" value="${esc(item.sku)}" maxlength="80" placeholder="SSBS-HAIR-001" required></label><label class="aw-field"><span>Category</span><select name="kind" required><option value="hair" ${item.kind === 'hair' ? 'selected' : ''}>Hair care</option><option value="skin" ${item.kind === 'skin' ? 'selected' : ''}>Skin care</option></select></label><label class="aw-field aw-field-wide"><span>Collection / type</span><input name="type" value="${esc(item.type)}" maxlength="160" placeholder="Hair care · 200 ml" required></label><label class="aw-field"><span>Price</span><input type="number" name="price" min="0" step="1" value="${item.price == null ? '' : number(item.price)}" required></label><label class="aw-field"><span>Stock quantity</span><input type="number" name="stock_quantity" min="0" step="1" value="${item.stock_quantity == null ? '0' : number(item.stock_quantity)}" required></label><label class="aw-field"><span>Low-stock alert at</span><input type="number" name="low_stock_threshold" min="0" step="1" value="${item.low_stock_threshold == null ? '5' : number(item.low_stock_threshold)}" required></label><label class="aw-field aw-check"><input type="checkbox" name="active" ${item.active === false ? '' : 'checked'}><span>Visible on the storefront</span></label></div>${conversionId ? '<div class="aw-callout is-neutral">The launch details are carried across. After this product saves, the launch teaser will be hidden.</div>' : ''}<div class="aw-drawer-footer"><button type="button" class="quiet-button" data-aw-close-drawer>Cancel</button><button type="submit" class="button">${existing ? 'Save product' : conversionId ? 'Create live product' : 'Add product'}</button></div></form>`, existing?.id || conversionId);
    const priceField = q('input[name="price"]', q('[data-aw-form="product"]'));
    priceField?.closest('label')?.insertAdjacentHTML('beforebegin', `<label class="aw-field"><span>MRP</span><input type="number" name="mrp" min="0" step="1" value="${item.mrp == null ? number(item.price) : number(item.mrp)}" required></label>`);
    if (priceField?.closest('label')?.querySelector('span')) priceField.closest('label').querySelector('span').textContent = 'Discounted price';
  }
  async function uploadWorkspaceImage(file) {
    if (!file || !file.size) return '';
    try {
      if (typeof uploadProductImage === 'function') return await uploadProductImage(file);
    } catch (error) { throw error; }
    throw new Error('Image upload is unavailable. Save with an image URL instead.');
  }
  async function saveProductForm(form) {
    const id = text(form.getAttribute('data-aw-product-id'));
    const sourceUpcomingId = text(form.getAttribute('data-aw-source-upcoming'));
    const all = getProducts();
    const existing = all.find(item => text(item.id) === id);
    const fields = new FormData(form);
    const file = fields.get('image_file');
    const requestedUrl = text(fields.get('image_url'));
    if (number(fields.get('mrp')) < number(fields.get('price'))) throw new Error('MRP must be equal to or higher than the discounted price.');
    if (requestedUrl && !safeImage(requestedUrl)) throw new Error('Use a safe https:// image URL.');
    const submit = q('button[type="submit"]', form);
    submit.disabled = true;
    form.classList.add('is-saving');
    try {
      await runOperation(existing ? 'Saving product' : 'Creating product', async () => {
        const uploadedUrl = await uploadWorkspaceImage(file);
        const item = {
          id: existing?.id || crypto.randomUUID(),
          name: text(fields.get('name')),
          sku: text(fields.get('sku')).toUpperCase(),
          kind: text(fields.get('kind')),
          type: text(fields.get('type')),
          price: number(fields.get('price')),
          mrp: number(fields.get('mrp')),
          stock_quantity: number(fields.get('stock_quantity')),
          low_stock_threshold: number(fields.get('low_stock_threshold')),
          image_url: uploadedUrl || requestedUrl || existing?.image_url || '',
          active: form.elements.active.checked,
          updated_at: nowISO()
        };
        if (!item.name || !item.sku || !item.type) throw new Error('Name, SKU and collection are required.');
        if (all.some(product => product !== existing && text(product.sku).toUpperCase() === item.sku)) throw new Error(`SKU ${item.sku} is already in use.`);
        await apiRequest('products', 'POST', [item], '?on_conflict=id', { requireRow: true });
        const next = existing ? all.map(product => product === existing ? { ...existing, ...item } : product) : [item, ...all];
        writeCache(CACHE.products, next);
        await logActivity(existing ? 'product updated' : 'product created', 'product', item.id, { name: item.name, sku: item.sku, active: item.active, stock_quantity: item.stock_quantity });
        if (sourceUpcomingId) {
          try {
            const launchPatch = { active: false };
            await apiRequest('upcoming_products', 'PATCH', launchPatch, `?id=eq.${encodeURIComponent(sourceUpcomingId)}`, { requireRow: true });
            const launches = getUpcoming();
            const source = launches.find(launch => text(launch.id) === sourceUpcomingId);
            if (source) Object.assign(source, launchPatch);
            writeCache(CACHE.upcoming, launches);
            await logActivity('launch converted to product', 'upcoming_product', sourceUpcomingId, { product_id: item.id });
          } catch (error) {
            toast(`Product created, but the launch teaser could not be hidden: ${error.message}`, 'error', 7000);
          }
        }
      }, existing ? 'Product saved.' : sourceUpcomingId ? 'Product created and launch converted.' : 'Product added.');
      closeDrawer();
      updateBadges();
      requestRender();
    } finally {
      submit.disabled = false;
      form.classList.remove('is-saving');
    }
  }
  async function toggleProduct(id, nextActive) {
    const all = getProducts();
    const product = all.find(item => text(item.id) === text(id));
    if (!product) return toast('Product not found. Refresh and try again.', 'error');
    if (!nextActive) {
      const confirmed = await confirmAction({ title: `Archive ${product.name}?`, message: 'It will disappear from the storefront but remain available in Archived products.', confirmLabel: 'Archive product' });
      if (!confirmed) return;
    }
    const patch = { active: Boolean(nextActive), updated_at: nowISO() };
    await runOperation(nextActive ? 'Restoring product' : 'Archiving product', async () => {
      await apiRequest('products', 'PATCH', patch, `?id=eq.${encodeURIComponent(product.id)}`, { requireRow: true });
      Object.assign(product, patch);
      writeCache(CACHE.products, all);
      await logActivity(nextActive ? 'product restored' : 'product archived', 'product', product.id, { name: product.name });
    }, nextActive ? `${product.name} restored.` : `${product.name} archived.`);
    updateBadges();
    updateProductList();
  }

  function upcomingMatches(item) {
    const visible = item.active !== false;
    if (state.upcomingTab === 'visible' && !visible) return false;
    if (state.upcomingTab === 'hidden' && visible) return false;
    const needle = state.upcomingSearch.toLowerCase();
    return !needle || [item.name, item.kind, item.description, item.launch_date].join(' ').toLowerCase().includes(needle);
  }
  function renderUpcomingPage() {
    const root = q('#aw-page');
    if (!root) return;
    const tabs = [['all', 'All'], ['visible', 'Visible'], ['hidden', 'Hidden']];
    root.innerHTML = `${pageHead('Launch planner', 'Launches', 'Edit teasers, control visibility, then convert launch details into a live product.', `<button type="button" class="button" data-aw-new-upcoming>Add launch</button>`)}<section class="aw-section"><div class="aw-tabs" role="tablist" aria-label="Launch visibility">${tabs.map(([value, label]) => `<button type="button" class="aw-tab ${state.upcomingTab === value ? 'is-active' : ''}" data-aw-upcoming-tab="${esc(value)}"><span>${esc(label)}</span><b>${getUpcoming().filter(item => value === 'all' || (value === 'visible' ? item.active !== false : item.active === false)).length}</b></button>`).join('')}</div><div class="aw-toolbar"><label class="aw-search"><span class="aw-cell-label">Search launches</span><input type="search" value="${esc(state.upcomingSearch)}" placeholder="Name, category, date…" data-aw-upcoming-search></label><button type="button" class="quiet-button" data-aw-refresh>Refresh launches</button></div><div class="aw-list" data-aw-upcoming-list>${upcomingRows(getUpcoming().filter(upcomingMatches))}</div></section>`;
  }
  function upcomingRows(items) {
    if (!items.length) return emptyState('No matching launches', 'Create a launch teaser or change the current view.', '<button type="button" class="button" data-aw-new-upcoming>Add launch</button>');
    return items.map(item => {
      const image = safeImage(item.image_url);
      return `<article class="aw-row aw-upcoming-row"><div class="aw-product-cell">${image ? `<img src="${esc(image)}" alt="" loading="lazy">` : '<span class="aw-product-placeholder">SSBS</span>'}<span><b>${esc(item.name)}</b><small>${esc(titleCase(item.kind))} · ${esc(item.launch_date ? formatDate(item.launch_date) : 'Date not announced')}</small></span></div>${statusChip(item.active === false ? 'hidden' : 'visible')}<div class="aw-actions"><button type="button" class="quiet-button" data-aw-edit-upcoming="${esc(item.id)}">Edit</button><button type="button" class="quiet-button" data-aw-toggle-upcoming="${esc(item.id)}" data-aw-next-active="${item.active === false}">${item.active === false ? 'Show' : 'Hide'}</button><button type="button" class="button" data-aw-convert-upcoming="${esc(item.id)}">Convert to product</button></div></article>`;
    }).join('');
  }
  function updateUpcomingList() {
    const list = q('[data-aw-upcoming-list]');
    if (list) list.innerHTML = upcomingRows(getUpcoming().filter(upcomingMatches));
    qa('[data-aw-upcoming-tab]').forEach(button => button.classList.toggle('is-active', button.getAttribute('data-aw-upcoming-tab') === state.upcomingTab));
  }
  function openUpcomingDrawer(id = '') {
    const existing = id ? getUpcoming().find(item => text(item.id) === text(id)) : null;
    if (id && !existing) return toast('That launch is no longer available. Refresh and try again.', 'error');
    const item = existing || {};
    const image = safeImage(item.image_url);
    openDrawer('upcoming', existing ? `Edit ${item.name}` : 'Add launch', 'LAUNCH PLANNER', `<form class="aw-form" data-aw-form="upcoming" data-aw-upcoming-id="${esc(existing?.id || '')}"><div class="aw-media-editor"><div class="aw-image-preview" data-aw-image-preview>${image ? `<img src="${esc(image)}" alt="Launch preview">` : '<span>Image preview</span>'}</div><div><label class="aw-field"><span>Launch image</span><input type="file" name="image_file" accept="image/jpeg,image/png,image/webp" data-aw-image-file></label><label class="aw-field"><span>Or image URL</span><input type="url" name="image_url" value="${esc(item.image_url)}" placeholder="https://…" data-aw-image-url></label></div></div><div class="aw-form-grid"><label class="aw-field aw-field-wide"><span>Product name</span><input name="name" value="${esc(item.name)}" maxlength="160" required></label><label class="aw-field"><span>Category</span><select name="kind"><option value="hair" ${item.kind === 'hair' ? 'selected' : ''}>Hair care</option><option value="skin" ${item.kind === 'skin' ? 'selected' : ''}>Skin care</option></select></label><label class="aw-field"><span>Launch date</span><input type="date" name="launch_date" value="${esc(text(item.launch_date).slice(0, 10))}"></label><label class="aw-field aw-field-wide"><span>Teaser description</span><textarea name="description" maxlength="1000" required>${esc(item.description)}</textarea></label><label class="aw-field aw-check"><input type="checkbox" name="active" ${item.active === false ? '' : 'checked'}><span>Visible on Coming Soon</span></label></div><div class="aw-drawer-footer"><button type="button" class="quiet-button" data-aw-close-drawer>Cancel</button><button type="submit" class="button">${existing ? 'Save launch' : 'Add launch'}</button></div></form>`, existing?.id || 'new');
  }
  async function saveUpcomingForm(form) {
    const id = text(form.getAttribute('data-aw-upcoming-id'));
    const all = getUpcoming();
    const existing = all.find(item => text(item.id) === id);
    const fields = new FormData(form);
    const file = fields.get('image_file');
    const requestedUrl = text(fields.get('image_url'));
    if (requestedUrl && !safeImage(requestedUrl)) throw new Error('Use a safe https:// image URL.');
    const submit = q('button[type="submit"]', form);
    submit.disabled = true;
    try {
      await runOperation(existing ? 'Saving launch' : 'Creating launch', async () => {
        const uploaded = await uploadWorkspaceImage(file);
        const item = { id: existing?.id || crypto.randomUUID(), name: text(fields.get('name')), kind: text(fields.get('kind')), description: text(fields.get('description')), launch_date: text(fields.get('launch_date')) || null, image_url: uploaded || requestedUrl || existing?.image_url || '', active: form.elements.active.checked };
        await apiRequest('upcoming_products', 'POST', [item], '?on_conflict=id', { requireRow: true });
        writeCache(CACHE.upcoming, existing ? all.map(entry => entry === existing ? { ...existing, ...item } : entry) : [item, ...all]);
        await logActivity(existing ? 'launch updated' : 'launch created', 'upcoming_product', item.id, { name: item.name, active: item.active, launch_date: item.launch_date });
      }, existing ? 'Launch saved.' : 'Launch added.');
      closeDrawer();
      requestRender();
    } finally { submit.disabled = false; }
  }
  async function toggleUpcoming(id, nextActive) {
    const all = getUpcoming();
    const item = all.find(entry => text(entry.id) === text(id));
    if (!item) return toast('Launch not found. Refresh and try again.', 'error');
    const patch = { active: Boolean(nextActive) };
    await runOperation(nextActive ? 'Showing launch' : 'Hiding launch', async () => {
      await apiRequest('upcoming_products', 'PATCH', patch, `?id=eq.${encodeURIComponent(item.id)}`, { requireRow: true });
      Object.assign(item, patch);
      writeCache(CACHE.upcoming, all);
      await logActivity(nextActive ? 'launch shown' : 'launch hidden', 'upcoming_product', item.id, { name: item.name });
    }, nextActive ? `${item.name} is visible.` : `${item.name} is hidden.`);
    updateUpcomingList();
  }
  async function convertUpcoming(id) {
    const item = getUpcoming().find(entry => text(entry.id) === text(id));
    if (!item) return toast('Launch not found. Refresh and try again.', 'error');
    const confirmed = await confirmAction({ title: `Convert ${item.name}?`, message: 'We will carry its name, category and image into a new product form. The launch stays visible until the product saves successfully.', confirmLabel: 'Continue to product' , danger: false });
    if (!confirmed) return;
    openProductDrawer('', { source_upcoming_id: item.id, name: item.name, kind: item.kind, image_url: item.image_url, type: `${titleCase(item.kind)} care`, active: true, stock_quantity: 0, low_stock_threshold: 5 });
  }

  function couponState(coupon) {
    const today = todayISO();
    if (coupon.expires_at && text(coupon.expires_at).slice(0, 10) < today) return { key: 'expired', label: 'Expired' };
    if (coupon.starts_at && text(coupon.starts_at).slice(0, 10) > today) return { key: 'scheduled', label: 'Scheduled' };
    if (coupon.active === false) return { key: 'paused', label: 'Paused' };
    return { key: 'active', label: 'Active' };
  }
  function couponTabCount(tab) { return getCoupons().filter(coupon => tab === 'all' || couponState(coupon).key === tab).length; }
  function filteredCoupons() { return getCoupons().filter(coupon => state.couponTab === 'all' || couponState(coupon).key === state.couponTab); }
  function renderCouponsPage() {
    const root = q('#aw-page');
    if (!root) return;
    const tabs = [['all', 'All'], ['active', 'Active'], ['scheduled', 'Scheduled'], ['paused', 'Paused'], ['expired', 'Expired']];
    root.innerHTML = `${pageHead('Marketing', 'Coupons', 'Create, schedule, pause and duplicate offers without deleting their history.', `<button type="button" class="button" data-aw-new-coupon>Create coupon</button>`)}<section class="aw-section"><div class="aw-tabs" role="tablist" aria-label="Coupon status">${tabs.map(([value, label]) => `<button type="button" class="aw-tab ${state.couponTab === value ? 'is-active' : ''}" data-aw-coupon-tab="${esc(value)}"><span>${esc(label)}</span><b data-aw-coupon-tab-count="${esc(value)}">${couponTabCount(value)}</b></button>`).join('')}</div><div class="aw-toolbar"><p>Scheduled coupons become visible and redeemable from their start date.</p><button type="button" class="quiet-button" data-aw-refresh>Refresh coupons</button></div><div class="aw-coupon-grid" data-aw-coupon-list>${couponCards(filteredCoupons())}</div></section>`;
  }
  function couponCards(items) {
    if (!items.length) return emptyState('No coupons in this view', 'Create a coupon or choose another status.', '<button type="button" class="button" data-aw-new-coupon>Create coupon</button>');
    return items.map(coupon => {
      const status = couponState(coupon);
      const rules = [
        `${number(coupon.discount_percent)}% off`,
        number(coupon.minimum_order) ? `Min ${money(coupon.minimum_order)}` : 'No minimum spend',
        number(coupon.minimum_quantity) > 1 ? `${number(coupon.minimum_quantity)}+ items` : 'Any quantity',
        coupon.first_order_only ? 'First order only' : 'All customers',
        Array.isArray(coupon.product_ids) && coupon.product_ids.length ? `${coupon.product_ids.length} selected product${coupon.product_ids.length === 1 ? '' : 's'}` : 'All products',
        coupon.usage_limit ? `${number(coupon.usage_limit)} total uses` : 'Unlimited total uses',
        `${Math.max(1, number(coupon.per_customer_limit) || 1)} use${Math.max(1, number(coupon.per_customer_limit) || 1) === 1 ? '' : 's'} per customer`,
        coupon.starts_at ? `Starts ${formatDate(coupon.starts_at)}` : 'Starts immediately',
        coupon.expires_at ? `Ends ${formatDate(coupon.expires_at)}` : 'No expiry'
      ];
      return `<article class="aw-coupon-card is-${status.key}"><header><code>${esc(coupon.code)}</code>${statusChip(status.label)}</header><h3>${esc(coupon.title)}</h3><p>${esc(coupon.description)}</p><div class="aw-chip-list">${rules.map(rule => `<span>${esc(rule)}</span>`).join('')}</div><div class="aw-actions"><button type="button" class="quiet-button" data-aw-edit-coupon="${esc(coupon.id)}">Edit</button><button type="button" class="quiet-button" data-aw-toggle-coupon="${esc(coupon.id)}" data-aw-next-active="${coupon.active === false}">${coupon.active === false ? 'Resume' : 'Pause'}</button><button type="button" class="quiet-button" data-aw-duplicate-coupon="${esc(coupon.id)}">Duplicate</button></div></article>`;
    }).join('');
  }
  function updateCouponList() {
    const list = q('[data-aw-coupon-list]');
    if (list) list.innerHTML = couponCards(filteredCoupons());
    qa('[data-aw-coupon-tab]').forEach(button => button.classList.toggle('is-active', button.getAttribute('data-aw-coupon-tab') === state.couponTab));
    qa('[data-aw-coupon-tab-count]').forEach(node => { node.textContent = String(couponTabCount(node.getAttribute('data-aw-coupon-tab-count'))); });
  }
  function uniqueCouponCode(base) {
    const used = new Set(getCoupons().map(item => text(item.code).toUpperCase()));
    const stem = text(base).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24) || 'OFFER';
    let candidate = `${stem}COPY`, suffix = 2;
    while (used.has(candidate)) candidate = `${stem}COPY${suffix++}`;
    return candidate;
  }
  function openCouponDrawer(id = '', duplicate = false) {
    const source = id ? getCoupons().find(item => text(item.id) === text(id)) : null;
    if (id && !source) return toast('That coupon is no longer available. Refresh and try again.', 'error');
    const existing = source && !duplicate ? source : null;
    const item = source ? { ...source } : {};
    if (duplicate) {
      item.code = uniqueCouponCode(item.code);
      item.title = `${item.title || 'Offer'} copy`;
      item.active = false;
      item.starts_at = '';
      item.expires_at = '';
    }
    openDrawer('coupon', existing ? `Edit ${item.code}` : duplicate ? `Duplicate ${source.code}` : 'Create coupon', 'MARKETING', `<form class="aw-form" data-aw-form="coupon" data-aw-coupon-id="${esc(existing?.id || '')}"><div class="aw-form-grid"><label class="aw-field"><span>Offer name</span><input name="title" value="${esc(item.title)}" maxlength="160" required></label><label class="aw-field"><span>Coupon code</span><input name="code" value="${esc(item.code)}" maxlength="40" pattern="[A-Za-z0-9_-]+" required></label><label class="aw-field aw-field-wide"><span>Customer message</span><textarea name="description" maxlength="1000" required>${esc(item.description)}</textarea></label><label class="aw-field"><span>Discount percent</span><input type="number" name="discount_percent" min="1" max="90" value="${item.discount_percent == null ? '' : number(item.discount_percent)}" required></label><label class="aw-field"><span>Minimum order value</span><input type="number" name="minimum_order" min="0" value="${number(item.minimum_order)}"></label><label class="aw-field"><span>Minimum quantity</span><input type="number" name="minimum_quantity" min="1" max="20" value="${Math.max(1, number(item.minimum_quantity) || 1)}"></label><label class="aw-field"><span>Start date</span><input type="date" name="starts_at" value="${esc(text(item.starts_at).slice(0, 10))}"></label><label class="aw-field"><span>Expiry date</span><input type="date" name="expires_at" value="${esc(text(item.expires_at).slice(0, 10))}"></label><label class="aw-field aw-field-wide"><span>Short badge text</span><input name="banner_text" value="${esc(item.banner_text)}" maxlength="120" placeholder="Optional storefront badge"></label><label class="aw-field aw-check"><input type="checkbox" name="first_order_only" ${item.first_order_only ? 'checked' : ''}><span>First order only</span></label><label class="aw-field aw-check"><input type="checkbox" name="active" ${item.active === false ? '' : 'checked'}><span>Enabled</span></label></div><div class="aw-callout is-neutral">A future start date displays this coupon as Scheduled. Checkout enforces the same start and expiry dates.</div><div class="aw-drawer-footer"><button type="button" class="quiet-button" data-aw-close-drawer>Cancel</button><button type="submit" class="button">${existing ? 'Save coupon' : duplicate ? 'Create duplicate' : 'Create coupon'}</button></div></form>`, existing?.id || 'new');
    const couponGrid = q('.aw-form-grid', q('[data-aw-form="coupon"]'));
    couponGrid?.insertAdjacentHTML('beforeend', `<label class="aw-field"><span>Total usage limit</span><input type="number" name="usage_limit" min="1" value="${item.usage_limit == null ? '' : number(item.usage_limit)}" placeholder="Unlimited"></label><label class="aw-field"><span>Uses per customer</span><input type="number" name="per_customer_limit" min="1" max="100" value="${Math.max(1, number(item.per_customer_limit) || 1)}" required></label>`);
    const selectedProducts = new Set((Array.isArray(item.product_ids) ? item.product_ids : []).map(text));
    couponGrid?.insertAdjacentHTML('beforeend', `<fieldset class="aw-field aw-field-wide aw-product-scope"><legend>Eligible products</legend><p>Leave every product unchecked to apply the coupon to the entire catalogue.</p>${getProducts().filter(product => product.active !== false).map(product => `<label class="aw-check"><input type="checkbox" name="product_ids" value="${esc(product.id)}" ${selectedProducts.has(text(product.id)) ? 'checked' : ''}><span>${esc(product.name)}</span></label>`).join('')}</fieldset>`);
  }
  async function saveCouponForm(form) {
    const id = text(form.getAttribute('data-aw-coupon-id'));
    const all = getCoupons();
    const existing = all.find(item => text(item.id) === id);
    const fields = new FormData(form);
    const startsAt = text(fields.get('starts_at')) || null;
    const expiresAt = text(fields.get('expires_at')) || null;
    if (startsAt && expiresAt && startsAt > expiresAt) throw new Error('The coupon start date must be before its expiry date.');
    const code = text(fields.get('code')).toUpperCase();
    if (all.some(item => item !== existing && text(item.code).toUpperCase() === code)) throw new Error(`Coupon code ${code} already exists.`);
    const item = { id: existing?.id || crypto.randomUUID(), title: text(fields.get('title')), code, description: text(fields.get('description')), discount_percent: number(fields.get('discount_percent')), minimum_order: number(fields.get('minimum_order')), minimum_quantity: Math.max(1, number(fields.get('minimum_quantity'))), usage_limit: number(fields.get('usage_limit')) || null, per_customer_limit: Math.max(1, number(fields.get('per_customer_limit')) || 1), product_ids: fields.getAll('product_ids').map(text).filter(Boolean), first_order_only: form.elements.first_order_only.checked, banner_text: text(fields.get('banner_text')) || null, starts_at: startsAt, expires_at: expiresAt, active: form.elements.active.checked, updated_at: nowISO() };
    const submit = q('button[type="submit"]', form);
    submit.disabled = true;
    try {
      await runOperation(existing ? 'Saving coupon' : 'Creating coupon', async () => {
        await apiRequest('offers', 'POST', [item], '?on_conflict=id', { requireRow: true });
        writeCache(CACHE.coupons, existing ? all.map(entry => entry === existing ? { ...existing, ...item } : entry) : [item, ...all]);
        await logActivity(existing ? 'coupon updated' : 'coupon created', 'offer', item.id, { code: item.code, active: item.active, starts_at: item.starts_at, expires_at: item.expires_at });
      }, existing ? `${code} saved.` : `${code} created.`);
      closeDrawer();
      requestRender();
    } finally { submit.disabled = false; }
  }
  async function toggleCoupon(id, nextActive) {
    const all = getCoupons();
    const coupon = all.find(item => text(item.id) === text(id));
    if (!coupon) return toast('Coupon not found. Refresh and try again.', 'error');
    if (!nextActive) {
      const confirmed = await confirmAction({ title: `Pause ${coupon.code}?`, message: 'Customers will not be able to apply this coupon until it is resumed.', confirmLabel: 'Pause coupon' });
      if (!confirmed) return;
    }
    const patch = { active: Boolean(nextActive), updated_at: nowISO() };
    await runOperation(nextActive ? 'Resuming coupon' : 'Pausing coupon', async () => {
      await apiRequest('offers', 'PATCH', patch, `?id=eq.${encodeURIComponent(coupon.id)}`, { requireRow: true });
      Object.assign(coupon, patch);
      writeCache(CACHE.coupons, all);
      await logActivity(nextActive ? 'coupon resumed' : 'coupon paused', 'offer', coupon.id, { code: coupon.code });
    }, nextActive ? `${coupon.code} resumed.` : `${coupon.code} paused.`);
    updateCouponList();
  }

  function reviewState(review) {
    const explicit = text(review.review_status).toLowerCase();
    if (['pending', 'published', 'hidden'].includes(explicit)) return explicit;
    return review.approved === true ? 'published' : 'pending';
  }
  function filteredReviews() {
    const needle = state.reviewSearch.toLowerCase();
    return getReviews().filter(review => reviewState(review) === state.reviewTab && (!needle || [review.name, review.text, review.rating].join(' ').toLowerCase().includes(needle)));
  }
  function reviewCount(tab) { return getReviews().filter(review => reviewState(review) === tab).length; }
  function renderReviewsPage() {
    const root = q('#aw-page');
    if (!root) return;
    const params = new URLSearchParams(location.search);
    if (['pending', 'published', 'hidden'].includes(params.get('tab'))) state.reviewTab = params.get('tab');
    const tabs = [['pending', 'Pending'], ['published', 'Published'], ['hidden', 'Hidden']];
    root.innerHTML = `${pageHead('Community', 'Reviews', 'Moderate customer stories with their photo, date and publication state in view.', `<button type="button" class="button" data-aw-refresh>Refresh reviews</button>`)}<section class="aw-section"><div class="aw-tabs" role="tablist" aria-label="Review publication status">${tabs.map(([value, label]) => `<button type="button" class="aw-tab ${state.reviewTab === value ? 'is-active' : ''}" data-aw-review-tab="${esc(value)}"><span>${esc(label)}</span><b data-aw-review-tab-count="${esc(value)}">${reviewCount(value)}</b></button>`).join('')}</div><div class="aw-toolbar"><label class="aw-search"><span class="aw-cell-label">Search reviews</span><input type="search" value="${esc(state.reviewSearch)}" placeholder="Customer or review text…" data-aw-review-search></label></div><div class="aw-review-list" data-aw-review-list>${reviewCards(filteredReviews())}</div></section>`;
  }
  function reviewCards(items) {
    if (!items.length) return emptyState(`No ${state.reviewTab} reviews`, 'There is nothing to moderate in this view.');
    return items.map(review => {
      const image = safeImage(review.image_url);
      const status = reviewState(review);
      const hasId = Boolean(review.id);
      return `<article class="aw-review-card is-${status}">${image ? `<img src="${esc(image)}" alt="Review submitted by ${esc(review.name)}" loading="lazy">` : '<div class="aw-review-placeholder">SSBS</div>'}<div class="aw-review-copy"><header><div><b>${esc(review.name)}</b><span aria-label="${number(review.rating)} out of 5 stars">${'★'.repeat(Math.max(0, Math.min(5, number(review.rating))))}${'☆'.repeat(Math.max(0, 5 - Math.min(5, number(review.rating))))}</span></div>${statusChip(status)}</header><blockquote>${esc(review.text)}</blockquote><small>Submitted ${esc(formatDate(review.created_at))}${review.moderated_at ? ` · Moderated ${esc(formatDate(review.moderated_at))}` : ''}</small><div class="aw-actions">${status !== 'published' ? `<button type="button" class="button" data-aw-review-action="publish" data-aw-review-id="${esc(review.id)}" ${hasId ? '' : 'disabled'}>Publish</button>` : ''}${status === 'published' ? `<button type="button" class="quiet-button" data-aw-review-action="hide" data-aw-review-id="${esc(review.id)}" ${hasId ? '' : 'disabled'}>Hide</button>` : ''}${status === 'hidden' ? `<button type="button" class="quiet-button" data-aw-review-action="pending" data-aw-review-id="${esc(review.id)}" ${hasId ? '' : 'disabled'}>Move to pending</button>` : ''}</div></div></article>`;
    }).join('');
  }
  function updateReviewList() {
    const list = q('[data-aw-review-list]');
    if (list) list.innerHTML = reviewCards(filteredReviews());
    qa('[data-aw-review-tab]').forEach(button => button.classList.toggle('is-active', button.getAttribute('data-aw-review-tab') === state.reviewTab));
    qa('[data-aw-review-tab-count]').forEach(node => { node.textContent = String(reviewCount(node.getAttribute('data-aw-review-tab-count'))); });
  }
  async function moderateReview(id, action) {
    const all = getReviews();
    const review = all.find(item => text(item.id) === text(id));
    if (!review) return toast('Review not found. Refresh and try again.', 'error');
    const status = action === 'publish' ? 'published' : action === 'hide' ? 'hidden' : 'pending';
    const patch = { approved: status === 'published', review_status: status, moderated_at: status === 'pending' ? null : nowISO(), updated_at: nowISO() };
    await runOperation(status === 'published' ? 'Publishing review' : status === 'hidden' ? 'Hiding review' : 'Moving review', async () => {
      await apiRequest('reviews', 'PATCH', patch, `?id=eq.${encodeURIComponent(review.id)}`, { requireRow: true });
      Object.assign(review, patch);
      writeCache(CACHE.reviews, all);
      await logActivity(`review ${status}`, 'review', review.id, { customer: review.name, rating: review.rating });
    }, status === 'published' ? 'Review published.' : status === 'hidden' ? 'Review hidden.' : 'Review moved to pending.');
    updateBadges();
    updateReviewList();
  }

  function renderSettingsPage() {
    const root = q('#aw-page');
    if (!root) return;
    const current = session();
    const branchList = getBranches();
    const activeOrdersByBranch = new Map();
    getOrders().filter(order => !['delivered', 'rto'].includes(text(order.status).toLowerCase())).forEach(order => activeOrdersByBranch.set(orderBranchId(order), (activeOrdersByBranch.get(orderBranchId(order)) || 0) + 1));
    root.innerHTML = `${pageHead('Workspace', 'Settings', 'Manage fulfilment locations and the current administrator session.', `<button type="button" class="button" data-aw-new-branch>Add branch</button>`)}<section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">FULFILMENT BRANCHES</p><h2>Locations</h2></div><span>${branchList.filter(item => item.active !== false).length} active</span></div><div class="aw-branch-grid" data-aw-branch-list>${branchList.length ? branchList.map(branch => `<article class="aw-branch-card ${branch.active === false ? 'is-archived' : ''}"><header><div><h3>${esc(branch.name)}</h3><p>${esc(branch.description)}</p></div>${statusChip(branch.active === false ? 'archived' : 'active')}</header><p><b>${activeOrdersByBranch.get(text(branch.id)) || 0}</b> active orders assigned</p><div class="aw-actions"><button type="button" class="quiet-button" data-aw-edit-branch="${esc(branch.id)}">Edit</button><button type="button" class="quiet-button ${branch.active === false ? '' : 'danger'}" data-aw-toggle-branch="${esc(branch.id)}" data-aw-next-active="${branch.active === false}">${branch.active === false ? 'Restore' : 'Archive'}</button></div></article>`).join('') : emptyState('No branches configured', 'Add the first fulfilment location.')}</div></section><section class="aw-section"><div class="aw-section-head"><div><p class="eyebrow">ACCOUNT & SECURITY</p><h2>Current session</h2></div></div><div class="aw-account-card"><div><span>Signed in as</span><b>${esc(window.ssbsAdminUser?.email || current?.user?.email || 'SSBS administrator')}</b><small>Admin ID ${esc(sessionUserId() || 'Unavailable')}</small></div><div><span>Last workspace refresh</span><b>${esc(state.lastUpdated ? formatDateTime(state.lastUpdated) : 'Not refreshed in this session')}</b><small>Customer order data is cleared from this browser when you log out.</small></div><div class="aw-actions"><button type="button" class="quiet-button" data-aw-refresh>Refresh now</button><button type="button" class="button" data-aw-logout>Log out securely</button></div></div></section>`;
  }
  function openBranchDrawer(id = '') {
    const existing = id ? getBranches().find(item => text(item.id) === text(id)) : null;
    if (id && !existing) return toast('Branch not found. Refresh and try again.', 'error');
    const item = existing || {};
    openDrawer('branch', existing ? `Edit ${item.name}` : 'Add branch', 'FULFILMENT SETTINGS', `<form class="aw-form" data-aw-form="branch" data-aw-branch-id="${esc(existing?.id || '')}"><div class="aw-form-grid"><label class="aw-field aw-field-wide"><span>Branch name</span><input name="name" value="${esc(item.name)}" maxlength="120" required></label><label class="aw-field aw-field-wide"><span>Description</span><textarea name="description" maxlength="500" required>${esc(item.description)}</textarea></label><label class="aw-field aw-check"><input type="checkbox" name="active" ${item.active === false ? '' : 'checked'}><span>Active fulfilment location</span></label></div><div class="aw-drawer-footer"><button type="button" class="quiet-button" data-aw-close-drawer>Cancel</button><button type="submit" class="button">${existing ? 'Save branch' : 'Add branch'}</button></div></form>`, existing?.id || 'new');
    const branchGrid = q('.aw-form-grid', q('[data-aw-form="branch"]'));
    branchGrid?.insertAdjacentHTML('beforeend', `<label class="aw-field aw-field-wide"><span>WhatsApp number</span><input type="tel" name="whatsapp_phone" value="${esc(item.whatsapp_phone)}" inputmode="numeric" maxlength="15" placeholder="919876543210"><small>Country code + number, digits only.</small></label>`);
  }
  async function saveBranchForm(form) {
    const id = text(form.getAttribute('data-aw-branch-id'));
    const all = getBranches();
    const existing = all.find(item => text(item.id) === id);
    const fields = new FormData(form);
    const whatsappPhone = text(fields.get('whatsapp_phone')).replace(/\D/g, '');
    if (whatsappPhone && (whatsappPhone.length < 10 || whatsappPhone.length > 15)) throw new Error('Enter a valid WhatsApp number with country code.');
    const item = { id: existing?.id || crypto.randomUUID(), name: text(fields.get('name')), description: text(fields.get('description')), whatsapp_phone: whatsappPhone || null, active: form.elements.active.checked };
    if (all.some(branch => branch !== existing && text(branch.name).toLowerCase() === item.name.toLowerCase())) throw new Error(`A branch named ${item.name} already exists.`);
    await runOperation(existing ? 'Saving branch' : 'Adding branch', async () => {
      await apiRequest('branches', 'POST', [item], '?on_conflict=id', { requireRow: true });
      writeCache(CACHE.branches, existing ? all.map(branch => branch === existing ? { ...existing, ...item } : branch) : [...all, item]);
      await logActivity(existing ? 'branch updated' : 'branch created', 'branch', item.id, { name: item.name, active: item.active });
    }, existing ? `${item.name} saved.` : `${item.name} added.`);
    closeDrawer();
    requestRender();
  }
  async function toggleBranch(id, nextActive) {
    const all = getBranches();
    const branch = all.find(item => text(item.id) === text(id));
    if (!branch) return toast('Branch not found. Refresh and try again.', 'error');
    const activeCount = getOrders().filter(order => orderBranchId(order) === text(branch.id) && !['delivered', 'rto'].includes(text(order.status).toLowerCase())).length;
    if (!nextActive && activeCount) return toast(`Reassign ${activeCount} active order${activeCount === 1 ? '' : 's'} before archiving ${branch.name}.`, 'error', 6500);
    if (!nextActive) {
      const confirmed = await confirmAction({ title: `Archive ${branch.name}?`, message: 'It will no longer be available for new fulfilment assignments. Historical orders will retain the branch.', confirmLabel: 'Archive branch' });
      if (!confirmed) return;
    }
    const patch = { active: Boolean(nextActive) };
    await runOperation(nextActive ? 'Restoring branch' : 'Archiving branch', async () => {
      await apiRequest('branches', 'PATCH', patch, `?id=eq.${encodeURIComponent(branch.id)}`, { requireRow: true });
      Object.assign(branch, patch);
      writeCache(CACHE.branches, all);
      await logActivity(nextActive ? 'branch restored' : 'branch archived', 'branch', branch.id, { name: branch.name });
    }, nextActive ? `${branch.name} restored.` : `${branch.name} archived.`);
    requestRender();
  }

  async function refreshWorkspace() {
    if (state.refreshing) return;
    state.refreshing = true;
    const notice = toast('Refreshing workspace...', 'saving', 0);
    try {
      const tables = [
        ['products', CACHE.products, '?order=created_at.desc'],
        ['upcoming_products', CACHE.upcoming, '?order=launch_date.asc.nullslast'],
        ['offers', CACHE.coupons, '?order=created_at.desc'],
        ['branches', CACHE.branches, '?order=name.asc'],
        ['reviews', CACHE.reviews, '?order=created_at.desc'],
        ['orders', CACHE.orders, '?order=created_at.desc'],
        ['return_requests', CACHE.returns, '?order=created_at.desc']
      ];
      const results = await Promise.all(tables.map(([table, key, query]) =>
        apiRequest(table, 'GET', undefined, query)
          .then(rows => [key, rows])
          .catch(error => {
            console.warn(`SSBS admin refresh failed for ${table}:`, error.message);
            return [key, null];
          })
      ));
      results.forEach(([key, rows]) => {
        if (!rows) return;
        writeCache(key, key === CACHE.orders ? rows.map(order => ({
          ...order,
          db_id: order.id,
          id: order.order_number || order.id,
          branch: order.branch_id
        })) : rows);
      });
      try {
        const activity = await apiRequest('admin_activity', 'GET', undefined, '?order=created_at.desc&limit=50');
        if (activity) writeCache(CACHE.activity, activity);
      } catch (error) {
        console.warn('SSBS activity log unavailable:', error.message);
      }
      state.lastUpdated = nowISO();
      localStorage.setItem('ssbs_admin_last_updated', state.lastUpdated);
      updateToast(notice, 'Workspace refreshed.', 'success');
      requestRender();
    } catch (error) {
      updateToast(notice, error?.message || 'Workspace refresh failed.', 'error', 6500);
    } finally {
      state.refreshing = false;
    }
  }

  function renderPage() {
    updateBadges();
    if (state.page === 'today') return renderTodayPage();
    if (state.page === 'orders') return renderOrdersPage();
    if (state.page === 'returns') return renderReturnsPage();
    if (state.page === 'products') return renderProductsPage();
    if (state.page === 'upcoming') return renderUpcomingPage();
    if (state.page === 'coupons') return renderCouponsPage();
    if (state.page === 'reviews') return renderReviewsPage();
    if (state.page === 'settings') return renderSettingsPage();
    renderTodayPage();
  }

  function requestRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      renderPage();
    });
  }

  function logout() {
    localStorage.removeItem('ssbs_admin_session');
    localStorage.removeItem(CACHE.orders);
    localStorage.removeItem(CACHE.returns);
    location.assign('admin-login.html');
  }

  async function handleFormSubmit(form) {
    const type = form.getAttribute('data-aw-form');
    try {
      if (type === 'order') await saveOrderForm(form);
      else if (type === 'return') await saveReturnDecision(form);
      else if (type === 'refund') await saveRefundRecord(form);
      else if (type === 'product') await saveProductForm(form);
      else if (type === 'bulk-product') await saveBulkProductForm(form);
      else if (type === 'upcoming') await saveUpcomingForm(form);
      else if (type === 'coupon') await saveCouponForm(form);
      else if (type === 'branch') await saveBranchForm(form);
    } catch (error) {
      if (!error?.awToasted) toast(error?.message || 'Unable to save. Please try again.', 'error', 6500);
      console.error(error);
    }
  }

  function bindEvents() {
    document.addEventListener('submit', event => {
      const form = event.target.closest?.('[data-aw-form]');
      if (!form) return;
      event.preventDefault();
      handleFormSubmit(form);
    });

    document.addEventListener('click', event => {
      const target = event.target.closest?.('button, a');
      if (!target) return;
      if (target.matches('[data-aw-refresh]')) return void refreshWorkspace();
      if (target.matches('[data-aw-logout]')) return void logout();
      if (target.matches('[data-aw-mobile-menu]')) {
        document.body.classList.add('aw-nav-open');
        q('[data-aw-mobile-menu]')?.setAttribute('aria-expanded', 'true');
        return;
      }
      if (target.matches('[data-aw-close-menu]')) {
        document.body.classList.remove('aw-nav-open');
        q('[data-aw-mobile-menu]')?.setAttribute('aria-expanded', 'false');
        return;
      }
      if (target.matches('[data-aw-close-drawer]')) return void closeDrawer();
      if (target.matches('[data-aw-confirm-cancel]')) return void resolveConfirm(false);
      if (target.matches('[data-aw-confirm-accept]')) return void resolveConfirm(true);
      if (target.matches('[data-aw-open-order]')) return void openOrderDrawer(target.getAttribute('data-aw-open-order'));
      if (target.matches('[data-aw-whatsapp-order]')) return void sendOrderToBranch(target.getAttribute('data-aw-whatsapp-order'), target.getAttribute('data-aw-whatsapp-branch'));
      if (target.matches('[data-aw-open-return]')) return void openReturnDrawer(target.getAttribute('data-aw-open-return'));
      if (target.matches('[data-aw-print]')) return void printOrder(target.getAttribute('data-aw-print-order'), target.getAttribute('data-aw-print'));
      if (target.matches('[data-aw-new-product]')) return void openProductDrawer();
      if (target.matches('[data-aw-bulk-products]')) return void openBulkProductDrawer();
      if (target.matches('[data-aw-edit-product]')) return void openProductDrawer(target.getAttribute('data-aw-edit-product'));
      if (target.matches('[data-aw-toggle-product]')) return void toggleProduct(target.getAttribute('data-aw-toggle-product'), target.getAttribute('data-aw-next-active') === 'true');
      if (target.matches('[data-aw-new-upcoming]')) return void openUpcomingDrawer();
      if (target.matches('[data-aw-edit-upcoming]')) return void openUpcomingDrawer(target.getAttribute('data-aw-edit-upcoming'));
      if (target.matches('[data-aw-toggle-upcoming]')) return void toggleUpcoming(target.getAttribute('data-aw-toggle-upcoming'), target.getAttribute('data-aw-next-active') === 'true');
      if (target.matches('[data-aw-convert-upcoming]')) {
        const id = target.getAttribute('data-aw-convert-upcoming');
        const source = getUpcoming().find(item => text(item.id) === text(id));
        return void openProductDrawer('', source ? { ...source, source_upcoming_id: id } : null);
      }
      if (target.matches('[data-aw-new-coupon]')) return void openCouponDrawer();
      if (target.matches('[data-aw-edit-coupon]')) return void openCouponDrawer(target.getAttribute('data-aw-edit-coupon'));
      if (target.matches('[data-aw-duplicate-coupon]')) return void openCouponDrawer(target.getAttribute('data-aw-duplicate-coupon'), true);
      if (target.matches('[data-aw-toggle-coupon]')) return void toggleCoupon(target.getAttribute('data-aw-toggle-coupon'), target.getAttribute('data-aw-next-active') === 'true');
      if (target.matches('[data-aw-review-action]')) return void moderateReview(target.getAttribute('data-aw-review-id'), target.getAttribute('data-aw-review-action'));
      if (target.matches('[data-aw-new-branch]')) return void openBranchDrawer();
      if (target.matches('[data-aw-edit-branch]')) return void openBranchDrawer(target.getAttribute('data-aw-edit-branch'));
      if (target.matches('[data-aw-toggle-branch]')) return void toggleBranch(target.getAttribute('data-aw-toggle-branch'), target.getAttribute('data-aw-next-active') === 'true');
      if (target.matches('[data-aw-order-tab]')) { state.orderTab = target.getAttribute('data-aw-order-tab'); return void updateOrderList(); }
      if (target.matches('[data-aw-return-tab]')) { state.returnTab = target.getAttribute('data-aw-return-tab'); return void updateReturnList(); }
      if (target.matches('[data-aw-product-tab]')) { state.productTab = target.getAttribute('data-aw-product-tab'); return void updateProductList(); }
      if (target.matches('[data-aw-upcoming-tab]')) { state.upcomingTab = target.getAttribute('data-aw-upcoming-tab'); return void updateUpcomingList(); }
      if (target.matches('[data-aw-coupon-tab]')) { state.couponTab = target.getAttribute('data-aw-coupon-tab'); return void updateCouponList(); }
      if (target.matches('[data-aw-review-tab]')) { state.reviewTab = target.getAttribute('data-aw-review-tab'); return void updateReviewList(); }
    });

    document.addEventListener('input', event => {
      const target = event.target;
      if (target.matches?.('[data-aw-order-search]')) { state.orderSearch = target.value; updateOrderList(); }
      if (target.matches?.('[data-aw-return-search]')) { state.returnSearch = target.value; updateReturnList(); }
      if (target.matches?.('[data-aw-product-search]')) { state.productSearch = target.value; updateProductList(); }
      if (target.matches?.('[data-aw-upcoming-search]')) { state.upcomingSearch = target.value; updateUpcomingList(); }
      if (target.matches?.('[data-aw-review-search]')) { state.reviewSearch = target.value; updateReviewList(); }
      if (target.matches?.('[data-aw-image-url]')) {
        const preview = q('[data-aw-image-preview]', target.closest('.aw-form'));
        if (preview) preview.innerHTML = target.value ? `<img src="${esc(target.value)}" alt="Preview">` : '<span>Image preview</span>';
      }
    });

    document.addEventListener('change', event => {
      const target = event.target;
      if (target.matches?.('[data-aw-select-product]')) {
        const id = text(target.getAttribute('data-aw-select-product'));
        target.checked ? state.productSelection.add(id) : state.productSelection.delete(id);
        updateProductSelectionButton();
        return;
      }
      if (target.matches?.('[data-aw-order-branch-filter]')) { state.orderBranch = target.value; updateOrderList(); }
      if (target.matches?.('[data-aw-image-file]')) {
        const file = target.files?.[0];
        const preview = q('[data-aw-image-preview]', target.closest('.aw-form'));
        if (!file || !preview) return;
        if (state.previewObjectUrl) URL.revokeObjectURL(state.previewObjectUrl);
        state.previewObjectUrl = URL.createObjectURL(file);
        preview.innerHTML = `<img src="${state.previewObjectUrl}" alt="Preview">`;
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (q('#aw-confirm-modal')?.classList.contains('is-open')) resolveConfirm(false);
        else if (document.body.classList.contains('aw-drawer-open')) closeDrawer();
        else document.body.classList.remove('aw-nav-open');
      }
    });
  }

  async function boot() {
    try {
      const allowed = await (window.ssbsAdminReady || Promise.resolve(true));
      if (!allowed) return;
      mountWorkspace();
      bindEvents();
      renderPage();
      refreshWorkspace();
    } catch (error) {
      console.error(error);
      document.body.insertAdjacentHTML('beforeend', `<div class="aw-fatal"><h1>Admin workspace could not start</h1><p>${esc(error?.message || 'Please sign in again, then refresh the page.')}</p><a class="button" href="admin-login.html">Go to admin login</a></div>`);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
