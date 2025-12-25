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

// Pin Definitions for 4 ports
const int relayPins[4] = {5, 4, 0, 2}; // D1=GPIO5, D2=GPIO4, D3=GPIO0, D4=GPIO2
bool relayStates[4] = {false, false, false, false};

// Safety Limits for each port (default values)
struct PortLimits {
  float maxVoltage;
  float maxCurrent;
  float maxPower;
};

PortLimits portLimits[4] = {
  {240.0, 10.0, 2000.0}, // Port 1
  {240.0, 10.0, 2000.0}, // Port 2
  {240.0, 10.0, 2000.0}, // Port 3
  {240.0, 10.0, 2000.0}  // Port 4
};

// Current sensor readings
struct SensorData {
  float voltage;
  float current;
  float power;
};

SensorData currentReadings[4];

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\n=== Smart Multiplug (4 Ports) with Safety Limits ===");
  
  // Initialize relays
  for(int i = 0; i < 4; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], LOW);
  }
  
  // Connect WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi OK: " + WiFi.localIP().toString());
  
  // Load port limits from server
  loadPortLimits();
  
  // Quick setup
  sendInitialData();
}

void loop() {
  static unsigned long lastSensorRead = 0;
  static unsigned long lastRelayCheck = 0;
  static unsigned long lastLimitsCheck = 0;
  
  // Send sensor data every 10 seconds
  if(millis() - lastSensorRead >= 10000) {
    sendSensorData();
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
    
    StaticJsonDocument<1000> doc;
    if(!deserializeJson(doc, response)) {
      for(int i = 0; i < 4; i++) {
        String portKey = "port" + String(i + 1);
        if(doc.containsKey(portKey)) {
          portLimits[i].maxVoltage = doc[portKey]["maxVoltage"];
          portLimits[i].maxCurrent = doc[portKey]["maxCurrent"];
          portLimits[i].maxPower = doc[portKey]["maxPower"];
          
          Serial.printf("Port %d Limits - V:%.1f, I:%.1f, P:%.0f\n", 
                       i+1, portLimits[i].maxVoltage, 
                       portLimits[i].maxCurrent, portLimits[i].maxPower);
        }
      }
    }
  }
  
  http.end();
}

void checkSafetyLimits() {
  for(int port = 0; port < 4; port++) {
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
      Serial.printf("Readings - V:%.1f, I:%.2f, P:%.0f\n", 
                   data.voltage, data.current, data.power);
      
      // Send emergency alert to server
      sendEmergencyAlert(port + 1, reason, data);
      
      delay(100); // Brief delay to ensure relay is off
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

void sendInitialData() {
  Serial.println("Setup database...");
  
  for(int port = 1; port <= 4; port++) {
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    http.begin(client, serverURL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3000);
    
    String data = "{\"port\":" + String(port) + ",\"voltage\":220,\"current\":1.5,\"power\":330}";
    
    int code = http.POST(data);
    Serial.printf("Port %d: %d\n", port, code);
    
    http.end();
    delay(200);
  }
  
  Serial.println("Ready! Toggle via dashboard.");
}

void sendSensorData() {
  for(int port = 1; port <= 4; port++) {
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    http.begin(client, serverURL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(3000);
    
    // Generate realistic sensor data based on relay state
    float voltage = 0;
    float current = 0;
    float power = 0;
    
    if(relayStates[port-1]) {
      // Simulate realistic readings with occasional spikes for testing
      voltage = 220 + random(-3, 4);
      current = 1.5 + (random(0, 100) / 100.0);
      
      // Occasionally simulate high readings for testing safety limits
      if(random(0, 100) < 2) { // 2% chance
        voltage += random(10, 30); // Voltage spike
      }
      if(random(0, 100) < 2) { // 2% chance
        current += random(5, 15); // Current spike
      }
      
      power = voltage * current;
    }
    
    // Store current readings for safety check
    currentReadings[port-1].voltage = voltage;
    currentReadings[port-1].current = current;
    currentReadings[port-1].power = power;
    
    String data = "{\"port\":" + String(port) + 
                 ",\"voltage\":" + String(voltage) + 
                 ",\"current\":" + String(current) + 
                 ",\"power\":" + String(power) + "}";
    
    http.POST(data);
    http.end();
    delay(100);
  }
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
    
    StaticJsonDocument<500> doc;
    if(!deserializeJson(doc, response)) {
      JsonArray relays = doc["relays"];
      for(int i = 0; i < 4; i++) {
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