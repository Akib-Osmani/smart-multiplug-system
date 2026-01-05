#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <math.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
 
// ---------- WiFi Configuration ----------
const char* ssid = "Swadhin";
const char* password = "Swadhin@aiub";
 
// ---------- Server URLs ----------
const char* serverURL = "https://power-consumption-dashboard.up.railway.app/api/data";
const char* controlURL = "https://power-consumption-dashboard.up.railway.app/api/control";
 
// ---------- OLED ----------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
 
// ---------- Pins ----------
#define VOLTAGE_PIN   34
#define CURRENT1_PIN  35
#define CURRENT2_PIN  32
 
#define RELAY1 25
#define RELAY2 26
 
// ---------- ADC ----------
#define ADC_RESOLUTION 4095.0
#define ADC_REF 3.3
 
// ---------- Calibration ----------
float voltageCalibration = 406.0;   // ZMPT101B
float currentCalibration = 30.0;    // ACS712 30A
 
const int samples = 1000;
 
// ---------- Relay State ----------
bool relay1State = false;
bool relay2State = false;
 
// ---------- Timing ----------
unsigned long lastControlCheck = 0;
unsigned long lastDataSend = 0;
bool stateChanged = false;
 
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Smart Power Monitor Starting ===");
 
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
 
  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);
  digitalWrite(RELAY1, LOW);
  digitalWrite(RELAY2, LOW);
  Serial.println("Relays initialized");
 
  // ---------- OLED Init ----------
  Wire.begin(21, 22);
  delay(100);
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED init failed, continuing without display");
  } else {
    Serial.println("OLED initialized");
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Initializing...");
    display.display();
  }
 
  Serial.println("System Ready");
  Serial.println("Commands: ON1 OFF1 ON2 OFF2 ALLON ALLOFF");
 
  // ---------- WiFi Connect ----------
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 40) {
    delay(250);
    Serial.print(".");
    wifiAttempts++;
  }
  
  if(WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi connection failed, continuing in offline mode");
  }
}
 
float readRMS(int pin) {
  float sum = 0, offset = 0;
 
  for (int i = 0; i < samples; i++) {
    offset += analogRead(pin);
    delayMicroseconds(200);
  }
  offset /= samples;
 
  for (int i = 0; i < samples; i++) {
    float val = analogRead(pin) - offset;
    sum += val * val;
    delayMicroseconds(200);
  }
 
  return sqrt(sum / samples);
}
 
void handleSerial() {
  if (!Serial.available()) return;
 
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();
 
  if (cmd == "ON1") relay1State = true;
  else if (cmd == "OFF1") relay1State = false;
  else if (cmd == "ON2") relay2State = true;
  else if (cmd == "OFF2") relay2State = false;
  else if (cmd == "ALLON") relay1State = relay2State = true;
  else if (cmd == "ALLOFF") relay1State = relay2State = false;
 
  digitalWrite(RELAY1, relay1State ? HIGH : LOW);
  digitalWrite(RELAY2, relay2State ? HIGH : LOW);
 
  Serial.print("Relay1: ");
  Serial.print(relay1State ? "ON" : "OFF");
  Serial.print(" | Relay2: ");
  Serial.println(relay2State ? "ON" : "OFF");
}
 
void checkControlCommands() {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
 
  HTTPClient http;
  http.begin(client, controlURL);
  http.setTimeout(2000);
 
  int responseCode = http.GET();
 
  if(responseCode == 200) {
    String response = http.getString();
   
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, response);
   
    if(!error) {
      if(doc.containsKey("relay1")) {
        String relay1Cmd = doc["relay1"].as<String>();
        bool state = relay1Cmd == "ON";
        if(relay1State != state) {
          relay1State = state;
          digitalWrite(RELAY1, state ? HIGH : LOW);
          stateChanged = true;
          Serial.printf("Server Relay1: %s\n", state ? "ON" : "OFF");
        }
      }
     
      if(doc.containsKey("relay2")) {
        String relay2Cmd = doc["relay2"].as<String>();
        bool state = relay2Cmd == "ON";
        if(relay2State != state) {
          relay2State = state;
          digitalWrite(RELAY2, state ? HIGH : LOW);
          stateChanged = true;
          Serial.printf("Server Relay2: %s\n", state ? "ON" : "OFF");
        }
      }
    }
  }
 
  http.end();
}
 
