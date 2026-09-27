let isCapacitor = window.Capacitor !== undefined;
export let db;

// Browser Fallback using localStorage
const BrowserDB = {
    data: { customers: [], products: [], bills: [], bill_items: [], requirements: [] },
    async execute(query, params) {
        if (query.includes('CREATE TABLE')) return { changes: {} };
        if (query.includes('DELETE FROM products')) { this.data.products = []; return { changes: {} }; }
        return { changes: {} };
    },
    async query(query, params) {
        if (query.includes('FROM customers')) return { values: this.data.customers };
        if (query.includes('FROM products')) return { values: this.data.products };
        if (query.includes('FROM bills')) {
            let res = this.data.bills;
            if (query.includes('WHERE')) {
                const name = params[0].replace(/%/g, '').toLowerCase();
                res = res.filter(b => {
                    const c = this.data.customers.find(cust => cust.id === b.customer_id);
                    return c && c.name.toLowerCase().includes(name);
                });
            }
            return { values: res };
        }
        if (query.includes('FROM bill_items')) return { values: this.data.bill_items.filter(i => i.bill_id === params[0]) };
        return { values: [] };
    },
    async run(query, params) {
        const id = Date.now();
        if (query.includes('INSERT INTO customers')) {
            this.data.customers.push({ id, name: params[0], mobile: params[1] || '' });
        } else if (query.includes('INSERT INTO products')) {
            this.data.products.push({ id, item_name: params[0], mrp: params[1], sp: params[2], bp: params[3] });
        } else if (query.includes('INSERT INTO bills')) {
            this.data.bills.push({ id, customer_id: params[0], date: params[1], total_bp: params[2] });
        } else if (query.includes('INSERT INTO bill_items')) {
            this.data.bill_items.push({ id, bill_id: params[0], item_name: params[1], qty: params[2], bp: params[3], tot_bp: params[4] });
        } else if (query.includes('INSERT INTO requirements')) {
            this.data.requirements.push({ id, customer_id: params[0], item_name: params[1], qty: params[2], date: params[3] });
        }
        return { changes: { lastId: id } };
    }
};

export async function initDB() {
    if (isCapacitor) {
        // Real Capacitor SQLite logic would go here
        console.log("Running in Capacitor Mode");
    } else {
        console.log("Running in Browser Mode (Using LocalStorage Fallback)");
        db = BrowserDB;
        // Load from localStorage if exists
        const saved = localStorage.getItem('ska_db');
        if (saved) db.data = JSON.parse(saved);
    }
    window.loadDatalists();
}

// Save browser data on every change
const originalRun = db?.run;
if (!isCapacitor && db) {
    db.run = async function(...args) {
        const res = await BrowserDB.run(...args);
        localStorage.setItem('ska_db', JSON.stringify(BrowserDB.data));
        return res;
    }
}

export async function getOrCreateCustomer(name, mobile) {
    const res = await db.query(`SELECT * FROM customers WHERE name = ?`, [name]);
    if (res.values.length > 0) {
        if(mobile) {
            const c = res.values[0]; c.mobile = mobile;
            localStorage.setItem('ska_db', JSON.stringify(db.data));
        }
        return res.values[0];
    } else {
        const insertRes = await db.run(`INSERT INTO customers (name, mobile) VALUES (?, ?)`, [name, mobile]);
        return { id: insertRes.changes.lastId, name, mobile };
    }
}

initDB();
