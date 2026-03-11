-- 1. สร้างตารางเก็บข้อมูลผู้ใช้
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(50) NOT NULL,
    role VARCHAR(20) DEFAULT 'user', -- ใช้ VARCHAR แทน ENUM เพื่อความง่ายใน Postgres
    meter_id VARCHAR(20)
);

-- 2. สร้างตารางเก็บเลขมิเตอร์
CREATE TABLE IF NOT EXISTS Meter_Readings (
    id SERIAL PRIMARY KEY,
    meter_id VARCHAR(20),
    reading_date DATE,
    kwh_value DECIMAL(10,2)
);

-- 3. สร้างตารางเก็บค่าไฟจากการไฟฟ้า (PEA)
CREATE TABLE IF NOT EXISTS Electricity_Bill_PEA (
    bill_month DATE PRIMARY KEY,
    total_cost DECIMAL(10,2)
);

-- 4. สร้าง VIEW สำหรับ Admin (ปรับชื่อให้ตรงกับ Server.js: admin_energy_report)
CREATE OR REPLACE VIEW admin_energy_report AS
SELECT 
    SUM(units_used) AS total_units,
    SUM(units_used) * 8 AS income_from_tenants,
    SUM(units_used) * 4.5 AS cost_to_pea,
    (SUM(units_used) * 8) - (SUM(units_used) * 4.5) AS profit
FROM (
    SELECT 
        meter_id, 
        MAX(kwh_value) - MIN(kwh_value) AS units_used
    FROM Meter_Readings
    GROUP BY meter_id
) AS usage_data;

-- 5. เพิ่มข้อมูลสมมติ
INSERT INTO users (username, password, role, meter_id) VALUES 
('admin', '1234', 'admin', NULL),
('tenant1', '1234', 'user', 'M001')
ON CONFLICT (username) DO NOTHING;

INSERT INTO Meter_Readings (meter_id, reading_date, kwh_value) VALUES 
('M001', '2026-01-01', 1000),
('M001', '2026-02-01', 1120);
