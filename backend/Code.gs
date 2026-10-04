/**
 * ===================================================================
 * ระบบ Backend Google Apps Script (GAS) v2
 * สำหรับ: ร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี
 * เชื่อมโยง Google Sheets และ LINE LIFF API
 * รองรับ: ระบบคิวจริง, ระบบชำระเงิน (PromptPay / เงินสด), คอลัมน์รูปภาพอาหาร
 * ===================================================================
 */

const CONFIG = {
  SHOP_NAME: "ร้านข้าวต้มนายเจ๊ก",
  SHOP_PHONE: "064-279-3664",
  PROMPTPAY_NO: "0642793664",
  SHOP_LAT: 15.26352,
  SHOP_LNG: 100.34445,
  FREE_DELIVERY_KM: 3.0,   // 3 กม. แรกส่งฟรี
  EXTRA_FEE_PER_KM: 5.0,   // เกิน 3 กม. คิดกิโลเมตรละ 5 บาท
  SHEET_MENU: "Menu",
  SHEET_ORDERS: "Orders",
  TIMEZONE: "Asia/Bangkok"
};

/**
 * ฟังก์ชัน doGet: ให้บริการอ่านข้อมูล (Read API) และรับออเดอร์ (Fallback)
 */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : "getMenu";
    let responseData = {};

    if (action === "getMenu") {
      responseData = getMenuData();
    } else if (action === "getOrders") {
      const userId = e.parameter.userId || "";
      const phone = e.parameter.phone || "";
      const orderId = e.parameter.orderId || "";
      responseData = getOrdersData(userId, phone, orderId);
    } else if (action === "getQueueStatus") {
      responseData = getQueueStatus();
    } else if (action === "createOrder") {
      // รองรับการส่งคำสั่งซื้อผ่าน GET (ป้องกันปัญหา CORS Redirect บนมือถือ)
      let postData = {};
      if (e.parameter.data) {
        try {
          postData = JSON.parse(e.parameter.data);
        } catch (err) {
          postData = e.parameter;
        }
      } else {
        postData = e.parameter;
      }
      responseData = handleCreateOrder(postData);
    } else if (action === "updateOrderStatus") {
      const orderId = e.parameter.orderId || "";
      const newStatus = e.parameter.newStatus || "";
      responseData = handleUpdateStatus({ orderId: orderId, newStatus: newStatus });
    } else if (action === "setup") {
      initialSetup();
      responseData = { success: true, message: "สร้างฐานข้อมูลและเพิ่มข้อมูลเมนูพร้อมช่องรูปภาพสำเร็จเรียบร้อยแล้ว!" };
    } else {
      responseData = {
        success: true,
        message: "Khao Tom Nai Jek API is online.",
        endpoints: ["getMenu", "getOrders", "getQueueStatus", "createOrder", "updateOrderStatus", "setup"]
      };
    }

    return createJsonResponse(responseData);
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * ฟังก์ชัน doPost: รับคำสั่งซื้อใหม่และอัปเดตสถานะ (Write API)
 */
