// PDF TOC Editor - Dashbord Fresh V2 Frontend Logic

// State management
const state = {
    uploadedFile: null,
    filename: null,
    originalFilename: null,
    pageCount: 0,
    tocEntries: [],
    outputFilename: null,
    sortable: null, // Reference to SortableJS instance

    // AI Config State
    systemConfig: null,
    useSystemConfig: false
};

// DOM Elements
const elements = {
    // Sidebar
    sidebarInfo: document.getElementById('sidebar-info'),
    sidebarEmpty: document.getElementById('sidebar-empty'),
    sidebarFileName: document.getElementById('sidebar-file-name'),
    sidebarFileMeta: document.getElementById('sidebar-file-meta'),
    pageOffset: document.getElementById('page-offset'),
    btnRestart: document.getElementById('btn-restart'),

    // Sections
    uploadSection: document.getElementById('upload-section'),
    tocSection: document.getElementById('toc-section'),
    editSection: document.getElementById('edit-section'),
    downloadSection: document.getElementById('download-section'),

    // Status
    statusStep: document.getElementById('status-step'),
    entryCountPill: document.getElementById('entry-count-pill'),
    entryCount: document.getElementById('entry-count'),

    // Upload
    uploadArea: document.getElementById('upload-area'),
    fileInput: document.getElementById('file-input'),

    // Actions
    btnStandardSetup: document.getElementById('btn-standard-setup'),
    btnAIOCR: document.getElementById('btn-ai-ocr'),
    btnManual: document.getElementById('btn-manual'),
    btnAddEntry: document.getElementById('btn-add-entry'),
    btnGenerate: document.getElementById('btn-generate'),
    btnDownload: document.getElementById('btn-download'),
    btnBackToStrategy: document.getElementById('btn-back-to-strategy'),

    // AI Modal
    aiModal: document.getElementById('ai-modal'),
    btnAIRun: document.getElementById('btn-ai-run'),
    aiBaseUrl: document.getElementById('ai-base-url'),
    aiApiKey: document.getElementById('ai-api-key'),
    aiModel: document.getElementById('ai-model'),
    aiPageStart: document.getElementById('ai-page-start'),
    aiPageEnd: document.getElementById('ai-page-end'),

    // Standard Modal
    standardModal: document.getElementById('standard-modal'),
    btnStandardSetup: document.getElementById('btn-standard-setup'),
    btnStandardRun: document.getElementById('btn-std-run'),
    stdCalcPhys: document.getElementById('std-calc-phys'),
    stdCalcLogic: document.getElementById('std-calc-logic'),
    stdCalcResult: document.getElementById('std-calc-result'),

    // System Config UI
    systemConfigToggle: document.getElementById('system-config-toggle'),
    configToggleDot: document.getElementById('config-toggle-dot'),
    aiSettingsFields: document.getElementById('ai-settings-fields'),
    systemConfigBadge: document.getElementById('system-config-badge'),

    // Offset Calculator
    calcPhys: document.getElementById('calc-phys'),
    calcLogic: document.getElementById('calc-logic'),
    calcResult: document.getElementById('calc-result'),

    // Shared
    tocList: document.getElementById('toc-list'),
    bookmarkCount: document.getElementById('bookmark-count'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text')
};

// Initialize
function init() {
    setupEventListeners();
    initSortable();
    loadAIConfig();
    fetchSystemConfig();

    // Initial calculator sync if elements exist
    if (elements.calcPhys) {
        const phys = parseInt(elements.calcPhys.value) || 0;
        const logic = parseInt(elements.calcLogic.value) || 0;
        elements.calcResult.textContent = phys - logic;
    }
}

// Initialize SortableJS
function initSortable() {
    if (!elements.tocList) return;
    state.sortable = new Sortable(elements.tocList, {
        animation: 150,
        handle: '.item-drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: () => {
            handleReorderSync();
        }
    });
}

