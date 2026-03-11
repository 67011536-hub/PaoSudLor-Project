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
// ส่วนสร้างตารางจาก Database 4 ไฟล์ใหม่ (เวอร์ชัน PostgreSQL)
// ==========================================
const initDb = async () => {
    try {
        await db.query(`
            -- ลบตารางเก่าทิ้งทั้งหมดเพื่อใช้โครงสร้างใหม่
            DROP TABLE IF EXISTS Payments CASCADE;
            DROP TABLE IF EXISTS Bills CASCADE;
            DROP TABLE IF EXISTS Meter_Readings CASCADE;
            DROP TABLE IF EXISTS Contracts CASCADE;
            DROP TABLE IF EXISTS Rooms CASCADE;
            DROP TABLE IF EXISTS Meters CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TABLE IF EXISTS Electric_Rates CASCADE;

            -- 1. สร้างตาราง Users
            CREATE TABLE users (
                user_id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                role VARCHAR(20) CHECK (role IN ('Owner','Tenant','Admin')),
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 2. สร้างตาราง Meters
            CREATE TABLE Meters (
                meter_id SERIAL PRIMARY KEY,
                meter_type VARCHAR(10) DEFAULT '1P',
                serial_number VARCHAR(100) UNIQUE NOT NULL,
                install_date DATE,
                status VARCHAR(20) DEFAULT 'Active'
            );

            -- 3. สร้างตาราง Rooms
            CREATE TABLE Rooms (
                room_id SERIAL PRIMARY KEY,
                room_number VARCHAR(10) UNIQUE NOT NULL,
                floor INT NOT NULL,
                status VARCHAR(20) DEFAULT 'Vacant',
                meter_id INT NOT NULL REFERENCES Meters(meter_id)
            );

            -- 4. สร้างตาราง Contracts (สัญญาเช่า)
            CREATE TABLE Contracts (
                contract_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL REFERENCES users(user_id),
                room_id INT NOT NULL REFERENCES Rooms(room_id),
                start_date DATE NOT NULL,
                end_date DATE,
                status VARCHAR(20) DEFAULT 'Active'
            );

            -- 5. สร้างตาราง Meter_Readings
            CREATE TABLE Meter_Readings (
                reading_id SERIAL PRIMARY KEY,
                meter_id INT NOT NULL REFERENCES Meters(meter_id),
                kwh_value DECIMAL(10,2) NOT NULL,
                reading_date DATE NOT NULL
            );

            -- 6. สร้างตาราง Bills
            CREATE TABLE Bills (
                bill_id SERIAL PRIMARY KEY,
                contract_id INT NOT NULL REFERENCES Contracts(contract_id),
                billing_month DATE NOT NULL,
                previous_reading_id INT,
                current_reading_id INT,
                unit_used DECIMAL(10,2) NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                status VARCHAR(20) DEFAULT 'UNPAID',
                due_date DATE NOT NULL,
                late_fee DECIMAL(10,2) DEFAULT 0
            );

            -- 7. สร้างตาราง Payments
            CREATE TABLE Payments (
                payment_id SERIAL PRIMARY KEY,
                bill_id INT NOT NULL REFERENCES Bills(bill_id),
                payment_date DATE,
                amount DECIMAL(10,2) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'pending'
            );

            -- ===============================================
            -- สร้าง Views สรุปยอด (เหมือนในไฟล์ 1)
            -- ===============================================
            CREATE OR REPLACE VIEW admin_energy_report AS
            SELECT 
                COALESCE(SUM(units_used), 0) AS total_units,
                COALESCE(SUM(units_used) * 8, 0) AS income_from_tenants,
                COALESCE(SUM(units_used) * 4.5, 0) AS cost_to_pea,
                COALESCE((SUM(units_used) * 8) - (SUM(units_used) * 4.5), 0) AS profit
            FROM (
                SELECT meter_id, MAX(kwh_value) - MIN(kwh_value) AS units_used
                FROM Meter_Readings GROUP BY meter_id
            ) AS usage_data;

            -- ===============================================
            -- สร้าง Trigger คิดค่าปรับอัตโนมัติไม่เกิน 500 (เหมือนในไฟล์ 3)
            -- ===============================================
            CREATE OR REPLACE FUNCTION calculate_late_fee() RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.status = 'success' AND NEW.payment_date IS NOT NULL THEN
                    UPDATE Bills SET 
                        late_fee = CASE
                            WHEN (NEW.payment_date - due_date) > 0 THEN
                                LEAST((NEW.payment_date - due_date) * 50, 500)
                            ELSE 0
                        END,
                        status = 'PAID'
                    WHERE bill_id = NEW.bill_id;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_CalculateLateFee ON Payments;
            CREATE TRIGGER trg_CalculateLateFee
            AFTER UPDATE ON Payments
            FOR EACH ROW EXECUTE FUNCTION calculate_late_fee();

            -- ===============================================
            -- เพิ่มข้อมูลเริ่มต้น (แอดมิน และ คุณสมชาย ห้อง 101)
            -- ===============================================
            INSERT INTO users (name, role, username, password_hash) VALUES 
            ('Admin', 'Admin', 'admin', '1234'),
            ('Somchai', 'Tenant', 'somchai01', '1234') ON CONFLICT (username) DO NOTHING;

            INSERT INTO Meters (serial_number, install_date) VALUES ('MTR101', CURRENT_DATE) ON CONFLICT DO NOTHING;
            INSERT INTO Rooms (room_number, floor, status, meter_id) VALUES ('101', 1, 'Occupied', 1) ON CONFLICT DO NOTHING;
            INSERT INTO Contracts (user_id, room_id, start_date) VALUES (2, 1, CURRENT_DATE) ON CONFLICT DO NOTHING;

        `);
        console.log('✅ New Professional Database (4 files mapped) Initialized Successfully!');
    } catch (err) {
        console.error('❌ Database init error:', err.message);
    }
};

