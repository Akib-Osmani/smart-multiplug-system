# Arduino ESP8266 Integration Guide

## Hardware Requirements

### Components Needed
- **ESP8266 NodeMCU** (or ESP32)
- **ACS712 Current Sensors** (4x for each port)
- **ZMPT101B Voltage Sensors** (4x for each port)
- **Relay Modules** (4x for switching control)
- **Breadboard/PCB** for connections
- **Resistors** (10kΩ pull-up resistors)
- **Capacitors** (100µF for power filtering)

### Wiring Diagram
```
ESP8266 NodeMCU Connections:
├── Port 1: A0 (Voltage), D1 (Current), D5 (Relay)
├── Port 2: A1 (Voltage), D2 (Current), D6 (Relay)  
├── Port 3: A2 (Voltage), D3 (Current), D7 (Relay)
└── Port 4: A3 (Voltage), D4 (Current), D8 (Relay)

Power Supply: 5V/3A adapter
WiFi: 2.4GHz network required
```

## Data Collection

### Required Sensor Data
The system needs these measurements for each port:

1. **Voltage (V)**: AC voltage measurement (220V nominal)
2. **Current (A)**: AC current consumption 
3. **Power (W)**: Calculated as V × I × Power Factor
4. **Port Number**: 1-4 identifier
5. **Timestamp**: Optional (server auto-generates)

### Sensor Specifications
- **Voltage Range**: 0-250V AC
- **Current Range**: 0-30A AC  
- **Accuracy**: ±1% for voltage, ±2% for current
- **Sampling Rate**: 1 sample per minute minimum
- **Resolution**: 12-bit ADC (4096 levels)

## Arduino Code Implementation

### Complete ESP8266 Code
```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <WiFiClient.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server Configuration  
const char* serverURL = "https://your-app.railway.app/api/data";

// Pin Definitions
const int voltagePins[4] = {A0, A1, A2, A3};  // Voltage sensor pins
const int currentPins[4] = {D1, D2, D3, D4};  // Current sensor pins
const int relayPins[4] = {D5, D6, D7, D8};    // Relay control pins

// Calibration Constants
const float voltageCalibration = 220.0 / 1024.0;  // Adjust based on your setup
const float currentCalibration = 30.0 / 1024.0;   // Adjust based on ACS712 model
const float powerFactor = 0.95;  // Typical power factor for resistive loads

void setup() {
  Serial.begin(115200);
  
  // Initialize pins
  for(int i = 0; i < 4; i++) {
    pinMode(currentPins[i], INPUT);
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], HIGH); // Relays active LOW
  }
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Read sensors for all 4 ports
  for(int port = 1; port <= 4; port++) {
    float voltage = readVoltage(port - 1);
    float current = readCurrent(port - 1);
    float power = voltage * current * powerFactor;
    
    // Send data to server
    sendSensorData(port, voltage, current, power);
    
    Serial.printf("Port %d: %.1fV, %.2fA, %.1fW\n", port, voltage, current, power);
  }
  
  // Wait 60 seconds before next reading
  delay(60000);
}

float readVoltage(int portIndex) {
  int rawValue = analogRead(voltagePins[portIndex]);
  
  // Convert ADC reading to voltage
  // Assuming voltage divider circuit for AC measurement
  float voltage = rawValue * voltageCalibration;
  
  // Apply calibration offset if needed
  if(voltage < 10) voltage = 0; // Noise filtering
  
  return voltage;
}

float readCurrent(int portIndex) {
  int rawValue = analogRead(currentPins[portIndex]);
  
  // ACS712 outputs 2.5V at 0A, sensitivity varies by model
  // ACS712-05B: 185mV/A
  // ACS712-20A: 100mV/A  
  // ACS712-30A: 66mV/A
  
  float voltage = (rawValue * 5.0) / 1024.0;
  float current = (voltage - 2.5) / 0.066; // For ACS712-30A
  
  if(current < 0.1) current = 0; // Noise filtering
  
  return abs(current);
}

void sendSensorData(int port, float voltage, float current, float power) {
  if(WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    
    http.begin(client, serverURL);
    http.addHeader("Content-Type", "application/json");
    
    // Create JSON payload
    StaticJsonDocument<200> doc;
    doc["port"] = port;
    doc["voltage"] = voltage;
    doc["current"] = current;
    doc["power"] = power;
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Send POST request
    int httpResponseCode = http.POST(jsonString);
    
    if(httpResponseCode > 0) {
      String response = http.getString();
      Serial.printf("HTTP Response: %d - %s\n", httpResponseCode, response.c_str());
    } else {
      Serial.printf("HTTP Error: %d\n", httpResponseCode);
    }
    
    http.end();
  } else {
    Serial.println("WiFi not connected!");
  }
}
```

### Required Libraries
Install these libraries in Arduino IDE:
```
1. ESP8266WiFi (built-in)
2. ESP8266HTTPClient (built-in)  
3. ArduinoJson (by Benoit Blanchon)
4. WiFiClient (built-in)
```

