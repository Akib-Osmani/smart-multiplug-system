from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
from datetime import datetime, timedelta
import threading
import time
import random
import os

# Flask application initialization
app = Flask(__name__)
app.config['SECRET_KEY'] = 'smart_multiplug_secret_key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///multiplug.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Database and SocketIO initialization
db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Configuration constants
ELECTRICITY_RATE_BDT = 8.0  # BDT per kWh (configurable)
UPDATE_INTERVAL = 60  # seconds (1 minute)

# Database Models
class RealtimeData(db.Model):
    """Real-time sensor data for each port"""
    __tablename__ = 'realtime_data'
    
    id = db.Column(db.Integer, primary_key=True)
    port = db.Column(db.Integer, nullable=False)  # 1-4
    voltage = db.Column(db.Float, nullable=False)
    current = db.Column(db.Float, nullable=False)
    power = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(10), nullable=False)  # online/offline
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class DailyConsumption(db.Model):
    """Daily energy consumption and cost per port"""
    __tablename__ = 'daily_consumption'
    
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    port = db.Column(db.Integer, nullable=False)
    energy_kwh = db.Column(db.Float, default=0.0)
    cost_bdt = db.Column(db.Float, default=0.0)
    runtime_minutes = db.Column(db.Integer, default=0)

class MonthlyConsumption(db.Model):
    """Monthly aggregated consumption data"""
    __tablename__ = 'monthly_consumption'
    
    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)
    port = db.Column(db.Integer, nullable=False)
    energy_kwh = db.Column(db.Float, default=0.0)
    cost_bdt = db.Column(db.Float, default=0.0)

class Settings(db.Model):
    """System settings including electricity rate"""
    __tablename__ = 'settings'
    
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False)
    value = db.Column(db.String(100), nullable=False)

# Database helper functions
def init_database():
    """Initialize database tables and default settings"""
    with app.app_context():
        db.create_all()
        
        # Initialize default electricity rate if not exists
        rate_setting = Settings.query.filter_by(key='electricity_rate_bdt').first()
        if not rate_setting:
            rate_setting = Settings(key='electricity_rate_bdt', value=str(ELECTRICITY_RATE_BDT))
            db.session.add(rate_setting)
            db.session.commit()

def get_electricity_rate():
    """Get current electricity rate from database"""
    rate_setting = Settings.query.filter_by(key='electricity_rate_bdt').first()
    return float(rate_setting.value) if rate_setting else ELECTRICITY_RATE_BDT

def calculate_energy_kwh(power_watts, minutes):
    """Calculate energy consumption in kWh from power and time"""
    return (power_watts * minutes) / (1000 * 60)

def update_realtime_data(port, voltage, current, power):
    """Update real-time data for a specific port"""
    status = 'online' if power > 0 else 'offline'
    
    # Remove old data for this port and insert new
    RealtimeData.query.filter_by(port=port).delete()
    new_data = RealtimeData(
        port=port,
        voltage=voltage,
        current=current,
        power=power,
        status=status
    )
    db.session.add(new_data)
    db.session.commit()

def update_daily_consumption(port, power_watts):
    """Update daily consumption statistics"""
    today = datetime.now().date()
    energy_kwh = calculate_energy_kwh(power_watts, 1)  # 1 minute interval
    cost_bdt = energy_kwh * get_electricity_rate()
    
    # Get or create daily record
    daily_record = DailyConsumption.query.filter_by(date=today, port=port).first()
    if not daily_record:
        daily_record = DailyConsumption(date=today, port=port)
        db.session.add(daily_record)
    
    # Update consumption data
    daily_record.energy_kwh += energy_kwh
    daily_record.cost_bdt += cost_bdt
    if power_watts > 0:
        daily_record.runtime_minutes += 1
    
    db.session.commit()

def update_monthly_consumption(port, energy_kwh, cost_bdt):
    """Update monthly consumption statistics"""
    now = datetime.now()
    
    # Get or create monthly record
    monthly_record = MonthlyConsumption.query.filter_by(
        year=now.year, month=now.month, port=port
    ).first()
    if not monthly_record:
        monthly_record = MonthlyConsumption(
            year=now.year, month=now.month, port=port
        )
        db.session.add(monthly_record)
    
    # Update monthly totals
    monthly_record.energy_kwh += energy_kwh
    monthly_record.cost_bdt += cost_bdt
    db.session.commit()

def format_runtime(minutes):
    """Convert minutes to readable format (Xh Ym)"""
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours}h {mins}m"

