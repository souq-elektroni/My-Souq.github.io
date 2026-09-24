// ===== State =====
let products = [];
let cart = JSON.parse(localStorage.getItem("souqCart")) || [];
let currentCategory = "all";
let minPrice = 0;
let maxPrice = 2000;
let selectedSize = null;
let currentProductId = null;
let currentSelectedProduct = null;
let discountRate = 0;

// ===== DOM Elements =====
const productsGrid = document.getElementById("products-container");
const cartCount = document.getElementById("cartCount");

// ===== Load Real Products from GitHub / products folder =====
async function loadRealProducts() {
  try {
    const apiUrl = 'https://api.github.com/repos/souq-elektroni/My-Souq.github.io/contents/products';
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`فشل جلب الملفات من جيت هب. حالة الرد: ${response.status}`);
    }
    
    const files = await response.json();
    
    if (!Array.isArray(files)) {
      throw new Error('محتوى المجلد غير متوافق.');
    }

    const mdFiles = files.filter(f => f.name.endsWith('.md'));

    if (mdFiles.length === 0) {
      productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 18px; font-weight: bold;">لا توجد منتجات منشورة حالياً.</p>';
      return;
    }

    products = [];
    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      const fileRes = await fetch(file.download_url);
      const text = await fileRes.text();
      
      const productData = parseMarkdown(text, i + 1);
      if (productData) {
        products.push(productData);
      }
    }

    renderProducts(products);
  } catch (error) {
    console.error('خطأ في جلب المنتجات:', error);
    productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: red; font-size: 16px;">عفواً، حدث خطأ أثناء تحميل المنتجات: ${error.message}</p>`;
  }
}

