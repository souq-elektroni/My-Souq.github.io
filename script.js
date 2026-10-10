let products = [];
  let cart = JSON.parse(localStorage.getItem("souqCart")) || [];
  let ordersHistory = JSON.parse(localStorage.getItem("souqOrdersHistory")) || [];
  let isAdminMode = false;
  let currentAdminUser = null;

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

  // ===== Order reCAPTCHA (بدون OTP) =====
  let orderRecaptchaVerifier = null;
  let orderRecaptchaWidgetId = null;
  let orderRecaptchaVerified = false;
  let orderRecaptchaInProgress = false;

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
          // تسجيل دخول الإدارة فقط يتم بحساب البريد الإلكتروني.
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

  // حفظ طلب محلياً أولاً ثم على Firebase
  // ملاحظة: لا يتم تغيير مسار الإرسال؛ التخزين المحلي يضمن أن التتبع يعمل على نفس الجهاز حتى لو تعذّر الحفظ السحابي.
  async function saveOrderToCloud(orderRecord) {
    try {
      const normalizedId = String(orderRecord.orderId || '').trim();
      const localRecord = { ...orderRecord, orderId: normalizedId, items: orderRecord.items || [] };
      const exists = ordersHistory.findIndex(o => String(o.orderId || '').trim().toLowerCase() === normalizedId.toLowerCase());
      if (exists >= 0) ordersHistory[exists] = localRecord;
      else ordersHistory.push(localRecord);
      localStorage.setItem('souqOrdersHistory', JSON.stringify(ordersHistory));

      if (!firebaseReady || !db || typeof firebase === 'undefined') {
        console.error('Firebase غير جاهز لحفظ الطلب على السحابة.');
        return false;
      }

      await db.collection('orders').doc(normalizedId).set({
        ...localRecord,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      return true;
    } catch (e) {
      console.error('فشل حفظ الطلب على Firestore:', e);
      return false;
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
  let currentSubcategory = "";
  let currentStockFilter = "all";
  let currentSizeFilter = "الكل";
  let galleryIndex = 0;
  let productSales = JSON.parse(localStorage.getItem("souqProductSales") || "{}");

  let selectedSize = null;
  let selectedVariantStatus = "available";
    let selectedColor = '';

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
    const normalizedText = String(markdownText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const fmMatch = normalizedText.match(/^\s*---\s*\n([\s\S]*?)\n---\s*(?:\n|$)([\s\S]*)$/);
    if (!fmMatch) return null;

    const frontmatter = fmMatch[1];
    const body = fmMatch[2].trim();
    const lines = frontmatter.split('\n');

    const unquote = (value) => {
      let v = String(value ?? '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v.replace(/\\(["'])/g, '$1').trim();
    };

    const scalar = (value) => {
      const v = unquote(value);
      if (!v || /^null$/i.test(v) || /^~$/.test(v)) return null;
      if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
      if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
      return v;
    };

    const topLevel = {};
    for (const line of lines) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
      if (m) topLevel[m[1]] = scalar(m[2]);
    }

    const title = String(topLevel.title ?? 'منتج جديد');
    const price = Number(topLevel.price) || 0;
    const oldPrice = Number(topLevel.oldPrice) || 0;
    const category = String(topLevel.category ?? 'ملابس شتوية');
    const subcategory = String(topLevel.subcategory ?? topLevel.subCategory ?? '');
    const stockStatus = String(topLevel.stock ?? 'available').toLowerCase() || 'available';

    const fixImagePath = (rawPath) => {
      if (!rawPath) return '';
      let clean = String(rawPath).trim();
      clean = clean.replace(/^[-*]\s*/, '').trim();
      clean = clean.replace(/^["'\[\]]+|["'\[\],]+$/g, '').trim();
      if (!clean || /^none$/i.test(clean)) return '';
      if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
      if (clean.startsWith('/')) clean = clean.slice(1);
      clean = clean.replace(/^\.\//, '').replace(/\\/g, '/');
      clean = clean.replace(/\s+/g, '%20');
      if (!clean.startsWith('images/')) clean = 'images/' + clean;
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${clean}`;
    };

    const allExtractedImages = [];
    const pushImage = (value) => {
      const fixed = fixImagePath(value);
      if (fixed && !allExtractedImages.includes(fixed)) allExtractedImages.push(fixed);
    };

    // New Sveltia format: images: [ - /images/products/file.webp ]
    let inImages = false;
    for (const line of lines) {
      if (/^images:\s*$/.test(line.trim())) {
        inImages = true;
        continue;
      }
      if (inImages) {
        if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(line) && !/^\s+-/.test(line)) {
          inImages = false;
          continue;
        }
        const trimmed = line.trim();
        if (trimmed.startsWith('-')) {
          let value = trimmed.replace(/^-\s*/, '').trim();
          value = value.replace(/^(?:image_item|image):\s*/i, '');
          if (value) pushImage(value);
        } else if (trimmed && !trimmed.startsWith('#')) {
          // Compatibility with a possible inline array/string representation.
          const inline = trimmed.replace(/^\[|\]$/g, '');
          inline.split(',').forEach(v => pushImage(v));
        }
      }
    }

    // Legacy single image support.
    if (topLevel.image) pushImage(topLevel.image);

    // Legacy image_item/image entries under images can be caught above; also accept an inline images array.
    if (typeof topLevel.images === 'string') {
      String(topLevel.images).replace(/^\[|\]$/g, '').split(',').forEach(v => pushImage(v));
    }

    const defaultImg = 'https://via.placeholder.com/300?text=My+Souq';
    if (allExtractedImages.length === 0) allExtractedImages.push(defaultImg);

    // New Sveltia variants list: size/color/price/quantity/dimensions/status.
    const parsedVariants = [];
    let inVariants = false;
    let currentVar = null;

    const finishVariant = () => {
      if (currentVar && currentVar.size) {
        if (currentVar.price !== null && !Number.isFinite(Number(currentVar.price))) currentVar.price = null;
        parsedVariants.push(currentVar);
      }
      currentVar = null;
    };

    const assignVariantField = (target, key, rawValue) => {
      const value = scalar(rawValue);
      if (key === 'size') target.size = value == null ? '' : String(value);
      else if (key === 'color') target.color = value == null ? '' : String(value);
      else if (key === 'price') target.price = value == null ? null : Number(value);
      else if (key === 'quantity') target.quantity = value == null ? null : Number(value);
      else if (key === 'status') target.status = value == null ? 'available' : String(value).toLowerCase();
      else if (key === 'pants_length') target.pants_length = value == null ? '' : String(value);
      else if (key === 'tshirt_length') target.tshirt_length = value == null ? '' : String(value);
      else if (key === 'tshirt_width') target.tshirt_width = value == null ? '' : String(value);
      else if (key === 'extra_piece') target.extra_piece = value == null ? '' : String(value);
      // Legacy compatibility.
      else if (key === 'length') target.length = value == null ? '' : String(value);
      else if (key === 'width') target.width = value == null ? '' : String(value);
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^variants:\s*$/.test(trimmed)) {
        inVariants = true;
        continue;
      }
      if (!inVariants) continue;
      if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(line) && !/^\s+-/.test(line)) {
        finishVariant();
        inVariants = false;
        continue;
      }
      if (trimmed.startsWith('-')) {
        finishVariant();
        currentVar = {
          size: '', color: '', price: null, quantity: null,
          pants_length: '', tshirt_length: '', tshirt_width: '', extra_piece: '',
          length: '', width: '', status: 'available'
        };
        const firstField = trimmed.replace(/^-\s*/, '').trim();
        const firstMatch = firstField.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
        if (firstMatch) assignVariantField(currentVar, firstMatch[1], firstMatch[2]);
        continue;
      }
      if (currentVar) {
        const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
        if (m) assignVariantField(currentVar, m[1], m[2]);
      }
    }
    finishVariant();

    if (parsedVariants.length === 0) {
      parsedVariants.push({
        size: 'مقاس موحد', color: '', quantity: null,
        pants_length: '', tshirt_length: '', tshirt_width: '', extra_piece: '',
        length: '', width: '', price: price, status: stockStatus
      });
    }

    const parsedBody = (typeof marked !== 'undefined' && typeof marked.parse === 'function')
      ? marked.parse(body || '')
      : (body || title);

    return {
      id,
      title,
      category,
      subcategory,
      price,
      oldPrice,
      stock: stockStatus,
      image: allExtractedImages[0],
      images: allExtractedImages,
      variants: parsedVariants,
      desc: parsedBody
    };
  } catch (e) {
    console.error('Error parsing markdown:', e);
    return null;
  }
}

/* ===== أسعار ذكية: السعر الأساسي + أسعار المقاسات معاً =====
   - لو السعر الأساسي > 0 → يظهر كما هو (مع السعر القديم إن وُجد)
   - لو السعر الأساسي = 0 وفي المقاسات أسعار → يظهر «من أقل سعر» أو السعر الموحد
   - نافذة التفاصيل تظل تتحدث حسب المقاس المختار (كما كانت)
   لا يتم حذف أو تعطيل أي سلوك سابق */
  function getVariantPrices(p) {
    return (p.variants || [])
      .map(function (v) { return Number(v && v.price); })
      .filter(function (n) { return Number.isFinite(n) && n > 0; });
  }

  function getEffectivePrice(p) {
    var base = Number(p.price) || 0;
    if (base > 0) return base;
    var prices = getVariantPrices(p);
    if (prices.length === 0) return 0;
    return Math.min.apply(null, prices);
  }

  function getCardPriceHtml(p) {
    var base = Number(p.price) || 0;
    var oldPrice = Number(p.oldPrice) || 0;
    var prices = getVariantPrices(p);

    // لو السعر الأساسي مكتوب → يظهر عادي على الكرت
    if (base > 0) {
      var html = base + ' ج.م';
      if (oldPrice > 0) {
        html +=
          '<span style="font-size:11px;color:#999;text-decoration:line-through;margin-right:4px;font-weight:600;">' +
          oldPrice +
          ' ج.م</span>';
      }
      return html;
    }

    // لو مفيش سعر أساسي والمقاسات بأسعار مختلفة → «حسب المقاس»
    if (prices.length > 0) {
      var minP = Math.min.apply(null, prices);
      var maxP = Math.max.apply(null, prices);
      if (minP !== maxP) {
        return 'السعر 💸 : حسب المقاس';
      }
      // كل المقاسات نفس السعر → اعرضه مرة واحدة
      var html2 = minP + ' ج.م';
      if (oldPrice > 0) {
        html2 +=
          '<span style="font-size:11px;color:#999;text-decoration:line-through;margin-right:4px;font-weight:600;">' +
          oldPrice +
          ' ج.م</span>';
      }
      return html2;
    }

    // مفيش أي سعر
    return '0 ج.م';
  }

  /* تجميع المقاسات حسب السعر لعرض شفاف في نافذة التفاصيل */
  function extractSizeNumber(sizeLabel) {
    var m = String(sizeLabel || '').match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  }

  function formatSizeRangeLabel(sizeLabels) {
    if (!sizeLabels || !sizeLabels.length) return '';
    if (sizeLabels.length === 1) return sizeLabels[0];

    var nums = sizeLabels.map(extractSizeNumber);
    var allNumeric = nums.every(function (n) { return n !== null; });
    if (!allNumeric) return sizeLabels.join('، ');

    var sortedIdx = sizeLabels
      .map(function (label, i) { return { label: label, n: nums[i] }; })
      .sort(function (a, b) { return a.n - b.n; });

    var first = sortedIdx[0];
    var last = sortedIdx[sortedIdx.length - 1];
    var suffixMatch = String(first.label).match(/\d+(?:\.\d+)?\s*(.*)$/);
    var suffix = suffixMatch && suffixMatch[1] ? (' ' + suffixMatch[1].trim()) : '';
    if (suffix && !/سنة|سن|شهر|م|سم|y|Y/i.test(suffix) && sortedIdx.length > 2) {
      // احتفظ بالنص كما هو لو مش وحدة عمر/مقاس واضحة
      return first.label + ' – ' + last.label;
    }
    return first.n + ' – ' + last.n + suffix;
  }

  function getPriceTiers(p) {
    var map = {};
    (p.variants || []).forEach(function (v) {
      var pr = Number(v && v.price);
      if (!Number.isFinite(pr) || pr <= 0) {
        pr = Number(p.price) || 0;
      }
      if (!Number.isFinite(pr) || pr <= 0) return;
      var key = String(pr);
      if (!map[key]) map[key] = { price: pr, sizes: [] };
      if (v.size && map[key].sizes.indexOf(v.size) === -1) {
        map[key].sizes.push(v.size);
      }
    });
    return Object.keys(map)
      .map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.price - b.price; });
  }

  /* هل المستخدم اختار مقاس يدويًا في النافذة الحالية؟ */
  var modalPriceSizeChosen = false;

  function buildModalPriceHtml(product, activeVariant) {
    var base = Number(product.price) || 0;
    var oldPrice = Number(product.oldPrice) || 0;
    var tiers = getPriceTiers(product);
    var hasMultipleTiers = tiers.length > 1;
    var variantPrice =
      activeVariant && Number(activeVariant.price) > 0
        ? Number(activeVariant.price)
        : null;

    // ——— 1) فيه سعر أساسي → اعرضه عادي (مع إمكانية تجاوزه بسعر المقاس) ———
    if (base > 0) {
      var displayPrice = variantPrice || base;
      var html =
        '<div class="modal-price-main" style="font-weight:900;line-height:1.2;">' +
        displayPrice +
        ' ج.م';
      if (oldPrice > 0) {
        html +=
          ' <span style="font-size:12px;color:#999;text-decoration:line-through;margin-right:4px;font-weight:600;">' +
          oldPrice +
          ' ج.م</span>';
      }
      html += '</div>';
      return html;
    }

    // ——— 2) أسعار مقاسات مختلفة (بدون سعر أساسي) ———
    // قبل اختيار المقاس: عبارة «حسب المقاس» فقط — بدون رقم مضلّل
    // بعد اختيار المقاس: يظهر سعر المقاس المختار
    if (hasMultipleTiers) {
      if (modalPriceSizeChosen && variantPrice) {
        return (
          '<div class="modal-price-main" style="font-weight:900;line-height:1.2;">' +
          variantPrice +
          ' ج.م</div>'
        );
      }
      return (
        '<div class="modal-price-main" style="font-weight:900;line-height:1.35;color:var(--burgundy-soft,#8b3f52);">' +
        'السعر 💸 : حسب المقاس' +
        '</div>' +
        '<div style="margin-top:4px;font-size:11.5px;font-weight:700;color:var(--text-muted,#615053);">' +
        'اختر المقاس لمعرفة السعر' +
        '</div>'
      );
    }

    // ——— 3) سعر موحد من المقاسات أو صفر ———
    var single =
      variantPrice ||
      (tiers[0] && tiers[0].price) ||
      0;
    var html2 =
      '<div class="modal-price-main" style="font-weight:900;line-height:1.2;">' +
      single +
      ' ج.م';
    if (oldPrice > 0) {
      html2 +=
        ' <span style="font-size:12px;color:#999;text-decoration:line-through;margin-right:4px;font-weight:600;">' +
        oldPrice +
        ' ج.م</span>';
    }
    html2 += '</div>';
    return html2;
  }

  function productCardHtml(p) {
    const albumCount = Array.isArray(p.images) ? p.images.length : 0;
    const firstImage = (p.images && p.images[0]) || p.image || 'https://via.placeholder.com/300?text=My+Souq';
    const albumBadge = albumCount > 1 ? `<span class="msq-album-badge">▧ ألبوم · ${albumCount} صور</span>` : '';
    // مهم لفلتر «نوع الملابس» في index.html (sharedSubcategorySelect)
    const escAttr = (v) => String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const catAttr = escAttr(p.category || '');
    const subAttr = escAttr(p.subcategory || '');
    const titleAttr = escAttr(p.title || '');
    return `
        <div class="product-card" data-product-card-id="${p.id}"
          data-category="${catAttr}"
          data-subcategory="${subAttr}"
          data-title="${titleAttr}"
          onclick="openProductModal(${p.id})">
          <div class="image-container">
            <img class="product-image" data-album-index="0" src="${firstImage}" alt="${titleAttr}"
              loading="lazy" decoding="async" fetchpriority="low"
              width="300" height="300"
              onerror="this.src='https://via.placeholder.com/300?text=My+Souq'">
            ${albumBadge}
          </div>
          <div class="product-details">
            <h3 class="product-title">${p.title}</h3>
            <div class="price-tag">
              ${getCardPriceHtml(p)}
            </div>
            <div class="click-hint">${albumCount > 1 ? '↔ صور الكوليكشن · عرض التفاصيل 👈' : 'عرض التفاصيل 👈'}</div>
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

  // تبديل تلقائي ناعم بين صور الألبوم على الكارت، مع إبقاء فتح التفاصيل كما هو.
  if (!window.__MSQ_ALBUM_ROTATOR__) {
    window.__MSQ_ALBUM_ROTATOR__ = true;
    window.setInterval(function () {
      document.querySelectorAll('#products-container [data-product-card-id]').forEach(function (card) {
        const productId = Number(card.getAttribute('data-product-card-id'));
        const product = products.find(function (item) { return Number(item.id) === productId; });
        if (!product || !Array.isArray(product.images) || product.images.length < 2) return;
        const img = card.querySelector('.product-image');
        if (!img || !card.isConnected) return;
        const next = ((Number(img.dataset.albumIndex) || 0) + 1) % product.images.length;
        img.classList.add('msq-swapping');
        window.setTimeout(function () {
          if (!img.isConnected) return;
          img.src = product.images[next];
          img.dataset.albumIndex = String(next);
          img.onload = function () { img.classList.remove('msq-swapping'); };
          window.setTimeout(function () { img.classList.remove('msq-swapping'); }, 450);
        }, 170);
      });
    }, 3600);
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
    currentSubcategory = "";
    currentStockFilter = "all";
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.msq-subcategory').forEach(sel => sel.value = "");
    if (btn) btn.classList.add('active');
    handleSearchAndFilter();
  }

  function filterSubcategory(cat, subcategory, selectEl) {
    currentCategory = cat;
    currentSubcategory = subcategory || "";
    currentStockFilter = "all";
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    const mainButton = document.querySelector('.msq-main-cat[data-main-category="' + cat.replace(/"/g, '\\"') + '"]');
    if (mainButton) mainButton.classList.add('active');
    document.querySelectorAll('.msq-subcategory').forEach(sel => {
      if (sel !== selectEl && sel.closest('.msq-category-group')?.querySelector('.msq-main-cat')?.dataset.mainCategory !== cat) sel.value = "";
    });
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

    // فلتر «نوع الملابس» المشترك من القائمة المنسدلة في الصفحة
    const sharedSubEl = document.getElementById('sharedSubcategorySelect');
    const sharedSub = sharedSubEl ? String(sharedSubEl.value || '').trim() : '';

    let filtered = products.filter(p => {
      let matchesCat =
        currentCategory === 'الكل' ||
        (currentCategory === 'عروض' && (p.category === 'عروض' || Number(p.oldPrice) > 0)) ||
        (p.category === currentCategory &&
          (!currentSubcategory || String(p.subcategory || '') === currentSubcategory));

      if (currentCategory === 'جديد') {
        const newestIds = [...products].slice().reverse().slice(0, 8).map(x => x.id);
        matchesCat = newestIds.includes(p.id);
      }
      if (currentCategory === 'الأكثر مبيعاً') {
        const bestIds = [...products].sort((a, b) => (productSales[b.id] || 0) - (productSales[a.id] || 0)).slice(0, 8).map(x => x.id);
        matchesCat = bestIds.includes(p.id);
      }

      // تطابق نوع الملابس (ملابس للمنزل / ملابس للخروج)
      const pSub = String(p.subcategory || '').trim();
      const matchesSharedSub =
        !sharedSub ||
        pSub === sharedSub ||
        (sharedSub === 'ملابس للمنزل' && /ملابس\s*للمنزل|للمنزل|home\s*wear|بيت/i.test(pSub)) ||
        (sharedSub === 'ملابس للخروج' && /ملابس\s*للخروج|للخروج|خروج|out\s*wear/i.test(pSub));

      const matchesStock =
        currentStockFilter === 'all' ||
        p.stock === currentStockFilter;

      const matchesSearch = p.title.toLowerCase().includes(query);

      const matchesSize =
        currentSizeFilter === 'الكل' ||
        (p.variants || []).some(v => v.size === currentSizeFilter);

      return matchesCat && matchesSharedSub && matchesStock && matchesSearch && matchesSize;
    });

    renderProducts(filtered);
  }

  function applySorting() {
    const sortVal = document.getElementById('sortSelect')
      ? document.getElementById('sortSelect').value
      : '';
    let sorted = [...products];
    if (sortVal === 'low-high') sorted.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
    else if (sortVal === 'high-low') sorted.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
    renderProducts(sorted);
  }

  // ===== Maintenance compatibility layer =====
  // The Firebase-backed maintenance controller in index.html is authoritative.
  // These legacy names are kept so any older callers do not break, but this
  // file no longer keeps a second maintenance state in localStorage.
  function applyMaintenanceMode(enabled) {
    const overlay =
      document.getElementById('maintenanceModeOverlay') ||
      document.getElementById('maintenanceOverlay');

    const btn =
      document.getElementById('maintenanceAdminToggle') ||
      document.getElementById('maintenanceToggleBtn');

    if (overlay) {
      // Do not override the authoritative admin-aware controller when it exists.
      if (document.getElementById('maintenanceModeOverlay')) {
        overlay.style.display = enabled ? 'flex' : 'none';
      } else {
        overlay.style.display = enabled ? 'flex' : 'none';
      }
    }

    if (btn && !document.getElementById('maintenanceAdminToggle')) {
      btn.textContent = enabled ? '🔓 إيقاف الصيانة' : '🔧 تفعيل الصيانة';
      btn.style.background = enabled ? '#2e7d32' : '#e65100';
    }
  }

  function loadMaintenanceMode() {
    if (typeof window.readMaintenanceMode === 'function') {
      return window.readMaintenanceMode();
    }
    // No localStorage fallback here: maintenance has one source of truth.
    return Promise.resolve(false);
  }

  function toggleMaintenanceMode() {
    // index.html installs the authoritative Firebase implementation on
    // window.toggleMaintenanceMode. If this compatibility function is still
    // the active handler, simply tell the caller that the controller is not
    // ready instead of creating a second maintenance system.
    if (window.toggleMaintenanceMode !== toggleMaintenanceMode) {
      return window.toggleMaintenanceMode();
    }
    alert('وحدة إدارة الصيانة لم تكتمل تهيئتها بعد. حاول مرة أخرى.');
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

    // منع الطلب السريع بدون اختيار مقاس
    if (!waBtn._msqSizeGuardBound) {
      waBtn._msqSizeGuardBound = true;
      waBtn.addEventListener('click', function (e) {
        if (!selectedSize) {
          e.preventDefault();
          e.stopPropagation();
          requireSelectedSize('الطلب السريع');
          return false;
        }
        // حدّث الرابط قبل الفتح عشان السعر والمقاس صح
        updateDirectWhatsAppButton();
      }, true);
    }

    // لو مفيش مقاس — عطّل الرابط مؤقتًا
    if (!selectedSize) {
      waBtn.href = '#';
      waBtn.setAttribute('aria-disabled', 'true');
      return;
    }
    waBtn.removeAttribute('aria-disabled');

    const activeVar = (currentSelectedProduct.variants || []).find(
      function (v) { return v.size === selectedSize; }
    );
    const cleanPriceNum =
      (activeVar && Number(activeVar.price) > 0)
        ? Number(activeVar.price)
        : (Number(currentSelectedProduct.price) || 0);
    const currentPrice = cleanPriceNum + ' ج.م';


    const selectedImage =
      activeModalImage ||
      currentSelectedProduct.images[0] ||
      '';

    const instantOrderId = generateStrongOrderId();

    const waText =
`مرحباً، أود طلب المنتج التالي من متجر My Souq 🛒
🆔 رقم الطلب: ${instantOrderId}

📦 اسم المنتج: ${currentSelectedProduct.title}
📏 المقاس: ${selectedSize}${selectedColor ? `
🎨 اللون: ${selectedColor}` : ''}
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

    // إعادة تعيين: مفيش مقاس متحدد عند فتح التفاصيل
    modalPriceSizeChosen = false;
    selectedSize = null;
    selectedColor = '';
    selectedVariantStatus = 'available';

    const isProductOut =
      currentSelectedProduct.stock === 'out';

    const isSizeOut = false;

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
      // بدون مقاس متحدد — السعر حسب القواعد (حسب المقاس / أساسي / موحد)
      priceEl.innerHTML = buildModalPriceHtml(
        currentSelectedProduct,
        null
      );
    }


    function updateDimensionsDisplay(variant) {

      if (!dimensionsContainer) {
        return;
      }

      // لو مفيش مقاس متحدد → اخفِ جدول الأبعاد
      if (!variant) {
        dimensionsContainer.style.display = 'none';
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


    // مفيش مقاس متحدد عند الفتح → اخفِ الأبعاد لحد ما يختار
    updateDimensionsDisplay(null);

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
              ${v.size}${v.color ? ` - ${v.color}` : ''}
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

            // المستخدم اختار مقاس → أظهر سعر هذا المقاس
            modalPriceSizeChosen = true;

            if (priceEl) {
              priceEl.innerHTML = buildModalPriceHtml(
                currentSelectedProduct,
                v
              );
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
    injectModalPolishStyles();
    bindModalImageSwipe();

    document
      .getElementById('productModal')
      .classList.add('active');

  }


  function clearProductQueryFromUrl() {
    try {
      if (!location.search || location.search.indexOf('product=') === -1) return;
      var params = new URLSearchParams(location.search);
      params.delete('product');
      var qs = params.toString();
      var clean = location.pathname + (qs ? ('?' + qs) : '') + (location.hash || '');
      history.replaceState(null, '', clean);
    } catch (e) {}
  }

  function closeModal() {

    document
      .getElementById('productModal')
      .classList.remove('active');

    // امسح ?product= من الرابط عشان الصفحة متتفتحش لوحدها بعد الريفرش
    clearProductQueryFromUrl();

  }


  function requireSelectedSize(actionLabel) {
    if (selectedSize) return true;
    showToast('❌ خطأ >>> أختر المقاس أولا لإتمام الطلب ✨', true);
    // تمرير لطيف لزرار المقاسات
    try {
      var box = document.getElementById('sizesContainer');
      if (box) {
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        box.style.outline = '2px solid var(--burgundy-soft, #8b3f52)';
        box.style.outlineOffset = '4px';
        box.style.borderRadius = '10px';
        setTimeout(function () {
          box.style.outline = '';
          box.style.outlineOffset = '';
        }, 1600);
      }
    } catch (e) {}
    return false;
  }

  function addToCart() {

    if (!currentSelectedProduct) {
      return;
    }

    // لازم يختار مقاس قبل الإضافة للسلة
    if (!requireSelectedSize('الإضافة للسلة')) {
      return;
    }

    if (
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
      (activeVariant && Number(activeVariant.price) > 0)
        ? Number(activeVariant.price)
        : (Number(currentSelectedProduct.price) || 0);

    if (!itemPrice || itemPrice <= 0) {
      alert('لا يمكن إضافة المنتج: السعر غير محدد لهذا المقاس.');
      return;
    }

      const existingQty = cart.find(item => item.id === currentSelectedProduct.id && item.size === selectedSize && (item.color || '') === (selectedColor || ''))?.qty || 0;
      if (activeVariant && Number.isFinite(Number(activeVariant.quantity)) && Number(activeVariant.quantity) > 0 && existingQty >= Number(activeVariant.quantity)) {
        alert(`الكمية المتاحة لهذا المقاس${selectedColor ? ' واللون' : ''} هي ${activeVariant.quantity} فقط.`);
        return;
      }


    const existing =
      cart.find(
        item =>
          item.id === currentSelectedProduct.id &&
              item.size === selectedSize && (item.color || '') === (selectedColor || '')
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


  function showToast(message, isError) {

    const toast =
      document.getElementById(
        'toastNotification'
      );

    if (!toast) return;

    var defaultOk = '✓ تم إضافة المنتج إلى السلة بنجاح';
    var text = (message != null && String(message).trim() !== '')
      ? String(message)
      : defaultOk;

    toast.textContent = text;

    if (isError) {
      toast.style.background = '#c62828';
      toast.style.borderColor = '#ef9a9a';
      toast.style.color = '#fff';
    } else {
      toast.style.background = '';
      toast.style.borderColor = '';
      toast.style.color = '';
    }

    toast.classList.add('show');

    setTimeout(
      function () {
        toast.classList.remove('show');
      },
      isError ? 3500 : 3000
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

    // تنظيف عناصر السلة التالفة (مقاس فاضي أو سعر صفر)
    var cleaned = false;
    for (var ci = cart.length - 1; ci >= 0; ci--) {
      var it = cart[ci];
      var badSize = !it || !it.size || it.size === 'null' || it.size === 'undefined';
      var badPrice = !(Number(it && it.price) > 0);
      if (badSize || badPrice) {
        cart.splice(ci, 1);
        cleaned = true;
      }
    }
    if (cleaned) {
      try {
        localStorage.setItem('souqCart', JSON.stringify(cart));
      } catch (e) {}
      try { updateCartCount(); } catch (e) {}
    }

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


// ===== Phone validation =====
function toWesternDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));
}

// Compatibility helper kept for older calls.
function isValidEgyptianPhone(value) {
  return isValidEgyptianMobile(value);
}

function validateCustomerPhone(showAlert = true) {
  const phoneEl = document.getElementById('custPhone');
  if (!phoneEl) return false;

  const phone = normalizeEgyptianPhone(phoneEl.value);
  phoneEl.value = phone;

  if (!isValidEgyptianPhone(phone)) {
    phoneEl.setCustomValidity(
      'أدخل رقم موبايل مصري صحيح مكون من 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015'
    );
    if (showAlert) {
      phoneEl.focus();
      alert('لا يمكن إتمام الطلب. رقم الهاتف يجب أن يكون رقم موبايل مصري صحيح مكون من 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015.');
    }
    return false;
  }

  phoneEl.setCustomValidity('');
  return true;
}

function setActionButtonsVisibility(isOutStock) {
  const addBtn = document.getElementById('addCartBtn');
  const waBtn = document.getElementById('directWaBtn');
  if (addBtn) addBtn.style.display = isOutStock ? 'none' : 'block';
  if (waBtn) waBtn.style.display = isOutStock ? 'none' : 'flex';
}

function normalizeEgyptianPhone(value) {
  return toWesternDigits(value).replace(/[\s-]/g, '');
}

function isValidEgyptianMobile(phone) {
  return /^01[0125]\d{8}$/.test(normalizeEgyptianPhone(phone));
}

function handlePhoneInput() {
  const input = document.getElementById('custPhone');
  if (!input) return;

  const normalized = normalizeEgyptianPhone(input.value)
    .replace(/\D/g, '')
    .slice(0, 11);

  if (input.value !== normalized) input.value = normalized;

  const valid = normalized === '' || isValidEgyptianMobile(normalized);
  input.setCustomValidity(
    valid ? '' : 'أدخل رقم موبايل مصري صحيح مكون من 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015'
  );

  checkFormCompletion();
}

// ===== Order reCAPTCHA (خطوة أمنية مستقلة عن OTP) =====

function resetOrderRecaptcha() {
  orderRecaptchaVerified = false;
  orderRecaptchaInProgress = false;

  if (orderRecaptchaVerifier) {
    try {
      orderRecaptchaVerifier.clear();
    } catch (e) {}
  }

  orderRecaptchaVerifier = null;
  orderRecaptchaWidgetId = null;

  const container = document.getElementById('orderRecaptchaContainer');
  if (container) container.innerHTML = '';

  const continueBtn = document.getElementById('orderRecaptchaContinueBtn');
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.style.opacity = '0.55';
    continueBtn.style.cursor = 'not-allowed';
  }
}

async function initializeOrderRecaptcha() {
  if (typeof firebase === 'undefined' || !firebase.auth) {
    throw new Error('Firebase Authentication غير مهيأ في الصفحة.');
  }

  resetOrderRecaptcha();

  const container = document.getElementById('orderRecaptchaContainer');
  if (!container) {
    throw new Error('حاوية reCAPTCHA غير موجودة.');
  }

  orderRecaptchaVerifier = new firebase.auth.RecaptchaVerifier('orderRecaptchaContainer', {
    size: 'normal',
    callback: function() {
      orderRecaptchaVerified = true;
      const message = document.getElementById('orderRecaptchaMessage');
      if (message) {
        message.textContent = 'تم اجتياز التحقق الأمني بنجاح ✅';
        message.style.color = '#2e7d32';
      }

      const continueBtn = document.getElementById('orderRecaptchaContinueBtn');
      if (continueBtn) {
        continueBtn.disabled = false;
        continueBtn.style.opacity = '1';
        continueBtn.style.cursor = 'pointer';
      }
    },
    'expired-callback': function() {
      orderRecaptchaVerified = false;
      const message = document.getElementById('orderRecaptchaMessage');
      if (message) {
        message.textContent = 'انتهت صلاحية التحقق. أعد التحقق مرة أخرى.';
        message.style.color = '#c62828';
      }

      const continueBtn = document.getElementById('orderRecaptchaContinueBtn');
      if (continueBtn) {
        continueBtn.disabled = true;
        continueBtn.style.opacity = '0.55';
        continueBtn.style.cursor = 'not-allowed';
      }
    }
  });

  orderRecaptchaWidgetId = await orderRecaptchaVerifier.render();
  return orderRecaptchaVerifier;
}

async function openOrderRecaptchaModal() {
  const modal = document.getElementById('orderRecaptchaModal');
  if (!modal) {
    alert('تعذر فتح خطوة التحقق الأمني.');
    return;
  }

  resetOrderRecaptcha();
  modal.classList.add('active');

  const message = document.getElementById('orderRecaptchaMessage');
  if (message) {
    message.textContent = 'يرجى اجتياز التحقق الأمني للمتابعة.';
    message.style.color = 'var(--text-muted)';
  }

  try {
    await initializeOrderRecaptcha();
  } catch (error) {
    console.error('Order reCAPTCHA init error:', error);
    if (message) {
      message.textContent = 'تعذر تشغيل التحقق الأمني. تأكد من إعداد Firebase Authorized Domains.';
      message.style.color = '#c62828';
    }
  }
}

function closeOrderRecaptchaModal() {
  const modal = document.getElementById('orderRecaptchaModal');
  if (modal) modal.classList.remove('active');
  resetOrderRecaptcha();
}

function continueAfterOrderRecaptcha() {
  if (!orderRecaptchaVerified) {
    const message = document.getElementById('orderRecaptchaMessage');
    if (message) {
      message.textContent = 'يجب اجتياز التحقق الأمني أولاً.';
      message.style.color = '#c62828';
    }
    return;
  }

  closeOrderRecaptchaModal();
  const termsModal = document.getElementById('termsModal');
  if (termsModal) termsModal.classList.add('active');
}

// ===== Cloud order save: Firebase Firestore =====

    function checkFormCompletion() {
      const nameEl = document.getElementById('custName');
      const phoneEl = document.getElementById('custPhone');
      const addressEl = document.getElementById('custAddress');
      const proceedBtn = document.getElementById('proceedBtn');
      if (!nameEl || !phoneEl || !addressEl || !proceedBtn) return;

      const name = nameEl.value.trim();
      const phone = normalizeEgyptianPhone(phoneEl.value);
      const address = addressEl.value.trim();

      proceedBtn.style.display = (
        name && isValidEgyptianMobile(phone) && address && cart.length > 0
      ) ? 'block' : 'none';
    }

    function validateAndOpenTerms() {
      const nameEl = document.getElementById('custName');
      const phoneEl = document.getElementById('custPhone');
      const addressEl = document.getElementById('custAddress');

      const name = nameEl ? nameEl.value.trim() : '';
      const phone = phoneEl ? normalizeEgyptianPhone(phoneEl.value) : '';
      const address = addressEl ? addressEl.value.trim() : '';

      if (!name || !address || !isValidEgyptianMobile(phone) || cart.length === 0) {
        alert('يرجى استكمال بيانات الشحن وإدخال رقم موبايل مصري صحيح.');
        return;
      }

      closeCartModal();
      openOrderRecaptchaModal();
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
      const phoneEl = document.getElementById('custPhone');
      const phone = phoneEl ? normalizeEgyptianPhone(phoneEl.value) : '';

      if (!isValidEgyptianMobile(phone)) {
        alert('رقم الهاتف غير صحيح. يرجى إدخال رقم موبايل مصري صحيح.');
        if (phoneEl) phoneEl.focus();
        return;
      }

      const cb = document.getElementById('termsCheckbox');
      if (cb && !cb.checked) {
        alert('يرجى الموافقة على الشروط والأحكام أولاً.');
        return;
      }

      const termsModal = document.getElementById('termsModal');
      const paymentModal = document.getElementById('paymentModal');
      if (termsModal) termsModal.classList.remove('active');
      if (paymentModal) paymentModal.classList.add('active');
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

    generatedOrderId = generateStrongOrderId();

    let productsHtml = cart.map(item => `
      <div class="summary-product-row">
        <img src="${item.image}" class="summary-product-img" alt="${item.title}">
        <div style="flex:1;">
          <div style="font-weight:900; font-size:12.5px; color:var(--text-dark);">${item.title}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">المقاس: ${item.size}${item.color ? ` | اللون: ${item.color}` : ''} | الكمية: ${item.qty}</div>
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
      const nameEl = document.getElementById('custName');
      const phoneEl = document.getElementById('custPhone');
      const addressEl = document.getElementById('custAddress');

      const name = nameEl ? nameEl.value.trim() : '';
      const rawPhone = phoneEl ? phoneEl.value.trim() : '';
      const address = addressEl ? addressEl.value.trim() : '';
      const phone = normalizeEgyptianPhone(rawPhone);

      if (!name || !phone || !address) {
        alert('يرجى استكمال كافة بيانات الشحن المطلوبة');
        return;
      }

      if (!isValidEgyptianMobile(phone)) {
        alert('رقم الهاتف غير صحيح. يجب إدخال رقم موبايل مصري صحيح مكون من 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015.');
        if (phoneEl) phoneEl.focus();
        return;
      }

      if (!Array.isArray(cart) || cart.length === 0) {
        alert('السلة فارغة، لا يمكن إتمام الطلب');
        return;
      }

      const selectedPayRadio = document.querySelector('input[name="payMethod"]:checked');
      const payMethod = selectedPayRadio && selectedPayRadio.value === 'cod'
        ? 'الدفع عند الاستلام'
        : 'Instapay';

      const itemsText = cart.map((i, index) => {
        let itemText = `${index + 1}. ${i.title}\n- المقاس: ${i.size}`;
        if (i.color) itemText += `\n- اللون: ${i.color}`;
        itemText += `\n- السعر: ${i.price} ج.م (الكمية: ${i.qty})`;
        if (i.image) itemText += `\n- رابط صورة المنتج: ${i.image}`;
        return itemText;
      }).join('\n\n');

      const totalText = document.getElementById('cartTotalPrice')?.innerText || '0 ج.م';
      if (!generatedOrderId) generatedOrderId = generateStrongOrderId();

      const newOrderRecord = {
        orderId: generatedOrderId,
        name,
        phone,
        address,
        payMethod,
        total: totalText,
        items: [...cart],
        statusCode: 0,
        status: 'تحت التنفيذ 📦',
        date: new Date().toLocaleDateString('ar-EG'),
        createdAt: Date.now()
      };

      saveCustomerData();

      cart.forEach(item => {
        productSales[item.id] = (productSales[item.id] || 0) + item.qty;
      });
      localStorage.setItem('souqProductSales', JSON.stringify(productSales));

      try {
        const cloudSaved = await saveOrderToCloud(newOrderRecord);
        if (!cloudSaved) {
          alert('تعذر حفظ الطلب في Firebase. لم يتم إرسال الطلب عبر واتساب. تأكد من إعداد Firestore وقواعد الوصول.');
          return;
        }

        let msg = `🛒 طلب جديد من متجر My Souq\n\n`;
        msg += `🆔 رقم الطلب: ${generatedOrderId}\n`;
        msg += `بيانات العميل:\n`;
        msg += `• الاسم: ${name}\n`;
        msg += `• رقم التواصل: ${phone}\n`;
        msg += `• العنوان: ${address}\n`;
        msg += `• طريقة الدفع: ${payMethod}\n\n`;
        msg += `المنتجات المطلوبة:\n${itemsText}\n\n`;
        msg += `الإجمالي الكلي: ${totalText}\n\n`;
        msg += `إقرار العميل: أقر بأني اطلعت ووافقت على الشروط والأحكام (تأكيد المقاسات، عدم الإلغاء فور الحجز، والاسترجاع لعيوب التصنيع فقط).`;

        window.open(`https://wa.me/201116339905?text=${encodeURIComponent(msg)}`, '_blank');

        const confirmationModal = document.getElementById('confirmationModal');
        const paymentModal = document.getElementById('paymentModal');
        const successModal = document.getElementById('successModal');
        if (confirmationModal) confirmationModal.classList.remove('active');
        if (paymentModal) paymentModal.classList.remove('active');
        const successId = document.getElementById('successOrderIdDisplay');
        if (successId) successId.innerText = `رقم طلبك هو: ${generatedOrderId}`;
        if (successModal) successModal.classList.add('active');

        cart = [];
        discountRate = 0;
        generatedOrderId = '';
        updateCartCount();
        renderCartItems();
      } catch (error) {
        console.error('خطأ أثناء حفظ الطلب:', error);
        alert(`تعذر حفظ الطلب في النظام.\n\n${error.message || error}`);
      }
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
    const modal = document.getElementById('trackingModal');
    if (modal) modal.classList.add('active');
    const resultBox = document.getElementById('trackingResultContainer');
    if (resultBox) {
      resultBox.style.display = 'none';
      resultBox.innerHTML = '';
    }
    const input = document.getElementById('trackInputId');
    if (input) {
      setTimeout(() => input.focus(), 50);
    }
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

  async function searchOrderTracking() {
    const searchInput = document.getElementById('trackInputId');
    const searchId = searchInput ? searchInput.value.trim() : '';
    const resultBox = document.getElementById('trackingResultContainer');

    if (!searchId) {
      alert('يرجى إدخال رقم الطلب أولاً');
      return;
    }

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

  /* ===== سحب الصور باللمس (Swipe) في نافذة التفاصيل ===== */
  function bindModalImageSwipe() {
    var img = document.getElementById('modalImage');
    var wrap = img && img.closest ? img.closest('.modal-gallery-wrapper') : null;
    var target = wrap || img;
    if (!target || target._msqSwipeBound) return;
    target._msqSwipeBound = true;

    var startX = 0;
    var startY = 0;
    var tracking = false;

    target.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    target.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      // سحب أفقي أوضح من الرأسي
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      // RTL: سحب لليسار = التالي، لليمين = السابق
      if (dx < 0) galleryNext();
      else galleryPrev();
    }, { passive: true });

    // مؤشر بسيط إن فيه أكثر من صورة
    if (img) {
      img.style.touchAction = 'pan-y';
      img.style.userSelect = 'none';
      img.style.webkitUserDrag = 'none';
    }
  }

  function injectModalPolishStyles() {
    var style = document.getElementById('msq-modal-polish-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'msq-modal-polish-css';
      document.head.appendChild(style);
    }
    style.textContent = [
      '/* ===== نافذة تفاصيل: ديسكتوب ثابت + موبايل مضبوط ===== */',
      '#productModal.modal-overlay{padding:6px!important;align-items:center!important;}',
      '#productModal .modal-content{',
      '  max-width:min(1240px,calc(100vw - 8px))!important;',
      '  width:100%!important;',
      '  max-height:97vh!important;',
      '  border-radius:20px!important;',
      '  overflow:hidden!important;',
      '  box-shadow:0 24px 60px rgba(40,20,28,.22)!important;',
      '  border:1px solid rgba(139,63,82,.12)!important;',
      '  display:flex!important;flex-direction:column!important;',
      '}',
      '#productModal .modal-body{',
      '  display:grid!important;',
      '  grid-template-columns:1fr!important;',
      '  gap:0!important;',
      '  padding:0!important;',
      '  overflow-y:auto!important;',
      '  max-height:97vh!important;',
      '  align-items:stretch!important;',
      '}',
      '#productModal .modal-gallery-wrapper{',
      '  position:relative!important;',
      '  background:#f6eef1!important;',
      '  padding:0!important;',
      '  display:flex!important;flex-direction:column!important;gap:0!important;',
      '  min-width:0!important;',
      '  overflow:hidden!important;',
      '}',
      'html body #productModal .modal-img{',
      '  width:100%!important;',
      '  height:auto!important;',
      '  max-height:min(52vh,440px)!important;',
      '  min-height:240px!important;',
      '  object-fit:contain!important;',
      '  object-position:center center!important;',
      '  background:#f6eef1!important;',
      '  border-radius:0!important;',
      '  border:none!important;',
      '  display:block!important;',
      '  margin:0 auto!important;',
      '  box-shadow:none!important;',
      '}',
      '#productModal .thumbnails-bar{',
      '  display:flex!important;gap:8px!important;justify-content:center!important;',
      '  overflow-x:auto!important;padding:10px 10px 4px!important;',
      '  background:#f6eef1!important;',
      '  scrollbar-width:none!important;',
      '}',
      '#productModal .thumbnails-bar::-webkit-scrollbar{display:none!important;}',
      '#productModal .thumbnails-bar img{',
      '  width:52px!important;height:52px!important;border-radius:10px!important;',
      '  border:2px solid transparent!important;object-fit:cover!important;',
      '  flex-shrink:0!important;cursor:pointer!important;',
      '  box-shadow:0 2px 8px rgba(0,0,0,.08)!important;',
      '}',
      '#productModal .gallery-nav{',
      '  display:flex!important;justify-content:center!important;gap:10px!important;',
      '  padding:6px 0 12px!important;background:#f6eef1!important;',
      '}',
      '#productModal .gallery-nav button{',
      '  width:38px!important;height:38px!important;border-radius:50%!important;',
      '  border:1px solid rgba(139,63,82,.15)!important;',
      '  background:#fff!important;color:var(--burgundy-soft,#8b3f52)!important;',
      '  font-size:15px!important;font-weight:800!important;cursor:pointer!important;',
      '  box-shadow:0 2px 10px rgba(0,0,0,.06)!important;',
      '  display:flex!important;align-items:center!important;justify-content:center!important;',
      '}',
      '#productModal .modal-info{',
      '  padding:14px 16px 16px!important;',
      '  display:flex!important;flex-direction:column!important;gap:11px!important;',
      '  background:var(--card-cream,#fff)!important;',
      '}',
      '#productModal .modal-back-btn{',
      '  align-self:flex-start!important;',
      '  background:rgba(139,63,82,.08)!important;',
      '  border:none!important;border-radius:999px!important;',
      '  padding:7px 14px!important;font-size:12px!important;font-weight:800!important;',
      '  color:var(--burgundy-soft,#8b3f52)!important;cursor:pointer!important;',
      '}',
      '#productModal .modal-title{',
      '  font-size:22px!important;font-weight:900!important;line-height:1.25!important;',
      '  color:var(--burgundy-soft,#8b3f52)!important;margin:0!important;',
      '}',
      '#productModal .stock-badge{',
      '  font-size:12px!important;padding:6px 12px!important;border-radius:999px!important;',
      '  font-weight:800!important;width:fit-content!important;',
      '}',
      '#productModal .size-selector{',
      '  display:grid!important;',
      '  grid-template-columns:repeat(4,minmax(0,1fr))!important;',
      '  gap:8px!important;',
      '  margin-top:6px!important;',
      '  width:100%!important;',
      '}',
      '#productModal .size-selector > div{',
      '  border-radius:12px!important;',
      '  padding:9px 4px!important;',
      '  font-size:12.5px!important;',
      '  font-weight:800!important;',
      '  min-width:0!important;',
      '  width:100%!important;',
      '  text-align:center!important;',
      '  box-sizing:border-box!important;',
      '  white-space:nowrap!important;',
      '}',
      '#productModal .modal-price{',
      '  font-size:24px!important;font-weight:900!important;',
      '  color:var(--burgundy-soft,#8b3f52)!important;line-height:1.3!important;',
      '}',
      '#productModal .dimensions-box{',
      '  display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;',
      '  background:rgba(139,63,82,.05)!important;',
      '  border:1px dashed rgba(139,63,82,.2)!important;',
      '  border-radius:14px!important;padding:12px!important;',
      '  font-size:12.5px!important;font-weight:700!important;',
      '}',
      '#productModal #modalDesc{',
      '  font-size:13px!important;line-height:1.5!important;',
      '  color:var(--text-muted,#615053)!important;margin:0!important;',
      '  max-height:4.5em!important;overflow:hidden!important;',
      '}',
      '#productModal .modal-actions-row{',
      '  display:grid!important;',
      '  grid-template-columns:1fr 1fr!important;',
      '  gap:10px!important;',
      '  margin-top:2px!important;',
      '}',
      '#productModal .modal-actions-row > *{',
      '  display:flex!important;align-items:center!important;justify-content:center!important;',
      '  gap:6px!important;min-height:48px!important;border-radius:14px!important;',
      '  font-size:13px!important;font-weight:800!important;text-decoration:none!important;',
      '  border:none!important;cursor:pointer!important;',
      '  box-shadow:0 4px 14px rgba(0,0,0,.07)!important;',
      '  grid-column:auto!important;',
      '}',
      '#productModal .add-cart-btn{',
      '  background:var(--burgundy-soft,#8b3f52)!important;color:#fff!important;',
      '  order:1!important;min-height:50px!important;font-size:14px!important;',
      '}',
      '#productModal .direct-wa-btn{',
      '  background:#1faa59!important;color:#fff!important;',
      '  order:2!important;min-height:50px!important;font-size:14px!important;',
      '}',
      '#productModal .call-modal-btn{',
      '  background:#128c7e!important;color:#fff!important;',
      '  order:3!important;',
      '}',
      '#productModal .share-btn{',
      '  background:#fff!important;color:var(--burgundy-soft,#8b3f52)!important;',
      '  border:1.5px solid rgba(139,63,82,.25)!important;',
      '  order:4!important;',
      '}',
      '#productModal .add-another-design-btn{',
      '  width:100%!important;border-radius:14px!important;min-height:44px!important;',
      '  border:1.5px dashed rgba(139,63,82,.35)!important;',
      '  background:rgba(139,63,82,.04)!important;',
      '  color:var(--burgundy-soft,#8b3f52)!important;',
      '  font-weight:800!important;font-size:13px!important;cursor:pointer!important;',
      '}',
      '#productModal .multi-design-hint{',
      '  font-size:11px!important;line-height:1.45!important;text-align:center!important;',
      '  color:var(--text-muted,#615053)!important;margin:0!important;',
      '}',
      '#productModal .close-btn{',
      '  top:10px!important;left:10px!important;z-index:20!important;',
      '  width:36px!important;height:36px!important;font-size:16px!important;',
      '  background:rgba(255,255,255,.95)!important;',
      '  box-shadow:0 2px 12px rgba(0,0,0,.12)!important;',
      '}',
      '/* mobile full image + sizes grid */',
      '@media (max-width:719px){',
      '  #productModal.modal-overlay{padding:4px!important;}',
      '  #productModal .modal-content{',
      '    border-radius:16px!important;',
      '    max-height:98vh!important;',
      '    width:calc(100vw - 8px)!important;',
      '  }',
      '  #productModal .modal-body{',
      '    display:flex!important;',
      '    flex-direction:column!important;',
      '    max-height:98vh!important;',
      '  }',
      '  #productModal .modal-gallery-wrapper{',
      '    flex:0 0 auto!important;',
      '    background:#f6eef1!important;',
      '  }',
      '  html body #productModal .modal-img{',
      '    width:100%!important;',
      '    height:auto!important;',
      '    max-height:min(55vh,460px)!important;',
      '    min-height:260px!important;',
      '    object-fit:contain!important;',
      '    object-position:center center!important;',
      '    background:#f6eef1!important;',
      '  }',
      '  #productModal .thumbnails-bar{',
      '    padding:8px 8px 2px!important;',
      '    gap:6px!important;',
      '    justify-content:flex-start!important;',
      '  }',
      '  #productModal .thumbnails-bar img{',
      '    width:44px!important;height:44px!important;border-radius:8px!important;',
      '  }',
      '  #productModal .gallery-nav{padding:4px 0 10px!important;}',
      '  #productModal .gallery-nav button{width:34px!important;height:34px!important;font-size:14px!important;}',
      '  #productModal .modal-info{',
      '    padding:12px 14px 16px!important;',
      '    gap:10px!important;',
      '    flex:1 1 auto!important;',
      '  }',
      '  #productModal .modal-title{font-size:19px!important;}',
      '  #productModal .modal-price{font-size:20px!important;}',
      '  #productModal .stock-badge{font-size:11px!important;padding:5px 10px!important;}',
      '  #productModal .size-selector{',
      '    display:grid!important;',
      '    grid-template-columns:repeat(4,minmax(0,1fr))!important;',
      '    gap:7px!important;',
      '    width:100%!important;',
      '  }',
      '  #productModal .size-selector > div{',
      '    padding:10px 2px!important;',
      '    font-size:11.5px!important;',
      '    border-radius:10px!important;',
      '    min-height:40px!important;',
      '    display:flex!important;align-items:center!important;justify-content:center!important;',
      '  }',
      '  #productModal .dimensions-box{',
      '    grid-template-columns:1fr 1fr!important;',
      '    gap:6px!important;padding:10px!important;font-size:11.5px!important;',
      '  }',
      '  #productModal .modal-actions-row{gap:8px!important;}',
      '  #productModal .modal-actions-row > *{',
      '    min-height:46px!important;font-size:12px!important;border-radius:12px!important;',
      '  }',
      '  #productModal .add-cart-btn,#productModal .direct-wa-btn{',
      '    min-height:48px!important;font-size:13px!important;',
      '  }',
      '  #productModal .add-another-design-btn{min-height:42px!important;font-size:12px!important;}',
      '  #productModal .multi-design-hint{font-size:10px!important;}',
      '}',
      '/* desktop layout */',
      '@media (min-width:720px){',
      '  #productModal .modal-body{',
      '    grid-template-columns:minmax(0,1.6fr) minmax(340px,0.85fr)!important;',
      '  }',
      '  #productModal .modal-gallery-wrapper{min-height:100%!important;}',
      '  html body #productModal .modal-img{',
      '    height:min(78vh,720px)!important;',
      '    max-height:min(78vh,720px)!important;',
      '    min-height:420px!important;',
      '    object-fit:contain!important;',
      '  }',
      '  #productModal .modal-info{',
      '    padding:20px 22px 22px!important;',
      '    gap:12px!important;',
      '    overflow-y:auto!important;',
      '    max-height:97vh!important;',
      '  }',
      '  #productModal .modal-title{font-size:26px!important;}',
      '  #productModal .modal-price{font-size:28px!important;}',
      '  #productModal .size-selector{',
      '    grid-template-columns:repeat(4,minmax(0,1fr))!important;',
      '  }',
      '  #productModal .modal-actions-row{gap:10px!important;}',
      '  #productModal .modal-actions-row > *{min-height:50px!important;font-size:13.5px!important;}',
      '  #productModal .thumbnails-bar img{width:56px!important;height:56px!important;}',
      '}',
      '@media (min-width:1000px){',
      '  #productModal .modal-content{max-width:min(1280px,calc(100vw - 28px))!important;}',
      '  #productModal .modal-body{grid-template-columns:minmax(0,1.7fr) minmax(360px,0.8fr)!important;}',
      '  html body #productModal .modal-img{height:min(82vh,760px)!important;max-height:min(82vh,760px)!important;object-fit:contain!important;}',
      '  #productModal .modal-info{padding:24px 26px 26px!important;}',
      '}'
    ].join('\n');
  }


  function injectMobileLayoutPolish() {
    var style = document.getElementById('msq-mobile-layout-polish-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'msq-mobile-layout-polish-css';
      document.head.appendChild(style);
    }
    style.textContent = [
      '/* ===== موبايل: شريط فلاتر مرتب + كروت نظيفة بدون تغطية ===== */',
      '@media (max-width:767px){',
      '  body{padding:8px 8px 96px!important;}',
      '  header{padding:52px 4px 8px!important;}',
      '  header h1{font-size:22px!important;margin-bottom:6px!important;}',
      '  header p{font-size:11.5px!important;padding:8px 10px!important;line-height:1.35!important;}',
      '',
      '  /* شريط التحكم */',
      '  .controls-wrapper{',
      '    width:100%!important;max-width:100%!important;',
      '    margin:0 0 12px!important;padding:10px!important;gap:10px!important;',
      '    border-radius:16px!important;box-sizing:border-box!important;',
      '  }',
      '',
      '  /* الأقسام: سكرول أفقي ناعم بدل شبكة مزدحمة */',
      '  .msq-category-nav,.categories-bar{',
      '    display:flex!important;flex-wrap:nowrap!important;',
      '    overflow-x:auto!important;-webkit-overflow-scrolling:touch!important;',
      '    gap:6px!important;padding:0 0 8px!important;border-bottom:1px solid rgba(139,63,82,.1)!important;',
      '    scrollbar-width:none!important;justify-content:flex-start!important;',
      '  }',
      '  .msq-category-nav::-webkit-scrollbar,.categories-bar::-webkit-scrollbar{display:none!important;}',
      '  .msq-category-nav .cat-btn,',
      '  .msq-category-nav>[data-main-category="الكل"],',
      '  .msq-category-nav>.offer-tab,',
      '  .msq-category-nav>.stock-avail,',
      '  .msq-category-nav>.stock-out{',
      '    flex:0 0 auto!important;width:auto!important;min-width:auto!important;',
      '    min-height:36px!important;height:auto!important;',
      '    padding:7px 12px!important;font-size:12px!important;',
      '    white-space:nowrap!important;border-radius:999px!important;',
      '  }',
      '',
      '  /* صف البحث + الفلاتر: بحث بعرض كامل ثم شبكة 2×2 */',
      '  .search-sort-box{',
      '    display:grid!important;',
      '    grid-template-columns:1fr 1fr!important;',
      '    gap:8px!important;width:100%!important;',
      '    padding-top:0!important;align-items:stretch!important;',
      '  }',
      '  .search-field-wrap{grid-column:1/-1!important;width:100%!important;min-width:0!important;}',
      '  .search-field-wrap .search-input,',
      '  .sort-wrapper select,',
      '  .gallery-mode-btn{',
      '    width:100%!important;min-width:0!important;',
      '    height:42px!important;min-height:42px!important;',
      '    font-size:12px!important;border-radius:12px!important;',
      '    box-sizing:border-box!important;',
      '  }',
      '  .search-field-wrap .search-input{',
      '    padding:0 12px 0 40px!important;font-size:13px!important;',
      '  }',
      '  .sort-wrapper{width:100%!important;min-width:0!important;margin:0!important;}',
      '  .gallery-mode-btn{',
      '    padding:0 6px!important;white-space:nowrap!important;',
      '    overflow:hidden!important;text-overflow:ellipsis!important;',
      '    display:flex!important;align-items:center!important;justify-content:center!important;',
      '  }',
      '  .voice-search-btn{width:30px!important;height:30px!important;font-size:13px!important;left:6px!important;}',
      '',
      '  /* شبكة المنتجات */',
      '  .products-grid,#products-container{',
      '    gap:10px!important;padding:0 2px!important;',
      '  }',
      '  .product-card{',
      '    border-radius:14px!important;overflow:hidden!important;',
      '    box-shadow:0 4px 14px rgba(40,20,28,.08)!important;',
      '  }',
      '  .product-card .image-container{',
      '    position:relative!important;overflow:hidden!important;',
      '    height:auto!important;aspect-ratio:1/1.05!important;',
      '    background:#f6eef1!important;',
      '  }',
      '  .product-card .product-image{',
      '    width:100%!important;height:100%!important;',
      '    object-fit:cover!important;object-position:center top!important;',
      '    display:block!important;',
      '  }',
      '  .product-details{padding:8px 9px 10px!important;}',
      '  .product-title{',
      '    font-size:12.5px!important;line-height:1.3!important;',
      '    margin:0 0 4px!important;',
      '    display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;',
      '    overflow:hidden!important;',
      '  }',
      '  .price-tag{font-size:13.5px!important;font-weight:900!important;}',
      '  .click-hint{font-size:10px!important;margin-top:3px!important;opacity:.75!important;}',
      '',
      '  /* شارة الألبوم: صغيرة وما تغطيش وسط الصورة */',
      '  .msq-album-badge{',
      '    position:absolute!important;',
      '    top:8px!important;bottom:auto!important;',
      '    left:8px!important;right:auto!important;',
      '    z-index:3!important;',
      '    padding:3px 7px!important;',
      '    font-size:9px!important;font-weight:800!important;',
      '    border-radius:999px!important;',
      '    background:rgba(30,22,26,.72)!important;color:#fff!important;',
      '    backdrop-filter:blur(4px)!important;',
      '    max-width:70%!important;',
      '    white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;',
      '    pointer-events:none!important;',
      '    box-shadow:0 2px 8px rgba(0,0,0,.15)!important;',
      '  }',
      '',
      '  /* أزرار عائمة: بعيدة عن المنتجات */',
      '  .whatsapp-float{bottom:88px!important;left:10px!important;width:44px!important;height:44px!important;z-index:80!important;}',
      '  .call-float{bottom:140px!important;left:10px!important;width:44px!important;height:44px!important;z-index:80!important;}',
      '  .qr-toggle-fab{bottom:12px!important;left:10px!important;width:44px!important;height:44px!important;z-index:80!important;}',
      '  .back-to-top{bottom:12px!important;right:10px!important;width:44px!important;height:44px!important;z-index:80!important;}',
      '  .brand-badge{width:42px!important;height:42px!important;font-size:8px!important;top:8px!important;right:8px!important;}',
      '  .top-actions{',
      '    top:6px!important;left:6px!important;right:54px!important;',
      '    gap:4px!important;max-width:calc(100% - 60px)!important;',
      '    flex-wrap:nowrap!important;overflow-x:auto!important;',
      '    scrollbar-width:none!important;',
      '  }',
      '  .top-actions::-webkit-scrollbar{display:none!important;}',
      '  .top-actions > *{',
      '    flex:0 0 auto!important;min-height:32px!important;',
      '    padding:5px 8px!important;font-size:10px!important;',
      '  }',
      '}',
      '',
      '@media (max-width:380px){',
      '  .search-sort-box{gap:6px!important;}',
      '  .search-field-wrap .search-input,.sort-wrapper select,.gallery-mode-btn{',
      '    height:40px!important;min-height:40px!important;font-size:11px!important;',
      '  }',
      '  .msq-category-nav .cat-btn{padding:6px 10px!important;font-size:11px!important;min-height:34px!important;}',
      '  .product-title{font-size:11.5px!important;}',
      '  .price-tag{font-size:12.5px!important;}',
      '}',
    ].join('\n');
  }


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
    const shareVar = (currentSelectedProduct.variants || []).find(function (v) {
      return v.size === selectedSize;
    });
    const sharePrice =
      (shareVar && Number(shareVar.price) > 0)
        ? Number(shareVar.price)
        : (Number(currentSelectedProduct.price) || getEffectivePrice(currentSelectedProduct) || 0);
    const text = currentSelectedProduct.title + ' — ' + sharePrice + ' ج.م\n' + url;
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
    // مفيش فتح تلقائي لنافذة التفاصيل عند دخول/تحديث المتجر.
    // لو في ?product= من زيارة قديمة → يتنظف الرابط بس من غير ما تفتح النافذة.
    // روابط المشاركة لسه بتتنسخ فيها ?product= للاستخدام اليدوي.
    clearProductQueryFromUrl();
  }

  function openAdminOrdersModal() {
    if (!isAdminMode || !currentAdminUser) { document.getElementById('adminLoginModal')?.classList.add('active'); return; }
    document.getElementById('adminOrdersModal').classList.add('active');
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
      try { injectModalPolishStyles(); } catch (e) {}
      try { injectMobileLayoutPolish(); } catch (e) {}
      try { bindModalImageSwipe(); } catch (e) {}

      const custPhoneInput = document.getElementById('custPhone');
      if (custPhoneInput) {
        custPhoneInput.setAttribute('inputmode', 'numeric');
        custPhoneInput.setAttribute('autocomplete', 'tel');
        custPhoneInput.setAttribute('maxlength', '11');
        custPhoneInput.setAttribute('minlength', '11');
        custPhoneInput.setAttribute('pattern', '01[0125][0-9]{8}');
        custPhoneInput.value = normalizeEgyptianPhone(custPhoneInput.value);
        custPhoneInput.addEventListener('input', handlePhoneInput);
        custPhoneInput.addEventListener('blur', function () {
          validateCustomerPhone(false);
          checkFormCompletion();
        });
      }
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
