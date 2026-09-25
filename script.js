// ===== State =====
let products = [];
let cart = JSON.parse(localStorage.getItem("souqCart")) || [];
let currentCategory = "الكل";
let maxAllowedPrice = 2000;
let selectedSize = null;
let currentSelectedProduct = null;
let discountRate = 0;

// ===== GitHub Config =====
const GITHUB_USER = 'souq-elektroni';
const GITHUB_REPO = 'My-Souq.github.io';
const GITHUB_BRANCH = 'main';

// ===== DOM Elements =====
const productsGrid = document.getElementById("products-container");
const cartCount = document.getElementById("cartCount");

// ===== Load Real Products from GitHub =====
async function loadRealProducts() {
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/products`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`حالة الاستجابة: ${response.status}`);
    }
    
    const files = await response.json();
    const mdFiles = files.filter(f => f.name.endsWith('.md'));

    if (mdFiles.length === 0) {
      productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 18px; font-weight: bold;">لا توجد منتجات منشورة حالياً.</p>';
      return;
    }

    products = [];
    for (let i = 0; i < mdFiles.length; i++) {
      const file = mdFiles[i];
      const rawUrl = file.download_url || `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/products/${file.name}`;
      const fileRes = await fetch(rawUrl);
      const text = await fileRes.text();
      
      const productData = parseMarkdown(text, i + 1);
      if (productData) {
        products.push(productData);
      }
    }

    renderProducts(products);
  } catch (error) {
    console.error('خطأ في جلب المنتجات:', error);
    productsGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--burgundy-soft); font-size: 16px; font-weight: bold;">تأكد أن مستودع جيت هب عام (Public) وأن مجلد products يحتوي على منتجات.</p>`;
  }
}

