let products = [];
let cart = JSON.parse(localStorage.getItem("souqCart")) || [];
let ordersHistory = JSON.parse(localStorage.getItem("souqOrdersHistory")) || [];
let isAdminMode = false;
let currentAdminUser = null;

// ===== Phone Validation (بدون OTP حالياً) =====
// تم تعطيل نظام OTP مؤقتاً بناءً على طلب صاحب الموقع
let phoneVerified = false;
let verifiedPhone = '';
let phoneConfirmationResult = null;
let phoneRecaptchaVerifier = null;
let otpRequestInProgress = false;

// ===== حماية من التكرار =====
const ORDER_COOLDOWN_MINUTES = 15; // ممنوع طلب جديد من نفس الرقم قبل مرور 15 دقيقة

// ===== وضع الصيانة (يتحكم فيه الأدمن من الصفحة) =====
let maintenanceModeActive = localStorage.getItem('souqMaintenance') === '1';

function applyMaintenanceMode() {
  // الأدمن المسجل دخوله يقدر يشوف الموقع حتى لو الصيانة شغالة
  if (isAdminMode && currentAdminUser) {
    const overlay = document.getElementById('maintenanceOverlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    updateMaintenanceButton();
    return;
  }
  const overlay = document.getElementById('maintenanceOverlay');
  if (!overlay) return;
  if (maintenanceModeActive) {
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } else {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }
  updateMaintenanceButton();
}

function updateMaintenanceButton() {
  const btn = document.getElementById('maintenanceToggleBtn');
  if (!btn) return;
  if (maintenanceModeActive) {
    btn.textContent = '✅ إلغاء الصيانة';
    btn.style.background = '#2e7d32';
  } else {
    btn.textContent = '🔧 تفعيل الصيانة';
    btn.style.background = '#e65100';
  }
}

async function loadMaintenanceFromCloud() {
  if (!firebaseReady || !db) {
    applyMaintenanceMode();
    return;
  }
  try {
    const snap = await db.collection('settings').doc('site').get();
    if (snap.exists && typeof snap.data().maintenance === 'boolean') {
      maintenanceModeActive = snap.data().maintenance;
      localStorage.setItem('souqMaintenance', maintenanceModeActive ? '1' : '0');
    }
  } catch (e) {
    console.warn('تعذر قراءة وضع الصيانة:', e);
  }
  applyMaintenanceMode();
}

async function toggleMaintenanceMode() {
  if (!isAdminMode || !currentAdminUser) {
    alert('يجب تسجيل دخول الأدمن أولاً');
    return;
  }
  const newValue = !maintenanceModeActive;
  const confirmMsg = newValue
    ? 'هل تريد تفعيل وضع الصيانة؟\nالزوار لن يتمكنوا من استخدام الموقع.'
    : 'هل تريد إلغاء وضع الصيانة وفتح الموقع للزوار؟';
  if (!confirm(confirmMsg)) return;

  maintenanceModeActive = newValue;
  localStorage.setItem('souqMaintenance', newValue ? '1' : '0');

  if (firebaseReady && db) {
    try {
      await db.collection('settings').doc('site').set({
        maintenance: newValue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: currentAdminUser.email || 'admin'
      }, { merge: true });
    } catch (e) {
      console.error('فشل حفظ وضع الصيانة:', e);
      alert('تم التغيير محليًا، لكن فشل الحفظ على السحابة. تأكد من قواعد Firestore.');
    }
  }

  applyMaintenanceMode();
  alert(newValue ? 'تم تفعيل وضع الصيانة ✅' : 'تم فتح الموقع للزوار ✅');
}

// ===== جلب IP العميل (مجاني) =====
async function getClientIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { timeout: 4000 });
    if (!res.ok) return 'unknown';
    const data = await res.json();
    return data.ip || 'unknown';
  } catch (e) {
    try {
      const res2 = await fetch('https://ipapi.co/ip/');
      if (res2.ok) return (await res2.text()).trim() || 'unknown';
    } catch (_) {}
    return 'unknown';
  }
}


function getRecentOrdersMap() {
  try {
    return JSON.parse(localStorage.getItem('souqRecentOrders') || '{}');
  } catch {
    return {};
  }
}

function isPhoneRecentlyUsed(phone) {
  const map = getRecentOrdersMap();
  const lastTime = map[phone];
  if (!lastTime) return false;
  const diffMinutes = (Date.now() - lastTime) / (1000 * 60);
  return diffMinutes < ORDER_COOLDOWN_MINUTES;
}

function markPhoneAsUsed(phone) {
  const map = getRecentOrdersMap();
  map[phone] = Date.now();
  const cutoff = Date.now() - (ORDER_COOLDOWN_MINUTES * 60 * 1000 * 2);
  Object.keys(map).forEach(k => {
    if (map[k] < cutoff) delete map[k];
  });
  localStorage.setItem('souqRecentOrders', JSON.stringify(map));
}

// ===== reCAPTCHA (مجاني من Google) =====
// اعمل Site Key مجاني من: https://www.google.com/recaptcha/admin
// بعدين حط المفتاح مكان YOUR_SITE_KEY_HERE
const RECAPTCHA_SITE_KEY = '6Lc1X9QtAAAAAO9fudClqmrzRq8MnnN2f7bIr7M4';
let recaptchaWidgetId = null;
let recaptchaSolved = false;

function onRecaptchaSuccess() {
  recaptchaSolved = true;
}

function onRecaptchaExpired() {
  recaptchaSolved = false;
}

function renderRecaptchaIfNeeded() {
  const container = document.getElementById('order-recaptcha');
  if (!container) return;
  if (typeof grecaptcha === 'undefined' || RECAPTCHA_SITE_KEY === 'YOUR_SITE_KEY_HERE') {
    recaptchaSolved = true;
    container.innerHTML = '<p style="font-size:12px;color:#888;text-align:center;margin:8px 0;">reCAPTCHA مش مفعّل (حط Site Key عشان يتفعل)</p>';
    return;
  }
  if (recaptchaWidgetId === null) {
    try {
      recaptchaWidgetId = grecaptcha.render('order-recaptcha', {
        sitekey: RECAPTCHA_SITE_KEY,
        callback: onRecaptchaSuccess,
        'expired-callback': onRecaptchaExpired
      });
    } catch (e) {
      console.warn('reCAPTCHA render error:', e);
      recaptchaSolved = true;
    }
  }
}

/* ========== Firebase Config ==========
   املأ البيانات دي من مشروعك في Firebase Console
   (Project settings → Your apps → SDK setup and configuration)
====================================== */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGSFAnYRmauxCAa7HmyVenPWIy-KJHsxg",
  authDomain: "my-souq0.firebaseapp.com",
  projectId: "my-souq0",
  storageBucket: "my-souq0.firebasestorage.app",
  messagingSenderId: "334605657240",
  appId: "1:334605657240:web:6598cf95d6a010ea855ced",
  measurementId: "G-R11Z1VRYTZ"
};

let db = null;
let firebaseReady = false;

function initFirebase() {
  try {
    if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === "PASTE_YOUR_API_KEY") {
      console.warn("Firebase مش متضبط — التتبع هيشتغل محلياً فقط لحد ما تحط الإعدادات.");
      return;
    }
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.firestore();
    firebaseReady = true;
    firebase.auth().onAuthStateChanged(user => {
      // عميل OTP لديه phoneNumber فقط، ولا نعتبره مشرفاً.
      if (user && user.email) {
        currentAdminUser = user;
        isAdminMode = true;
      } else {
        currentAdminUser = null;
        isAdminMode = false;
      }
    });
    console.log("Firebase جاهز ✅");
  } catch (e) {
    console.error("خطأ Firebase:", e);
    firebaseReady = false;
  }
}

