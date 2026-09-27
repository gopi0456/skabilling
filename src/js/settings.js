import { db } from './db.js';
import readXlsxFile from 'read-excel-file';
import * as pdfjsLib from 'pdfjs-dist';

// CRITICAL FIX: Disable worker to prevent blocking in Capacitor/Local environments
pdfjsLib.GlobalWorkerOptions.workerSrc = ''; 

function updateStatus(message, color = 'black') {
    const statusEl = document.getElementById('upload-status');
    statusEl.innerText = message;
    statusEl.style.color = color;
}

function updateDebug(message) {
    const debugBox = document.getElementById('debug-box');
    debugBox.innerText += message + "\n";
}

window.handleFileUpload = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Clear previous debug logs
    document.getElementById('debug-box').innerText = ""; 
    
    updateStatus(`📂 Reading file: ${file.name}...`, 'blue');
    updateDebug(`--- STARTING UPLOAD: ${file.name} ---`);
    
    let items = [];
    try {
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (ext === 'pdf') {
            updateStatus('⏳ Parsing PDF... (Click "Show Raw PDF Text" to see progress)', 'orange');
            items = await parsePDF(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            items = await parseExcel(file);
        } else if (ext === 'csv') {
            items = await parseCSV(file);
        } else if (ext === 'html' || ext === 'htm') {
            items = await parseHTML(file);
        } else {
            throw new Error('Unsupported format.');
        }
        
        if (items.length > 0) {
            updateStatus(`💾 Saving ${items.length} products to database...`, 'orange');
            await db.execute(`DELETE FROM products`);
            
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                await db.run(`INSERT INTO products (item_name, mrp, sp, bp) VALUES (?, ?, ?, ?)`, 
                    [item.item_name, item.mrp, item.sp, item.bp]);
            }
            
            updateStatus(`✅ SUCCESS! Loaded ${items.length} products.`, 'green');
            updateDebug(`✅ SUCCESS! Saved ${items.length} products to database.`);
            if (window.loadDatalists) window.loadDatalists();
        } else {
            updateStatus('⚠️ 0 Products found. Click "Show Raw PDF Text" to see why.', 'red');
            updateDebug(`⚠️ PARSER FOUND 0 ITEMS. See raw text above to check if PDF is an image.`);
        }
    } catch (err) {
        console.error('Upload Error:', err);
        updateStatus(`❌ Error: ${err.message}`, 'red');
        updateDebug(`❌ FATAL ERROR: ${err.message}`);
    }
};

// --- KEVA-OPTIMIZED PDF PARSER ---
async function parsePDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    
    // Force main-thread execution to bypass local file blocking
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, disableWorker: true });
    const pdf = await loadingTask.promise;
    
    let items = [];
    let rawText = "";
    
    updateDebug(`PDF has ${pdf.numPages} pages. Extracting text...`);
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Group text by Y-coordinate to form lines
        const lines = {};
        textContent.items.forEach(item => {
            if (!item.str) return;
            const y = Math.round(item.transform[5]);
            if (!lines[y]) lines[y] = [];
            lines[y].push({ x: item.transform[4], str: item.str });
        });
        
        // Sort lines from top to bottom and join text
        Object.keys(lines).sort((a, b) => b - a).forEach(y => {
            const lineText = lines[y].sort((a, b) => a.x - b.x).map(i => i.str).join(' ').trim();
            if (lineText) rawText += lineText + "\n";
        });
    }
    
    // Show the first 10 lines in the visible debug box
    const firstLines = rawText.split('\n').slice(0, 10).join('\n');
    updateDebug(`--- FIRST 10 LINES OF RAW PDF TEXT ---\n${firstLines}\n--------------------------------------`);
    
    if (rawText.trim().length === 0) {
        updateDebug(`❌ RAW TEXT IS EMPTY! This means your PDF is a scanned image, not selectable text.`);
        return [];
    }
    
    // Parse the raw text line by line using Keva-specific logic
    const lines = rawText.split('\n');
    for (let line of lines) {
        // Remove leading S.No (e.g., "1 ", "12. ")
        line = line.replace(/^\d+\s*/, ''); 
        
        // Find ALL numbers in the line (handles commas and decimals)
        const numbers = line.match(/[\d,]+\.?\d*/g);
        
        // We expect at least 3 numbers (MRP, SP, BP)
        if (numbers && numbers.length >= 3) {
            // The LAST 3 numbers are always MRP, SP, BP
            const bp = parseFloat(numbers[numbers.length - 1].replace(/,/g, ''));
            const sp = parseFloat(numbers[numbers.length - 2].replace(/,/g, ''));
            const mrp = parseFloat(numbers[numbers.length - 3].replace(/,/g, ''));
            
            // The item name is everything before the 3rd-to-last number
            const thirdLastNum = numbers[numbers.length - 3];
            const nameEndIndex = line.lastIndexOf(thirdLastNum);
            let itemName = line.substring(0, nameEndIndex).replace(/[-–—:.\s]+$/, '').trim();
            
            // Basic validation: Name must exist and not be just numbers
            if (itemName && itemName.length > 1 && !itemName.match(/^\d+$/)) {
                items.push({ item_name: itemName, mrp, sp, bp });
            }
        }
    }
    
    updateDebug(`✅ Parser finished. Found ${items.length} valid items.`);
    return items;
}

// --- OTHER PARSERS ---
async function parseHTML(file) {
    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const rows = doc.querySelectorAll('table tr');
    let items = [];
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].querySelectorAll('td, th');
        if (cols.length >= 5) {
            const name = cols[1]?.textContent.trim();
            const mrp = parseFloat(cols[2]?.textContent.trim().replace(/[^0-9.]/g, '')) || 0;
            const sp = parseFloat(cols[3]?.textContent.trim().replace(/[^0-9.]/g, '')) || 0;
            const bp = parseFloat(cols[4]?.textContent.trim().replace(/[^0-9.]/g, '')) || 0;
            if (name && name !== 'No matching items found.') items.push({ item_name: name, mrp, sp, bp });
        }
    }
    return items;
}

async function parseExcel(file) {
    const rows = await readXlsxFile(file);
    return rows.slice(1).filter(row => row.length >= 4 && row[0]).map(row => ({
        item_name: String(row[0]).trim(),
        mrp: parseFloat(String(row[1]).replace(/[^0-9.]/g, '')) || 0,
        sp: parseFloat(String(row[2]).replace(/[^0-9.]/g, '')) || 0,
        bp: parseFloat(String(row[3]).replace(/[^0-9.]/g, '')) || 0
    }));
}

async function parseCSV(file) {
    const text = await file.text();
    return text.split('\n').slice(1).filter(line => line.trim()).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols.length >= 4) {
            return {
                item_name: cols[0],
                mrp: parseFloat(cols[1].replace(/[^0-9.]/g, '')) || 0,
                sp: parseFloat(cols[2].replace(/[^0-9.]/g, '')) || 0,
                bp: parseFloat(cols[3].replace(/[^0-9.]/g, '')) || 0
            };
        }
        return null;
    }).filter(item => item !== null && item.item_name);
}

window.clearProducts = async function() {
    if (confirm('Clear ALL products?')) {
        updateStatus('🗑️ Clearing...', 'orange');
        await db.execute(`DELETE FROM products`);
        updateStatus('✅ Cleared.', 'green');
        if (window.loadDatalists) window.loadDatalists();
    }
};
