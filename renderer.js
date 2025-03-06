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

// Oggetti per i grafici
let projectTimeChart = null;
let dailyChart = null;
let threeDaysChart = null;
let weeklyChart = null;
let monthlyChart = null;
let yearlyChart = null;

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

// Data selezionata, di default è la data odierna
let selectedDate = moment().format('YYYY-MM-DD');

/**
 * Aggiorna e visualizza la data selezionata
 */
function updateDateDisplay() {
    const dateDisplay = document.getElementById('selectedDateDisplay');
    const formattedDate = moment(selectedDate).format('DD MMMM YYYY');
    
    // Controlla se la data è oggi
    if (moment(selectedDate).isSame(moment(), 'day')) {
        dateDisplay.textContent = `Data selezionata: Oggi (${formattedDate})`;
    } else {
        dateDisplay.textContent = `Data selezionata: ${formattedDate}`;
    }
    
    // Aggiorna il valore dell'input date
    document.getElementById('customDate').value = selectedDate;
}

/**
 * Recupera tutte le voci temporali per tutti i periodi
 * @param {string} date - Data selezionata
 */
async function fetchAllTimeEntries(date) {
    try {
        // Aggiorna il display della data
        updateDateDisplay();
        
        // Fetch dati per tutti i periodi
        const periods = ['today', '3days', 'week', 'month', 'year'];
        
        // Prepara un oggetto per memorizzare tutte le entries per periodo
        const allEntriesByPeriod = {};
        
        // Carica i dati per ciascun periodo
        for (const period of periods) {
            const { start, end } = PERIOD_MAPPING[period](date);
            
            const response = await clockifyApi.get(`/workspaces/${WORKSPACE_ID}/user/${USER_ID}/time-entries`, {
                params: { 'start': start, 'end': end, 'page': 1, 'page-size': 1000 }
            });
            
            allEntriesByPeriod[period] = response.data;
        }
        
        // Mostra le voci temporali usando i dati del periodo settimana
        displayTimeEntries(allEntriesByPeriod['week']);
        
        // Renderizza tutti i grafici
        renderAllCharts(allEntriesByPeriod);
        
    } catch (error) {
        console.error('Errore nel recupero delle voci temporali:', error);
        displayErrorMessage('Errore nel recuperare i dati. Controlla la connessione e le chiavi API.');
    }
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
 * Renderizza tutti i grafici per tutti i periodi
 * @param {Object} allEntriesByPeriod - Oggetto con le voci temporali per ciascun periodo
 */
function renderAllCharts(allEntriesByPeriod) {
    // Distrugge i grafici esistenti
    if (projectTimeChart) projectTimeChart.destroy();
    if (dailyChart) dailyChart.destroy();
    if (threeDaysChart) threeDaysChart.destroy();
    if (weeklyChart) weeklyChart.destroy();
    if (monthlyChart) monthlyChart.destroy();
    if (yearlyChart) yearlyChart.destroy();
    
    // Renderizza il grafico del tempo per progetto (usa i dati della settimana)
    renderProjectTimeChart(allEntriesByPeriod['week']);
    
    // Renderizza i grafici temporali per ciascun periodo
    renderDailyChart(allEntriesByPeriod['today']);
    renderThreeDaysChart(allEntriesByPeriod['3days']);
    renderWeeklyChart(allEntriesByPeriod['week']);
    renderMonthlyChart(allEntriesByPeriod['month']);
    renderYearlyChart(allEntriesByPeriod['year']);
}

/**
 * Renderizza il grafico a torta per il tempo per progetto
 * @param {Array} entries - Elenco delle voci temporali
 */
function renderProjectTimeChart(entries) {
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
}

/**
 * Renderizza il grafico a linee per il giorno corrente
 * @param {Array} entries - Elenco delle voci temporali
 */
function renderDailyChart(entries) {
    // Raggruppa i dati per ora
    const hourlyData = groupTimeDataByHour(entries);
    
    // Grafico a linea per il giorno
    dailyChart = new ApexCharts(document.getElementById('dailyChart'), {
        series: [{
            name: 'Ore',
            data: hourlyData.map(item => item.y)
        }],
        chart: {
            type: 'line',
            height: 250,
            background: '#1E1E1E',
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800
            }
        },
        stroke: {
            curve: 'smooth',
            width: 2,
            colors: ['#4CAF50']  // Verde come nel tema Python
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'dark',
                type: 'vertical',
                shadeIntensity: 0.3,
                opacityFrom: 0.7,
                opacityTo: 0.2,
                colorStops: [
                    {
                        offset: 0,
                        color: '#4CAF50',
                        opacity: 0.3
                    },
                    {
                        offset: 100,
                        color: '#4CAF50',
                        opacity: 0
                    }
                ]
            }
        },
        markers: {
            size: 4
        },
        theme: {
            mode: 'dark'
        },
        title: {
            text: 'Ore Cumulative di Studio nella Giornata',
            align: 'center',
            style: {
                color: '#A3BE8C'  // Colore testo verde chiaro
            }
        },
        xaxis: {
            categories: hourlyData.map(item => item.x),
            labels: {
                style: {
                    colors: '#A3BE8C'
                }
            },
            title: {
                text: 'Ora del Giorno',
                style: {
                    color: '#A3BE8C'
                }
            },
            min: 6,
            max: 24,
            tickAmount: 18
        },
        yaxis: {
            title: {
                text: 'Ore Accumulate',
                style: {
                    color: '#A3BE8C'
                }
            },
            labels: {
                formatter: function(val) {
                    return val.toFixed(1);
                },
                style: {
                    colors: '#A3BE8C'
                }
            },
            min: -1,
            max: 9,
            tickAmount: 10
        },
        annotations: {
            yaxis: [{
                y: 8,
                borderColor: 'rgba(255, 0, 0, 0.5)',
                label: {
                    text: 'GOAL',
                    position: 'right',
                    style: {
                        color: '#fff',
                        background: 'transparent'
                    }
                }
            }]
        },
        tooltip: {
            y: {
                formatter: function(value) {
                    const hours = Math.floor(value);
                    const mins = Math.round((value - hours) * 60);
                    return `${hours}h ${mins}min`;
                }
            }
        },
        grid: {
            borderColor: '#444444',
            row: {
                colors: ['transparent', 'transparent']
            },
            column: {
                colors: ['transparent', 'transparent']
            }
        },
        noData: {
            text: 'NO DATA FOR THE DAY',
            align: 'center',
            verticalAlign: 'middle',
            style: {
                color: '#A3BE8C',
                fontSize: '24px'
            }
        }
    });
    dailyChart.render();
    
    // Se ci sono dati, aggiungi l'annotazione con il totale di ore
    if (hourlyData.length > 0) {
        const totalHours = parseFloat(hourlyData[hourlyData.length - 1].y);
        const hours = Math.floor(totalHours);
        const mins = Math.round((totalHours - hours) * 60);
        
        dailyChart.addPointAnnotation({
            x: hourlyData[hourlyData.length - 1].x,
            y: totalHours,
            label: {
                text: `${hours}h ${mins}min`,
                style: {
                    color: '#fff',
                    background: 'transparent'
                },
                offsetX: -70,
                offsetY: 12
            }
        });
    }
}

