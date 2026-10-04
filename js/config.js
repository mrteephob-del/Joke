/**
 * การตั้งค่าระบบเชื่อมต่อ (System Configuration)
 * ร้านข้าวต้มนายเง็ก วงเวียนตาคลี
 */

const APP_CONFIG = {
  // 1. URL Web App บน Google Apps Script
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbz5ahQ0BH30sAXyymE1FdrnE-V44ikQxzb1kSPiV2zKL8wj656trsAIr6K3j4Oh30dOmA/exec",

  // 2. LIFF ID จาก LINE Developers Console
  LIFF_ID: "2011852336-aORyM5Og",

  // เปิดใช้งานโหมดจำลอง (Mock Profile) หากเปิดทดสอบบนเบราว์เซอร์ปกตินอก LINE
  ENABLE_MOCK_LIFF: false,

  // ข้อมูลบัญชีพร้อมเพย์ (PromptPay)
  PROMPTPAY: {
    mobile: "0642793664",
    formattedMobile: "064-279-3664",
    accountName: "ร้านข้าวต้มนายเง็ก วงเวียนตาคลี"
  },

  // พิกัดร้านข้าวต้มนายเง็ก (บริเวณวงเวียนตาคลี หน้าร้านธนชาต)
  SHOP_COORDS: {
    lat: 15.26352,
    lng: 100.34445,
    name: "ร้านข้าวต้มนายเง็ก วงเวียนตาคลี"
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
