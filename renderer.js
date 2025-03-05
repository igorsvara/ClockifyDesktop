const axios = require('axios');
const moment = require('moment');
require('dotenv').config();

// Configurazione API Clockify
const CLOCKIFY_API_KEY = process.env.CLOCKIFY_API_KEY;
const WORKSPACE_ID = process.env.WORKSPACE_ID;
const USER_ID = process.env.USER_ID;

let projectMap = new Map();

// Creazione istanza Axios per le chiamate API
const clockifyApi = axios.create({
    baseURL: 'https://api.clockify.me/api/v1',
    headers: {
        'X-Api-Key': CLOCKIFY_API_KEY,
        'Content-Type': 'application/json'
    }
});

// Ottengo la mappa dei progetti per visualizzare i nomi dei progetti
async function getProjectMap() {
    projectMap = await fetchProjectMap(WORKSPACE_ID);
}

/**
 * Recupera tutti progetti da Clockify per un workspace specifico 
 * @param {string} workspaceId - Workspace ID per cui recuperare i progetti
 */
async function fetchProjectMap(workspaceId) {
    try {
      const response = await clockifyApi.get(`/workspaces/${workspaceId}/projects`);
      const projectMap = new Map();
      response.data.forEach(project => {
        projectMap.set(project.id, project.name);
      });
      return projectMap;
    } catch (error) {
      console.error("Errore ottenendo i progetti:", error);
      return new Map();
    }
  }

// Oggetto per mappare i periodi di tempo alle date corrispondenti
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

// Variabili globali per i grafici
let projectTimeChart = null;
let timeDistributionChart = null;

/**
 * Recupera le voci temporali da Clockify per un periodo specifico
 * @param {string} period - Periodo di tempo da recuperare (oggi, 3 giorni, settimana, mese, anno)
 */
async function fetchTimeEntries(period = 'week') {
    try {
        // Ottiene l'intervallo di date per il periodo selezionato
        const { start, end } = PERIOD_MAPPING[period]();

        // Richiesta API per recuperare le voci temporali
        const response = await clockifyApi.get(`/workspaces/${WORKSPACE_ID}/user/${USER_ID}/time-entries`, {
            params: { 'start': start, 'end': end, 'page': 1, 'page-size': 1000 }
        });
        
        // Aggiorna gli elementi dell'interfaccia
        updatePeriodDisplay(period);
        displayTimeEntries(response.data);
        renderCharts(response.data);
    } catch (error) {
        console.error('Errore nel recupero delle voci temporali:', error);
        displayErrorMessage('Impossibile recuperare i dati del periodo');
    }
}

/**
 * Aggiorna la visualizzazione dei bottoni del periodo
 * @param {string} period - Periodo attualmente selezionato
 */
function updatePeriodDisplay(period) {
    const periodButtons = document.querySelectorAll('.period-btn');
    periodButtons.forEach(btn => {
        btn.classList.remove('bg-green-600');
        btn.classList.add('bg-gray-700');
        
        if (btn.dataset.period === period) {
            btn.classList.remove('bg-gray-700');
            btn.classList.add('bg-green-600');
        }
    });
}

/**
 * Visualizza un messaggio di errore
 * @param {string} message - Messaggio di errore da visualizzare
 */
function displayErrorMessage(message) {
    const errorContainer = document.getElementById('errorContainer');
    errorContainer.textContent = message;
    errorContainer.classList.remove('hidden');
    
    setTimeout(() => {
        errorContainer.classList.add('hidden');
    }, 3000);
}

/**
 * Visualizza le voci temporali in una tabella
 * @param {Array} entries - Elenco delle voci temporali
 */
function displayTimeEntries(entries) {
    const tableBody = document.getElementById('timeEntriesBody');
    tableBody.innerHTML = '';
    
    entries.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${extractProjectName(entry.projectId)}</td>
            <td>${entry.description || 'Nessuna descrizione'}</td>
            <td>${moment.duration(entry.timeInterval.duration).humanize()}</td>
            <td>${moment(entry.timeInterval.start).format('DD-MM-YYYY')}</td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * Estrae il nome del progetto da una voce temporale
 * @param {Object} entry - Voce temporale di Clockify
 * @returns {string} Nome del progetto o 'Nessun Progetto'
 */
function extractProjectName(entry) {

    if(projectMap.has(entry.projectId)){
        return projectMap.get(entry.projectId);
    }

    return 'Not Definined';
}

/**
 * Genera grafici per distribuzione tempo e progetti
 * @param {Array} entries - Elenco delle voci temporali
 */
function renderCharts(entries) {
    // Distrugge i grafici esistenti
    if (projectTimeChart) projectTimeChart.destroy();
    if (timeDistributionChart) timeDistributionChart.destroy();

    // Calcolo tempo per progetto
    const projectTimes = entries.reduce((acc, entry) => {
        const projectName = extractProjectName(entry.projectId);
        acc[projectName] = (acc[projectName] || 0) + moment.duration(entry.timeInterval.duration).asHours();
        return acc;
    }, {});

    // Grafico a torta per tempo per progetto
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

    // Raggruppa dati per distribuzione temporale
    const groupedData = entries.reduce((acc, entry) => {
        const day = moment(entry.timeInterval.start).format('ddd');
        acc[day] = (acc[day] || 0) + moment.duration(entry.timeInterval.duration).asHours();
        return acc;
    }, {});

    // Grafico a barre per distribuzione tempo
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

// Aggiunge event listener ai bottoni del periodo
document.querySelectorAll('.period-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const period = e.target.dataset.period;
        fetchTimeEntries(period);
    });
});

// Ottinieni la mappa dei progetti
getProjectMap();

// Caricamento iniziale dei dati (settimana corrente)
document.addEventListener('DOMContentLoaded', () => {
    fetchTimeEntries('week');
});