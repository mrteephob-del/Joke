/**
 * ===================================================================
 * Application Logic: ร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี
 * เชื่อมโยง LINE LIFF, Google Sheets via Google Apps Script (GAS),
 * ระบบคำนวณค่าส่งตามระยะทาง และตะกร้าสินค้า
 * ===================================================================
 */

// Global Application State
const state = {
  menuItems: [...INITIAL_MENU_ITEMS],
  activeCategory: "all",
  searchQuery: "",
  cart: [],
  fulfillmentType: "takeaway", // "takeaway" หรือ "delivery"
  deliveryDistanceKm: 0,
  deliveryFee: 0,
  pickupTime: "อีก 20 นาที (เร็วที่สุด)",
  customerGps: null, // { lat, lng }
  userProfile: {
    userId: "",
    displayName: "ลูกค้าทั่วไป",
    pictureUrl: "",
    isLineUser: false
  },
  currentOrder: null,
  activeTab: "menu" // "menu" หรือ "track"
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
});

/**
 * เริ่มต้นระบบ LINE LIFF SDK
 */
async function initLiff() {
  const userGreetingEl = document.getElementById("userGreeting");
  const userAvatarEl = document.getElementById("userAvatar");
  const inputName = document.getElementById("customerName");

  if (!window.liff) {
    console.log("LIFF SDK not detected, running in standalone web mode.");
    enableMockOrGuestUser();
    return;
  }

  // หากยังไม่ได้ใส่ LIFF ID ใน config ให้ใช้โหมดทดสอบ
  if (!APP_CONFIG.LIFF_ID || APP_CONFIG.LIFF_ID === "YOUR_LIFF_ID") {
    console.log("LIFF_ID not configured, running in Demo Mode.");
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
      showToast(`ยินดีต้อนรับคุณ ${profile.displayName}`, "success");
    } else {
      // หากเปิดนอก LINE สามารถให้ Login ได้
      if (liff.isInClient()) {
        liff.login();
      } else {
        enableMockOrGuestUser();
      }
    }
  } catch (error) {
    console.error("LIFF Init error:", error);
    enableMockOrGuestUser();
  }
}

function enableMockOrGuestUser() {
  const userGreetingEl = document.getElementById("userGreeting");
  const inputName = document.getElementById("customerName");
  
  state.userProfile = {
    userId: "guest_" + Math.random().toString(36).substring(2, 9),
    displayName: "ลูกค้าทั่วไป",
    pictureUrl: "",
    isLineUser: false
  };

  if (userGreetingEl) userGreetingEl.textContent = "สั่งอาหารออนไลน์";
  if (inputName && !inputName.value) {
    // ปล่อยว่างให้ลูกค้ากรอก หรือเติมชื่อเริ่มต้น
  }
}

