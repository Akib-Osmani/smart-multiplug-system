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

// Server initialization
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { 
    origin: (() => {
      if (process.env.NODE_ENV === 'production') {
        const origins = process.env.ALLOWED_ORIGINS;
        if (!origins) return ['https://localhost:3000'];
        const parsed = origins.split(',').map(o => o.trim()).filter(Boolean);
        return parsed.length > 0 ? parsed : ['https://localhost:3000'];
      }
      return "*";
    })(),
    methods: ["GET", "POST"] 
  }
});

// Configuration constants
const PORT = process.env.PORT || 3000;
const DEFAULT_ELECTRICITY_RATE = parseFloat(process.env.DEFAULT_ELECTRICITY_RATE) || 8.0;
const UPDATE_INTERVAL = parseInt(process.env.UPDATE_INTERVAL) || 60000;
const PEAK_HOURS = { 
  start: parseInt(process.env.PEAK_START_HOUR) || 18, 
  end: parseInt(process.env.PEAK_END_HOUR) || 23 
};
const HIGH_USAGE_THRESHOLD = parseInt(process.env.HIGH_USAGE_THRESHOLD) || 1000;
const DAILY_COST_ALERT_THRESHOLD = parseInt(process.env.DAILY_COST_ALERT_THRESHOLD) || 100;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database initialization
const db = new sqlite3.Database('./multiplug.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    setTimeout(() => {
      console.error('Database connection failed, shutting down...');
      process.exit(1);
    }, 1000);
    return;
  }
  console.log('Connected to SQLite database');
});

db.on('error', (err) => {
  console.error('Database error:', err.message);
  if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') {
    console.log('Database busy, retrying in 1 second...');
    setTimeout(() => {
      // Retry logic could be implemented here
    }, 1000);
  }
});

// Database schema creation
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS realtime_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      port INTEGER NOT NULL UNIQUE,
      voltage REAL NOT NULL,
      current REAL NOT NULL,
      power REAL NOT NULL,
      status TEXT NOT NULL,
      relay_state TEXT DEFAULT 'OFF',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) return reject(err);
      
      db.run(`CREATE TABLE IF NOT EXISTS daily_consumption (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        port INTEGER NOT NULL,
        energy_kwh REAL DEFAULT 0,
        cost_bdt REAL DEFAULT 0,
        runtime_minutes INTEGER DEFAULT 0,
        peak_usage REAL DEFAULT 0,
        UNIQUE(date, port)
      )`, (err) => {
        if (err) return reject(err);
        
        createRemainingTables(resolve, reject);
      });
    });
  });
}

