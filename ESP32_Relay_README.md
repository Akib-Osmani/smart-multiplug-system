# ESP32-C3 2-Relay Control System

A simple web-based relay control system using ESP32-C3 microcontroller with an embedded HTML interface.

## Features

- Control 2 relays via web interface
- Real-time status updates
- Responsive mobile-friendly design
- Connection status indicator
- RESTful API endpoints

## Hardware Requirements

- ESP32-C3 development board
- 2x Relay modules (5V or 3.3V compatible)
- Jumper wires
- Breadboard (optional)

## Wiring Diagram

```
ESP32-C3    Relay Module 1    Relay Module 2
--------    --------------    --------------
GPIO 2  --> IN1
GPIO 3  --> IN2
3.3V    --> VCC              VCC
GND     --> GND              GND
```

## Software Setup

### 1. Arduino IDE Configuration

1. Install ESP32 board package in Arduino IDE
2. Select "ESP32C3 Dev Module" as board
3. Install required libraries (WiFi and WebServer are built-in)

### 2. Code Configuration

Update the WiFi credentials in the Arduino code:

```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

### 3. Upload Code

1. Connect ESP32-C3 to computer via USB
2. Select correct COM port
3. Upload the `esp32_relay_control.ino` file

## Usage

### Web Interface Access

1. Open Serial Monitor to get ESP32 IP address
2. Open web browser and navigate to: `http://ESP32_IP_ADDRESS`
3. Use the web interface to control relays

### Standalone HTML Page

For external access, use the `relay_control.html` file:

1. Update the ESP32_IP variable in the HTML file
2. Open the HTML file in any web browser
3. Control relays remotely

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Main web interface |
| `/relay1/on` | GET | Turn relay 1 ON |
| `/relay1/off` | GET | Turn relay 1 OFF |
| `/relay2/on` | GET | Turn relay 2 ON |
| `/relay2/off` | GET | Turn relay 2 OFF |
| `/status` | GET | Get relay status (JSON) |

### Status Response Format

```json
{
  "relay1": true,
  "relay2": false
}
```

## Customization

### GPIO Pins

Change relay pins in the code:

```cpp
const int relay1Pin = 2;  // Change to desired pin
const int relay2Pin = 3;  // Change to desired pin
```

### Web Interface

Modify the embedded HTML in the `handleRoot()` function or use the separate HTML file for custom styling.

## Troubleshooting

### Common Issues

1. **WiFi Connection Failed**
   - Check SSID and password
   - Ensure 2.4GHz network (ESP32 doesn't support 5GHz)

2. **Relays Not Responding**
   - Check wiring connections
   - Verify relay module voltage requirements
   - Test with multimeter

3. **Web Interface Not Loading**
   - Check ESP32 IP address in Serial Monitor
   - Ensure devices are on same network
   - Try different web browser

### Serial Monitor Output

Expected output:
```
Connecting to WiFi...
WiFi connected!
IP address: 192.168.1.100
HTTP server started
```

## Safety Notes

- Use appropriate relay modules for your load requirements
- Never exceed relay current/voltage ratings
- Ensure proper electrical isolation for high-voltage applications
- Test thoroughly before deploying in production environments

## License

Open source - free for personal and commercial use.