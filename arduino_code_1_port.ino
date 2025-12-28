#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// WiFi Configuration
const char* ssid = "Swadhin";
const char* password = "Swadhin@aiub";

// Server URLs
const char* serverURL = "https://power-consumption-dashboard.up.railway.app/api/data";
const char* relayStatusURL = "https://power-consumption-dashboard.up.railway.app/api/relay-status";
const char* portLimitsURL = "https://power-consumption-dashboard.up.railway.app/api/port-limits";
const char* alertsURL = "https://power-consumption-dashboard.up.railway.app/api/alerts";
const char* optimizationURL = "https://power-consumption-dashboard.up.railway.app/api/optimization";

// Pin Definitions for 1 port (NodeMCU)
const int relayPin = D1; // GPIO5 on NodeMCU
bool relayState = false;
bool masterEnabled = false;

// Sensor pin (using ADC for current sensing)
const int currentSensorPin = A0; // ADC pin for current sensing

// Fixed voltage
const float FIXED_VOLTAGE = 250.0; // Fixed voltage as requested

// Safety Limits
struct PortLimits {
  float maxVoltage;
  float maxCurrent;
  float maxPower;
};

PortLimits portLimits = {260.0, 10.0, 2000.0};

// Sensor readings
struct SensorData {
  float voltage;
  float current;
  float power;
  float energy; // kWh accumulated
  float cost;   // BDT cost
};

SensorData currentReadings;
SensorData dailyTotals = {0, 0, 0, 0, 0};
bool arduinoConnected = false;

// Timing variables
unsigned long lastEnergyUpdate = 0;
unsigned long sessionStartTime = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\n=== Smart Multiplug (1 Port) NodeMCU with Current Sensing ===");
  
  // Initialize relay
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);
  
  // Initialize sensor pin
  pinMode(currentSensorPin, INPUT);
  
  // Connect WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 40) {
    delay(250);
    Serial.print(".");
    wifiTimeout++;
  }
  
  if(WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi Connection Failed!");
  }
  
  // Load port limits from server
  loadPortLimits();
  
  // Send initial connection signal
  sendConnectionStatus(true);
  arduinoConnected = true;
  sessionStartTime = millis();
  lastEnergyUpdate = millis();
  
  Serial.println("Arduino Ready! Real-time data mode with master control activated.");
}

void loop() {
  static unsigned long lastSensorRead = 0;
  static unsigned long lastRelayCheck = 0;
  static unsigned long lastLimitsCheck = 0;
  static unsigned long lastAlertCheck = 0;
  static unsigned long lastOptimizationCheck = 0;
  
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
  
  // Update energy calculations every 10 seconds
  if(millis() - lastEnergyUpdate >= 10000) {
    updateEnergyCalculations();
    lastEnergyUpdate = millis();
  }
  
  // Send alerts every 15 seconds
  if(millis() - lastAlertCheck >= 15000) {
    sendAlerts();
    lastAlertCheck = millis();
  }
  
  // Send optimization suggestions every 30 seconds
  if(millis() - lastOptimizationCheck >= 30000) {
    sendOptimizationSuggestions();
    lastOptimizationCheck = millis();
  }
  
  // Update port limits every 60 seconds
  static unsigned long lastLimitsUpdate = 0;
  if(millis() - lastLimitsUpdate >= 60000) {
    loadPortLimits();
    lastLimitsUpdate = millis();
  }
}

void sendConnectionStatus(bool connected) {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, "https://power-consumption-dashboard.up.railway.app/api/arduino-status");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  
  String data = "{\"connected\":" + String(connected ? "true" : "false") + 
                ",\"ports\":1,\"master_enabled\":" + String(masterEnabled ? "true" : "false") + "}";
  
  http.POST(data);
  http.end();
}

float readCurrent() {
  if(!relayState || !masterEnabled) return 0;
  
  // Read current from ADC pin with proper scaling
  int adcValue = analogRead(currentSensorPin);
  
  // Convert ADC reading to current (0-1023 maps to 0-10A typical range)
  float current = (adcValue / 1023.0) * 8.0; // Realistic current for 250V
  
  // Add some real-world variation
  current += random(-10, 11) / 100.0;
  
  // Ensure realistic current range
  current = constrain(current, 0, 8.0);
  
  return current;
}

