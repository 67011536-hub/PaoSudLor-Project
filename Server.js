const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// เชื่อมต่อ PostgreSQL ออนไลน์ (ใช้ค่า DATABASE_URL จากหน้า Environment)
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        console.error('❌ DB Connection Error:', err.message);
    } else {
        console.log('✅ Connected to Online Database!');
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

// API สำหรับดึงข้อมูลรายงาน (Admin)
app.get('/api/admin-report', async (req, res) => {
    try {
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

// ใช้ Port จาก Render หรือ 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});