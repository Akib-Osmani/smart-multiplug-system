#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ACS712.h>  // Add ACS712 Library
#include <ZMPT101B.h>  // Add ZMPT101B Library

// WiFi Configuration
const char* ssid = "akib";
const char* password = "0123456789";

// Server URLs
const char* serverURL = "https://power-consumption-dashboard.up.railway.app/api/data";
const char* controlURL = "https://power-consumption-dashboard.up.railway.app/api/control";

// Pin Definitions for ESP32-C3 (2 ports)
const int relayPins[2] = {2, 3}; // GPIO2, GPIO3
bool relayStates[2] = {false, false};

// OLED Display (I2C)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
// I2C pins: SDA = GPIO8, SCL = GPIO9
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Sensor pins (using ADC for voltage/current sensing)
const int voltageSensorPin = A0; // ADC pin for voltage sensing

// Initialize ACS712 current sensor and ZMPT101B voltage sensor
ACS712 currentSensor(0); // Use appropriate pin number for ACS712
ZMPT101B voltageSensor(A1); // Use appropriate pin for voltage sensor

// Current sensor readings
struct SensorData {
  float voltage;
  float current;
  float power;
  float energy; // kWh accumulated
  float cost;   // BDT cost
};

SensorData currentReadings[2];
SensorData dailyTotals[2];

// Timing variables
unsigned long lastEnergyUpdate = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\n=== Smart Power Consumption (2 Ports) ESP32-C3 ===");
  
  // Initialize relays
  for(int i = 0; i < 2; i++) {
    pinMode(relayPins[i], OUTPUT);
    digitalWrite(relayPins[i], LOW);
    // Initialize daily totals
    dailyTotals[i] = {0, 0, 0, 0, 0};
    Serial.printf("Relay %d initialized: OFF\n", i+1);
  }
  
  // Initialize sensor pins
  pinMode(voltageSensorPin, INPUT);
  
  // Initialize OLED display
  Wire.begin(5, 6); // Try GPIO5=SDA, GPIO6=SCL
  Serial.println("Initializing OLED...");
  
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED allocation failed - trying 0x3D");
    if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
      Serial.println("OLED failed on both addresses");
    } else {
      Serial.println("OLED found at 0x3D");
    }
  } else {
    Serial.println("OLED found at 0x3C");
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0,0);
  display.println("Smart Power Consumption");
  display.println("Initializing...");
  display.display();
  delay(1000);
  
  // Connect WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(250);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());
  
  lastEnergyUpdate = millis();
  
  Serial.println("ESP32-C3 Ready! Auto-sync enabled every 3 seconds.");
  Serial.println("Commands: 1ON, 1OFF, 2ON, 2OFF, STATUS, SYNC, TEST");
  Serial.println("STATUS - Show system status");
  Serial.println("SYNC - Manual server sync");
  Serial.println("TEST - Test server connection");
  Serial.println("Toggle buttons will control hardware within 3 seconds");
  
  // Initial sync with server
  Serial.println("Syncing with server...");
  checkControlCommands();
}

void loop() {
  static unsigned long lastSensorRead = 0;
  static unsigned long lastDisplayUpdate = 0;
  static unsigned long lastControlCheck = 0;
  
  // Send real sensor data every 5 seconds
  if(millis() - lastSensorRead >= 5000) {
    sendRealSensorData();
    lastSensorRead = millis();
  }
  
  // Update OLED display every 2 seconds
  if(millis() - lastDisplayUpdate >= 2000) {
    updateOLEDDisplay();
    lastDisplayUpdate = millis();
  }
  
  // Check for control commands every 3 seconds (fast auto-sync)
  if(millis() - lastControlCheck >= 3000) {
    checkControlCommands();
    lastControlCheck = millis();
  }
  
  // Update energy calculations every 10 seconds
  if(millis() - lastEnergyUpdate >= 10000) {
    updateEnergyCalculations();
    lastEnergyUpdate = millis();
  }
  
  // Check for manual relay control via Serial Monitor
  if(Serial.available()) {
    String command = Serial.readString();
    command.trim();
    
    if(command == "1ON") {
      setRelay(1, true);
    }
    else if(command == "1OFF") {
      setRelay(1, false);
    }
    else if(command == "2ON") {
      setRelay(2, true);
    }
    else if(command == "2OFF") {
      setRelay(2, false);
    }
    else if(command == "STATUS") {
      Serial.printf("=== ESP32 Status ===\n");
      Serial.printf("WiFi: %s (IP: %s)\n", WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected", WiFi.localIP().toString().c_str());
      Serial.printf("Relay 1: %s (GPIO%d)\n", relayStates[0] ? "ON" : "OFF", relayPins[0]);
      Serial.printf("Relay 2: %s (GPIO%d)\n", relayStates[1] ? "ON" : "OFF", relayPins[1]);
      Serial.printf("Server URL: %s\n", serverURL);
      Serial.printf("Control URL: %s\n", controlURL);
    }
    else if(command == "SYNC") {
      Serial.println("Manual sync with server...");
      checkControlCommands();
    }
    else if(command == "TEST") {
      Serial.println("Testing server connection...");
      WiFiClientSecure client;
      client.setInsecure();
      HTTPClient http;
      http.begin(client, controlURL);
      int code = http.GET();
      Serial.printf("Test result: HTTP %d\n", code);
      if(code == 200) {
        Serial.println("Response: " + http.getString());
      }
      http.end();
    }
  }
}

void setRelay(int port, bool state) {
  if(port >= 1 && port <= 2) {
    relayStates[port-1] = state;
    digitalWrite(relayPins[port-1], state ? HIGH : LOW);
    Serial.printf("Relay %d: %s (GPIO%d = %s)\n", 
                  port, state ? "ON" : "OFF", 
                  relayPins[port-1], state ? "HIGH" : "LOW");
  }
}

void checkControlCommands() {
  WiFiClientSecure client;
  client.setInsecure();
  
  HTTPClient http;
  http.begin(client, controlURL);
  http.setTimeout(3000);
  
  int responseCode = http.GET();
  
  Serial.printf("Control check: HTTP %d\n", responseCode);
  
  if(responseCode == 200) {
    String response = http.getString();
    Serial.println("Server response: " + response);
    
    // Parse JSON response
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, response);
    
    if(error) {
      Serial.printf("JSON parse error: %s\n", error.c_str());
      http.end();
      return;
    }
    
    // Check for relay commands
    if(doc.containsKey("relay1")) {
      String relay1State = doc["relay1"].as<String>();
      bool state = relay1State == "ON";
      Serial.printf("Server relay1: %s\n", relay1State.c_str());
      
      if(relayStates[0] != state) {
        Serial.printf("Updating relay 1: %s -> %s\n", 
                     relayStates[0] ? "ON" : "OFF", 
                     state ? "ON" : "OFF");
        setRelay(1, state);
      } else {
        Serial.printf("Relay 1 already in correct state: %s\n", state ? "ON" : "OFF");
      }
    }
    
    if(doc.containsKey("relay2")) {
      String relay2State = doc["relay2"].as<String>();
      bool state = relay2State == "ON";
      Serial.printf("Server relay2: %s\n", relay2State.c_str());
      
      if(relayStates[1] != state) {
        Serial.printf("Updating relay 2: %s -> %s\n", 
                     relayStates[1] ? "ON" : "OFF", 
                     state ? "ON" : "OFF");
        setRelay(2, state);
      } else {
        Serial.printf("Relay 2 already in correct state: %s\n", state ? "ON" : "OFF");
      }
    }
  } else {
    Serial.printf("Control check failed: %d\n", responseCode);
    if(responseCode == -1) {
      Serial.println("Connection timeout - check WiFi");
    }
  }
  
  http.end();
}