// Event Listeners
function setupEventListeners() {
    // Upload interactions
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) uploadFile(file);
    });

    // Drag & Drop
    ['dragover', 'dragenter'].forEach(ev => {
        elements.uploadArea.addEventListener(ev, (e) => {
            e.preventDefault();
            elements.uploadArea.classList.add('border-sky-500', 'bg-white', 'scale-[1.02]');
        });
    });
    ['dragleave', 'drop'].forEach(ev => {
        elements.uploadArea.addEventListener(ev, (e) => {
            e.preventDefault();
            elements.uploadArea.classList.remove('border-sky-500', 'bg-white', 'scale-[1.02]');
        });
    });
    elements.uploadArea.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') uploadFile(file);
    });

    // Action Buttons
    if (elements.btnAIOCR) elements.btnAIOCR.onclick = () => toggleAIModal(true);
    if (elements.btnStandardSetup) elements.btnStandardSetup.onclick = () => toggleStandardModal(true);
    if (elements.btnBackToStrategy) elements.btnBackToStrategy.onclick = () => {
        hideAllSections();
        elements.tocSection.classList.remove('hidden');
        updateStatus('STRATEGY SELECT');
    };

    if (elements.btnAddEntry) elements.btnAddEntry.onclick = () => addTOCEntry();
    if (elements.btnGenerate) elements.btnGenerate.onclick = generatePDF;

    if (elements.btnDownload) {
        elements.btnDownload.onclick = () => {
            let downloadName = state.outputFilename;
            if (state.originalFilename) {
                const nameParts = state.originalFilename.split('.');
                const ext = nameParts.pop();
                const base = nameParts.join('.');
                downloadName = `${base}_完整目录.${ext}`;
            }
            window.location.href = `/api/download/${state.outputFilename}?name=${encodeURIComponent(downloadName)}`;
        };
    }

    if (elements.btnManual) {
        elements.btnManual.onclick = () => {
            state.tocEntries = [];
            processTOCResults();
        };
    }

    if (elements.btnAIRun) elements.btnAIRun.onclick = extractTOCWithAI;
    if (elements.btnStandardRun) {
        elements.btnStandardRun.onclick = () => {
            toggleStandardModal(false);
            extractTOC();
        };
    }

    if (elements.btnRestart) elements.btnRestart.onclick = () => location.reload();

    // Shared Calculator logic for AI Modal
    const updateAICalc = () => {
        const phys = parseInt(elements.calcPhys.value) || 0;
        const logic = parseInt(elements.calcLogic.value) || 0;
        const offset = phys - logic;
        elements.calcResult.textContent = offset;
        elements.pageOffset.value = offset;

        // Sync to standard modal
        elements.stdCalcPhys.value = phys;
        elements.stdCalcLogic.value = logic;
        elements.stdCalcResult.textContent = offset;
    };
    elements.calcPhys.oninput = updateAICalc;
    elements.calcLogic.oninput = updateAICalc;

    // Shared Calculator logic for Standard Modal
    const updateStdCalc = () => {
        const phys = parseInt(elements.stdCalcPhys.value) || 0;
        const logic = parseInt(elements.stdCalcLogic.value) || 0;
        const offset = phys - logic;
        elements.stdCalcResult.textContent = offset;
        elements.pageOffset.value = offset;

        // Sync to AI modal
        elements.calcPhys.value = phys;
        elements.calcLogic.value = logic;
        elements.calcResult.textContent = offset;
    };
    elements.stdCalcPhys.oninput = updateStdCalc;
    elements.stdCalcLogic.oninput = updateStdCalc;
    elements.btnRestart.addEventListener('click', () => location.reload());
}