void sendDataToServer(int port, float voltage, float current, float power, bool relayState) {
  if(WiFi.status() != WL_CONNECTED) return;
  
  WiFiClientSecure client;
  client.setInsecure();
 
  HTTPClient http;
  http.begin(client, serverURL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(2000);
 
  String data = "{\"port\":" + String(port) +
               ",\"voltage\":" + String(voltage, 1) +
               ",\"current\":" + String(current, 2) +
               ",\"power\":" + String(power, 0) +
               ",\"status\":" + String(relayState ? 1 : 0) +
               ",\"arduino_connected\":true}";
 
  int responseCode = http.POST(data);
 
  if(responseCode > 0) {
    Serial.printf("Port %d sent [%d]\n", port, responseCode);
  }
 
  http.end();
}
 
void loop() {
  handleSerial();
 
  // Check server for relay control every 1 second for faster response
  if(millis() - lastControlCheck >= 1000) {
    checkControlCommands();
    lastControlCheck = millis();
  }
 
  float vrmsADC = readRMS(VOLTAGE_PIN);
  float i1rmsADC = readRMS(CURRENT1_PIN);
  float i2rmsADC = readRMS(CURRENT2_PIN);
 
  float voltage = (vrmsADC * ADC_REF / ADC_RESOLUTION) * voltageCalibration;
  float current1 = (i1rmsADC * ADC_REF / ADC_RESOLUTION) * currentCalibration;
  float current2 = (i2rmsADC * ADC_REF / ADC_RESOLUTION) * currentCalibration;
 
  if (voltage <10) voltage = 0;
  if (current1 < 0.15) current1 = 0;
  if (current2 < 0.15) current2 = 0;
 
  float power1 = voltage * current1;
  float power2 = voltage * current2;
 
  // Send data immediately when state changes, otherwise every 3 seconds
  if(stateChanged || millis() - lastDataSend >= 3000) {
    sendDataToServer(1, voltage, current1, power1, relay1State);
    delay(50);
    sendDataToServer(2, voltage, current2, power2, relay2State);
    lastDataSend = millis();
    stateChanged = false;
  }
 
  // ---------- OLED Display ----------
  display.clearDisplay();
  
  // Title with decoration
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("====================");
  display.setCursor(0, 10);
  display.println("Smart Power Monitor");
  display.setCursor(0, 20);
  display.println("====================");
  
  // Voltage
  display.setCursor(0, 30);
  display.print("V: ");
  display.print(voltage, 1);
  display.println(" V");
 
  // Current in milliamps
  display.setCursor(0, 40);
  display.print("I1:");
  display.print(current1 * 1000, 0);
  display.print("mA I2:");
  display.print(current2 * 1000, 0);
  display.println("mA");
 
  // Relay status
  display.setCursor(0, 50);
  display.print("P1:");
  display.print(relay1State ? "ON " : "OFF");
  display.print(" P2:");
  display.print(relay2State ? "ON" : "OFF");
  
  // WiFi indicator
  display.setCursor(100, 50);
  display.print(WiFi.status() == WL_CONNECTED ? "W" : "X");
 
  display.display();
 
  // ---------- Serial ----------
  Serial.print("V:");
  Serial.print(voltage, 1);
  Serial.print("V | I1:");
  Serial.print(current1, 2);
  Serial.print("A | I2:");
  Serial.print(current2, 2);
  Serial.println("A");
 
  delay(1000);
}
 
 
 
 