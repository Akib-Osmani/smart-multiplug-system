#include <WiFi.h>
 
#include <WebServer.h>
 
const char* ssid = "Swadhin";
 
const char* password = "Swadhin@aiub";
 
const int relay1Pin = 2;
 
const int relay2Pin = 3;
 
WebServer server(80);
 
bool relay1State = false;
 
bool relay2State = false;
 
// ---- Forward declarations (fixes compile issues when auto-prototypes fail) ----
 
void handleRoot();
 
void handleRelay1On();
 
void handleRelay1Off();
 
void handleRelay2On();
 
void handleRelay2Off();
 
void handleStatus();
 
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
 
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<title>ESP32 Relay Control</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
 
        body { font-family: Arial; margin: 20px; background: #f0f0f0; }
 
        .container { max-width: 400px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
 
        h1 { text-align: center; color: #333; }
 
        .relay-control { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
 
        .relay-title { font-weight: bold; margin-bottom: 10px; }
 
        .status { padding: 5px 10px; border-radius: 3px; font-weight: bold; display: inline-block; margin-bottom: 10px; }
 
        .status.on { background: #4CAF50; color: white; }
 
        .status.off { background: #f44336; color: white; }
 
        button { padding: 10px 20px; margin: 5px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
 
        .btn-on { background: #4CAF50; color: white; }
 
        .btn-off { background: #f44336; color: white; }
 
        .btn-on:hover { background: #45a049; }
 
        .btn-off:hover { background: #da190b; }
</style>
</head>
<body>
<div class="container">
<h1>ESP32 Relay Control</h1>
 
        <div class="relay-control">
<div class="relay-title">Relay 1</div>
<div class="status off" id="status1">OFF</div><br>
<button class="btn-on" onclick="controlRelay(1, 'on')">Turn ON</button>
<button class="btn-off" onclick="controlRelay(1, 'off')">Turn OFF</button>
</div>
 
        <div class="relay-control">
<div class="relay-title">Relay 2</div>
<div class="status off" id="status2">OFF</div><br>
<button class="btn-on" onclick="controlRelay(2, 'on')">Turn ON</button>
<button class="btn-off" onclick="controlRelay(2, 'off')">Turn OFF</button>
</div>
</div>
 
    <script>
 
        function controlRelay(relay, action) {
 
            fetch('/relay' + relay + '/' + action)
 
                .then(response => response.text())
 
                .then(_ => updateStatus())
 
                .catch(console.error);
 
        }
 
        function updateStatus() {
 
            fetch('/status')
 
                .then(response => response.json())
 
                .then(data => {
 
                    const s1 = document.getElementById('status1');
 
                    const s2 = document.getElementById('status2');
 
                    s1.textContent = data.relay1 ? 'ON' : 'OFF';
 
                    s1.className = 'status ' + (data.relay1 ? 'on' : 'off');
 
                    s2.textContent = data.relay2 ? 'ON' : 'OFF';
 
                    s2.className = 'status ' + (data.relay2 ? 'on' : 'off');
 
                })
 
                .catch(console.error);
 
        }
 
        setInterval(updateStatus, 1000);
 
        updateStatus();
</script>
</body>
</html>
 
)rawliteral";
 
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
 
 
 