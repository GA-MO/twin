ชนิด: bug
ขนาด: กลาง
เป้าหมาย: ผู้ใช้ปิด dialog ยืนยันด้วยคีย์บอร์ดได้ และใช้ได้ทั้งเว็บกับมือถือ
อาการ: หน้า Files กด Delete แล้ว dialog ขึ้น แต่กด Esc ไม่ปิด ต้องเอาเมาส์ไปกด Cancel อย่างเดียว ผู้ใช้ที่ใช้คีย์บอร์ดติดอยู่ใน dialog
อ้างอิง: dialog.js, dialog.css, index.html
คงไว้: กด Delete ใน dialog แล้วไฟล์หาย, กด Cancel แล้วไฟล์ยังอยู่
ห้าม: เพิ่ม dependency
เสร็จเมื่อ: เปิดหน้า Files ใน Chrome กด Delete แล้วกด Esc dialog ปิดและไฟล์ยังอยู่
ลงที่: push branch only
