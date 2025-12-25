// Dashboard JavaScript - Smart Multiplug System
// Handles real-time data updates, UI interactions, and advanced features

class SmartMultiplugDashboard {
    constructor() {
        // Initialize WebSocket connection
        this.socket = io();
        
        // Dashboard state
        this.currentData = null;
        this.isConnected = false;
        
        // Waveform data storage
        this.waveformData = {
            voltage: [[], [], [], []],
            current: [[], [], [], []],
            power: [[], [], [], []]
        };
        
        // Initialize dashboard
        this.init();
    }

    // Initialize dashboard functionality
    init() {
        this.setupSocketListeners();
        this.setupEventListeners();
        this.loadInitialData();
        this.initializeWaveforms();
        this.startSampleDataGeneration();
        
        console.log('Smart Multiplug Dashboard initialized');
    }

    // Start generating sample data for demo
    startSampleDataGeneration() {
        // Generate initial sample data
        this.generateSampleData();
        
        // Update every 2 seconds for demo
        setInterval(() => {
            this.generateSampleData();
        }, 2000);
    }

    // Generate realistic sample data
    generateSampleData() {
        const sampleData = {
            realtime: {},
            today: { total: { energy: 0, cost: 0, runtime: '0h 0m' } },
            monthly: { total: { energy: 0, cost: 0, days: new Date().getDate() } },
            alerts: [],
            suggestions: []
        };

        // Device profiles for realistic data (only ports 1-2 active)
        const deviceProfiles = [
            { name: 'AC Unit', minPower: 800, maxPower: 1200, baseVoltage: 220, onProb: 0.8 },
            { name: 'Refrigerator', minPower: 150, maxPower: 300, baseVoltage: 218, onProb: 0.9 }
        ];

        let totalDailyEnergy = 0, totalDailyCost = 0, totalMonthlyEnergy = 0, totalMonthlyCost = 0;

        // Generate data for active ports (1-2 only)
        for (let port = 1; port <= 2; port++) {
            const profile = deviceProfiles[port - 1];
            const isOn = Math.random() < profile.onProb;
            
            let voltage = 0, current = 0, power = 0;
            
            if (isOn) {
                voltage = profile.baseVoltage + (Math.random() - 0.5) * 8;
                power = profile.minPower + Math.random() * (profile.maxPower - profile.minPower);
                current = power / voltage;
            }

            sampleData.realtime[`port${port}`] = {
                voltage: parseFloat(voltage.toFixed(1)),
                current: parseFloat(current.toFixed(2)),
                power: parseFloat(power.toFixed(0)),
                status: isOn ? 'online' : 'offline'
            };

            // Generate billing data
            const dailyEnergy = parseFloat((Math.random() * 15 + 2).toFixed(2));
            const dailyCost = parseFloat((dailyEnergy * 8).toFixed(2));
            const monthlyEnergy = parseFloat((dailyEnergy * 25 + Math.random() * 50).toFixed(2));
            const monthlyCost = parseFloat((monthlyEnergy * 8).toFixed(2));

            sampleData.today[`port${port}`] = {
                energy: dailyEnergy,
                cost: dailyCost,
                runtime: `${Math.floor(Math.random() * 20 + 4)}h ${Math.floor(Math.random() * 60)}m`
            };

            sampleData.monthly[`port${port}`] = {
                energy: monthlyEnergy,
                cost: monthlyCost
            };

            totalDailyEnergy += dailyEnergy;
            totalDailyCost += dailyCost;
            totalMonthlyEnergy += monthlyEnergy;
            totalMonthlyCost += monthlyCost;

            // Generate alerts for high consumption
            if (power > 900) {
                sampleData.alerts.push({
                    id: Date.now() + port,
                    type: 'HIGH_USAGE',
                    message: `Port ${port} consuming ${power}W - High power usage detected`,
                    port: port,
                    severity: 'WARNING'
                });
            }
        }

        // Set disabled ports (3-4) to zero values
        for (let port = 3; port <= 4; port++) {
            sampleData.realtime[`port${port}`] = {
                voltage: 0,
                current: 0,
                power: 0,
                status: 'disabled'
            };

            sampleData.today[`port${port}`] = {
                energy: 0,
                cost: 0,
                runtime: '0h 0m'
            };

            sampleData.monthly[`port${port}`] = {
                energy: 0,
                cost: 0
            };
        }

        // Update totals
        sampleData.today.total = {
            energy: parseFloat(totalDailyEnergy.toFixed(2)),
            cost: parseFloat(totalDailyCost.toFixed(2)),
            runtime: `${Math.floor(totalDailyEnergy * 2)}h ${Math.floor(Math.random() * 60)}m`
        };

        sampleData.monthly.total = {
            energy: parseFloat(totalMonthlyEnergy.toFixed(2)),
            cost: parseFloat(totalMonthlyCost.toFixed(2)),
            days: new Date().getDate()
        };

        // Add sample suggestions
        if (totalDailyCost > 100) {
            sampleData.suggestions.push({
                type: 'HIGH_CONSUMPTION',
                message: 'Consider using energy-efficient appliances during peak hours',
                savings: `Potential savings: ${(totalDailyCost * 0.2).toFixed(0)} BDT/day`
            });
        }

        // Update dashboard with sample data
        this.updateDashboard(sampleData);
    }

