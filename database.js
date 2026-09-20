const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

let db = {
  users: {},
  orders: {},
  deposits: {},
  config: {
    adminNumber: process.env.ADMIN_NUMBER || '6281234567890',
    botName: 'Nokos Bot',
    prefix: '.',
    minDeposit: 5000
  }
};

function loadDB() {
  if (!fs.existsSync(dbPath)) return db;
  try {
    const saved = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    db = {
      ...db,
      ...saved,
      users: saved.users || {},
      orders: saved.orders || {},
      deposits: saved.deposits || {},
      config: { ...db.config, ...(saved.config || {}) }
    };
  } catch (error) {
    console.error('Database gagal dimuat:', error.message);
  }
  return db;
}

function saveDB() {
  const temporaryPath = `${dbPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(db, null, 2));
  fs.renameSync(temporaryPath, dbPath);
}

function getUser(number) {
  if (!db.users[number]) {
    db.users[number] = {
      name: '', registered: false, balance: 0, totalOrders: 0, joinedAt: Date.now()
    };
    saveDB();
  }
  return db.users[number];
}

function addBalance(number, amount) {
  const user = getUser(number);
  user.balance += amount;
  saveDB();
  return user.balance;
}

function deductBalance(number, amount) {
  const user = getUser(number);
  if (!Number.isFinite(amount) || amount <= 0 || user.balance < amount) return false;
  user.balance -= amount;
  saveDB();
  return true;
}

function createOrder(number, orderId, serviceId, serviceName, price) {
  db.orders[orderId] = {
    id: orderId, user: number, serviceId, serviceName, price,
    phone: '', otp: '', activationId: '', status: 'pending',
    createdAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000
  };
  saveDB();
  return db.orders[orderId];
}

function updateOrder(orderId, data) {
  if (!db.orders[orderId]) return null;
  db.orders[orderId] = { ...db.orders[orderId], ...data };
  saveDB();
  return db.orders[orderId];
}

function getOrder(orderId) { return db.orders[orderId] || null; }
function getUserOrders(number) { return Object.values(db.orders).filter(order => order.user === number); }
function generateOrderId() {
  return `ORD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

module.exports = {
  loadDB, saveDB, getUser, addBalance, deductBalance, createOrder,
  updateOrder, getOrder, getUserOrders, generateOrderId, getDB: () => db
};
