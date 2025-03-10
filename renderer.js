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
    'today': (date) => ({
        start: moment(date).startOf('day').toISOString(),
        end: moment(date).endOf('day').toISOString(),
        format: 'HH:mm',
        groupBy: 'hour'
    }),
    '3days': (date) => ({
        start: moment(date).subtract(2, 'days').startOf('day').toISOString(),
        end: moment(date).endOf('day').toISOString(),
        format: 'DD/MM',
        groupBy: 'day'
    }),
    'week': (date) => ({
        start: moment(date).startOf('week').toISOString(),
        end: moment(date).endOf('week').toISOString(),
        format: 'ddd',
        groupBy: 'day'
    }),
    'month': (date) => ({
        start: moment(date).startOf('month').toISOString(),
        end: moment(date).endOf('month').toISOString(),
        format: 'DD/MM',
        groupBy: 'day'
    }),
    'year': (date) => ({
        start: moment(date).startOf('year').toISOString(),
        end: moment(date).endOf('year').toISOString(),
        format: 'MMM',
        groupBy: 'month'
    })
};


// Variabili globali per i grafici
let projectTimeChart = null;
let timeDistributionChart = null;
let currentPeriod = 'week'; // Periodo attualmente selezionato
let selectedDate = moment().format('YYYY-MM-DD'); // Data selezionata, di default è la data odierna

/**
 * Recupera le voci temporali da Clockify per un periodo specifico
 * @param {string} period - Periodo di tempo da recuperare (oggi, 3 giorni, settimana, mese, anno)
 * @param {string} date - Data selezionata
 */
