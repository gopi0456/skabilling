import { db } from './db.js';

window.loadHistory = async function() {
    const search = document.getElementById('search-history').value.toLowerCase();
    const res = await db.query(`SELECT * FROM bills`, search ? [search] : []);
    const bills = res.values;
    
    document.getElementById('history-list').innerHTML = bills.map(b => {
        const c = db.data.customers.find(cust => cust.id === b.customer_id) || {name: 'Unknown', mobile: ''};
        return `
        <div class="card">
            <strong>${c.name}</strong> (${c.mobile || 'No Mobile'})
            <span style="float:right">${new Date(b.date).toLocaleDateString()}</span>
            <div style="color:#666; font-size:0.9rem;">Total BP: Rs. ${b.total_bp.toFixed(2)}</div>
            <button class="btn btn-share" onclick="window.shareBill(${b.id}, '${c.name}', '${c.mobile}', '${b.date}', ${b.total_bp})">Share Bill</button>
        </div>`;
    }).join('') || '<p>No bills found.</p>';
};

window.shareBill = async function(billId, custName, mobile, date, totalBP) {
    const res = await db.query(`SELECT * FROM bill_items WHERE bill_id = ?`, [billId]);
    const items = res.values;
    let text = `*SK AYURVEDAM WELLNESS CENTRE*\nKEVA AREA STOCK POINT\n-------------------------\n`;
    text += `Customer: ${custName}\nMobile: ${mobile || 'N/A'}\nDate: ${new Date(date).toLocaleString()}\n\n*ITEMS:*\n`;
    items.forEach((i, idx) => { text += `${idx + 1}. ${i.item_name} | Qty: ${i.qty} | BP: ${i.bp} | Tot: ${i.tot_bp}\n`; });
    text += `-------------------------\n*TOTAL BP: Rs. ${totalBP.toFixed(2)}*\nThank you!`;

    // Try native share, fallback to prompt/alert in browser
    if (navigator.share) {
        try { await navigator.share({ title: `Bill for ${custName}`, text: text }); } 
        catch (err) { prompt("Copy this bill:", text); }
    } else {
        prompt("Copy this bill to share:", text);
    }
};
