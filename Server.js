const express = require('express');
const { Pool } = require('pg'); 
const cors = require('cors');
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

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) res.json({ success: true, role: result.rows[0].role });
        else res.status(401).json({ success: false, message: 'รหัสผิด' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin-report', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM admin_energy_report');
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.json({ total_units: 0, income_from_tenants: 0, cost_to_pea: 0, profit: 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Port: ${PORT}`));
