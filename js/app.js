/**
 * ===================================================================
 * Application Logic v2: ร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี
 * UX/UI Minimalist Light Mode
 * รองรับ: ระบบชำระเงิน PromptPay QR (064-279-3664) & เงินสด,
 * รูปภาพอาหารจาก Google Sheets (รวม Google Drive URL), และระบบคิวจริง
 * ===================================================================
 */

// Application State
const state = {
  menuItems: [...INITIAL_MENU_ITEMS],
  activeCategory: "all",
  searchQuery: "",
  cart: [],
  fulfillmentType: "takeaway", // "takeaway" หรือ "delivery"
  deliveryDistanceKm: 0,
  deliveryFee: 0,
  pickupTime: "อีก 20 นาที (เร็วที่สุด)",
  customerGps: null,
  paymentMethod: "promptpay", // "promptpay" หรือ "cash"
  userProfile: {
    userId: "",
    displayName: "ลูกค้าทั่วไป",
    pictureUrl: "",
    isLineUser: false
  },
  currentOrder: null,
  activeTab: "menu"
};

// ==========================================
// 1. Initial Launch & LINE LIFF Initialization
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
  initLiff();
  renderCategories();
  renderMenu();
  setupEventListeners();
  loadSavedCart();
  syncMenuFromGas();
  checkCurrentQueue();
  syncCustomerOrderStatus(); // ซิงค์สถานะออเดอร์ทันทีเมื่อเปิดเว็บ

  // ตรวจสอบและอัปเดตสถานะออเดอร์อัตโนมัติทุกๆ 4 วินาทีเมื่ออยู่หน้าติดตามคิว
  setInterval(() => {
    if (state.activeTab === "track") {
      syncCustomerOrderStatus();
    }
  }, 4000);
});

/**
 * เริ่มต้นระบบ LINE LIFF SDK
 */
async function initLiff() {
  const userGreetingEl = document.getElementById("userGreeting");
  const userAvatarEl = document.getElementById("userAvatar");
  const inputName = document.getElementById("customerName");

  if (!window.liff) {
    enableMockOrGuestUser();
    return;
  }

  if (!APP_CONFIG.LIFF_ID || APP_CONFIG.LIFF_ID === "YOUR_LIFF_ID") {
    enableMockOrGuestUser();
    return;
  }

  try {
    await liff.init({ liffId: APP_CONFIG.LIFF_ID });

    if (liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      state.userProfile = {
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl || "",
        isLineUser: true
      };

      if (userGreetingEl) userGreetingEl.textContent = profile.displayName;
      if (userAvatarEl && profile.pictureUrl) {
        userAvatarEl.src = profile.pictureUrl;
        userAvatarEl.classList.remove("hidden");
      }
      if (inputName && !inputName.value) {
        inputName.value = profile.displayName;
      }
    } else {
      if (liff.isInClient()) {
        liff.login();
      } else {
        enableMockOrGuestUser();
      }
    }
  } catch (error) {
    console.warn("LIFF Init error:", error);
    enableMockOrGuestUser();
  }
}

function enableMockOrGuestUser() {
  const userGreetingEl = document.getElementById("userGreeting");
  state.userProfile = {
    userId: "guest_" + Math.random().toString(36).substring(2, 9),
    displayName: "ลูกค้าทั่วไป",
    pictureUrl: "",
    isLineUser: false
  };

  if (userGreetingEl) userGreetingEl.textContent = "สั่งอาหารออนไลน์";
}

// ==========================================
// 2. Menu Rendering & Google Drive Image Support
// ==========================================

/**
 * แปลงลิงก์ Google Drive ให้ออกมาเป็น Direct Image URL อัตโนมัติ
 */
function formatImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  url = url.trim();

  // จัดการ Google Drive share link (e.g. drive.google.com/file/d/FILE_ID/view...)
  const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|docs\.google\.com\/uc\?id=)([a-zA-Z0-9_-]+)/;
  const match = url.match(driveRegex);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

function renderCategories() {
  const container = document.getElementById("categoryContainer");
  if (!container) return;

  container.innerHTML = MENU_CATEGORIES.map(cat => `
    <button 
      class="category-pill whitespace-nowrap px-4 py-2 rounded-full text-xs font-medium flex items-center gap-1.5 ${state.activeCategory === cat.id ? 'active' : ''}"
      onclick="selectCategory('${cat.id}')"
    >
      <i class="fa-solid ${cat.icon} text-[11px]"></i>
      <span>${cat.name}</span>
    </button>
  `).join("");
}

function selectCategory(catId) {
  state.activeCategory = catId;
  renderCategories();
  renderMenu();
}

