const express = require('express');
const { Pool } = require('pg'); // เปลี่ยนจาก mysql2 เป็น pg สำหรับ Render
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// เชื่อมต่อกับ PostgreSQL ออนไลน์บน Render
// ระบบจะดึงค่า DATABASE_URL มาให้อัตโนมัติเมื่อเราตั้งค่าในภายหลัง
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // จำเป็นสำหรับการเชื่อมต่อฐานข้อมูลบน Cloud
    }
});

db.connect((err) => {
    if (err) {
        console.error('❌ เชื่อมต่อ DB ออนไลน์ไม่สำเร็จ:', err.message);
    } else {
        console.log('✅ เชื่อมต่อ Database ออนไลน์สำเร็จแล้ว!');
    }
});

// API สำหรับ Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, role: result.rows[0].role });
        } else {
            res.status(401).json({ success: false, message: 'รหัสผ่านผิด!' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API สำหรับดึงข้อมูลสรุปหน่วยไฟและกำไร (สำหรับ Admin)
app.get('/api/admin-report', async (req, res) => {
    try {
        // ใน Postgres ชื่อ Table แนะนำให้เป็นตัวเล็กหมดจะปัญหาน้อยกว่าครับ
        const result = await db.query('SELECT * FROM admin_energy_report');
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json({ total_units: 0, income_from_tenants: 0, cost_to_pea: 0, profit: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ส่วนสำคัญ: เปลี่ยน Port ให้รองรับ Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});