## Connection Setup

### Step 1: Hardware Assembly
1. **Connect voltage sensors** to analog pins A0-A3
2. **Connect current sensors** to digital pins D1-D4
3. **Connect relay modules** to digital pins D5-D8
4. **Power all sensors** with 5V from ESP8266
5. **Add pull-up resistors** on digital pins

### Step 2: WiFi Configuration
```cpp
// Replace with your network credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

### Step 3: Server URL Configuration
```cpp
// Replace with your Railway deployment URL
const char* serverURL = "https://your-app.railway.app/api/data";
```

### Step 4: Sensor Calibration
1. **Measure actual voltage** with multimeter
2. **Adjust voltageCalibration** constant
3. **Test current sensors** with known loads
4. **Adjust currentCalibration** constant

## Data Transmission Protocol

### JSON Format
```json
{
  "port": 1,           // Port number (1-4)
  "voltage": 220.5,    // AC Voltage in Volts
  "current": 2.3,      // AC Current in Amperes  
  "power": 507.15      // Power in Watts (V×I×PF)
}
```

### Transmission Schedule
- **Frequency**: Every 60 seconds
- **Method**: HTTP POST request
- **Endpoint**: `/api/data`
- **Content-Type**: `application/json`

### Error Handling
```cpp
// Retry mechanism for failed transmissions
int retryCount = 0;
const int maxRetries = 3;

while(retryCount < maxRetries) {
  int response = http.POST(jsonString);
  if(response == 200) break;
  retryCount++;
  delay(5000); // Wait 5 seconds before retry
}
```

## Testing & Validation

### Step 1: Serial Monitor Testing
1. Open Arduino IDE Serial Monitor (115200 baud)
2. Check WiFi connection status
3. Verify sensor readings are reasonable
4. Confirm HTTP response codes (200 = success)

### Step 2: Dashboard Verification
1. Open your Railway dashboard URL
2. Check if real-time data updates
3. Verify port-specific readings
4. Test alert generation for high usage

### Step 3: Calibration Process
```cpp
// Calibration mode - add to setup()
void calibrationMode() {
  Serial.println("=== CALIBRATION MODE ===");
  
  for(int i = 0; i < 4; i++) {
    float v = readVoltage(i);
    float c = readCurrent(i);
    Serial.printf("Port %d: Raw V=%d, Calc V=%.1f, Raw C=%d, Calc C=%.2f\n", 
                  i+1, analogRead(voltagePins[i]), v, 
                  analogRead(currentPins[i]), c);
  }
  delay(2000);
}
```

## Troubleshooting

### Common Issues
1. **WiFi Connection Failed**
   - Check SSID/password
   - Ensure 2.4GHz network
   - Check signal strength

2. **HTTP POST Failed**
   - Verify server URL
   - Check internet connectivity
   - Confirm JSON format

3. **Inaccurate Readings**
   - Calibrate voltage/current constants
   - Check sensor wiring
   - Add noise filtering

4. **Power Supply Issues**
   - Use adequate 5V/3A supply
   - Add filtering capacitors
   - Check voltage drops

### Debug Commands
```cpp
// Add to loop() for debugging
Serial.printf("Free Heap: %d bytes\n", ESP.getFreeHeap());
Serial.printf("WiFi RSSI: %d dBm\n", WiFi.RSSI());
Serial.printf("Uptime: %lu seconds\n", millis()/1000);
```

## Advanced Features

### OTA Updates
```cpp
#include <ArduinoOTA.h>

void setupOTA() {
  ArduinoOTA.setHostname("smart-multiplug");
  ArduinoOTA.setPassword("your-ota-password");
  ArduinoOTA.begin();
}

// Add to loop()
ArduinoOTA.handle();
```

### Watchdog Timer
```cpp
#include <Ticker.h>

Ticker watchdog;

void resetSystem() {
  ESP.restart();
}

void setup() {
  watchdog.attach(300, resetSystem); // Reset after 5 minutes of no activity
}
```

### Local Web Server (Optional)
```cpp
#include <ESP8266WebServer.h>

ESP8266WebServer server(80);

void handleRoot() {
  String html = "<h1>Smart Multiplug Status</h1>";
  for(int i = 0; i < 4; i++) {
    html += "<p>Port " + String(i+1) + ": " + String(readVoltage(i)) + "V, " + String(readCurrent(i)) + "A</p>";
  }
  server.send(200, "text/html", html);
}

void setup() {
  server.on("/", handleRoot);
  server.begin();
}

void loop() {
  server.handleClient();
}
```

## Production Deployment

### Security Considerations
1. **Change default passwords**
2. **Use HTTPS endpoints**
3. **Implement device authentication**
4. **Regular firmware updates**

### Monitoring
1. **Device health checks**
2. **Network connectivity monitoring**  
3. **Sensor accuracy validation**
4. **Power supply monitoring**

Your ESP8266 is now ready to send real-time data to your Smart Multiplug Dashboard!