// ==========================================
// 2. Menu Rendering & Filtering
// ==========================================
function renderCategories() {
  const container = document.getElementById("categoryContainer");
  if (!container) return;

  container.innerHTML = MENU_CATEGORIES.map(cat => `
    <button 
      class="category-pill whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white flex items-center gap-2 ${state.activeCategory === cat.id ? 'active' : ''}"
      onclick="selectCategory('${cat.id}')"
    >
      <i class="fa-solid ${cat.icon} text-xs"></i>
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

  // Filter by category
  if (state.activeCategory === "popular") {
    items = items.filter(item => item.popular);
  } else if (state.activeCategory !== "all") {
    items = items.filter(item => item.category === state.activeCategory);
  }

  // Filter by search query
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
    // Check if this item is currently in cart
    const cartEntries = state.cart.filter(c => c.id === item.id);
    const inCartQty = cartEntries.reduce((acc, c) => acc + c.qty, 0);

    return `
      <div class="glass-card rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:border-amber-500/40">
        ${item.popular ? `
          <div class="absolute top-2 right-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-[10px] px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
            <i class="fa-solid fa-fire text-[9px]"></i> ยอดนิยม
          </div>
        ` : ''}

        <div>
          <div class="flex items-start justify-between pr-14">
            <h3 class="font-bold text-base text-slate-100 group-hover:text-amber-400 transition-colors">
              ${item.name}
            </h3>
          </div>
          
          <p class="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            ${item.description || "สูตรเด็ดร้านข้าวต้มนายเจ๊ก"}
          </p>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
          <div>
            <span class="text-xs text-slate-400">ราคา</span>
            <div class="text-base font-bold text-amber-400">
              ฿${item.price}
              ${item.hasOptions ? '<span class="text-[10px] text-slate-400 font-normal ml-0.5">เริ่มต้น</span>' : ''}
            </div>
          </div>

          <div>
            ${item.hasOptions ? `
              <button 
                onclick="openOptionModal('${item.id}')"
                class="btn-add bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 rounded-xl font-medium text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20"
              >
                <span>เลือก</span>
                <i class="fa-solid fa-sliders text-[10px]"></i>
              </button>
            ` : inCartQty > 0 ? `
              <div class="flex items-center gap-1.5 bg-slate-800 rounded-xl p-1 border border-amber-500/30">
                <button onclick="decrementCartItemById('${item.id}')" class="qty-btn bg-slate-700 text-slate-200 hover:bg-slate-600">
                  <i class="fa-solid fa-minus text-[10px]"></i>
                </button>
                <span class="text-xs font-bold text-amber-400 px-1 min-w-[18px] text-center">${inCartQty}</span>
                <button onclick="quickAddToCart('${item.id}')" class="qty-btn bg-amber-500 text-slate-950 hover:bg-amber-400">
                  <i class="fa-solid fa-plus text-[10px]"></i>
                </button>
              </div>
            ` : `
              <button 
                onclick="quickAddToCart('${item.id}')"
                class="btn-add bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border border-amber-500/40 px-3 py-1.5 rounded-xl font-medium text-xs flex items-center gap-1.5 transition-all"
              >
                <i class="fa-solid fa-plus text-[10px]"></i>
                <span>สั่ง</span>
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ==========================================
// 3. Cart Management & Option Modal
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

/**
 * เปิด Modal ให้เลือกตัวเลือกเนื้อสัตว์/ระดับความเผ็ด
 */
function openOptionModal(itemId) {
  const item = state.menuItems.find(i => i.id === itemId);
  if (!item) return;

  const modal = document.getElementById("optionModal");
  const modalTitle = document.getElementById("optionModalTitle");
  const optionsContainer = document.getElementById("optionListContainer");
  const noteInput = document.getElementById("optionModalNote");

  modalTitle.textContent = item.name;
  noteInput.value = "";

  // Render options radio
  if (item.options && Array.isArray(item.options)) {
    optionsContainer.innerHTML = item.options.map((opt, index) => `
      <label class="flex items-center justify-between p-3 rounded-xl border border-slate-700 bg-slate-800/60 hover:border-amber-500/50 cursor-pointer">
        <div class="flex items-center gap-3">
          <input type="radio" name="modalMeatOption" value="${opt.name}" data-price="${opt.price}" ${index === 0 ? 'checked' : ''} class="text-amber-500 focus:ring-amber-500">
          <span class="text-sm font-medium text-slate-200">${opt.name}</span>
        </div>
        <span class="text-sm font-bold text-amber-400">฿${opt.price}</span>
      </label>
    `).join("");
  } else {
    optionsContainer.innerHTML = `
      <div class="p-3 text-xs text-slate-400 bg-slate-800/40 rounded-xl">
        ไม่มีตัวเลือกเพิ่มเติมสำหรับเมนูนี้ สามารถระบุหมายเหตุพิเศษได้ด้านล่าง
      </div>
    `;
  }

  // Bind Confirm button
  const confirmBtn = document.getElementById("confirmOptionAddBtn");
  confirmBtn.onclick = () => {
    const selectedRadio = document.querySelector('input[name="modalMeatOption"]:checked');
    const selectedOption = selectedRadio ? selectedRadio.value : "";
    const finalPrice = selectedRadio ? parseFloat(selectedRadio.dataset.price) : item.price;
    const note = noteInput.value.trim();

    // Check if exact same item with same option and note exists
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

  // Update floating bar
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

  // Update Drawer content
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
    <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex flex-col gap-2">
      <div class="flex items-start justify-between">
        <div>
          <div class="font-bold text-sm text-slate-100 flex items-center gap-1.5">
            <span>${item.name}</span>
            ${item.selectedOption ? `<span class="text-[11px] font-normal px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">(${item.selectedOption})</span>` : ''}
          </div>
          <div class="text-xs text-amber-400 font-semibold mt-0.5">
            ฿${item.price} / จาน
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="updateCartQty(${index}, -1)" class="qty-btn bg-slate-700 text-slate-200 hover:bg-slate-600">
            <i class="fa-solid fa-minus text-[10px]"></i>
          </button>
          <span class="text-sm font-bold text-slate-100 w-5 text-center">${item.qty}</span>
          <button onclick="updateCartQty(${index}, 1)" class="qty-btn bg-amber-500 text-slate-950 hover:bg-amber-400">
            <i class="fa-solid fa-plus text-[10px]"></i>
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-700/40">
        <input 
          type="text" 
          placeholder="หมายเหตุพิเศษ (เช่น ไม่เผ็ด, เผ็ดมาก)..." 
          value="${item.note || ''}" 
          onchange="updateItemNote(${index}, this.value)"
          class="bg-slate-900/60 border border-slate-700/60 rounded-lg px-2.5 py-1 text-slate-200 placeholder-slate-500 text-xs w-full mr-2 focus:outline-none focus:border-amber-500"
        />
        <span class="font-bold text-slate-100 whitespace-nowrap">
          ฿${(item.price * item.qty).toLocaleString()}
        </span>
      </div>
    </div>
  `).join("");

  calculateTotals();
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

  // Toggle button appearance
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
}

function selectPickupTime(timeText) {
  state.pickupTime = timeText;
  const timeBtns = document.querySelectorAll(".pickup-time-btn");
  timeBtns.forEach(btn => {
    if (btn.dataset.time === timeText) {
      btn.classList.add("bg-amber-500", "text-slate-950", "font-bold");
      btn.classList.remove("bg-slate-800", "text-slate-300");
    } else {
      btn.classList.remove("bg-amber-500", "text-slate-950", "font-bold");
      btn.classList.add("bg-slate-800", "text-slate-300");
    }
  });

  const customInput = document.getElementById("customPickupTime");
  if (timeText !== "custom" && customInput) {
    customInput.value = "";
  }
}

/**
 * ดึงพิกัด GPS อัตโนมัติจาก Browser / LINE In-App Browser
 */
function requestCurrentGps() {
  const gpsStatusEl = document.getElementById("gpsStatusText");
  const distanceInput = document.getElementById("deliveryDistanceInput");
  const btnGps = document.getElementById("btnGetGps");

  if (!navigator.geolocation) {
    showToast("อุปกรณ์ของคุณไม่รองรับการระบุพิกัด GPS กรุณากรอกระยะทางด้วยตนเอง", "warning");
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

      // คำนวณระยะทางจากวงเวียนตาคลี
      const shop = APP_CONFIG.SHOP_COORDS;
      const distKm = calculateHaversineDistance(shop.lat, shop.lng, userLat, userLng);
      state.deliveryDistanceKm = parseFloat(distKm.toFixed(1));

      if (distanceInput) distanceInput.value = state.deliveryDistanceKm;
      if (gpsStatusEl) {
        gpsStatusEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> ปักหมุดสำเร็จ: ละติจูด ${userLat.toFixed(4)}, ลองจิจูด ${userLng.toFixed(4)}`;
      }

      recalculateDeliveryFee();
      calculateTotals();
      showToast(`ระบุพิกัดสำเร็จ ระยะทางประมาณ ${state.deliveryDistanceKm} กม.`, "success");

      if (btnGps) {
        btnGps.disabled = false;
        btnGps.innerHTML = `<i class="fa-solid fa-location-crosshairs text-amber-400"></i> <span>ปักหมุดตำแหน่งปัจจุบันอีกครั้ง</span>`;
      }
    },
    (err) => {
      console.warn("GPS Geolocation error:", err);
      if (gpsStatusEl) {
        gpsStatusEl.innerHTML = `<span class="text-rose-400"><i class="fa-solid fa-triangle-exclamation"></i> ไม่สามารถเข้าถึง GPS ได้ (สามารถกรอกระยะทางกิโลเมตรด้านล่างได้เลยครับ)</span>`;
      }
      if (btnGps) {
        btnGps.disabled = false;
        btnGps.innerHTML = `<i class="fa-solid fa-location-crosshairs text-amber-400"></i> <span>ลองปักหมุดตำแหน่งอีกครั้ง</span>`;
      }
      showToast("กรุณาเปิดการเข้าถึงตำแหน่ง หรือกรอกระยะทางโดยประมาณ", "warning");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/**
 * คำนวณระยะทางบนผิวโลก (Haversine Formula) คืนค่าเป็นกิโลเมตร
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // รัศมีโลกเฉลี่ยในหน่วยกิโลเมตร
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * คำนวณค่าจัดส่งตามเงื่อนไข:
 * - 0 - 3 กม. แรก: ส่งฟรี (0 บาท)
 * - เกิน 3 กม.: กิโลเมตรละ 5 บาท
 */
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
      feeDisplay.innerHTML = `<span class="text-slate-400">กรุณาปักหมุด GPS หรือกรอกระยะทางเพื่อคำนวณค่าจัดส่ง</span>`;
    }
    return;
  }

  if (dist <= freeKm) {
    state.deliveryFee = 0;
    if (feeDisplay) {
      feeDisplay.innerHTML = `
        <div class="text-emerald-400 font-semibold flex items-center gap-1.5">
          <i class="fa-solid fa-gift"></i>
          <span>ระยะทาง ${dist} กม. (อยู่ใน 3 กม. แรก ส่งฟรี 0 บาท!) 🎉</span>
        </div>
      `;
    }
  } else {
    const extraKm = Math.ceil(dist - freeKm);
    state.deliveryFee = extraKm * ratePerKm;
    if (feeDisplay) {
      feeDisplay.innerHTML = `
        <div class="text-slate-300 text-xs">
          ระยะทาง <span class="font-bold text-amber-400">${dist} กม.</span> 
          (ฟรี 3 กม. แรก + ส่วนเกิน ${extraKm} กม. x 5 บ. = <span class="font-bold text-amber-400">${state.deliveryFee} บาท</span>)
        </div>
      `;
    }
  }
}

function calculateTotals() {
  const itemsSubtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const deliveryFee = state.fulfillmentType === "delivery" ? state.deliveryFee : 0;
  const grandTotal = itemsSubtotal + deliveryFee;

  // Elements in Drawer
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
// 5. Checkout & Order Submission
// ==========================================
async function submitOrder() {
  const customerName = document.getElementById("customerName")?.value.trim();
  const customerPhone = document.getElementById("customerPhone")?.value.trim();
  const orderNotes = document.getElementById("customerOrderNote")?.value.trim();
  const customPickupTime = document.getElementById("customPickupTime")?.value.trim();
  const deliveryAddress = document.getElementById("deliveryAddress")?.value.trim();
  const submitBtn = document.getElementById("btnConfirmOrder");

  // Validations
  if (state.cart.length === 0) {
    showToast("กรุณาเลือกรายการอาหารก่อนทำการสั่งซื้อ", "warning");
    return;
  }

  if (!customerName) {
    showToast("กรุณากรอกชื่อผู้สั่งอาหาร", "warning");
    highlightInput("customerName");
    return;
  }

  if (!customerPhone || customerPhone.length < 9) {
    showToast("กรุณากรอกเบอร์โทรศัพท์ติดต่อ 10 หลัก", "warning");
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

  // Format Items text for Google Sheets & Chat
  const itemsSummary = state.cart.map(i => {
    const opt = i.selectedOption ? ` (${i.selectedOption})` : "";
    const note = i.note ? ` [${i.note}]` : "";
    return `${i.qty}x ${i.name}${opt}${note} (฿${i.price * i.qty})`;
  }).join("\n");

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
    itemsSummary: itemsSummary,
    customerNote: orderNotes,
    items: state.cart
  };

  // UI Loading State
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>กำลังส่งคำสั่งซื้อไปยังร้าน...</span>`;
  }

  try {
    let orderResult = null;

    // Send to Google Apps Script API
    if (APP_CONFIG.GAS_API_URL && APP_CONFIG.GAS_API_URL !== "YOUR_GAS_WEB_APP_URL") {
      const response = await fetch(APP_CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(orderPayload)
      });
      orderResult = await response.json();
    } else {
      // Local Simulation Mode (เมื่อยังไม่ได้เชื่อมต่อ GAS เพื่อให้ทดสอบหน้าเว็บได้ทันที)
      await new Promise(r => setTimeout(r, 1200));
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const randSeq = Math.floor(Math.random() * 80) + 1;
      const orderId = `JK-${dateStr}-${("000" + randSeq).slice(-3)}`;
      const queueNo = `Q${("0" + randSeq).slice(-2)}`;

      orderResult = {
        success: true,
        orderId: orderId,
        queueNo: queueNo,
        queueWaitCount: Math.max(1, Math.floor(randSeq / 3)),
        itemsSubtotal: itemsSubtotal,
        deliveryFee: deliveryFee,
        grandTotal: grandTotal,
        message: "สั่งซื้อสำเร็จ (โหมดทดสอบ)"
      };
    }

    if (orderResult && orderResult.success) {
      // Save order to history
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

      // Close cart drawer & open confirmation modal
      closeCartDrawer();
      clearCart();
      showOrderConfirmationModal(fullOrder);

      // Send LINE notification message into chat if opened in LINE
      sendLineReceipt(fullOrder);
    } else {
      showToast(orderResult?.message || "เกิดข้อผิดพลาดในการสั่งซื้อ กรุณาลองใหม่อีกครั้ง", "error");
    }
  } catch (error) {
    console.error("Submit order error:", error);
    showToast("เชื่อมต่อระบบไม่สำเร็จ กรุณาโทรติดต่อร้านโดยตรงที่ 064-279-3664", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>ยืนยันการสั่งซื้อ</span> <i class="fa-solid fa-arrow-right"></i>`;
    }
  }
}

/**
 * ส่งข้อความสรุปออเดอร์กลับเข้าห้องแชท LINE ผ่าน LIFF SDK
 */
async function sendLineReceipt(order) {
  if (window.liff && liff.isLoggedIn() && liff.isInClient()) {
    try {
      const modeText = order.fulfillmentType === "delivery" ? "🛵 เดลิเวอรีส่งถึงที่" : "🛍️ รับเองที่หน้าร้าน";
      const messageText = 
        `🍲 [คำสั่งซื้อร้านข้าวต้มนายเจ๊ก]\n` +
        `🔖 เลขที่: ${order.orderId}\n` +
        `🔥 คิวที่: ${order.queueNo}\n` +
        `👤 ลูกค้า: ${order.customerName} (${order.customerPhone})\n` +
        `📍 รูปแบบ: ${modeText}\n` +
        `⏰ นัดรับ/ที่อยู่: ${order.destination}\n\n` +
        `📋 รายการอาหาร:\n${order.itemsSummary}\n\n` +
        `💵 รวมอาหาร: ฿${order.itemsSubtotal}\n` +
        `🛵 ค่าจัดส่ง: ฿${order.deliveryFee}\n` +
        `💰 ยอดชำระสุทธิ: ฿${order.grandTotal}\n\n` +
        `ขอบคุณที่อุดหนุนร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี ครับ! 🙏`;

      await liff.sendMessages([
        {
          type: "text",
          text: messageText
        }
      ]);
      console.log("LINE receipt message sent successfully!");
    } catch (e) {
      console.warn("Could not send LIFF in-app message:", e);
    }
  }
}

// ==========================================
// 6. Confirmation Modal & Live Tracking
// ==========================================
function showOrderConfirmationModal(order) {
  const modal = document.getElementById("orderConfirmModal");
  if (!modal) return;

  document.getElementById("confirmOrderId").textContent = order.orderId;
  document.getElementById("confirmQueueNo").textContent = order.queueNo;
  document.getElementById("confirmCustomer").textContent = `${order.customerName} (${order.customerPhone})`;
  document.getElementById("confirmMode").textContent = order.fulfillmentType === "delivery" ? "🛵 เดลิเวอรี" : "🛍️ รับที่ร้าน";
  document.getElementById("confirmDestination").textContent = order.destination;
  document.getElementById("confirmGrandTotal").textContent = `฿${order.grandTotal.toLocaleString()}`;
  document.getElementById("confirmItemsList").innerHTML = order.items.map(i => `
    <div class="flex justify-between text-xs py-1 border-b border-slate-800">
      <span class="text-slate-300">${i.qty}x ${i.name} ${i.selectedOption ? `(${i.selectedOption})` : ''}</span>
      <span class="font-bold text-amber-400">฿${i.price * i.qty}</span>
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

// ==========================================
// 7. Order History & Live Tracking Tab
// ==========================================
function saveOrderToHistory(order) {
  try {
    let history = JSON.parse(localStorage.getItem("naijek_history") || "[]");
    history.unshift(order);
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem("naijek_history", JSON.stringify(history));
  } catch (e) {
    console.warn("Error saving history:", e);
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
    tabMenuBtn?.classList.add("text-amber-400", "border-amber-400");
    tabMenuBtn?.classList.remove("text-slate-400", "border-transparent");
    tabTrackBtn?.classList.remove("text-amber-400", "border-amber-400");
    tabTrackBtn?.classList.add("text-slate-400", "border-transparent");
  } else {
    menuView?.classList.add("hidden");
    trackView?.classList.remove("hidden");
    tabTrackBtn?.classList.add("text-amber-400", "border-amber-400");
    tabTrackBtn?.classList.remove("text-slate-400", "border-transparent");
    tabMenuBtn?.classList.remove("text-amber-400", "border-amber-400");
    tabMenuBtn?.classList.add("text-slate-400", "border-transparent");
    renderTrackView();
  }
}

function renderTrackView() {
  const container = document.getElementById("trackOrdersList");
  if (!container) return;

  const history = JSON.parse(localStorage.getItem("naijek_history") || "[]");
  if (history.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 px-4">
        <div class="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500 text-2xl mb-3">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <p class="text-slate-300 font-medium">ยังไม่มีประวัติการสั่งอาหาร</p>
        <p class="text-xs text-slate-500 mt-1">รายการอาหารที่คุณสั่งจะปรากฏที่นี่</p>
        <button onclick="switchTab('menu')" class="mt-4 px-4 py-2 bg-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md">
          เริ่มสั่งอาหารเลย
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(order => `
    <div class="glass-card rounded-2xl p-4 mb-4 border border-slate-700/60">
      <div class="flex items-start justify-between">
        <div>
          <span class="text-xs font-mono text-slate-400">เลขที่ ${order.orderId}</span>
          <div class="text-lg font-black text-amber-400 flex items-center gap-2 mt-0.5">
            <span>คิวที่ ${order.queueNo}</span>
            <span class="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              ${order.status || 'กำลังปรุง'}
            </span>
          </div>
          <span class="text-[11px] text-slate-400">${order.orderDate}</span>
        </div>

        <div class="text-right">
          <div class="text-base font-bold text-slate-100">฿${order.grandTotal.toLocaleString()}</div>
          <span class="text-[11px] text-slate-400">${order.fulfillmentType === 'delivery' ? '🛵 เดลิเวอรี' : '🛍️ รับที่ร้าน'}</span>
        </div>
      </div>

      <!-- Stepper Status -->
      <div class="mt-4 pt-3 border-t border-slate-700/60">
        <div class="flex items-center justify-between text-center text-[10px]">
          <div class="flex-1 text-emerald-400 font-bold flex flex-col items-center">
            <div class="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500 flex items-center justify-center mb-1">
              <i class="fa-solid fa-check text-[10px]"></i>
            </div>
            <span>รับออเดอร์</span>
          </div>
          <div class="flex-1 text-amber-400 font-bold flex flex-col items-center">
            <div class="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center mb-1 pulse-badge">
              <i class="fa-solid fa-fire-burner text-[10px]"></i>
            </div>
            <span>กำลังปรุง</span>
          </div>
          <div class="flex-1 text-slate-400 flex flex-col items-center">
            <div class="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-1">
              <i class="fa-solid fa-box text-[10px]"></i>
            </div>
            <span>พร้อมส่ง/รับ</span>
          </div>
        </div>
      </div>

      <div class="mt-3 pt-2 text-xs text-slate-300 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800">
        <p class="font-medium text-slate-400 text-[11px] mb-1">จุดนัดรับ / ที่อยู่:</p>
        <p>${order.destination}</p>
      </div>

      <div class="mt-3 flex gap-2">
        <a href="tel:${APP_CONFIG.SHOP_COORDS ? '0642793664' : '0642793664'}" class="flex-1 py-2 text-center text-xs font-bold bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 border border-slate-700">
          <i class="fa-solid fa-phone mr-1 text-amber-400"></i> โทรสอบถามร้าน
        </a>
      </div>
    </div>
  `).join("");
}

// ==========================================
// 8. Sync Menu from GAS & Queue Live Status
// ==========================================
async function syncMenuFromGas() {
  if (!APP_CONFIG.GAS_API_URL || APP_CONFIG.GAS_API_URL === "YOUR_GAS_WEB_APP_URL") return;

  try {
    const res = await fetch(`${APP_CONFIG.GAS_API_URL}?action=getMenu`);
    const data = await res.json();
    if (data && data.success && Array.isArray(data.items) && data.items.length > 0) {
      state.menuItems = data.items;
      renderMenu();
      console.log("Menu synced from Google Sheets:", data.items.length, "items");
    }
  } catch (e) {
    console.log("Using local default menu items (GAS sync skipped):", e);
  }
}

async function checkCurrentQueue() {
  const queueBadge = document.getElementById("liveQueueBadge");
  if (!queueBadge) return;

  if (!APP_CONFIG.GAS_API_URL || APP_CONFIG.GAS_API_URL === "YOUR_GAS_WEB_APP_URL") {
    // Default pleasant message
    queueBadge.innerHTML = `<i class="fa-solid fa-circle text-[8px] text-emerald-400 animate-pulse"></i> เปิดรับออเดอร์ • ทำสดใหม่ทุกจาน`;
    return;
  }

  try {
    const res = await fetch(`${APP_CONFIG.GAS_API_URL}?action=getQueueStatus`);
    const data = await res.json();
    if (data && data.success) {
      if (data.waitingCount === 0) {
        queueBadge.innerHTML = `<i class="fa-solid fa-circle text-[8px] text-emerald-400"></i> ไม่มีคิวรอ สั่งได้เลย`;
      } else {
        queueBadge.innerHTML = `<i class="fa-solid fa-fire text-amber-400"></i> กำลังรอประมาณ ${data.waitingCount} คิว`;
      }
    }
  } catch (e) {
    console.warn("Queue check failed:", e);
  }
}

// ==========================================
// 9. Drawer & Modal Helpers
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
    el.classList.add("shake", "border-rose-500");
    setTimeout(() => {
      el.classList.remove("shake");
    }, 600);
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  let bgClass = "bg-slate-800 border-slate-700 text-slate-100";
  let icon = "fa-circle-info text-amber-400";

  if (type === "success") {
    bgClass = "bg-emerald-950/90 border-emerald-500/50 text-emerald-100";
    icon = "fa-circle-check text-emerald-400";
  } else if (type === "warning") {
    bgClass = "bg-amber-950/90 border-amber-500/50 text-amber-100";
    icon = "fa-triangle-exclamation text-amber-400";
  } else if (type === "error") {
    bgClass = "bg-rose-950/90 border-rose-500/50 text-rose-100";
    icon = "fa-circle-xmark text-rose-400";
  }

  toast.className = `toast-msg p-3.5 rounded-2xl shadow-xl border backdrop-blur-md text-xs font-medium flex items-center gap-2.5 mb-2.5 ${bgClass}`;
  toast.innerHTML = `<i class="fa-solid ${icon} text-sm"></i> <span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// 10. Event Listeners Setup
// ==========================================
function setupEventListeners() {
  // Search input
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

  // Distance input manual change
  const distanceInput = document.getElementById("deliveryDistanceInput");
  if (distanceInput) {
    distanceInput.addEventListener("input", () => {
      recalculateDeliveryFee();
      calculateTotals();
    });
  }
}
