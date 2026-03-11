const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) console.error('❌ DB Error:', err.message);
    else console.log('✅ Connected to Postgres!');
});

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

// --- ส่วนของการส่งไฟล์หน้าเว็บ ---
app.use(express.static(path.join(__dirname, '.')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'sign in.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port: ${PORT}`));