function doPost(e) {
  try {
    let postData = {};

    if (e && e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (err) {
        postData = e.parameter || {};
      }
    } else if (e && e.parameter) {
      postData = e.parameter;
    }

    const action = postData.action || (e && e.parameter ? e.parameter.action : "createOrder");
    let responseData = {};

    if (action === "createOrder") {
      responseData = handleCreateOrder(postData);
    } else if (action === "updateOrderStatus") {
      responseData = handleUpdateStatus(postData);
    } else {
      responseData = { success: false, message: "Unknown action: " + action };
    }

    return createJsonResponse(responseData);
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * สร้างคำสั่งซื้อใหม่ลงในชีต Orders
 */
function handleCreateOrder(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);

  if (!ordersSheet) {
    initialSetup();
    ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);
  }

  const now = new Date();
  const dateStr = Utilities.formatDate(now, CONFIG.TIMEZONE, "yyyyMMdd");
  const timeStr = Utilities.formatDate(now, CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");

  // นับจำนวนออเดอร์ในวันนี้เพื่อออกหมายเลขคิวตามจริง
  const lastRow = ordersSheet.getLastRow();
  let todayCount = 0;

  if (lastRow > 1) {
    const datesColumn = ordersSheet.getRange(2, 3, lastRow - 1, 1).getValues();
    const todayPrefix = Utilities.formatDate(now, CONFIG.TIMEZONE, "dd/MM/yyyy");
    for (let i = 0; i < datesColumn.length; i++) {
      if (datesColumn[i][0] && datesColumn[i][0].toString().indexOf(todayPrefix) === 0) {
        todayCount++;
      }
    }
  }

  const seq = todayCount + 1;
  const queueNo = "Q" + (seq < 10 ? "0" + seq : seq);
  const orderId = "JK-" + dateStr + "-" + ("000" + seq).slice(-3);

  // คำนวณค่าส่งตามเงื่อนไข
  const fulfillmentType = data.fulfillmentType || "takeaway"; // takeaway หรือ delivery
  const distanceKm = parseFloat(data.distanceKm) || 0;
  let deliveryFee = 0;

  if (fulfillmentType === "delivery") {
    if (distanceKm <= CONFIG.FREE_DELIVERY_KM) {
      deliveryFee = 0;
    } else {
      const extraKm = Math.ceil(distanceKm - CONFIG.FREE_DELIVERY_KM);
      deliveryFee = extraKm * CONFIG.EXTRA_FEE_PER_KM;
    }
  }

  const itemsSubtotal = parseFloat(data.itemsSubtotal) || 0;
  const grandTotal = itemsSubtotal + deliveryFee;

  // ข้อมูลวิธีชำระเงิน
  const paymentMethod = data.paymentMethod || "พร้อมเพย์ (064-279-3664)";
  const paymentStatus = data.paymentStatus || (paymentMethod.indexOf("พร้อมเพย์") > -1 ? "รอตรวจสอบการโอน" : "ชำระเงินสด");

  // บันทึกแถวใหม่ลงในตาราง Orders
  const rowData = [
    orderId,                                          // Col 1: เลขที่ออเดอร์
    queueNo,                                          // Col 2: คิวที่
    timeStr,                                          // Col 3: วันเวลาที่สั่ง
    data.lineUserId || "",                            // Col 4: LINE User ID
    data.customerName || "ลูกค้าทั่วไป",                // Col 5: ชื่อลูกค้า
    data.customerPhone || "",                         // Col 6: เบอร์โทร
    fulfillmentType === "delivery" ? "เดลิเวอรี" : "รับหน้าร้าน", // Col 7: รูปแบบการรับ
    data.destination || (fulfillmentType === "delivery" ? "จัดส่งตามพิกัด" : "รับที่ร้าน"), // Col 8: นัดรับ/ที่อยู่
    data.gpsLocation || "",                           // Col 9: พิกัด GPS
    distanceKm > 0 ? distanceKm.toFixed(1) : "-",     // Col 10: ระยะทาง (กม.)
    deliveryFee,                                      // Col 11: ค่าส่ง
    itemsSubtotal,                                    // Col 12: ยอดรวมอาหาร
    grandTotal,                                       // Col 13: ยอดสุทธิ
    paymentMethod,                                    // Col 14: วิธีชำระเงิน
    paymentStatus,                                    // Col 15: สถานะการชำระเงิน
    data.itemsSummary || "",                          // Col 16: รายการอาหาร
    "รอยืนยัน",                                       // Col 17: สถานะออเดอร์ (รอยืนยัน, กำลังปรุง, พร้อมส่ง/รับ, สำเร็จ, ยกเลิก)
    data.customerNote || "",                          // Col 18: หมายเหตุ
    timeStr,                                          // Col 19: อัปเดตล่าสุด
    JSON.stringify(data.items || [])                  // Col 20: JSON รายการละเอียด
  ];

  ordersSheet.appendRow(rowData);

  // นับจำนวนคิวที่ยังไม่เสร็จ
  const queueWaitCount = countActiveQueues(ordersSheet);

  return {
    success: true,
    orderId: orderId,
    queueNo: queueNo,
    queueWaitCount: queueWaitCount,
    deliveryFee: deliveryFee,
    itemsSubtotal: itemsSubtotal,
    grandTotal: grandTotal,
    paymentMethod: paymentMethod,
    paymentStatus: paymentStatus,
    message: "บันทึกคำสั่งซื้อสำเร็จ คิวที่ " + queueNo
  };
}

/**
 * ดึงรายการเมนูทั้งหมดจากชีต Menu (รวมคอลัมน์รูปภาพอาหาร)
 */
function getMenuData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let menuSheet = ss.getSheetByName(CONFIG.SHEET_MENU);

  if (!menuSheet) {
    initialSetup();
    menuSheet = ss.getSheetByName(CONFIG.SHEET_MENU);
  }

  const data = menuSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, items: [] };
  }

  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // ข้ามแถวว่าง

    let parsedOptions = null;
    if (row[7]) {
      try {
        parsedOptions = JSON.parse(row[7]);
      } catch (e) {
        parsedOptions = row[7];
      }
    }

    // รองรับการอ่านรูปภาพจาก Col J (index 9) หรือ Col I ถ้าเป็น URL
    let imageUrl = "";
    if (row[9] && row[9].toString().trim()) {
      imageUrl = row[9].toString().trim();
    } else if (row[8] && row[8].toString().indexOf("http") === 0) {
      imageUrl = row[8].toString().trim();
    }

    items.push({
      id: row[0].toString(),
      category: row[1].toString(),
      categoryName: row[2].toString(),
      name: row[3].toString(),
      price: parseFloat(row[4]) || 0,
      status: row[5].toString() === "พร้อมขาย" ? "available" : "out_of_stock",
      popular: row[6] === true || row[6] === "TRUE" || row[6] === 1,
      options: parsedOptions,
      description: row[8] ? row[8].toString() : "",
      image: imageUrl
    });
  }

  return {
    success: true,
    total: items.length,
    items: items
  };
}

