// ===== State =====
let products = [];
let cart = JSON.parse(localStorage.getItem("souqCart")) || [];
let currentCategory = "الكل";
let currentStockFilter = "all";
let selectedSize = null;
let selectedVariantStatus = "available";
let currentSelectedProduct = null;
let activeModalImage = '';
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

// دالة تحليل الـ Markdown المتوافقة تماماً مع الـ Config الجديد وحالة المخزون
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

    const title = getField('title') || 'منتج جديد';
    const price = parseFloat(getField('price')) || 0;
    const oldPrice = parseFloat(getField('oldPrice')) || 0;
    const category = getField('category') || 'ملابس شتوية';
    const stockStatus = getField('stock') || 'available';
    
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
    
    let allExtractedImages = [];
    const imagesMatch = frontmatter.match(/images:\s*\n([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/);
    
    if (imagesMatch) {
      const imgLines = imagesMatch[1].split('\n');
      imgLines.forEach(line => {
        let cleanLine = line.replace(/-\s*/, '').trim();
        if (cleanLine && (cleanLine.includes('/') || cleanLine.includes('.jpg') || cleanLine.includes('.png') || cleanLine.includes('.jpeg') || cleanLine.includes('.webp'))) {
          if (cleanLine.includes(':')) {
            cleanLine = cleanLine.split(':').slice(1).join(':').trim();
          }
          let fixed = fixImagePath(cleanLine);
          if (fixed && !allExtractedImages.includes(fixed)) {
            allExtractedImages.push(fixed);
          }
        }
      });
    }

    if (allExtractedImages.length === 0) {
      const lines = frontmatter.split('\n');
      for (let line of lines) {
        if (line.includes('.jpg') || line.includes('.png') || line.includes('.jpeg') || line.includes('.webp') || line.includes('/images/')) {
          let val = line.includes(':') ? line.split(':').slice(1).join(':') : line;
          let fixed = fixImagePath(val);
          if (fixed && !allExtractedImages.includes(fixed)) {
            allExtractedImages.push(fixed);
          }
        }
      }
    }

    let mainImage = allExtractedImages.length > 0 ? allExtractedImages[0] : defaultImg;
    let allImages = allExtractedImages.length > 0 ? allExtractedImages : [defaultImg];

    let parsedVariants = [];
    const variantsMatch = frontmatter.match(/variants:\s*\n([\s\S]*)/);
    
    if (variantsMatch) {
      const variantText = variantsMatch[1];
      const vLines = variantText.split('\n');
      let currentVar = null;

      for (let vLine of vLines) {
        let trimmedLine = vLine.trim();
        if (trimmedLine.startsWith('-')) {
          if (currentVar && currentVar.size) parsedVariants.push(currentVar);
          currentVar = { size: '', code: 'none', price: null, length: '', width: '', status: 'available' };
          trimmedLine = trimmedLine.replace('-', '').trim();
        }
        if (!currentVar) continue;

        if (trimmedLine.startsWith('size:')) {
          currentVar.size = trimmedLine.split(':')[1].trim().replace(/["']/g, '');
        } else if (trimmedLine.startsWith('code:')) {
          currentVar.code = trimmedLine.split(':')[1].trim().replace(/["']/g, '');
        } else if (trimmedLine.startsWith('price:')) {
          let pVal = parseFloat(trimmedLine.split(':')[1].trim());
          if (!isNaN(pVal)) currentVar.price = pVal;
        } else if (trimmedLine.startsWith('length:')) {
          currentVar.length = trimmedLine.split(':')[1].trim().replace(/["']/g, '');
        } else if (trimmedLine.startsWith('width:')) {
          currentVar.width = trimmedLine.split(':')[1].trim().replace(/["']/g, '');
        } else if (trimmedLine.startsWith('status:')) {
          currentVar.status = trimmedLine.split(':')[1].trim().replace(/["']/g, '');
        }
      }
      if (currentVar && currentVar.size) parsedVariants.push(currentVar);
    }

    if (parsedVariants.length === 0) {
      parsedVariants.push({
        size: "مقاس موحد",
        code: "none",
        length: "",
        width: "",
        price: price,
        status: stockStatus
      });
    }

    return {
      id: id,
      title: title,
      category: category,
      price: price,
      oldPrice: oldPrice,
      stock: stockStatus,
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
  const query = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
  let filtered = products.filter(p => {
    const matchesCat = currentCategory === 'الكل' || p.category === currentCategory || (currentCategory === 'عروض' && p.oldPrice > 0);
    const matchesStock = currentStockFilter === 'all' || p.stock === currentStockFilter;
    const matchesSearch = p.title.toLowerCase().includes(query);
    return matchesCat && matchesStock && matchesSearch;
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
  const stockBadge = document.getElementById('modalStockBadge');
  
  const addBtn = document.getElementById('addCartBtn');
  const waBtn = document.getElementById('directWaBtn');

  if (modalImg) {
    modalImg.src = currentSelectedProduct.image;
    activeModalImage = currentSelectedProduct.image;
    modalImg.onerror = function() { this.src='https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500'; };
  }

  // اختيار أول مقاس متوفر كافتراضي بدلاً من المقاس النافذ إن أمكن
  const firstAvailableVariant = currentSelectedProduct.variants.find(v => v.status !== 'out') || currentSelectedProduct.variants[0];
  selectedSize = firstAvailableVariant ? firstAvailableVariant.size : 'مقاس موحد';
  selectedVariantStatus = firstAvailableVariant ? firstAvailableVariant.status : 'available';

  if (stockBadge) {
    if (currentSelectedProduct.stock === 'out') {
      stockBadge.className = 'stock-badge out';
      stockBadge.innerText = '🔴 نفذت الكمية';
    } else {
      stockBadge.className = 'stock-badge';
      stockBadge.innerText = '🟢 متوفر بالمخزون - جاهز للشحن الفوري';
    }
  }
  
  if (thumbsContainer) {
    thumbsContainer.innerHTML = '';
    if (currentSelectedProduct.images && currentSelectedProduct.images.length > 0) {
      thumbsContainer.style.display = 'flex';
      currentSelectedProduct.images.forEach((imgSrc, idx) => {
        const codeName = `R${idx + 1}`;
        const wrapper = document.createElement('div');
        wrapper.className = `thumb-wrapper ${idx === 0 ? 'active' : ''}`;
        wrapper.style.cssText = "display: flex; flex-direction: column; align-items: center; cursor: pointer; position: relative;";
        
        const img = document.createElement('img');
        img.className = `thumb-img`;
        img.src = imgSrc;
        img.style.cssText = "width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 2px solid transparent;";
        if(idx === 0) img.style.borderColor = "var(--burgundy-soft, #803d48)";
        img.onerror = function() { wrapper.style.display = 'none'; };
        
        const codeLabel = document.createElement('span');
        codeLabel.className = 'thumb-code';
        codeLabel.innerText = codeName;
        codeLabel.style.cssText = "font-size: 11px; color: var(--text-muted); margin-top: 3px; font-weight: bold;";

        wrapper.appendChild(img);
        wrapper.appendChild(codeLabel);

        wrapper.onclick = () => {
          if (modalImg) modalImg.src = imgSrc;
          activeModalImage = imgSrc;
          document.querySelectorAll('.thumb-wrapper').forEach(w => w.classList.remove('active'));
          wrapper.classList.add('active');
          document.querySelectorAll('.thumb-img').forEach(t => t.style.borderColor = 'transparent');
          img.style.borderColor = "var(--burgundy-soft, #803d48)";

          const matchedVariant = currentSelectedProduct.variants.find(v => v.code === codeName);
          if (matchedVariant && matchedVariant.status !== 'out') {
            const sizeBtns = document.querySelectorAll('.size-btn');
            sizeBtns.forEach(b => {
              if (b.dataset.size === matchedVariant.size) {
                b.click();
              }
            });
          }
        };

        thumbsContainer.appendChild(wrapper);
      });
    } else {
      thumbsContainer.style.display = 'none';
    }
  }

  const titleEl = document.getElementById('modalTitle');
  if (titleEl) titleEl.innerText = currentSelectedProduct.title;

  const priceEl = document.getElementById('modalPrice');
  const descEl = document.getElementById('modalDesc');
  if (descEl) descEl.innerText = currentSelectedProduct.desc;

  const sizesContainer = document.getElementById('sizesContainer');
  const dimensionsContainer = document.getElementById('dimensionsContainer');
  const lengthSpan = document.getElementById('modalLength');
  const widthSpan = document.getElementById('modalWidth');

  if (sizesContainer) {
    sizesContainer.innerHTML = '';
  }

  if (priceEl) priceEl.innerText = (firstAvailableVariant?.price || currentSelectedProduct.price) + ' ج.م';

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

  updateDimensionsDisplay(firstAvailableVariant);

  if (sizesContainer) {
    currentSelectedProduct.variants.forEach((v) => {
      const btn = document.createElement('div');
      const isSelected = v.size === selectedSize;
      const isOut = v.status === 'out';
      
      btn.className = `size-btn ${isSelected ? 'selected' : ''} ${isOut ? 'out-variant' : ''}`;
      btn.dataset.size = v.size;
      btn.style.cssText = `padding: 10px 18px; border: 2px solid ${isOut ? '#ef9a9a' : 'var(--border-color, #ebdcdb)'}; border-radius: 12px; background: ${isOut ? '#ffebee' : (isSelected ? 'var(--pink-soft, #f8ecee)' : 'var(--bg-cream, #fdfbf7)')}; cursor: ${isOut ? 'not-allowed' : 'pointer'}; font-size: 16px; font-weight: 800; color: ${isOut ? '#c62828' : 'var(--text-dark, #2c2224)'}; display: flex; align-items: center; gap: 8px; opacity: ${isOut ? '0.8' : '1'}; text-decoration: ${isOut ? 'line-through' : 'none'};`;
      
      btn.innerHTML = `
        <input type="radio" name="productSize" value="${v.size}" ${isSelected ? 'checked' : ''} ${isOut ? 'disabled' : ''} style="accent-color: var(--burgundy-soft, #803d48); width: 18px; height: 18px; cursor: pointer;">
        <span>${v.size} ${isOut ? '(نفذت)' : ''}</span>
      `;

      btn.onclick = () => {
        if (isOut) return;
        document.querySelectorAll('.size-btn').forEach(b => {
          b.classList.remove('selected');
          b.style.background = b.classList.contains('out-variant') ? '#ffebee' : 'var(--bg-cream, #fdfbf7)';
        });
        btn.classList.add('selected');
        btn.style.background = 'var(--pink-soft, #f8ecee)';
        
        const radio = btn.querySelector('input');
        if (radio) radio.checked = true;

        selectedSize = v.size;
        selectedVariantStatus = v.status;
        
        if (priceEl) priceEl.innerText = (v.price || currentSelectedProduct.price) + ' ج.م';
        updateDimensionsDisplay(v);

        // تفعيل أو تعطيل الأزرار حسب حالة المقاس المختار
        if (v.status === 'out' || currentSelectedProduct.stock === 'out') {
          if (addBtn) {
            addBtn.disabled = true;
            addBtn.style.opacity = '0.5';
            addBtn.style.cursor = 'not-allowed';
            addBtn.style.pointerEvents = 'none';
          }
          if (waBtn) {
            waBtn.classList.add('disabled');
            waBtn.style.opacity = '0.5';
            waBtn.style.pointerEvents = 'none';
          }
        } else {
          if (addBtn) {
            addBtn.disabled = false;
            addBtn.style.opacity = '1';
            addBtn.style.cursor = 'pointer';
            addBtn.style.pointerEvents = 'auto';
          }
          if (waBtn) {
            waBtn.classList.remove('disabled');
            waBtn.style.opacity = '1';
            waBtn.style.pointerEvents = 'auto';
          }
        }

        if (waBtn) {
          const waText = encodeURIComponent(`مرحباً، أود طلب منتج: ${currentSelectedProduct.title} - المقاس: ${selectedSize} - السعر: ${priceEl ? priceEl.innerText : currentSelectedProduct.price + ' ج.م'}`);
          waBtn.href = `https://wa.me/201116339905?text=${waText}`;
        }

        if (v.code && v.code !== 'none') {
          const thumbWrappers = document.querySelectorAll('.thumb-wrapper');
          thumbWrappers.forEach((tw) => {
            const codeSpan = tw.querySelector('.thumb-code');
            if (codeSpan && codeSpan.innerText === v.code) {
              tw.click();
            }
          });
        }
      };

      sizesContainer.appendChild(btn);
    });
  }

  // تطبيق حالة الأزرار مباشرة عند فتح النافذة للمقاس الافتراضي
  if (selectedVariantStatus === 'out' || currentSelectedProduct.stock === 'out') {
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.style.cursor = 'not-allowed';
      addBtn.style.pointerEvents = 'none';
    }
    if (waBtn) {
      waBtn.classList.add('disabled');
      waBtn.style.opacity = '0.5';
      waBtn.style.pointerEvents = 'none';
    }
  } else {
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.style.opacity = '1';
      addBtn.style.cursor = 'pointer';
      addBtn.style.pointerEvents = 'auto';
    }
    if (waBtn) {
      waBtn.classList.remove('disabled');
      waBtn.style.opacity = '1';
      waBtn.style.pointerEvents = 'auto';
    }
  }

  if (waBtn) {
    const waText = encodeURIComponent(`مرحباً، أود طلب منتج: ${currentSelectedProduct.title} - المقاس: ${selectedSize} - السعر: ${priceEl ? priceEl.innerText : currentSelectedProduct.price + ' ج.م'}`);
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
  if (!currentSelectedProduct || selectedVariantStatus === 'out') return;
  const activeVariant = currentSelectedProduct.variants.find(v => v.size === selectedSize);
  const itemPrice = activeVariant && activeVariant.price ? activeVariant.price : currentSelectedProduct.price;

  const existing = cart.find(item => item.id === currentSelectedProduct.id && item.size === selectedSize);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: currentSelectedProduct.id,
      title: currentSelectedProduct.title,
      price: itemPrice,
      image: activeModalImage || currentSelectedProduct.image,
      size: selectedSize,
      qty: 1
    });
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
