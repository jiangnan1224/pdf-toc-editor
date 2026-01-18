// PDF TOC Editor - Dashbord Fresh V2 Frontend Logic

// State management
const state = {
    uploadedFile: null,
    filename: null,
    originalFilename: null,
    pageCount: 0,
    tocEntries: [],
    outputFilename: null,
    sortable: null // Reference to SortableJS instance
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
    btnExtract: document.getElementById('btn-extract'),
    btnManual: document.getElementById('btn-manual'),
    btnAddEntry: document.getElementById('btn-add-entry'),
    btnGenerate: document.getElementById('btn-generate'),
    btnDownload: document.getElementById('btn-download'),

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
}

// Initialize SortableJS
function initSortable() {
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
    elements.btnExtract.addEventListener('click', extractTOC);
    elements.btnManual.addEventListener('click', startManualEntry);
    elements.btnAddEntry.addEventListener('click', () => addTOCEntry());
    elements.btnGenerate.addEventListener('click', generatePDF);
    elements.btnDownload.addEventListener('click', () => {
        let downloadName = state.outputFilename;
        if (state.originalFilename) {
            const nameParts = state.originalFilename.split('.');
            const ext = nameParts.pop();
            const base = nameParts.join('.');
            downloadName = `${base}_完整目录.${ext}`;
        }
        window.location.href = `/api/download/${state.outputFilename}?name=${encodeURIComponent(downloadName)}`;
    });
    elements.btnRestart.addEventListener('click', () => location.reload());
}

async function uploadFile(file) {
    showLoading('UPLOADING ASSETS...');
    const formData = new FormData();
    formData.append('file', file);
    try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await response.json();
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
            renderTOCList();
            hideAllSections();
            elements.editSection.classList.remove('hidden');
            elements.entryCountPill.classList.remove('hidden');
            updateStatus('EDITING CANVAS');
            hideLoading();
        } else throw new Error(data.error);
    } catch (e) {
        hideLoading();
        alert('Extraction Failed: ' + e.message);
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
        const levelPaddings = ['pl-0', 'pl-10', 'pl-20'];
        const levelIndicators = ['bg-sky-500', 'bg-sky-300', 'bg-slate-200'];

        div.className = `flex items-center gap-4 group animate-section ${levelPaddings[entry.level] || ''}`;
        div.setAttribute('data-index', index);

        div.innerHTML = `
            <div class="item-drag-handle p-2 transition-transform group-hover:scale-110">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 8h16M4 16h16"></path></svg>
            </div>
            <div class="h-12 w-1.5 flex-shrink-0 ${levelIndicators[entry.level] || 'bg-slate-200'} rounded-full opacity-60"></div>
            <div class="flex-1 flex gap-3">
                <input type="text" class="flex-1 bg-white border border-slate-100 rounded-2xl px-5 py-3.5 text-sm focus:ring-4 focus:ring-sky-500/5 focus:border-sky-500 outline-none transition-all placeholder:text-slate-300 text-slate-700 font-bold shadow-sm" placeholder="Title" value="${entry.title}" onchange="updateTOCEntry(${index}, 'title', this.value)">
                <input type="number" class="w-24 bg-white border border-slate-100 rounded-2xl px-5 py-3.5 text-sm focus:ring-4 focus:ring-sky-500/5 focus:border-sky-500 outline-none transition-all text-center font-bold text-sky-500 shadow-sm" placeholder="P" value="${entry.page}" min="1" onchange="updateTOCEntry(${index}, 'page', parseInt(this.value))">
            </div>
            <select class="bg-white border border-slate-100 rounded-2xl px-4 py-3.5 text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:border-sky-500 transition-all text-slate-400 shadow-sm" onchange="updateTOCEntry(${index}, 'level', parseInt(this.value))">
                <option value="0" ${entry.level === 0 ? 'selected' : ''}>L1 CHAPTER</option>
                <option value="1" ${entry.level === 1 ? 'selected' : ''}>L2 SECTION</option>
                <option value="2" ${entry.level === 2 ? 'selected' : ''}>L3 POINT</option>
            </select>
            <button class="p-4 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100" onclick="removeTOCEntry(${index})">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
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

document.addEventListener('DOMContentLoaded', init);
