import { db } from './db.js';
let reqList = [];

document.getElementById('req-prod').addEventListener('change', async function() {
    const res = await db.query(`SELECT * FROM products WHERE item_name = ?`, [this.value]);
    if (res.values.length > 0) {
        reqList.push({ item_name: this.value, qty: 1 });
        renderReq();
        this.value = '';
    }
});

function renderReq() {
    document.getElementById('req-body').innerHTML = reqList.map((item, idx) => `
        <tr>
            <td>${item.item_name}</td>
            <td><input type="number" value="${item.qty}" min="1" onchange="reqList[${idx}].qty=parseInt(this.value)" style="width:50px"></td>
            <td><button class="btn btn-danger" style="width:auto;padding:5px" onclick="reqList.splice(${idx},1);renderReq()">X</button></td>
        </tr>`).join('');
}
window.renderReq = renderReq;

window.saveRequirement = async function() {
    const custName = document.getElementById('req-cust').value;
    if (!custName || reqList.length === 0) return alert('Enter customer and items');
    const cust = await db.query(`SELECT * FROM customers WHERE name = ?`, [custName]);
    const custId = cust.values.length > 0 ? cust.values[0].id : (await db.run(`INSERT INTO customers (name, mobile) VALUES (?, ?)`, [custName, ''])).changes.lastId;
    
    for (let item of reqList) {
        await db.run(`INSERT INTO requirements (customer_id, item_name, qty, date) VALUES (?, ?, ?, ?)`, [custId, item.item_name, item.qty, new Date().toISOString()]);
    }
    alert('Requirement Saved!');
    reqList = []; renderReq();
    document.getElementById('req-cust').value = '';
};