/**
 * ค้นหาประวัติออเดอร์ตามเงื่อนไข (LINE UID, เบอร์โทร, หรือ Order ID)
 */
function getOrdersData(userId, phone, orderId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);

  if (!ordersSheet) {
    return { success: true, orders: [] };
  }

  const data = ordersSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, orders: [] };
  }

  const matched = [];
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const rowOrderId = row[0] ? row[0].toString() : "";
    const rowUserId = row[3] ? row[3].toString() : "";
    const rowPhone = row[5] ? row[5].toString() : "";

    let isMatch = false;
    if (orderId && rowOrderId.toLowerCase() === orderId.toLowerCase()) isMatch = true;
    else if (userId && rowUserId === userId) isMatch = true;
    else if (phone && rowPhone.replace(/[^0-9]/g, "") === phone.replace(/[^0-9]/g, "")) isMatch = true;
    else if (!orderId && !userId && !phone) isMatch = true;

    if (isMatch) {
      matched.push({
        orderId: row[0],
        queueNo: row[1],
        orderDate: row[2],
        lineUserId: row[3],
        customerName: row[4],
        customerPhone: row[5],
        fulfillmentType: row[6],
        destination: row[7],
        gpsLocation: row[8],
        distanceKm: row[9],
        deliveryFee: row[10],
        itemsSubtotal: row[11],
        grandTotal: row[12],
        paymentMethod: row[13] || "พร้อมเพย์",
        paymentStatus: row[14] || "-",
        itemsSummary: row[15],
        orderStatus: row[16],
        customerNote: row[17],
        updatedAt: row[18]
      });

      if (matched.length >= 25) break;
    }
  }

  return { success: true, orders: matched };
}

/**
 * ตรวจสอบจำนวนคิวรอปัจจุบัน
 */
function getQueueStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);
  if (!ordersSheet) return { success: true, waitingCount: 0, currentCookingQueue: "-" };

  const waitingCount = countActiveQueues(ordersSheet);
  return {
    success: true,
    waitingCount: waitingCount,
    message: waitingCount === 0 ? "ไม่มีคิวรอ สามารถทำอาหารได้ทันที" : "รอประมาณ " + waitingCount + " คิว"
  };
}

/**
 * นับจำนวนคิวที่ยังไม่เสร็จ (สถานะ รอยืนยัน หรือ กำลังปรุง)
 */
