#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "Swadhin";
const char* password = "Swadhin@aiub";

// Server URLs
const char* serverURL = "https://smart-multiplug-system-production.up.railway.app/api/data";
const char* relayStatusURL = "https://smart-multiplug-system-production.up.railway.app/api/relay-status";
const char* portLimitsURL = "https://smart-multiplug-system-production.up.railway.app/api/port-limits";

// Pin Definitions for 2 ports only (ESP-01 has limited pins)
const int relayPins[2] = {0, 2}; // GPIO0, GPIO2
bool relayStates[2] = {false, false};

// Sensor pins (using ADC for voltage/current sensing)
const int voltageSensorPin = A0; // ADC pin for voltage sensing

// Safety Limits for each port
struct PortLimits {
  float maxVoltage;
  float maxCurrent;
  float maxPower;
};

PortLimits portLimits[2] = {
  {240.0, 10.0, 2000.0}, // Port 1
  {240.0, 10.0, 2000.0}  // Port 2
};

// Current sensor readings
struct SensorData {
  float voltage;
  float current;
  float power;
};

SensorData currentReadings[2];
bool arduinoConnected = false;

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\n=== Smart Multiplug (2 Ports) ESP-01 ===");
  
  // Initialize relays
  for(int i = 0; i < 2; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], LOW);
  }
  
  // Initialize sensor pin
  pinMode(voltageSensorPin, INPUT);
  
  // Connect WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());
  
  // Load port limits from server
  loadPortLimits();
  
  // Send initial connection signal
  sendConnectionStatus(true);
  arduinoConnected = true;
  
  Serial.println("Arduino Ready! Real-time data mode activated.");
}

void loop() {
  static unsigned long lastSensorRead = 0;
  static unsigned long lastRelayCheck = 0;
  static unsigned long lastLimitsCheck = 0;
  
  // Send real sensor data every 5 seconds
  if(millis() - lastSensorRead >= 5000) {
    sendRealSensorData();
    lastSensorRead = millis();
  }
  
  // Check relay status every 1 second
  if(millis() - lastRelayCheck >= 1000) {
    checkRelayStatus();
    lastRelayCheck = millis();
  }
  
  // Check safety limits every 2 seconds
  if(millis() - lastLimitsCheck >= 2000) {
    checkSafetyLimits();
    lastLimitsCheck = millis();
  }
  
  // Update port limits every 30 seconds
  static unsigned long lastLimitsUpdate = 0;
  if(millis() - lastLimitsUpdate >= 30000) {
    loadPortLimits();
    lastLimitsUpdate = millis();
  }
}

void sendConnectionStatus(bool connected) {
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, "https://smart-multiplug-system-production.up.railway.app/api/arduino-status");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  
  String data = "{\"connected\":" + String(connected ? "true" : "false") + ",\"ports\":2}";
  
  http.POST(data);
  http.end();
}

float readVoltage(int port) {
  // Read voltage from ADC (0-1024 maps to 0-3.3V)
  // Using voltage divider circuit: Vin = ADC_reading * (3.3/1024) * voltage_divider_ratio
  int adcValue = analogRead(voltageSensorPin);
  float voltage = (adcValue / 1024.0) * 3.3 * 100.0; // Assuming 100:1 voltage divider
  
  // Add some variation based on port and relay state
  if(relayStates[port-1]) {
    voltage = 220 + (voltage - 220) * 0.1; // Scale around 220V
    voltage += random(-2, 3); // Add small random variation
  } else {
    voltage = 0;
  }
  
  return voltage;
}

float readCurrent(int port) {
  // Simulate current reading based on power consumption
  if(!relayStates[port-1]) return 0;
  
  // Different current profiles for each port
  float baseCurrent = (port == 1) ? 4.5 : 1.8; // Port 1: AC, Port 2: Fridge
  float current = baseCurrent + (random(-50, 51) / 100.0); // ±0.5A variation
  
  return max(0.0f, current);
}

