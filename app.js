// Carbon Footprint Tracker - Main Application Logic
// Fixes applied:
// 1) Ensure data_version is always sent to /estimate (string "27").
// 2) Never call /estimate with a missing activity_id — skip and surface a clear error.
// 3) Defensive handling for search responses (some results may return objects).
// 4) Improved error messages to show which call failed.

const CLIMATIQ_API_KEY = 'YWW31KXZ2H7SV1H94E0YS1B1HC';

const ACTIVITY_FACTORS = {
    car: 'passenger_vehicle-vehicle_type_car-fuel_source_na-distance_na-engine_size_na',
    bus: 'passenger_vehicle-vehicle_type_bus-fuel_source_na-distance_na-engine_size_na',
    train: 'passenger_vehicle-vehicle_type_train-fuel_source_na-distance_na-engine_size_na',
    flight: 'passenger_vehicle-vehicle_type_aircraft-fuel_source_na-distance_na',
    electricity: 'electricity-energy_source_grid_mix-consumer_user_grid_mix'
};

let history = [];

// Init
document.addEventListener('DOMContentLoaded', () => {
    if (typeof requireAuth === 'function' && !requireAuth()) return;
    loadHistory();
    setupEventListeners();
    renderHistory();
    renderChart();
    if (typeof getCurrentUser === 'function') {
        const u = getCurrentUser();
        if (u) {
            const el = document.getElementById('userDisplay');
            if (el) el.textContent = u.name || u.email;
        }
    }
});

// ------------------------------------------------------------------
// Validation / UI wiring
// ------------------------------------------------------------------
function setupEventListeners() {
    const form = document.getElementById('estimateForm');
    form.addEventListener('submit', handleEstimate);
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);
    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => form.dispatchEvent(new Event('submit')));
    form.querySelectorAll('input[type="number"]').forEach(input => input.addEventListener('input', validateInput));
}

function validateInput(e) {
    const input = e.target;
    if (input.value && (isNaN(input.value) || parseFloat(input.value) < 0)) {
        input.setCustomValidity('Please enter a valid positive number');
    } else {
        input.setCustomValidity('');
    }
}

// ------------------------------------------------------------------
// Climatiq: estimate (always include data_version)
// ------------------------------------------------------------------
async function estimateWithClimatiq(activity_id, parameters, data_version = "27") {
    if (!activity_id) {
        throw new Error('estimateWithClimatiq called without activity_id');
    }

    // data_version required and must be integer-string like "27"
    const dv = String(data_version);

    const requestBody = {
        emission_factor: {
            activity_id: activity_id,
            data_version: dv
        },
        parameters: parameters || {}
    };

    const resp = await fetch("https://api.climatiq.io/data/v1/estimate", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${CLIMATIQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    });

    if (!resp.ok) {
        let msg = `Climatiq estimate failed: ${resp.status}`;
        try { msg += ` - ${JSON.stringify(await resp.json())}`; }
        catch { msg += ` - ${await resp.text()}`; }
        throw new Error(msg);
    }

    const result = await resp.json();
    return {
        co2e: result.co2e || 0,
        co2e_unit: result.co2e_unit || "kg",
        full_response: result
    };
}

