// ===== Sample Products Data =====
const products = [
  {
    id: 1,
    name: "تيشيرت قطني كلاسيك",
    category: "تيشيرت",
    price: 249,
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&h=600&fit=crop",
    badge: "الأكثر مبيعاً",
    description: "تيشيرت قطني 100% ناعم ومريح، مناسب للاستخدام اليومي. خامته ممتازة وتتحمل الغسيل المتكرر.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 2,
    name: "تيشيرت أوفر سايز",
    category: "تيشيرت",
    price: 299,
    image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500&h=600&fit=crop",
    description: "تيشيرت أوفر سايز بقصة واسعة وعصرية. مثالي للوك الكاجوال المريح.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 3,
    name: "قميص كتان أنيق",
    category: "قميص",
    price: 449,
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&h=600&fit=crop",
    badge: "جديد",
    description: "قميص كتان خفيف وأنيق، مثالي للصيف والمناسبات الكاجوال. تهوية ممتازة وشكل راقي.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 4,
    name: "قميص رسمي سليم فت",
    category: "قميص",
    price: 399,
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=500&h=600&fit=crop",
    description: "قميص رسمي بقصة سليم فت أنيقة. مناسب للعمل والمناسبات الرسمية.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 5,
    name: "بنطلون جينز سليم",
    category: "بنطلون",
    price: 549,
    image: "https://images.unsplash.com/photo-1542272454315-4c01d7abdf4a?w=500&h=600&fit=crop",
    description: "بنطلون جينز سليم فت بجودة عالية. مرن ومريح مع لمسة عصرية.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 6,
    name: "بنطلون كارجو عملي",
    category: "بنطلون",
    price: 479,
    image: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500&h=600&fit=crop",
    badge: "عرض",
    description: "بنطلون كارجو عملي بجيوب متعددة. مناسب للخروج اليومي والرحلات.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 7,
    name: "جاكيت دنيم كلاسيك",
    category: "جاكيت",
    price: 799,
    image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&h=600&fit=crop",
    description: "جاكيت دنيم كلاسيك بقصة مميزة. قطعة أساسية في أي دولاب ملابس.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 8,
    name: "جاكيت بومبر عصري",
    category: "جاكيت",
    price: 899,
    image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=500&h=600&fit=crop",
    badge: "حصري",
    description: "جاكيت بومبر بتصميم عصري وأنيق. دافئ ومناسب للخريف والشتاء.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 9,
    name: "فستان صيفي خفيف",
    category: "فساتين",
    price: 599,
    image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=500&h=600&fit=crop",
    description: "فستان صيفي خفيف وأنيق. مثالي للخروج والمناسبات النهارية.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 10,
    name: "فستان سهرة أنيق",
    category: "فساتين",
    price: 1299,
    image: "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=500&h=600&fit=crop",
    badge: "فاخر",
    description: "فستان سهرة فاخر بتصميم راقي. مثالي للمناسبات والحفلات الخاصة.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 11,
    name: "تيشيرت مطبوع جرافيك",
    category: "تيشيرت",
    price: 279,
    image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=500&h=600&fit=crop",
    description: "تيشيرت مطبوع بتصاميم جرافيك عصرية. قطعة مميزة للوك الكاجوال.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  },
  {
    id: 12,
    name: "قميص كاروهات كاجوال",
    category: "قميص",
    price: 359,
    image: "https://images.unsplash.com/photo-1588359348347-9bc6cbbb689e?w=500&h=600&fit=crop",
    description: "قميص كاروهات كاجوال بألوان هادئة. مناسب للخروج اليومي.",
    sizes: ["0-3 شهور", "3-6 شهور", "6-12 شهر", "1 سنة", "2 سنة", "3 سنوات", "4 سنوات", "5 سنوات", "6 سنوات", "7 سنوات", "8 سنوات", "9 سنوات", "10 سنوات", "11 سنة", "12 سنة", "13 سنة", "14 سنة", "15 سنة", "16 سنة", "17 سنة", "18 سنة"]
  }
];


// ===== Size Chart (cm) =====
const sizeChart = {
  "0-3 شهور": { height: "50-58", width: "22-24" },
  "3-6 شهور": { height: "58-66", width: "24-26" },
  "6-12 شهر": { height: "66-76", width: "26-28" },
  "1 سنة": { height: "76-84", width: "28-30" },
  "2 سنة": { height: "84-92", width: "30-32" },
  "3 سنوات": { height: "92-98", width: "32-34" },
  "4 سنوات": { height: "98-104", width: "34-36" },
  "5 سنوات": { height: "104-110", width: "36-38" },
  "6 سنوات": { height: "110-116", width: "38-40" },
  "7 سنوات": { height: "116-122", width: "40-42" },
  "8 سنوات": { height: "122-128", width: "42-44" },
  "9 سنوات": { height: "128-134", width: "44-46" },
  "10 سنوات": { height: "134-140", width: "46-48" },
  "11 سنة": { height: "140-146", width: "48-50" },
  "12 سنة": { height: "146-152", width: "50-52" },
  "13 سنة": { height: "152-158", width: "52-54" },
  "14 سنة": { height: "158-164", width: "54-56" },
  "15 سنة": { height: "164-170", width: "56-58" },
  "16 سنة": { height: "170-174", width: "58-60" },
  "17 سنة": { height: "174-178", width: "60-62" },
  "18 سنة": { height: "178-182", width: "62-64" }
};

// ===== State =====
let cart = JSON.parse(localStorage.getItem("souqCart")) || [];
let currentCategory = "all";
let minPrice = 0;
let maxPrice = 2000;
let selectedSize = null;
let currentProductId = null;

// ===== DOM Elements =====
const productsGrid = document.getElementById("productsGrid");
const noProducts = document.getElementById("noProducts");
const cartBtn = document.getElementById("cartBtn");
const closeCart = document.getElementById("closeCart");
const cartOverlay = document.getElementById("cartOverlay");
const cartSidebar = document.getElementById("cartSidebar");
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");
const orderForm = document.getElementById("orderForm");
const orderSummary = document.getElementById("orderSummary");
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.querySelector(".nav-links");
const productModal = document.getElementById("productModal");
const productModalOverlay = document.getElementById("productModalOverlay");
const closeModal = document.getElementById("closeModal");
const modalContent = document.getElementById("modalContent");

// ===== Render Products =====
function renderProducts() {
  const filtered = products.filter((p) => {
    const catMatch = currentCategory === "all" || p.category === currentCategory;
    const priceMatch = p.price >= minPrice && p.price <= maxPrice;
    return catMatch && priceMatch;
  });

  if (filtered.length === 0) {
    productsGrid.innerHTML = "";
    noProducts.style.display = "block";
    return;
  }

  noProducts.style.display = "none";
  productsGrid.innerHTML = filtered
    .map(
      (p) => `
    <div class="product-card" data-id="${p.id}" onclick="openProductModal(${p.id})">
      <div class="product-img">
        <img src="${p.image}" alt="${p.name}" loading="lazy">
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ""}
      </div>
      <div class="product-info">
        <h3>${p.name}</h3>
        <span class="product-cat">${p.category}</span>
        <div class="product-bottom">
          <span class="product-price">${p.price} ج.م</span>
          <button class="add-to-cart" onclick="event.stopPropagation(); openProductModal(${p.id})" aria-label="أضف للسلة">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

// ===== Product Modal =====
function openProductModal(id) {
  const product = products.find((p) => p.id === id);
  if (!product) return;

  currentProductId = id;
  selectedSize = null;

  modalContent.innerHTML = `
    <div class="modal-img">
      <img src="${product.image}" alt="${product.name}">
    </div>
    <div class="modal-info">
      <span class="modal-cat">${product.category}</span>
      <h2>${product.name}</h2>
      <p class="modal-price">${product.price} ج.م</p>
      <p class="modal-desc">${product.description || "لا يوجد وصف متاح."}</p>
      
      <div class="size-section">
        <label>اختر المقاس (السن):</label>
        <div class="size-btns" id="sizeBtns">
          ${product.sizes.map((s) => `<button class="size-btn" data-size="${s}" onclick="selectSize('${s}')">${s}</button>`).join("")}
        </div>
        <div class="size-details" id="sizeDetails">
          <p>اختر المقاس لعرض الطول والعرض</p>
        </div>
      </div>

      <button class="btn btn-primary btn-lg" id="modalAddBtn" onclick="addToCartFromModal()">
        أضف إلى السلة
      </button>
    </div>
  `;

  productModal.classList.add("active");
  productModalOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function selectSize(size) {
  selectedSize = size;
  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.size === size);
  });

  const details = document.getElementById("sizeDetails");
  const chart = sizeChart[size];
  if (details && chart) {
    details.innerHTML = `
      <div class="size-measure">
        <div class="measure-item">
          <span class="measure-label">الطول</span>
          <span class="measure-value">${chart.height} سم</span>
        </div>
        <div class="measure-item">
          <span class="measure-label">العرض (الصدر)</span>
          <span class="measure-value">${chart.width} سم</span>
        </div>
      </div>
    `;
  }
}

function addToCartFromModal() {
  if (!selectedSize) {
    alert("من فضلك اختر المقاس أولاً");
    return;
  }

  const product = products.find((p) => p.id === currentProductId);
  if (!product) return;

  // Check if same product + same size already in cart
  const existing = cart.find((item) => item.id === product.id && item.size === selectedSize);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      ...product,
      size: selectedSize,
      qty: 1,
      cartKey: product.id + "-" + selectedSize
    });
  }

  saveCart();
  updateCartUI();
  closeProductModal();
  openCart();
}

function closeProductModal() {
  productModal.classList.remove("active");
  productModalOverlay.classList.remove("active");
  document.body.style.overflow = "";
  selectedSize = null;
  currentProductId = null;
}

// ===== Cart Functions =====
function saveCart() {
  localStorage.setItem("souqCart", JSON.stringify(cart));
}

function removeFromCart(cartKey) {
  cart = cart.filter((item) => item.cartKey !== cartKey);
  saveCart();
  updateCartUI();
}

function changeQty(cartKey, delta) {
  const item = cart.find((i) => i.cartKey === cartKey);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(cartKey);
  } else {
    saveCart();
    updateCartUI();
  }
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function updateCartUI() {
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  cartCount.textContent = totalItems;
  cartTotal.textContent = getCartTotal() + " ج.م";

  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="empty-cart">السلة فارغة</p>';
  } else {
    cartItems.innerHTML = cart
      .map(
        (item) => `
      <div class="cart-item">
        <img src="${item.image}" alt="${item.name}">
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <div class="price">${item.price} ج.م ${item.size ? `| مقاس: ${item.size}` : ""}</div>
          <div class="cart-item-actions">
            <button class="qty-btn" onclick="changeQty('${item.cartKey}', -1)">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn" onclick="changeQty('${item.cartKey}', 1)">+</button>
            <button class="remove-item" onclick="removeFromCart('${item.cartKey}')">حذف</button>
          </div>
        </div>
      </div>
    `
      )
      .join("");
  }

  updateOrderSummary();
}

function updateOrderSummary() {
  if (cart.length === 0) {
    orderSummary.innerHTML = "<p>السلة فارغة — أضف منتجات أولاً</p>";
    return;
  }
  const itemsList = cart
    .map(
      (i) =>
        `<li><span>${i.name} ${i.size ? `(${i.size})` : ""} × ${i.qty}</span><span>${i.price * i.qty} ج.م</span></li>`
    )
    .join("");
  orderSummary.innerHTML = `
    <strong>ملخص الطلب:</strong>
    <ul>${itemsList}</ul>
    <div class="total-line">
      <span>الإجمالي</span>
      <span>${getCartTotal()} ج.م</span>
    </div>
  `;
}

function openCart() {
  cartSidebar.classList.add("active");
  cartOverlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCartSidebar() {
  cartSidebar.classList.remove("active");
  cartOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

// ===== Filters =====
document.getElementById("categoryBtns").addEventListener("click", (e) => {
  if (e.target.classList.contains("cat-btn")) {
    document.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));
    e.target.classList.add("active");
    currentCategory = e.target.dataset.cat;
    renderProducts();
  }
});

document.getElementById("applyPrice").addEventListener("click", () => {
  minPrice = parseInt(document.getElementById("minPrice").value) || 0;
  maxPrice = parseInt(document.getElementById("maxPrice").value) || 99999;
  renderProducts();
});

// ===== Cart Events =====
cartBtn.addEventListener("click", openCart);
closeCart.addEventListener("click", closeCartSidebar);
cartOverlay.addEventListener("click", closeCartSidebar);

checkoutBtn.addEventListener("click", () => {
  closeCartSidebar();
  document.getElementById("order").scrollIntoView({ behavior: "smooth" });
});

// ===== Modal Events =====
closeModal.addEventListener("click", closeProductModal);
productModalOverlay.addEventListener("click", closeProductModal);

// ===== Order Form (WhatsApp) =====
orderForm.addEventListener("submit", (e) => {
  e.preventDefault();

  if (cart.length === 0) {
    alert("السلة فارغة! أضف منتجات أولاً قبل إرسال الطلب.");
    return;
  }

  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const notes = document.getElementById("notes").value.trim();

  let message = `🛒 *طلب جديد من سوق إلكترونى*\n\n`;
  message += `👤 الاسم: ${name}\n`;
  message += `📱 الموبايل: ${phone}\n`;
  message += `📍 العنوان: ${address}\n`;
  if (notes) message += `📝 ملاحظات: ${notes}\n`;
  message += `\n📦 *المنتجات:*\n`;
  cart.forEach((item) => {
    message += `• ${item.name} ${item.size ? `(مقاس ${item.size})` : ""} × ${item.qty} = ${item.price * item.qty} ج.م\n`;
  });
  message += `\n💰 *الإجمالي: ${getCartTotal()} ج.م*`;

  const whatsappUrl = `https://wa.me/201116339905?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank");
});

// ===== Mobile Menu =====
menuToggle.addEventListener("click", () => {
  navLinks.classList.toggle("active");
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("active");
  });
});

// ===== Init =====
renderProducts();
updateCartUI();
