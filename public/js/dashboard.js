// Dashboard JavaScript - Smart Multiplug System
// Handles real-time data updates, UI interactions, and advanced features

class SmartMultiplugDashboard {
    constructor() {
        // Initialize WebSocket connection
        this.socket = io();
        
        // Dashboard state
        this.currentData = null;
        this.isConnected = false;
        
        // Hardware sync state tracking
        this.pendingStates = {
            master: null,
            port1: null,
            port2: null
        };
        
        // Toggle control priority - prevents sync override during user interaction
        // REMOVED: No longer needed since auto-sync is disabled
        
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
        
        console.log('Smart Multiplug Dashboard initialized - Waiting for WiFi module data');
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

    // Update real-time status for all ports - toggle independent of power readings
    updateRealtimeStatus(realtimeData) {
        for (let port = 1; port <= 4; port++) {
            const portData = realtimeData[`port${port}`];
            if (!portData) continue;

            const statusElement = document.getElementById(`status${port}`);
            const toggle = document.getElementById(`toggle${port}`);
            
            // Status based on relay_state from server
            const actualStatus = portData.relay_state === 'ON' ? 'online' : 'offline';
            
            // Update status for all ports
            if (statusElement) {
                statusElement.textContent = actualStatus.toUpperCase();
                statusElement.className = `status-indicator ${actualStatus}`;
            }
            
            // Update toggle state for controllable ports (1-2)
            if (port <= 2 && toggle && portData.relay_state !== undefined) {
                const serverState = (portData.relay_state === 'ON');
                toggle.checked = serverState;
            }

            // Always update metrics
            document.getElementById(`voltage${port}`).textContent = `${portData.voltage.toFixed(1)}V`;
            document.getElementById(`current${port}`).textContent = `${portData.current.toFixed(2)}A`;
            document.getElementById(`power${port}`).textContent = `${portData.power.toFixed(0)}W`;

            // Update waveform data
            this.addWaveformData(port - 1, portData.voltage, portData.current, portData.power);
        }
    }

    // Add waveform data point
    addWaveformData(portIndex, voltage, current, power) {
        const maxPoints = 50;
        
        this.waveformData.voltage[portIndex].push(voltage);
        this.waveformData.current[portIndex].push(current);
        this.waveformData.power[portIndex].push(power);
        
        if (this.waveformData.voltage[portIndex].length > maxPoints) {
            this.waveformData.voltage[portIndex].shift();
            this.waveformData.current[portIndex].shift();
            this.waveformData.power[portIndex].shift();
        }
    }

    // Toggle port relay state - with immediate sync after server update
    async togglePort(port) {
        if (port > 2) return; // Only ports 1-2 are controllable
        
        const toggle = document.getElementById(`toggle${port}`);
        const newState = toggle.checked;
        
        try {
            const response = await fetch('/api/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ port })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`Port ${port} toggled to ${result.state}`);
                this.showNotification(`Port ${port} ${result.state}`, 'success');
                
                // Trigger immediate ESP32 sync after server confirms update
                if (result.syncTriggered) {
                    this.socket.emit('triggerESP32Sync');
                    console.log('ESP32 sync triggered after server update');
                }
            } else {
                throw new Error('Toggle failed');
            }
        } catch (error) {
            console.error('Toggle error:', error);
            this.showNotification('Toggle failed', 'error');
            
            // Revert toggle on error
            if (toggle) toggle.checked = !newState;
        }
    }

    // Update billing information
    updateBillingInfo(todayData, monthlyData) {
        if (todayData) {
            document.getElementById('todayEnergy').textContent = `${todayData.total.energy} kWh`;
            document.getElementById('todayCost').textContent = `${todayData.total.cost} BDT`;
            document.getElementById('todayRuntime').textContent = todayData.total.runtime;
            
            for (let port = 1; port <= 4; port++) {
                const portData = todayData[`port${port}`];
                if (portData) {
                    document.getElementById(`port${port}DailyEnergy`).textContent = `${portData.energy} kWh`;
                    document.getElementById(`port${port}DailyCost`).textContent = `${portData.cost} BDT`;
                }
            }
        }
        
        if (monthlyData) {
            document.getElementById('monthlyEnergy').textContent = `${monthlyData.total.energy} kWh`;
            document.getElementById('monthlyCost').textContent = `${monthlyData.total.cost} BDT`;
            document.getElementById('monthlyDays').textContent = monthlyData.total.days;
            
            for (let port = 1; port <= 4; port++) {
                const portData = monthlyData[`port${port}`];
                if (portData) {
                    document.getElementById(`port${port}MonthlyEnergy`).textContent = `${portData.energy} kWh`;
                    document.getElementById(`port${port}MonthlyCost`).textContent = `${portData.cost} BDT`;
                }
            }
        }
    }

    // Update alerts
    updateAlerts(alerts) {
        const container = document.getElementById('alertsContainer');
        if (!alerts || alerts.length === 0) {
            container.innerHTML = '<div class="no-alerts">No active alerts</div>';
            return;
        }
        
        container.innerHTML = alerts.map(alert => `
            <div class="alert alert-${alert.severity.toLowerCase()}">
                <div class="alert-content">
                    <strong>${alert.type.replace('_', ' ')}</strong>
                    <p>${alert.message}</p>
                    <small>${new Date(alert.timestamp).toLocaleString()}</small>
                </div>
                <button class="alert-dismiss" onclick="dashboard.dismissAlert(${alert.id})">&times;</button>
            </div>
        `).join('');
    }

    // Update suggestions
    updateSuggestions(suggestions) {
        const container = document.getElementById('suggestionsContainer');
        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = '<div class="no-suggestions">No suggestions available</div>';
            return;
        }
        
        container.innerHTML = suggestions.map(suggestion => `
            <div class="suggestion suggestion-${suggestion.type.toLowerCase()}">
                <div class="suggestion-content">
                    <strong>Port ${suggestion.port}</strong>
                    <p>${suggestion.message}</p>
                    <small class="savings">${suggestion.savings}</small>
                </div>
            </div>
        `).join('');
    }