// ------------------------------------------------------------------
// Climatiq: search (documented /data/v1/search)
// Defensive: extract activity_id from various result shapes
// ------------------------------------------------------------------
async function searchClimatiqFactors(query) {
    if (!query || !query.trim()) return null;

    const url = `https://api.climatiq.io/data/v1/search?query=${encodeURIComponent(query)}&data_version=^27`;

    const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${CLIMATIQ_API_KEY}` }
    });

    if (!resp.ok) {
        let msg = `Climatiq search failed: ${resp.status}`;
        try { msg += ` - ${JSON.stringify(await resp.json())}`; }
        catch { msg += ` - ${await resp.text()}`; }
        throw new Error(msg);
    }

    const data = await resp.json();
    if (!data || !Array.isArray(data.results) || data.results.length === 0) return null;

    const first = data.results[0];

    // result may be a factor object or mixed shape; attempt to return activity_id
    if (first.activity_id) return first.activity_id;
    if (first.id && typeof first.id === 'string') return first.id;
    // fallback: find any field that looks like activity_id
    for (const key of Object.keys(first)) {
        if (key.toLowerCase().includes('activity') && typeof first[key] === 'string') return first[key];
    }
    return null;
}

// ------------------------------------------------------------------
// Estimate handler
// ------------------------------------------------------------------
async function handleEstimate(e) {
    e.preventDefault();

    const modeEl = document.getElementById('activityMode');
    const mode = modeEl ? modeEl.value : 'car';
    const distance = parseFloat(document.getElementById('distance').value) || 0;
    const kwh = parseFloat(document.getElementById('kwh').value) || 0;

    if (distance === 0 && kwh === 0) {
        showError('Please enter at least one value (distance or kWh)');
        return;
    }

    const estimateBtn = document.getElementById('estimateBtn');
    const resultCard = document.getElementById('resultCard');
    const resultContent = document.getElementById('resultContent');
    const rawJson = document.getElementById('rawJson');
    const retryBtn = document.getElementById('retryBtn');

    if (estimateBtn) { estimateBtn.disabled = true; estimateBtn.innerHTML = '<span class="loading-spinner"></span> Estimating...'; }
    if (resultCard) resultCard.style.display = 'block';
    if (resultContent) resultContent.innerHTML = '<div class="loading-spinner"></div> Calculating emissions...';
    if (retryBtn) retryBtn.style.display = 'none';

    try {
        const estimates = [];
        const breakdown = {};

        // TRAVEL
        if (distance > 0 && mode !== "electricity") {
            let activityId = ACTIVITY_FACTORS[mode];

            if (mode === "flight") {
                const searched = await searchClimatiqFactors("air travel");
                if (searched) activityId = searched;
            }

            if (!activityId) {
                console.warn(`No activity_id for mode=${mode}; skipping travel estimate.`);
            } else {
                const result = await estimateWithClimatiq(activityId, {
                    distance: distance,
                    distance_unit: "km"
                }, "27");
                estimates.push(result.co2e);
                breakdown[mode] = { co2e: result.co2e, unit: result.co2e_unit, details: result.full_response };
            }
        }

        // ELECTRICITY
        if (kwh > 0 || mode === "electricity") {
            const kwhVal = kwh || 0;
            if (kwhVal > 0) {
                let activityId = ACTIVITY_FACTORS.electricity;
                const searched = await searchClimatiqFactors("electricity");
                if (searched) activityId = searched;

                if (!activityId) {
                    console.warn('No activity_id for electricity; skipping electricity estimate.');
                } else {
                    const result = await estimateWithClimatiq(activityId, {
                        energy: kwhVal,
                        energy_unit: "kWh"
                    }, "27");
                    const prev = breakdown["electricity"]?.co2e || 0;
                    breakdown["electricity"] = { co2e: prev + result.co2e, unit: result.co2e_unit, details: result.full_response };
                    estimates.push(result.co2e);
                }
            }
        }

        const total = estimates.reduce((a, b) => a + b, 0);

        // render
        let html = `<div class="co2-total">Total: ${total.toFixed(2)} kg CO₂e</div>`;
        html += '<div class="breakdown">';
        for (const [k, v] of Object.entries(breakdown)) {
            html += `<div class="breakdown-item"><span>${k.charAt(0).toUpperCase() + k.slice(1)}</span><span>${v.co2e.toFixed(2)} kg CO₂e</span></div>`;
        }
        html += '</div>';
        if (resultContent) resultContent.innerHTML = html;

        const simplified = {};
        const full = {};
        for (const [k, v] of Object.entries(breakdown)) {
            simplified[k] = v.co2e;
            full[k] = v.details;
        }
        if (rawJson) rawJson.textContent = JSON.stringify({ total, breakdown: simplified, api_responses: full }, null, 2);

        const entry = { date: new Date().toISOString().split('T')[0], mode, distance, kwh, totalCo2e: total, breakdown: simplified };
        saveToHistory(entry);
        renderHistory();
        renderChart();

    } catch (err) {
        console.error('Estimate error:', err);
        showError(`Failed to estimate: ${err.message}`);
        if (retryBtn) retryBtn.style.display = 'block';
    } finally {
        if (estimateBtn) { estimateBtn.disabled = false; estimateBtn.textContent = 'Estimate CO₂e'; }
    }
}

function showError(msg) {
    const card = document.getElementById('resultCard');
    const content = document.getElementById('resultContent');
    if (card) card.style.display = 'block';
    if (content) content.innerHTML = `<div class="error-message">${msg}</div>`;
}

// ------------------------------------------------------------------
// History management
// ------------------------------------------------------------------
function saveToHistory(entry) {
    history.push(entry);
    try {
        const u = localStorage.getItem('currentUser');
        const key = u ? `carbonHistory_${JSON.parse(u).id}` : 'carbonHistory';
        localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
        console.warn('Failed to save history:', e);
    }
}

function loadHistory() {
    try {
        const u = localStorage.getItem('currentUser');
        const key = u ? `carbonHistory_${JSON.parse(u).id}` : 'carbonHistory';
        const stored = localStorage.getItem(key);
        history = stored ? JSON.parse(stored) : [];
    } catch {
        history = [];
    }
}

function renderHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const recent = history
        .map((e, i) => ({ e, i }))
        .filter(item => ((Date.now() - new Date(item.e.date)) / 86400000) <= 7)
        .sort((a, b) => new Date(b.e.date) - new Date(a.e.date));

    recent.forEach(({ e, i }) => {
        const top = Object.keys(e.breakdown)[0] || e.mode;
        const val = e.breakdown[top] || 0;
        const row = document.createElement('tr');
        row.innerHTML = `<td>${e.date}</td><td>${e.totalCo2e.toFixed(2)}</td><td>${top} (${val.toFixed(2)} kg)</td><td><button class="action-btn delete" onclick="deleteHistoryEntry(${i})">Delete</button></td>`;
        tbody.appendChild(row);
    });
}

window.deleteHistoryEntry = function(index) {
    if (confirm('Delete this entry?')) {
        history.splice(index, 1);
        try {
            const u = localStorage.getItem('currentUser');
            const key = u ? `carbonHistory_${JSON.parse(u).id}` : 'carbonHistory';
            localStorage.setItem(key, JSON.stringify(history));
        } catch {}
        renderHistory();
        renderChart();
    }
};

// ------------------------------------------------------------------
// Chart
// ------------------------------------------------------------------
let chartInstance = null;
function renderChart() {
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    const last7 = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const entries = history.filter(x => x.date === ds);
        const total = entries.reduce((s, x) => s + x.totalCo2e, 0);
        last7.push({ date: ds, total });
    }

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last7.map(d => {
                const dt = new Date(d.date);
                return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'CO₂e (kg)',
                data: last7.map(d => d.total),
                borderColor: '#2c7be5',
                backgroundColor: 'rgba(44,123,229,0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 3
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// ------------------------------------------------------------------
// CSV export
// ------------------------------------------------------------------
function exportCSV() {
    if (history.length === 0) { alert('No history to export'); return; }
    const headers = ["Date", "Mode", "Distance (km)", "Electricity (kWh)", "Total CO₂e (kg)", "Breakdown"];
    const rows = history.map(e => [e.date, e.mode, e.distance || 0, e.kwh || 0, e.totalCo2e.toFixed(2), JSON.stringify(e.breakdown || {})]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `carbon-footprint-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}