float readVoltage(int port) {
  // Use ZMPT101B to read the voltage
  float voltage = voltageSensor.getVoltage();
  return voltage;
}

float readCurrent(int port) {
  // Use ACS712 to read current
  float current = currentSensor.getCurrentAC();
  return current;
}

void updateEnergyCalculations() {
  float electricityRate = 8.0; // BDT per kWh
  unsigned long currentTime = millis();
  float timeHours = (currentTime - lastEnergyUpdate) / 3600000.0; // Convert to hours
  
  for(int i = 0; i < 2; i++) {
    if(relayStates[i]) {
      // Calculate energy consumed in this interval
      float energyInterval = (currentReadings[i].power * timeHours) / 1000.0; // kWh
      dailyTotals[i].energy += energyInterval;
      dailyTotals[i].cost = dailyTotals[i].energy * electricityRate;
      
      Serial.printf("Port %d Energy: %.3f kWh, Cost: %.2f BDT\n", 
                   i+1, dailyTotals[i].energy, dailyTotals[i].cost);
    }
  }
}

void updateOLEDDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  
  // Title
  display.setCursor(0, 0);
  display.println("Smart Power Consumption");
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  // Port 1 data
  display.setCursor(0, 15);
  display.print("P1: ");
  display.print(relayStates[0] ? "ON " : "OFF");
  display.setCursor(0, 25);
  display.print("V:");
  display.print(currentReadings[0].voltage, 1);
  display.print("V I:");
  display.print(currentReadings[0].current, 2);
  display.print("A");
  
  // Port 2 data
  display.setCursor(0, 35);
  display.print("P2: ");
  display.print(relayStates[1] ? "ON " : "OFF");
  display.setCursor(0, 45);
  display.print("V:");
  display.print(currentReadings[1].voltage, 1);
  display.print("V I:");
  display.print(currentReadings[1].current, 2);
  display.print("A");
  
  // WiFi status
  display.setCursor(0, 55);
  display.print("WiFi: ");
  display.print(WiFi.status() == WL_CONNECTED ? "OK" : "ERR");
  
  display.display();
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
    
    // Store current readings
    currentReadings[port-1].voltage = voltage;
    currentReadings[port-1].current = current;
    currentReadings[port-1].power = power;
    currentReadings[port-1].energy = dailyTotals[port-1].energy;
    currentReadings[port-1].cost = dailyTotals[port-1].cost;
    
    String data = "{\"port\":" + String(port) + 
                 ",\"voltage\":" + String(voltage, 1) + 
                 ",\"current\":" + String(current, 2) + 
                 ",\"power\":" + String(power, 0) + 
                 ",\"energy\":" + String(dailyTotals[port-1].energy, 3) +
                 ",\"cost\":" + String(dailyTotals[port-1].cost, 2) +
                 ",\"arduino_connected\":true}";
    
    int responseCode = http.POST(data);
    
    if(responseCode > 0) {
      Serial.printf("Port %d - V:%.1fV I:%.2fA P:%.0fW R:%s [%d]\n", 
                   port, voltage, current, power, 
                   relayStates[port-1] ? "ON" : "OFF", responseCode);
    } else {
      Serial.printf("Port %d - Send failed: %d\n", port, responseCode);
    }
    
    http.end();
    delay(100);
  }
}