function createRemainingTables(resolve, reject) {
  db.run(`CREATE TABLE IF NOT EXISTS monthly_consumption (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    port INTEGER NOT NULL,
    energy_kwh REAL DEFAULT 0,
    cost_bdt REAL DEFAULT 0,
    UNIQUE(year, month, port)
  )`, (err) => {
    if (err) return reject(err);
    
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL
    )`, (err) => {
      if (err) return reject(err);
      
      db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        port INTEGER,
        severity TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        acknowledged BOOLEAN DEFAULT FALSE
      )`, (err) => {
        if (err) return reject(err);
        
        db.run(`CREATE TABLE IF NOT EXISTS peak_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date DATE NOT NULL,
          port INTEGER NOT NULL,
          peak_power REAL NOT NULL,
          peak_time TIME NOT NULL,
          duration_minutes INTEGER DEFAULT 0,
          UNIQUE(date, port)
        )`, (err) => {
          if (err) return reject(err);
          
          db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
            ('electricity_rate_bdt', '${DEFAULT_ELECTRICITY_RATE}'),
            ('peak_start_hour', '${PEAK_HOURS.start}'),
            ('peak_end_hour', '${PEAK_HOURS.end}'),
            ('high_usage_threshold', '${HIGH_USAGE_THRESHOLD}'),
            ('daily_cost_alert', '${DAILY_COST_ALERT_THRESHOLD}')`, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    });
  });
}

// Utility functions
function getCurrentElectricityRate() {
  return new Promise((resolve, reject) => {
    db.get("SELECT value FROM settings WHERE key = 'electricity_rate_bdt'", (err, row) => {
      if (err) return reject(err);
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

// FIXED: Database operations that preserve relay state
async function updateRealtimeData(port, voltage, current, power, preserveRelayState = true) {
  const status = power > 0 ? 'online' : 'offline';
  
  return new Promise((resolve, reject) => {
    if (preserveRelayState) {
      // Get existing relay state first, then update only sensor data
      db.get("SELECT relay_state FROM realtime_data WHERE port = ?", [port], (err, row) => {
        if (err) return reject(err);
        
        const existingRelayState = row ? row.relay_state : 'OFF';
        
        db.run(`INSERT OR REPLACE INTO realtime_data (port, voltage, current, power, status, relay_state, timestamp) 
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, 
                [port, voltage, current, power, status, existingRelayState], 
                (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } else {
      // For manual relay control - don't preserve relay state
      db.run(`INSERT OR REPLACE INTO realtime_data (port, voltage, current, power, status, timestamp) 
              VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, 
              [port, voltage, current, power, status], 
              (err) => {
        if (err) return reject(err);
        resolve();
      });
    }
  });
}

async function updateDailyConsumption(port, powerWatts) {
  const today = moment().format('YYYY-MM-DD');
  const intervalMinutes = UPDATE_INTERVAL / 60000;
  const energyKwh = calculateEnergyKwh(powerWatts, intervalMinutes);
  const rate = await getCurrentElectricityRate();
  const costBdt = energyKwh * rate;
  
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM daily_consumption WHERE date = ? AND port = ?", 
           [today, port], (err, row) => {
      if (err) return reject(err);
      
      if (row) {
        const newEnergy = row.energy_kwh + energyKwh;
        const newCost = row.cost_bdt + costBdt;
        const newRuntime = powerWatts > 0 ? row.runtime_minutes + 1 : row.runtime_minutes;
        const newPeakUsage = Math.max(row.peak_usage, powerWatts);
        
        db.run(`UPDATE daily_consumption 
                SET energy_kwh = ?, cost_bdt = ?, runtime_minutes = ?, peak_usage = ?
                WHERE date = ? AND port = ?`,
                [newEnergy, newCost, newRuntime, newPeakUsage, today, port], (err) => {
          if (err) return reject(err);
          resolve();
        });
      } else {
        db.run(`INSERT INTO daily_consumption 
                (date, port, energy_kwh, cost_bdt, runtime_minutes, peak_usage)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [today, port, energyKwh, costBdt, powerWatts > 0 ? 1 : 0, powerWatts], (err) => {
          if (err) return reject(err);
          resolve();
        });
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
        db.run(`UPDATE monthly_consumption 
                SET energy_kwh = energy_kwh + ?, cost_bdt = cost_bdt + ?
                WHERE year = ? AND month = ? AND port = ?`,
                [energyKwh, costBdt, year, month, port], (err) => {
          if (err) return reject(err);
          resolve();
        });
      } else {
        db.run(`INSERT INTO monthly_consumption (year, month, port, energy_kwh, cost_bdt)
                VALUES (?, ?, ?, ?, ?)`,
                [year, month, port, energyKwh, costBdt], (err) => {
          if (err) return reject(err);
          resolve();
        });
      }
    });
  });
}

