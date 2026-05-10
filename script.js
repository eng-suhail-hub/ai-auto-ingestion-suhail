// ─────────────────────────────────────────
// STATE & CONFIG
// ─────────────────────────────────────────
let filesData = [];
let processingStats = { total: 0, done: 0, active: 0, error: 0 };
let isProcessing = false;
let isPaused = false;
let isStopped = false;
let currentBatchId = null;
let historyData = [];
let workflows = [];
let currentWorkflow = null;
let serverSettings = {};

const API_ENDPOINT = 'api/v2/index.php';

// ─────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadWorkflows();
    await loadHistory();
    log("Suhail v8 Pro جاهز للعمل.");
});

// ─────────────────────────────────────────
// CORE ACTIONS
// ─────────────────────────────────────────
async function loadSettings() {
    try {
        const res = await fetch(`${API_ENDPOINT}?action=get_settings`);
        const data = await res.json();
        if (data.success) {
            serverSettings = data.settings;
            // Fill UI settings
            if (serverSettings.gemini_key) document.getElementById('set_gemini_key').value = serverSettings.gemini_key;
            if (serverSettings.groq_key) document.getElementById('set_groq_key').value = serverSettings.groq_key;
            if (serverSettings.openrouter_key) document.getElementById('set_openrouter_key').value = serverSettings.openrouter_key;
            if (serverSettings.mistral_key) document.getElementById('set_mistral_key').value = serverSettings.mistral_key;
        }
    } catch (e) { console.error("Failed to load settings", e); }
}

async function saveServerSettings() {
    const settings = {
        gemini_key: document.getElementById('set_gemini_key').value,
        groq_key: document.getElementById('set_groq_key').value,
        openrouter_key: document.getElementById('set_openrouter_key').value,
        mistral_key: document.getElementById('set_mistral_key').value,
    };
    try {
        const res = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ action: 'save_settings', settings })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('تم الحفظ', 'تم تحديث إعدادات السيرفر بنجاح', 'success');
            serverSettings = settings;
        }
    } catch (e) { showNotification('خطأ', e.message, 'error'); }
}

async function loadWorkflows() {
    try {
        const res = await fetch(`${API_ENDPOINT}?action=get_workflows`);
        const data = await res.json();
        if (data.success) {
            workflows = data.workflows;
            const select = document.getElementById('activeWorkflow');
            select.innerHTML = workflows.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
            if (workflows.length > 0) loadWorkflow(workflows[0].id);
        }
    } catch (e) { console.error("Failed to load workflows", e); }
}

function loadWorkflow(id) {
    currentWorkflow = workflows.find(w => w.id == id);
    if (currentWorkflow) {
        log(`تم تفعيل القالب: ${currentWorkflow.name}`);
    }
}

async function loadHistory() {
    try {
        const res = await fetch(`${API_ENDPOINT}?action=get_history`);
        const data = await res.json();
        if (data.success) {
            renderHistory(data.results);
        }
    } catch (e) { console.error("Failed to load history", e); }
}

// ─────────────────────────────────────────
// UI TABS & NAVIGATION
// ─────────────────────────────────────────
function switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === `tab-${tabId}`));
    if (tabId === 'history') loadHistory();
}

// ─────────────────────────────────────────
// FILE HANDLING
// ─────────────────────────────────────────
function handleDragOver(e) { e.preventDefault(); }
function handleDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    loadFiles(files);
}
function handleFileSelect(e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    loadFiles(files);
}

function loadFiles(files) {
    if (!files.length) return;
    const newFiles = files.map((f, i) => ({
        id: Date.now() + i,
        file: f,
        status: 'pending',
        progress: 0,
        result: null,
        error: null,
        optimized: null
    }));
    filesData = [...filesData, ...newFiles];
    renderGrid();
    updateStats();
}

function renderGrid() {
    const grid = document.getElementById('imageGrid');
    grid.innerHTML = '';
    filesData.forEach(item => {
        const card = document.createElement('div');
        card.className = `img-card ${item.status}`;
        card.onclick = () => item.status === 'done' && showDetails(item);

        const img = document.createElement('img');
        img.src = URL.createObjectURL(item.file);
        card.appendChild(img);

        if (item.status !== 'done') {
            const ov = document.createElement('div');
            ov.className = 'card-overlay';
            ov.innerHTML = `<span>${item.progress}%</span><small>${item.status}</small>`;
            card.appendChild(ov);
        }
        grid.appendChild(card);
    });
}

function updateStats() {
    processingStats = {
        total: filesData.length,
        done: filesData.filter(f => f.status === 'done').length,
        active: filesData.filter(f => f.status === 'processing').length,
        error: filesData.filter(f => f.status === 'error').length,
    };
    Object.keys(processingStats).forEach(k => {
        const el = document.getElementById(`stat_${k}`);
        if (el) el.textContent = processingStats[k];
    });
}

