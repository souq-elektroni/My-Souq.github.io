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

// ===== Size Chart (cm) =====
const sizeChart = {
  "M": { height: "70", width: "52" },
  "L": { height: "72", width: "55" },
  "XL": { height: "75", width: "58" },
  "XXL": { height: "78", width: "61" },
  "4 سنوات": { height: "98-104", width: "34-36" },
  "6 سنوات": { height: "110-116", width: "38-40" },
  "8 سنوات": { height: "122-128", width: "42-44" },
  "10 سنوات": { height: "134-140", width: "46-48" },
  "41": { height: "-", width: "-" },
  "42": { height: "-", width: "-" },
  "43": { height: "-", width: "-" },
  "44": { height: "-", width: "-" }
};

// ===== Load Real Products from GitHub / products folder =====
async function loadRealProducts() {
  try {
    const response = await fetch('https://api.github.com/repos/souq-elektroni/My-Souq.github.io/contents/products');
    if (!response.ok) throw new Error('فشل جلب المنتجات');
    
    const files = await response.json();
    const mdFiles = files.filter(f => f.name.endsWith('.md'));

    if (mdFiles.length === 0) {
      productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 18px; font-weight: bold;">لا توجد منتجات منشورة حالياً. أضف منتجك الأول من لوحة التحكم!</p>';
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
    productsGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: red; font-size: 16px;">عفواً، تأكد من وجود ملفات منتجات داخل مجلد products.</p>';
  }
}

// تحليل ملف الـ Markdown الخاص بالمنتج ومعالجة مسار الصورة تلقائياً
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
    
    // معالجة مسار الصورة لضمان ظهورها بشكل سليم دائماً
    let rawImage = getField('image') || '';
    let image = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500';
    
    if (rawImage) {
      if (rawImage.startsWith('http://') || rawImage.startsWith('https://')) {
        image = rawImage;
      } else {
        // تنظيف المسار إذا بدأ بـ / أو تم رفعه محلياً
        let cleanPath = rawImage.startsWith('/') ? rawImage.substring(1) : rawImage;
        image = cleanPath;
      }
    }
    
    let sizes = ["M", "L", "XL", "XXL"];
    if (category === 'أحذية') {
      sizes = ["41", "42", "43", "44"];
    }

    return {
      id: id,
      title: title,
      category: category,
      price: price,
      image: image,
      desc: body || title,
      sizes: sizes,
      length: "75",
      width: "55"
    };
  } catch (e) {
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
        <img class="product-image" src="${p.image}" alt="${p.title}" loading="lazy">
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

  document.getElementById('modalImage').src = currentSelectedProduct.image;
  document.getElementById('modalTitle').innerText = currentSelectedProduct.title;
  document.getElementById('modalPrice').innerText = currentSelectedProduct.price + ' ج.م';
  document.getElementById('modalDesc').innerText = currentSelectedProduct.desc;

  const sizesContainer = document.getElementById('sizesContainer');
  sizesContainer.innerHTML = '';
  selectedSize = currentSelectedProduct.sizes[0] || '';
  
  currentSelectedProduct.sizes.forEach((s, idx) => {
    const btn = document.createElement('button');
    btn.className = `size-btn ${idx === 0 ? 'selected' : ''}`;
    btn.innerText = s;
    btn.onclick = () => {
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedSize = s;
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
  showToast();
  closeModal();
}

function showToast() {
  const toast = document.getElementById('toastNotification');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
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
  proceedBtn.style.display = 'block';

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
  
  let itemsText = cart.map(i => `- ${i.title} (مقاس: ${i.size}) × ${i.qty} = ${i.price * i.qty} ج.م`).join('\n');
  let totalText = document.getElementById('cartTotalPrice').innerText;

  let msg = `🛍️ *طلب جديد من متجر My Souq*\n\n`;
  msg += `👤 الاسم: ${name}\n`;
  msg += `📞 الهاتف: ${phone}\n`;
  msg += `📍 العنوان: ${address}\n\n`;
  msg += `🛒 *المنتجات المطلوبة:*\n${itemsText}\n\n`;
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
