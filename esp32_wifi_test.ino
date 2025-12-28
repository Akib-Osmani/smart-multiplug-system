#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("ESP32 WiFi Scanner");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  
  // Also create AP for testing
  WiFi.softAP("ESP32-Test", "12345678");
  Serial.println("Access Point Created: ESP32-Test");
  Serial.print("AP IP: ");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  Serial.println("Scanning WiFi networks...");
  
  int n = WiFi.scanNetworks();
  Serial.print("Found ");
  Serial.print(n);
  Serial.println(" networks");
  
  for (int i = 0; i < n; ++i) {
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.print(WiFi.SSID(i));
    Serial.print(" (");
    Serial.print(WiFi.RSSI(i));
    Serial.println("dB)");
  }
  
  delay(5000);
}