#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

const int relay1Pin = 2;
const int relay2Pin = 3;

WebServer server(80);

bool relay1State = false;
bool relay2State = false;

void setup() {
  Serial.begin(115200);
  
  pinMode(relay1Pin, OUTPUT);
  pinMode(relay2Pin, OUTPUT);
  digitalWrite(relay1Pin, LOW);
  digitalWrite(relay2Pin, LOW);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  server.on("/", handleRoot);
  server.on("/relay1/on", handleRelay1On);
  server.on("/relay1/off", handleRelay1Off);
  server.on("/relay2/on", handleRelay2On);
  server.on("/relay2/off", handleRelay2Off);
  server.on("/status", handleStatus);
  
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();
}

void handleRoot() {
  String html = "<!DOCTYPE html><html><head><title>ESP32 Relay Control</title>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>";
  html += "body{font-family:Arial;margin:20px;background:#f0f0f0}";
  html += ".container{max-width:400px;margin:0 auto;background:white;padding:20px;border-radius:10px}";
  html += "h1{text-align:center;color:#333}";
  html += ".relay{margin:20px 0;padding:15px;border:1px solid #ddd;border-radius:5px}";
  html += ".status{padding:5px 10px;border-radius:3px;font-weight:bold;margin:10px 0}";
  html += ".on{background:#4CAF50;color:white}";
  html += ".off{background:#f44336;color:white}";
  html += "button{padding:10px 20px;margin:5px;border:none;border-radius:5px;cursor:pointer}";
  html += ".btn-on{background:#4CAF50;color:white}";
  html += ".btn-off{background:#f44336;color:white}";
  html += "</style></head><body>";
  html += "<div class='container'><h1>ESP32 Relay Control</h1>";
  
  html += "<div class='relay'><h3>Relay 1</h3>";
  html += "<div class='status " + String(relay1State ? "on" : "off") + "' id='status1'>";
  html += relay1State ? "ON" : "OFF";
  html += "</div>";
  html += "<button class='btn-on' onclick='controlRelay(1,1)'>Turn ON</button>";
  html += "<button class='btn-off' onclick='controlRelay(1,0)'>Turn OFF</button>";
  html += "</div>";
  
  html += "<div class='relay'><h3>Relay 2</h3>";
  html += "<div class='status " + String(relay2State ? "on" : "off") + "' id='status2'>";
  html += relay2State ? "ON" : "OFF";
  html += "</div>";
  html += "<button class='btn-on' onclick='controlRelay(2,1)'>Turn ON</button>";
  html += "<button class='btn-off' onclick='controlRelay(2,0)'>Turn OFF</button>";
  html += "</div>";
  
  html += "</div>";
  html += "<script>";
  html += "function controlRelay(relay,state){";
  html += "var url='/relay'+relay+'/'+(state?'on':'off');";
  html += "fetch(url).then(()=>setTimeout(()=>location.reload(),500));";
  html += "}";
  html += "</script>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleRelay1On() {
  relay1State = true;
  digitalWrite(relay1Pin, HIGH);
  server.send(200, "text/plain", "Relay 1 ON");
}

void handleRelay1Off() {
  relay1State = false;
  digitalWrite(relay1Pin, LOW);
  server.send(200, "text/plain", "Relay 1 OFF");
}

void handleRelay2On() {
  relay2State = true;
  digitalWrite(relay2Pin, HIGH);
  server.send(200, "text/plain", "Relay 2 ON");
}

void handleRelay2Off() {
  relay2State = false;
  digitalWrite(relay2Pin, LOW);
  server.send(200, "text/plain", "Relay 2 OFF");
}

void handleStatus() {
  String json = "{\"relay1\":" + String(relay1State ? "true" : "false") + 
                ",\"relay2\":" + String(relay2State ? "true" : "false") + "}";
  server.send(200, "application/json", json);
}