// Alert system
async function checkAndCreateAlerts(port, power, dailyCost) {
  const alerts = [];
  
  if (power > HIGH_USAGE_THRESHOLD) {
    alerts.push({
      type: 'HIGH_USAGE',
      message: `Port ${port} consuming ${power}W - exceeds threshold`,
      port: port,
      severity: 'WARNING'
    });
  }
  
  if (dailyCost > DAILY_COST_ALERT_THRESHOLD) {
    alerts.push({
      type: 'HIGH_COST',
      message: `Port ${port} daily cost ${dailyCost.toFixed(2)} BDT exceeds limit`,
      port: port,
      severity: 'CRITICAL'
    });
  }
  
  const currentHour = moment().hour();
  if (isPeakHour(currentHour) && power > 500) {
    alerts.push({
      type: 'PEAK_USAGE',
      message: `Port ${port} using ${power}W during peak hours`,
      port: port,
      severity: 'INFO'
    });
  }
  
  const insertPromises = alerts.map(alert => {
    return new Promise((resolve, reject) => {
      db.run(`INSERT INTO alerts (type, message, port, severity) 
              VALUES (?, ?, ?, ?)`,
              [alert.type, alert.message, alert.port, alert.severity], (err) => {
        if (err) {
          console.error('Error inserting alert:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
  
  try {
    await Promise.all(insertPromises);
  } catch (error) {
    console.error('Failed to insert some alerts:', error);
  }
  
  return alerts;
}

// Peak hour detection and tracking
async function updatePeakUsage(port, power) {
  const today = moment().format('YYYY-MM-DD');
  const currentTime = moment().format('HH:mm:ss');
  const currentHour = moment().hour();
  
  if (!isPeakHour(currentHour)) return Promise.resolve();
  
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM peak_usage WHERE date = ? AND port = ?", 
           [today, port], (err, row) => {
      if (err) return reject(err);
      
      if (row) {
        if (power > row.peak_power) {
          db.run(`UPDATE peak_usage 
                  SET peak_power = ?, peak_time = ?, duration_minutes = duration_minutes + 1
                  WHERE date = ? AND port = ?`,
                  [power, currentTime, today, port], (err) => {
            if (err) return reject(err);
            resolve();
          });
        } else {
          db.run(`UPDATE peak_usage 
                  SET duration_minutes = duration_minutes + 1
                  WHERE date = ? AND port = ?`,
                  [today, port], (err) => {
            if (err) return reject(err);
            resolve();
          });
        }
      } else {
        db.run(`INSERT INTO peak_usage (date, port, peak_power, peak_time, duration_minutes)
                VALUES (?, ?, ?, ?, ?)`,
                [today, port, power, currentTime, 1], (err) => {
          if (err) return reject(err);
          resolve();
        });
      }
    });
  });
}

// Cost optimization suggestions
function generateOptimizationSuggestions(dashboardData) {
  const suggestions = [];
  const { realtime, today, monthly } = dashboardData;
  
  const EFFICIENCY_FACTOR = 0.3;
  const STANDBY_REDUCTION = 0.2;
  const HOURS_PER_DAY = 24;
  const DAYS_PER_MONTH = 30;
  const DEFAULT_RATE = 8;
  
  Object.keys(realtime).forEach(portKey => {
    const port = portKey.replace('port', '');
    const realtimeData = realtime[portKey];
    const todayData = today[portKey];
    
    if (!realtimeData || !todayData) return;
    
    const power = realtimeData.power || 0;
    const dailyEnergy = todayData.energy || 0;
    
    if (power > 800) {
      suggestions.push({
        type: 'HIGH_CONSUMPTION',
        port: port,
        message: `Port ${port}: Consider using energy-efficient alternatives. Current: ${power}W`,
        savings: `Potential monthly savings: ${((power * EFFICIENCY_FACTOR * HOURS_PER_DAY * DAYS_PER_MONTH) / 1000 * DEFAULT_RATE).toFixed(0)} BDT`
      });
    }
    
    if (dailyEnergy > 5) {
      suggestions.push({
        type: 'SCHEDULE_OPTIMIZATION',
        port: port,
        message: `Port ${port}: Use timer switches to avoid standby consumption`,
        savings: `Potential daily savings: ${(dailyEnergy * STANDBY_REDUCTION * DEFAULT_RATE).toFixed(0)} BDT`
      });
    }
  });
  
  const currentHour = moment().hour();
  if (isPeakHour(currentHour)) {
    Object.keys(realtime).forEach(portKey => {
      const port = portKey.replace('port', '');
      const realtimeData = realtime[portKey];
      
      if (!realtimeData) return;
      
      const power = realtimeData.power || 0;
      
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
      
      if (!fs.existsSync('./exports')) {
        fs.mkdirSync('./exports', { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `consumption_data_${timestamp}.csv`;
      const filePath = `./exports/${filename}`;
      
      const csvWriter = createCsvWriter({
        path: filePath,
        header: [
          { id: 'date', title: 'Date' },
          { id: 'port', title: 'Port' },
          { id: 'energy_kwh', title: 'Energy (kWh)' },
          { id: 'cost_bdt', title: 'Cost (BDT)' },
          { id: 'runtime_minutes', title: 'Runtime (minutes)' },
          { id: 'peak_usage', title: 'Peak Usage (W)' }
        ]
      });
      
      csvWriter.writeRecords(rows)
        .then(() => resolve(filePath))
        .catch(reject);
    });
  });
}

async function exportToPDF(dashboardData) {
  throw new Error('PDF export is temporarily disabled. Use CSV export instead.');
}

// Get dashboard data
async function getDashboardData() {
  const today = moment().format('YYYY-MM-DD');
  const currentYear = moment().year();
  const currentMonth = moment().month() + 1;
  
  try {
    const realtimeRows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM realtime_data ORDER BY port", (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    
    const realtime = {};
    for (let i = 1; i <= 4; i++) {
      const data = realtimeRows.find(row => row.port === i);
      realtime[`port${i}`] = data ? {
        voltage: data.voltage,
        current: data.current,
        power: data.power,
        status: data.status,
        relay_state: data.relay_state || 'OFF'
      } : { voltage: 0, current: 0, power: 0, status: 'offline', relay_state: 'OFF' };
    }
    
    const dailyRows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM daily_consumption WHERE date = ?", [today], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    
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
    
    const monthlyRows = await new Promise((resolve, reject) => {
      db.all("SELECT * FROM monthly_consumption WHERE year = ? AND month = ?", 
             [currentYear, currentMonth], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    
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
    
    const alertRows = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM alerts WHERE acknowledged = FALSE 
              ORDER BY timestamp DESC LIMIT 10`, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    
    const dashboardData = {
      realtime,
      today: todayData,
      monthly: monthlyData,
      alerts: alertRows || [],
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss')
    };
    
    dashboardData.suggestions = generateOptimizationSuggestions(dashboardData);
    
    return dashboardData;
  } catch (error) {
    throw error;
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

// FIXED: ESP32 data endpoint that preserves relay states
app.post('/api/data', async (req, res) => {
  try {
    const { port, voltage, current, power } = req.body;
    
    if (!port || port < 1 || port > 4) {
      return res.status(400).json({ error: 'Invalid port number' });
    }
    
    // IMPORTANT: Preserve relay state when updating sensor data
    await updateRealtimeData(port, voltage, current, power, true);
    await updateDailyConsumption(port, power);
    
    const energyKwh = calculateEnergyKwh(power, 1);
    const rate = await getCurrentElectricityRate();
    const costBdt = energyKwh * rate;
    
    await updateMonthlyConsumption(port, energyKwh, costBdt);
    await updatePeakUsage(port, power);
    
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

// Control endpoint for ESP32
app.get('/api/control', (req, res) => {
  db.all("SELECT port, relay_state FROM realtime_data WHERE port <= 2 ORDER BY port", (err, rows) => {
    if (err) {
      console.error('Control endpoint database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    const response = {};
    
    for(let i = 1; i <= 2; i++) {
      const row = rows.find(r => r.port === i);
      response[`relay${i}`] = row && row.relay_state === 'ON' ? 'ON' : 'OFF';
    }
    
    console.log('Control response sent to ESP32:', response);
    res.json(response);
  });
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

// Toggle relay endpoint - for manual control only
app.post('/api/toggle', async (req, res) => {
  try {
    const { port } = req.body;
    console.log(`Toggle request received for port ${port}`);
    
    db.get("SELECT relay_state FROM realtime_data WHERE port = ?", [port], (err, row) => {
      if (err) {
        console.error('Toggle endpoint database error:', err);
        return res.status(500).json({ error: err.message });
      }
      
      const currentState = row ? row.relay_state : 'OFF';
      const newState = currentState === 'ON' ? 'OFF' : 'ON';
      
      console.log(`Port ${port}: ${currentState} -> ${newState}`);
      
      // Update only relay state, preserve other data
      db.run(`UPDATE realtime_data SET relay_state = ? WHERE port = ?`, 
             [newState, port], (err) => {
        if (err) {
          console.log(`No existing record for port ${port}, creating new one`);
          // If no existing record, create one
          db.run(`INSERT OR REPLACE INTO realtime_data (port, voltage, current, power, status, relay_state) 
                  VALUES (?, 0, 0, 0, 'offline', ?)`, 
                 [port, newState], (err) => {
            if (err) {
              console.error('Error creating new relay record:', err);
              return res.status(500).json({ error: err.message });
            }
            
            console.log(`Port ${port} relay state updated to ${newState}`);
            io.emit('relayUpdate', { port, state: newState });
            res.json({ success: true, port, state: newState });
          });
        } else {
          console.log(`Port ${port} relay state updated to ${newState}`);
          io.emit('relayUpdate', { port, state: newState });
          res.json({ success: true, port, state: newState });
        }
      });
    });
  } catch (error) {
    console.error('Toggle endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ESP32 sync trigger endpoint
app.post('/api/sync-esp32', (req, res) => {
  console.log('ESP32 sync triggered from dashboard');
  // This endpoint just confirms the sync request
  // ESP32 will sync when it polls /api/control next
  res.json({ success: true, message: 'Sync triggered - ESP32 will update on next poll' });
});

// Database viewer endpoint
app.get('/api/database/:table', (req, res) => {
  const { table } = req.params;
  const allowedTables = {
    'realtime_data': 'realtime_data',
    'daily_consumption': 'daily_consumption',
    'monthly_consumption': 'monthly_consumption',
    'settings': 'settings',
    'alerts': 'alerts',
    'peak_usage': 'peak_usage'
  };
  
  if (!allowedTables[table]) {
    return res.status(400).json({ error: 'Invalid table name' });
  }
  
  db.all(`SELECT * FROM ${allowedTables[table]} ORDER BY id DESC LIMIT 100`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ table, data: rows });
  });
});

app.get('/api/database', (req, res) => {
  const tables = {
    realtime_data: '/api/database/realtime_data',
    daily_consumption: '/api/database/daily_consumption', 
    monthly_consumption: '/api/database/monthly_consumption',
    settings: '/api/database/settings',
    alerts: '/api/database/alerts',
    peak_usage: '/api/database/peak_usage'
  };
  res.json(tables);
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

// Daily cleanup task
cron.schedule('0 0 * * *', () => {
  console.log('Running daily cleanup...');
  
  const weekAgo = moment().subtract(7, 'days').format('YYYY-MM-DD');
  db.run("DELETE FROM alerts WHERE timestamp < ?", [weekAgo]);
  
  const dayAgo = moment().subtract(1, 'day').format('YYYY-MM-DD HH:mm:ss');
  db.run("DELETE FROM realtime_data WHERE timestamp < ?", [dayAgo]);
});

// Server startup
initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Smart Power Consumption System running on port ${PORT}`);
    console.log(`Features: Real-time monitoring, Alerts, Peak detection, Export (CSV/PDF)`);
    console.log(`Waiting for WiFi module data...`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  });
});