async function uploadFile(file) {
    showLoading('UPLOADING ASSETS...');
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        let data;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(`Server returned non-JSON response (Status ${response.status}): ${text.substring(0, 100)}...`);
        }

        if (data.success) {
            state.filename = data.filename;
            state.originalFilename = data.original_filename;
            state.pageCount = data.page_count;
            elements.sidebarFileName.textContent = data.original_filename;
            elements.sidebarFileMeta.textContent = `${data.page_count} PAGES TOTAL`;
            elements.sidebarEmpty.classList.add('hidden');
            elements.sidebarInfo.classList.remove('hidden');
            hideAllSections();
            elements.tocSection.classList.remove('hidden');
            updateStatus('STRATEGY SELECT');
            hideLoading();
        } else throw new Error(data.error);
    } catch (e) {
        hideLoading();
        console.error('Upload error details:', e);
        alert('Upload Error: ' + e.message);
    }
}

async function extractTOC() {
    showLoading('CORE PARSING...');
    try {
        const response = await fetch('/api/extract-toc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: state.filename })
        });
        const data = await response.json();
        if (data.success) {
            state.tocEntries = data.toc;
            processTOCResults();
        } else throw new Error(data.error);
    } catch (e) {
        hideLoading();
        alert('Extraction Failed: ' + e.message);
    }
}

async function extractTOCWithAI() {
    const config = {
        api_key: state.useSystemConfig ? "" : elements.aiApiKey.value,
        base_url: elements.aiBaseUrl.value,
        model: elements.aiModel.value,
        page_start: parseInt(elements.aiPageStart.value),
        page_end: parseInt(elements.aiPageEnd.value)
    };

    // Validation: Require API Key only if NOT using system config
    if ((!state.useSystemConfig && !config.api_key) || !config.base_url) {
        return alert('Please fill in API Key and Base URL.');
    }

    saveAIConfig(config);
    toggleAIModal(false);
    showLoading('AI BRAIN THINKING...');

    try {
        const response = await fetch('/api/extract-toc-ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: state.filename,
                api_key: config.api_key,
                base_url: config.base_url,
                model: config.model,
                page_start: config.page_start || 1,
                page_end: config.page_end || 8
            })
        });
        const data = await response.json();
        if (data.success) {
            state.tocEntries = data.toc;

            // Note: We don't overwrite the human-calculated offset here
            // unless the user specifically wants the AI to do it.
            // For this guided mode, we trust the calculator's value already set in state.

            processTOCResults();
        } else throw new Error(data.error);
    } catch (e) {
        hideLoading();
        alert('AI Extraction Failed: ' + e.message);
    }
}

function backfillTOCPages(entries) {
    if (!entries || entries.length === 0) return entries;

    // Reverse scan to backfill missing pages (Part titles etc. often share page with first chapter)
    let lastValidPage = null;
    for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].page && !isNaN(entries[i].page)) {
            lastValidPage = entries[i].page;
        } else if (lastValidPage !== null) {
            entries[i].page = lastValidPage;
        }
    }
    return entries;
}

function processTOCResults() {
    state.tocEntries = backfillTOCPages(state.tocEntries);
    renderTOCList();
    hideAllSections();
    elements.editSection.classList.remove('hidden');
    elements.entryCountPill.classList.remove('hidden');
    updateStatus('EDITING CANVAS');
    hideLoading();
}

function toggleAIModal(show) {
    if (show) {
        elements.aiModal.classList.remove('pointer-events-none', 'opacity-0');
    } else {
        elements.aiModal.classList.add('pointer-events-none', 'opacity-0');
    }
}

function toggleStandardModal(show) {
    if (show) {
        elements.standardModal.classList.remove('pointer-events-none', 'opacity-0');
    } else {
        elements.standardModal.classList.add('pointer-events-none', 'opacity-0');
    }
}
function saveAIConfig(config) {
    localStorage.setItem('pdf_marker_ai_config', JSON.stringify({
        base_url: config.base_url,
        model: config.model,
        api_key: config.api_key
    }));
}