    // Initialize waveform canvases
    initializeWaveforms() {
        for (let port = 1; port <= 4; port++) {
            this.initCanvas(`voltageCanvas${port}`, '#ffff00');
            this.initCanvas(`currentCanvas${port}`, '#ff6600');
            this.initCanvas(`powerCanvas${port}`, '#ff0066');
        }
        
        // Start waveform animation
        this.animateWaveforms();
    }

    // Initialize individual canvas
    initCanvas(canvasId, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        // Draw initial grid
        this.drawGrid(ctx, canvas.width, canvas.height);
    }

    // Draw grid on canvas
    drawGrid(ctx, width, height) {
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.2)';
        ctx.lineWidth = 0.5;
        
        // Vertical lines
        for (let x = 0; x <= width; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    // Animate waveforms
    animateWaveforms() {
        for (let port = 1; port <= 4; port++) {
            this.updateWaveform(`voltageCanvas${port}`, this.waveformData.voltage[port-1], '#ffff00');
            this.updateWaveform(`currentCanvas${port}`, this.waveformData.current[port-1], '#ff6600');
            this.updateWaveform(`powerCanvas${port}`, this.waveformData.power[port-1], '#ff0066');
        }
        
        requestAnimationFrame(() => this.animateWaveforms());
    }

    // Update individual waveform
    updateWaveform(canvasId, data, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        // Draw simple grid
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.2)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= width; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw waveform
        if (data.length > 1) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < data.length; i++) {
                const x = (i / (data.length - 1)) * width;
                const y = height - Math.max(0, Math.min(1, data[i] / 100)) * height;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
        }
    }

    // Setup WebSocket event listeners
    setupSocketListeners() {
        // Connection established
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.isConnected = true;
            this.updateConnectionStatus(true);
        });

        // Connection lost
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
            this.updateConnectionStatus(false);
        });

        // Real-time data updates
        this.socket.on('dataUpdate', (data) => {
            console.log('Received data update:', data);
            this.currentData = data;
            this.updateDashboard(data);
        });

        // Error handling
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification('Connection error occurred', 'error');
        });
    }

    // Setup UI event listeners
    setupEventListeners() {
        // Modal close events
        window.onclick = (event) => {
            const modal = document.getElementById('settingsModal');
            if (event.target === modal) {
                this.closeSettings();
            }
        };

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeSettings();
            }
        });
    }

    // Load initial data from API
    async loadInitialData() {
        try {
            const response = await fetch('/api/data');
            const data = await response.json();
            
            this.currentData = data;
            this.updateDashboard(data);
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showNotification('Failed to load initial data', 'error');
        }
    }

    // Update entire dashboard with new data
    updateDashboard(data) {
        if (!data) return;

        // Update real-time status
        this.updateRealtimeStatus(data.realtime);
        
        // Update billing information
        this.updateBillingInfo(data.today, data.monthly);
        
        // Update alerts
        this.updateAlerts(data.alerts || []);
        
        // Update suggestions
        this.updateSuggestions(data.suggestions || []);
        
        // Update header info
        this.updateHeaderInfo(data);
        
        // Add fade-in animation to updated elements
        this.addUpdateAnimation();
    }

    // Update real-time status for all ports
    updateRealtimeStatus(realtimeData) {
        for (let port = 1; port <= 4; port++) {
            const portData = realtimeData[`port${port}`];
            if (!portData) continue;

            // Sync status with relay state and power readings
            const statusElement = document.getElementById(`status${port}`);
            const toggleBtn = document.getElementById(`toggle${port}`);
            
            // Determine actual status based on power and voltage
            let actualStatus = 'offline';
            if (portData.power > 0 && portData.voltage > 0) {
                actualStatus = 'online';
            }
            
            // Update status indicator
            statusElement.textContent = actualStatus.toUpperCase();
            statusElement.className = `status-indicator ${actualStatus}`;
            
            // Sync toggle button with actual relay state
            if (actualStatus === 'online') {
                toggleBtn.classList.add('on');
            } else {
                toggleBtn.classList.remove('on');
            }

            // Update metrics
            document.getElementById(`voltage${port}`).textContent = `${portData.voltage.toFixed(1)}V`;
            document.getElementById(`current${port}`).textContent = `${portData.current.toFixed(2)}A`;
            document.getElementById(`power${port}`).textContent = `${portData.power.toFixed(0)}W`;

            // Update waveform data
            this.addWaveformData(port - 1, portData.voltage, portData.current, portData.power);

            // Visual feedback for port card
            const portCard = document.getElementById(`port${port}`);
            if (actualStatus === 'online') {
                portCard.style.borderColor = '#00ff00';
            } else {
                portCard.style.borderColor = '#00ff00';
            }
        }
    }

    // Add data to waveform arrays
    addWaveformData(portIndex, voltage, current, power) {
        const maxPoints = 50;
        
        // Add new data points
        this.waveformData.voltage[portIndex].push(voltage);
        this.waveformData.current[portIndex].push(current * 10); // Scale for visibility
        this.waveformData.power[portIndex].push(power / 10); // Scale for visibility
        
        // Keep only last maxPoints
        if (this.waveformData.voltage[portIndex].length > maxPoints) {
            this.waveformData.voltage[portIndex].shift();
            this.waveformData.current[portIndex].shift();
            this.waveformData.power[portIndex].shift();
        }
    }

    // Update billing information
    updateBillingInfo(todayData, monthlyData) {
        if (!todayData || !monthlyData) return;

        // Update today's summary
        document.getElementById('todayEnergy').textContent = `${todayData.total.energy} kWh`;
        document.getElementById('todayCost').textContent = `${todayData.total.cost} BDT`;
        document.getElementById('todayRuntime').textContent = todayData.total.runtime;

        // Update monthly summary
        document.getElementById('monthlyEnergy').textContent = `${monthlyData.total.energy} kWh`;
        document.getElementById('monthlyCost').textContent = `${monthlyData.total.cost} BDT`;
        document.getElementById('monthlyDays').textContent = monthlyData.total.days;

        // Update port-wise daily consumption
        for (let port = 1; port <= 4; port++) {
            const dailyData = todayData[`port${port}`];
            if (dailyData) {
                document.getElementById(`port${port}DailyEnergy`).textContent = `${dailyData.energy} kWh`;
                document.getElementById(`port${port}DailyCost`).textContent = `${dailyData.cost} BDT`;
            }
        }

        // Update port-wise monthly consumption
        for (let port = 1; port <= 4; port++) {
            const monthlyPortData = monthlyData[`port${port}`];
            if (monthlyPortData) {
                document.getElementById(`port${port}MonthlyEnergy`).textContent = `${monthlyPortData.energy} kWh`;
                document.getElementById(`port${port}MonthlyCost`).textContent = `${monthlyPortData.cost} BDT`;
            }
        }
    }

    // Update alerts section
    updateAlerts(alerts) {
        const container = document.getElementById('alertsContainer');
        
        if (!alerts || alerts.length === 0) {
            container.innerHTML = '<div class="no-alerts">No active alerts</div>';
            return;
        }

        container.innerHTML = alerts.map(alert => `
            <div class="alert-item ${alert.severity.toLowerCase()}" data-alert-id="${alert.id}">
                <div class="alert-content">
                    <div class="alert-title">${this.getAlertTitle(alert.type)}</div>
                    <div class="alert-message">${alert.message}</div>
                </div>
                <button class="alert-dismiss" onclick="dashboard.dismissAlert(${alert.id})" title="Dismiss">
                    ×
                </button>
            </div>
        `).join('');
    }

    // Update optimization suggestions
    updateSuggestions(suggestions) {
        const container = document.getElementById('suggestionsContainer');
        
        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = '<div class="no-suggestions">No suggestions available</div>';
            return;
        }

        container.innerHTML = suggestions.map(suggestion => `
            <div class="suggestion-item">
                <div class="suggestion-title">${this.getSuggestionTitle(suggestion.type)}</div>
                <div class="suggestion-message">${suggestion.message}</div>
                ${suggestion.savings ? `<div class="suggestion-savings">${suggestion.savings}</div>` : ''}
            </div>
        `).join('');
    }

    // Update header information
    updateHeaderInfo(data) {
        const now = new Date();
        document.getElementById('lastUpdate').textContent = 
            `Last Update: ${now.toLocaleTimeString()}`;
        
        if (data.electricity_rate) {
            document.getElementById('electricityRate').textContent = 
                `Rate: ${data.electricity_rate} BDT/kWh`;
        }
    }

    // Add update animation to elements
    addUpdateAnimation() {
        // Removed fade-in animation to prevent jumping
        // Elements update smoothly without visual disruption
    }

    // Update connection status indicator
    updateConnectionStatus(connected) {
        const header = document.querySelector('.header');
        if (connected) {
            header.style.borderBottom = '3px solid #28a745';
        } else {
            header.style.borderBottom = '3px solid #dc3545';
        }
    }

    // Get alert title based on type
    getAlertTitle(type) {
        const titles = {
            'HIGH_USAGE': 'High Power Usage',
            'HIGH_COST': 'High Daily Cost',
            'PEAK_USAGE': 'Peak Hour Usage',
            'DEVICE_OFFLINE': 'Device Offline',
            'SYSTEM_ERROR': 'System Error'
        };
        return titles[type] || 'Alert';
    }

    // Get suggestion title based on type
    getSuggestionTitle(type) {
        const titles = {
            'HIGH_CONSUMPTION': 'Energy Efficiency',
            'SCHEDULE_OPTIMIZATION': 'Usage Scheduling',
            'PEAK_HOUR_OPTIMIZATION': 'Peak Hour Optimization',
            'DEVICE_REPLACEMENT': 'Device Upgrade',
            'POWER_FACTOR': 'Power Factor Improvement'
        };
        return titles[type] || 'Optimization';
    }

    // Dismiss alert
    async dismissAlert(alertId) {
        try {
            const response = await fetch('/api/alerts/acknowledge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ alertId })
            });

            if (response.ok) {
                // Remove alert from UI
                const alertElement = document.querySelector(`[data-alert-id="${alertId}"]`);
                if (alertElement) {
                    alertElement.style.animation = 'fadeOut 0.3s ease-out';
                    setTimeout(() => alertElement.remove(), 300);
                }
                
                this.showNotification('Alert dismissed', 'success');
            } else {
                throw new Error('Failed to dismiss alert');
            }
        } catch (error) {
            console.error('Error dismissing alert:', error);
            this.showNotification('Failed to dismiss alert', 'error');
        }
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Style notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            zIndex: '9999',
            animation: 'slideIn 0.3s ease-out'
        });

        // Set background color based on type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        notification.style.backgroundColor = colors[type] || colors.info;

        // Add to DOM
        document.body.appendChild(notification);

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Global functions for UI interactions
function openSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'block';
    
    // Load current settings values
    if (dashboard.currentData && dashboard.currentData.electricity_rate) {
        document.getElementById('electricityRateInput').value = dashboard.currentData.electricity_rate;
    }
    
    // Update system information
    updateSystemInfo();
}

