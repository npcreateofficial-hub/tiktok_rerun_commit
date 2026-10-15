const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('np-admin') || '';
let users = [], news = [], packages = [], topups = [], paymentAccount = {}, editingNews = null, imageData = '', editingUser = '', deletingUser = '', issued = null, editingPackageId = null, reviewingTopup = null, paymentQrData = '', paymentIconData = '';
let userRange = 'all';
let topupStatus = 'all';
const cookieValue = name => document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1) || '';

async function api(route, method = 'GET', body) {
  const r = await fetch('/api/admin/' + route, {
    method,
    headers: {'Content-Type': 'application/json', 'X-NP-Web': '1', 'X-NP-CSRF': cookieValue('np_csrf'), Authorization: 'Bearer ' + token},
    body: body ? JSON.stringify(body) : undefined
  });
  const contentType = r.headers.get('content-type') || '';
  let d = {};
  if (contentType.includes('application/json')) {
    d = await r.json();
  } else {
    const text = await r.text();
    d = {error: text.includes('Digital NP Studio Web') ? 'เซสชันเว็บหมดอายุ กรุณารีเฟรชหน้าแอดมินแล้วเข้าสู่ระบบใหม่' : 'ระบบตอบกลับไม่ถูกต้อง กรุณารีเฟรชหน้าแอดมินแล้วลองใหม่'};
  }
  if (!r.ok) {
    if (r.status === 401 && route !== 'login') {
      token = '';
      sessionStorage.removeItem('np-admin');
      $('app').hidden = true;
      $('login').hidden = false;
    }
    throw Error(d.error || 'ทำรายการไม่สำเร็จ');
  }
  return d;
}
function node(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
function toast(message, tone = 'info') {
  let host = document.querySelector('.np-toast-host');
  if (!host) {
    host = node('div', undefined, 'np-toast-host');
    document.body.append(host);
  }
  if (host.querySelector('.np-toast')) return;
  const item = node('div', undefined, 'np-toast ' + tone);
  item.append(node('strong', tone === 'success' ? 'สำเร็จ' : tone === 'danger' ? 'แจ้งเตือน' : 'NP Studio'), node('span', message));
  host.append(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 220);
  }, 3200);
}
function npConfirm({title = 'ยืนยันรายการ', message = '', confirmText = 'ยืนยัน', cancelText = 'ยกเลิก', danger = false} = {}) {
  return new Promise(resolve => {
    const wrap = node('div', undefined, 'np-confirm-backdrop');
    const card = node('section', undefined, 'np-confirm-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.append(node('span', danger ? 'ต้องยืนยันก่อนทำรายการ' : 'ยืนยันการทำงาน', 'np-confirm-kicker'), node('h2', title), node('p', message));
    const actions = node('div', undefined, 'np-confirm-actions');
    const cancel = node('button', cancelText);
    const ok = node('button', confirmText, danger ? 'danger-button' : 'primary');
    actions.append(cancel, ok);
    card.append(actions);
    wrap.append(card);
    const close = value => {
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 180);
      resolve(value);
    };
    cancel.onclick = () => close(false);
    ok.onclick = () => close(true);
    wrap.onclick = e => { if (e.target === wrap) close(false); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', esc);
        close(false);
      }
    });
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    ok.focus();
  });
}
function action(text, fn, cls) { const b = node('button', text, cls); b.onclick = () => Promise.resolve().then(fn).catch(e => { $('status').textContent = e.message; $('status').className = 'error'; toast(e.message, 'danger'); }); return b; }
function currentPackage(id) { return packages.find(p => p.id === id) || packages[0] || {id:'starter',name:'Starter',machineLimit:1,channelLimit:5,videoLimit:10,shopeeLimit:0,clipSizeGb:0,durationDays:30,startsAt:null,endsAt:null}; }
function fmtDate(value) { if (!value) return 'ตลอดชีพ'; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('th-TH') : 'ตลอดชีพ'; }
function dateInput(value) { if (!value) return ''; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0,10) : ''; }
function dateMs(id) { const value = $(id).value; return value ? new Date(value + 'T00:00:00').getTime() : null; }
function monthly(value, unit) { const n = Number(value || 0); return n > 0 ? `${n.toLocaleString('th-TH')} ${unit}` : 'ไม่จำกัด'; }
function packagePeriod(p) { return Number(p.durationDays || 0) > 0 ? `${Number(p.durationDays).toLocaleString('th-TH')} วัน` : 'ตลอดชีพ'; }
function limitItem(label, value) { const box = node('div', undefined, 'limit-chip'); box.append(node('span', label), node('strong', value)); return box; }
function packageSubtitle(p) { return `${packagePeriod(p)} · ${monthly(p.machineLimit, 'เครื่อง')} · TikTok ${monthly(p.shopeeLimit, 'บัญชี')} · ${monthly(p.videoLimit, 'วิดีโอ')}`; }
function userPeriod(u) { if (u.startsAt || u.expiresAt) return `${fmtDate(u.startsAt)} - ${fmtDate(u.expiresAt)}`; return 'ยังไม่กำหนดวันเริ่ม/หมดอายุ'; }
function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
function moneyText(value) { return Number(value || 0).toLocaleString('th-TH', {maximumFractionDigits: 0}) + ' THB'; }
function tab(id) { for (const name of ['overview','users','packages','topup','news']) $(name).hidden = name !== id; document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b.dataset.tab === id)); }
function packageOptionText(p) { return `${p.name} (${packagePeriod(p)} / ${monthly(p.machineLimit, 'เครื่อง')} / TikTok ${monthly(p.shopeeLimit, 'บัญชี')} / ${monthly(p.videoLimit, 'วิดีโอ')})`; }
function fillPackageSelect(selectId, selectedId, allowEmpty = false) {
  const s = $(selectId);
  if (!s) return;
  s.replaceChildren();
  if (allowEmpty) s.append(node('option', 'ยังไม่ผูกแพ็กเกจ'));
  for (const p of packages) {
    const o = node('option', packageOptionText(p));
    o.value = p.id;
    s.append(o);
  }
  s.value = selectedId || (allowEmpty ? '' : currentPackage().id);
}
function applyPackageLimits(prefix) { const p = currentPackage($(prefix + 'Package').value); $(prefix + 'MachineLimit').value = p.machineLimit; $(prefix + 'ChannelLimit').value = p.channelLimit; $(prefix + 'VideoLimit').value = p.videoLimit; if ($(prefix + 'StartsAt')) $(prefix + 'StartsAt').value = dateInput(p.startsAt); if ($(prefix + 'ExpiresAt')) $(prefix + 'ExpiresAt').value = dateInput(p.endsAt); }
function limits(prefix) { return {packageId:$(prefix + 'Package').value,machineLimit:Number($(prefix + 'MachineLimit').value),channelLimit:Number($(prefix + 'ChannelLimit').value),videoLimit:Number($(prefix + 'VideoLimit').value),startsAt:$(prefix + 'StartsAt') ? dateMs(prefix + 'StartsAt') : undefined,expiresAt:$(prefix + 'ExpiresAt') ? dateMs(prefix + 'ExpiresAt') : undefined}; }