def get_dashboard_data():
    """Get formatted data for dashboard display"""
    today = datetime.now().date()
    current_month = datetime.now().month
    current_year = datetime.now().year
    
    # Get real-time data for all ports
    realtime_data = {}
    for port in range(1, 5):
        data = RealtimeData.query.filter_by(port=port).first()
        if data:
            realtime_data[f'port{port}'] = {
                'voltage': data.voltage,
                'current': data.current,
                'power': data.power,
                'status': data.status
            }
        else:
            realtime_data[f'port{port}'] = {
                'voltage': 0, 'current': 0, 'power': 0, 'status': 'offline'
            }
    
    # Get today's consumption data
    today_data = {}
    total_today_energy = 0
    total_today_cost = 0
    total_today_runtime = 0
    
    for port in range(1, 5):
        daily = DailyConsumption.query.filter_by(date=today, port=port).first()
        if daily:
            today_data[f'port{port}'] = {
                'energy': round(daily.energy_kwh, 2),
                'cost': round(daily.cost_bdt, 2),
                'runtime': format_runtime(daily.runtime_minutes)
            }
            total_today_energy += daily.energy_kwh
            total_today_cost += daily.cost_bdt
            total_today_runtime += daily.runtime_minutes
        else:
            today_data[f'port{port}'] = {
                'energy': 0, 'cost': 0, 'runtime': '0h 0m'
            }
    
    today_data['total'] = {
        'energy': round(total_today_energy, 2),
        'cost': round(total_today_cost, 2),
        'runtime': format_runtime(total_today_runtime)
    }
    
    # Get monthly consumption data
    monthly_data = {}
    total_month_energy = 0
    total_month_cost = 0
    
    for port in range(1, 5):
        monthly = MonthlyConsumption.query.filter_by(
            year=current_year, month=current_month, port=port
        ).first()
        if monthly:
            monthly_data[f'port{port}'] = {
                'energy': round(monthly.energy_kwh, 2),
                'cost': round(monthly.cost_bdt, 2)
            }
            total_month_energy += monthly.energy_kwh
            total_month_cost += monthly.cost_bdt
        else:
            monthly_data[f'port{port}'] = {
                'energy': 0, 'cost': 0
            }
    
    # Calculate days in current month
    days_in_month = (datetime.now().replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    current_day = datetime.now().day
    
    monthly_data['total'] = {
        'energy': round(total_month_energy, 2),
        'cost': round(total_month_cost, 2),
        'days': current_day
    }
    
    return {
        'realtime': realtime_data,
        'today': today_data,
        'monthly': monthly_data,
        'electricity_rate': get_electricity_rate()
    }

# Sample data generator for testing
def generate_sample_data():
    """Generate realistic sample data for visualization"""
    with app.app_context():
        # Sample voltage ranges for Bangladesh (220V ±10%)
        base_voltages = [220, 218, 222, 219]
        
        for port in range(1, 5):
            # Generate realistic power consumption patterns
            if port == 1:  # High consumption device (AC/Heater)
                power = random.uniform(800, 1200) if random.random() > 0.3 else 0
            elif port == 2:  # Medium consumption (Refrigerator)
                power = random.uniform(150, 300) if random.random() > 0.1 else 0
            elif port == 3:  # Low consumption (LED lights)
                power = random.uniform(20, 60) if random.random() > 0.2 else 0
            else:  # Port 4 - occasionally used
                power = random.uniform(50, 200) if random.random() > 0.7 else 0
            
            # Calculate voltage and current based on power
            voltage = base_voltages[port-1] + random.uniform(-5, 5) if power > 0 else 0
            current = (power / voltage) if voltage > 0 else 0
            
            # Update database
            update_realtime_data(port, voltage, current, power)
            update_daily_consumption(port, power)
            
            # Update monthly consumption
            energy_kwh = calculate_energy_kwh(power, 1)
            cost_bdt = energy_kwh * get_electricity_rate()
            update_monthly_consumption(port, energy_kwh, cost_bdt)

# Background task for sample data generation
def sample_data_worker():
    """Background worker to generate sample data every minute"""
    while True:
        try:
            generate_sample_data()
            # Emit updated data to all connected clients
            socketio.emit('data_update', get_dashboard_data())
            time.sleep(UPDATE_INTERVAL)
        except Exception as e:
            print(f"Error in sample data worker: {e}")
            time.sleep(UPDATE_INTERVAL)

# API Routes
@app.route('/')
def index():
    """Serve the main dashboard page"""
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    """API endpoint to get current dashboard data"""
    return jsonify(get_dashboard_data())

@app.route('/api/data', methods=['POST'])
def receive_esp_data():
    """API endpoint to receive data from ESP8266"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['port', 'voltage', 'current', 'power']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        
        port = int(data['port'])
        if port < 1 or port > 4:
            return jsonify({'error': 'Invalid port number'}), 400
        
        voltage = float(data['voltage'])
        current = float(data['current'])
        power = float(data['power'])
        
        # Update database
        update_realtime_data(port, voltage, current, power)
        update_daily_consumption(port, power)
        
        # Update monthly consumption
        energy_kwh = calculate_energy_kwh(power, 1)
        cost_bdt = energy_kwh * get_electricity_rate()
        update_monthly_consumption(port, energy_kwh, cost_bdt)
        
        # Emit updated data to connected clients
        socketio.emit('data_update', get_dashboard_data())
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reset-daily', methods=['POST'])
def reset_daily_data():
    """Reset today's consumption data"""
    try:
        today = datetime.now().date()
        DailyConsumption.query.filter_by(date=today).delete()
        db.session.commit()
        
        socketio.emit('data_update', get_dashboard_data())
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings/rate', methods=['POST'])
def update_electricity_rate():
    """Update electricity rate setting"""
    try:
        data = request.get_json()
        new_rate = float(data['rate'])
        
        rate_setting = Settings.query.filter_by(key='electricity_rate_bdt').first()
        if rate_setting:
            rate_setting.value = str(new_rate)
        else:
            rate_setting = Settings(key='electricity_rate_bdt', value=str(new_rate))
            db.session.add(rate_setting)
        
        db.session.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# WebSocket Events
@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    emit('data_update', get_dashboard_data())

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')

# Application startup
if __name__ == '__main__':
    # Initialize database
    init_database()
    
    # Start sample data generation in background thread
    sample_thread = threading.Thread(target=sample_data_worker, daemon=True)
    sample_thread.start()
    
    print("Smart Multiplug System starting...")
    print(f"Electricity Rate: {get_electricity_rate()} BDT/kWh")
    print(f"Update Interval: {UPDATE_INTERVAL} seconds")
    
    # Run Flask-SocketIO server
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)