Fix
[] ระบบไม่ควรยิง API ดึงข้อมูลสินค้าทุกอย่างมาแสดง ดึงเฉพาะซึ่งที่จำเป็นต้องใช้เท่านั้น
[] ระบบดึงข้อมูล KYC มาจากไหนควร call API account-info แยกไหม
[] fix swagger shinpping show
```API Errors
Hide
Parser error on line 37
duplicated mapping key```

Improvement
[] Buy now item when click -> Go to check-out page(if login) or go to login page(if not login)
[] ไม่ควรแสดงว่าสินค้านี้ต้องการ KYC level ไหนให้ผู้ใช้เห็น เพราะเป็นข้อมูล internal ของระบบ ควรแสดงข้อความว่า "สินค้านี้ต้องการการยืนยันตัวตนเพิ่มเติม กรุณาอัปเกรดบัญชีของคุณ" หรือข้อความที่เหมาะสม เมื่อกดซื้อสินค้าหรือดักอีกทีตอนชำระเงินหากผ่านไปได้
[] Add to cart button can use bolt guest and login user
[] when server error, show error better UI for user ไม่ใช่บอกว่า "Internal Server Error" แต่ให้บอกว่า "เกิดข้อผิดพลาดบางอย่าง กรุณาลองใหม่ภายหลัง" หรือแสดงข้อความที่เหมาะสมกับ error code ที่ได้รับ
[] Move swagger UI to scalar
[] delete unesscary file