function countActiveQueues(ordersSheet) {
  const lastRow = ordersSheet.getLastRow();
  if (lastRow <= 1) return 0;

  // ตรวจสอบตำแหน่งคอลัมน์สถานะ (Col 15 หรือ 17)
  const cols = ordersSheet.getRange(2, 1, lastRow - 1, Math.min(20, ordersSheet.getLastColumn())).getValues();
  let count = 0;
  for (let i = 0; i < cols.length; i++) {
    const row = cols[i];
    // ตรวจสอบสถานะในแถว
    const isPending = row.some(function(val) {
      return val === "รอยืนยัน" || val === "กำลังปรุง";
    });
    if (isPending) count++;
  }
  return count;
}

/**
 * อัปเดตสถานะออเดอร์
 */
function handleUpdateStatus(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);
  if (!ordersSheet) return { success: false, message: "Orders sheet not found" };

  const targetOrderId = data.orderId;
  const newStatus = data.newStatus;
  if (!targetOrderId || !newStatus) {
    return { success: false, message: "Missing orderId or newStatus" };
  }

  const lastRow = ordersSheet.getLastRow();
  if (lastRow <= 1) return { success: false, message: "No orders found" };

  const orderIds = ordersSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");

  for (let i = 0; i < orderIds.length; i++) {
    if (orderIds[i][0] && orderIds[i][0].toString() === targetOrderId.toString()) {
      const rowIdx = i + 2;
      ordersSheet.getRange(rowIdx, 17).setValue(newStatus);
      ordersSheet.getRange(rowIdx, 19).setValue(now);
      return { success: true, message: "อัปเดตสถานะออเดอร์ " + targetOrderId + " เป็น " + newStatus + " สำเร็จ" };
    }
  }

  return { success: false, message: "Order ID not found" };
}

/**
 * ฟังก์ชันสร้าง Sheet อัตโนมัติ พร้อมคอลัมน์รูปภาพและระบบชำระเงิน
 */
function initialSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. จัดการชีต Menu พร้อมคอลัมน์ "รูปภาพ (Image URL)"
  let menuSheet = ss.getSheetByName(CONFIG.SHEET_MENU);
  if (!menuSheet) {
    menuSheet = ss.insertSheet(CONFIG.SHEET_MENU);
  }

  const menuHeaders = [
    "ID", "หมวดหมู่ (Key)", "ชื่อหมวดหมู่", "ชื่อเมนู", "ราคา (บาท)",
    "สถานะสินค้า", "เมนูแนะนำ", "ตัวเลือกเพิ่มเติม (JSON)", "รายละเอียดเมนู", "รูปภาพ (Image URL)"
  ];

  menuSheet.getRange(1, 1, 1, menuHeaders.length)
    .setValues([menuHeaders])
    .setBackground("#f97316")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  menuSheet.setFrozenRows(1);

  // รายการเมนูตั้งต้น (ถ้ามีอยู่แล้วจะไม่อัปเดตทับเพื่อรักษาข้อมูลรูปที่ผู้ใช้เติม)
  if (menuSheet.getLastRow() <= 1) {
    const initialRows = [
      ["f01", "fried", "หมวดเมนูทอด", "หมูสามชั้นทอดน้ำปลา", 100, "พร้อมขาย", true, "", "หมูสามชั้นคัดพิเศษ ทอดกรอบนอกนุ่มใน หอมน้ำปลาแท้", ""],
      ["f02", "fried", "หมวดเมนูทอด", "หมูสามชั้นทอดพริกเกลือ", 100, "พร้อมขาย", true, "", "คั่วพริกกระเทียมสด หอมเจียว รสชาติจัดจ้าน", ""],
      ["f03", "fried", "หมวดเมนูทอด", "ไก่คั่วเค็ม", 100, "พร้อมขาย", false, "", "ไก่คั่วกรอบแห้ง รสเค็มกลมกล่อม ทานคู่ข้าวต้ม", ""],
      ["f04", "fried", "หมวดเมนูทอด", "เป็ดคั่วเค็ม", 100, "พร้อมขาย", true, "", "เนื้อเป็ดแน่นคัดเกรด คั่วหอมเค็มกลมกล่อม", ""],
      ["f05", "fried", "หมวดเมนูทอด", "ปลาสลิดทอด", 80, "พร้อมขาย", false, "", "ปลาสลิดทอดกรอบเหลืองทอง แกะทานง่าย", ""],
      ["f06", "fried", "หมวดเมนูทอด", "ไข่เจียวหมูสับ", 50, "พร้อมขาย", false, "", "ไข่เจียวฟูนุ่ม หมูสับปรุงรส", ""],
      ["f07", "fried", "หมวดเมนูทอด", "ไข่เจียวแหนม", 60, "พร้อมขาย", false, "", "ไข่เจียวใส่แหนมสด รสเปรี้ยวกำลังดี", ""],
      ["f08", "fried", "หมวดเมนูทอด", "หมูยอทอด", 50, "พร้อมขาย", false, "", "หมูยออุบลเกรดพรีเมียม ทอดกรอบนอกนุ่มใน", ""],
      ["f09", "fried", "หมวดเมนูทอด", "กุนเชียงทอด", 50, "พร้อมขาย", false, "", "กุนเชียงเนื้อแน่น ทอดไร้น้ำมัน หวานหอม", ""],
      ["f10", "fried", "หมวดเมนูทอด", "หมูแดดเดียวทอด", 80, "พร้อมขาย", false, "", "หมูแดดเดียวหมักสูตรเด็ด ทอดนุ่มไม่เหนียว", ""],
      ["f11", "fried", "หมวดเมนูทอด", "เม็ดมะม่วงหิมพานต์ทอด", 100, "พร้อมขาย", false, "", "เม็ดมะม่วงเม็ดโต ทอดใหม่กรอบมัน", ""],
      ["f12", "fried", "หมวดเมนูทอด", "กุ้งชุบแป้งทอด", 120, "พร้อมขาย", false, "", "กุ้งสดตัวโต ชุบเกล็ดขนมปังทอดสีทองกรอบ", ""],
      ["f13", "fried", "หมวดเมนูทอด", "ปลาทับทิมทอดกระเทียม", 200, "พร้อมขาย", true, "", "ปลาทับทิมสดตัวใหญ่ ทอดกรอบ โรยกระเทียมเจียวพูนๆ", ""],

      ["y01", "salad", "หมวดยำ", "ยำสามกรอบ", 120, "พร้อมขาย", true, "", "กระเพาะปลากรอบ ปลาหมึกกรอบ เม็ดมะม่วง น้ำยำรสแซ่บ", ""],
      ["y02", "salad", "หมวดยำ", "ยำไส้อ่อน", 100, "พร้อมขาย", true, "", "ไส้อ่อนล้างสะอาดต้มเปื่อยนุ่ม คลุกเคล้าน้ำยำมะนาวแท้", ""],
      ["y03", "salad", "หมวดยำ", "ยำไข่เค็ม", 60, "พร้อมขาย", false, "", "ไข่เค็มไชยาแดงฉ่ำ มันอร่อย ราดน้ำยำรสกลมกล่อม", ""],
      ["y04", "salad", "หมวดยำ", "ยำไข่เยี่ยวม้า", 70, "พร้อมขาย", false, "", "ไข่เยี่ยวม้าเนื้อเด้ง โรยขิงดอง หอมแดง พริกขี้หนู", ""],
      ["y05", "salad", "หมวดยำ", "ยำเกี่ยมฉ่าย", 60, "พร้อมขาย", false, "", "ผักกาดดองเกี่ยมฉ่ายกรอบๆ ยำมะนาวพริกสด", ""],
      ["y06", "salad", "หมวดยำ", "ยำกุนเชียง", 60, "พร้อมขาย", false, "", "กุนเชียงทอดหอมหวาน ยำใส่มะนาวสด แตงกวาและขึ้นฉ่าย", ""],
      ["y07", "salad", "หมวดยำ", "ยำไข่ดาว", 80, "พร้อมขาย", false, "", "ไข่ดาวทอดกรอบ ยำแซ่บ ใส่หมูสับและสมุนไพร", ""],
      ["y08", "salad", "หมวดยำ", "ยำปลาสลิด", 80, "พร้อมขาย", false, "", "เนื้อปลาสลิดทอดกรอบแกะชิ้นพอดีคำ ยำเปรี้ยวหวาน", ""],
      ["y09", "salad", "หมวดยำ", "ยำผักกระเฉด", 80, "พร้อมขาย", false, "", "ผักกระเฉดยอดอ่อนลวกกรอบ ยำกับหมูสับและกุ้ง", ""],
      ["y10", "salad", "หมวดยำ", "ยำกุ้งแห้ง", 60, "พร้อมขาย", false, "", "กุ้งแห้งตัวโตไม่เค็มจัด ยำรสแซ่บ เมนูคู่ข้าวต้ม", ""],
      ["y11", "salad", "หมวดยำ", "ยำปลาหมึก", 100, "พร้อมขาย", false, "", "ปลาหมึกกล้วยสดเนื้อเด้ง น้ำยำมะนาวคั้นสด", ""],
      ["y12", "salad", "หมวดยำ", "ยำวุ้นเส้น", 100, "พร้อมขาย", false, "", "วุ้นเส้นเหนียวนุ่ม ยำรวมมิตรกุ้ง หมูสับ หมูยอ", ""],
      ["y13", "salad", "หมวดยำ", "ยำปลาอินทรีย์", 60, "พร้อมขาย", false, "", "ปลาอินทรีย์เค็มทอดหอม ยำบีบมะนาว โรยหอมแดงพริกซอย", ""],
      ["y14", "salad", "หมวดยำ", "กุ้งแช่น้ำปลา", 120, "พร้อมขาย", true, "", "กุ้งแก้วสดๆ แช่น้ำปลาอย่างดี เสิร์ฟพร้อมน้ำจิ้มซีฟู้ด", ""],

      ["p01", "stirfry", "หมวดผัด", "ผัดผักบุ้งไฟแดง", 40, "พร้อมขาย", true, "", "ผักบุ้งจีนสด ผัดไฟลุก กลิ่นเต้าเจี้ยวหอมกรุ่น", ""],
      ["p02", "stirfry", "หมวดผัด", "แขนงหมูกรอบ", 60, "พร้อมขาย", true, "", "ผักแขนงสดหวานกรอบ ผัดน้ำมันหอยใส่หมูกรอบ", ""],
      ["p03", "stirfry", "หมวดผัด", "แขนงปลาเค็ม", 60, "พร้อมขาย", false, "", "ผักแขนงผัดเคล้าปลาเค็มทอดหอมเตะจมูก", ""],
      ["p04", "stirfry", "หมวดผัด", "ผักกระเฉดไฟแดง", 50, "พร้อมขาย", false, "", "ยอดผักกระเฉดอ่อนไม่เหนียว ผัดไฟแรง", ""],
      ["p05", "stirfry", "หมวดผัด", "กุ้ยช่ายขาวผัดเต้าหู้หมูสับ", 70, "พร้อมขาย", true, "", "กุ้ยช่ายขาวหวานกรอบ ผัดเต้าหู้ไข่และหมูสับ", ""],
      ["p06", "stirfry", "หมวดผัด", "ผัดยอดมะพร้าวอ่อน", 50, "พร้อมขาย", false, "", "ยอดมะพร้าวอ่อนกรุบกรอบ ผัดน้ำมันหอย", ""],
      ["p07", "stirfry", "หมวดผัด", "ผัดผักรวมมิตร", 70, "พร้อมขาย", false, "", "ผักสดหลากชนิด ผัดร้อนๆ สดสะอาด", ""],
      ["p08", "stirfry", "หมวดผัด", "ผัดโป๊ยเซียน", 80, "พร้อมขาย", false, "", "วุ้นเส้นผัดรวมมิตรเครื่อง 8 อย่าง", ""],
      ["p09", "stirfry", "หมวดผัด", "ผัดมะระใส่ไข่", 70, "พร้อมขาย", false, "", "มะระจีนหั่นบางไม่ขม ผัดไข่ไก่หอมกลิ่นกระทะ", ""],
      ["p10", "stirfry", "หมวดผัด", "ผัดปลาช่อนขึ้นฉ่าย", 80, "พร้อมขาย", true, "", "เนื้อปลาช่อนทอดผัดขึ้นฉ่ายหอมเต้าเจี้ยว", ""],
      ["p11", "stirfry", "หมวดผัด", "ผัดเกี่ยมฉ่ายกระเพาะหมู", 80, "พร้อมขาย", false, "", "กระเพาะหมูเคี่ยวเปื่อย ผัดเกี่ยมฉ่าย", ""],
      ["p12", "stirfry", "หมวดผัด", "ผัดยอดทานตะวัน", 50, "พร้อมขาย", false, "", "ต้นอ่อนทานตะวันสด ผัดน้ำมันหอยไฟแดง", ""],
      ["p13", "stirfry", "หมวดผัด", "ผัดถั่วลันเตา", 50, "พร้อมขาย", false, "", "ถั่วลันเตาหวานกรอบ ผัดไฟแรง", ""],
      ["p14", "stirfry", "หมวดผัด", "ผัดหนำเลี้ยบหมูสับ", 70, "พร้อมขาย", true, "", "หนำเลี้ยบแท้ผัดหมูสับแห้งๆ หอมกลิ่นคั่วกระทะ", ""],
      ["p15", "stirfry", "หมวดผัด", "ผัดไข่เค็มหมูสับ", 70, "พร้อมขาย", false, "", "หมูสับผัดคลุกเคล้าไข่เค็มแดง มันนัวกลมกล่อม", ""],
      ["p16", "stirfry", "หมวดผัด", "ผัดปลาหมึกไข่เค็ม", 80, "พร้อมขาย", true, "", "ปลาหมึกสดชิ้นโต คลุกซอสไข่เค็มเยิ้มๆ เข้มข้น", ""],
      ["p17", "stirfry", "หมวดผัด", "ผัดหอยลาย", 100, "พร้อมขาย", true, "", "หอยลายสดตัวโต ผัดน้ำพริกเผาโหระพา", ""],
      ["p18", "stirfry", "หมวดผัด", "ผัดพริกแกง", 70, "พร้อมขาย", true, JSON.stringify([
        { name: "หมู", price: 70 }, { name: "ไก่", price: 70 },
        { name: "ทะเล", price: 100 }, { name: "ปลาช่อน", price: 100 }, { name: "หมูกรอบ", price: 100 }
      ]), "พริกแกงเข้มข้นผัดถั่วฝักยาว เลือกเนื้อสัตว์ได้", ""],
      ["p19", "stirfry", "หมวดผัด", "ผัดกระเพรา", 70, "พร้อมขาย", true, JSON.stringify([
        { name: "หมูสับ", price: 70 }, { name: "ไก่", price: 70 },
        { name: "หมูกรอบ", price: 100 }, { name: "ทะเล", price: 100 }
      ]), "กะเพราแท้ใบหอม ผัดพริกแห้งกระเทียม เลือกเนื้อสัตว์ได้", ""],

      ["s01", "soup", "หมวดต้มหรือแกง", "ต้มยำรวมมิตร", 150, "พร้อมขาย", true, "", "ต้มยำน้ำข้น/ใส เครื่องทะเล กุ้ง หมึก ปลา รสแซ่บ", ""],
      ["s02", "soup", "หมวดต้มหรือแกง", "ต้มแซ่บเครื่องในหมู", 150, "พร้อมขาย", true, "", "เครื่องในหมูคัดสะอาด นุ่มเปื่อย ต้มแซ่บเปรี้ยวเผ็ดสะใจ", ""],
      ["s03", "soup", "หมวดต้มหรือแกง", "แกงส้มปลาช่อน", 150, "พร้อมขาย", true, "", "แกงส้มรสเปรี้ยวนำ เนื้อปลาช่อนสดแน่น ผักรวม", ""],
      ["s04", "soup", "หมวดต้มหรือแกง", "ต้มจืดไข่น้ำ", 100, "พร้อมขาย", false, "", "ไข่เจียวทอดหอม ซดกับน้ำซุปใส หมูสับสาหร่าย", ""],
      ["s05", "soup", "หมวดต้มหรือแกง", "ต้มจืดเต้าหู้หมูสับ", 100, "พร้อมขาย", false, "", "เต้าหู้ไข่นุ่มๆ หมูสับปั้นก้อน ซุปร้อนคล่องคอ", ""],
      ["s06", "soup", "หมวดต้มหรือแกง", "ตุ๋นมะระ", 60, "พร้อมขาย", false, "", "มะระต้มซี่โครงหมู ตุ๋นยาจีนจนน้ำซุปหอมหวาน", ""],
      ["s07", "soup", "หมวดต้มหรือแกง", "ต้มจืดเกี่ยมฉ่ายกระเพาะหมู", 120, "พร้อมขาย", true, "", "กระเพาะหมูเคี่ยวเปื่อย เกี่ยมฉ่ายรสเปรี้ยวเค็มตัดกัน", ""],
      ["s08", "soup", "หมวดต้มหรือแกง", "หมูสับต้มบ๊วย", 80, "พร้อมขาย", true, "", "หมูสับปรุงรสในน้ำซุปต้มบ๊วยดอง เปรี้ยวเค็มสดชื่น", ""],
      ["s09", "soup", "หมวดต้มหรือแกง", "เป็ดพะโล้", 80, "พร้อมขาย", true, "", "เนื้อเป็ดตุ๋นเครื่องพะโล้สูตรโบราณ เนื้อนุ่มชุ่มฉ่ำ", ""],
      ["s10", "soup", "หมวดต้มหรือแกง", "ไส้ เลือด เต้าหู้พะโล้", 70, "พร้อมขาย", false, "", "รวมเครื่องพะโล้ ไส้นุ่ม เลือดนุ่มละมุน เต้าหู้พะโล้", ""],
      ["s11", "soup", "หมวดต้มหรือแกง", "แกงป่าหมู / ไก่", 100, "พร้อมขาย", false, JSON.stringify([
        { name: "หมู", price: 100 }, { name: "ไก่", price: 100 }
      ]), "แกงป่ารสร้อนแรง สมุนไพรกระชาย พริกไทยอ่อน", ""],
      ["s12", "soup", "หมวดต้มหรือแกง", "แกงป่าปลาช่อน", 100, "พร้อมขาย", false, "", "เนื้อปลาช่อนสดต้มแกงป่ารสจัดจ้าน พริกแกงตำเอง", ""],

      ["r01", "rice", "หมวดข้าวและเครื่องเคียง", "ข้าวต้มใบเตยร้อนๆ", 10, "พร้อมขาย", true, "", "ข้าวต้มหอมมะลิเคี่ยวใบเตยแท้ หอมกรุ่น", ""],
      ["r02", "rice", "หมวดข้าวและเครื่องเคียง", "ข้าวสวยหอมมะลิ", 10, "พร้อมขาย", false, "", "ข้าวหอมมะลิแท้ หุงสุกใหม่ เมล็ดนุ่มสวย", ""],
      ["r03", "rice", "หมวดข้าวและเครื่องเคียง", "ไข่ดาวกรอบ", 15, "พร้อมขาย", false, "", "ไข่ดาวทอดขอบกรอบ ไข่แดงเยิ้ม", ""]
    ];
    menuSheet.getRange(2, 1, initialRows.length, menuHeaders.length).setValues(initialRows);
  }
  menuSheet.autoResizeColumns(1, menuHeaders.length);

  // 2. จัดการชีต Orders พร้อมคอลัมน์ วิธีชำระเงิน และ สถานะการชำระเงิน
  let ordersSheet = ss.getSheetByName(CONFIG.SHEET_ORDERS);
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet(CONFIG.SHEET_ORDERS);
  }

  const orderHeaders = [
    "เลขที่ออเดอร์", "คิวที่", "วันเวลาที่สั่ง", "LINE User ID", "ชื่อลูกค้า",
    "เบอร์โทรติดต่อ", "รูปแบบการรับ", "เวลานัดรับ / ที่อยู่จัดส่ง", "พิกัด GPS",
    "ระยะทาง (กม.)", "ค่าจัดส่ง (บาท)", "ยอดรวมอาหาร (บาท)", "ยอดชำระสุทธิ (บาท)",
    "วิธีชำระเงิน", "สถานะการชำระเงิน", "รายการอาหาร", "สถานะออเดอร์", "หมายเหตุจากลูกค้า", "อัปเดตล่าสุด", "JSON ละเอียด"
  ];

  if (ordersSheet.getLastRow() === 0) {
    ordersSheet.getRange(1, 1, 1, orderHeaders.length)
      .setValues([orderHeaders])
      .setBackground("#059669")
      .setFontColor("#ffffff")
      .setFontWeight("bold")
      .setHorizontalAlignment("center");
    ordersSheet.setFrozenRows(1);
    ordersSheet.autoResizeColumns(1, orderHeaders.length);
  }

  Logger.log("Initial setup v2 completed!");
}

/**
 * สร้าง JSON Response
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