async function refresh() {
  const [a, b, c, d] = await Promise.all([api('users'), api('announcements'), api('packages'), api('topup')]);
  users = a.users || [];
  news = b.items || [];
  packages = c.packages || [];
  topups = d.requests || [];
  paymentAccount = d.paymentAccount || {};
  const totalCount = users.length;
  const boundCount = users.filter(u => u.machineCount).length;
  const activeCount = news.filter(n => n.active).length;
  const pendingTopups = topups.filter(t => t.status === 'pending');
  const approvedTopups = topups.filter(t => t.status === 'approved');
  const rejectedTopups = topups.filter(t => t.status === 'rejected');
  const revenue = approvedTopups.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const activePackages = packages.filter(p => p.isActive !== false).length;
  const disabledUsers = users.filter(u => u.disabled).length;
  const unboundUsers = users.filter(u => !u.machineCount).length;
  const lockedUsers = users.filter(u => !u.disabled && Number(u.machineLimit || 0) > 0 && Number(u.machineCount || 0) >= Number(u.machineLimit || 0)).length;
  setText('total', totalCount);
  setText('bound', boundCount);
  $('activeNews') && ($('activeNews').textContent = activeCount);
  setText('packageTotal', packages.length);
  setText('overviewPending', pendingTopups.length);
  setText('overviewPendingTask', `${pendingTopups.length.toLocaleString('th-TH')} รายการ`);
  setText('overviewApproved', `${approvedTopups.length.toLocaleString('th-TH')} รายการ`);
  setText('overviewRejected', `${rejectedTopups.length.toLocaleString('th-TH')} รายการ`);
  setText('overviewRevenue', moneyText(revenue));
  setText('overviewActivePackages', activePackages);
  setText('overviewDisabled', disabledUsers);
  setText('overviewUnboundTask', `${unboundUsers.toLocaleString('th-TH')} บัญชี`);
  setText('overviewActiveNews', `${activeCount.toLocaleString('th-TH')} รายการ`);
  setText('overviewPaymentStatus', paymentAccount.accountNumber ? `${paymentAccount.bankName || 'บัญชีรับเงิน'} พร้อมใช้งาน` : 'ยังไม่ได้ตั้งค่า');
  setText('userSummaryTotal', totalCount.toLocaleString('th-TH'));
  setText('userSummaryActive', (totalCount - disabledUsers).toLocaleString('th-TH'));
  setText('userSummaryLocked', lockedUsers.toLocaleString('th-TH'));
  setText('userSummaryDisabled', disabledUsers.toLocaleString('th-TH'));
  document.querySelectorAll('.mirror-total').forEach(n => n.textContent = totalCount);
  document.querySelectorAll('.mirror-bound').forEach(n => n.textContent = boundCount);
  document.querySelectorAll('.mirror-activeNews').forEach(n => n.textContent = activeCount);
  document.querySelectorAll('.mirror-packageTotal').forEach(n => n.textContent = packages.length);
  renderUsers();
  renderPackages();
  renderTopups();
  renderNews();
}
function renderUsers() {
  const query = $('search').value.toLowerCase();
  const grid = $('userCards');
  grid.replaceChildren();
  const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const oneDay = 86400000;
  const inRange = u => {
    if (userRange === 'all') return true;
    const created = Number(u.createdAt || 0);
    if (!created) return false;
    if (userRange === 'today') return created >= startOfToday && created < startOfToday + oneDay;
    const daysAgo = Number(userRange), start = startOfToday - daysAgo * oneDay, end = start + oneDay;
    return created >= start && created < end;
  };
  const filtered = users.filter(u => inRange(u) && [u.username, u.displayName, u.fullName, u.email, u.packageName, u.phone, u.lineId, u.note].some(v => String(v || '').toLowerCase().includes(query)));
  $('userResultCount').textContent = `แสดง ${filtered.length} / ทั้งหมด ${users.length} รายการ`;
  $('noUsers').hidden = filtered.length > 0;
  for (const u of filtered) {
    const card = node('article', undefined, 'user-card');
    const top = node('div', undefined, 'user-card-top');
    const title = node('div');
    title.append(node('h3', u.displayName || u.fullName || u.username), node('small', u.email || u.username, 'muted'));
    const machineFull = Number(u.machineLimit || 0) > 0 && Number(u.machineCount || 0) >= Number(u.machineLimit || 0);
    top.append(title, node('span', u.disabled ? 'ระงับ' : (u.machineCount ? 'ใช้งานแล้ว' : 'พร้อมใช้งาน'), u.disabled ? 'pill danger' : (machineFull ? 'pill warning' : 'pill')));
    const details = node('div', undefined, 'user-details');
    const left = node('div');
    left.append(node('span', 'User:', 'muted'), node('strong', u.username, 'mono'));
    const right = node('div');
    right.append(node('span', 'แพ็กเกจ:', 'muted'), node('strong', u.packageActive ? `${u.packageName || 'แพ็กเกจ'} · ${monthly(u.videoLimit, 'วิดีโอ')}` : 'ยังไม่สมัครแพ็กเกจ'));
    const machine = node('div');
    machine.append(node('span', 'เครื่อง:', 'muted'), node('strong', `${u.machineCount || 0}/${monthly(u.machineLimit, 'เครื่อง')}${u.machineFingerprint ? ' · ' + u.machineFingerprint : ''}`));
    const contact = node('div');
    contact.append(node('span', 'ติดต่อ:', 'muted'), node('strong', `LINE ${u.lineId || '-'} / โทร ${u.phone || '-'}`));
    details.append(left, right, machine, contact);
    if (u.note) {
      const note = node('div', undefined, 'user-note-row');
      note.append(node('span', 'โน้ต:', 'muted'), node('strong', u.note));
      details.append(note);
    }
    const controls = node('div', undefined, 'card-actions');
    controls.append(action('ปลดล็อกเครื่อง', () => unlockMachine(u.username), 'unlock-button'), action('แก้ไข', () => openEditUser(u), 'edit-button'), action('ดูข้อมูล', () => openEditUser(u), 'view-button'));
    card.append(top, details, controls);
    grid.append(card);
  }
}
function renderPackages() {
  const wrap = $('packageCards');
  wrap.replaceChildren();
  const active = packages.find(p => p.isActive !== false) || packages[0];
  const currentBox = $('adminCurrentPackage');
  if (currentBox) {
    currentBox.replaceChildren();
    if (active) {
      const icon = node('div', '♛', 'admin-package-icon');
      const info = node('div', undefined, 'admin-current-info');
      info.append(node('span', 'แพ็กเกจปัจจุบัน'), node('h2', active.name || 'Starter'), node('p', packageSubtitle(active), 'muted'));
      const limits = node('div', undefined, 'admin-current-limits');
      limits.append(limitBar('วันใช้งาน', packagePeriod(active)), limitBar('เครื่อง', monthly(active.machineLimit, 'เครื่อง')), limitBar('TikTok', monthly(active.shopeeLimit, 'บัญชี')), limitBar('วิดีโอ', monthly(active.videoLimit, 'รายการ')), limitBar('GB/คลิป', monthly(active.clipSizeGb, 'GB')));
      currentBox.append(icon, info, node('div', active.isActive ? 'เปิดขาย' : 'ปิดขาย', active.isActive ? 'admin-current-state' : 'admin-current-state danger'), limits);
    }
  }
  if (!packages.length) wrap.append(node('p','ยังไม่มีแพ็กเกจ','muted'));
  for (const p of packages) {
    const card = node('article', undefined, 'card package-card package-card-rich');
    const head = node('div', undefined, 'package-head');
    const title = node('div');
    title.append(node('span', p.id === 'starter' ? 'ค่าเริ่มต้น' : 'แพ็กเกจ', 'badge'), node('h2', p.name));
    head.append(title, node('span', p.isActive ? 'เปิดขาย' : 'ปิดขาย', p.isActive ? 'pill' : 'pill danger'));
    const price = node('div', undefined, 'package-price');
    price.append(node('strong', Number(p.price || 0) > 0 ? Number(p.price || 0).toLocaleString('th-TH') + ' บาท' : 'ฟรี'), node('span', `ต่อรอบ ${packagePeriod(p)}`));
    const list = node('div', undefined, 'package-limits package-limits-wide');
    list.append(limitItem('วันใช้งาน', packagePeriod(p)), limitItem('เครื่อง', monthly(p.machineLimit, 'เครื่อง')), limitItem('บัญชี TikTok', monthly(p.shopeeLimit, 'บัญชี')), limitItem('วิดีโอ', monthly(p.videoLimit, 'รายการ')), limitItem('ขนาดต่อคลิป', monthly(p.clipSizeGb, 'GB')));
    card.append(head, price, list, action('แก้ไขแพ็กเกจ', () => openPackage(p), 'edit-button wide'));
    wrap.append(card);
  }
}
function limitBar(label, value) { const box = node('div', undefined, 'admin-limit-bar'); box.append(node('span', label), node('strong', value)); return box; }
function statusText(status) { return status === 'approved' ? 'ปลดล็อกแล้ว' : status === 'rejected' ? 'ไม่อนุมัติ' : 'รอตรวจสอบ'; }
function money(value) { return Number(value || 0).toLocaleString('th-TH') + ' THB'; }
function dt(value) { if (!value) return '-'; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toLocaleString('th-TH') : '-'; }
function renderPaymentAccount() {
  const wrap = $('paymentAccountView');
  if (!wrap) return;
  wrap.replaceChildren();
  const ready = Boolean(paymentAccount.bankName && paymentAccount.accountName && paymentAccount.accountNumber);
  const qr = paymentAccount.qrImage ? node('img') : node('div', 'QR', 'payment-account-icon');
  if (paymentAccount.qrImage) qr.src = paymentAccount.qrImage;
  const meta = node('div', undefined, 'payment-account-meta');
  meta.append(node('span', 'บัญชีรับเงิน', 'muted'), node('strong', paymentAccount.bankName || 'ยังไม่ได้ตั้งค่าธนาคาร'), node('small', `${paymentAccount.accountName || 'ยังไม่ได้ตั้งชื่อบัญชี'} · ${paymentAccount.accountNumber || 'ยังไม่ได้ตั้งเลขบัญชี'}`, 'muted'));
  const state = node('span', ready ? 'พร้อมรับชำระ' : 'ยังตั้งค่าไม่ครบ', ready ? 'pill' : 'pill warning');
  wrap.append(qr, meta, state);
}
function renderTopups() {
  renderPaymentAccount();
  $('topupPending') && ($('topupPending').textContent = topups.filter(t => t.status === 'pending').length);
  $('topupApproved') && ($('topupApproved').textContent = topups.filter(t => t.status === 'approved').length);
  $('topupRejected') && ($('topupRejected').textContent = topups.filter(t => t.status === 'rejected').length);
  const query = ($('topupSearch')?.value || '').toLowerCase();
  const rows = topups.filter(t => (topupStatus === 'all' || t.status === topupStatus) && [t.username, t.packageName, t.status].some(v => String(v || '').toLowerCase().includes(query)));
  $('topupResultCount') && ($('topupResultCount').textContent = `แสดง ${rows.length} / ทั้งหมด ${topups.length} รายการ`);
  const grid = $('topupCards');
  if (!grid) return;
  grid.replaceChildren();
  $('noTopups').hidden = rows.length > 0;
  if (!rows.length) return;
  const table = node('table', undefined, 'topup-table');
  const thead = node('thead');
  const headRow = node('tr');
  ['ชื่อผู้ใช้', 'แพ็กเกจ', 'สลิปหลักฐาน', 'สถานะ', 'หมายเหตุ'].forEach(label => headRow.append(node('th', label)));
  thead.append(headRow);
  const tbody = node('tbody');
  for (const t of rows) {
    const tr = node('tr', undefined, 'topup-row ' + t.status);
    const user = node('td'); user.append(node('strong', t.username), node('small', `ส่งเมื่อ ${dt(t.createdAt)}`, 'muted'));
    const pack = node('td'); pack.append(node('strong', t.packageName || '-'), node('small', money(t.amount), 'topup-amount'));
    const statusCell = node('td');
    statusCell.append(node('strong', statusText(t.status), 'topup-status ' + t.status));
    if (t.status !== 'pending') statusCell.append(node('small', `${t.reviewedBy || 'superAdmin'} · ${dt(t.reviewedAt)}`, 'muted'));
    const note = node('td');
    note.append(node('span', t.note || '-', t.note ? 'topup-note-text' : 'muted'));
    const actions = node('td', undefined, 'topup-actions');
    const slip = node('img', undefined, 'topup-slip'); slip.src = '/secure-upload/' + encodeURIComponent(t.slipPath).replace(/%2F/g, '/'); slip.alt = 'สลิปหลักฐาน'; slip.title = 'กดเพื่อดูสลิปหลักฐาน'; slip.tabIndex = 0; slip.onclick = () => openTopupReview(t); slip.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTopupReview(t); } };
    actions.append(slip);
    if (t.status === 'pending') actions.append(action('ตรวจสลิป', () => openTopupReview(t)));
    tr.append(user, pack, actions, statusCell, note);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  grid.append(table);
}
function renderNews() {
  $('newsList').replaceChildren();
  if (!news.length) $('newsList').append(node('p', 'ยังไม่มีประกาศ', 'muted'));
  for (const n of news) {
    const card = node('article', undefined, 'card news-card');
    if (n.image) { const img = node('img'); img.src = n.image; img.alt = n.title; card.append(img); }
    card.append(node('span', n.active ? 'กำลังเผยแพร่' : 'ฉบับร่าง', 'badge'), node('h2', n.title), node('p', n.body), action('แก้ไขประกาศ', () => openNews(n)));
    $('newsList').append(card);
  }
}
function openNews(n) { editingNews = n?.id || null; imageData = n?.image || ''; $('newsForm').reset(); $('newsTitle').value = n?.title || ''; $('newsBody').value = n?.body || ''; $('newsActive').checked = !!n?.active; $('newsError').textContent = ''; preview(); $('newsDialog').showModal(); }
function preview() { $('imagePreview').hidden = !imageData; $('imagePreview').src = imageData; }
function createUser() { $('createForm').reset(); fillPackageSelect('createPackage', '', true); $('createError').textContent = ''; $('createDialog').showModal(); }
function openEditUser(u) { editingUser = u.username; $('editUser').textContent = `${u.username} · ${u.packageActive ? (u.packageName || 'แพ็กเกจ') : 'ยังไม่สมัครแพ็กเกจ'}`; $('editLicenseKey').value = ''; $('editUsername').value = u.username || ''; $('editDisplayName').value = u.displayName || u.fullName || u.username; $('editFullName').value = u.fullName || ''; $('editEmail').value = u.email || ''; $('editPhone').value = u.phone || ''; $('editLineId').value = u.lineId || ''; fillPackageSelect('editPackage', u.packageId || '', true); $('editNote').value = u.note || ''; $('editPassword').value = ''; $('editDisabled').checked = !!u.disabled; $('editError').textContent = ''; $('editDialog').showModal(); }
function openPackage(p) { editingPackageId = p?.id || null; $('packageForm').reset(); $('packageDialog').querySelector('h2').textContent = p ? 'แก้ไขแพ็กเกจ' : 'เพิ่มแพ็กเกจ'; $('packageName').value = p?.name || ''; $('packagePrice').value = p?.price || ''; $('packageDurationDays').value = p?.durationDays || 30; $('packageMachineLimit').value = p?.machineLimit || ''; $('packageShopeeLimit').value = p?.shopeeLimit || ''; $('packageVideoLimit').value = p?.videoLimit || ''; $('packageClipSizeGb').value = p?.clipSizeGb || ''; $('packageActive').checked = p?.isActive !== false; $('packageError').textContent = ''; $('packageDialog').showModal(); }
function openDeleteUser(u) { deletingUser = u.username; $('deleteUser').textContent = u.username; $('deleteError').textContent = ''; $('deleteDialog').showModal(); }
async function unlockMachine(username) {
  const ok = await npConfirm({title:'ปลดล็อกเครื่อง +1 ครั้ง',message:`เพิ่มสิทธิ์ให้ ${username} ล็อกอินเครื่องใหม่ได้อีก 1 เครื่อง โดยไม่ล้างเครื่องเดิม`,confirmText:'ปลดล็อกเครื่อง',danger:false});
  if (!ok) return;
  const r = await api('reset-machines','POST',{username});
  if (editingUser === username && $('editMachineLimit')) $('editMachineLimit').value = r.user.machineLimit;
  toast('ปลดล็อกเครื่องแล้ว เพิ่มสิทธิ์ล็อกอินใหม่อีก 1 ครั้ง','success');
  await refresh();
}
function openPaymentDialog() { paymentQrData = paymentAccount.qrImage || ''; paymentIconData = paymentAccount.iconImage || ''; $('paymentForm').reset(); $('paymentBankName').value = paymentAccount.bankName || ''; $('paymentAccountName').value = paymentAccount.accountName || ''; $('paymentAccountNumber').value = paymentAccount.accountNumber || ''; previewPayment(); $('paymentError').textContent = ''; $('paymentDialog').showModal(); }
function openTopupReview(t) { reviewingTopup = t; $('topupReviewInfo').textContent = `${t.username} · ${t.packageName} · ${money(t.amount)}`; $('topupSlipPreview').src = '/secure-upload/' + encodeURIComponent(t.slipPath).replace(/%2F/g, '/'); $('topupReviewNote').value = t.note || ''; $('topupReviewError').textContent = ''; $('topupReviewDialog').showModal(); }
function submit(form, error, fn) { $(form).onsubmit = async e => { e.preventDefault(); const button = e.submitter; if (button) button.disabled = true; $(error).textContent = ''; try { await fn(); } catch (err) { $(error).textContent = err.message; } finally { if (button) button.disabled = false; } }; }