function loadAIConfig() {
    const saved = localStorage.getItem('pdf_marker_ai_config');
    if (saved) {
        const config = JSON.parse(saved);
        elements.aiBaseUrl.value = config.base_url || 'https://api.openai.com/v1';
        elements.aiModel.value = config.model || 'gpt-4o';
        elements.aiApiKey.value = config.api_key || '';
    } else {
        elements.aiBaseUrl.value = 'https://api.openai.com/v1';
    }
}

function startManualEntry() {
    state.tocEntries = [];
    addTOCEntry();
    hideAllSections();
    elements.editSection.classList.remove('hidden');
    elements.entryCountPill.classList.remove('hidden');
    updateStatus('MANUAL DESIGN');
}

function addTOCEntry(entry = { title: '', page: 1, level: 0 }) {
    state.tocEntries.push(entry);
    renderTOCList();
}

function removeTOCEntry(index) {
    state.tocEntries.splice(index, 1);
    renderTOCList();
}

function updateTOCEntry(index, field, value) {
    state.tocEntries[index][field] = value;
}

async function fetchSystemConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        state.systemConfig = data;

        // Priority: If system config is available, always default to it
        if (data.has_system_key && data.llm_base_url) {
            elements.systemConfigToggle.classList.remove('hidden');
            toggleSystemConfig(true);
        }
    } catch (e) {
        console.error("Failed to fetch system config:", e);
    }
}

function toggleSystemConfig(forceValue = null) {
    state.useSystemConfig = forceValue !== null ? forceValue : !state.useSystemConfig;

    if (state.useSystemConfig) {
        // Active Built-in State
        elements.systemConfigToggle.classList.add('ring-4', 'ring-sky-500/20', 'bg-sky-500', 'border-sky-600');
        elements.systemConfigToggle.querySelector('span').classList.replace('text-sky-700', 'text-white');
        elements.configToggleDot.classList.replace('bg-slate-300', 'bg-white');

        elements.aiSettingsFields.classList.add('hidden');
        elements.systemConfigBadge.classList.remove('hidden');

        // Fill values for extraction
        elements.aiBaseUrl.value = state.systemConfig.llm_base_url;
        elements.aiModel.value = state.systemConfig.llm_model;
        elements.aiApiKey.value = "●●●●●●●●";
    } else {
        // Active Custom State
        elements.systemConfigToggle.classList.remove('ring-4', 'ring-sky-500/20', 'bg-sky-500', 'border-sky-600');
        elements.systemConfigToggle.querySelector('span').classList.replace('text-white', 'text-sky-700');
        elements.configToggleDot.classList.replace('bg-white', 'bg-slate-300');

        elements.aiSettingsFields.classList.remove('hidden');
        elements.systemConfigBadge.classList.add('hidden');

        // Restore custom config
        loadAIConfig();
    }
}

// Re-map the state based on the DOM order after Drag & Drop
function handleReorderSync() {
    const newOrder = [];
    const entryElements = elements.tocList.querySelectorAll('[data-index]');
    entryElements.forEach(el => {
        const oldIndex = parseInt(el.getAttribute('data-index'));
        newOrder.push(state.tocEntries[oldIndex]);
    });
    state.tocEntries = newOrder;
    renderTOCList(); // Re-render to update the data-index attributes
}