function updateSystemInfo() {
    // Update last calibration (mock data)
    const lastCalibration = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    document.getElementById('lastCalibration').textContent = lastCalibration.toLocaleDateString();
    
    // Update system uptime (mock data)
    const uptimeHours = Math.floor(Math.random() * 720 + 24); // 1-30 days
    const uptimeDays = Math.floor(uptimeHours / 24);
    const remainingHours = uptimeHours % 24;
    document.getElementById('systemUptime').textContent = `${uptimeDays}d ${remainingHours}h`;
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'none';
}

async function updateElectricityRate() {
    const rateInput = document.getElementById('electricityRateInput');
    const newRate = parseFloat(rateInput.value);
    
    if (isNaN(newRate) || newRate <= 0) {
        dashboard.showNotification('Please enter a valid rate', 'error');
        return;
    }

    try {
        const response = await fetch('/api/settings/rate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rate: newRate })
        });

        if (response.ok) {
            dashboard.showNotification('Electricity rate updated successfully', 'success');
            
            // Update header display
            document.getElementById('electricityRate').textContent = `Rate: ${newRate} BDT/kWh`;
            
            // Refresh data
            dashboard.loadInitialData();
        } else {
            throw new Error('Failed to update rate');
        }
    } catch (error) {
        console.error('Error updating electricity rate:', error);
        dashboard.showNotification('Failed to update electricity rate', 'error');
    }
}