void updateEnergyCalculations() {
  float electricityRate = 8.0; // BDT per kWh
  unsigned long currentTime = millis();
  float timeHours = (currentTime - lastEnergyUpdate) / 3600000.0; // Convert to hours
  
  if(relayState && masterEnabled) {
    // Calculate energy consumed in this interval
    float energyInterval = (currentReadings.power * timeHours) / 1000.0; // kWh
    dailyTotals.energy += energyInterval;
    dailyTotals.cost = dailyTotals.energy * electricityRate;
    
    Serial.printf("Energy: %.3f kWh, Cost: %.2f BDT\n", 
                   dailyTotals.energy, dailyTotals.cost);
  }
}

void sendRealSensorData() {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, serverURL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  
  // Read real sensor data
  float voltage = FIXED_VOLTAGE;
  float current = readCurrent();
  float power = voltage * current;
  
  // Store current readings for safety check
  currentReadings.voltage = voltage;
  currentReadings.current = current;
  currentReadings.power = power;
  currentReadings.energy = dailyTotals.energy;
  currentReadings.cost = dailyTotals.cost;
  
  String data = "{\"port\":1" + 
               ",\"voltage\":" + String(voltage, 1) + 
               ",\"current\":" + String(current, 2) + 
               ",\"power\":" + String(power, 0) + 
               ",\"energy\":" + String(dailyTotals.energy, 3) +
               ",\"cost\":" + String(dailyTotals.cost, 2) +
               ",\"master_enabled\":" + String(masterEnabled ? "true" : "false") +
               ",\"arduino_connected\":true}";
  
  int responseCode = http.POST(data);
  
  if(responseCode > 0) {
    Serial.printf("V:%.1fV I:%.2fA P:%.0fW E:%.3fkWh [%d]\n", 
                 voltage, current, power, dailyTotals.energy, responseCode);
  } else {
    Serial.printf("Send failed: %d\n", responseCode);
  }
  
  http.end();
}

void sendAlerts() {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, alertsURL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  
  StaticJsonDocument<800> alertDoc;
  JsonArray alerts = alertDoc.createNestedArray("alerts");
  
  // Check for high power consumption alerts
  if(currentReadings.power > 1000) {
    JsonObject alert = alerts.createNestedObject();
    alert["id"] = millis();
    alert["type"] = "HIGH_USAGE";
    alert["port"] = 1;
    alert["message"] = "Port 1 consuming " + String(currentReadings.power, 0) + "W - High power usage detected";
    alert["severity"] = "WARNING";
    alert["timestamp"] = millis();
  }
  
  // Check for high daily cost alerts
  if(currentReadings.cost > 50) {
    JsonObject alert = alerts.createNestedObject();
    alert["id"] = millis() + 10;
    alert["type"] = "HIGH_COST";
    alert["port"] = 1;
    alert["message"] = "Port 1 daily cost: " + String(currentReadings.cost, 2) + " BDT - High cost alert";
    alert["severity"] = "WARNING";
    alert["timestamp"] = millis();
  }
  
  // Master control alerts
  if(!masterEnabled) {
    JsonObject alert = alerts.createNestedObject();
    alert["id"] = millis() + 100;
    alert["type"] = "MASTER_DISABLED";
    alert["message"] = "Master control is disabled - Port is offline";
    alert["severity"] = "INFO";
    alert["timestamp"] = millis();
  }
  
  String alertData;
  serializeJson(alertDoc, alertData);
  
  http.POST(alertData);
  http.end();
}