    // Update header info
    updateHeaderInfo(data) {
        if (data.timestamp) {
            document.getElementById('lastUpdate').textContent = `Last Update: ${data.timestamp}`;
        }
    }

    // Update connection status
    updateConnectionStatus(connected) {
        const statusElements = document.querySelectorAll('.status-indicator');
        statusElements.forEach(element => {
            if (!connected && !element.classList.contains('disabled')) {
                element.textContent = 'DISCONNECTED';
                element.className = 'status-indicator offline';
            }
        });
    }

    // Add update animation
    addUpdateAnimation() {
        const cards = document.querySelectorAll('.port-card, .billing-card');
        cards.forEach(card => {
            card.style.opacity = '0.8';
            setTimeout(() => {
                card.style.opacity = '1';
            }, 100);
        });
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Dismiss alert
    async dismissAlert(alertId) {
        try {
            await fetch('/api/alerts/acknowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alertId })
            });
        } catch (error) {
            console.error('Error dismissing alert:', error);
        }
    }

    // Settings methods
    openSettings() {
        document.getElementById('settingsModal').style.display = 'block';
    }

    closeSettings() {
        document.getElementById('settingsModal').style.display = 'none';
    }
}

// Initialize dashboard
const dashboard = new SmartMultiplugDashboard();

// Global functions for HTML onclick handlers
function togglePort(port) {
    if (dashboard) {
        dashboard.togglePort(port);
    }
}

function exportCSV() {
    const startDate = prompt('Start date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    const endDate = prompt('End date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    
    if (startDate && endDate) {
        fetch('/api/export/csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate })
        })
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `consumption_${startDate}_${endDate}.csv`;
            a.click();
        })
        .catch(error => {
            console.error('Export error:', error);
            dashboard.showNotification('Export failed', 'error');
        });
    }
}

function exportPDF() {
    dashboard.showNotification('PDF export temporarily disabled. Use CSV export.', 'warning');
}

function openSettings() {
    dashboard.openSettings();
}

function closeSettings() {
    dashboard.closeSettings();
}

function updateElectricityRate() {
    const rate = document.getElementById('electricityRateInput').value;
    fetch('/api/settings/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate: parseFloat(rate) })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            dashboard.showNotification('Rate updated successfully', 'success');
            document.getElementById('electricityRate').textContent = `Rate: ${rate} BDT/kWh`;
        }
    })
    .catch(error => {
        console.error('Rate update error:', error);
        dashboard.showNotification('Rate update failed', 'error');
    });
}

function resetDailyData() {
    if (confirm('Reset today\'s consumption data? This cannot be undone.')) {
        fetch('/api/reset-daily', { method: 'POST' })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                dashboard.showNotification('Daily data reset successfully', 'success');
            }
        })
        .catch(error => {
            console.error('Reset error:', error);
            dashboard.showNotification('Reset failed', 'error');
        });
    }
}

function resetMonthlyData() {
    const year = prompt('Year (leave empty for current year):');
    const month = prompt('Month (1-12, leave empty for current month):');
    
    if (confirm('Reset monthly consumption data? This cannot be undone.')) {
        const body = {};
        if (year) body.year = parseInt(year);
        if (month) body.month = parseInt(month);
        
        fetch('/api/reset-monthly', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                dashboard.showNotification(result.message || 'Monthly data reset successfully', 'success');
            }
        })
        .catch(error => {
            console.error('Reset error:', error);
            dashboard.showNotification('Reset failed', 'error');
        });
    }
}

function clearAllAlerts() {
    dashboard.showNotification('Alert clearing not implemented', 'info');
}

function updatePowerThreshold() {
    dashboard.showNotification('Threshold update not implemented', 'info');
}

function updateCostThreshold() {
    dashboard.showNotification('Threshold update not implemented', 'info');
}

function updateInterval() {
    dashboard.showNotification('Interval update not implemented', 'info');
}

function toggleAutoRefresh() {
    dashboard.showNotification('Auto-refresh toggle not implemented', 'info');
}

function syncESP32() {
    fetch('/api/sync-esp32', { method: 'POST' })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                dashboard.showNotification('ESP32 sync triggered', 'success');
            } else {
                dashboard.showNotification('Sync failed', 'error');
            }
        })
        .catch(error => {
            console.error('Sync error:', error);
            dashboard.showNotification('Sync failed', 'error');
        });
}