async function updatePowerThreshold() {
    const thresholdInput = document.getElementById('powerThresholdInput');
    const newThreshold = parseFloat(thresholdInput.value);
    
    if (isNaN(newThreshold) || newThreshold <= 0) {
        dashboard.showNotification('Please enter a valid power threshold', 'error');
        return;
    }

    try {
        const response = await fetch('/api/settings/power-threshold', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ threshold: newThreshold })
        });

        if (response.ok) {
            dashboard.showNotification('Power threshold updated successfully', 'success');
        } else {
            throw new Error('Failed to update power threshold');
        }
    } catch (error) {
        console.error('Error updating power threshold:', error);
        dashboard.showNotification('Failed to update power threshold', 'error');
    }
}

async function updateCostThreshold() {
    const thresholdInput = document.getElementById('costThresholdInput');
    const newThreshold = parseFloat(thresholdInput.value);
    
    if (isNaN(newThreshold) || newThreshold <= 0) {
        dashboard.showNotification('Please enter a valid cost threshold', 'error');
        return;
    }

    try {
        const response = await fetch('/api/settings/cost-threshold', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ threshold: newThreshold })
        });

        if (response.ok) {
            dashboard.showNotification('Cost threshold updated successfully', 'success');
        } else {
            throw new Error('Failed to update cost threshold');
        }
    } catch (error) {
        console.error('Error updating cost threshold:', error);
        dashboard.showNotification('Failed to update cost threshold', 'error');
    }
}