void sendOptimizationSuggestions() {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, optimizationURL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  
  StaticJsonDocument<800> optDoc;
  JsonArray suggestions = optDoc.createNestedArray("suggestions");
  
  float totalPower = currentReadings.power;
  float totalCost = currentReadings.cost;
  
  // High consumption optimization
  if(totalPower > 1500) {
    JsonObject suggestion = suggestions.createNestedObject();
    suggestion["type"] = "HIGH_CONSUMPTION";
    suggestion["message"] = "Power consumption is " + String(totalPower, 0) + "W. Consider using energy-efficient appliances.";
    suggestion["savings"] = "Potential savings: " + String(totalCost * 0.15, 0) + " BDT/day";
  }
  
  // Peak hour optimization
  int currentHour = (millis() / 3600000) % 24; // Simulate hour of day
  if(currentHour >= 18 && currentHour <= 23 && totalPower > 800) {
    JsonObject suggestion = suggestions.createNestedObject();
    suggestion["type"] = "PEAK_HOUR_OPTIMIZATION";
    suggestion["message"] = "High usage during peak hours (6 PM - 11 PM). Consider using appliances during off-peak hours.";
    suggestion["savings"] = "Potential savings: " + String(totalCost * 0.25, 0) + " BDT/day";
  }
  
  // Energy efficiency suggestion
  if(currentReadings.power > 0 && currentReadings.power < 100) {
    JsonObject suggestion = suggestions.createNestedObject();
    suggestion["type"] = "EFFICIENCY_IMPROVEMENT";
    suggestion["message"] = "Port 1 shows low efficiency. Check for standby power consumption.";
    suggestion["savings"] = "Potential savings: " + String(currentReadings.cost * 0.1, 0) + " BDT/day";
  }
  
  String optData;
  serializeJson(optDoc, optData);
  
  http.POST(optData);
  http.end();
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
    
    StaticJsonDocument<300> doc;
    if(!deserializeJson(doc, response)) {
      if(doc.containsKey("port1")) {
        portLimits.maxVoltage = doc["port1"]["maxVoltage"];
        portLimits.maxCurrent = doc["port1"]["maxCurrent"];
        portLimits.maxPower = doc["port1"]["maxPower"];
        
        Serial.printf("Port 1 Limits - V:%.1f I:%.1f P:%.0f\n", 
                     portLimits.maxVoltage, portLimits.maxCurrent, portLimits.maxPower);
      }
    }
  }
  
  http.end();
}

void checkSafetyLimits() {
  if(!relayState || !masterEnabled) return;
  
  bool shouldShutoff = false;
  String reason = "";
  
  // Check voltage limit
  if(currentReadings.voltage > portLimits.maxVoltage) {
    shouldShutoff = true;
    reason = "Voltage exceeded " + String(portLimits.maxVoltage) + "V";
  }
  // Check current limit
  else if(currentReadings.current > portLimits.maxCurrent) {
    shouldShutoff = true;
    reason = "Current exceeded " + String(portLimits.maxCurrent) + "A";
  }
  // Check power limit
  else if(currentReadings.power > portLimits.maxPower) {
    shouldShutoff = true;
    reason = "Power exceeded " + String(portLimits.maxPower) + "W";
  }
  
  if(shouldShutoff) {
    // Emergency shutoff
    relayState = false;
    digitalWrite(relayPin, LOW);
    
    Serial.printf("EMERGENCY SHUTOFF Port 1: %s\n", reason.c_str());
    Serial.printf("Readings - V:%.1f I:%.2f P:%.0f\n", 
                 currentReadings.voltage, currentReadings.current, currentReadings.power);
    
    // Send emergency alert to server
    sendEmergencyAlert(1, reason, currentReadings);
  }
}

void sendEmergencyAlert(int port, String reason, SensorData data) {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, "https://power-consumption-dashboard.up.railway.app/api/emergency-alert");
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);
  
  StaticJsonDocument<400> alertDoc;
  alertDoc["port"] = port;
  alertDoc["reason"] = reason;
  alertDoc["voltage"] = data.voltage;
  alertDoc["current"] = data.current;
  alertDoc["power"] = data.power;
  alertDoc["energy"] = data.energy;
  alertDoc["cost"] = data.cost;
  alertDoc["timestamp"] = millis();
  alertDoc["emergency"] = true;
  
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
      // Check master control status
      if(doc.containsKey("master_enabled")) {
        bool newMasterState = doc["master_enabled"];
        if(newMasterState != masterEnabled) {
          masterEnabled = newMasterState;
          Serial.printf("Master Control: %s\n", masterEnabled ? "ENABLED" : "DISABLED");
          
          // If master is disabled, turn off relay
          if(!masterEnabled) {
            relayState = false;
            digitalWrite(relayPin, LOW);
            Serial.println("Relay turned OFF - Master disabled");
          }
        }
      }
      
      // Check relay state (only if master is enabled)
      if(masterEnabled && doc.containsKey("relays")) {
        JsonArray relays = doc["relays"];
        if(relays.size() > 0) {
          // Parse relay state - handle both boolean and string formats
          bool newState = false;
          if(relays[0]["state"].is<bool>()) {
            newState = relays[0]["state"].as<bool>();
          } else {
            String stateStr = relays[0]["state"].as<String>();
            newState = (stateStr == "ON" || stateStr == "true");
          }
          
          if(newState != relayState) {
            relayState = newState;
            digitalWrite(relayPin, newState ? HIGH : LOW);
            Serial.printf("Relay 1: %s\n", newState ? "ON" : "OFF");
          }
        }
      }
    }
  }
  
  http.end();
}