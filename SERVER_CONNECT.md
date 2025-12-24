# Server Connection Guide

## Railway Deployment URL
**Live Dashboard**: https://smart-multiplug-system-production.up.railway.app

## ESP8266/ESP-01 Configuration

### Server Endpoint
```cpp
const char* serverURL = "https://smart-multiplug-system-production.up.railway.app/api/data";
```

### Data Format
Send HTTP POST requests with JSON payload:
```json
{
  "port": 1,
  "voltage": 220.5,
  "current": 2.3,
  "power": 507.15
}
```

## Connection Flow

```
ESP8266 → WiFi → Internet → Railway Server → SQLite Database → WebSocket → Browser
```

### 1. ESP8266 Setup
```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverURL = "https://smart-multiplug-system-production.up.railway.app/api/data";

void sendData(int port, float voltage, float current, float power) {
  if(WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    
    http.begin(client, serverURL);
    http.addHeader("Content-Type", "application/json");
    
    String json = "{\"port\":" + String(port) + 
                  ",\"voltage\":" + String(voltage) + 
                  ",\"current\":" + String(current) + 
                  ",\"power\":" + String(power) + "}";
    
    int httpCode = http.POST(json);
    Serial.printf("HTTP Response: %d\n", httpCode);
    http.end();
  }
}
```

### 2. Server Processing
- Receives data at `/api/data` endpoint
- Validates port number (1-4)
- Stores in SQLite database
- Calculates energy consumption and costs
- Generates alerts if thresholds exceeded
- Broadcasts updates via WebSocket

### 3. Real-time Dashboard
- Automatically updates when ESP8266 sends data
- Shows voltage, current, power for each port
- Displays daily/monthly consumption
- Shows alerts and optimization suggestions

## Testing Connection

### 1. Serial Monitor
Check ESP8266 serial output for:
```
WiFi connected!
HTTP Response: 200
```

### 2. Dashboard Verification
1. Open https://smart-multiplug-system-production.up.railway.app
2. Check if port data updates
3. Verify timestamp changes

### 3. API Test (Optional)
Test with curl:
```bash
curl -X POST https://smart-multiplug-system-production.up.railway.app/api/data \
  -H "Content-Type: application/json" \
  -d '{"port":1,"voltage":220,"current":2.5,"power":550}'
```

## Troubleshooting

### ESP8266 Issues
- **WiFi Connection Failed**: Check SSID/password, use 2.4GHz network
- **HTTP Error 400**: Invalid JSON format or missing fields
- **HTTP Error 500**: Server error, check server logs
- **No Response**: Check internet connectivity

### Dashboard Issues
- **No Data Updates**: Check ESP8266 is sending data successfully
- **Old Data**: Clear browser cache, refresh page
- **WebSocket Errors**: Check browser console for connection issues

## Network Requirements
- **WiFi**: 2.4GHz network (ESP8266 limitation)
- **Internet**: Stable connection for HTTP requests
- **Firewall**: Allow outbound HTTPS (port 443)
- **Bandwidth**: Minimal (~1KB per minute per device)

## Security Notes
- Uses HTTPS for encrypted data transmission
- No authentication required for sensor data
- Railway provides automatic SSL certificates
- Data stored securely in Railway's infrastructure