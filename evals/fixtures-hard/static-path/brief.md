ชนิด: bug
ขนาด: เล็ก
เป้าหมาย: เปิดไฟล์ docs ที่มีช่องว่างในชื่อได้
อาการ: ลิงก์ /docs/getting%20started.md ตอบ 404 เพราะ resolveFile คืน path ที่มี %20 อยู่ (ควรได้ไฟล์ public/docs/getting started.md)
อ้างอิง: src/files.ts (ถูกเรียกโดย static file server ที่เปิดสู่อินเทอร์เน็ต)
คงไว้: /index.html และ query string ยังได้ไฟล์เดิม
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: resolveFile ของลิงก์ใน อาการ ได้ path ของไฟล์จริง และ bun test ผ่าน
ลงที่: push branch only
