/**
 * ข้อมูลรายการอาหารเริ่มต้น: ร้านข้าวต้มนายเจ๊ก วงเวียนตาคลี
 * ข้อมูลนี้ใช้เป็นข้อมูลเริ่มต้น (Default Local Data) เพื่อให้หน้าเว็บทำงานได้ทันที
 * และสามารถซิงค์ข้อมูลล่าสุดจาก Google Sheets ผ่าน Google Apps Script API ได้
 */

const RESTAURANT_INFO = {
  name: "ร้านข้าวต้มนายเจ๊ก",
  branch: "วงเวียนตาคลี หน้าร้านธนชาต",
  address: "บริเวณวงเวียนตาคลี หน้าร้านธนชาต อ.ตาคลี จ.นครสวรรค์",
  phone: "064-279-3664",
  openHours: "เปิดทุกวัน 16:30 - 23:30 น.",
  // พิกัดร้าน: วงเวียนตาคลี หน้าร้านธนชาต (ละติจูด, ลองจิจูด)
  coords: {
    lat: 15.26352,
    lng: 100.34445
  },
  deliveryPolicy: {
    freeDistanceKm: 3.0,     // 0 - 3 กม. แรก ส่งฟรี
    extraPerKm: 5.0          // เกิน 3 กม. กิโลเมตรละ 5 บาท
  }
};

const MENU_CATEGORIES = [
  { id: "all", name: "ทั้งหมด", icon: "fa-utensils" },
  { id: "popular", name: "🔥 แนะนำ", icon: "fa-fire" },
  { id: "fried", name: "🍗 เมนูทอด", icon: "fa-drumstick-bite" },
  { id: "salad", name: "🥗 ยำแซ่บ", icon: "fa-pepper-hot" },
  { id: "stirfry", name: "🍳 ผัดร้อนๆ", icon: "fa-fire-burner" },
  { id: "soup", name: "🍲 ต้ม/แกง/ตุ๋น", icon: "fa-bowl-food" },
  { id: "rice", name: "🍚 ข้าว/เครื่องเคียง", icon: "fa-wheat-awn" }
];

