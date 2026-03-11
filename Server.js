const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// ตั้งค่าเชื่อมต่อ Database
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) console.error('❌ DB Error:', err.message);
    else console.log('✅ Connected to Postgres!');
});

// ==========================================
// ส่วนที่เพิ่มใหม่: สร้างตารางอัตโนมัติเมื่อรัน Server
// ==========================================
const initDb = async () => {
    try {
        await db.query(`
            -- 1. สร้างตารางเก็บข้อมูลผู้ใช้งาน (users)
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(50) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                meter_id VARCHAR(20)
            );

            -- 2. สร้างตารางเก็บหน่วยก้านไฟฟ้า (Meter_Readings)
            CREATE TABLE IF NOT EXISTS Meter_Readings (
                id SERIAL PRIMARY KEY,
                meter_id VARCHAR(20),
                reading_date DATE,
                kwh_value DECIMAL(10,2)
            );

            -- 3. สร้าง View สำหรับสรุปยอดให้หน้า Admin
            CREATE OR REPLACE VIEW admin_energy_report AS
            SELECT 
                COALESCE(SUM(kwh_value), 0) AS total_units,
                COALESCE(SUM(kwh_value) * 8, 0) AS income_from_tenants, -- เก็บผู้เช่าหน่วยละ 8 บาท
                COALESCE(SUM(kwh_value) * 4.5, 0) AS cost_to_pea,       -- จ่ายการไฟฟ้าหน่วยละ 4.5 บาท
                COALESCE((SUM(kwh_value) * 8) - (SUM(kwh_value) * 4.5), 0) AS profit
            FROM Meter_Readings;

            -- 4. สร้างบัญชี Admin เริ่มต้น (รหัสผ่าน 1234)
            INSERT INTO users (username, password, role) 
            VALUES ('admin', '1234', 'admin') 
            ON CONFLICT (username) DO NOTHING;
        `);
        console.log('✅ Database tables and Admin created successfully!');
    } catch (err) {
        console.error('❌ Database init error:', err.message);
    }
};

// เรียกใช้ฟังก์ชันสร้างตารางทันทีที่เปิด Server
initDb();
// ==========================================

// 1. API สำหรับ Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) res.json({ success: true, role: result.rows[0].role });
        else res.status(401).json({ success: false, message: 'รหัสผิด' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. API สำหรับหน้า Homepage (ดึงข้อมูลมิเตอร์รายบุคคล)
app.get('/api/meter-status', async (req, res) => {
    const username = req.query.user;
    try {
        const query = `
            SELECT 
                u.username, 
                COALESCE(MAX(m.kwh_value), 0) as current_reading,
                COALESCE(MAX(m.kwh_value) - MIN(m.kwh_value), 0) as units_used
            FROM users u
            LEFT JOIN Meter_Readings m ON u.meter_id = m.meter_id
            WHERE u.username = $1
            GROUP BY u.username
        `;
        const result = await db.query(query, [username]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json({ current_reading: 0, units_used: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// 3. API สำหรับหน้า Admin Report
app.get('/api/admin-report', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM admin_energy_report');
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.json({ total_units: 0, income_from_tenants: 0, cost_to_pea: 0, profit: 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. API สำหรับรับข้อมูลมิเตอร์จากหน้า Admin
app.post('/api/add-meter', async (req, res) => {
    const { meterId, kwhValue } = req.body;
    try {
        // บันทึกค่าไฟลงตาราง
        await db.query(
            'INSERT INTO Meter_Readings (meter_id, reading_date, kwh_value) VALUES ($1, CURRENT_DATE, $2)',
            [meterId, kwhValue]
        );
        
        // สร้างบัญชีให้ผู้เช่าห้องนี้อัตโนมัติ (User: roomตามด้วยเลขห้อง / Pass: 1234)
        await db.query(
            `INSERT INTO users (username, password, role, meter_id) 
             VALUES ($1, '1234', 'user', $2) 
             ON CONFLICT (username) DO NOTHING`,
            [`room${meterId}`, meterId]
        );

        res.json({ success: true, message: 'บันทึกสำเร็จ!' });
    } catch (err) { 
        res.status(500).json({ success: false, error: err.message }); 
    }
});

// --- ส่วนของการส่งไฟล์หน้าเว็บ ---
app.use(express.static(path.join(__dirname, '.')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'sign in.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port: ${PORT}`));