// ─────────────────────────────────────────
// WORKFLOW EXECUTION
// ─────────────────────────────────────────
async function startWorkflow() {
    if (isProcessing || !filesData.length) return;
    isProcessing = true;
    isStopped = false;
    currentBatchId = null;

    document.getElementById('btnStart').disabled = true;
    document.getElementById('batchControls').style.display = 'flex';

    const provider = document.getElementById('activeProvider').value;
    const model = getModelByProvider(provider);

    const pending = filesData.filter(f => f.status === 'pending');

    // Create batch first to avoid race condition
    try {
        const res = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({
                action: 'create_batch',
                workflow_id: currentWorkflow?.id,
                provider,
                model,
                total_files: pending.length
            })
        });
        const data = await res.json();
        if (data.success) currentBatchId = data.batch_id;
    } catch (e) { log("Failed to create batch", "error"); }

    // Process concurrently (max 3 at a time)
    const limit = 3;
    const batches = [];
    for (let i = 0; i < pending.length; i += limit) {
        batches.push(pending.slice(i, i + limit));
    }

    for (const batch of batches) {
        if (isStopped) break;
        await Promise.all(batch.map(file => processFile(file, provider, model)));
    }

    finishWorkflow();
}

async function processFile(item, provider, model) {
    if (isStopped) return;
    item.status = 'processing';
    renderGrid();

    try {
        // 1. Optimize
        item.progress = 10; renderGrid();
        const optimized = await ImageOptimizer.optimize(item.file);
        item.optimized = optimized;
        item.progress = 30; renderGrid();

        // 2. Send to Backend
        const payload = {
            action: 'process',
            batch_id: currentBatchId,
            workflow_id: currentWorkflow.id,
            provider: provider,
            model: model,
            apiKey: serverSettings[`${provider}_key`],
            prompt: currentWorkflow.prompt,
            structure: currentWorkflow.structure,
            image: optimized,
            filename: item.file.name,
            total_files: filesData.length
        };

        const res = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            item.status = 'done';
            item.result = data.result;
            item.progress = 100;
            currentBatchId = data.batch_id;
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        item.status = 'error';
        item.error = e.message;
        log(`Error processing ${item.file.name}: ${e.message}`, 'error');
    }
    updateStats();
    renderGrid();
}

function finishWorkflow() {
    isProcessing = false;
    document.getElementById('btnStart').disabled = false;
    document.getElementById('batchControls').style.display = 'none';
    showNotification('تم الانتهاء', 'اكتملت معالجة الدفعة بنجاح', 'success');
}

function stopProcessing() {
    isStopped = true;
    isProcessing = false;
    document.getElementById('btnStart').disabled = false;
}

// ─────────────────────────────────────────
// PROVIDER UTILS
// ─────────────────────────────────────────
function getModelByProvider(provider) {
    const models = {
        'gemini': 'gemini-2.0-flash',
        'groq': 'llama-3.3-70b-versatile',
        'openrouter': 'google/gemini-2.0-flash-001',
        'mistral': 'mistral-small-latest',
        'together': 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        'pollinations': 'openai',
        'huggingface': 'meta-llama/Llama-3.2-11B-Vision-Instruct'
    };
    return models[provider] || 'default';
}

// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────
function log(msg, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    const logger = document.getElementById('ui_logger');
    if (logger) {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logger.prepend(entry);
    }
}

async function showWorkflowModal() {
    document.getElementById('workflowModal').style.display = 'flex';
}

async function saveNewWorkflow() {
    const wf = {
        name: document.getElementById('wf_name').value,
        prompt: document.getElementById('wf_prompt').value,
        structure: document.getElementById('wf_structure').value
    };
    if (!wf.name || !wf.prompt) return showNotification('خطأ', 'يرجى ملء جميع الحقول', 'error');

    try {
        const res = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ action: 'save_workflow', ...wf })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('تم الحفظ', 'تمت إضافة القالب بنجاح', 'success');
            document.getElementById('workflowModal').style.display = 'none';
            loadWorkflows();
        }
    } catch (e) { showNotification('خطأ', e.message, 'error'); }
}

function copyResult() {
    const data = document.getElementById('resultData').textContent;
    navigator.clipboard.writeText(data).then(() => {
        showNotification('تم النسخ', 'تم نسخ JSON إلى الحافظة', 'success');
    });
}

function showNotification(title, msg, type = 'success') {
    const cont = document.getElementById('notifContainer');
    const div = document.createElement('div');
    div.className = `notif ${type}`;
    div.innerHTML = `<strong>${title}</strong><p>${msg}</p>`;
    cont.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

function renderHistory(results) {
    historyData = results;
    const body = document.getElementById('historyBody');
    body.innerHTML = results.map((r, index) => `
        <tr>
            <td><img src="uploads/history/${r.stored_filename}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"></td>
            <td>${r.original_filename}</td>
            <td>${r.provider} (${r.model})</td>
            <td>${new Date(r.created_at).toLocaleString('ar-EG')}</td>
            <td><span class="status-badge ${r.status}">${r.status === 'done' ? 'مكتمل' : 'فشل'}</span></td>
            <td><button class="btn btn-sm" onclick='showDetailsFromHistory(${index})'><i class="fas fa-eye"></i></button></td>
        </tr>
    `).join('');
}

function showDetailsFromHistory(index) {
    const item = historyData[index];
    if (item) showDetails(item);
}

function showDetails(item) {
    const modal = document.getElementById('modal');
    const img = document.getElementById('previewImg');
    const dataBox = document.getElementById('resultData');

    img.src = item.stored_filename ? `uploads/history/${item.stored_filename}` : URL.createObjectURL(item.file);

    const result = typeof item.result_json === 'string' ? JSON.parse(item.result_json) : item.result;
    dataBox.innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>`;

    modal.style.display = 'flex';
}
