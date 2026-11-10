/**
 * My Souq Telegram Worker — Status Guard (للدمج في worker 2.3.x)
 * ================================================================
 * انسخ الدوال دي جوه worker تليجرام الطلبات + بوت المشاكل.
 *
 * الفكرة:
 * 1) أي زر من تليجرام (status / cancel / x2 / exchange) → اقرأ Firestore أولاً
 * 2) لو الخطوة اتعملت من الإدارة أو من تليجرام قبل كده → answerCallbackQuery بتنبيه فقط
 * 3) استقبل POST action=status_sync من الموقع وحدّث رسالة التليجرام / ابعت تنبيه
 */

const STATUS_LABELS = {
  0: 'تحت التنفيذ',
  1: 'تم الحجز',
  2: 'جاري الشحن',
  3: 'تم التوريد',
  4: 'رفض استلام وحظر',
  5: 'Order 0 Stock',
  6: 'مراجعة طلب X2'
};

async function readOrderState(db, orderId) {
  const id = String(orderId || '').trim();
  if (!id) return null;
  let snap = await db.collection('orders').doc(id).get().catch(() => null);
  if (!snap || !snap.exists) {
    snap = await db.collection('orderTracking').doc(id).get().catch(() => null);
  }
  const cancelled = await db.collection('cancelledOrders').doc(id).get().catch(() => null);
  const data = (snap && snap.exists) ? (snap.data() || {}) : {};
  if (cancelled && cancelled.exists) {
    data.cancelled = true;
    data.lastCancelSource = (cancelled.data() || {}).lastCancelSource || (cancelled.data() || {}).source || 'system';
    data.cancellationType = (cancelled.data() || {}).cancellationType || '';
  }
  data.orderId = data.orderId || id;
  data.statusCode = Number.isFinite(Number(data.statusCode)) ? Number(data.statusCode) : null;
  return data;
}

async function answerCb(apiBase, callbackQueryId, text, alert) {
  await fetch(apiBase + '/answerCallbackQuery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text: String(text || '').slice(0, 200),
      show_alert: !!alert
    })
  });
}

/**
 * قبل تنفيذ زر الحالة من تليجرام
 * requestedCode: 0..6
 * returns true لو مسموح التنفيذ، false لو اترفض
 */
async function guardStatusButton({ db, apiBase, callbackQueryId, orderId, requestedCode }) {
  const state = await readOrderState(db, orderId);
  if (!state) {
    await answerCb(apiBase, callbackQueryId, 'الطلب غير موجود في قاعدة البيانات', true);
    return false;
  }
  if (state.cancelled || state.lastCancelSource) {
    const from = state.lastCancelSource === 'admin' ? 'شاشة الإدارة' : 'تليجرام/النظام';
    await answerCb(apiBase, callbackQueryId, '🚫 تم إلغاء هذا الطلب مسبقًا من ' + from + '. لا يمكن تغيير الحالة.', true);
    return false;
  }
  const current = Number(state.statusCode);
  const req = Number(requestedCode);
  if (Number.isFinite(current) && current === req) {
    const src = state.lastStatusSource === 'admin' ? 'شاشة الإدارة' : (state.lastStatusSource === 'telegram' ? 'تليجرام' : 'النظام');
    await answerCb(
      apiBase,
      callbackQueryId,
      'ℹ️ تمت هذه الخطوة بالفعل من ' + src + '.\nالحالة الحالية: ' + (state.status || state.lastStatusLabel || STATUS_LABELS[current] || current),
      true
    );
    return false;
  }
  // منع الرجوع لمرحلة سابقة (0-3)
  if (Number.isFinite(current) && Number.isFinite(req) && req < 4 && current > req && current < 4) {
    await answerCb(
      apiBase,
      callbackQueryId,
      'ℹ️ الطلب بالفعل في مرحلة لاحقة (' + (state.status || STATUS_LABELS[current] || current) + '). لا يمكن الرجوع.',
      true
    );
    return false;
  }
  return true;
}

