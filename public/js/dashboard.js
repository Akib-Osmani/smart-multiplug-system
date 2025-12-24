// Dashboard JavaScript - Smart Multiplug System
// Handles real-time data updates, UI interactions, and advanced features

class SmartMultiplugDashboard {
    constructor() {
        // Initialize WebSocket connection
        this.socket = io();
        
        // Dashboard state
        this.currentData = null;
        this.isConnected = false;
        
        // Initialize dashboard
        this.init();
    }

    // Initialize dashboard functionality
    init() {
        this.setupSocketListeners();
        this.setupEventListeners();
        this.loadInitialData();
        
        console.log('Smart Multiplug Dashboard initialized');
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

            // Update status indicator
            const statusElement = document.getElementById(`status${port}`);
            statusElement.textContent = portData.status.charAt(0).toUpperCase() + portData.status.slice(1);
            statusElement.className = `status-indicator ${portData.status}`;

            // Update metrics
            document.getElementById(`voltage${port}`).textContent = `${portData.voltage.toFixed(1)}V`;
            document.getElementById(`current${port}`).textContent = `${portData.current.toFixed(2)}A`;
            document.getElementById(`power${port}`).textContent = `${portData.power.toFixed(0)}W`;

            // Add visual feedback for high power consumption
            const portCard = document.getElementById(`port${port}`);
            if (portData.power > 800) {
                portCard.classList.add('pulse');
            } else {
                portCard.classList.remove('pulse');
            }
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
        const elements = document.querySelectorAll('.port-card, .billing-card');
        elements.forEach(element => {
            element.classList.add('fade-in');
            setTimeout(() => element.classList.remove('fade-in'), 500);
        });
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
    
    // Load current electricity rate
    if (dashboard.currentData && dashboard.currentData.electricity_rate) {
        document.getElementById('electricityRateInput').value = dashboard.currentData.electricity_rate;
    }
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
            closeSettings();
            
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
            
            // Update button appearance
            const btn = document.getElementById(`toggle${port}`);
            if (data.state === 'ON') {
                btn.innerHTML = '<i class="fas fa-power-off"></i> Turn OFF';
                btn.classList.add('on');
            } else {
                btn.innerHTML = '<i class="fas fa-power-off"></i> Turn ON';
                btn.classList.remove('on');
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