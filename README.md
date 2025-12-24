# Smart Multiplug Monitoring System

A comprehensive web-based monitoring system for smart multiplug devices with real-time data visualization, billing calculations, alerts, and advanced analytics.

## Features

### Core Functionality
- **Real-time Monitoring**: Live voltage, current, power, and status for 4 ports
- **Billing System**: Daily and monthly energy consumption tracking with BDT cost calculations
- **Database Storage**: SQLite database for persistent data storage
- **WebSocket Communication**: Real-time updates every minute

### Advanced Features
- **Usage Alerts**: High consumption, cost threshold, and peak hour notifications
- **Peak Hour Detection**: Automatic detection and tracking of peak usage periods
- **Cost Optimization**: AI-powered suggestions for reducing electricity costs
- **Data Export**: CSV and PDF export functionality
- **Responsive Design**: Mobile-friendly dashboard interface

### Sample Data Generation
- Realistic power consumption patterns for different device types
- Automatic data generation for testing and demonstration
- Configurable electricity rates (default: 8 BDT/kWh)

## Technology Stack

### Backend
- **Node.js** with Express framework
- **Socket.io** for real-time communication
- **SQLite3** for database storage
- **Puppeteer** for PDF generation
- **CSV-Writer** for data export
- **Node-Cron** for scheduled tasks

### Frontend
- **HTML5** with semantic markup
- **CSS3** with modern responsive design
- **Vanilla JavaScript** with ES6+ features
- **WebSocket** client for real-time updates
- **Font Awesome** icons

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm (Node Package Manager)

### Installation Steps

1. **Clone/Download the project**
   ```bash
   cd Smart-Multiplug-System
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Access the dashboard**
   Open your browser and navigate to: `http://localhost:3000`

## System Architecture

### Database Schema

#### Tables
1. **realtime_data**: Current sensor readings for each port
2. **daily_consumption**: Daily energy consumption and costs
3. **monthly_consumption**: Monthly aggregated data
4. **settings**: System configuration (electricity rates, thresholds)
5. **alerts**: System notifications and warnings
6. **peak_usage**: Peak hour usage tracking

### API Endpoints

#### Data Endpoints
- `GET /api/data` - Get current dashboard data
- `POST /api/data` - Receive data from ESP8266 (format below)
- `POST /api/reset-daily` - Reset today's consumption data

#### Export Endpoints
- `POST /api/export/csv` - Export consumption data to CSV
- `POST /api/export/pdf` - Generate PDF report

#### Settings Endpoints
- `POST /api/settings/rate` - Update electricity rate
- `POST /api/alerts/acknowledge` - Dismiss alerts

### ESP8266 Data Format

Send POST requests to `/api/data` with the following JSON structure:

```json
{
  "port": 1,           // Port number (1-4)
  "voltage": 220.5,    // Voltage in Volts
  "current": 2.3,      // Current in Amperes
  "power": 507.15,     // Power in Watts
  "timestamp": "2024-01-15T10:30:00Z"  // Optional timestamp
}
```

## Configuration

### Electricity Rate
- Default: 8 BDT per kWh
- Configurable through dashboard settings
- Stored in database for persistence

### Alert Thresholds
- High usage threshold: 1000W
- Daily cost alert: 100 BDT
- Peak hours: 6 PM to 11 PM

### Update Frequency
- Real-time data: Every 1 minute
- Sample data generation: Every 1 minute
- Database cleanup: Daily at midnight

## Dashboard Sections

### 1. Real-time Status
- Live voltage, current, power readings
- Online/offline status indicators
- Visual alerts for high consumption

### 2. Billing Summary
- Today's total consumption and cost
- Monthly aggregated data
- Port-wise daily and monthly breakdown

### 3. Alerts & Notifications
- High usage warnings
- Cost threshold alerts
- Peak hour notifications
- Dismissible alert system

### 4. Cost Optimization Suggestions
- Energy efficiency recommendations
- Peak hour usage optimization
- Device scheduling suggestions
- Potential savings calculations

### 5. Controls
- CSV/PDF data export
- Daily data reset
- Settings configuration

## Sample Data Profiles

The system generates realistic sample data for 4 different device types:

1. **Port 1 - AC/Heater**: 800-1200W, 70% uptime
2. **Port 2 - Refrigerator**: 150-300W, 90% uptime
3. **Port 3 - LED Lights**: 20-60W, 80% uptime
4. **Port 4 - Occasional Device**: 50-200W, 30% uptime

## File Structure

```
Smart-Multiplug-System/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── multiplug.db          # SQLite database (auto-created)
├── public/               # Frontend files
│   ├── index.html        # Main dashboard page
│   ├── css/
│   │   └── style.css     # Responsive CSS styles
│   └── js/
│       └── dashboard.js  # Frontend JavaScript
└── exports/              # Generated export files
    ├── *.csv            # CSV exports
    └── *.pdf            # PDF reports
```

## Development Notes

### Adding New Features
1. **Backend**: Add routes in `server.js`
2. **Frontend**: Update `dashboard.js` and `style.css`
3. **Database**: Modify schema in `initializeDatabase()` function

### Customization
- Modify device profiles in `generateSampleData()` function
- Adjust alert thresholds in configuration constants
- Customize UI colors and layout in `style.css`

### ESP8266 Integration
1. Configure ESP8266 to send HTTP POST requests
2. Use the provided JSON format
3. Set endpoint to `http://your-server:3000/api/data`
4. Send data every 1-5 minutes for optimal performance

## Troubleshooting

### Common Issues
1. **Port already in use**: Change PORT constant in server.js
2. **Database errors**: Delete multiplug.db and restart server
3. **Export failures**: Ensure exports/ directory exists
4. **WebSocket issues**: Check firewall settings

### Performance Optimization
- Database cleanup runs automatically
- Old alerts are removed after 7 days
- Real-time data is limited to current readings only

## Future Enhancements

### Planned Features
- Historical data visualization with charts
- Mobile app integration
- Email/SMS notifications
- Load balancing recommendations
- Energy efficiency scoring
- Multi-device support

### Hardware Integration
- Support for multiple ESP8266 devices
- Wireless sensor networks
- Smart switch control
- Power factor monitoring

## License

This project is open-source and available for educational and commercial use.

## Support

For technical support or feature requests, please refer to the project documentation or contact the development team.