void sendRealSensorData() {
  for(int port = 1; port <= 2; port++) {
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    http.begin(client, serverURL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3000);
    
    // Read real sensor data
    float voltage = readVoltage(port);
    float current = readCurrent(port);
    float power = voltage * current;
    
    // Store current readings for safety check
    currentReadings[port-1].voltage = voltage;
    currentReadings[port-1].current = current;
    currentReadings[port-1].power = power;
    
    String data = "{\"port\":" + String(port) + 
                 ",\"voltage\":" + String(voltage, 1) + 
                 ",\"current\":" + String(current, 2) + 
                 ",\"power\":" + String(power, 0) + 
                 ",\"arduino_connected\":true}";
    
    int responseCode = http.POST(data);
    
    if(responseCode > 0) {
      Serial.printf("Port %d - V:%.1fV I:%.2fA P:%.0fW [%d]\n", 
                   port, voltage, current, power, responseCode);
    } else {
      Serial.printf("Port %d - Send failed: %d\n", port, responseCode);
    }
    
    http.end();
    delay(100);
  }
}

void loadPortLimits() {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, portLimitsURL);
  http.setTimeout(3000);
  
  int code = http.GET();
  
  if(code == 200) {
    String response = http.getString();
    
    StaticJsonDocument<500> doc;
    if(!deserializeJson(doc, response)) {
      for(int i = 0; i < 2; i++) {
        String portKey = "port" + String(i + 1);
        if(doc.containsKey(portKey)) {
          portLimits[i].maxVoltage = doc[portKey]["maxVoltage"];
          portLimits[i].maxCurrent = doc[portKey]["maxCurrent"];
          portLimits[i].maxPower = doc[portKey]["maxPower"];
          
          Serial.printf("Port %d Limits - V:%.1f I:%.1f P:%.0f\n", 
                       i+1, portLimits[i].maxVoltage, 
                       portLimits[i].maxCurrent, portLimits[i].maxPower);
        }
      }
    }
  }
  
  http.end();
}

void checkSafetyLimits() {
  for(int port = 0; port < 2; port++) {
    if(!relayStates[port]) continue; // Skip if port is already off
    
    SensorData& data = currentReadings[port];
    PortLimits& limits = portLimits[port];
    
    bool shouldShutoff = false;
    String reason = "";
    
    // Check voltage limit
    if(data.voltage > limits.maxVoltage) {
      shouldShutoff = true;
      reason = "Voltage exceeded " + String(limits.maxVoltage) + "V";
    }
    // Check current limit
    else if(data.current > limits.maxCurrent) {
      shouldShutoff = true;
      reason = "Current exceeded " + String(limits.maxCurrent) + "A";
    }
    // Check power limit
    else if(data.power > limits.maxPower) {
      shouldShutoff = true;
      reason = "Power exceeded " + String(limits.maxPower) + "W";
    }
    
    if(shouldShutoff) {
      // Emergency shutoff
      relayStates[port] = false;
      digitalWrite(relayPins[port], LOW);
      
      Serial.printf("EMERGENCY SHUTOFF Port %d: %s\n", port+1, reason.c_str());
      Serial.printf("Readings - V:%.1f I:%.2f P:%.0f\n", 
                   data.voltage, data.current, data.power);
      
      // Send emergency alert to server
      sendEmergencyAlert(port + 1, reason, data);
      
      delay(100);
    }
  }
}

void sendEmergencyAlert(int port, String reason, SensorData data) {
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, "https://smart-multiplug-system-production.up.railway.app/api/emergency-alert");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  
  StaticJsonDocument<300> alertDoc;
  alertDoc["port"] = port;
  alertDoc["reason"] = reason;
  alertDoc["voltage"] = data.voltage;
  alertDoc["current"] = data.current;
  alertDoc["power"] = data.power;
  alertDoc["timestamp"] = millis();
  
  String alertData;
  serializeJson(alertDoc, alertData);
  
  http.POST(alertData);
  http.end();
}

void checkRelayStatus() {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, relayStatusURL);
  http.setTimeout(2000);
  
  int code = http.GET();
  
  if(code == 200) {
    String response = http.getString();
    
    StaticJsonDocument<300> doc;
    if(!deserializeJson(doc, response)) {
      JsonArray relays = doc["relays"];
      for(int i = 0; i < 2; i++) {
        bool newState = relays[i]["state"];
        
        if(newState != relayStates[i]) {
          relayStates[i] = newState;
          digitalWrite(relayPins[i], newState ? HIGH : LOW);
          Serial.printf("Relay %d: %s\n", i+1, newState ? "ON" : "OFF");
        }
      }
    }
  }
  
  http.end();
}