// دالة تحليل الـ Markdown الفائقة الذكاء لقراءة المقاسات والطول والعرض مهما كانت الصيغة
function parseMarkdown(markdownText, id) {
  try {
    const parts = markdownText.split('---');
    if (parts.length < 3) return null;
    
    const frontmatter = parts[1];
    const body = parts.slice(2).join('---').trim();

    const getField = (key) => {
      const match = frontmatter.match(new RegExp(`${key}:\\s*(.+)`));
      return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
    };

    const title = getField('title') || getField('name') || 'منتج جديد';
    const price = parseFloat(getField('price')) || 0;
    const category = getField('category') || 'ملابس شتوية';
    
    const fixImagePath = (rawPath) => {
      if (!rawPath) return '';
      let clean = rawPath.replace(/["'\[\]]/g, '').trim();
      if (!clean) return '';
      if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
      if (clean.startsWith('/')) clean = clean.substring(1);
      clean = clean.replace(/\s+/g, '%20');
      if (!clean.startsWith('images/')) clean = 'images/' + clean;
      return clean;
    };

    const rawImageField = getField('image');
    const defaultImg = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500';
    const mainImage = fixImagePath(rawImageField) || defaultImg;

    let allExtractedImages = [];
    const lines = frontmatter.split('\n');
    for (let line of lines) {
      let trimmed = line.trim().replace(/^[-*]\s*/, '').replace(/["']/g, '');
      if (trimmed.includes('images/') || trimmed.endsWith('.jpg') || trimmed.endsWith('.png') || trimmed.endsWith('.jpeg') || trimmed.endsWith('.webp')) {
        let partsPath = trimmed.split(':');
        let possiblePath = partsPath.length > 1 ? partsPath[1].trim() : trimmed;
        let fixed = fixImagePath(possiblePath);
        if (fixed && !allExtractedImages.includes(fixed)) {
          allExtractedImages.push(fixed);
        }
      }
    }

    let allImages = [mainImage, ...allExtractedImages.filter(img => img !== mainImage)];
    if (allImages.length === 0) allImages = [defaultImg];

    // استخراج المقاسات والطول والعرض بقسْم الـ frontmatter إلى أجزاء وبحث شامل
    let parsedVariants = [];
    const variantsMatch = frontmatter.match(/variants:\s*\n([\s\S]*)/);
    
    if (variantsMatch) {
      const variantText = variantsMatch[1];
      // تقسيم النص بناءً على كل سطر يبدأ بمقاس أو شرطة
      const blocks = variantText.split(/(?=\n\s*-\s*size:|\n\s*-\s*المقاس:|\n\s*-\s*["']?[0-9a-zA-Z\u0600-\u06FF]+["']?\s*:)/);
      
      blocks.forEach(block => {
        if (!block.trim()) return;
        
        // استخراج اسم المقاس أو الرقم
        let sizeVal = '';
        const sizeMatch1 = block.match(/(?:size|المقاس):\s*["']?([^,\n]+)["']?/i);
        const sizeMatch2 = block.match(/-\s*["']?([0-9a-zA-Z\u0600-\u06FF\s]+)["']?\s*:/);
        const sizeMatch3 = block.match(/([0-9a-zA-Z\u0600-\u06FF]+):\s*\n/);
        
        if (sizeMatch1) sizeVal = sizeMatch1[1].trim();
        else if (sizeMatch2) sizeVal = sizeMatch2[1].trim();
        else if (sizeMatch3) sizeVal = sizeMatch3[1].trim();

        // استخراج الطول بأي شكل (طول، الطول، length)
        let lenVal = '';
        const lenMatch = block.match(/(?:الطول|length)[^0-9]*([0-9.]+)/i);
        if (lenMatch) lenVal = lenMatch[1].trim();

        // استخراج العرض بأي شكل (عرض، العرض، width)
        let widVal = '';
        const widMatch = block.match(/(?:العرض|width)[^0-9]*([0-9.]+)/i);
        if (widMatch) widVal = widMatch[1].trim();

        if (sizeVal && sizeVal.toLowerCase() !== 'variants') {
          parsedVariants.push({
            size: sizeVal.replace(/['"\[\]]/g, ''),
            length: lenVal,
            width: widVal
          });
        }
      });
    }

    // طريقة بديلة إضافية لاكتشاف الطول والعرض إذا كانت مكتوبة بشكل مسطح في الـ frontmatter
    if (parsedVariants.length === 0) {
      parsedVariants.push({
        size: "مقاس موحد",
        length: getField('الطول') || getField('length') || '',
        width: getField('العرض') || getField('width') || ''
      });
    }

    return {
      id: id,
      title: title,
      category: category,
      price: price,
      image: mainImage,
      images: allImages,
      variants: parsedVariants,
      desc: body || title
    };
  } catch (e) {
    console.error('Error parsing markdown:', e);
    return null;
  }
}

// ===== Render Products =====
function renderProducts(list) {
  if (!productsGrid) return;
  if (list.length === 0) {
    productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 18px; font-weight: bold;">لا توجد منتجات مطابقة</p>';
    return;
  }

  productsGrid.innerHTML = list.map(p => `
    <div class="product-card" onclick="openProductModal(${p.id})">
      <div class="image-container">
        <img class="product-image" src="${p.image}" alt="${p.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500'">
      </div>
      <div class="product-details">
        <h3 class="product-title">${p.title}</h3>
        <div class="price-tag">${p.price} ج.م</div>
        <div class="click-hint">عرض التفاصيل والمقاسات 👈</div>
      </div>
    </div>
  `).join('');
}

// ===== Filter & Search =====
function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  handleSearchAndFilter();
}

function handleSearchAndFilter() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  let filtered = products.filter(p => {
    const matchesCat = currentCategory === 'الكل' || p.category === currentCategory;
    const matchesSearch = p.title.toLowerCase().includes(query);
    return matchesCat && matchesSearch;
  });
  renderProducts(filtered);
}

function applySorting() {
  const sortVal = document.getElementById('sortSelect').value;
  let sorted = [...products];
  if (sortVal === 'low-high') sorted.sort((a,b) => a.price - b.price);
  else if (sortVal === 'high-low') sorted.sort((a,b) => b.price - a.price);
  renderProducts(sorted);
}

// ===== Product Modal & Cart =====
function openProductModal(id) {
  currentSelectedProduct = products.find(p => p.id === id);
  if (!currentSelectedProduct) return;

  const modalImg = document.getElementById('modalImage');
  const thumbsContainer = document.getElementById('thumbnailsContainer');
  
  modalImg.src = currentSelectedProduct.image;
  modalImg.onerror = function() { this.src='https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500'; };
  
  thumbsContainer.innerHTML = '';

  if (currentSelectedProduct.images && currentSelectedProduct.images.length > 0) {
    thumbsContainer.style.display = 'flex';
    currentSelectedProduct.images.forEach((imgSrc, idx) => {
      const thumb = document.createElement('img');
      thumb.className = `thumb-img ${idx === 0 ? 'active' : ''}`;
      thumb.src = imgSrc;
      thumb.onerror = function() { this.style.display = 'none'; };
      thumb.onclick = () => {
        modalImg.src = imgSrc;
        document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      };
      thumbsContainer.appendChild(thumb);
    });
  } else {
    thumbsContainer.style.display = 'none';
  }

  document.getElementById('modalTitle').innerText = currentSelectedProduct.title;
  document.getElementById('modalPrice').innerText = currentSelectedProduct.price + ' ج.م';
  document.getElementById('modalDesc').innerText = currentSelectedProduct.desc;

  const sizesContainer = document.getElementById('sizesContainer');
  const dimensionsContainer = document.getElementById('dimensionsContainer');
  const lengthSpan = document.getElementById('modalLength');
  const widthSpan = document.getElementById('modalWidth');

  sizesContainer.innerHTML = '';
  
  const firstVariant = currentSelectedProduct.variants[0];
  selectedSize = firstVariant.size || '';

  function updateDimensionsDisplay(variant) {
    if (variant && (variant.length || variant.width)) {
      dimensionsContainer.style.display = 'flex';
      lengthSpan.innerText = variant.length || '-';
      widthSpan.innerText = variant.width || '-';
    } else {
      dimensionsContainer.style.display = 'none';
    }
  }

  updateDimensionsDisplay(firstVariant);

  currentSelectedProduct.variants.forEach((v, idx) => {
    const btn = document.createElement('button');
    btn.className = `size-btn ${idx === 0 ? 'selected' : ''}`;
    btn.innerText = v.size;
    btn.onclick = () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSize = v.size;
      updateDimensionsDisplay(v);
    };
    sizesContainer.appendChild(btn);
  });

  const waText = encodeURIComponent(`مرحباً، أود طلب منتج: ${currentSelectedProduct.title} - المقاس: ${selectedSize} - السعر: ${currentSelectedProduct.price} ج.م`);
  document.getElementById('directWaBtn').href = `https://wa.me/201116339905?text=${waText}`;

  document.getElementById('productModal').classList.add('active');
}

function closeModal() {
  document.getElementById('productModal').classList.remove('active');
}

function addToCart() {
  if (!currentSelectedProduct) return;
  const existing = cart.find(item => item.id === currentSelectedProduct.id && item.size === selectedSize);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...currentSelectedProduct, size: selectedSize, qty: 1 });
  }
  updateCartCount();
  closeModal();
  openCartModal();
  showToast();
}

function showToast() {
  const toast = document.getElementById('toastNotification');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function updateCartCount() {
  const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById('cartCount').innerText = totalCount;
}

function openCartModal() {
  renderCartItems();
  document.getElementById('cartModal').classList.add('active');
}

function closeCartModal() {
  document.getElementById('cartModal').classList.remove('active');
}

function renderCartItems() {
  const container = document.getElementById('cartItemsContainer');
  const promoBox = document.getElementById('promoBox');
  const customerFormBox = document.getElementById('customerFormBox');
  const proceedBtn = document.getElementById('proceedBtn');

  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">السلة فارغة حالياً</p>';
    promoBox.style.display = 'none';
    customerFormBox.style.display = 'none';
    proceedBtn.style.display = 'none';
    document.getElementById('cartTotalPrice').innerText = '0 ج.م';
    return;
  }

  promoBox.style.display = 'flex';
  customerFormBox.style.display = 'flex';

  container.innerHTML = cart.map((item, index) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <span class="cart-item-title">${item.title}</span>
        <span class="cart-item-meta">المقاس: ${item.size}</span>
      </div>
      <div class="quantity-controls">
        <button class="qty-btn" onclick="changeQty(${index}, -1)">-</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${index}, 1)">+</button>
      </div>
      <span class="cart-item-price">${item.price * item.qty} ج.م</span>
      <button class="remove-btn" onclick="removeFromCart(${index})">✕</button>
    </div>
  `).join('');

  updateTotalPrice();
  checkFormCompletion();
}

function changeQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  updateCartCount();
  renderCartItems();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartCount();
  renderCartItems();
}

function updateTotalPrice() {
  let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  let total = subtotal * (1 - discountRate);
  document.getElementById('cartTotalPrice').innerText = total.toFixed(0) + ' ج.م';
}

function applyPromoCode() {
  const code = document.getElementById('promoInput').value.trim();
  if (code === 'SOUQ10') {
    discountRate = 0.10;
    alert('تم تطبيق خصم 10% بنجاح!');
    updateTotalPrice();
  } else {
    alert('كود الخصم غير صحيح');
  }
}

function checkFormCompletion() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const proceedBtn = document.getElementById('proceedBtn');

  if (name && phone && address && cart.length > 0) {
    proceedBtn.style.display = 'block';
  } else {
    proceedBtn.style.display = 'none';
  }
}

function validateAndOpenTerms() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();

  if (!name || !phone || !address) {
    alert('يرجى استكمال كافة بيانات الشحن المطلوبة');
    return;
  }
  closeCartModal();
  document.getElementById('termsModal').classList.add('active');
}

function toggleTermsCheckbox() {
  const cb = document.getElementById('termsCheckbox');
  cb.checked = !cb.checked;
  handleCheckboxChange({ target: cb });
}

function handleCheckboxChange(e) {
  const agreeBtn = document.getElementById('agreeBtn');
  if (e.target.checked) agreeBtn.classList.add('active');
  else agreeBtn.classList.remove('active');
}

function declineTerms() {
  document.getElementById('termsModal').classList.remove('active');
}

function proceedToPayment() {
  document.getElementById('termsModal').classList.remove('active');
  document.getElementById('paymentModal').classList.add('active');
}

function selectPayment(method) {
  document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
  if (method === 'cod') {
    document.getElementById('optCod').classList.add('selected');
    document.getElementById('payCod').checked = true;
  } else {
    document.getElementById('optInstapay').classList.add('selected');
    document.getElementById('payInstapay').checked = true;
  }
}

function copyInstapay(e) {
  e.stopPropagation();
  navigator.clipboard.writeText('01116339905');
  alert('تم نسخ رقم انستا باي بنجاح');
}

function finalizeOrder() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const payMethod = document.querySelector('input[name="payMethod"]:checked').value === 'cod' ? 'الدفع عند الاستلام' : 'Instapay';
  
  let itemsTest = cart.map(i => `- ${i.title} (مقاس: ${i.size}) × ${i.qty} = ${i.price * i.qty} ج.م`).join('\n');
  let totalText = document.getElementById('cartTotalPrice').innerText;

  let msg = `🛍️ *طلب جديد من متجر My Souq*\n\n`;
  msg += `👤 الاسم: ${name}\n`;
  msg += `📞 الهاتف: ${phone}\n`;
  msg += `📍 العنوان: ${address}\n\n`;
  msg += `🛒 *المنتجات المطلوبة:*\n${itemsTest}\n\n`;
  msg += `💰 *الإجمالي النهائي:* ${totalText}\n`;
  msg += `💳 *طريقة الدفع:* ${payMethod}`;

  const encodedMsg = encodeURIComponent(msg);
  window.open(`https://wa.me/201116339905?text=${encodedMsg}`, '_blank');

  document.getElementById('paymentModal').classList.remove('active');
  document.getElementById('successModal').classList.add('active');
  cart = [];
  updateCartCount();
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('active');
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function shareProduct() {
  if (navigator.share && currentSelectedProduct) {
    navigator.share({
      title: currentSelectedProduct.title,
      text: `تسوق الآن من My Souq: ${currentSelectedProduct.title} بسعر ${currentSelectedProduct.price} ج.م`,
      url: window.location.href,
    }).catch(console.error);
  } else {
    alert('خاصية المشاركة غير مدعومة في متصفحك الحالي');
  }
}

// ===== Initializing =====
window.addEventListener('DOMContentLoaded', () => {
  loadRealProducts();
  updateCartCount();
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('backToTopBtn');
    if (window.scrollY > 300) btn.classList.add('show');
    else btn.classList.remove('show');
  });
});
