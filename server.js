const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const cron = require('node-cron');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
// const puppeteer = require('puppeteer');

// Server initialization
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Configuration constants
const PORT = process.env.PORT || 3000;
const DEFAULT_ELECTRICITY_RATE = 8.0; // BDT per kWh
const UPDATE_INTERVAL = 60000; // 1 minute in milliseconds
const PEAK_HOURS = { start: 18, end: 23 }; // 6 PM to 11 PM
const HIGH_USAGE_THRESHOLD = 1000; // Watts
const DAILY_COST_ALERT_THRESHOLD = 100; // BDT

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database initialization
const db = new sqlite3.Database('./multiplug.db');

// Database schema creation
function initializeDatabase() {
  return new Promise((resolve) => {
    // Real-time data table
    db.run(`CREATE TABLE IF NOT EXISTS realtime_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      port INTEGER NOT NULL,
      voltage REAL NOT NULL,
      current REAL NOT NULL,
      power REAL NOT NULL,
      status TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Daily consumption table
    db.run(`CREATE TABLE IF NOT EXISTS daily_consumption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      port INTEGER NOT NULL,
      energy_kwh REAL DEFAULT 0,
      cost_bdt REAL DEFAULT 0,
      runtime_minutes INTEGER DEFAULT 0,
      peak_usage REAL DEFAULT 0,
      UNIQUE(date, port)
    )`);

    // Monthly consumption table
    db.run(`CREATE TABLE IF NOT EXISTS monthly_consumption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      port INTEGER NOT NULL,
      energy_kwh REAL DEFAULT 0,
      cost_bdt REAL DEFAULT 0,
      UNIQUE(year, month, port)
    )`);

    // Settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL
    )`);

    // Alerts table
    db.run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      port INTEGER,
      severity TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      acknowledged BOOLEAN DEFAULT FALSE
    )`);

    // Peak hours usage table
    db.run(`CREATE TABLE IF NOT EXISTS peak_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      port INTEGER NOT NULL,
      peak_power REAL NOT NULL,
      peak_time TIME NOT NULL,
      duration_minutes INTEGER DEFAULT 0,
      UNIQUE(date, port)
    )`);

    // Initialize default settings
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
      ('electricity_rate_bdt', '${DEFAULT_ELECTRICITY_RATE}'),
      ('peak_start_hour', '${PEAK_HOURS.start}'),
      ('peak_end_hour', '${PEAK_HOURS.end}'),
      ('high_usage_threshold', '${HIGH_USAGE_THRESHOLD}'),
      ('daily_cost_alert', '${DAILY_COST_ALERT_THRESHOLD}')`, () => {
      resolve();
    });
  });
}

// Utility functions
function getCurrentElectricityRate() {
  return new Promise((resolve) => {
    db.get("SELECT value FROM settings WHERE key = 'electricity_rate_bdt'", (err, row) => {
      resolve(row ? parseFloat(row.value) : DEFAULT_ELECTRICITY_RATE);
    });
  });
}

function calculateEnergyKwh(powerWatts, minutes) {
  return (powerWatts * minutes) / (1000 * 60);
}

function formatRuntime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function isPeakHour(hour) {
  return hour >= PEAK_HOURS.start && hour <= PEAK_HOURS.end;
}