function renderTOCList() {
    elements.tocList.innerHTML = '';
    state.tocEntries.forEach((entry, index) => {
        const div = document.createElement('div');
        const levelPaddings = ['pl-0', 'pl-2 lg:pl-10', 'pl-4 lg:pl-20'];
        const levelIndicators = ['bg-sky-500', 'bg-sky-300', 'bg-slate-200'];

        div.className = `flex items-center gap-1.5 lg:gap-4 group animate-section ${levelPaddings[entry.level] || ''}`;
        div.setAttribute('data-index', index);

        div.innerHTML = `
            <div class="item-drag-handle p-1.5 lg:p-2 transition-transform active:scale-125 shrink-0 text-slate-300">
                <svg class="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 8h16M4 16h16"></path></svg>
            </div>
            <div class="h-8 lg:h-12 w-0.5 lg:w-1 flex-shrink-0 ${levelIndicators[entry.level] || 'bg-slate-200'} rounded-full opacity-60"></div>
            <div class="flex-1 flex items-center gap-1.5 lg:gap-3 min-w-0">
                <input type="text" class="flex-1 min-w-0 bg-white border border-slate-100 rounded-lg lg:rounded-2xl px-2 lg:px-5 py-2 lg:py-3.5 text-[11px] lg:text-sm focus:ring-4 focus:ring-sky-500/5 focus:border-sky-500 outline-none transition-all placeholder:text-slate-300 text-slate-700 font-bold shadow-sm" placeholder="Title" value="${entry.title}" onchange="updateTOCEntry(${index}, 'title', this.value)">
                <input type="number" class="w-12 lg:w-24 bg-white border border-slate-100 rounded-lg lg:rounded-2xl px-1 lg:px-5 py-2 lg:py-3.5 text-[11px] lg:text-sm focus:ring-4 focus:ring-sky-500/5 focus:border-sky-500 outline-none transition-all text-center font-bold text-sky-500 shadow-sm" placeholder="P" value="${entry.page}" min="1" onchange="updateTOCEntry(${index}, 'page', parseInt(this.value))">
                <select class="bg-white border border-slate-100 rounded-lg lg:rounded-2xl px-1 lg:px-4 py-2 lg:py-3.5 text-[8px] lg:text-[10px] font-black uppercase tracking-tight lg:tracking-widest outline-none cursor-pointer hover:border-sky-500 transition-all text-slate-400 shadow-sm" onchange="updateTOCEntry(${index}, 'level', parseInt(this.value))">
                    <option value="0" ${entry.level === 0 ? 'selected' : ''}>L1</option>
                    <option value="1" ${entry.level === 1 ? 'selected' : ''}>L2</option>
                    <option value="2" ${entry.level === 2 ? 'selected' : ''}>L3</option>
                </select>
                <button class="p-1.5 lg:p-4 text-slate-200 hover:text-red-500 transition-all shrink-0" onclick="removeTOCEntry(${index})">
                    <svg class="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
        elements.tocList.appendChild(div);
    });
    elements.entryCount.textContent = `${state.tocEntries.length} ENTRIES`;
}

async function generatePDF() {
    if (state.tocEntries.length === 0) return alert('No entries to build.');
    showLoading('GENERATING PDF...');
    const offset = parseInt(elements.pageOffset.value) || 0;
    try {
        const response = await fetch('/api/add-toc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: state.filename, toc: state.tocEntries, page_offset: offset })
        });
        const data = await response.json();
        if (data.success) {
            state.outputFilename = data.output_filename;
            elements.bookmarkCount.textContent = data.bookmark_count;
            hideAllSections();
            elements.downloadSection.classList.remove('hidden');
            elements.entryCountPill.classList.add('hidden');
            updateStatus('PROCESS COMPLETE');
            hideLoading();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else throw new Error(data.error);
    } catch (e) {
        hideLoading();
        alert('Generation Failed: ' + e.message);
    }
}

// Helpers
function hideAllSections() {
    [elements.uploadSection, elements.tocSection, elements.editSection, elements.downloadSection].forEach(s => s.classList.add('hidden'));
}

function updateStatus(text) {
    if (!elements.statusStep) return;
    elements.statusStep.innerHTML = `
        <div class="flex items-center gap-3 animate-section">
            <div class="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.3)]"></div>
            <span class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pt-0.5">${text}</span>
        </div>
    `;
}

function showLoading(text) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// Global scope for inline events
window.removeTOCEntry = removeTOCEntry;
window.updateTOCEntry = updateTOCEntry;
window.toggleAIModal = toggleAIModal;
window.toggleStandardModal = toggleStandardModal;
window.toggleSystemConfig = toggleSystemConfig;

document.addEventListener('DOMContentLoaded', init);