submit('loginForm','loginError',async()=>{const d=await api('login','POST',{username:$('adminUser').value,password:$('adminPass').value});token=d.token;sessionStorage.setItem('np-admin',token);$('adminPass').value='';await refresh();$('login').hidden=true;$('app').hidden=false;});
submit('createForm','createError',async()=>{const username=$('username').value.trim().toLowerCase();if(!/^[a-z0-9_.-]{3,60}$/.test(username))throw Error('User ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดล่าง, ขีดกลาง และต้องมี 3–60 ตัว');const password=$('password').value;const d=await api('user','PUT',{username,password,packageId:$('createPackage').value});const packageStatus=d.user.packageActive?(d.user.packageName||'แพ็กเกจ'):'ยังไม่สมัครแพ็กเกจ';const packageHint=d.user.packageActive?'พร้อมใช้งานตามแพ็กเกจที่แอดมินผูกให้แล้ว':'ลูกค้าสามารถเข้าสู่ระบบแล้วไปที่เมนูแพ็กเกจเพื่อชำระเงินสมัครใช้งาน';issued={username:d.user.username,password,packageName:packageStatus,hint:packageHint,machineLimit:d.user.machineLimit,channelLimit:d.user.channelLimit,videoLimit:d.user.videoLimit,expiresAt:d.user.expiresAt};$('credentialText').textContent=`NP STUDIO\n\nUsername: ${issued.username}\nPassword: ${password}\n\nสถานะ: ${packageStatus}\n${packageHint}`;$('createDialog').close();$('createForm').reset();$('issued').showModal();await refresh();});
submit('editForm','editError',async()=>{await api('user-info','POST',{username:editingUser,displayName:$('editDisplayName').value,fullName:$('editFullName').value,email:$('editEmail').value,phone:$('editPhone').value,lineId:$('editLineId').value,packageId:$('editPackage').value,note:$('editNote').value,disabled:$('editDisabled').checked});if($('editPassword').value)await api('password','POST',{username:editingUser,password:$('editPassword').value});$('editDialog').close();$('editForm').reset();await refresh();});
submit('packageForm','packageError',async()=>{await api('packages','PUT',{id:editingPackageId || $('packageName').value,name:$('packageName').value,price:Number($('packagePrice').value || 0),durationDays:Number($('packageDurationDays').value || 0),machineLimit:Number($('packageMachineLimit').value || 0),channelLimit:Number($('packageShopeeLimit').value || 0),shopeeLimit:Number($('packageShopeeLimit').value || 0),videoLimit:Number($('packageVideoLimit').value || 0),clipSizeGb:Number($('packageClipSizeGb').value || 0),isActive:$('packageActive').checked,notes:''});$('packageDialog').close();await refresh();});
submit('deleteForm','deleteError',async()=>{await api('delete-user','POST',{username:deletingUser});$('deleteDialog').close();await refresh();});
submit('newsForm','newsError',async()=>{await api('announcements','PUT',{id:editingNews,title:$('newsTitle').value,body:$('newsBody').value,image:imageData,active:$('newsActive').checked});$('newsDialog').close();await refresh();});
submit('paymentForm','paymentError',async()=>{const d=await api('payment-account','PUT',{bankName:$('paymentBankName').value,accountName:$('paymentAccountName').value,accountNumber:$('paymentAccountNumber').value,qrImage:paymentQrData,iconImage:paymentIconData});paymentAccount=d.paymentAccount||{};$('paymentDialog').close();renderPaymentAccount();toast('บันทึกบัญชีรับเงินแล้ว','success');});
submit('topupReviewForm','topupReviewError',async()=>{const status=document.activeElement?.value||'approved';const d=await api('topup-review','POST',{id:reviewingTopup.id,status,note:$('topupReviewNote').value});topups=d.requests||topups;$('topupReviewDialog').close();renderTopups();toast(status==='approved'?'ปลดล็อกแพ็กเกจให้ผู้ใช้แล้ว':'บันทึกไม่อนุมัติแล้ว','success');});