/**
 * Renderizza il grafico a barre per gli ultimi 3 giorni
 * @param {Array} entries - Elenco delle voci temporali
 */
function renderThreeDaysChart(entries) {
    // Raggruppa i dati per giorno
    const dailyData = groupTimeDataByDay(entries, '3days');
    
    // Grafico a barre per 3 giorni
    threeDaysChart = new ApexCharts(document.getElementById('threeDaysChart'), {
        series: [{
            name: 'Ore',
            data: dailyData.map(item => item.y)
        }],
        chart: {
            type: 'bar',
            height: 250,
            background: '#1E1E1E'
        },
        theme: {
            mode: 'dark'
        },
        colors: ['#3F51B5'],
        title: {
            text: 'Ultimi 3 giorni',
            align: 'center',
            style: {
                color: '#fff'
            }
        },
        xaxis: {
            categories: dailyData.map(item => item.x),
            labels: {
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
    threeDaysChart.render();
}

/**
 * Renderizza il grafico a barre per la settimana corrente
 * @param {Array} entries - Elenco delle voci temporali
 */
function renderWeeklyChart(entries) {
    // Raggruppa i dati per giorno
    const weeklyData = groupTimeDataByDay(entries, 'week');
    
    // Grafico a barre per la settimana
    weeklyChart = new ApexCharts(document.getElementById('weeklyChart'), {
        series: [{
            name: 'Ore',
            data: weeklyData.map(item => item.y)
        }],
        chart: {
            type: 'bar',
            height: 250,
            background: '#1E1E1E'
        },
        theme: {
            mode: 'dark'
        },
        colors: ['#4CAF50'],
        title: {
            text: 'Settimana del ' + moment(selectedDate).startOf('week').format('DD/MM/YYYY'),
            align: 'center',
            style: {
                color: '#fff'
            }
        },
        xaxis: {
            categories: weeklyData.map(item => item.x),
            labels: {
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
    weeklyChart.render();
}

/**
 * Renderizza il grafico a barre per il mese corrente
 * @param {Array} entries - Elenco delle voci temporali
 */
function renderMonthlyChart(entries) {
    // Raggruppa i dati per giorno
    const monthlyData = groupTimeDataByDay(entries, 'month');
    
    // Grafico a barre per il mese
    monthlyChart = new ApexCharts(document.getElementById('monthlyChart'), {
        series: [{
            name: 'Ore',
            data: monthlyData.map(item => item.y)
        }],
        chart: {
            type: 'bar',
            height: 250,
            background: '#1E1E1E'
        },
        theme: {
            mode: 'dark'
        },
        colors: ['#FF5722'],
        title: {
            text: 'Mese di ' + moment(selectedDate).format('MMMM YYYY'),
            align: 'center',
            style: {
                color: '#fff'
            }
        },
        xaxis: {
            categories: monthlyData.map(item => item.x),
            labels: {
                rotate: -45,
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
    monthlyChart.render();
}

/**
 * Renderizza il grafico a barre per l'anno corrente
 * @param {Array} entries - Elenco delle voci temporali
 */
function renderYearlyChart(entries) {
    // Raggruppa i dati per mese
    const yearlyData = groupTimeDataByMonth(entries);
    
    // Grafico a barre per l'anno
    yearlyChart = new ApexCharts(document.getElementById('yearlyChart'), {
        series: [{
            name: 'Ore',
            data: yearlyData.map(item => item.y)
        }],
        chart: {
            type: 'bar',
            height: 250,
            background: '#1E1E1E'
        },
        theme: {
            mode: 'dark'
        },
        colors: ['#9C27B0'],
        title: {
            text: 'Anno ' + moment(selectedDate).format('YYYY'),
            align: 'center',
            style: {
                color: '#fff'
            }
        },
        xaxis: {
            categories: yearlyData.map(item => item.x),
            labels: {
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
    yearlyChart.render();
}

/**
 * Raggruppa i dati temporali per ora (grafico giornaliero)
 * @param {Array} entries - Elenco delle voci temporali
 * @returns {Array} Dati aggregati per il grafico
 */
function groupTimeDataByHour(entries) {
    // Inizializza array di oggetti 
    const hourlyData = {};
    
    // Crea tutte le ore del giorno (6-24) con valore 0
    for (let i = 6; i <= 24; i++) {
        const hourKey = `${i.toString().padStart(2, '0')}:00`;
        hourlyData[hourKey] = 0;
    }
    
    // Ordina le entries per orario di inizio
    const sortedEntries = [...entries].sort((a, b) => 
        moment(a.timeInterval.start).valueOf() - moment(b.timeInterval.start).valueOf()
    );
    
    // Per ogni voce, aggiungi la durata al totale cumulativo
    let cumulativeHours = 0;
    
    sortedEntries.forEach(entry => {
        const startTime = moment(entry.timeInterval.start);
        const endTime = moment(entry.timeInterval.end);
        const durationHours = moment.duration(entry.timeInterval.duration).asHours();
        
        // Aggiungi la durata al totale cumulativo
        cumulativeHours += durationHours;
        
        // Aggiorna l'ora di fine con il nuovo totale
        const hourKey = endTime.format('HH:00');
        if (hourKey in hourlyData && endTime.hour() >= 6) {
            hourlyData[hourKey] = cumulativeHours;
        }
    });
    
    // Propaga i valori cumulativi (per mantenere la linea grafica)
    let lastValue = 0;
    const hours = Object.keys(hourlyData).sort();
    for (const hour of hours) {
        if (hourlyData[hour] > 0) {
            lastValue = hourlyData[hour];
        } else {
            hourlyData[hour] = lastValue;
        }
    }
    
    // Converte in formato per ApexCharts
    return Object.keys(hourlyData)
        .map(key => ({
            x: key,
            y: parseFloat(hourlyData[key].toFixed(2))
        }))
        .sort((a, b) => a.x.localeCompare(b.x)); // Ordina per ora
}

/**
 * Raggruppa i dati temporali per giorno
 * @param {Array} entries - Elenco delle voci temporali
 * @param {string} period - Periodo selezionato ('3days', 'week', 'month')
 * @returns {Array} Dati aggregati per il grafico
 */
function groupTimeDataByDay(entries, period) {
    const dailyData = {};
    let sortedKeys = [];
    
    // Aggrega le ore per giorno
    entries.forEach(entry => {
        const startTime = moment(entry.timeInterval.start);
        let key;
        
        if (period === 'week') {
            key = startTime.format('ddd'); // Abbreviazione giorno settimana
        } else {
            key = startTime.format('DD/MM'); // Giorno/Mese
        }
        
        dailyData[key] = (dailyData[key] || 0) + moment.duration(entry.timeInterval.duration).asHours();
        
dailyData[key] = (dailyData[key] || 0) + moment.duration(entry.timeInterval.duration).asHours();
});

// Per i diversi periodi, creo array diversi per ordinare i dati
if (period === 'week') {
// Ordina per giorno della settimana (Lun-Dom)
const weekdayOrder = moment.weekdaysShort().map(d => d.substring(0, 3));
sortedKeys = Object.keys(dailyData).sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));
} else {
// Ordina cronologicamente per altri periodi
sortedKeys = Object.keys(dailyData).sort((a, b) => {
    // Per formato DD/MM
    const [dayA, monthA] = a.split('/').map(Number);
    const [dayB, monthB] = b.split('/').map(Number);
    
    if (monthA !== monthB) return monthA - monthB;
    return dayA - dayB;
});
}

// Converte in formato per ApexCharts
return sortedKeys.map(key => ({
x: key,
y: dailyData[key].toFixed(2)
}));
}

/**
* Raggruppa i dati temporali per mese (grafico annuale)
* @param {Array} entries - Elenco delle voci temporali
* @returns {Array} Dati aggregati per il grafico
*/
function groupTimeDataByMonth(entries) {
const monthlyData = {};

// Crea tutti i mesi dell'anno con valore 0
const months = moment.months().map(m => m.substring(0, 3));
months.forEach(month => {
monthlyData[month] = 0;
});

// Somma le ore per ogni voce temporale
entries.forEach(entry => {
const startTime = moment(entry.timeInterval.start);
const monthKey = startTime.format('MMM');
monthlyData[monthKey] += moment.duration(entry.timeInterval.duration).asHours();
});

// Converte in formato per ApexCharts ed ordina per mese
const monthOrder = moment.monthsShort();
return Object.keys(monthlyData)
.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b))
.map(key => ({
    x: key,
    y: monthlyData[key].toFixed(2)
}));
}

// Event listener per cambio data
document.getElementById('customDate').addEventListener('change', (event) => {
selectedDate = event.target.value;
fetchAllTimeEntries(selectedDate);
});

// Inizializzazione dell'app
document.addEventListener('DOMContentLoaded', async () => {
try {
// Ottieni la mappa dei progetti
await getProjectMap();

// Carica tutti i dati per la data corrente
fetchAllTimeEntries(selectedDate);
} catch (error) {
console.error('Errore durante l\'inizializzazione:', error);
displayErrorMessage('Errore di inizializzazione. Verifica la connessione e le API key.');
}
});

// Aggiunge funzionalità al timer
const timerElement = document.getElementById('timer');
const startButton = document.getElementById('startTimer');
const stopButton = document.getElementById('stopTimer');

let timer = null;
let seconds = 0;
let isRunning = false;

/**
* Avvia il timer
*/
function startTimer() {
if (isRunning) return;

isRunning = true;
timer = setInterval(() => {
seconds++;
updateTimerDisplay();
}, 1000);

startButton.disabled = true;
stopButton.disabled = false;
}

/**
* Ferma il timer
*/
function stopTimer() {
if (!isRunning) return;

isRunning = false;
clearInterval(timer);
seconds = 0;
updateTimerDisplay();

startButton.disabled = false;
stopButton.disabled = true;
}

/**
* Aggiorna il display del timer
*/
function updateTimerDisplay() {
const hours = Math.floor(seconds / 3600);
const minutes = Math.floor((seconds % 3600) / 60);
const secs = seconds % 60;

timerElement.textContent = [
hours.toString().padStart(2, '0'),
minutes.toString().padStart(2, '0'),
secs.toString().padStart(2, '0')
].join(':');
}

// Event listeners per i pulsanti del timer
startButton.addEventListener('click', startTimer);
stopButton.addEventListener('click', stopTimer);