initDb();

// 1. API สำหรับ Login (ใช้คอลัมน์ใหม่ password_hash)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1 AND password_hash = $2', [username, password]);
        if (result.rows.length > 0) res.json({ success: true, role: result.rows[0].role });
        else res.status(401).json({ success: false, message: 'รหัสผิด' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. API สำหรับหน้า Homepage (ต้องดึงข้อมูลทะลุผ่าน Contracts -> Rooms -> Meters)
app.get('/api/meter-status', async (req, res) => {
    const username = req.query.user;
    try {
        const query = `
            SELECT 
                u.username, 
                COALESCE(MAX(m.kwh_value), 0) as current_reading,
                COALESCE(MAX(m.kwh_value) - MIN(m.kwh_value), 0) as units_used
            FROM users u
            JOIN Contracts c ON u.user_id = c.user_id
            JOIN Rooms r ON c.room_id = r.room_id
            LEFT JOIN Meter_Readings m ON r.meter_id = m.meter_id
            WHERE u.username = $1
            GROUP BY u.username
        `;
        const result = await db.query(query, [username]);
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.json({ current_reading: 0, units_used: 0 });
    } catch (err) { res.status(500).json({ error: "Database error" }); }
});

// 3. API สำหรับหน้า Admin Report
app.get('/api/admin-report', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM admin_energy_report');
        if (result.rows.length > 0) res.json(result.rows[0]);
        else res.json({ total_units: 0, income_from_tenants: 0, cost_to_pea: 0, profit: 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. API สำหรับรับข้อมูลมิเตอร์
app.post('/api/add-meter', async (req, res) => {
    const { meterId, kwhValue } = req.body; // สมมติว่า meterId รับมาเป็นเลขห้องเช่น 101 หรือ 102
    try {
        // หาว่าเลขห้องนี้ใช้มิเตอร์เบอร์อะไร
        const roomRes = await db.query('SELECT meter_id FROM Rooms WHERE room_number = $1', [meterId.toString()]);
        let actualMeterId;
        
        if (roomRes.rows.length === 0) {
            // ถ้าแอดมินจดห้องที่ยังไม่มีในระบบ ให้สร้างผูก โครงสร้างใหม่(มิเตอร์+ห้อง+สัญญาเช่า) ให้เลย
            const newMeter = await db.query("INSERT INTO Meters (serial_number) VALUES ($1) RETURNING meter_id", [`MTR${meterId}`]);
            actualMeterId = newMeter.rows[0].meter_id;
            const newRoom = await db.query("INSERT INTO Rooms (room_number, floor, meter_id) VALUES ($1, 1, $2) RETURNING room_id", [meterId.toString(), actualMeterId]);
            const newUser = await db.query("INSERT INTO users (name, role, username, password_hash) VALUES ($1, 'Tenant', $2, '1234') RETURNING user_id", [`ผู้เช่าห้อง ${meterId}`, `room${meterId}`]);
            await db.query("INSERT INTO Contracts (user_id, room_id, start_date) VALUES ($1, $2, CURRENT_DATE)", [newUser.rows[0].user_id, newRoom.rows[0].room_id]);
        } else {
            actualMeterId = roomRes.rows[0].meter_id;
        }

        // บันทึกค่าไฟลง Meter_Readings
        await db.query('INSERT INTO Meter_Readings (meter_id, reading_date, kwh_value) VALUES ($1, CURRENT_DATE, $2)', [actualMeterId, kwhValue]);
        
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