$('newsImage').onchange=async()=>{const file=$('newsImage').files[0];if(!file)return;if(file.size>1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){$('newsError').textContent='ใช้ไฟล์ PNG/JPEG/WebP ไม่เกิน 1 MB';$('newsImage').value='';return;}imageData=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});preview();};
async function fileData(inputId, errorId, maxSize) { const file=$(inputId).files[0]; if(!file)return ''; if(file.size>maxSize||!['image/png','image/jpeg','image/webp'].includes(file.type)){ $(errorId).textContent='ใช้ไฟล์ PNG/JPEG/WebP ขนาดตามที่กำหนด'; $(inputId).value=''; return ''; } return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);}); }
function previewPayment(){ $('paymentQrPreview').hidden=!paymentQrData; $('paymentQrPreview').src=paymentQrData||''; $('paymentIconPreview').hidden=!paymentIconData; $('paymentIconPreview').src=paymentIconData||''; }
$('paymentQr').onchange=async()=>{paymentQrData=await fileData('paymentQr','paymentError',1024*1024)||paymentQrData;previewPayment();};
$('paymentIcon').onchange=async()=>{paymentIconData=await fileData('paymentIcon','paymentError',512*1024)||paymentIconData;previewPayment();};
$('removeImage').onclick=()=>{imageData='';$('newsImage').value='';preview();};
$('newNews').onclick=()=>openNews();
$('newPackage').onclick=()=>openPackage();
$('quickPackage').onclick=()=>openPackage();
$('quickPayment') && ($('quickPayment').onclick=openPaymentDialog);
$('editPaymentAccount').onclick=openPaymentDialog;
$('search').oninput=renderUsers;
$('topupSearch').oninput=renderTopups;
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{userRange=b.dataset.range;document.querySelectorAll('[data-range]').forEach(x=>x.classList.toggle('selected',x===b));renderUsers();});
document.querySelectorAll('[data-topup-status]').forEach(b=>b.onclick=()=>{topupStatus=b.dataset.topupStatus;document.querySelectorAll('[data-topup-status]').forEach(x=>x.classList.toggle('selected',x===b));renderTopups();});
$('create').onclick=createUser;
$('quickCreate').onclick=createUser;
$('quickCreateSecondary').onclick=createUser;
$('resetMachines').onclick=async()=>{if(!editingUser)return;await unlockMachine(editingUser);$('editError').textContent='ปลดล็อกเครื่องแล้ว เพิ่มสิทธิ์ล็อกอินใหม่อีก 1 ครั้ง';};
$('generate').onclick=()=>{$('password').value='NP!'+Array.from(crypto.getRandomValues(new Uint8Array(10)),b=>b.toString(16).padStart(2,'0')).join('');};
$('exportCredential').onclick=()=>{if(!issued)return;const c=document.createElement('canvas');c.width=1400;c.height=720;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,c.width,c.height);g.addColorStop(0,'#050812');g.addColorStop(.55,'#0b1b31');g.addColorStop(1,'#06101a');x.fillStyle=g;x.fillRect(0,0,c.width,c.height);x.fillStyle='#17c8ff';x.fillRect(70,92,48,7);x.fillStyle='#ffbe18';x.fillRect(1230,92,48,7);x.fillStyle='#ffffff';x.font='bold 56px sans-serif';x.fillText('DIGITAL NP STUDIO',70,160);x.fillStyle='#9fb2cf';x.font='30px sans-serif';x.fillText('Smart Solutions, Real Results',70,210);x.fillStyle='rgba(255,255,255,.08)';x.roundRect?.(65,270,1270,300,28);x.fill();x.strokeStyle='rgba(23,200,255,.28)';x.lineWidth=2;x.strokeRect(65,270,1270,300);x.fillStyle='#f4f8ff';x.font='34px monospace';x.fillText('Username: '+issued.username,110,370);x.fillText('Password: '+issued.password,110,455);x.fillStyle='#ffcf45';x.font='28px sans-serif';x.fillText('สถานะ: '+(issued.packageName||'ยังไม่สมัครแพ็กเกจ'),70,610);x.fillStyle='#a5bad9';x.font='23px sans-serif';x.fillText(issued.hint||'เข้าสู่ระบบแล้วเลือกแพ็กเกจและชำระเงินในหน้า Studio',70,650);const a=document.createElement('a');a.download='NP-'+issued.username+'.png';a.href=c.toDataURL('image/png');a.click();};
$('issued').addEventListener('close',()=>{issued=null;$('credentialText').textContent='';});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$('logout').onclick=async()=>{try{await api('logout','POST',{});}finally{sessionStorage.removeItem('np-admin');location.reload();}};
if(token)api('session').then(refresh).then(()=>{$('login').hidden=true;$('app').hidden=false;}).catch(e=>{$('loginError').textContent=e.message;});