// Database operations
async function updateRealtimeData(port, voltage, current, power) {
  const status = power > 0 ? 'online' : 'offline';
  
  return new Promise((resolve, reject) => {
    // Delete old data for this port
    db.run("DELETE FROM realtime_data WHERE port = ?", [port], (err) => {
      if (err) return reject(err);
      
      // Insert new data
      db.run(`INSERT INTO realtime_data (port, voltage, current, power, status) 
              VALUES (?, ?, ?, ?, ?)`, 
              [port, voltage, current, power, status], 
              (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

async function updateDailyConsumption(port, powerWatts) {
  const today = moment().format('YYYY-MM-DD');
  const energyKwh = calculateEnergyKwh(powerWatts, 1);
  const rate = await getCurrentElectricityRate();
  const costBdt = energyKwh * rate;
  const currentHour = moment().hour();
  
  return new Promise((resolve, reject) => {
    // Get existing record or create new one
    db.get("SELECT * FROM daily_consumption WHERE date = ? AND port = ?", 
           [today, port], (err, row) => {
      if (err) return reject(err);
      
      if (row) {
        // Update existing record
        const newEnergy = row.energy_kwh + energyKwh;
        const newCost = row.cost_bdt + costBdt;
        const newRuntime = powerWatts > 0 ? row.runtime_minutes + 1 : row.runtime_minutes;
        const newPeakUsage = Math.max(row.peak_usage, powerWatts);
        
        db.run(`UPDATE daily_consumption 
                SET energy_kwh = ?, cost_bdt = ?, runtime_minutes = ?, peak_usage = ?
                WHERE date = ? AND port = ?`,
                [newEnergy, newCost, newRuntime, newPeakUsage, today, port], resolve);
      } else {
        // Create new record
        db.run(`INSERT INTO daily_consumption 
                (date, port, energy_kwh, cost_bdt, runtime_minutes, peak_usage)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [today, port, energyKwh, costBdt, powerWatts > 0 ? 1 : 0, powerWatts], resolve);
      }
    });
  });
}

async function updateMonthlyConsumption(port, energyKwh, costBdt) {
  const year = moment().year();
  const month = moment().month() + 1;
  
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM monthly_consumption WHERE year = ? AND month = ? AND port = ?",
           [year, month, port], (err, row) => {
      if (err) return reject(err);
      
      if (row) {
        // Update existing record
        db.run(`UPDATE monthly_consumption 
                SET energy_kwh = energy_kwh + ?, cost_bdt = cost_bdt + ?
                WHERE year = ? AND month = ? AND port = ?`,
                [energyKwh, costBdt, year, month, port], resolve);
      } else {
        // Create new record
        db.run(`INSERT INTO monthly_consumption (year, month, port, energy_kwh, cost_bdt)
                VALUES (?, ?, ?, ?, ?)`,
                [year, month, port, energyKwh, costBdt], resolve);
      }
    });
  });
}

// Alert system
async function checkAndCreateAlerts(port, power, dailyCost) {
  const alerts = [];
  
  // High usage alert
  if (power > HIGH_USAGE_THRESHOLD) {
    alerts.push({
      type: 'HIGH_USAGE',
      message: `Port ${port} consuming ${power}W - exceeds threshold`,
      port: port,
      severity: 'WARNING'
    });
  }
  
  // Daily cost alert
  if (dailyCost > DAILY_COST_ALERT_THRESHOLD) {
    alerts.push({
      type: 'HIGH_COST',
      message: `Port ${port} daily cost ${dailyCost.toFixed(2)} BDT exceeds limit`,
      port: port,
      severity: 'CRITICAL'
    });
  }
  
  // Peak hour usage alert
  const currentHour = moment().hour();
  if (isPeakHour(currentHour) && power > 500) {
    alerts.push({
      type: 'PEAK_USAGE',
      message: `Port ${port} using ${power}W during peak hours`,
      port: port,
      severity: 'INFO'
    });
  }
  
  // Insert alerts into database
  for (const alert of alerts) {
    db.run(`INSERT INTO alerts (type, message, port, severity) 
            VALUES (?, ?, ?, ?)`,
            [alert.type, alert.message, alert.port, alert.severity]);
  }
  
  return alerts;
}

// Peak hour detection and tracking
async function updatePeakUsage(port, power) {
  const today = moment().format('YYYY-MM-DD');
  const currentTime = moment().format('HH:mm:ss');
  const currentHour = moment().hour();
  
  if (!isPeakHour(currentHour)) return;
  
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM peak_usage WHERE date = ? AND port = ?", 
           [today, port], (err, row) => {
      if (err) return reject(err);
      
      if (row) {
        // Update if current power is higher
        if (power > row.peak_power) {
          db.run(`UPDATE peak_usage 
                  SET peak_power = ?, peak_time = ?, duration_minutes = duration_minutes + 1
                  WHERE date = ? AND port = ?`,
                  [power, currentTime, today, port], resolve);
        } else {
          // Just increment duration
          db.run(`UPDATE peak_usage 
                  SET duration_minutes = duration_minutes + 1
                  WHERE date = ? AND port = ?`,
                  [today, port], resolve);
        }
      } else {
        // Create new peak usage record
        db.run(`INSERT INTO peak_usage (date, port, peak_power, peak_time, duration_minutes)
                VALUES (?, ?, ?, ?, ?)`,
                [today, port, power, currentTime, 1], resolve);
      }
    });
  });
}

// Cost optimization suggestions
function generateOptimizationSuggestions(dashboardData) {
  const suggestions = [];
  const { realtime, today, monthly } = dashboardData;
  
  // High consumption device suggestions
  Object.keys(realtime).forEach(portKey => {
    const port = portKey.replace('port', '');
    const power = realtime[portKey].power;
    const dailyEnergy = today[portKey].energy;
    
    if (power > 800) {
      suggestions.push({
        type: 'HIGH_CONSUMPTION',
        port: port,
        message: `Port ${port}: Consider using energy-efficient alternatives. Current: ${power}W`,
        savings: `Potential monthly savings: ${((power * 0.3 * 24 * 30) / 1000 * 8).toFixed(0)} BDT`
      });
    }
    
    if (dailyEnergy > 5) {
      suggestions.push({
        type: 'SCHEDULE_OPTIMIZATION',
        port: port,
        message: `Port ${port}: Use timer switches to avoid standby consumption`,
        savings: `Potential daily savings: ${(dailyEnergy * 0.2 * 8).toFixed(0)} BDT`
      });
    }
  });
  
  // Peak hour usage suggestions
  const currentHour = moment().hour();
  if (isPeakHour(currentHour)) {
    Object.keys(realtime).forEach(portKey => {
      const port = portKey.replace('port', '');
      const power = realtime[portKey].power;
      
      if (power > 300) {
        suggestions.push({
          type: 'PEAK_HOUR_OPTIMIZATION',
          port: port,
          message: `Port ${port}: Avoid peak hours (6-11 PM) for non-essential devices`,
          savings: `Shift to off-peak: Save 20% on electricity cost`
        });
      }
    });
  }
  
  return suggestions;
}

// Data export functions
async function exportToCSV(startDate, endDate) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT d.date, d.port, d.energy_kwh, d.cost_bdt, d.runtime_minutes, d.peak_usage
      FROM daily_consumption d
      WHERE d.date BETWEEN ? AND ?
      ORDER BY d.date, d.port
    `;
    
    db.all(query, [startDate, endDate], (err, rows) => {
      if (err) return reject(err);
      
      const csvWriter = createCsvWriter({
        path: './exports/consumption_data.csv',
        header: [
          { id: 'date', title: 'Date' },
          { id: 'port', title: 'Port' },
          { id: 'energy_kwh', title: 'Energy (kWh)' },
          { id: 'cost_bdt', title: 'Cost (BDT)' },
          { id: 'runtime_minutes', title: 'Runtime (minutes)' },
          { id: 'peak_usage', title: 'Peak Usage (W)' }
        ]
      });
      
      // Ensure exports directory exists
      if (!fs.existsSync('./exports')) {
        fs.mkdirSync('./exports');
      }
      
      csvWriter.writeRecords(rows)
        .then(() => resolve('./exports/consumption_data.csv'))
        .catch(reject);
    });
  });
}

// PDF export temporarily disabled for hosting
async function exportToPDF(dashboardData) {
  throw new Error('PDF export is temporarily disabled. Use CSV export instead.');
}

// Get dashboard data
async function getDashboardData() {
  return new Promise((resolve, reject) => {
    const today = moment().format('YYYY-MM-DD');
    const currentYear = moment().year();
    const currentMonth = moment().month() + 1;
    
    // Get real-time data
    db.all("SELECT * FROM realtime_data ORDER BY port", (err, realtimeRows) => {
      if (err) return reject(err);
      
      const realtime = {};
      for (let i = 1; i <= 4; i++) {
        const data = realtimeRows.find(row => row.port === i);
        realtime[`port${i}`] = data ? {
          voltage: data.voltage,
          current: data.current,
          power: data.power,
          status: data.status
        } : { voltage: 0, current: 0, power: 0, status: 'offline' };
      }
      
      // Get today's data
      db.all("SELECT * FROM daily_consumption WHERE date = ?", [today], (err, dailyRows) => {
        if (err) return reject(err);
        
        const todayData = {};
        let totalEnergy = 0, totalCost = 0, totalRuntime = 0;
        
        for (let i = 1; i <= 4; i++) {
          const data = dailyRows.find(row => row.port === i);
          todayData[`port${i}`] = data ? {
            energy: parseFloat(data.energy_kwh.toFixed(2)),
            cost: parseFloat(data.cost_bdt.toFixed(2)),
            runtime: formatRuntime(data.runtime_minutes)
          } : { energy: 0, cost: 0, runtime: '0h 0m' };
          
          if (data) {
            totalEnergy += data.energy_kwh;
            totalCost += data.cost_bdt;
            totalRuntime += data.runtime_minutes;
          }
        }
        
        todayData.total = {
          energy: parseFloat(totalEnergy.toFixed(2)),
          cost: parseFloat(totalCost.toFixed(2)),
          runtime: formatRuntime(totalRuntime)
        };
        
        // Get monthly data
        db.all("SELECT * FROM monthly_consumption WHERE year = ? AND month = ?", 
               [currentYear, currentMonth], (err, monthlyRows) => {
          if (err) return reject(err);
          
          const monthlyData = {};
          let monthTotalEnergy = 0, monthTotalCost = 0;
          
          for (let i = 1; i <= 4; i++) {
            const data = monthlyRows.find(row => row.port === i);
            monthlyData[`port${i}`] = data ? {
              energy: parseFloat(data.energy_kwh.toFixed(2)),
              cost: parseFloat(data.cost_bdt.toFixed(2))
            } : { energy: 0, cost: 0 };
            
            if (data) {
              monthTotalEnergy += data.energy_kwh;
              monthTotalCost += data.cost_bdt;
            }
          }
          
          monthlyData.total = {
            energy: parseFloat(monthTotalEnergy.toFixed(2)),
            cost: parseFloat(monthTotalCost.toFixed(2)),
            days: moment().date()
          };
          
          // Get recent alerts
          db.all(`SELECT * FROM alerts WHERE acknowledged = FALSE 
                  ORDER BY timestamp DESC LIMIT 10`, (err, alertRows) => {
            if (err) return reject(err);
            
            const dashboardData = {
              realtime,
              today: todayData,
              monthly: monthlyData,
              alerts: alertRows || [],
              timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
            };
            
            // Generate optimization suggestions
            dashboardData.suggestions = generateOptimizationSuggestions(dashboardData);
            
            resolve(dashboardData);
          });
        });
      });
    });
  });
}

// Sample data generator
function generateSampleData() {
  const baseVoltages = [220, 218, 222, 219];
  const deviceProfiles = [
    { name: 'AC/Heater', minPower: 800, maxPower: 1200, onProbability: 0.7 },
    { name: 'Refrigerator', minPower: 150, maxPower: 300, onProbability: 0.9 },
    { name: 'LED Lights', minPower: 20, maxPower: 60, onProbability: 0.8 },
    { name: 'Occasional Device', minPower: 50, maxPower: 200, onProbability: 0.3 }
  ];
  
  for (let port = 1; port <= 4; port++) {
    const profile = deviceProfiles[port - 1];
    const isOn = Math.random() < profile.onProbability;
    
    let power = 0;
    let voltage = 0;
    let current = 0;
    
    if (isOn) {
      power = Math.random() * (profile.maxPower - profile.minPower) + profile.minPower;
      voltage = baseVoltages[port - 1] + (Math.random() - 0.5) * 10;
      current = power / voltage;
    }
    
    // Update database
    updateRealtimeData(port, voltage, current, power)
      .then(() => updateDailyConsumption(port, power))
      .then(async () => {
        const energyKwh = calculateEnergyKwh(power, 1);
        const rate = await getCurrentElectricityRate();
        const costBdt = energyKwh * rate;
        
        await updateMonthlyConsumption(port, energyKwh, costBdt);
        await updatePeakUsage(port, power);
        
        // Check for alerts
        const dailyCost = await new Promise((resolve) => {
          const today = moment().format('YYYY-MM-DD');
          db.get("SELECT cost_bdt FROM daily_consumption WHERE date = ? AND port = ?",
                 [today, port], (err, row) => {
            resolve(row ? row.cost_bdt : 0);
          });
        });
        
        await checkAndCreateAlerts(port, power, dailyCost);
      })
      .catch(console.error);
  }
}

// API Routes
app.get('/api/data', async (req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/data', async (req, res) => {
  try {
    const { port, voltage, current, power } = req.body;
    
    if (!port || port < 1 || port > 4) {
      return res.status(400).json({ error: 'Invalid port number' });
    }
    
    await updateRealtimeData(port, voltage, current, power);
    await updateDailyConsumption(port, power);
    
    const energyKwh = calculateEnergyKwh(power, 1);
    const rate = await getCurrentElectricityRate();
    const costBdt = energyKwh * rate;
    
    await updateMonthlyConsumption(port, energyKwh, costBdt);
    await updatePeakUsage(port, power);
    
    // Check for alerts
    const today = moment().format('YYYY-MM-DD');
    const dailyCost = await new Promise((resolve) => {
      db.get("SELECT cost_bdt FROM daily_consumption WHERE date = ? AND port = ?",
             [today, port], (err, row) => {
        resolve(row ? row.cost_bdt : 0);
      });
    });
    
    await checkAndCreateAlerts(port, power, dailyCost);
    
    const updatedData = await getDashboardData();
    io.emit('dataUpdate', updatedData);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/csv', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const filePath = await exportToCSV(startDate, endDate);
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/pdf', async (req, res) => {
  try {
    const dashboardData = await getDashboardData();
    const filePath = await exportToPDF(dashboardData);
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/alerts/acknowledge', (req, res) => {
  const { alertId } = req.body;
  
  db.run("UPDATE alerts SET acknowledged = TRUE WHERE id = ?", [alertId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/settings/rate', async (req, res) => {
  try {
    const { rate } = req.body;
    
    db.run("UPDATE settings SET value = ? WHERE key = 'electricity_rate_bdt'", 
           [rate.toString()], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reset-daily', (req, res) => {
  const today = moment().format('YYYY-MM-DD');
  
  db.run("DELETE FROM daily_consumption WHERE date = ?", [today], async (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const updatedData = await getDashboardData();
    io.emit('dataUpdate', updatedData);
    res.json({ success: true });
  });
});

// WebSocket connection handling
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);
  
  try {
    const data = await getDashboardData();
    socket.emit('dataUpdate', data);
  } catch (error) {
    console.error('Error sending initial data:', error);
  }
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Scheduled tasks
// Generate sample data every minute
setInterval(async () => {
  try {
    generateSampleData();
    const updatedData = await getDashboardData();
    io.emit('dataUpdate', updatedData);
  } catch (error) {
    console.error('Error in sample data generation:', error);
  }
}, UPDATE_INTERVAL);

// Daily cleanup task (runs at midnight)
cron.schedule('0 0 * * *', () => {
  console.log('Running daily cleanup...');
  
  // Clean old alerts (older than 7 days)
  const weekAgo = moment().subtract(7, 'days').format('YYYY-MM-DD');
  db.run("DELETE FROM alerts WHERE timestamp < ?", [weekAgo]);
  
  // Clean old realtime data (older than 1 day)
  const dayAgo = moment().subtract(1, 'day').format('YYYY-MM-DD HH:mm:ss');
  db.run("DELETE FROM realtime_data WHERE timestamp < ?", [dayAgo]);
});

// Server startup
initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Smart Multiplug System running on port ${PORT}`);
    console.log(`Features: Real-time monitoring, Alerts, Peak detection, Export (CSV/PDF)`);
    console.log(`Sample data generation: Every ${UPDATE_INTERVAL/1000} seconds`);
  });
});