// دالة تحليل الـ Markdown المتوافقة مع ألبوم الصور في لوحة التحكم
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
      let clean = rawPath.replace(/["'\[\]]/g, '').trim().replace(/\/+$/, '');
      if (!clean) return '';
      if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
      if (clean.startsWith('/')) clean = clean.substring(1);
      clean = clean.replace(/\s+/g, '%20');
      if (!clean.startsWith('images/')) clean = 'images/' + clean;
      return `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${clean}`;
    };

    const defaultImg = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500';
    
    // استخراج كافة الصور من ألبوم الصور في ملف الـ Markdown بدقة فائقة
    let allExtractedImages = [];
    const lines = frontmatter.split('\n');
    
    for (let line of lines) {
      if (line.includes('.jpg') || line.includes('.png') || line.includes('.jpeg') || line.includes('.webp') || line.includes('/images/')) {
        let val = line;
        if (line.includes(':')) {
          const partsLine = line.split(':');
          val = partsLine.slice(1).join(':');
        }
        let fixed = fixImagePath(val);
        if (fixed && !allExtractedImages.includes(fixed)) {
          allExtractedImages.push(fixed);
        }
      }
    }

    let mainImage = allExtractedImages.length > 0 ? allExtractedImages[0] : defaultImg;
    let allImages = allExtractedImages.length > 0 ? allExtractedImages : [defaultImg];

    // استخراج المقاسات
    let parsedVariants = [];
    const variantsMatch = frontmatter.match(/variants:\s*\n([\s\S]*)/);
    
    if (variantsMatch) {
      const variantText = variantsMatch[1];
      const blocks = variantText.split(/(?=\n\s*-\s*size:|\n\s*-\s*المقاس:|\n\s*-\s*["']?[0-9a-zA-Z\u0600-\u06FF]+["']?\s*:)/);
      
      blocks.forEach(block => {
        if (!block.trim()) return;
        
        let sizeVal = '';
        const sizeMatch1 = block.match(/(?:size|المقاس):\s*["']?([^,\n]+)["']?/i);
        const sizeMatch2 = block.match(/-\s*["']?([0-9a-zA-Z\u0600-\u06FF\s]+)["']?\s*:/);
        const sizeMatch3 = block.match(/([0-9a-zA-Z\u0600-\u06FF]+):\s*\n/);
        
        if (sizeMatch1) sizeVal = sizeMatch1[1].trim();
        else if (sizeMatch2) sizeVal = sizeMatch2[1].trim();
        else if (sizeMatch3) sizeVal = sizeMatch3[1].trim();

        let lenVal = '';
        const lenMatch = block.match(/(?:الطول|length)[^0-9]*([0-9.]+)/i);
        if (lenMatch) lenVal = lenMatch[1].trim();

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
  if (btn) btn.classList.add('active');
  handleSearchAndFilter();
}

function handleSearchAndFilter() {
  const query = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
  let filtered = products.filter(p => {
    const matchesCat = currentCategory === 'الكل' || p.category === currentCategory;
    const matchesSearch = p.title.toLowerCase().includes(query);
    return matchesCat && matchesSearch;
  });
  renderProducts(filtered);
}

function applySorting() {
  const sortVal = document.getElementById('sortSelect') ? document.getElementById('sortSelect').value : '';
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
  
  if (modalImg) {
    modalImg.src = currentSelectedProduct.image;
    modalImg.onerror = function() { this.src='https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500'; };
  }
  
  if (thumbsContainer) {
    thumbsContainer.innerHTML = '';
    if (currentSelectedProduct.images && currentSelectedProduct.images.length > 0) {
      thumbsContainer.style.display = 'flex';
      currentSelectedProduct.images.forEach((imgSrc, idx) => {
        const thumb = document.createElement('img');
        thumb.className = `thumb-img ${idx === 0 ? 'active' : ''}`;
        thumb.src = imgSrc;
        thumb.onerror = function() { this.style.display = 'none'; };
        thumb.onclick = () => {
          if (modalImg) modalImg.src = imgSrc;
          document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
        };
        thumbsContainer.appendChild(thumb);
      });
    } else {
      thumbsContainer.style.display = 'none';
    }
  }

  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.innerText = currentSelectedProduct.title;

  const priceEl = document.getElementById('modalPrice');
  if (priceEl) priceEl.innerText = currentSelectedProduct.price + ' ج.م';

  const descEl = document.getElementById('modalDesc');
  if (descEl) descEl.innerText = currentSelectedProduct.desc;

  const sizesContainer = document.getElementById('sizesContainer');
  const dimensionsContainer = document.getElementById('dimensionsContainer');
  const lengthSpan = document.getElementById('modalLength');
  const widthSpan = document.getElementById('modalWidth');

  if (sizesContainer) {
    sizesContainer.innerHTML = '';
  }
  
  const firstVariant = currentSelectedProduct.variants[0] || { size: 'مقاس موحد', length: '', width: '' };
  selectedSize = firstVariant.size || '';

  function updateDimensionsDisplay(variant) {
    if (dimensionsContainer && lengthSpan && widthSpan) {
      if (variant && (variant.length || variant.width)) {
        dimensionsContainer.style.display = 'flex';
        lengthSpan.innerText = variant.length || '-';
        widthSpan.innerText = variant.width || '-';
      } else {
        dimensionsContainer.style.display = 'none';
      }
    }
  }

  updateDimensionsDisplay(firstVariant);

  if (sizesContainer) {
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
  }

  const waBtn = document.getElementById('directWaBtn');
  if (waBtn) {
    const waText = encodeURIComponent(`مرحباً، أود طلب منتج: ${currentSelectedProduct.title} - المقاس: ${selectedSize} - السعر: ${currentSelectedProduct.price} ج.م`);
    waBtn.href = `https://wa.me/201116339905?text=${waText}`;
  }

  const productModal = document.getElementById('productModal');
  if (productModal) productModal.classList.add('active');
}

function closeModal() {
  const productModal = document.getElementById('productModal');
  if (productModal) productModal.classList.remove('active');
}

function addToCart() {
  if (!currentSelectedProduct) return;
  const existing = cart.find(item => item.id === currentSelectedProduct.id && item.size === selectedSize);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...currentSelectedProduct, size: selectedSize, qty: 1 });
  }
  localStorage.setItem("souqCart", JSON.stringify(cart));
  updateCartCount();
  closeModal();
  openCartModal();
  showToast();
}

function showToast() {
  const toast = document.getElementById('toastNotification');
  if (toast) {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

function updateCartCount() {
  const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
  if (cartCount) cartCount.innerText = totalCount;
  localStorage.setItem("souqCart", JSON.stringify(cart));
}

function openCartModal() {
  renderCartItems();
  const cartModal = document.getElementById('cartModal');
  if (cartModal) cartModal.classList.add('active');
}

function closeCartModal() {
  const cartModal = document.getElementById('cartModal');
  if (cartModal) cartModal.classList.remove('active');
}

function renderCartItems() {
  const container = document.getElementById('cartItemsContainer');
  const promoBox = document.getElementById('promoBox');
  const customerFormBox = document.getElementById('customerFormBox');
  const proceedBtn = document.getElementById('proceedBtn');

  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">السلة فارغة حالياً</p>';
    if (promoBox) promoBox.style.display = 'none';
    if (customerFormBox) customerFormBox.style.display = 'none';
    if (proceedBtn) proceedBtn.style.display = 'none';
    const totalPriceEl = document.getElementById('cartTotalPrice');
    if (totalPriceEl) totalPriceEl.innerText = '0 ج.م';
    return;
  }

  if (promoBox) promoBox.style.display = 'flex';
  if (customerFormBox) customerFormBox.style.display = 'flex';

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
  const totalPriceEl = document.getElementById('cartTotalPrice');
  if (totalPriceEl) totalPriceEl.innerText = total.toFixed(0) + ' ج.م';
}

function applyPromoCode() {
  const promoInput = document.getElementById('promoInput');
  const code = promoInput ? promoInput.value.trim() : '';
  if (code === 'SOUQ10') {
    discountRate = 0.10;
    alert('تم تطبيق خصم 10% بنجاح!');
    updateTotalPrice();
  } else {
    alert('كود الخصم غير صحيح');
  }
}

function checkFormCompletion() {
  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const addressEl = document.getElementById('custAddress');
  const proceedBtn = document.getElementById('proceedBtn');

  if (!nameEl || !phoneEl || !addressEl || !proceedBtn) return;

  const name = nameEl.value.trim();
  const phone = phoneEl.value.trim();
  const address = addressEl.value.trim();

  if (name && phone && address && cart.length > 0) {
    proceedBtn.style.display = 'block';
  } else {
    proceedBtn.style.display = 'none';
  }
}

function validateAndOpenTerms() {
  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const addressEl = document.getElementById('custAddress');

  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const address = addressEl ? addressEl.value.trim() : '';

  if (!name || !phone || !address) {
    alert('يرجى استكمال كافة بيانات الشحن المطلوبة');
    return;
  }
  closeCartModal();
  const termsModal = document.getElementById('termsModal');
  if (termsModal) termsModal.classList.add('active');
}

function toggleTermsCheckbox() {
  const cb = document.getElementById('termsCheckbox');
  if (cb) {
    cb.checked = !cb.checked;
    handleCheckboxChange({ target: cb });
  }
}

function handleCheckboxChange(e) {
  const agreeBtn = document.getElementById('agreeBtn');
  if (agreeBtn) {
    if (e.target.checked) agreeBtn.classList.add('active');
    else agreeBtn.classList.remove('active');
  }
}

function declineTerms() {
  const termsModal = document.getElementById('termsModal');
  if (termsModal) termsModal.classList.remove('active');
}

function proceedToPayment() {
  const termsModal = document.getElementById('termsModal');
  const paymentModal = document.getElementById('paymentModal');
  if (termsModal) termsModal.classList.remove('active');
  if (paymentModal) paymentModal.classList.add('active');
}

function selectPayment(method) {
  document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
  const optCod = document.getElementById('optCod');
  const payCod = document.getElementById('payCod');
  const optInstapay = document.getElementById('optInstapay');
  const payInstapay = document.getElementById('payInstapay');

  if (method === 'cod') {
    if (optCod) optCod.classList.add('selected');
    if (payCod) payCod.checked = true;
  } else {
    if (optInstapay) optInstapay.classList.add('selected');
    if (payInstapay) payInstapay.checked = true;
  }
}

function copyInstapay(e) {
  e.stopPropagation();
  navigator.clipboard.writeText('01116339905');
  alert('تم نسخ رقم انستا باي بنجاح');
}

function finalizeOrder() {
  const nameEl = document.getElementById('custName');
  const phoneEl = document.getElementById('custPhone');
  const addressEl = document.getElementById('custAddress');
  
  const name = nameEl ? nameEl.value.trim() : '';
  const phone = phoneEl ? phoneEl.value.trim() : '';
  const address = addressEl ? addressEl.value.trim() : '';
  
  const selectedPayRadio = document.querySelector('input[name="payMethod"]:checked');
  const payMethod = selectedPayRadio && selectedPayRadio.value === 'cod' ? 'الدفع عند الاستلام' : 'Instapay';
  
  let itemsTest = cart.map(i => `- ${i.title} (مقاس: ${i.size}) × ${i.qty} = ${i.price * i.qty} ج.م`).join('\n');
  const totalPriceEl = document.getElementById('cartTotalPrice');
  let totalText = totalPriceEl ? totalPriceEl.innerText : '0 ج.م';

  let msg = `🛍️ *طلب جديد من متجر My Souq*\n\n`;
  msg += `👤 الاسم: ${name}\n`;
  msg += `📞 الهاتف: ${phone}\n`;
  msg += `📍 العنوان: ${address}\n\n`;
  msg += `🛒 *المنتجات المطلوبة:*\n${itemsTest}\n\n`;
  msg += `💰 *الإجمالي النهائي:* ${totalText}\n`;
  msg += `💳 *طريقة الدفع:* ${payMethod}`;

  const encodedMsg = encodeURIComponent(msg);
  window.open(`https://wa.me/201116339905?text=${encodedMsg}`, '_blank');

  const paymentModal = document.getElementById('paymentModal');
  const successModal = document.getElementById('successModal');
  if (paymentModal) paymentModal.classList.remove('active');
  if (successModal) successModal.classList.add('active');
  
  cart = [];
  updateCartCount();
}

function closeSuccessModal() {
  const successModal = document.getElementById('successModal');
  if (successModal) successModal.classList.remove('active');
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
    if (btn) {
      if (window.scrollY > 300) btn.classList.add('show');
      else btn.classList.remove('show');
    }
  });
});