// حفظ طلب على Firebase + محلياً (بدون شرط OTP)
async function saveOrderToCloud(orderRecord) {
  if (!firebaseReady || !db) {
    // حفظ محلي كاحتياطي
    const exists = ordersHistory.findIndex(o => o.orderId === orderRecord.orderId);
    if (exists >= 0) ordersHistory[exists] = orderRecord;
    else ordersHistory.push(orderRecord);
    localStorage.setItem("souqOrdersHistory", JSON.stringify(ordersHistory));
    return true;
  }

  try {
    await db.collection("orders").doc(orderRecord.orderId).set({
      ...orderRecord,
      items: orderRecord.items || [],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const exists = ordersHistory.findIndex(o => o.orderId === orderRecord.orderId);
    if (exists >= 0) ordersHistory[exists] = orderRecord;
    else ordersHistory.push(orderRecord);
    localStorage.setItem("souqOrdersHistory", JSON.stringify(ordersHistory));

    return true;
  } catch (e) {
    console.error("فشل حفظ الطلب على السحابة:", e);
    // احتياطي محلي
    const exists = ordersHistory.findIndex(o => o.orderId === orderRecord.orderId);
    if (exists >= 0) ordersHistory[exists] = orderRecord;
    else ordersHistory.push(orderRecord);
    localStorage.setItem("souqOrdersHistory", JSON.stringify(ordersHistory));
    return true;
  }
}

// جلب طلب من Firebase (أو محلي كاحتياطي)
async function fetchOrderFromCloud(orderId) {
  if (firebaseReady && db) {
    try {
      const snap = await db.collection("orders").doc(orderId).get();
      if (snap.exists) {
        const data = snap.data();
        // حدّث الكاش المحلي
        const idx = ordersHistory.findIndex(o => o.orderId === orderId);
        if (idx >= 0) ordersHistory[idx] = data;
        else ordersHistory.push(data);
        localStorage.setItem("souqOrdersHistory", JSON.stringify(ordersHistory));
        return data;
      }
    } catch (e) {
      console.error("خطأ قراءة الطلب:", e);
    }
  }
  // احتياطي محلي
  return ordersHistory.find(o => o.orderId.toLowerCase() === orderId.toLowerCase()) || null;
}

// تحديث حالة الطلب على Firebase + محلي
async function updateOrderStatusCloud(orderId, newCode, newLabel) {
  const order = ordersHistory.find(o => o.orderId === orderId);
  if (order) {
    order.statusCode = newCode;
    order.status = newLabel;
    localStorage.setItem("souqOrdersHistory", JSON.stringify(ordersHistory));
  }

  if (!firebaseReady || !db) return !!order;
  try {
    await db.collection("orders").doc(orderId).update({
      statusCode: newCode,
      status: newLabel,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (e) {
    console.error("فشل تحديث الحالة:", e);
    // لو الطلب مش موجود على السحابة نحاول set كامل
    if (order) {
      try {
        await db.collection("orders").doc(orderId).set({
          ...order,
          statusCode: newCode,
          status: newLabel,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
      } catch (e2) {
        console.error(e2);
      }
    }
    return false;
  }
}

let currentCategory = "الكل";
let currentStockFilter = "all";
let currentSizeFilter = "الكل";
let galleryIndex = 0;
let productSales = JSON.parse(localStorage.getItem("souqProductSales") || "{}");

let selectedSize = null;
let selectedVariantStatus = "available";

let currentSelectedProduct = null;
let activeModalImage = '';
let discountRate = 0;
let generatedOrderId = '';

const GITHUB_USER = 'souq-elektroni';
const GITHUB_REPO = 'My-Souq.github.io';
const GITHUB_BRANCH = 'main';

const productsGrid = document.getElementById("products-container");
const cartCount = document.getElementById("cartCount");

/* رقم طلب قصير + قوي + مضمون عدم التكرار (مثال: MS-K7P2M9X4) */
function generateStrongOrderId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف متشابهة
  let id = '';
  let attempts = 0;
  do {
    id = 'MS-';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    attempts++;
  } while (
    ordersHistory.some(o => o.orderId === id) &&
    attempts < 50
  );
  return id;
}

function toggleQrBox() {
  document.getElementById('floatingQr').classList.toggle('show');
}


async function loadRealProducts() {

  try {

    const apiUrl =
      `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/products`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`حالة الاستجابة: ${response.status}`);
    }

    const files = await response.json();

    const mdFiles = files.filter(
      f => f.name.endsWith('.md') || f.name.endsWith('.markdown')
    );

    if (mdFiles.length === 0) {

      productsGrid.innerHTML =
        '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:15px;font-weight:bold;">لا توجد منتجات منشورة حالياً.</p>';

      return;
    }

    products = [];

    for (let i = 0; i < mdFiles.length; i++) {

      const file = mdFiles[i];

      const rawUrl =
        `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/products/${encodeURIComponent(file.name)}`;

      const fileRes = await fetch(rawUrl);

      if (!fileRes.ok) continue;

      const text = await fileRes.text();

      const productData = parseMarkdown(text, i + 1);

      if (productData) {
        products.push(productData);
      }

    }

    if (products.length === 0) {

      productsGrid.innerHTML =
        '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:15px;font-weight:bold;">تعذر قراءة ملفات المنتجات.</p>';

      return;
    }

    renderProducts(products);
    buildSizeFilterButtons();
    renderFeatured();
    updateCartCount();
    handleDeepLink();

  } catch (error) {

    console.error('خطأ:', error);

    productsGrid.innerHTML =
      `<p style="grid-column:1/-1;text-align:center;color:var(--burgundy-soft);font-size:13.5px;font-weight:bold;">تأكد أن المستودع عام ويحتوي على ملفات منتجات.</p>`;

  }

}


function parseMarkdown(markdownText, id) {

  try {

    const parts = markdownText.split('---');

    if (parts.length < 3) {
      return null;
    }

    const frontmatter = parts[1];
    const body = parts.slice(2).join('---').trim();

    const getField = (key) => {

      const match =
        frontmatter.match(new RegExp(`${key}:\\s*(.+)`));

      return match
        ? match[1].trim().replace(/^["']|["']$/g, '')
        : '';

    };

    const title = getField('title') || 'منتج جديد';

    const price =
      parseFloat(getField('price')) || 0;

    const oldPrice =
      parseFloat(getField('oldPrice')) || 0;

    const category =
      getField('category') || 'ملابس شتوية';

    const stockStatus =
      getField('stock') || 'available';


    const fixImagePath = (rawPath) => {

      if (!rawPath) return '';

      let clean =
        rawPath
          .replace(/["'\[\]]/g, '')
          .trim()
          .replace(/\/+$/, '');

      if (!clean) return '';

      if (
        clean.startsWith('http://') ||
        clean.startsWith('https://')
      ) {
        return clean;
      }

      if (clean.startsWith('/')) {
        clean = clean.substring(1);
      }

      clean = clean.replace(/\s+/g, '%20');

      if (!clean.startsWith('images/')) {
        clean = 'images/' + clean;
      }

      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${clean}`;

    };


    let allExtractedImages = [];


    const singleImgMatch =
      frontmatter.match(/image:\s*(.+)/);

    if (singleImgMatch) {

      let cleaned =
        singleImgMatch[1].trim();

      if (
        cleaned &&
        cleaned !== 'none' &&
        !cleaned.startsWith('images:')
      ) {

        let fixed =
          fixImagePath(cleaned);

        if (fixed) {
          allExtractedImages.push(fixed);
        }

      }

    }


    const imagesMatch =
      frontmatter.match(
        /images:\s*\n([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/
      );

    if (imagesMatch) {

      const imgLines =
        imagesMatch[1].split('\n');

      imgLines.forEach(line => {

        let cleanLine =
          line.replace(/-\s*/, '').trim();

        if (
          cleanLine.includes('image_item:') ||
          cleanLine.includes('image:')
        ) {

          cleanLine =
            cleanLine
              .replace(/image_item:|image:/g, '')
              .trim();

        }

        if (
          cleanLine.includes('/') ||
          cleanLine.includes('.jpg') ||
          cleanLine.includes('.png') ||
          cleanLine.includes('.jpeg') ||
          cleanLine.includes('.webp')
        ) {

          if (
            cleanLine.includes(':') &&
            !cleanLine.startsWith('http')
          ) {

            cleanLine =
              cleanLine
                .split(':')
                .slice(1)
                .join(':')
                .trim();

          }

          let fixed =
            fixImagePath(cleanLine);

          if (
            fixed &&
            !allExtractedImages.includes(fixed)
          ) {

            allExtractedImages.push(fixed);

          }

        }

      });

    }


    if (allExtractedImages.length === 0) {

      allExtractedImages.push(
        'https://via.placeholder.com/300?text=My+Souq'
      );

    }


    let parsedVariants = [];

    const variantsMatch =
      frontmatter.match(/variants:\s*\n([\s\S]*)/);

    if (variantsMatch) {

      const variantText =
        variantsMatch[1];

      const vLines =
        variantText.split('\n');

      let currentVar = null;


      for (let vLine of vLines) {

        let trimmedLine =
          vLine.trim();


        if (trimmedLine.startsWith('-')) {

          if (
            currentVar &&
            currentVar.size
          ) {
            parsedVariants.push(currentVar);
          }

          currentVar = {
            size: '',
            price: null,
            pants_length: '',
            tshirt_length: '',
            tshirt_width: '',
            extra_piece: '',
            status: 'available'
          };

          trimmedLine =
            trimmedLine
              .replace(/^-\s*/, '')
              .trim();

        }


        if (!currentVar) continue;


        if (trimmedLine.startsWith('size:')) {

          currentVar.size =
            trimmedLine
              .split(':')
              .slice(1)
              .join(':')
              .trim()
              .replace(/["']/g, '');

        }

        else if (trimmedLine.startsWith('price:')) {

          let pVal =
            parseFloat(
              trimmedLine
                .split(':')[1]
                .trim()
            );

          if (!isNaN(pVal)) {
            currentVar.price = pVal;
          }

        }

        else if (
          trimmedLine.startsWith('pants_length:')
        ) {

          currentVar.pants_length =
            trimmedLine
              .split(':')
              .slice(1)
              .join(':')
              .trim()
              .replace(/["']/g, '');

        }

        else if (
          trimmedLine.startsWith('tshirt_length:')
        ) {

          currentVar.tshirt_length =
            trimmedLine
              .split(':')
              .slice(1)
              .join(':')
              .trim()
              .replace(/["']/g, '');

        }

        else if (
          trimmedLine.startsWith('tshirt_width:')
        ) {

          currentVar.tshirt_width =
            trimmedLine
              .split(':')
              .slice(1)
              .join(':')
              .trim()
              .replace(/["']/g, '');

        }

        else if (
          trimmedLine.startsWith('extra_piece:')
        ) {

          currentVar.extra_piece =
            trimmedLine
              .split(':')
              .slice(1)
              .join(':')
              .trim()
              .replace(/["']/g, '');

        }

        else if (
          trimmedLine.startsWith('status:')
        ) {

          let stVal =
            trimmedLine
              .split(':')[1]
              .trim()
              .replace(/["']/g, '');

          currentVar.status =
            stVal || 'available';

        }

      }


      if (
        currentVar &&
        currentVar.size
      ) {
        parsedVariants.push(currentVar);
      }

    }


    if (parsedVariants.length === 0) {

      parsedVariants.push({

        size: "مقاس موحد",

        pants_length: "",
        tshirt_length: "",
        tshirt_width: "",
        extra_piece: "",

        price: price,

        status: stockStatus

      });

    }


    let parsedBody = title;

    try {

      if (
        typeof marked !== 'undefined' &&
        typeof marked.parse === 'function'
      ) {

        parsedBody =
          marked.parse(body);

      }

    } catch (err) {

      parsedBody =
        body || title;

    }


    return {

      id: id,

      title: title,

      category: category,

      price: price,

      oldPrice: oldPrice,

      stock: stockStatus,

      images: allExtractedImages,

      variants: parsedVariants,

      desc: parsedBody

    };

  } catch (e) {

    console.error('Error parsing:', e);

    return null;

  }

}


function productCardHtml(p) {
  return `
      <div class="product-card" onclick="openProductModal(${p.id})">
        <div class="image-container">
          <img class="product-image" src="${p.images[0]}" alt="${p.title}"
            loading="lazy" decoding="async" fetchpriority="low"
            width="300" height="300"
            onerror="this.src='https://via.placeholder.com/300?text=My+Souq'">
        </div>
        <div class="product-details">
          <h3 class="product-title">${p.title}</h3>
          <div class="price-tag">
            ${p.price} ج.م
            ${p.oldPrice > 0 ? `<span style="font-size:11px;color:#999;text-decoration:line-through;margin-right:4px;font-weight:600;">${p.oldPrice} ج.م</span>` : ''}
          </div>
          <div class="click-hint">عرض التفاصيل 👈</div>
        </div>
      </div>`;
}

function renderProducts(list) {
  if (!productsGrid) return;
  if (list.length === 0) {
    productsGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);font-size:15px;font-weight:bold;">لا توجد منتجات مطابقة</p>';
    return;
  }
  productsGrid.innerHTML = list.map(productCardHtml).join('');
}

function buildSizeFilterButtons() {
  const sel = document.getElementById('sizeSelect');
  if (!sel) return;
  const sizes = new Set();
  products.forEach(p => {
    (p.variants || []).forEach(v => {
      if (v.size) sizes.add(v.size);
    });
  });
  const current = currentSizeFilter || 'الكل';
  let html = `<option value="الكل">📏 كل المقاسات</option>`;
  [...sizes].sort().forEach(s => {
    const safe = s.replace(/"/g, '&quot;');
    html += `<option value="${safe}" ${current === s ? 'selected' : ''}>${s}</option>`;
  });
  sel.innerHTML = html;
  sel.value = current;
}

function filterSize(size) {
  currentSizeFilter = size || 'الكل';
  handleSearchAndFilter();
}

function renderFeatured() {
  // تم إيقاف أقسام وصل حديثاً / الأكثر مبيعاً حسب طلب صاحب المتجر
  return;
}

function filterCategory(cat, btn) {
  currentCategory = cat;
  currentStockFilter = "all";
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  handleSearchAndFilter();
}

function filterStock(status, btn) {
  currentStockFilter = status;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  handleSearchAndFilter();
}

function handleSearchAndFilter() {
  const query = document.getElementById('searchInput')
    ? document.getElementById('searchInput').value.toLowerCase()
    : '';

  let filtered = products.filter(p => {
    let matchesCat =
      currentCategory === 'الكل' ||
      p.category === currentCategory ||
      (currentCategory === 'عروض' && p.oldPrice > 0);

    if (currentCategory === 'جديد') {
      const newestIds = [...products].slice().reverse().slice(0, 8).map(x => x.id);
      matchesCat = newestIds.includes(p.id);
    }
    if (currentCategory === 'الأكثر مبيعاً') {
      const bestIds = [...products].sort((a, b) => (productSales[b.id] || 0) - (productSales[a.id] || 0)).slice(0, 8).map(x => x.id);
      matchesCat = bestIds.includes(p.id);
    }

    const matchesStock =
      currentStockFilter === 'all' ||
      p.stock === currentStockFilter;

    const matchesSearch = p.title.toLowerCase().includes(query);

    const matchesSize =
      currentSizeFilter === 'الكل' ||
      (p.variants || []).some(v => v.size === currentSizeFilter);

    return matchesCat && matchesStock && matchesSearch && matchesSize;
  });

  renderProducts(filtered);
}

function applySorting() {
  const sortVal = document.getElementById('sortSelect')
    ? document.getElementById('sortSelect').value
    : '';
  let sorted = [...products];
  if (sortVal === 'low-high') sorted.sort((a, b) => a.price - b.price);
  else if (sortVal === 'high-low') sorted.sort((a, b) => b.price - a.price);
  renderProducts(sorted);
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('souqDarkMode', isDark ? '1' : '0');
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

function loadCustomerData() {
  try {
    const data = JSON.parse(localStorage.getItem('souqCustomerData') || '{}');
    if (data.name) document.getElementById('custName').value = data.name;
    if (data.phone) document.getElementById('custPhone').value = normalizeEgyptianPhone(data.phone);
    resetPhoneVerification();
    if (data.address) document.getElementById('custAddress').value = data.address;
  } catch (e) {}
}

function saveCustomerData() {
  const data = {
    name: document.getElementById('custName').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    address: document.getElementById('custAddress').value.trim()
  };
  localStorage.setItem('souqCustomerData', JSON.stringify(data));
}


function updateActionButtons(isOut) {

  const addBtn =
    document.getElementById('addCartBtn');

  const waBtn =
    document.getElementById('directWaBtn');


  if (addBtn) {

    if (isOut) {

      addBtn.style.opacity = '0.45';
      addBtn.style.pointerEvents = 'none';
      addBtn.style.textDecoration = 'line-through';

      addBtn.innerText =
        'غير متاح حالياً';

    } else {

      addBtn.style.opacity = '1';
      addBtn.style.pointerEvents = 'auto';
      addBtn.style.textDecoration = 'none';

      addBtn.innerText =
        'إضافة للسلة 🛒';

    }

  }


  if (waBtn) {

    if (isOut) {

      waBtn.style.opacity = '0.45';
      waBtn.style.pointerEvents = 'none';
      waBtn.style.textDecoration = 'line-through';

    } else {

      waBtn.style.opacity = '1';
      waBtn.style.pointerEvents = 'auto';
      waBtn.style.textDecoration = 'none';

    }

  }

}


function updateDirectWhatsAppButton() {

  const waBtn =
    document.getElementById('directWaBtn');

  if (
    !waBtn ||
    !currentSelectedProduct
  ) {
    return;
  }


  const priceEl =
    document.getElementById('modalPrice');


  const currentPrice =
    priceEl
    ? priceEl.innerText
    : `${currentSelectedProduct.price} ج.م`;


  const selectedImage =
    activeModalImage ||
    currentSelectedProduct.images[0] ||
    '';

  const instantOrderId = generateStrongOrderId();

  const waText =
`مرحباً، أود طلب المنتج التالي من متجر My Souq 🛒
🆔 رقم الطلب: ${instantOrderId}

📦 اسم المنتج: ${currentSelectedProduct.title}
📏 المقاس: ${selectedSize}
💰 السعر: ${currentPrice}

🖼️ رابط صورة المنتج:
${selectedImage}

أرغب في إتمام الطلب.`;

  waBtn.href =
    `https://wa.me/201116339905?text=${encodeURIComponent(waText)}`;

}


function openProductModal(id) {

  currentSelectedProduct =
    products.find(p => p.id === id);

  if (!currentSelectedProduct) {
    return;
  }


  const modalImg =
    document.getElementById('modalImage');

  const thumbsContainer =
    document.getElementById('thumbnailsContainer');

  const stockBadge =
    document.getElementById('modalStockBadge');


  galleryIndex = 0;
  if (modalImg) {
    modalImg.src = currentSelectedProduct.images[0];
    activeModalImage = currentSelectedProduct.images[0];
    modalImg.onclick = () => openZoom();
  }
  // رابط مباشر للمنتج في العنوان
  try {
    history.replaceState(null, '', '?product=' + id);
  } catch (e) {}


  const firstVariant =
    currentSelectedProduct.variants[0];


  selectedSize =
    firstVariant
    ? firstVariant.size
    : 'مقاس موحد';


  selectedVariantStatus =
    firstVariant
    ? (
        firstVariant.status ||
        'available'
      )
    : 'available';


  const isProductOut =
    currentSelectedProduct.stock === 'out';

  const isSizeOut =
    selectedVariantStatus === 'out';

  const isOut =
    isProductOut || isSizeOut;


  if (stockBadge) {

    if (isProductOut) {

      stockBadge.className =
        'stock-badge out';

      stockBadge.innerText =
        '🔴 نفذت الكمية - المنتج غير متاح حالياً';

    }

    else if (isSizeOut) {

      stockBadge.className =
        'stock-badge out';

      stockBadge.innerText =
        '🔴 نفذت الكمية لهذا المقاس';

    }

    else {

      stockBadge.className =
        'stock-badge';

      stockBadge.innerText =
        '🟢 متوفر بالمخزون - جاهز للشحن الفوري';

    }

  }


  if (thumbsContainer) {

    thumbsContainer.innerHTML = '';

    if (
      currentSelectedProduct.images.length > 1
    ) {

      thumbsContainer.style.display =
        'flex';


      currentSelectedProduct.images.forEach(
        (imgSrc, idx) => {

          const img =
            document.createElement('img');


          img.src =
            imgSrc;


          img.style.cssText =
            "width:45px;height:45px;object-fit:cover;border-radius:5px;border:2px solid transparent;cursor:pointer;flex-shrink:0;";


          if (idx === 0) {

            img.style.borderColor =
              "var(--burgundy-soft)";

          }


          img.onclick = () => {
            galleryIndex = idx;
            modalImg.src = imgSrc;
            activeModalImage = imgSrc;
            document.querySelectorAll('#thumbnailsContainer img').forEach(t => t.style.borderColor = 'transparent');
            img.style.borderColor = "var(--burgundy-soft)";
            updateDirectWhatsAppButton();
          };


          thumbsContainer.appendChild(img);

        }
      );

    }

    else {

      thumbsContainer.style.display =
        'none';

    }

  }


  document.getElementById('modalTitle').innerText =
    currentSelectedProduct.title;


  document.getElementById('modalDesc').innerHTML =
    currentSelectedProduct.desc;


  const priceEl =
    document.getElementById('modalPrice');


  const sizesContainer =
    document.getElementById('sizesContainer');


  const dimensionsContainer =
    document.getElementById('dimensionsContainer');


  if (priceEl) {

    let priceHtml =
      (
        firstVariant?.price ||
        currentSelectedProduct.price
      ) + ' ج.م';


    if (
      currentSelectedProduct.oldPrice > 0
    ) {

      priceHtml +=
        ` <span style="font-size:12px;color:#999;text-decoration:line-through;margin-right:4px;font-weight:600;">
          ${currentSelectedProduct.oldPrice} ج.م
        </span>`;

    }


    priceEl.innerHTML =
      priceHtml;

  }


  function updateDimensionsDisplay(variant) {

    if (!dimensionsContainer) {
      return;
    }


    const pants =
      variant.pants_length || '-';

    const tLen =
      variant.tshirt_length || '-';

    const tWidth =
      variant.tshirt_width || '-';

    const extra =
      variant.extra_piece || '-';


    document.getElementById(
      'modalPantsLen'
    ).innerText = pants;


    document.getElementById(
      'modalTshirtLen'
    ).innerText = tLen;


    document.getElementById(
      'modalTshirtWidth'
    ).innerText = tWidth;


    document.getElementById(
      'modalExtraPiece'
    ).innerText = extra;


    if (
      pants !== '-' ||
      tLen !== '-' ||
      tWidth !== '-' ||
      extra !== '-'
    ) {

      dimensionsContainer.style.display =
        'grid';

    }

    else {

      dimensionsContainer.style.display =
        'none';

    }

  }


  updateDimensionsDisplay(firstVariant);

  updateActionButtons(isOut);


  if (sizesContainer) {

    sizesContainer.innerHTML = '';


    currentSelectedProduct.variants.forEach(
      (v) => {

        const btn =
          document.createElement('div');


        const isSelected =
          v.size === selectedSize;


        const isThisSizeOut =
          (
            v.status ||
            'available'
          ) === 'out';


        btn.style.cssText = `

          padding:6px 10px;

          border:2px solid ${
            isSelected
            ? 'var(--burgundy-soft)'
            : 'var(--border-color)'
          };

          border-radius:7px;

          background:${
            isThisSizeOut
            ? '#ffebee'
            : (
                isSelected
                ? 'var(--pink-soft)'
                : 'var(--bg-cream)'
              )
          };

          cursor:pointer;

          font-size:12px;

          font-weight:800;

          color:${
            isThisSizeOut
            ? '#c62828'
            : 'var(--text-dark)'
          };

          display:flex;

          align-items:center;

          gap:4px;

        `;


        btn.innerHTML = `

          <input
            type="radio"
            name="productSize"
            value="${v.size}"
            ${
              isSelected
              ? 'checked'
              : ''
            }
            style="accent-color:var(--burgundy-soft);width:13px;height:13px;"
          >

          <span>
            ${v.size}
            ${
              isThisSizeOut
              ? '(نفذت)'
              : ''
            }
          </span>

        `;


        btn.onclick = () => {

          document
            .querySelectorAll(
              '#sizesContainer > div'
            )
            .forEach(b => {

              b.style.borderColor =
                'var(--border-color)';

              b.style.background =
                b.innerText.includes('نفذت')
                ? '#ffebee'
                : 'var(--bg-cream)';

            });


          btn.style.borderColor =
            isThisSizeOut
            ? '#c62828'
            : 'var(--burgundy-soft)';


          btn.style.background =
            isThisSizeOut
            ? '#ffebee'
            : 'var(--pink-soft)';


          const radio =
            btn.querySelector('input');


          if (radio) {
            radio.checked = true;
          }


          selectedSize =
            v.size;


          selectedVariantStatus =
            v.status ||
            'available';


          if (priceEl) {

            let priceHtml =
              (
                v.price ||
                currentSelectedProduct.price
              ) + ' ج.م';


            if (
              currentSelectedProduct.oldPrice > 0
            ) {

              priceHtml +=
                ` <span style="font-size:12px;color:#999;text-decoration:line-through;margin-right:4px;font-weight:600;">
                  ${currentSelectedProduct.oldPrice} ج.م
                </span>`;

            }


            priceEl.innerHTML =
              priceHtml;

          }


          updateDimensionsDisplay(v);


          const productOut =
            currentSelectedProduct.stock === 'out';

          const sizeOut =
            selectedVariantStatus === 'out';

          const currentlyOut =
            productOut || sizeOut;


          if (productOut) {

            stockBadge.className =
              'stock-badge out';

            stockBadge.innerText =
              '🔴 نفذت الكمية - المنتج غير متاح حالياً';

          }

          else if (sizeOut) {

            stockBadge.className =
              'stock-badge out';

            stockBadge.innerText =
              '🔴 نفذت الكمية لهذا المقاس';

          }

          else {

            stockBadge.className =
              'stock-badge';

            stockBadge.innerText =
              '🟢 متوفر بالمخزون - جاهز للشحن الفوري';

          }


          updateActionButtons(
            currentlyOut
          );

          updateDirectWhatsAppButton();

        };


        sizesContainer.appendChild(btn);

      }
    );

  }

  updateDirectWhatsAppButton();

  document
    .getElementById('productModal')
    .classList.add('active');

}


function closeModal() {

  document
    .getElementById('productModal')
    .classList.remove('active');

}


function addToCart() {

  if (
    !currentSelectedProduct ||
    currentSelectedProduct.stock === 'out' ||
    selectedVariantStatus === 'out'
  ) {

    alert(
      'عذراً، هذا المنتج أو المقاس نفذت كميته'
    );

    return;

  }


  const activeVariant =
    currentSelectedProduct.variants.find(
      v => v.size === selectedSize
    );


  const itemPrice =
    activeVariant &&
    activeVariant.price
    ? activeVariant.price
    : currentSelectedProduct.price;


  const existing =
    cart.find(
      item =>
        item.id === currentSelectedProduct.id &&
        item.size === selectedSize
    );


  if (existing) {

    existing.qty += 1;

  }

  else {

    cart.push({

      id: currentSelectedProduct.id,

      title:
        currentSelectedProduct.title,

      price:
        itemPrice,

      image:
        activeModalImage ||
        currentSelectedProduct.images[0],

      size:
        selectedSize,

      qty: 1

    });

  }


  localStorage.setItem(
    "souqCart",
    JSON.stringify(cart)
  );


  updateCartCount();

  closeModal();

  showToast();

  renderCartItems();

  document
    .getElementById('cartModal')
    .classList.add('active');

}


function showToast() {

  const toast =
    document.getElementById(
      'toastNotification'
    );

  toast.classList.add('show');

  setTimeout(
    () =>
      toast.classList.remove('show'),
    3000
  );

}


function updateCartCount() {

  const totalCount =
    cart.reduce(
      (sum, item) =>
        sum + item.qty,
      0
    );


  if (cartCount) {
    cartCount.innerText =
      totalCount;
  }


  localStorage.setItem(
    "souqCart",
    JSON.stringify(cart)
  );

}


function openCartModal() {
  loadCustomerData();
  renderCartItems();
  document.getElementById('cartModal').classList.add('active');
}


function closeCartModal() {

  document
    .getElementById('cartModal')
    .classList.remove('active');

}


function renderCartItems() {

  const container =
    document.getElementById(
      'cartItemsContainer'
    );

  const promoBox =
    document.getElementById(
      'promoBox'
    );

  const customerFormBox =
    document.getElementById(
      'customerFormBox'
    );

  const proceedBtn =
    document.getElementById(
      'proceedBtn'
    );


  if (cart.length === 0) {

    container.innerHTML =
      '<p style="text-align:center;color:var(--text-muted);font-size:13px;">السلة فارغة حالياً</p>';

    if (promoBox) {
      promoBox.style.display =
        'none';
    }

    if (customerFormBox) {
      customerFormBox.style.display =
        'none';
    }

    if (proceedBtn) {
      proceedBtn.style.display =
        'none';
    }

    document
      .getElementById('cartTotalPrice')
      .innerText =
      '0 ج.م';

    return;

  }


  if (promoBox) {
    promoBox.style.display =
      'flex';
  }

  if (customerFormBox) {
    customerFormBox.style.display =
      'flex';
  }


  container.innerHTML =
    cart.map(
      (item, index) => `

        <div class="cart-item">

          <div class="cart-item-info">

            <span class="cart-item-title">
              ${item.title}
            </span>

            <span class="cart-item-meta">
              المقاس: ${item.size}
            </span>

          </div>

          <div class="quantity-controls">

            <button
              class="qty-btn"
              onclick="changeQty(${index}, -1)"
            >
              -
            </button>

            <span class="qty-num">
              ${item.qty}
            </span>

            <button
              class="qty-btn"
              onclick="changeQty(${index}, 1)"
            >
              +
            </button>

          </div>

          <span class="cart-item-price">
            ${item.price * item.qty} ج.م
          </span>

          <button
            class="remove-btn"
            onclick="removeFromCart(${index})"
          >
            ✕
          </button>

        </div>

      `
    ).join('');


  updateTotalPrice();

  checkFormCompletion();

}


function changeQty(index, delta) {

  cart[index].qty += delta;

  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }


  localStorage.setItem(
    "souqCart",
    JSON.stringify(cart)
  );


  updateCartCount();

  renderCartItems();

}


function removeFromCart(index) {

  cart.splice(index, 1);

  localStorage.setItem(
    "souqCart",
    JSON.stringify(cart)
  );


  updateCartCount();

  renderCartItems();

}


function updateTotalPrice() {

  let subtotal =
    cart.reduce(
      (sum, item) =>
        sum + (item.price * item.qty),
      0
    );


  let total =
    subtotal * (1 - discountRate);


  document
    .getElementById('cartTotalPrice')
    .innerText =
    total.toFixed(0) + ' ج.م';

}


function applyPromoCode() {

  const code =
    document
      .getElementById('promoInput')
      .value
      .trim();


  if (code === 'SOUQ10') {

    discountRate = 0.10;

    alert(
      'تم تطبيق خصم 10% بنجاح!'
    );

    updateTotalPrice();

  }

  else {

    alert(
      'كود الخصم غير صحيح'
    );

  }

}


function toWesternDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizeEgyptianPhone(value) {
  return toWesternDigits(value).replace(/\D/g, '');
}

function isValidEgyptianMobile(phone) {
  return /^01[0125]\d{8}$/.test(normalizeEgyptianPhone(phone));
}

function formatPhoneForFirebase(phone) {
  const normalized = normalizeEgyptianPhone(phone);
  return '+20' + normalized.substring(1);
}

function maskPhone(phone) {
  const p = normalizeEgyptianPhone(phone);
  if (p.length !== 11) return p;
  return p.substring(0, 3) + '*****' + p.substring(8);
}

function resetPhoneVerification() {
  phoneVerified = false;
  verifiedPhone = '';
  phoneConfirmationResult = null;
}

function handlePhoneInput() {
  const input = document.getElementById('custPhone');
  if (!input) return;
  const normalized = normalizeEgyptianPhone(input.value);
  input.value = normalized.slice(0, 11);
  if (verifiedPhone && input.value !== verifiedPhone) resetPhoneVerification();
  checkFormCompletion();
}

function checkFormCompletion() {
  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const addressEl = document.getElementById('custAddress');
  const proceedBtn = document.getElementById('proceedBtn');
  if (!nameEl || !phoneEl || !addressEl || !proceedBtn) return;

  const ready =
    nameEl.value.trim() &&
    isValidEgyptianMobile(phoneEl.value) &&
    addressEl.value.trim() &&
    cart.length > 0;

  proceedBtn.style.display = ready ? 'block' : 'none';
}

function validateAndOpenTerms() {
  const name = document.getElementById('custName').value.trim();
  const phoneInput = document.getElementById('custPhone');
  const address = document.getElementById('custAddress').value.trim();
  const phone = normalizeEgyptianPhone(phoneInput.value);
  phoneInput.value = phone;

  if (!name || !phone || !address) {
    alert('يرجى استكمال كافة بيانات الشحن المطلوبة');
    return;
  }
  if (!isValidEgyptianMobile(phone)) {
    alert('رقم الهاتف غير صحيح. يجب إدخال رقم موبايل مصري مكون من 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015.');
    phoneInput.focus();
    return;
  }
  if (cart.length === 0) {
    alert('السلة فارغة');
    return;
  }

  // حماية من التكرار مبكرًا
  if (isPhoneRecentlyUsed(phone)) {
    alert('تم استلام طلب من هذا الرقم مؤخرًا.\nانتظر ' + ORDER_COOLDOWN_MINUTES + ' دقيقة قبل إرسال طلب جديد.');
    return;
  }

  closeCartModal();
  document.getElementById('termsModal').classList.add('active');
}

function openPhoneOtpModal(phone) {
  const modal = document.getElementById('phoneOtpModal');
  if (!modal) return;
  document.getElementById('otpPhoneDisplay').textContent = maskPhone(phone);
  document.getElementById('otpCodeBox').style.display = 'none';
  document.getElementById('otpCodeInput').value = '';
  showOtpMessage('', false);
  modal.classList.add('active');
  initializePhoneRecaptcha();
}

function closePhoneOtpModal() {
  document.getElementById('phoneOtpModal')?.classList.remove('active');
}

function initializePhoneRecaptcha() {
  if (typeof firebase === 'undefined' || !firebase.auth) {
    showOtpMessage('Firebase Authentication غير متاح حالياً.', true);
    return;
  }
  try {
    if (phoneRecaptchaVerifier) {
      phoneRecaptchaVerifier.clear();
      phoneRecaptchaVerifier = null;
    }
    phoneRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'normal',
      callback: () => showOtpMessage('تم التحقق من reCAPTCHA. اضغط إرسال الكود.', false),
      'expired-callback': () => showOtpMessage('انتهت صلاحية التحقق. اضغط إرسال الكود مرة أخرى.', true)
    });
    phoneRecaptchaVerifier.render().catch(error => {
      console.error('reCAPTCHA render error:', error);
      showOtpMessage('تعذر تحميل التحقق. تأكد أن دومين الموقع مضاف في Firebase.', true);
    });
  } catch (error) {
    console.error('reCAPTCHA init error:', error);
    showOtpMessage('تعذر تشغيل التحقق الأمني.', true);
  }
}

async function sendPhoneVerificationCode() {
  if (otpRequestInProgress) return;
  const phone = normalizeEgyptianPhone(document.getElementById('custPhone')?.value || '');
  if (!isValidEgyptianMobile(phone)) {
    showOtpMessage('رقم الهاتف غير صحيح. أدخل 11 رقم موبايل مصري صحيح.', true);
    return;
  }
  if (!phoneRecaptchaVerifier) {
    initializePhoneRecaptcha();
    showOtpMessage('جاري تجهيز التحقق الأمني، اضغط إرسال الكود مرة أخرى.', false);
    return;
  }

  otpRequestInProgress = true;
  const sendBtn = document.getElementById('sendOtpBtn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'جاري إرسال الكود...'; }

  try {
    phoneConfirmationResult = await firebase.auth().signInWithPhoneNumber(
      formatPhoneForFirebase(phone),
      phoneRecaptchaVerifier
    );
    document.getElementById('otpCodeBox').style.display = 'block';
    showOtpMessage('تم إرسال كود التحقق إلى هاتفك. أدخل الكود المكون من 6 أرقام.', false);
    document.getElementById('otpCodeInput').focus();
  } catch (error) {
    console.error('Phone OTP send error:', error);
    phoneConfirmationResult = null;
    const msg = error?.code === 'auth/invalid-phone-number'
      ? 'رقم الهاتف غير مقبول من Firebase.'
      : error?.code === 'auth/too-many-requests'
        ? 'تم تجاوز عدد محاولات التحقق مؤقتاً. حاول لاحقاً.'
        : 'لم يتم إرسال الكود. تأكد من تفعيل Phone Authentication وإضافة دومين الموقع في Firebase.';
    showOtpMessage(msg, true);
    try { phoneRecaptchaVerifier?.clear(); } catch (_) {}
    phoneRecaptchaVerifier = null;
  } finally {
    otpRequestInProgress = false;
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'إرسال كود التحقق 📩'; }
  }
}

async function verifyPhoneOtp() {
  if (!phoneConfirmationResult) {
    showOtpMessage('أرسل كود التحقق أولاً.', true);
    return;
  }
  const code = toWesternDigits(document.getElementById('otpCodeInput')?.value || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) {
    showOtpMessage('اكتب كود التحقق المكون من 6 أرقام.', true);
    return;
  }

  const verifyBtn = document.getElementById('verifyOtpBtn');
  if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'جاري التحقق...'; }
  try {
    await phoneConfirmationResult.confirm(code);
    const phone = normalizeEgyptianPhone(document.getElementById('custPhone').value);
    phoneVerified = true;
    verifiedPhone = phone;
    showOtpMessage('تم تأكيد رقم الهاتف بنجاح ✅', false);
    setTimeout(() => {
      closePhoneOtpModal();
      closeCartModal();
      document.getElementById('termsModal').classList.add('active');
    }, 500);
  } catch (error) {
    console.error('Phone OTP verify error:', error);
    phoneVerified = false;
    verifiedPhone = '';
    const msg = error?.code === 'auth/invalid-verification-code'
      ? 'كود التحقق غير صحيح. حاول مرة أخرى.'
      : error?.code === 'auth/code-expired'
        ? 'انتهت صلاحية الكود. اطلب كوداً جديداً.'
        : 'تعذر تأكيد الرقم. تأكد من الكود وحاول مرة أخرى.';
    showOtpMessage(msg, true);
  } finally {
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.textContent = 'تأكيد الرقم ✅'; }
  }
}

function showOtpMessage(message, isError) {
  const el = document.getElementById('otpMessage');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#c62828' : 'var(--burgundy-soft)';
}

function toggleTermsCheckbox() {

  const cb =
    document.getElementById(
      'termsCheckbox'
    );


  cb.checked =
    !cb.checked;


  handleCheckboxChange({
    target: cb
  });

}


function handleCheckboxChange(e) {

  const agreeBtn =
    document.getElementById(
      'agreeBtn'
    );


  if (e.target.checked) {

    agreeBtn.classList.add(
      'active'
    );

  }

  else {

    agreeBtn.classList.remove(
      'active'
    );

  }

}


function declineTerms() {

  document
    .getElementById('termsModal')
    .classList.remove('active');

}


function proceedToPayment() {
  document.getElementById('termsModal')?.classList.remove('active');
  document.getElementById('paymentModal')?.classList.add('active');
}


function selectPayment(method) {

  document
    .querySelectorAll(
      '.payment-option'
    )
    .forEach(
      el =>
        el.classList.remove(
          'selected'
        )
    );


  if (method === 'cod') {

    document
      .getElementById('optCod')
      .classList.add('selected');


    document
      .getElementById('payCod')
      .checked = true;

  }

  else {

    document
      .getElementById('optInstapay')
      .classList.add('selected');


    document
      .getElementById('payInstapay')
      .checked = true;

  }

}


function copyInstapay(e) {

  e.stopPropagation();

  navigator.clipboard.writeText(
    '01116339905'
  );

  alert(
    'تم نسخ رقم انستا باي بنجاح'
  );

}


function openOrderConfirmationModal() {
  document.getElementById('paymentModal').classList.remove('active');

  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const totalText = document.getElementById('cartTotalPrice').innerText;
  
  const selectedPayRadio = document.querySelector('input[name="payMethod"]:checked');
  const payMethod = selectedPayRadio && selectedPayRadio.value === 'cod' ? 'الدفع عند الاستلام' : 'Instapay';

  // عرض reCAPTCHA
  setTimeout(() => renderRecaptchaIfNeeded(), 300);

  generatedOrderId = generateStrongOrderId();

  let productsHtml = cart.map(item => `
    <div class="summary-product-row">
      <img src="${item.image}" class="summary-product-img" alt="${item.title}">
      <div style="flex:1;">
        <div style="font-weight:900; font-size:12.5px; color:var(--text-dark);">${item.title}</div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">المقاس: ${item.size} | الكمية: ${item.qty}</div>
        <div style="font-weight:900; color:var(--burgundy-soft); font-size:12.5px; margin-top:2px;">${item.price * item.qty} ج.م</div>
      </div>
    </div>
  `).join('');

  const summaryBox = document.getElementById('confirmationSummaryContent');
  summaryBox.innerHTML = `
    <div style="font-weight:900; color:var(--burgundy-soft); font-size:13px; border-bottom:2px solid var(--pink-accent); padding-bottom:4px;">
      🆔 رقم الطلب المؤقت: ${generatedOrderId}
    </div>
    <div style="display:grid; grid-template-columns:1fr; gap:2px; font-size:12.5px;">
      <div><strong>الاسم:</strong> ${name}</div>
      <div><strong>رقم التليفون:</strong> ${phone}</div>
    </div>
    <div style="font-size:12.5px;"><strong>العنوان:</strong> ${address}</div>
    <div style="font-size:12.5px;"><strong>طريقة الدفع:</strong> ${payMethod}</div>
    <div style="margin-top:2px; font-weight:bold; color:var(--burgundy-soft); font-size:12.5px;">المنتجات المختارة:</div>
    ${productsHtml}
    <div style="font-size:14px; font-weight:900; color:var(--burgundy-soft); margin-top:3px; border-top:2px solid var(--pink-accent); padding-top:5px; display:flex; justify-content:space-between;">
      <span>الإجمالي الكلي:</span>
      <span>${totalText}</span>
    </div>
  `;

  document.getElementById('confirmationModal').classList.add('active');
}


function backToCustomerData() {
  document.getElementById('confirmationModal').classList.remove('active');
  openCartModal();
}


async function finalizeOrder() {
  const name = document.getElementById('custName').value.trim();
  const phone = normalizeEgyptianPhone(document.getElementById('custPhone').value);
  const address = document.getElementById('custAddress').value.trim();

  // Honeypot: لو البوت ملأ الخانة المخفية نرفض الطلب بصمت
  const honeypot = document.getElementById('website_url');
  if (honeypot && honeypot.value.trim() !== '') {
    console.warn('Honeypot triggered - bot blocked');
    alert('حدث خطأ غير متوقع. حاول مرة أخرى.');
    return;
  }

  if (!isValidEgyptianMobile(phone)) {
    alert('رقم الهاتف غير صحيح. لا يمكن إتمام الطلب.');
    return;
  }

  // حماية من التكرار
  if (isPhoneRecentlyUsed(phone)) {
    alert('تم استلام طلب من هذا الرقم مؤخرًا.\nانتظر ' + ORDER_COOLDOWN_MINUTES + ' دقيقة قبل إرسال طلب جديد.');
    return;
  }

  // التحقق من reCAPTCHA
  if (!recaptchaSolved && RECAPTCHA_SITE_KEY !== 'YOUR_SITE_KEY_HERE') {
    alert('يرجى تأكيد أنك لست روبوت (reCAPTCHA) قبل إرسال الطلب.');
    return;
  }

  // جلب IP العميل
  const clientIP = await getClientIP();

  const selectedPayRadio =
    document.querySelector(
      'input[name="payMethod"]:checked'
    );


  const payMethod =
    selectedPayRadio &&
    selectedPayRadio.value === 'cod'
    ? 'الدفع عند الاستلام'
    : 'Instapay';


  let itemsText =
    cart.map(
      (i, index) => {

        let itemText =
          `${index + 1}. ${i.title}
- المقاس: ${i.size}
- السعر: ${i.price} ج.م (الكمية: ${i.qty})`;

        if (i.image) {

          itemText +=
            `\n- رابط صورة المنتج: ${i.image}`;

        }

        return itemText;

      }
    ).join('\n\n');


  const totalText =
    document
      .getElementById(
        'cartTotalPrice'
      )
      .innerText;


  const newOrderRecord = {
    orderId: generatedOrderId,
    name: name,
    phone: phone,
    address: address,
    payMethod: payMethod,
    total: totalText,
    items: [...cart],
    statusCode: 0, // 0: تحت التنفيذ | 1: تم الحجز | 2: جاري الشحن | 3: تم التوريد
    status: 'تحت التنفيذ 📦',
    date: new Date().toLocaleDateString('ar-EG'),
    createdAt: Date.now(),
    clientIP: clientIP || 'unknown'
  };

  // حفظ بيانات العميل للمرة الجاية
  saveCustomerData();

  // تحديث عداد المبيعات (للأكثر مبيعاً)
  cart.forEach(item => {
    productSales[item.id] = (productSales[item.id] || 0) + item.qty;
  });
  localStorage.setItem('souqProductSales', JSON.stringify(productSales));

  // حفظ الطلب على السحابة (أو محلياً كاحتياطي)
  await saveOrderToCloud(newOrderRecord);

  // تسجيل الرقم عشان منع التكرار
  markPhoneAsUsed(phone);


  let msg =
    `🛒 طلب جديد من متجر My Souq\n\n`;

  msg +=
    `🆔 رقم الطلب: ${generatedOrderId}\n`;

  msg +=
    `بيانات العميل:\n`;

  msg +=
    `• الاسم: ${name}\n`;

  msg +=
    `• رقم التواصل: ${phone}\n`;

  msg +=
    `• العنوان: ${address}\n`;

  msg +=
    `• طريقة الدفع: ${payMethod}\n\n`;

  msg +=
    `المنتجات المطلوبة:\n${itemsText}\n\n`;

  msg +=
    `الإجمالي الكلي: ${totalText}\n\n`;

  msg +=
    `إقرار العميل: أقر بأني اطلعت ووافقت على الشروط والأحكام.`;


  window.open(
    `https://wa.me/201116339905?text=${encodeURIComponent(msg)}`,
    '_blank'
  );


  cart = [];


  localStorage.setItem(
    "souqCart",
    JSON.stringify(cart)
  );


  updateCartCount();


  document
    .getElementById('confirmationModal')
    .classList.remove('active');


  document.getElementById('successOrderIdDisplay').innerText = `رقم طلبك هو: ${generatedOrderId}`;
  document
    .getElementById('successModal')
    .classList.add('active');

}


function closeSuccessModal() {

  document
    .getElementById('successModal')
    .classList.remove('active');

}


const ORDER_STATUSES = [
  { code: 0, label: 'تحت التنفيذ 📦', color: '#e65100' },
  { code: 1, label: 'تم الحجز ✅', color: '#1565c0' },
  { code: 2, label: 'جاري الشحن 🚚', color: '#6a1b9a' },
  { code: 3, label: 'تم التوريد 🎉', color: '#2e7d32' }
];

function openTrackingModal() {
  document.getElementById('trackingModal').classList.add('active');
  // لو الأدمن مفتوح نعرض تلميح صغير
  const hint = document.getElementById('adminHint');
  if (hint) {
    hint.style.display = isAdminMode ? 'block' : 'none';
    hint.innerText = isAdminMode ? '🔐 وضع الإدارة مفعّل — تقدر تغيّر حالة أي طلب' : '';
  }
}

function closeTrackingModal() {
  document.getElementById('trackingModal').classList.remove('active');
}

function handleAdminButton() {
  if (isAdminMode && currentAdminUser) openAdminOrdersModal();
  else document.getElementById('adminLoginModal')?.classList.add('active');
}

function closeAdminLogin() {
  document.getElementById('adminLoginModal')?.classList.remove('active');
}

async function loginAdmin() {
  const email = document.getElementById('adminEmail')?.value.trim().toLowerCase();
  const password = document.getElementById('adminPassword')?.value || '';
  const message = document.getElementById('adminLoginMessage');
  if (!email || !password) { if (message) message.textContent = 'اكتب البريد وكلمة المرور'; return; }
  try {
    const result = await firebase.auth().signInWithEmailAndPassword(email, password);
    currentAdminUser = result.user;
    isAdminMode = true;
    closeAdminLogin();
    openAdminOrdersModal();
  } catch (error) {
    console.error(error);
    if (message) message.textContent = 'خطأ تسجيل الدخول: ' + (error.code || 'حدث خطأ');
  }
}

async function logoutAdmin() {
  await firebase.auth().signOut();
  isAdminMode = false;
  currentAdminUser = null;
  closeAdminOrdersModal();
}

async function updateOrderStatus(orderId, newCode) {
  if (!isAdminMode) {
    alert('وضع الإدارة مش مفعّل');
    return;
  }

  const status = ORDER_STATUSES.find(s => s.code === newCode);
  if (!status) return;

  const resultBox = document.getElementById('trackingResultContainer');
  if (resultBox) {
    resultBox.innerHTML = `<div style="text-align:center; padding:12px; font-weight:800; color:var(--burgundy-soft);">جاري تحديث الحالة...</div>`;
  }

  const ok = await updateOrderStatusCloud(orderId, newCode, status.label);
  if (!ok) {
    alert('تعذر تحديث الحالة. تأكد من اتصال الإنترنت وإعدادات Firebase.');
  }

  document.getElementById('trackInputId').value = orderId;
  await searchOrderTracking();
}

// رمز سري لتفعيل وضع الإدارة من خانة التتبع (اختياري)
const ADMIN_SECRET_CODE = 'ADMIN2026';

function tryUnlockAdmin(code) {
  if (code && code.trim().toUpperCase() === ADMIN_SECRET_CODE) {
    isAdminMode = true;
    const hint = document.getElementById('adminHint');
    if (hint) {
      hint.style.display = 'block';
      hint.innerText = '🔐 وضع الإدارة مفعّل — تقدر تغيّر حالة أي طلب';
    }
    alert('تم تفعيل وضع الإدارة بنجاح');
    return true;
  }
  return false;
}

async function searchOrderTracking() {
  const searchId = document.getElementById('trackInputId').value.trim();
  const resultBox = document.getElementById('trackingResultContainer');

  if (!searchId) {
    alert('يرجى إدخال رقم الطلب أولاً');
    return;
  }

  if (!resultBox) {
    console.error('trackingResultContainer مش موجود في الصفحة');
    return;
  }

  // لو كتب رمز الإدارة
  if (tryUnlockAdmin(searchId)) return;

  resultBox.style.display = 'block';
  resultBox.innerHTML = `<div style="text-align:center; padding:12px; font-weight:800; color:var(--text-muted);">جاري البحث...</div>`;

  // جلب من السحابة (أي جهاز) مع احتياطي محلي
  const foundOrder = await fetchOrderFromCloud(searchId);

  if (foundOrder) {
    let currentCode = typeof foundOrder.statusCode === 'number' ? foundOrder.statusCode : 0;
    const current = ORDER_STATUSES[currentCode] || ORDER_STATUSES[0];

    let timelineHtml = ORDER_STATUSES.map((s, idx) => {
      const isDone = idx <= currentCode;
      const isCurrent = idx === currentCode;
      return `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <div style="width:22px; height:22px; border-radius:50%; background:${isDone ? s.color : '#ddd'}; color:white; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold; flex-shrink:0;">
            ${isDone ? '✓' : (idx + 1)}
          </div>
          <div style="flex:1; font-size:12.5px; font-weight:${isCurrent ? '900' : '600'}; color:${isDone ? s.color : '#999'};">
            ${s.label}
            ${isCurrent ? ' ← الحالة الحالية' : ''}
          </div>
        </div>
      `;
    }).join('');

    let adminControls = '';
    if (isAdminMode) {
      adminControls = `
        <div style="margin-top:12px; padding:10px; background:#fff8e1; border:1px solid #ffe082; border-radius:10px;">
          <div style="font-weight:900; color:var(--burgundy-soft); margin-bottom:8px; font-size:13px;">🔐 تحكم الإدارة — غيّر حالة الطلب:</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${ORDER_STATUSES.map(s => `
              <button
                onclick="updateOrderStatus('${foundOrder.orderId}', ${s.code})"
                style="
                  flex:1; min-width:110px; padding:8px 6px; border-radius:8px; border:2px solid ${s.color};
                  background:${currentCode === s.code ? s.color : 'white'};
                  color:${currentCode === s.code ? 'white' : s.color};
                  font-weight:800; font-size:11.5px; cursor:pointer;
                "
              >
                ${s.label}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    const cloudBadge = firebaseReady
      ? '<span style="font-size:10px; background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px; margin-right:4px;">☁️ سحابي</span>'
      : '<span style="font-size:10px; background:#fff3e0; color:#e65100; padding:2px 6px; border-radius:4px; margin-right:4px;">📱 محلي</span>';

    resultBox.innerHTML = `
      <div style="font-weight: 900; color: var(--burgundy-soft); margin-bottom: 8px; font-size:14px;">
        ✅ تم العثور على الطلب بنجاح ${cloudBadge}
      </div>
      <div style="font-size:12.5px; margin-bottom:3px;"><strong>🆔 رقم الطلب:</strong> ${foundOrder.orderId}</div>
      <div style="font-size:12.5px; margin-bottom:3px;"><strong>👤 اسم العميل:</strong> ${foundOrder.name || '-'}</div>
      <div style="font-size:12.5px; margin-bottom:3px;"><strong>💰 الإجمالي:</strong> ${foundOrder.total || '-'}</div>
      <div style="font-size:12.5px; margin-bottom:10px;"><strong>📅 تاريخ الطلب:</strong> ${foundOrder.date || '-'}</div>
      
      <div style="background:white; border:1px solid var(--border-color); border-radius:10px; padding:10px; margin-top:6px;">
        <div style="font-weight:900; color:var(--burgundy-soft); margin-bottom:10px; font-size:13px;">📍 مسار الطلب:</div>
        ${timelineHtml}
      </div>
      
      <div style="margin-top:10px; padding:8px; background:${current.color}15; border-radius:8px; border:1px solid ${current.color}40; text-align:center;">
        <span style="font-weight:900; color:${current.color}; font-size:13.5px;">الحالة الحالية: ${current.label}</span>
      </div>
      ${adminControls}
    `;
  } else {
    resultBox.innerHTML = `
      <div style="font-weight: 900; color: #c62828;">
        ❌ عذراً، لم يتم العثور على أي طلب بهذا الرقم
      </div>
      <div style="font-size: 11.5px; margin-top: 3px; color: var(--text-muted);">
        تأكد من كتابة الرقم بشكل صحيح (مثال: MS-K7P2M9X4)<br>
        ${firebaseReady
          ? 'الطلب مش موجود على السحابة. تأكد إن العميل خلّص الطلب بنجاح.'
          : 'Firebase لسه مش متضبط — التتبع شغال محلياً فقط.'}
        ${!isAdminMode ? '<br><br>للإدارة: اكتب رمز الإدارة في خانة البحث.' : ''}
      </div>
    `;
  }
}


function setGalleryImage(idx) {
  if (!currentSelectedProduct || !currentSelectedProduct.images.length) return;
  const imgs = currentSelectedProduct.images;
  galleryIndex = (idx + imgs.length) % imgs.length;
  const modalImg = document.getElementById('modalImage');
  if (modalImg) {
    modalImg.src = imgs[galleryIndex];
    activeModalImage = imgs[galleryIndex];
  }
  document.querySelectorAll('#thumbnailsContainer img').forEach((t, i) => {
    t.style.borderColor = i === galleryIndex ? 'var(--burgundy-soft)' : 'transparent';
  });
  updateDirectWhatsAppButton();
}

function galleryPrev() { setGalleryImage(galleryIndex - 1); }
function galleryNext() { setGalleryImage(galleryIndex + 1); }

function openZoom() {
  const src = activeModalImage || (currentSelectedProduct && currentSelectedProduct.images[0]);
  if (!src) return;
  document.getElementById('zoomImage').src = src;
  document.getElementById('zoomOverlay').classList.add('active');
}

function closeZoom() {
  document.getElementById('zoomOverlay').classList.remove('active');
}

function shareProduct() {
  if (!currentSelectedProduct) return;
  const url = location.origin + location.pathname + '?product=' + currentSelectedProduct.id;
  const text = currentSelectedProduct.title + ' — ' + (document.getElementById('modalPrice')?.innerText || '') + '\n' + url;
  if (navigator.share) {
    navigator.share({ title: currentSelectedProduct.title, text: text, url: url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => alert('تم نسخ رابط المنتج ✅')).catch(() => {
      prompt('انسخ الرابط:', url);
    });
  } else {
    prompt('انسخ الرابط:', url);
  }
}

function handleDeepLink() {
  const params = new URLSearchParams(location.search);
  const pid = params.get('product');
  if (pid) {
    const id = parseInt(pid, 10);
    if (!isNaN(id)) setTimeout(() => openProductModal(id), 400);
  }
}

function openAdminOrdersModal() {
  if (!isAdminMode || !currentAdminUser) { document.getElementById('adminLoginModal')?.classList.add('active'); return; }
  document.getElementById('adminOrdersModal').classList.add('active');
  updateMaintenanceButton();
  loadAllOrdersAdmin();
}

function closeAdminOrdersModal() {
  document.getElementById('adminOrdersModal').classList.remove('active');
}

let adminOrdersCache = [];

async function loadAllOrdersAdmin() {
  const box = document.getElementById('adminOrdersList');
  box.innerHTML = '<p style="text-align:center;color:var(--text-muted);">جاري تحميل الطلبات...</p>';

  let list = [];
  if (firebaseReady && db) {
    try {
      const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(150).get();
      snap.forEach(doc => list.push(doc.data()));
    } catch (e) {
      try {
        const snap2 = await db.collection('orders').limit(150).get();
        snap2.forEach(doc => list.push(doc.data()));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      } catch (e2) { console.error(e2); }
    }
  }
  if (!list.length) {
    list = [...ordersHistory].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  adminOrdersCache = list;
  filterAdminOrders();
}

function filterAdminOrders() {
  const box = document.getElementById('adminOrdersList');
  const q = (document.getElementById('adminOrderSearch')?.value || '').trim().toLowerCase();

  let list = adminOrdersCache;
  if (q) {
    list = adminOrdersCache.filter(o => {
      const id = (o.orderId || '').toLowerCase();
      const name = (o.name || '').toLowerCase();
      const phone = (o.phone || '').toLowerCase().replace(/\s/g, '');
      const qPhone = q.replace(/\s/g, '');
      return id.includes(q) || name.includes(q) || phone.includes(qPhone);
    });
  }

  if (!list.length) {
    box.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد طلبات مطابقة</p>';
    return;
  }

  box.innerHTML = list.map(o => {
    const code = typeof o.statusCode === 'number' ? o.statusCode : 0;
    const st = ORDER_STATUSES[code] || ORDER_STATUSES[0];
    const safeId = (o.orderId || '').replace(/'/g, "\\'");
    const btns = ORDER_STATUSES.map(s => `
      <button style="border-color:${s.color};background:${code===s.code?s.color:'white'};color:${code===s.code?'white':s.color};"
        onclick="updateOrderStatusFromAdmin('${safeId}', ${s.code})">${s.label}</button>
    `).join('');
    return `
      <div class="order-card-admin">
        <div class="oid">🆔 ${o.orderId || '-'}</div>
        <div>👤 ${o.name || '-'} | 📱 ${o.phone || '-'}</div>
        <div>💰 ${o.total || '-'} | 📅 ${o.date || '-'}</div>
        <div style="margin-top:4px;font-weight:800;color:${st.color};">الحالة: ${st.label}</div>
        <div class="status-btns-mini">${btns}</div>
        <button
          onclick="copyShippingMessage('${safeId}')"
          style="margin-top:8px;width:100%;padding:8px;border-radius:8px;border:none;background:#25d366;color:white;font-weight:800;font-size:12px;cursor:pointer;"
        >📋 نسخ رسالة «تم الشحن» للعميل</button>
      </div>`;
  }).join('');
}

function copyShippingMessage(orderId) {
  const o = adminOrdersCache.find(x => x.orderId === orderId);
  if (!o) {
    alert('الطلب غير موجود');
    return;
  }
  const itemsText = (o.items || []).map((it, i) =>
    `${i + 1}) ${it.title || ''} — مقاس: ${it.size || '-'} × ${it.qty || 1}`
  ).join('\n');

  const msg =
`مرحباً ${o.name || ''} 👋
تم شحن طلبك بنجاح من متجر My Souq 🚚

🆔 رقم الطلب: ${o.orderId}
💰 الإجمالي: ${o.total || '-'}

📦 المنتجات:
${itemsText || '-'}

📍 العنوان: ${o.address || '-'}

هيوصلك خلال أيام الشحن المعتادة إن شاء الله.
للاستفسار رد على الرسالة 💬
شكراً لثقتك فينا ❤️`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(() => {
      alert('تم نسخ رسالة الشحن ✅\nالصقها في واتساب العميل');
    }).catch(() => {
      prompt('انسخ الرسالة:', msg);
    });
  } else {
    prompt('انسخ الرسالة:', msg);
  }

  // فتح واتساب العميل مباشرة لو الرقم موجود
  const phone = (o.phone || '').replace(/\D/g, '');
  if (phone.length >= 10) {
    let wa = phone;
    if (wa.startsWith('0')) wa = '20' + wa.slice(1);
    if (!wa.startsWith('20')) wa = '20' + wa;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
  }
}

async function updateOrderStatusFromAdmin(orderId, newCode) {
  const status = ORDER_STATUSES.find(s => s.code === newCode);
  if (!status) return;
  await updateOrderStatusCloud(orderId, newCode, status.label);
  // حدّث الكاش محلياً
  const o = adminOrdersCache.find(x => x.orderId === orderId);
  if (o) {
    o.statusCode = newCode;
    o.status = status.label;
  }
  filterAdminOrders();
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('scroll', () => {
  const btn = document.getElementById('backToTopBtn');
  if (!btn) return;
  if (window.scrollY > 300) btn.classList.add('show');
  else btn.classList.remove('show');
});

window.onload = function() {
  initFirebase();
  // بعد تهيئة Firebase نقرأ وضع الصيانة من السحابة
  setTimeout(() => loadMaintenanceFromCloud(), 800);
  if (localStorage.getItem('souqDarkMode') === '1') {
    document.body.classList.add('dark-mode');
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = '☀️';
  }
  loadCustomerData();
  loadRealProducts();

  // تسجيل Service Worker للـ PWA وتسريع التحميل
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
};

