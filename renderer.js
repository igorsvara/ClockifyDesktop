const axios = require('axios');
const moment = require('moment');
require('dotenv').config();

// Clockify API Configuration
const CLOCKIFY_API_KEY = process.env.CLOCKIFY_API_KEY;
const WORKSPACE_ID = process.env.WORKSPACE_ID;
const USER_ID = process.env.USER_ID;

const clockifyApi = axios.create({
    baseURL: 'https://api.clockify.me/api/v1',
    headers: {
        'X-Api-Key': CLOCKIFY_API_KEY,
        'Content-Type': 'application/json'
    }
});

// Timer Variables
let timerStartTime = null;
let timerInterval = null;

// Charts Storage
let projectTimeChart = null;
let timeDistributionChart = null;

// Time Period Mapping
const PERIOD_MAPPING = {
    'today': () => ({
        start: moment().startOf('day').toISOString(),
        end: moment().endOf('day').toISOString()
    }),
    '3days': () => ({
        start: moment().subtract(3, 'days').startOf('day').toISOString(),
        end: moment().endOf('day').toISOString()
    }),
    'week': () => ({
        start: moment().startOf('week').toISOString(),
        end: moment().endOf('week').toISOString()
    }),
    'month': () => ({
        start: moment().startOf('month').toISOString(),
        end: moment().endOf('month').toISOString()
    }),
    'year': () => ({
        start: moment().startOf('year').toISOString(),
        end: moment().endOf('year').toISOString()
    })
};

// Timer Functions (Previous implementation remains the same)
function startTimer() { /* ... */ }
function stopTimer() { /* ... */ }
function updateTimerDisplay() { /* ... */ }

// Fetch Time Entries with Period Selection
async function fetchTimeEntries(period = 'week') {
    try {
        const { start, end } = PERIOD_MAPPING[period]();
        
        const response = await clockifyApi.get(`/workspaces/${WORKSPACE_ID}/user/${USER_ID}/time-entries`, {
            params: {
                start: start,
                end: end,
                page: 1,
                pageSize: 1000  // Adjust as needed
            }
        });

        // Update UI elements
        updatePeriodDisplay(period);
        displayTimeEntries(response.data);
        renderCharts(response.data);
    } catch (error) {
        console.error('Error fetching time entries:', error);
        displayErrorMessage('Impossibile recuperare i dati del periodo');
    }
}

function updatePeriodDisplay(period) {
    const periodButtons = document.querySelectorAll('.period-btn');
    periodButtons.forEach(btn => {
        btn.classList.remove('bg-blue-600');
        btn.classList.add('bg-gray-700');
        
        if (btn.dataset.period === period) {
            btn.classList.remove('bg-gray-700');
            btn.classList.add('bg-blue-600');
        }
    });
}

function displayErrorMessage(message) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.textContent = message;
    errorContainer.classList.remove('hidden');
    
    setTimeout(() => {
        errorContainer.classList.add('hidden');
    }, 3000);
}

function displayTimeEntries(entries) {
    const tableBody = document.getElementById('timeEntriesBody');
    tableBody.innerHTML = '';
    
    entries.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${entry.project?.name || 'No Project'}</td>
            <td>${entry.description}</td>
            <td>${moment.duration(entry.timeInterval.duration).humanize()}</td>
            <td>${moment(entry.timeInterval.start).format('YYYY-MM-DD')}</td>
        `;
        tableBody.appendChild(row);
    });
}

function renderCharts(entries) {
    // Destroy existing charts if they exist
    if (projectTimeChart) projectTimeChart.destroy();
    if (timeDistributionChart) timeDistributionChart.destroy();

    // Project Time Distribution Chart
    const projectTimes = entries.reduce((acc, entry) => {
        const projectName = entry.project?.name || 'No Project';
        acc[projectName] = (acc[projectName] || 0) + moment.duration(entry.timeInterval.duration).asHours();
        return acc;
    }, {});

    projectTimeChart = new ApexCharts(document.getElementById('projectTimeChart'), {
        series: Object.values(projectTimes),
        labels: Object.keys(projectTimes),
        chart: {
            type: 'pie',
            height: 350,
            background: '#1E1E1E'
        },
        theme: {
            mode: 'dark'
        },
        noData: {
            text: 'Nessun dato disponibile',
            align: 'center',
            verticalAlign: 'middle',
            style: {
                color: '#888'
            }
        }
    });
    projectTimeChart.render();

    // Weekly Time Distribution Chart
    const groupedData = entries.reduce((acc, entry) => {
        const day = moment(entry.timeInterval.start).format('ddd');
        acc[day] = (acc[day] || 0) + moment.duration(entry.timeInterval.duration).asHours();
        return acc;
    }, {});

    timeDistributionChart = new ApexCharts(document.getElementById('timeDistributionChart'), {
        series: [{
            name: 'Ore',
            data: Object.entries(groupedData).map(([day, hours]) => ({
                x: day,
                y: hours.toFixed(2)
            }))
        }],
        chart: {
            type: 'bar',
            height: 350,
            background: '#1E1E1E'
        },
        theme: {
            mode: 'dark'
        },
        xaxis: {
            type: 'category'
        },
        noData: {
            text: 'Nessun dato disponibile',
            align: 'center',
            verticalAlign: 'middle',
            style: {
                color: '#888'
            }
        }
    });
    timeDistributionChart.render();
}

// Event Listeners
document.getElementById('startTimer').addEventListener('click', startTimer);
document.getElementById('stopTimer').addEventListener('click', stopTimer);

// Period Selection Event Listeners
document.querySelectorAll('.period-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const period = e.target.dataset.period;
        fetchTimeEntries(period);
    });
});

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    fetchTimeEntries('week');  // Default to current week
});