const INITIAL_MENU_ITEMS = [
  // =================== หมวดเมนูทอด (fried) ===================
  {
    id: "f01",
    category: "fried",
    name: "หมูสามชั้นทอดน้ำปลา",
    price: 100,
    popular: true,
    description: "หมูสามชั้นคัดพิเศษ ทอดกรอบนอกนุ่มใน หอมน้ำปลาแท้",
    status: "available",
    image: "assets/images/f01.jpg"
  },
  {
    id: "f02",
    category: "fried",
    name: "หมูสามชั้นทอดพริกเกลือ",
    price: 100,
    popular: true,
    description: "คั่วพริกกระเทียมสด หอมเจียว รสชาติจัดจ้านถึงใจ",
    status: "available"
  },
  {
    id: "f03",
    category: "fried",
    name: "ไก่คั่วเค็ม",
    price: 100,
    popular: false,
    description: "ไก่คั่วกรอบแห้ง รสเค็มกำลังดี ทานคู่ข้าวต้มร้อนๆ อร่อยเพลิน",
    status: "available"
  },
  {
    id: "f04",
    category: "fried",
    name: "เป็ดคั่วเค็ม",
    price: 100,
    popular: true,
    description: "เนื้อเป็ดแน่นคัดเกรด คั่วหอมเค็มกลมกล่อม",
    status: "available"
  },
  {
    id: "f05",
    category: "fried",
    name: "ปลาสลิดทอด",
    price: 80,
    popular: false,
    description: "ปลาสลิดบางบ่อทอดกรอบเหลืองทอง แกะทานง่าย ทานกับข้าวต้มฟินสุดๆ",
    status: "available"
  },
  {
    id: "f06",
    category: "fried",
    name: "ไข่เจียวหมูสับ",
    price: 50,
    popular: false,
    description: "ไข่เจียวฟูนุ่ม หมูสับปรุงรส อิ่มอร่อยคลาสสิก",
    status: "available"
  },
  {
    id: "f07",
    category: "fried",
    name: "ไข่เจียวแหนม",
    price: 60,
    popular: false,
    description: "ไข่เจียวใส่แหนมสด รสเปรี้ยวกำลังดี ทอดหอมฟู",
    status: "available"
  },
  {
    id: "f08",
    category: "fried",
    name: "หมูยอทอด",
    price: 50,
    popular: false,
    description: "หมูยออุบลเกรดพรีเมียม ทอดกรอบนอกนุ่มใน หอมพริกไทย",
    status: "available"
  },
  {
    id: "f09",
    category: "fried",
    name: "กุนเชียงทอด",
    price: 50,
    popular: false,
    description: "กุนเชียงเนื้อแน่น ทอดไร้น้ำมัน หวานหอมกลมกล่อม",
    status: "available"
  },
  {
    id: "f10",
    category: "fried",
    name: "หมูแดดเดียวทอด",
    price: 80,
    popular: false,
    description: "หมูแดดเดียวหมักสูตรเด็ด ทอดนุ่มไม่เหนียว หอมกลิ่นกระเทียมพริกไทย",
    status: "available"
  },
  {
    id: "f11",
    category: "fried",
    name: "เม็ดมะม่วงหิมพานต์ทอด",
    price: 100,
    popular: false,
    description: "เม็ดมะม่วงเม็ดโต ทอดใหม่กรอบมัน โรยเกลือหอมอร่อย",
    status: "available"
  },
  {
    id: "f12",
    category: "fried",
    name: "กุ้งชุบแป้งทอด",
    price: 120,
    popular: false,
    description: "กุ้งสดตัวโต ชุบเกล็ดขนมปังทอดสีทองกรอบ พร้อมน้ำจิ้มบ๊วย",
    status: "available"
  },
  {
    id: "f13",
    category: "fried",
    name: "ปลาทับทิมทอดกระเทียม",
    price: 200,
    popular: true,
    description: "ปลาทับทิมสดตัวใหญ่ ทอดกรอบทั้งตัว โรยกระเทียมเจียวพูนๆ",
    status: "available"
  },

  // =================== หมวดยำ (salad) ===================
  {
    id: "y01",
    category: "salad",
    name: "ยำสามกรอบ",
    price: 120,
    popular: true,
    description: "กระเพาะปลากรอบ ปลาหมึกกรอบ เม็ดมะม่วง น้ำยำรสแซ่บจัดจ้าน",
    status: "available"
  },
  {
    id: "y02",
    category: "salad",
    name: "ยำไส้อ่อน",
    price: 100,
    popular: true,
    description: "ไส้อ่อนล้างสะอาดต้มเปื่อยนุ่ม คลุกเคล้าน้ำยำมะนาวแท้",
    status: "available"
  },
  {
    id: "y03",
    category: "salad",
    name: "ยำไข่เค็ม",
    price: 60,
    popular: false,
    description: "ไข่เค็มไชยาแดงฉ่ำ มันอร่อย ราดน้ำยำรสกลมกล่อม",
    status: "available"
  },
  {
    id: "y04",
    category: "salad",
    name: "ยำไข่เยี่ยวม้า",
    price: 70,
    popular: false,
    description: "ไข่เยี่ยวม้าเนื้อเด้ง โรยขิงดอง หอมแดง พริกขี้หนูสด",
    status: "available"
  },
  {
    id: "y05",
    category: "salad",
    name: "ยำเกี่ยมฉ่าย",
    price: 60,
    popular: false,
    description: "ผักกาดดองเกี่ยมฉ่ายกรอบๆ ยำใส่พริกขี้หนู มะนาว ทานคู่ข้าวต้มเลิศมาก",
    status: "available"
  },
  {
    id: "y06",
    category: "salad",
    name: "ยำกุนเชียง",
    price: 60,
    popular: false,
    description: "กุนเชียงทอดหอมหวาน ยำใส่มะนาวสด แตงกวาและขึ้นฉ่าย",
    status: "available"
  },
  {
    id: "y07",
    category: "salad",
    name: "ยำไข่ดาว",
    price: 80,
    popular: false,
    description: "ไข่ดาวทอดกรอบขอบกรอบๆ ยำแซ่บ ใส่หมูสับและผักสมุนไพร",
    status: "available"
  },
  {
    id: "y08",
    category: "salad",
    name: "ยำปลาสลิด",
    price: 80,
    popular: false,
    description: "เนื้อปลาสลิดทอดกรอบแกะชิ้นพอดีคำ ยำเปรี้ยวหวานเผ็ดลงตัว",
    status: "available"
  },
  {
    id: "y09",
    category: "salad",
    name: "ยำผักกระเฉด",
    price: 80,
    popular: false,
    description: "ผักกระเฉดยอดอ่อนลวกกรอบ ยำกับหมูสับและกุ้งลวก",
    status: "available"
  },
  {
    id: "y10",
    category: "salad",
    name: "ยำกุ้งแห้ง",
    price: 60,
    popular: false,
    description: "กุ้งแห้งตัวโตไม่เค็มจัด ยำรสแซ่บ เมนูคู่ข้าวต้มในตำนาน",
    status: "available"
  },
  {
    id: "y11",
    category: "salad",
    name: "ยำปลาหมึก",
    price: 100,
    popular: false,
    description: "ปลาหมึกกล้วยสดเนื้อเด้ง ลวกสุกกำลังดี น้ำยำมะนาวคั้นสด",
    status: "available"
  },
  {
    id: "y12",
    category: "salad",
    name: "ยำวุ้นเส้น",
    price: 100,
    popular: false,
    description: "วุ้นเส้นเหนียวนุ่ม ยำรวมมิตรกุ้ง หมูสับ หมูยอ แซ่บจัดจ้าน",
    status: "available"
  },
  {
    id: "y13",
    category: "salad",
    name: "ยำปลาอินทรีย์",
    price: 60,
    popular: false,
    description: "ปลาอินทรีย์เค็มทอดหอม ยำบีบมะนาว โรยหอมแดง พริกซอย",
    status: "available"
  },
  {
    id: "y14",
    category: "salad",
    name: "กุ้งแช่น้ำปลา",
    price: 120,
    popular: true,
    description: "กุ้งแก้วสดๆ แช่น้ำปลาอย่างดี เสิร์ฟพร้อมกระเทียม มะระสด และน้ำจิ้มซีฟู้ดรสเด็ด",
    status: "available"
  },

  // =================== หมวดผัด (stirfry) ===================
  {
    id: "p01",
    category: "stirfry",
    name: "ผัดผักบุ้งไฟแดง",
    price: 40,
    popular: true,
    description: "ผักบุ้งจีนสด ผัดไฟลุก กลิ่นเต้าเจี้ยวหอมกรุ่น พริกกระเทียมจัดเต็ม",
    status: "available"
  },
  {
    id: "p02",
    category: "stirfry",
    name: "แขนงหมูกรอบ",
    price: 60,
    popular: true,
    description: "ผักแขนงสดหวานกรอบ ผัดน้ำมันหอยใส่หมูกรอบเคี้ยวเพลิน",
    status: "available"
  },
  {
    id: "p03",
    category: "stirfry",
    name: "แขนงปลาเค็ม",
    price: 60,
    popular: false,
    description: "ผักแขนงผัดเคล้าปลาเค็มทอดหอมๆ หอมเตะจมูก",
    status: "available"
  },
  {
    id: "p04",
    category: "stirfry",
    name: "ผักกระเฉดไฟแดง",
    price: 50,
    popular: false,
    description: "ยอดผักกระเฉดอ่อนไม่เหนียว ผัดไฟแรงรสเข้มข้น",
    status: "available"
  },
  {
    id: "p05",
    category: "stirfry",
    name: "กุ้ยช่ายขาวผัดเต้าหู้หมูสับ",
    price: 70,
    popular: true,
    description: "กุ้ยช่ายขาวหวานกรอบ ผัดเต้าหู้ไข่เหลืองและหมูสับนุ่มๆ",
    status: "available"
  },
  {
    id: "p06",
    category: "stirfry",
    name: "ผัดยอดมะพร้าวอ่อน",
    price: 50,
    popular: false,
    description: "ยอดมะพร้าวอ่อนกรุบกรอบ ผัดน้ำมันหอยรสกลมกล่อม",
    status: "available"
  },
  {
    id: "p07",
    category: "stirfry",
    name: "ผัดผักรวมมิตร",
    price: 70,
    popular: false,
    description: "ผักสดหลากชนิด ผัดร้อนๆ สดสะอาด ได้ประโยชน์ครบ",
    status: "available"
  },
  {
    id: "p08",
    category: "stirfry",
    name: "ผัดโป๊ยเซียน",
    price: 80,
    popular: false,
    description: "วุ้นเส้นผัดรวมมิตรเครื่อง 8 อย่าง กุ้ง หมึก เห็ดหอม คื่นฉ่าย",
    status: "available"
  },
  {
    id: "p09",
    category: "stirfry",
    name: "ผัดมะระใส่ไข่",
    price: 70,
    popular: false,
    description: "มะระจีนหั่นบางไม่ขม ผัดไข่ไก่หอมกลิ่นกระทะไหม้นิดๆ",
    status: "available"
  },
  {
    id: "p10",
    category: "stirfry",
    name: "ผัดปลาช่อนขึ้นฉ่าย",
    price: 80,
    popular: true,
    description: "เนื้อปลาช่อนทอดผัดขึ้นฉ่ายหอมเต้าเจี้ยว รสดั้งเดิม",
    status: "available"
  },
  {
    id: "p11",
    category: "stirfry",
    name: "ผัดเกี่ยมฉ่ายกระเพาะหมู",
    price: 80,
    popular: false,
    description: "กระเพาะหมูล้างสะอาดเคี่ยวเปื่อย ผัดเกี่ยมฉ่ายรสกลมกล่อม",
    status: "available"
  },
  {
    id: "p12",
    category: "stirfry",
    name: "ผัดยอดทานตะวัน",
    price: 50,
    popular: false,
    description: "ต้นอ่อนทานตะวันสด ผัดน้ำมันหอยไฟแดง หอม อร่อย สุขภาพดี",
    status: "available"
  },
  {
    id: "p13",
    category: "stirfry",
    name: "ผัดถั่วลันเตา",
    price: 50,
    popular: false,
    description: "ถั่วลันเตาหวานกรอบ ผัดไฟแรงรสชาติกลมกล่อม",
    status: "available"
  },
  {
    id: "p14",
    category: "stirfry",
    name: "ผัดหนำเลี้ยบหมูสับ",
    price: 70,
    popular: true,
    description: "หนำเลี้ยบแท้ผัดหมูสับแห้งๆ หอมกลิ่นคั่วกระทะ เมนูข้าวต้มอันดับหนึ่ง",
    status: "available"
  },
  {
    id: "p15",
    category: "stirfry",
    name: "ผัดไข่เค็มหมูสับ",
    price: 70,
    popular: false,
    description: "หมูสับผัดคลุกเคล้าไข่เค็มแดง มันนัวหอมกลมกล่อม",
    status: "available"
  },
  {
    id: "p16",
    category: "stirfry",
    name: "ผัดปลาหมึกไข่เค็ม",
    price: 80,
    popular: true,
    description: "ปลาหมึกสดชิ้นโต คลุกซอสไข่เค็มเยิ้มๆ รสชาติเข้มข้น",
    status: "available"
  },
  {
    id: "p17",
    category: "stirfry",
    name: "ผัดหอยลาย",
    price: 100,
    popular: true,
    description: "หอยลายสดตัวโต ผัดน้ำพริกเผาโหระพา หอมเข้มข้นถึงเครื่อง",
    status: "available"
  },
  {
    id: "p18",
    category: "stirfry",
    name: "ผัดพริกแกง",
    price: 70,
    popular: true,
    hasOptions: true,
    description: "พริกแกงเข้มข้นผัดถั่วฝักยาวและใบมะกรูด เลือกระบุเนื้อสัตว์ได้",
    options: [
      { name: "หมู", price: 70 },
      { name: "ไก่", price: 70 },
      { name: "ทะเล", price: 100 },
      { name: "ปลาช่อน", price: 100 },
      { name: "หมูกรอบ", price: 100 }
    ],
    status: "available"
  },
  {
    id: "p19",
    category: "stirfry",
    name: "ผัดกระเพรา",
    price: 70,
    popular: true,
    hasOptions: true,
    description: "กะเพราแท้ใบหอม ผัดพริกแห้งกระเทียมสับ เลือกระบุเนื้อสัตว์ได้",
    options: [
      { name: "หมูสับ", price: 70 },
      { name: "ไก่", price: 70 },
      { name: "หมูกรอบ", price: 100 },
      { name: "ทะเล", price: 100 }
    ],
    status: "available"
  },

  // =================== หมวดต้มหรือแกง (soup) ===================
  {
    id: "s01",
    category: "soup",
    name: "ต้มยำรวมมิตร",
    price: 150,
    popular: true,
    description: "ต้มยำน้ำข้น/น้ำใส เครื่องทะเล กุ้ง หมึก ปลา รสแซ่บจัดจ้านถึงใจ",
    status: "available"
  },
  {
    id: "s02",
    category: "soup",
    name: "ต้มแซ่บเครื่องในหมู",
    price: 150,
    popular: true,
    description: "เครื่องในหมูคัดสะอาด นุ่มเปื่อย ปรุงรสต้มแซ่บเปรี้ยวเผ็ดสะใจ",
    status: "available"
  },
  {
    id: "s03",
    category: "soup",
    name: "แกงส้มปลาช่อน",
    price: 150,
    popular: true,
    description: "แกงส้มใต้/ภาคกลาง รสเปรี้ยวนำ เนื้อปลาช่อนสดแน่น ผักกาดขาวหรือผักรวม",
    status: "available"
  },
  {
    id: "s04",
    category: "soup",
    name: "ต้มจืดไข่น้ำ",
    price: 100,
    popular: false,
    description: "ไข่เจียวทอดหอม ซดกับน้ำซุปใสกลมกล่อม หมูสับและสาหร่าย",
    status: "available"
  },
  {
    id: "s05",
    category: "soup",
    name: "ต้มจืดเต้าหู้หมูสับ",
    price: 100,
    popular: false,
    description: "เต้าหู้ไข่นุ่มๆ หมูสับปั้นก้อน ซุปร้อนๆ ซดคล่องคอ",
    status: "available"
  },
  {
    id: "s06",
    category: "soup",
    name: "ตุ๋นมะระ",
    price: 60,
    popular: false,
    description: "มะระต้มซี่โครงหมู ตุ๋นยาจีนจนน้ำซุปหอมหวานกลมกล่อม ไม่ขม",
    status: "available"
  },
  {
    id: "s07",
    category: "soup",
    name: "ต้มจืดเกี่ยมฉ่ายกระเพาะหมู",
    price: 120,
    popular: true,
    description: "กระเพาะหมูเคี่ยวเปื่อย เกี่ยมฉ่ายรสเปรี้ยวเค็มตัดกัน พริกไทยเม็ดหอมๆ",
    status: "available"
  },
  {
    id: "s08",
    category: "soup",
    name: "หมูสับต้มบ๊วย",
    price: 80,
    popular: true,
    description: "หมูสับปรุงรสในน้ำซุปต้มบ๊วยดอง เปรี้ยวเค็มสดชื่น สร่างเมาซดคล่องคอ",
    status: "available"
  },
  {
    id: "s09",
    category: "soup",
    name: "เป็ดพะโล้",
    price: 80,
    popular: true,
    description: "เนื้อเป็ดตุ๋นเครื่องพะโล้สูตรโบราณ เนื้อนุ่มชุ่มฉ่ำ น้ำพะโล้หอมเครื่องเทศ",
    status: "available"
  },
  {
    id: "s10",
    category: "soup",
    name: "ไส้ เลือด เต้าหู้พะโล้",
    price: 70,
    popular: false,
    description: "รวมเครื่องพะโล้ ไส้นุ่ม เลือดนุ่มละมุน เต้าหู้พะโล้ฉ่ำซอส",
    status: "available"
  },
  {
    id: "s11",
    category: "soup",
    name: "แกงป่าหมู / ไก่",
    price: 100,
    popular: false,
    hasOptions: true,
    description: "แกงป่ารสร้อนแรง สมุนไพรกระชาย พริกไทยอ่อน มะเขือเปราะ",
    options: [
      { name: "หมู", price: 100 },
      { name: "ไก่", price: 100 }
    ],
    status: "available"
  },
  {
    id: "s12",
    category: "soup",
    name: "แกงป่าปลาช่อน",
    price: 100,
    popular: false,
    description: "เนื้อปลาช่อนสดต้มแกงป่ารสจัดจ้าน พริกแกงตำเองหอมเตะจมูก",
    status: "available"
  },

  // =================== หมวดข้าวและเครื่องเคียง (rice) ===================
  {
    id: "r01",
    category: "rice",
    name: "ข้าวต้มใบเตยร้อนๆ",
    price: 10,
    popular: true,
    description: "ข้าวต้มหอมมะลิเคี่ยวใบเตยแท้ หอมกรุ่น นุ่มละมุนลิ้น",
    status: "available"
  },
  {
    id: "r02",
    category: "rice",
    name: "ข้าวสวยหอมมะลิ",
    price: 10,
    popular: false,
    description: "ข้าวหอมมะลิแท้ หุงสุกใหม่ เมล็ดนุ่มสวย",
    status: "available"
  },
  {
    id: "r03",
    category: "rice",
    name: "ไข่ดาวกรอบ",
    price: 15,
    popular: false,
    description: "ไข่ดาวทอดขอบกรอบ ไข่แดงเยิ้ม",
    status: "available"
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { RESTAURANT_INFO, MENU_CATEGORIES, INITIAL_MENU_ITEMS };
}