function updateInterval() {
    const intervalInput = document.getElementById('updateIntervalInput');
    const newInterval = parseInt(intervalInput.value);
    
    if (isNaN(newInterval) || newInterval < 1 || newInterval > 60) {
        dashboard.showNotification('Please enter a valid interval (1-60 seconds)', 'error');
        return;
    }

    // Update the sample data generation interval
    clearInterval(dashboard.sampleDataInterval);
    dashboard.sampleDataInterval = setInterval(() => {
        dashboard.generateSampleData();
    }, newInterval * 1000);
    
    dashboard.showNotification(`Update interval set to ${newInterval} seconds`, 'success');
}

function toggleAutoRefresh() {
    const toggle = document.getElementById('autoRefreshToggle');
    const isEnabled = toggle.checked;
    
    if (isEnabled) {
        dashboard.startSampleDataGeneration();
        dashboard.showNotification('Auto-refresh enabled', 'success');
    } else {
        clearInterval(dashboard.sampleDataInterval);
        dashboard.showNotification('Auto-refresh disabled', 'info');
    }
}

async function clearAllAlerts() {
    if (!confirm('Are you sure you want to clear all alerts?')) {
        return;
    }

    try {
        const response = await fetch('/api/alerts/clear-all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // Clear alerts from UI
            const alertsContainer = document.getElementById('alertsContainer');
            alertsContainer.innerHTML = '<div class="no-alerts">No active alerts</div>';
            
            dashboard.showNotification('All alerts cleared', 'success');
        } else {
            throw new Error('Failed to clear alerts');
        }
    } catch (error) {
        console.error('Error clearing alerts:', error);
        dashboard.showNotification('Failed to clear alerts', 'error');
    }
}

async function updatePortLimits() {
    const portLimits = {};
    
    // Collect limits for all 4 ports
    for (let port = 1; port <= 4; port++) {
        const voltageLimit = parseFloat(document.getElementById(`port${port}VoltageLimit`).value);
        const currentLimit = parseFloat(document.getElementById(`port${port}CurrentLimit`).value);
        const powerLimit = parseFloat(document.getElementById(`port${port}PowerLimit`).value);
        
        if (isNaN(voltageLimit) || isNaN(currentLimit) || isNaN(powerLimit) || 
            voltageLimit <= 0 || currentLimit <= 0 || powerLimit <= 0) {
            dashboard.showNotification(`Please enter valid limits for Port ${port}`, 'error');
            return;
        }
        
        portLimits[`port${port}`] = {
            maxVoltage: voltageLimit,
            maxCurrent: currentLimit,
            maxPower: powerLimit
        };
    }
    
    try {
        const response = await fetch('/api/settings/port-limits', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ portLimits })
        });

        if (response.ok) {
            dashboard.showNotification('Port safety limits updated successfully', 'success');
        } else {
            throw new Error('Failed to update port limits');
        }
    } catch (error) {
        console.error('Error updating port limits:', error);
        dashboard.showNotification('Failed to update port limits', 'error');
    }
}

