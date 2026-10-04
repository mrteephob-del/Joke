/**
 * การตั้งค่าระบบเชื่อมต่อ (System Configuration)
 * ร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี
 */

const APP_CONFIG = {
  // 1. นำ URL ที่ได้จากการ Deploy Web App บน Google Apps Script มาใส่ที่นี่
  // ตัวอย่าง: "https://script.google.com/macros/s/AKfycbx.../exec"
  GAS_API_URL: "", 

  // 2. นำ LIFF ID จาก LINE Developers Console มาใส่ที่นี่
  // ตัวอย่าง: "1657891234-AbCdEfGh"
  LIFF_ID: "", 

  // เปิดใช้งานโหมดจำลอง (Mock Profile) อัตโนมัติเมื่อเปิดทดสอบบน Browser ปกติ (นอก LINE)
  ENABLE_MOCK_LIFF: true,

  // พิกัดร้านข้าวต้มนายเจ๊ก (บริเวณวงเวียนตาคลี หน้าร้านธนชาต)
  SHOP_COORDS: {
    lat: 15.26352,
    lng: 100.34445,
    name: "ร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี"
  },

  // กฎการคิดค่าส่ง (Delivery Policy)
  DELIVERY_RULES: {
    freeDistanceKm: 3.0,     // 0 - 3 กม. แรก ฟรี 0 บาท
    ratePerKmAfter: 5.0,     // เกิน 3 กม. คิดกิโลเมตรละ 5 บาท
    maxDeliveryDistance: 30  // จำกัดระยะทางส่งสูงสุด (กม.)
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = APP_CONFIG;
}
