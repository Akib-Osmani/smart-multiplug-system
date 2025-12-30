// Database operations - FIXED VERSION
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