async function resetDailyData() {
    if (!confirm('Are you sure you want to reset today\'s consumption data?')) {
        return;
    }

    try {
        const response = await fetch('/api/reset-daily', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            dashboard.showNotification('Daily data reset successfully', 'success');
            dashboard.loadInitialData();
        } else {
            throw new Error('Failed to reset daily data');
        }
    } catch (error) {
        console.error('Error resetting daily data:', error);
        dashboard.showNotification('Failed to reset daily data', 'error');
    }
}

async function exportCSV() {
    try {
        // Get date range (last 30 days)
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const response = await fetch('/api/export/csv', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ startDate, endDate })
        });

        if (response.ok) {
            // Create download link
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `multiplug_data_${endDate}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            dashboard.showNotification('CSV export completed', 'success');
        } else {
            throw new Error('Failed to export CSV');
        }
    } catch (error) {
        console.error('Error exporting CSV:', error);
        dashboard.showNotification('Failed to export CSV', 'error');
    }
}

async function exportPDF() {
    try {
        const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // Create download link
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `multiplug_report_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            dashboard.showNotification('PDF export completed', 'success');
        } else {
            throw new Error('Failed to export PDF');
        }
    } catch (error) {
        console.error('Error exporting PDF:', error);
        dashboard.showNotification('Failed to export PDF', 'error');
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes fadeOut {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.8); }
    }
    
    .notification {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }
`;
document.head.appendChild(style);

// Initialize dashboard when DOM is loaded
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new SmartMultiplugDashboard();
});

// Handle page visibility changes (pause/resume updates when tab is hidden/visible)
document.addEventListener('visibilitychange', () => {
    if (dashboard) {
        if (document.hidden) {
            console.log('Dashboard paused (tab hidden)');
        } else {
            console.log('Dashboard resumed (tab visible)');
            dashboard.loadInitialData(); // Refresh data when tab becomes visible
        }
    }
});

// Handle online/offline events
window.addEventListener('online', () => {
    if (dashboard) {
        dashboard.showNotification('Connection restored', 'success');
        dashboard.loadInitialData();
    }
});

window.addEventListener('offline', () => {
    if (dashboard) {
        dashboard.showNotification('Connection lost', 'warning');
    }
});

// Toggle port function
async function togglePort(port) {
    const btn = document.getElementById(`toggle${port}`);
    const statusElement = document.getElementById(`status${port}`);
    
    try {
        const response = await fetch('/api/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ port })
        });

        if (response.ok) {
            const data = await response.json();
            
            // Update button and status based on relay state
            if (data.state === 'ON') {
                btn.classList.add('on');
                statusElement.textContent = 'ONLINE';
                statusElement.className = 'status-indicator online';
            } else {
                btn.classList.remove('on');
                statusElement.textContent = 'OFFLINE';
                statusElement.className = 'status-indicator offline';
            }
            
            dashboard.showNotification(`Port ${port} turned ${data.state}`, 'success');
        } else {
            throw new Error('Failed to toggle port');
        }
    } catch (error) {
        console.error('Error toggling port:', error);
        dashboard.showNotification('Failed to toggle port', 'error');
    }
}

// Master toggle function
async function toggleMaster() {
    const masterToggle = document.getElementById('masterToggle');
    const isOn = masterToggle.checked;
    
    try {
        // Toggle all ports (1-4)
        for (let port = 1; port <= 4; port++) {
            const response = await fetch('/api/toggle-master', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ port, state: isOn ? 'ON' : 'OFF' })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Update individual button appearance
                const btn = document.getElementById(`toggle${port}`);
                if (data.state === 'ON') {
                    btn.innerHTML = '<i class="fas fa-power-off"></i> Turn OFF';
                    btn.classList.add('on');
                } else {
                    btn.innerHTML = '<i class="fas fa-power-off"></i> Turn ON';
                    btn.classList.remove('on');
                }
            }
        }
        
        dashboard.showNotification(`All ports turned ${isOn ? 'ON' : 'OFF'}`, 'success');
    } catch (error) {
        console.error('Error toggling master:', error);
        dashboard.showNotification('Failed to toggle master control', 'error');
        // Revert master toggle state on error
        masterToggle.checked = !isOn;
    }
}