void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("ESP32 Starting...");
  Serial.println("Serial Monitor Test");
  
  // Test GPIO pins
  pinMode(2, OUTPUT);
  pinMode(3, OUTPUT);
  Serial.println("GPIO pins configured");
}

void loop() {
  Serial.println("ESP32 is running...");
  
  // Blink built-in LED if available
  digitalWrite(2, HIGH);
  delay(500);
  digitalWrite(2, LOW);
  delay(500);
  
  // Test counter
  static int counter = 0;
  Serial.print("Counter: ");
  Serial.println(counter++);
}