/**
 * قبل تنفيذ إلغاء / استبدال من بوت المشاكل
 * kind: 'normal' | 'exceptional' | 'exchange'
 */
async function guardCancelOrExchange({ db, apiBase, callbackQueryId, orderId, kind }) {
  const state = await readOrderState(db, orderId);
  if (!state) {
    await answerCb(apiBase, callbackQueryId, 'الطلب غير موجود', true);
    return false;
  }
  if (state.cancelled || state.lastCancelSource) {
    const from = state.lastCancelSource === 'admin' ? 'شاشة الإدارة' : 'تليجرام/النظام';
    await answerCb(apiBase, callbackQueryId, 'ℹ️ بالفعل تمت هذه الخطوة من ' + from + ' (الطلب ملغي).', true);
    return false;
  }
  if (state.exchangeOrReturnClosed || state.exchangeResolved) {
    await answerCb(apiBase, callbackQueryId, 'ℹ️ موقف الاستبدال/الإرجاع مغلق بالفعل من شاشة الإدارة.', true);
    return false;
  }
  const code = Number(state.statusCode);
  if (kind === 'normal' && Number.isFinite(code) && code !== 0) {
    await answerCb(apiBase, callbackQueryId, 'ℹ️ الإلغاء العادي متاح فقط تحت التنفيذ. الحالة الحالية لا تسمح.', true);
    return false;
  }
  if (kind === 'exceptional' && Number.isFinite(code) && code !== 1 && code !== 2) {
    await answerCb(apiBase, callbackQueryId, 'ℹ️ الإلغاء الاستثنائي متاح للحجز/الشحن فقط. الحالة الحالية لا تسمح.', true);
    return false;
  }
  return true;
}

/**
 * معالجة POST من الموقع: action=status_sync
 * ابعت رسالة في شات الطلبات بدون ما تغيّر الحالة (الحالة اتحدثت من الإدارة)
 */
async function handleAdminStatusSync({ apiBase, chatId, body }) {
  const id = body.orderId || '';
  const label = body.status || body.statusLabel || STATUS_LABELS[body.statusCode] || body.statusCode;
  const text =
    '🖥️ تحديث من شاشة الإدارة\n' +
    '🆔 ' + id + '\n' +
    '📌 الحالة الآن: ' + label + '\n' +
    '✅ تم التسجيل في النظام — أزرار تليجرام لنفس الخطوة هتنبّه إنها اتعملت بالفعل.';
  await fetch(apiBase + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true
    })
  });
}

/**
 * مثال ربط في callback_query handler:
 *
 * if (data.startsWith('status:')) {
 *   const [, codeStr, orderId] = data.split(':');
 *   const ok = await guardStatusButton({ db, apiBase, callbackQueryId: cq.id, orderId, requestedCode: Number(codeStr) });
 *   if (!ok) return;
 *   // ... نفّذ التحديث واكتب lastStatusSource: 'telegram'
 * }
 *
 * if (data.startsWith('cancel:normal:')) {
 *   const orderId = data.split(':')[2];
 *   const ok = await guardCancelOrExchange({ db, apiBase, callbackQueryId: cq.id, orderId, kind: 'normal' });
 *   if (!ok) return;
 *   // ...
 * }
 *
 * if (data.startsWith('cancel:exceptional:')) { ... kind: 'exceptional' }
 * if (data.startsWith('exchange:')) { ... kind: 'exchange' }
 *
 * وفي POST / من الموقع:
 * if (body.action === 'status_sync' || body.type === 'admin_status_sync') {
 *   await handleAdminStatusSync({ apiBase, chatId: ORDERS_CHAT_ID, body });
 *   return json({ ok: true });
 * }
 */

module.exports = {
  readOrderState,
  guardStatusButton,
  guardCancelOrExchange,
  handleAdminStatusSync,
  STATUS_LABELS
};
