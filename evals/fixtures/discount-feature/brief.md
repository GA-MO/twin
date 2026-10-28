ชนิด: feature
ขนาด: กลาง
เป้าหมาย: ลูกค้าใส่โค้ดส่วนลดตอน checkout แล้วได้ยอดที่ลดแล้ว
คนใช้: ลูกค้าที่ checkout ผ่าน API
flow: ส่ง checkout({ subtotal, code, now }) โดย code กับ now ไม่บังคับ (now ใช้ตรวจวันหมดอายุ ค่าเริ่มต้นคือเวลาปัจจุบัน) โค้ดอยู่ใน src/codes.ts ชนิด percent ลดเป็นเปอร์เซ็นต์ ชนิด flat ลดเป็น cents โค้ดไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย โค้ดว่างเท่ากับไม่ใช้โค้ด ยอดต้องไม่ติดลบ โค้ดที่ไม่มีอยู่ตอบ { ok: false, error: "unknown_code" } โค้ดหมดอายุตอบ { ok: false, error: "expired_code" }
อ้างอิง: src/api.ts, src/pricing.ts, src/codes.ts
คงไว้: checkout ที่ไม่มี code ได้ยอดเท่า subtotal
ห้าม: เพิ่ม dependency, เปลี่ยนรูปแบบ CheckoutRes ที่มีอยู่
เสร็จเมื่อ: เรียก checkout ตาม flow ครบทุกกรณีแล้วได้ผลตามที่เขียน และ bun test ผ่าน
ลงที่: push branch only