function renderMenu() {
  const menuContainer = document.getElementById("menuGrid");
  const emptyState = document.getElementById("menuEmptyState");
  if (!menuContainer) return;

  let items = state.menuItems;

  if (state.activeCategory === "popular") {
    items = items.filter(item => item.popular);
  } else if (state.activeCategory !== "all") {
    items = items.filter(item => item.category === state.activeCategory);
  }

  if (state.searchQuery.trim() !== "") {
    const q = state.searchQuery.trim().toLowerCase();
    items = items.filter(item => 
      item.name.toLowerCase().includes(q) || 
      (item.description && item.description.toLowerCase().includes(q))
    );
  }

  if (items.length === 0) {
    menuContainer.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  menuContainer.innerHTML = items.map(item => {
    const cartEntries = state.cart.filter(c => c.id === item.id);
    const inCartQty = cartEntries.reduce((acc, c) => acc + c.qty, 0);
    const formattedImg = formatImageUrl(item.image);

    // Minimal Placeholder icon mapping
    let catIcon = "fa-utensils";
    if (item.category === "fried") catIcon = "fa-drumstick-bite";
    else if (item.category === "salad") catIcon = "fa-pepper-hot";
    else if (item.category === "stirfry") catIcon = "fa-fire-burner";
    else if (item.category === "soup") catIcon = "fa-bowl-food";
    else if (item.category === "rice") catIcon = "fa-wheat-awn";

    return `
      <div class="minimal-card rounded-2xl overflow-hidden flex flex-col justify-between group">
        <!-- Food Image or Clean Minimal Placeholder -->
        <div class="food-card-img-wrapper relative">
          ${formattedImg ? `
            <img 
              src="${formattedImg}" 
              alt="${item.name}" 
              class="food-card-img"
              loading="lazy"
              onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');"
            />
            <div class="hidden absolute inset-0 flex flex-col items-center justify-center text-amber-600/70">
              <i class="fa-solid ${catIcon} text-2xl mb-1"></i>
              <span class="text-[10px] font-medium text-slate-500">ร้านข้าวต้มนายเจ๊ก</span>
            </div>
          ` : `
            <div class="w-full h-full flex flex-col items-center justify-center text-amber-600/60 bg-gradient-to-br from-amber-50 to-orange-100/50">
              <i class="fa-solid ${catIcon} text-2xl mb-1"></i>
              <span class="text-[10px] font-medium text-slate-400">ร้านข้าวต้มนายเจ๊ก</span>
            </div>
          `}

          ${item.popular ? `
            <div class="absolute top-2.5 right-2.5 bg-orange-600 text-white font-bold text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <i class="fa-solid fa-fire text-[9px]"></i> ยอดนิยม
            </div>
          ` : ''}
        </div>

        <!-- Details -->
        <div class="p-3.5 flex flex-col justify-between flex-1">
          <div>
            <h3 class="font-bold text-sm text-slate-800 leading-snug group-hover:text-orange-600 transition-colors">
              ${item.name}
            </h3>
            <p class="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              ${item.description || "สูตรเด็ดร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี"}
            </p>
          </div>

          <div class="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div class="text-base font-extrabold text-orange-600">
                ฿${item.price}
                ${item.hasOptions ? '<span class="text-[10px] text-slate-400 font-normal ml-0.5">เริ่มต้น</span>' : ''}
              </div>
            </div>

            <div>
              ${item.hasOptions ? `
                <button 
                  onclick="openOptionModal('${item.id}')"
                  class="btn-primary px-3 py-1.5 rounded-xl font-medium text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <span>เลือก</span>
                  <i class="fa-solid fa-sliders text-[10px]"></i>
                </button>
              ` : inCartQty > 0 ? `
                <div class="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200">
                  <button onclick="decrementCartItemById('${item.id}')" class="qty-btn bg-white text-slate-700 hover:bg-slate-50 shadow-xs">
                    <i class="fa-solid fa-minus text-[10px]"></i>
                  </button>
                  <span class="text-xs font-bold text-slate-800 px-1.5 min-w-[20px] text-center">${inCartQty}</span>
                  <button onclick="quickAddToCart('${item.id}')" class="qty-btn bg-orange-600 text-white hover:bg-orange-500 shadow-xs">
                    <i class="fa-solid fa-plus text-[10px]"></i>
                  </button>
                </div>
              ` : `
                <button 
                  onclick="quickAddToCart('${item.id}')"
                  class="border border-orange-200 bg-orange-50/70 hover:bg-orange-600 text-orange-600 hover:text-white px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all"
                >
                  <i class="fa-solid fa-plus text-[10px]"></i>
                  <span>สั่ง</span>
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ==========================================
// 3. Cart & Option Modal Management
// ==========================================
function quickAddToCart(itemId) {
  const item = state.menuItems.find(i => i.id === itemId);
  if (!item) return;

  if (item.hasOptions) {
    openOptionModal(itemId);
    return;
  }

  const existingIndex = state.cart.findIndex(c => c.id === itemId && (!c.selectedOption || c.selectedOption === ""));
  if (existingIndex > -1) {
    state.cart[existingIndex].qty += 1;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      price: item.price,
      qty: 1,
      selectedOption: "",
      note: ""
    });
  }

  saveCart();
  updateCartUI();
  renderMenu();
  showToast(`เพิ่ม "${item.name}" ลงในตะกร้าแล้ว`, "success");
}

function decrementCartItemById(itemId) {
  const existingIndex = state.cart.findIndex(c => c.id === itemId);
  if (existingIndex > -1) {
    if (state.cart[existingIndex].qty > 1) {
      state.cart[existingIndex].qty -= 1;
    } else {
      state.cart.splice(existingIndex, 1);
    }
  }
  saveCart();
  updateCartUI();
  renderMenu();
}

function openOptionModal(itemId) {
  const item = state.menuItems.find(i => i.id === itemId);
  if (!item) return;

  const modal = document.getElementById("optionModal");
  const modalTitle = document.getElementById("optionModalTitle");
  const optionsContainer = document.getElementById("optionListContainer");
  const noteInput = document.getElementById("optionModalNote");

  modalTitle.textContent = item.name;
  noteInput.value = "";

  if (item.options && Array.isArray(item.options)) {
    optionsContainer.innerHTML = item.options.map((opt, index) => `
      <label class="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-orange-400 cursor-pointer transition-colors">
        <div class="flex items-center gap-2.5">
          <input type="radio" name="modalMeatOption" value="${opt.name}" data-price="${opt.price}" ${index === 0 ? 'checked' : ''} class="text-orange-600 focus:ring-orange-500">
          <span class="text-xs font-semibold text-slate-800">${opt.name}</span>
        </div>
        <span class="text-xs font-bold text-orange-600">฿${opt.price}</span>
      </label>
    `).join("");
  } else {
    optionsContainer.innerHTML = `
      <div class="p-3 text-xs text-slate-500 bg-slate-50 rounded-xl">
        ไม่มีตัวเลือกเพิ่มเติมสำหรับเมนูนี้ สามารถระบุหมายเหตุพิเศษได้ด้านล่าง
      </div>
    `;
  }

  const confirmBtn = document.getElementById("confirmOptionAddBtn");
  confirmBtn.onclick = () => {
    const selectedRadio = document.querySelector('input[name="modalMeatOption"]:checked');
    const selectedOption = selectedRadio ? selectedRadio.value : "";
    const finalPrice = selectedRadio ? parseFloat(selectedRadio.dataset.price) : item.price;
    const note = noteInput.value.trim();

    const existingIndex = state.cart.findIndex(c => 
      c.id === item.id && c.selectedOption === selectedOption && c.note === note
    );

    if (existingIndex > -1) {
      state.cart[existingIndex].qty += 1;
    } else {
      state.cart.push({
        id: item.id,
        name: item.name,
        price: finalPrice,
        qty: 1,
        selectedOption: selectedOption,
        note: note
      });
    }

    closeOptionModal();
    saveCart();
    updateCartUI();
    renderMenu();
    showToast(`เพิ่ม "${item.name} (${selectedOption || 'ปกติ'})" แล้ว`, "success");
  };

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeOptionModal() {
  const modal = document.getElementById("optionModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function updateCartUI() {
  const totalCount = state.cart.reduce((sum, item) => sum + item.qty, 0);
  const itemsSubtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  const floatingBar = document.getElementById("floatingCartBar");
  const floatingCount = document.getElementById("floatingCartCount");
  const floatingTotal = document.getElementById("floatingCartTotal");

  if (totalCount > 0) {
    floatingBar.classList.remove("translate-y-28");
    floatingBar.classList.add("translate-y-0");
    if (floatingCount) floatingCount.textContent = totalCount;
    if (floatingTotal) floatingTotal.textContent = `฿${itemsSubtotal.toLocaleString()}`;
  } else {
    floatingBar.classList.add("translate-y-28");
    floatingBar.classList.remove("translate-y-0");
  }

  renderCartDrawer();
}

function renderCartDrawer() {
  const container = document.getElementById("cartItemsList");
  const emptyState = document.getElementById("cartEmptyState");
  const checkoutSection = document.getElementById("cartCheckoutSection");
  if (!container) return;

  if (state.cart.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.classList.remove("hidden");
    if (checkoutSection) checkoutSection.classList.add("hidden");
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");
  if (checkoutSection) checkoutSection.classList.remove("hidden");

  container.innerHTML = state.cart.map((item, index) => `
    <div class="p-3 rounded-2xl bg-white border border-slate-200 flex flex-col gap-2 shadow-xs">
      <div class="flex items-start justify-between">
        <div>
          <div class="font-bold text-xs text-slate-800 flex items-center gap-1.5">
            <span>${item.name}</span>
            ${item.selectedOption ? `<span class="text-[10px] font-normal px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">(${item.selectedOption})</span>` : ''}
          </div>
          <div class="text-xs text-orange-600 font-bold mt-0.5">
            ฿${item.price}
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="updateCartQty(${index}, -1)" class="qty-btn bg-slate-100 text-slate-700 hover:bg-slate-200">
            <i class="fa-solid fa-minus text-[10px]"></i>
          </button>
          <span class="text-xs font-bold text-slate-800 w-5 text-center">${item.qty}</span>
          <button onclick="updateCartQty(${index}, 1)" class="qty-btn bg-orange-600 text-white hover:bg-orange-500">
            <i class="fa-solid fa-plus text-[10px]"></i>
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
        <input 
          type="text" 
          placeholder="หมายเหตุพิเศษ (เช่น ไม่เผ็ด, ไม่ใส่ผัก)..." 
          value="${item.note || ''}" 
          onchange="updateItemNote(${index}, this.value)"
          class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 placeholder-slate-400 text-xs w-full mr-2 focus:outline-none focus:border-orange-500"
        />
        <span class="font-extrabold text-slate-800 whitespace-nowrap">
          ฿${(item.price * item.qty).toLocaleString()}
        </span>
      </div>
    </div>
  `).join("");

  calculateTotals();
  updatePromptPayPreview();
}

function updateCartQty(index, delta) {
  if (state.cart[index]) {
    state.cart[index].qty += delta;
    if (state.cart[index].qty <= 0) {
      state.cart.splice(index, 1);
    }
  }
  saveCart();
  updateCartUI();
  renderMenu();
}

function updateItemNote(index, note) {
  if (state.cart[index]) {
    state.cart[index].note = note.trim();
    saveCart();
  }
}

function saveCart() {
  localStorage.setItem("naijek_cart", JSON.stringify(state.cart));
}

function loadSavedCart() {
  try {
    const saved = localStorage.getItem("naijek_cart");
    if (saved) {
      state.cart = JSON.parse(saved);
      updateCartUI();
    }
  } catch (e) {
    state.cart = [];
  }
}

function clearCart() {
  state.cart = [];
  saveCart();
  updateCartUI();
  renderMenu();
}

// ==========================================
// 4. Fulfillment Type & Delivery Distance
// ==========================================
function setFulfillmentType(type) {
  state.fulfillmentType = type;

  const btnTakeaway = document.getElementById("btnModeTakeaway");
  const btnDelivery = document.getElementById("btnModeDelivery");
  const takeawaySection = document.getElementById("takeawayOptionsSection");
  const deliverySection = document.getElementById("deliveryOptionsSection");

  if (type === "takeaway") {
    btnTakeaway.classList.add("active");
    btnDelivery.classList.remove("active");
    takeawaySection.classList.remove("hidden");
    deliverySection.classList.add("hidden");
    state.deliveryFee = 0;
  } else {
    btnTakeaway.classList.remove("active");
    btnDelivery.classList.add("active");
    takeawaySection.classList.add("hidden");
    deliverySection.classList.remove("hidden");
    recalculateDeliveryFee();
  }

  calculateTotals();
  updatePromptPayPreview();
}

function selectPickupTime(timeText) {
  state.pickupTime = timeText;
  const timeBtns = document.querySelectorAll(".pickup-time-btn");
  timeBtns.forEach(btn => {
    if (btn.dataset.time === timeText) {
      btn.classList.add("bg-orange-600", "text-white", "font-bold");
      btn.classList.remove("bg-white", "text-slate-600");
    } else {
      btn.classList.remove("bg-orange-600", "text-white", "font-bold");
      btn.classList.add("bg-white", "text-slate-600");
    }
  });

  const customInput = document.getElementById("customPickupTime");
  if (timeText !== "custom" && customInput) {
    customInput.value = "";
  }
}

function requestCurrentGps() {
  const gpsStatusEl = document.getElementById("gpsStatusText");
  const distanceInput = document.getElementById("deliveryDistanceInput");
  const btnGps = document.getElementById("btnGetGps");

  if (!navigator.geolocation) {
    showToast("อุปกรณ์ไม่รองรับ GPS กรุณากรอกระยะทางโดยตรง", "warning");
    return;
  }

  if (gpsStatusEl) {
    gpsStatusEl.textContent = "กำลังค้นหาพิกัดดาวเทียม...";
    gpsStatusEl.classList.remove("hidden");
  }
  if (btnGps) {
    btnGps.disabled = true;
    btnGps.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>กำลังระบุพิกัด...</span>`;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      state.customerGps = { lat: userLat, lng: userLng };

      const shop = APP_CONFIG.SHOP_COORDS;
      const distKm = calculateHaversineDistance(shop.lat, shop.lng, userLat, userLng);
      state.deliveryDistanceKm = parseFloat(distKm.toFixed(1));

      if (distanceInput) distanceInput.value = state.deliveryDistanceKm;
      if (gpsStatusEl) {
        gpsStatusEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600"></i> ปักหมุดสำเร็จ: ${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
      }

      recalculateDeliveryFee();
      calculateTotals();
      updatePromptPayPreview();
      showToast(`ระบุพิกัดสำเร็จ ระยะทางประมาณ ${state.deliveryDistanceKm} กม.`, "success");

      if (btnGps) {
        btnGps.disabled = false;
        btnGps.innerHTML = `<i class="fa-solid fa-location-crosshairs text-orange-600"></i> <span>ปักหมุดตำแหน่งปัจจุบันอีกครั้ง</span>`;
      }
    },
    (err) => {
      console.warn("GPS error:", err);
      if (gpsStatusEl) {
        gpsStatusEl.innerHTML = `<span class="text-rose-500"><i class="fa-solid fa-triangle-exclamation"></i> ไม่สามารถเข้าถึง GPS ได้ (กรอกระยะทางกิโลเมตรด้านล่างได้ครับ)</span>`;
      }
      if (btnGps) {
        btnGps.disabled = false;
        btnGps.innerHTML = `<i class="fa-solid fa-location-crosshairs text-orange-600"></i> <span>ลองปักหมุดอีกครั้ง</span>`;
      }
      showToast("กรุณาเปิดการเข้าถึงตำแหน่ง หรือกรอกระยะทางเอง", "warning");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function recalculateDeliveryFee() {
  const feeDisplay = document.getElementById("deliveryFeeBreakdown");
  const distanceInput = document.getElementById("deliveryDistanceInput");
  
  if (distanceInput && distanceInput.value !== "") {
    state.deliveryDistanceKm = parseFloat(distanceInput.value) || 0;
  }

  const freeKm = APP_CONFIG.DELIVERY_RULES.freeDistanceKm;
  const ratePerKm = APP_CONFIG.DELIVERY_RULES.ratePerKmAfter;
  const dist = state.deliveryDistanceKm;

  if (state.fulfillmentType !== "delivery") {
    state.deliveryFee = 0;
    return;
  }

  if (dist <= 0) {
    state.deliveryFee = 0;
    if (feeDisplay) {
      feeDisplay.innerHTML = `<span class="text-slate-400">กรุณาปักหมุด GPS หรือกรอกระยะทาง</span>`;
    }
    return;
  }

  if (dist <= freeKm) {
    state.deliveryFee = 0;
    if (feeDisplay) {
      feeDisplay.innerHTML = `
        <div class="text-emerald-600 font-bold text-xs flex items-center gap-1">
          <i class="fa-solid fa-gift"></i>
          <span>ระยะ ${dist} กม. (ส่งฟรี 0 บาท!) 🎉</span>
        </div>
      `;
    }
  } else {
    const extraKm = Math.ceil(dist - freeKm);
    state.deliveryFee = extraKm * ratePerKm;
    if (feeDisplay) {
      feeDisplay.innerHTML = `
        <div class="text-slate-600 text-xs">
          ระยะ <span class="font-bold text-slate-800">${dist} กม.</span> 
          (ฟรี 3 กม. + เกิน ${extraKm} กม. x 5 บ. = <span class="font-bold text-orange-600">${state.deliveryFee} บาท</span>)
        </div>
      `;
    }
  }
}

function calculateTotals() {
  const itemsSubtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryFee = state.fulfillmentType === "delivery" ? state.deliveryFee : 0;
  const grandTotal = itemsSubtotal + deliveryFee;

  const subtotalEl = document.getElementById("drawerSubtotal");
  const deliveryFeeEl = document.getElementById("drawerDeliveryFee");
  const grandTotalEl = document.getElementById("drawerGrandTotal");

  if (subtotalEl) subtotalEl.textContent = `฿${itemsSubtotal.toLocaleString()}`;
  if (deliveryFeeEl) {
    deliveryFeeEl.textContent = deliveryFee === 0 ? "ฟรี (0฿)" : `฿${deliveryFee.toLocaleString()}`;
  }
  if (grandTotalEl) grandTotalEl.textContent = `฿${grandTotal.toLocaleString()}`;
}

// ==========================================
// 5. PromptPay QR Generator & Payment Selection
// ==========================================

/**
 * คำนวณ CRC16 สำหรับ EMVCo PromptPay QR Code
 */
function crc16(data) {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    let x = ((crc >> 8) ^ data.charCodeAt(i)) & 0xFF;
    x ^= x >> 4;
    crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * สร้าง EMVCo Payload สำหรับ PromptPay เบอร์มือถือ 064-279-3664
 */
function generatePromptPayPayload(mobile, amount) {
  const cleanMobile = mobile.replace(/[^0-9]/g, "");
  const formattedMobile = "0066" + cleanMobile.slice(1);
  const tag29_mobile = "0113" + formattedMobile;
  const tag29_aid = "0016A000000677010111";
  const tag29_val = tag29_aid + tag29_mobile;
  const tag29 = "29" + tag29_val.length.toString().padStart(2, "0") + tag29_val;

  let payload = "000201";
  payload += (amount && amount > 0 ? "010212" : "010211");
  payload += tag29;
  payload += "5303764"; // THB Currency
  if (amount && amount > 0) {
    const amtStr = Number(amount).toFixed(2);
    payload += "54" + amtStr.length.toString().padStart(2, "0") + amtStr;
  }
  payload += "5802TH";
  payload += "6304";
  payload += crc16(payload);
  return payload;
}

function setPaymentMethod(method) {
  state.paymentMethod = method;
  const cardPromptpay = document.getElementById("payMethodPromptpay");
  const cardCash = document.getElementById("payMethodCash");
  const promptpayBox = document.getElementById("promptpayDetailsBox");
  const cashNotice = document.getElementById("cashNoticeBox");

  if (method === "promptpay") {
    cardPromptpay?.classList.add("active");
    cardCash?.classList.remove("active");
    promptpayBox?.classList.remove("hidden");
    cashNotice?.classList.add("hidden");
    updatePromptPayPreview();
  } else {
    cardCash?.classList.add("active");
    cardPromptpay?.classList.remove("active");
    promptpayBox?.classList.add("hidden");
    cashNotice?.classList.remove("hidden");
  }
}

function updatePromptPayPreview() {
  const itemsSubtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryFee = state.fulfillmentType === "delivery" ? state.deliveryFee : 0;
  const grandTotal = itemsSubtotal + deliveryFee;

  const qrImg = document.getElementById("promptpayQrImg");
  const amountDisplay = document.getElementById("promptpayAmountDisplay");

  if (amountDisplay) amountDisplay.textContent = `฿${grandTotal.toLocaleString()}`;

  if (qrImg && grandTotal > 0) {
    const payload = generatePromptPayPayload(APP_CONFIG.PROMPTPAY.mobile, grandTotal);
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(payload)}&margin=8`;
  }
}

function downloadPromptPayQr() {
  const qrImg = document.getElementById("promptpayQrImg");
  if (!qrImg || !qrImg.src) return;

  const a = document.createElement("a");
  a.href = qrImg.src;
  a.download = `PromptPay_NaiJek_${Date.now()}.png`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("เปิด/บันทึกภาพ QR Code เรียบร้อยแล้ว", "success");
}

// ==========================================
// 6. Checkout & Real Order Submission
// ==========================================
async function submitOrder() {
  const customerName = document.getElementById("customerName")?.value.trim();
  const customerPhone = document.getElementById("customerPhone")?.value.trim();
  const orderNotes = document.getElementById("customerOrderNote")?.value.trim();
  const customPickupTime = document.getElementById("customPickupTime")?.value.trim();
  const deliveryAddress = document.getElementById("deliveryAddress")?.value.trim();
  const submitBtn = document.getElementById("btnConfirmOrder");

  if (state.cart.length === 0) {
    showToast("กรุณาเลือกรายการอาหารก่อนสั่งซื้อ", "warning");
    return;
  }

  if (!customerName) {
    showToast("กรุณาระบุชื่อผู้สั่งอาหาร", "warning");
    highlightInput("customerName");
    return;
  }

  if (!customerPhone || customerPhone.length < 9) {
    showToast("กรุณากรอกเบอร์โทรศัพท์ติดต่อ", "warning");
    highlightInput("customerPhone");
    return;
  }

  let destination = "";
  if (state.fulfillmentType === "takeaway") {
    destination = customPickupTime ? `รับเวลา ${customPickupTime}` : state.pickupTime;
  } else {
    if (!deliveryAddress && !state.customerGps) {
      showToast("กรุณาระบุที่อยู่จัดส่ง หรือปักหมุด GPS", "warning");
      highlightInput("deliveryAddress");
      return;
    }
    destination = deliveryAddress || "จัดส่งตามตำแหน่งที่ปักหมุด GPS";
  }

  const itemsSubtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryFee = state.fulfillmentType === "delivery" ? state.deliveryFee : 0;
  const grandTotal = itemsSubtotal + deliveryFee;

  const itemsSummary = state.cart.map(i => {
    const opt = i.selectedOption ? ` (${i.selectedOption})` : "";
    const note = i.note ? ` [${i.note}]` : "";
    return `${i.qty}x ${i.name}${opt}${note} (฿${i.price * i.qty})`;
  }).join("\n");

  const paymentText = state.paymentMethod === "promptpay" 
    ? `สแกน QR พร้อมเพย์ (${APP_CONFIG.PROMPTPAY.formattedMobile})` 
    : "ชำระเงินสด";

  const orderPayload = {
    action: "createOrder",
    lineUserId: state.userProfile.userId || "",
    customerName: customerName,
    customerPhone: customerPhone,
    fulfillmentType: state.fulfillmentType,
    destination: destination,
    gpsLocation: state.customerGps ? `${state.customerGps.lat},${state.customerGps.lng}` : "",
    distanceKm: state.fulfillmentType === "delivery" ? state.deliveryDistanceKm : 0,
    itemsSubtotal: itemsSubtotal,
    deliveryFee: deliveryFee,
    grandTotal: grandTotal,
    paymentMethod: paymentText,
    paymentStatus: state.paymentMethod === "promptpay" ? "โอนผ่านพร้อมเพย์" : "ชำระเงินสด",
    itemsSummary: itemsSummary,
    customerNote: orderNotes,
    items: state.cart
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>กำลังบันทึกคำสั่งซื้อลงระบบ...</span>`;
  }

  try {
    let orderResult = null;

    if (APP_CONFIG.GAS_API_URL) {
      try {
        // ลองส่งผ่าน POST มาตรฐาน
        const response = await fetch(APP_CONFIG.GAS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(orderPayload)
        });
        orderResult = await response.json();
      } catch (postErr) {
        console.warn("POST failed, trying GET fallback:", postErr);
        // Fallback ส่งผ่าน GET เพื่อป้องกันปัญหา CORS บน LINE LIFF
        const getUrl = `${APP_CONFIG.GAS_API_URL}?action=createOrder&data=${encodeURIComponent(JSON.stringify(orderPayload))}`;
        const getRes = await fetch(getUrl);
        orderResult = await getRes.json();
      }
    }

    if (!orderResult || !orderResult.success) {
      throw new Error(orderResult?.message || "GAS did not return success");
    }

    const fullOrder = {
      ...orderPayload,
      orderId: orderResult.orderId,
      queueNo: orderResult.queueNo,
      queueWaitCount: orderResult.queueWaitCount || 1,
      orderDate: new Date().toLocaleString("th-TH"),
      status: "รอยืนยัน"
    };

    saveOrderToHistory(fullOrder);
    state.currentOrder = fullOrder;

    closeCartDrawer();
    clearCart();
    showOrderConfirmationModal(fullOrder);
    sendLineReceipt(fullOrder);
    checkCurrentQueue();

  } catch (error) {
    console.error("Submit order error:", error);
    // หากเกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย ให้สร้างออเดอร์ในเครื่องเพื่อไม่ให้ลูกค้าเสียข้อมูล
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randSeq = Math.floor(Math.random() * 50) + 1;
    const fallbackOrderId = `JK-${dateStr}-${("000" + randSeq).slice(-3)}`;
    const fallbackQueue = `Q${("0" + randSeq).slice(-2)}`;

    const fallbackOrder = {
      ...orderPayload,
      orderId: fallbackOrderId,
      queueNo: fallbackQueue,
      queueWaitCount: 1,
      orderDate: new Date().toLocaleString("th-TH"),
      status: "รอยืนยัน"
    };

    saveOrderToHistory(fallbackOrder);
    state.currentOrder = fallbackOrder;

    closeCartDrawer();
    clearCart();
    showOrderConfirmationModal(fallbackOrder);
    showToast("บันทึกคำสั่งซื้อแล้ว (โทรยืนยันกับร้านที่ 064-279-3664)", "info");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>ยืนยันการสั่งซื้อ</span> <i class="fa-solid fa-arrow-right"></i>`;
    }
  }
}

async function sendLineReceipt(order) {
  if (window.liff && liff.isLoggedIn() && liff.isInClient()) {
    try {
      const modeText = order.fulfillmentType === "delivery" ? "🛵 เดลิเวอรี" : "🛍️ มารับที่ร้าน";
      const messageText = 
        `🍲 [คำสั่งซื้อร้านข้าวต้มนายเจ๊ก]\n` +
        `🔖 เลขที่: ${order.orderId}\n` +
        `🔥 คิวที่: ${order.queueNo}\n` +
        `👤 คุณ: ${order.customerName} (${order.customerPhone})\n` +
        `📍 รูปแบบ: ${modeText}\n` +
        `⏰ นัดรับ/ที่อยู่: ${order.destination}\n` +
        `💳 วิธีชำระ: ${order.paymentMethod}\n\n` +
        `📋 รายการอาหาร:\n${order.itemsSummary}\n\n` +
        `💵 รวมอาหาร: ฿${order.itemsSubtotal}\n` +
        `🛵 ค่าส่ง: ฿${order.deliveryFee}\n` +
        `💰 ยอดชำระสุทธิ: ฿${order.grandTotal}\n\n` +
        `โทรติดต่อร้าน: 064-279-3664\nขอบคุณมากครับ! 🙏`;

      await liff.sendMessages([{ type: "text", text: messageText }]);
    } catch (e) {
      console.warn("Could not send LIFF message:", e);
    }
  }
}

// ==========================================
// 7. Confirmation Modal & Tracking Tab
// ==========================================
function showOrderConfirmationModal(order) {
  const modal = document.getElementById("orderConfirmModal");
  if (!modal) return;

  document.getElementById("confirmOrderId").textContent = order.orderId;
  document.getElementById("confirmQueueNo").textContent = order.queueNo;
  document.getElementById("confirmCustomer").textContent = `${order.customerName} (${order.customerPhone})`;
  document.getElementById("confirmMode").textContent = order.fulfillmentType === "delivery" ? "🛵 เดลิเวอรี" : "🛍️ รับที่ร้าน";
  document.getElementById("confirmDestination").textContent = order.destination;
  document.getElementById("confirmPaymentMethod").textContent = order.paymentMethod;
  document.getElementById("confirmGrandTotal").textContent = `฿${order.grandTotal.toLocaleString()}`;

  // If PromptPay, show QR in confirmation
  const qrSection = document.getElementById("confirmPromptPaySection");
  const qrImg = document.getElementById("confirmPromptPayQrImg");
  if (order.paymentMethod.indexOf("พร้อมเพย์") > -1) {
    if (qrSection) qrSection.classList.remove("hidden");
    if (qrImg) {
      const payload = generatePromptPayPayload(APP_CONFIG.PROMPTPAY.mobile, order.grandTotal);
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(payload)}&margin=8`;
    }
  } else {
    if (qrSection) qrSection.classList.add("hidden");
  }

  document.getElementById("confirmItemsList").innerHTML = order.items.map(i => `
    <div class="flex justify-between text-xs py-1 border-b border-slate-100">
      <span class="text-slate-600">${i.qty}x ${i.name} ${i.selectedOption ? `(${i.selectedOption})` : ''}</span>
      <span class="font-bold text-orange-600">฿${i.price * i.qty}</span>
    </div>
  `).join("");

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeOrderConfirmModal() {
  const modal = document.getElementById("orderConfirmModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }
}

function saveOrderToHistory(order) {
  try {
    let history = JSON.parse(localStorage.getItem("naijek_history") || "[]");
    history.unshift(order);
    if (history.length > 25) history = history.slice(0, 25);
    localStorage.setItem("naijek_history", JSON.stringify(history));
  } catch (e) {
    console.warn("Save history error:", e);
  }
}

function switchTab(tabId) {
  state.activeTab = tabId;
  const menuView = document.getElementById("viewMenu");
  const trackView = document.getElementById("viewTrack");
  const tabMenuBtn = document.getElementById("tabBtnMenu");
  const tabTrackBtn = document.getElementById("tabBtnTrack");

  if (tabId === "menu") {
    menuView?.classList.remove("hidden");
    trackView?.classList.add("hidden");
    tabMenuBtn?.classList.add("text-orange-600", "border-orange-600");
    tabMenuBtn?.classList.remove("text-slate-400", "border-transparent");
    tabTrackBtn?.classList.remove("text-orange-600", "border-orange-600");
    tabTrackBtn?.classList.add("text-slate-400", "border-transparent");
  } else {
    menuView?.classList.add("hidden");
    trackView?.classList.remove("hidden");
    tabTrackBtn?.classList.add("text-orange-600", "border-orange-600");
    tabTrackBtn?.classList.remove("text-slate-400", "border-transparent");
    tabMenuBtn?.classList.remove("text-orange-600", "border-orange-600");
    tabMenuBtn?.classList.add("text-slate-400", "border-transparent");
    renderTrackView();
    // ดึงสถานะออเดอร์ล่าสุดจาก Google Sheets ทันทีที่เปิดแท็บ
    syncCustomerOrderStatus(false);
  }
}

/**
 * ดึงสถานะออเดอร์ล่าสุดจาก Google Sheets แบบ Real-time
 */
async function syncCustomerOrderStatus(manual = false) {
  if (!APP_CONFIG.GAS_API_URL) return;

  const refreshBtn = document.getElementById("manualTrackSyncBtn");
  if (manual && refreshBtn) {
    refreshBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-orange-600"></i> <span>กำลังอัปเดต...</span>`;
  }

  try {
    let history = JSON.parse(localStorage.getItem("naijek_history") || "[]");
    if (history.length === 0) return;

    const res = await fetch(`${APP_CONFIG.GAS_API_URL}?action=getOrders`);
    const data = await res.json();

    if (data && data.success && Array.isArray(data.orders)) {
      let hasChange = false;
      const usedRemoteIndices = new Set();

      // ตรวจสอบออเดอร์ของลูกค้าและอัปเดตสถานะให้ตรงกับ Google Sheets
      history.forEach((localOrder) => {
        let remoteOrder = null;
        let matchedIdx = -1;

        // 1. ค้นหาแถวที่ตรงกับ orderId และ orderDate หรือ grandTotal ที่ยังไม่ได้ถูกจับคู่
        for (let i = 0; i < data.orders.length; i++) {
          if (usedRemoteIndices.has(i)) continue;
          const r = data.orders[i];
          if (r.orderId === localOrder.orderId) {
            if (localOrder.orderDate && r.orderDate && (r.orderDate === localOrder.orderDate || localOrder.orderDate.includes(r.orderDate) || r.orderDate.includes(localOrder.orderDate))) {
              remoteOrder = r;
              matchedIdx = i;
              break;
            }
          }
        }

        // 2. ถ้ายังไม่พบ ให้จับคู่กับแถวที่มี orderId เดียวกันที่ยังไม่ถูกใช้
        if (!remoteOrder) {
          for (let i = 0; i < data.orders.length; i++) {
            if (usedRemoteIndices.has(i)) continue;
            const r = data.orders[i];
            if (r.orderId === localOrder.orderId) {
              remoteOrder = r;
              matchedIdx = i;
              break;
            }
          }
        }

        // 3. Fallback
        if (!remoteOrder) {
          remoteOrder = data.orders.find(r => r.orderId === localOrder.orderId);
        }

        if (matchedIdx !== -1) {
          usedRemoteIndices.add(matchedIdx);
        }

        if (remoteOrder) {
          const remoteStatus = (remoteOrder.orderStatus || remoteOrder.status || "").trim();
          if (remoteStatus && remoteStatus !== localOrder.status) {
            localOrder.status = remoteStatus;
            localOrder.orderStatus = remoteStatus;
            hasChange = true;
          }
          if (remoteOrder.queueNo && remoteOrder.queueNo !== localOrder.queueNo) {
            localOrder.queueNo = remoteOrder.queueNo;
            hasChange = true;
          }
        }
      });

      if (hasChange || manual) {
        localStorage.setItem("naijek_history", JSON.stringify(history));
        renderTrackView();
        if (manual) {
          showToast("อัปเดตสถานะออเดอร์ล่าสุดเรียบร้อยแล้ว", "success");
        }
      }
    }
  } catch (err) {
    console.warn("Sync customer status error:", err);
  } finally {
    if (manual && refreshBtn) {
      refreshBtn.innerHTML = `<i class="fa-solid fa-rotate text-orange-600"></i> <span>อัปเดตสถานะเดี๋ยวนี้</span>`;
    }
  }
}

function renderTrackView() {
  const container = document.getElementById("trackOrdersList");
  if (!container) return;

  const history = JSON.parse(localStorage.getItem("naijek_history") || "[]");
  if (history.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 px-4 bg-white rounded-3xl border border-slate-200 shadow-xs">
        <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 text-2xl mb-3">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <p class="text-slate-700 font-bold text-sm">ยังไม่มีประวัติการสั่งอาหาร</p>
        <p class="text-xs text-slate-400 mt-1">รายการอาหารที่คุณสั่งจะปรากฏที่นี่</p>
        <button onclick="switchTab('menu')" class="mt-4 px-5 py-2.5 bg-orange-600 text-white font-bold text-xs rounded-xl shadow-xs">
          เริ่มสั่งอาหารเลย
        </button>
      </div>
    `;
    return;
  }

  // แถบด้านบนสำหรับกดรีเฟรชสถานะทันที
  const topSyncBar = `
    <div class="flex items-center justify-between mb-3 px-1">
      <span class="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        <i class="fa-solid fa-circle text-[8px] text-emerald-500 animate-pulse"></i> ซิงค์สถานะสดจากร้าน
      </span>
      <button 
        id="manualTrackSyncBtn"
        onclick="syncCustomerOrderStatus(true)" 
        class="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1.5 bg-orange-50 px-2.5 py-1 rounded-xl border border-orange-200 transition-colors shadow-2xs"
      >
        <i class="fa-solid fa-rotate text-[11px]"></i>
        <span>อัปเดตสถานะเดี๋ยวนี้</span>
      </button>
    </div>
  `;

  const orderCards = history.map(order => {
    const rawStatus = (order.orderStatus || order.status || "รอยืนยัน").trim();

    const isNew = rawStatus === "รอยืนยัน";
    const isCooking = rawStatus === "กำลังปรุง";
    const isReady = rawStatus === "พร้อมส่ง/รับ" || rawStatus === "พร้อมส่ง" || rawStatus === "พร้อมรับ";
    const isDone = rawStatus === "สำเร็จ";
    const isCancelled = rawStatus === "ยกเลิก";

    // กำหนดสถานะ 4 ขั้นตอนที่ตรงกับร้านค้า 100%
    // 1. รอยืนยัน (ส่งออเดอร์แล้ว) -> 2. กำลังปรุง (ร้านรับและเริ่มทำ) -> 3. พร้อมรับ/ส่ง (เสร็จแล้ว) -> 4. สำเร็จ (เสร็จสิ้น)
    let progressPercent = 0;
    if (isCooking) progressPercent = 33.3;
    else if (isReady) progressPercent = 66.6;
    else if (isDone) progressPercent = 100;

    let statusBadge = `<span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 border border-orange-200">รอยืนยัน ⏳</span>`;
    let statusNotice = `
      <div class="mt-3 p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-800 flex items-center gap-2">
        <i class="fa-solid fa-hourglass-half text-orange-600 text-sm"></i>
        <span><strong>ส่งออเดอร์แล้ว:</strong> ร้านได้รับรายการแล้ว รอยืนยันคิวเข้าเตาปรุงครับ</span>
      </div>
    `;

    if (isCooking) {
      statusBadge = `<span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-sky-100 text-sky-800 border border-sky-300">กำลังปรุงอาหาร 🔥</span>`;
      statusNotice = `
        <div class="mt-3 p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-900 flex items-center gap-2">
          <i class="fa-solid fa-fire-burner text-sky-600 text-sm animate-bounce"></i>
          <span><strong>พ่อครัวกำลังปรุง:</strong> ร้านรับออเดอร์แล้ว กำลังปรุงอาหารสดใหม่ให้คุณอยู่ครับ!</span>
        </div>
      `;
    } else if (isReady) {
      statusBadge = `<span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">พร้อมรับ/ส่งแล้ว! 📦</span>`;
      statusNotice = `
        <div class="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center gap-2 shadow-xs">
          <i class="fa-solid fa-box-open text-emerald-600 text-sm"></i>
          <span><strong>อาหารปรุงเสร็จแล้ว:</strong> พร้อมให้รับที่หน้าร้านหรือเตรียมจัดส่งครับ</span>
        </div>
      `;
    } else if (isDone) {
      statusBadge = `<span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">สำเร็จเรียบร้อย ✅</span>`;
      statusNotice = `
        <div class="mt-3 p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <i class="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
          <span><strong>ออเดอร์เสร็จสมบูรณ์:</strong> ขอบคุณที่อุดหนุนร้านข้าวต้มนายเจ๊กครับ ทานให้อร่อยนะครับ 🙏</span>
        </div>
      `;
    } else if (isCancelled) {
      statusBadge = `<span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700 border border-rose-200">ยกเลิกแล้ว ❌</span>`;
      statusNotice = `
        <div class="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <i class="fa-solid fa-circle-xmark text-rose-600 text-sm"></i>
          <span>ออเดอร์นี้ถูกยกเลิกแล้ว สอบถามเพิ่มเติม โทร 064-279-3664</span>
        </div>
      `;
    }

    // กำหนดสีและไอคอนทั้ง 4 สเต็ป
    // Step 1: รอยืนยัน
    const s1Class = isCooking || isReady || isDone
      ? "bg-emerald-600 text-white" 
      : isNew 
        ? "bg-orange-500 text-white font-bold ring-4 ring-orange-100 shadow-xs" 
        : "bg-slate-200 text-slate-500";
    const s1Icon = isCooking || isReady || isDone 
      ? '<i class="fa-solid fa-check text-[10px]"></i>' 
      : '<i class="fa-solid fa-hourglass-half text-[10px]"></i>';

    // Step 2: กำลังปรุง
    const s2Class = isReady || isDone 
      ? "bg-emerald-600 text-white" 
      : isCooking 
        ? "bg-sky-600 text-white font-bold ring-4 ring-sky-100 shadow-xs" 
        : "bg-slate-100 text-slate-400 border border-slate-200";
    const s2Icon = isReady || isDone 
      ? '<i class="fa-solid fa-check text-[10px]"></i>' 
      : '<i class="fa-solid fa-fire-burner text-[10px]"></i>';

    // Step 3: พร้อมรับ/ส่ง
    const s3Class = isDone 
      ? "bg-emerald-600 text-white" 
      : isReady 
        ? "bg-emerald-600 text-white font-bold ring-4 ring-emerald-100 shadow-xs" 
        : "bg-slate-100 text-slate-400 border border-slate-200";
    const s3Icon = isDone 
      ? '<i class="fa-solid fa-check text-[10px]"></i>' 
      : '<i class="fa-solid fa-box text-[10px]"></i>';

    // Step 4: สำเร็จ
    const s4Class = isDone 
      ? "bg-emerald-600 text-white font-bold ring-4 ring-emerald-100 shadow-xs" 
      : "bg-slate-100 text-slate-400 border border-slate-200";
    const s4Icon = isDone 
      ? '<i class="fa-solid fa-check-double text-[10px]"></i>' 
      : '<i class="fa-solid fa-flag-checkered text-[9px]"></i>';

    return `
      <div class="minimal-card rounded-2xl p-4 mb-3.5 border border-slate-200 shadow-xs">
        <div class="flex items-start justify-between">
          <div>
            <span class="text-[11px] font-mono text-slate-400">เลขที่ ${order.orderId}</span>
            <div class="text-lg font-black text-slate-800 flex items-center gap-2 mt-0.5">
              <span>คิวที่ ${order.queueNo}</span>
              ${statusBadge}
            </div>
            <span class="text-[11px] text-slate-400">${order.orderDate}</span>
          </div>

          <div class="text-right">
            <div class="text-base font-extrabold text-orange-600">฿${Number(order.grandTotal).toLocaleString()}</div>
            <span class="text-[11px] text-slate-500">${order.fulfillmentType === 'delivery' ? '🛵 เดลิเวอรี' : '🛍️ รับที่ร้าน'}</span>
          </div>
        </div>

        <!-- Dynamic Stepper Component (ตรงกับร้านค้า 4 ขั้นตอน) -->
        <div class="mt-3.5 pt-3 border-t border-slate-100">
          <div class="relative flex items-center justify-between text-center text-[10px]">
            <!-- Continuous Progress Line Track -->
            <div class="absolute left-[12%] right-[12%] top-3.5 h-1 bg-slate-100 rounded-full -z-0">
              <div class="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out" style="width: ${progressPercent}%;"></div>
            </div>

            <!-- Step 1: รอยืนยัน -->
            <div class="flex-1 flex flex-col items-center relative z-10">
              <div class="w-7 h-7 rounded-full ${s1Class} flex items-center justify-center mb-1 text-[10px] shadow-2xs transition-colors duration-300">
                ${s1Icon}
              </div>
              <span class="font-bold ${isNew ? 'text-orange-600' : isCooking || isReady || isDone ? 'text-emerald-700' : 'text-slate-500'}">รอยืนยัน</span>
            </div>

            <!-- Step 2: กำลังปรุง -->
            <div class="flex-1 flex flex-col items-center relative z-10">
              <div class="w-7 h-7 rounded-full ${s2Class} flex items-center justify-center mb-1 text-[10px] shadow-2xs transition-colors duration-300">
                ${s2Icon}
              </div>
              <span class="font-bold ${isCooking ? 'text-sky-600' : isReady || isDone ? 'text-emerald-700' : 'text-slate-400'}">กำลังปรุง</span>
            </div>

            <!-- Step 3: พร้อมรับ/ส่ง -->
            <div class="flex-1 flex flex-col items-center relative z-10">
              <div class="w-7 h-7 rounded-full ${s3Class} flex items-center justify-center mb-1 text-[10px] shadow-2xs transition-colors duration-300">
                ${s3Icon}
              </div>
              <span class="font-bold ${isReady ? 'text-emerald-600' : isDone ? 'text-emerald-700' : 'text-slate-400'}">พร้อมรับ/ส่ง</span>
            </div>

            <!-- Step 4: สำเร็จ -->
            <div class="flex-1 flex flex-col items-center relative z-10">
              <div class="w-7 h-7 rounded-full ${s4Class} flex items-center justify-center mb-1 text-[10px] shadow-2xs transition-colors duration-300">
                ${s4Icon}
              </div>
              <span class="font-bold ${isDone ? 'text-emerald-600' : 'text-slate-400'}">สำเร็จ</span>
            </div>
          </div>
        </div>

        <!-- Dynamic Status Notice Banner -->
        ${statusNotice}

        <!-- Details -->
        <div class="mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
          <div class="flex justify-between">
            <span class="text-slate-400">วิธีชำระเงิน:</span>
            <span class="font-semibold text-slate-700">${order.paymentMethod || 'พร้อมเพย์'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">จุดนัดรับ / ที่อยู่:</span>
            <span class="font-semibold text-slate-700 text-right truncate max-w-[200px]">${order.destination}</span>
          </div>
        </div>

        <div class="mt-2.5">
          <a href="tel:0642793664" class="block w-full py-2 text-center text-xs font-bold bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 border border-slate-200 transition-colors">
            <i class="fa-solid fa-phone mr-1 text-orange-600"></i> โทรสอบถามร้าน (064-279-3664)
          </a>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = topSyncBar + orderCards;
}

// ==========================================
// 8. Live Sync Menu & Queue from GAS
// ==========================================
async function syncMenuFromGas() {
  if (!APP_CONFIG.GAS_API_URL) return;

  try {
    const res = await fetch(`${APP_CONFIG.GAS_API_URL}?action=getMenu`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.items) && data.items.length > 0) {
      state.menuItems = data.items;
      renderMenu();
    }
  } catch (e) {
    console.log("Using initial menu data (sync skipped):", e);
  }
}

async function checkCurrentQueue() {
  const queueBadge = document.getElementById("liveQueueBadge");
  if (!queueBadge) return;

  if (!APP_CONFIG.GAS_API_URL) {
    queueBadge.innerHTML = `<i class="fa-solid fa-circle text-[8px] text-emerald-500"></i> เปิดรับออเดอร์ • ทำสดใหม่ทุกจาน`;
    return;
  }

  try {
    const res = await fetch(`${APP_CONFIG.GAS_API_URL}?action=getQueueStatus`);
    const data = await res.json();
    if (data && data.success) {
      if (data.waitingCount === 0) {
        queueBadge.innerHTML = `<i class="fa-solid fa-circle text-[8px] text-emerald-500"></i> ไม่มีคิวรอ สั่งได้เลย`;
      } else {
        queueBadge.innerHTML = `<i class="fa-solid fa-fire text-orange-600"></i> กำลังรอประมาณ ${data.waitingCount} คิว`;
      }
    }
  } catch (e) {
    console.warn("Queue check error:", e);
  }
}

// ==========================================
// 9. Drawer, Toasts & Event Helpers
// ==========================================
function openCartDrawer() {
  const backdrop = document.getElementById("cartDrawerBackdrop");
  const sheet = document.getElementById("cartDrawerSheet");
  if (backdrop && sheet) {
    backdrop.classList.add("active");
    sheet.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  renderCartDrawer();
}

function closeCartDrawer() {
  const backdrop = document.getElementById("cartDrawerBackdrop");
  const sheet = document.getElementById("cartDrawerSheet");
  if (backdrop && sheet) {
    backdrop.classList.remove("active");
    sheet.classList.remove("active");
    document.body.style.overflow = "";
  }
}

function highlightInput(id) {
  const el = document.getElementById(id);
  if (el) {
    el.focus();
    el.classList.add("shake", "border-rose-400");
    setTimeout(() => {
      el.classList.remove("shake");
    }, 600);
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  let bgClass = "bg-white border-slate-200 text-slate-800";
  let icon = "fa-circle-info text-orange-600";

  if (type === "success") {
    bgClass = "bg-emerald-50 border-emerald-300 text-emerald-900";
    icon = "fa-circle-check text-emerald-600";
  } else if (type === "warning") {
    bgClass = "bg-amber-50 border-amber-300 text-amber-900";
    icon = "fa-triangle-exclamation text-amber-600";
  } else if (type === "error") {
    bgClass = "bg-rose-50 border-rose-300 text-rose-900";
    icon = "fa-circle-xmark text-rose-600";
  }

  toast.className = `toast-msg p-3.5 rounded-2xl shadow-lg border text-xs font-semibold flex items-center gap-2.5 mb-2 ${bgClass}`;
  toast.innerHTML = `<i class="fa-solid ${icon} text-sm"></i> <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function setupEventListeners() {
  const searchInput = document.getElementById("menuSearchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      if (clearSearchBtn) {
        if (state.searchQuery) clearSearchBtn.classList.remove("hidden");
        else clearSearchBtn.classList.add("hidden");
      }
      renderMenu();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      state.searchQuery = "";
      clearSearchBtn.classList.add("hidden");
      renderMenu();
    });
  }

  const distanceInput = document.getElementById("deliveryDistanceInput");
  if (distanceInput) {
    distanceInput.addEventListener("input", () => {
      recalculateDeliveryFee();
      calculateTotals();
      updatePromptPayPreview();
    });
  }
}
