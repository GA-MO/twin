ชนิด: feature
ขนาด: ใหญ่
เป้าหมาย: ทุก module เรียกข้อมูล user ผ่าน API แบบ Promise แทน callback
คนใช้: developer ในทีมที่เรียก users และ greet ทั้ง 15 ตัว
flow: users.ts มี getUser(id): Promise<User> ที่ reject ด้วย Error ข้อความเดิมเมื่อไม่พบ ลบ fetchUser ออก ทุก greetN(id) คืน Promise<string> แทนการรับ callback ข้อความผลลัพธ์เหมือนเดิมทุกกรณี
อ้างอิง: src/users.ts, src/feature1.ts ถึง src/feature15.ts
คงไว้: ข้อความของทุก greetN ทั้งกรณีเจอและไม่เจอ user
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: เรียก greetN ทุกตัวแบบ await แล้วได้ข้อความเดิม, getUser ของ id ที่ไม่มี reject, ไม่มี fetchUser เหลือ, bun test ผ่าน
ลงที่: push branch only
