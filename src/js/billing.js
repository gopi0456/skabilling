import { db, getOrCreateCustomer } from './db.js';
let cart = [];

document.getElementById('cust-name').addEventListener('change', async function() {
    const res = await db.query(`SELECT * FROM customers WHERE name = ?`, [this.value]);
    if (res.values.length > 0) document.getElementById('cust-mobile').value = res.values[0].mobile || '';
});

document.getElementById('prod-search').addEventListener('change', async function() {
    const res = await db.query(`SELECT * FROM products WHERE item_name = ?`, [this.value]);
    if (res.values.length > 0) addToCart(res.values[0]);
    this.value = '';
});

function addToCart(p) {
    const ex = cart.find(i => i.item_name === p.item_name);
    if (ex) ex.qty++; else cart.push({ ...p, qty: 1 });
    renderCart();
}

function renderCart() {
    document.getElementById('cart-body').innerHTML = cart.map((i, idx) => `
        <tr>
            <td>${i.item_name}</td>
            <td><input type="number" value="${i.qty}" min="1" onchange="cart[${idx}].qty=parseInt(this.value);renderCart()" style="width:50px"></td>
            <td>${i.bp}</td>
            <td>${(i.bp * i.qty).toFixed(2)}</td>
            <td><button class="btn btn-danger" style="width:auto;padding:5px" onclick="window.removeCart(${idx})">X</button></td>
        </tr>`).join('');
    document.getElementById('tot-bp').innerText = cart.reduce((sum, i) => sum + (i.bp * i.qty), 0).toFixed(2);
}
window.removeCart = (idx) => { cart.splice(idx, 1); renderCart(); };
window.renderCart = renderCart;

window.saveBill = async function() {
    const name = document.getElementById('cust-name').value;
    const mobile = document.getElementById('cust-mobile').value;
    if (!name || cart.length === 0) return alert('Enter customer and items');
    const cust = await getOrCreateCustomer(name, mobile);
    let totalBP = cart.reduce((sum, i) => sum + (i.bp * i.qty), 0);
    const billRes = await db.run(`INSERT INTO bills (customer_id, date, total_bp) VALUES (?, ?, ?)`, [cust.id, new Date().toISOString(), totalBP]);
    const billId = billRes.changes.lastId;
    for (let i of cart) {
        await db.run(`INSERT INTO bill_items (bill_id, item_name, qty, bp, tot_bp) VALUES (?, ?, ?, ?, ?)`, [billId, i.item_name, i.qty, i.bp, i.bp * i.qty]);
    }
    alert('Bill Saved!');
    cart = []; renderCart();
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-mobile').value = '';
    window.loadDatalists();
};

window.loadDatalists = async function() {
    const custs = await db.query(`SELECT name FROM customers`);
    const prods = await db.query(`SELECT item_name FROM products`);
    document.getElementById('cust-list').innerHTML = custs.values.map(c => `<option value="${c.name}">`).join('');
    document.getElementById('prod-list').innerHTML = prods.values.map(p => `<option value="${p.item_name}">`).join('');
    document.getElementById('prod-list-req').innerHTML = prods.values.map(p => `<option value="${p.item_name}">`).join('');
};