async function fetchTimeEntries(period = 'week', date = moment().format('YYYY-MM-DD')) {
    try {
        const { start, end } = PERIOD_MAPPING[period](date);

        const response = await clockifyApi.get(`/workspaces/${WORKSPACE_ID}/user/${USER_ID}/time-entries`, {
            params: { 'start': start, 'end': end, 'page': 1, 'page-size': 1000 }
        });
        
        updatePeriodDisplay(period);
        displayTimeEntries(response.data);
        renderCharts(response.data, period);
    } catch (error) {
        console.error('Errore nel recupero delle voci temporali:', error);
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
 * Estrae il nome del progetto da un ID di progetto
 * @param {string} projectId - ID del progetto
 * @returns {string} Nome del progetto o 'Non Definito'
 */
function extractProjectName(projectId) {
    if(projectMap.has(projectId)){
        return projectMap.get(projectId);
    }
    return 'Non Definito';
}

/**
 * Genera grafici adattati al periodo selezionato
 * @param {Array} entries - Elenco delle voci temporali
 * @param {string} period - Periodo selezionato
 */
function renderCharts(entries, period) {
    // Distrugge i grafici esistenti
    if (projectTimeChart) projectTimeChart.destroy();
    if (timeDistributionChart) timeDistributionChart.destroy();

    // Recupera le impostazioni per il periodo
    const { format, groupBy } = PERIOD_MAPPING[period]();

    // Calcolo tempo per progetto (grafico a torta)
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
        tooltip: {
            y: {
                formatter: function(value) {
                    return value.toFixed(2) + ' ore';
                }
            }
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

    // Raggruppa dati per il periodo appropriato
    const timeData = groupTimeData(entries, period, format, groupBy);

    // Configura il titolo del grafico in base al periodo
    let chartTitle = 'Distribuzione del tempo';
    switch(period) {
        case 'today':
            chartTitle = 'Ore del giorno';
            break;
        case '3days':
            chartTitle = 'Ultimi 3 giorni';
            break;
        case 'week':
            chartTitle = 'Giorni della settimana';
            break;
        case 'month':
            chartTitle = 'Giorni del mese';
            break;
        case 'year':
            chartTitle = 'Mesi dell\'anno';
            break;
    }

    // Grafico a barre per distribuzione tempo
    timeDistributionChart = new ApexCharts(document.getElementById('timeDistributionChart'), {
        series: [{
            name: 'Ore',
            data: timeData
        }],
        chart: {
            type: 'bar',
            height: 350,
            background: '#1E1E1E'
        },
        theme: {
            mode: 'dark'
        },
        title: {
            text: chartTitle,
            align: 'center',
            style: {
                color: '#fff'
            }
        },
        xaxis: {
            type: 'category',
            labels: {
                rotate: period === 'month' ? -45 : 0, // Ruota le etichette per mesi lunghi
                style: {
                    colors: '#fff'
                }
            }
        },
        yaxis: {
            title: {
                text: 'Ore',
                style: {
                    color: '#fff'
                }
            },
            labels: {
                formatter: function(val) {
                    return val.toFixed(1);
                },
                style: {
                    colors: '#fff'
                }
            }
        },
        tooltip: {
            y: {
                formatter: function(value) {
                    return value.toFixed(2) + ' ore';
                }
            }
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

/**
 * Aggrega i dati temporali in base al periodo selezionato
 * @param {Array} entries - Elenco delle voci temporali
 * @param {string} period - Periodo selezionato
 * @param {string} format - Formato di visualizzazione data/ora
 * @param {string} groupBy - Tipo di raggruppamento (hour, day, month)
 * @returns {Array} Dati aggregati per il grafico
 */
function groupTimeData(entries, period, format, groupBy) {
    const groupedData = {};
    let sortedKeys = [];

    // Raggruppa i dati in base al periodo
    entries.forEach(entry => {
        let key;
        const startTime = moment(entry.timeInterval.start);
        
        if (groupBy === 'hour') {
            // Raggruppa per ora (per 'today')
            key = startTime.format('HH:00');
        } else if (groupBy === 'day') {
            // Raggruppa per giorno (per '3days', 'week', 'month')
            if (period === 'week') {
                key = startTime.format('ddd'); // Abbreviazione giorno settimana
            } else {
                key = startTime.format('DD/MM'); // Giorno/Mese
            }
        } else if (groupBy === 'month') {
            // Raggruppa per mese (per 'year')
            key = startTime.format('MMM'); // Abbreviazione mese
        }

        // Somma le ore per gruppo
        groupedData[key] = (groupedData[key] || 0) + moment.duration(entry.timeInterval.duration).asHours();
    });

    // Ordina le chiavi in base al periodo
    if (period === 'today') {
        // Ordina per ora del giorno (00:00 a 23:00)
        sortedKeys = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`).filter(key => key in groupedData);
    } else if (period === 'week') {
        // Ordina per giorno della settimana (Lun-Dom)
        const weekdayOrder = moment.weekdaysShort().map(d => d.substring(0, 3));
        sortedKeys = Object.keys(groupedData).sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));
    } else if (period === 'year') {
        // Ordina per mese (Gen-Dic)
        const monthOrder = moment.monthsShort();
        sortedKeys = Object.keys(groupedData).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));
    } else {
        // Ordina cronologicamente per altri periodi
        sortedKeys = Object.keys(groupedData).sort((a, b) => {
            if (period === '3days' || period === 'month') {
                // Per formato DD/MM
                const [dayA, monthA] = a.split('/').map(Number);
                const [dayB, monthB] = b.split('/').map(Number);
                
                if (monthA !== monthB) return monthA - monthB;
                return dayA - dayB;
            }
            
            return a.localeCompare(b);
        });
    }

    // Converte in formato per ApexCharts
    return sortedKeys.map(key => ({
        x: key,
        y: groupedData[key].toFixed(2)
    }));
}

// Aggiunge event listener ai bottoni del periodo
document.querySelectorAll('.period-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        currentPeriod = e.target.dataset.period;
        fetchTimeEntries(currentPeriod, selectedDate);
    });
});

// Ottieni la mappa dei progetti
getProjectMap();

document.getElementById('customDate').addEventListener('change', (event) => {
    selectedDate = event.target.value;
    fetchTimeEntries(currentPeriod, selectedDate);
});

// Caricamento iniziale dei dati (settimana corrente)
document.addEventListener('DOMContentLoaded', () => {
    fetchTimeEntries(currentPeriod, selectedDate);
});