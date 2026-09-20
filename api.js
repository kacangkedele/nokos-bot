const fetch = require('node-fetch');

const API_KEY = process.env.NOKOS_API_KEY || '';
const API_URL = (process.env.NOKOS_API_URL || '').replace(/\/$/, '');
const USE_MOCK = process.env.NOKOS_MOCK === 'true';

const services = [
  { id: 'wa', name: 'WhatsApp', price: 2500, code: 'wa' },
  { id: 'telegram', name: 'Telegram', price: 2000, code: 'tg' },
  { id: 'google', name: 'Google / Gmail', price: 3000, code: 'go' },
  { id: 'ig', name: 'Instagram', price: 2500, code: 'ig' },
  { id: 'fb', name: 'Facebook', price: 2500, code: 'fb' },
  { id: 'tiktok', name: 'TikTok', price: 2500, code: 'tt' },
  { id: 'shopee', name: 'Shopee', price: 3500, code: 'sp' },
  { id: 'tokped', name: 'Tokopedia', price: 3500, code: 'tp' },
  { id: 'ovo', name: 'OVO', price: 4000, code: 'ov' },
  { id: 'dana', name: 'DANA', price: 4000, code: 'dn' },
  { id: 'gopay', name: 'GoPay', price: 4000, code: 'gp' },
  { id: 'gojek', name: 'Gojek', price: 3500, code: 'gj' },
  { id: 'grab', name: 'Grab', price: 3500, code: 'gr' },
  { id: 'lazada', name: 'Lazada', price: 3500, code: 'lz' },
  { id: 'twitter', name: 'Twitter / X', price: 3000, code: 'tw' },
  { id: 'discord', name: 'Discord', price: 3000, code: 'dc' },
  { id: 'line', name: 'LINE', price: 2500, code: 'ln' }
];

function getService(id) { return services.find(service => service.id === String(id).toLowerCase()); }
function listServices() { return services; }
function requireProvider() {
  if (!API_KEY || !API_URL) throw new Error('NOKOS_API_KEY dan NOKOS_API_URL belum dikonfigurasi');
}

async function requestNumber(serviceCode) {
  if (USE_MOCK) return { success: true, phone: `628${Math.floor(1000000000 + Math.random() * 8999999999)}`, activationId: `ACT${Date.now()}` };
  try {
    requireProvider();
    const response = await fetch(`${API_URL}/getNumber?api_key=${encodeURIComponent(API_KEY)}&service=${encodeURIComponent(serviceCode)}&country=6`);
    const data = await response.json();
    return data.success ? { success: true, phone: data.phone, activationId: data.activation_id } : { success: false, error: data.message || 'Gagal mendapatkan nomor' };
  } catch (error) { return { success: false, error: error.message }; }
}

async function checkOTP(activationId) {
  if (USE_MOCK) return Math.random() > 0.5 ? { success: true, otp: String(Math.floor(100000 + Math.random() * 900000)), status: 'received' } : { success: false, status: 'waiting' };
  try {
    requireProvider();
    const response = await fetch(`${API_URL}/getStatus?api_key=${encodeURIComponent(API_KEY)}&id=${encodeURIComponent(activationId)}`);
    const data = await response.json();
    if (data.status === 'STATUS_OK') return { success: true, otp: data.code, status: 'received' };
    if (data.status === 'STATUS_WAIT_CODE') return { success: false, status: 'waiting' };
    if (data.status === 'STATUS_CANCEL') return { success: false, status: 'cancelled' };
    return { success: false, status: 'unknown' };
  } catch (error) { return { success: false, error: error.message }; }
}

async function cancelNumber(activationId) {
  if (USE_MOCK) return { success: true };
  try {
    requireProvider();
    const response = await fetch(`${API_URL}/setStatus?api_key=${encodeURIComponent(API_KEY)}&id=${encodeURIComponent(activationId)}&status=8`);
    const data = await response.json();
    return { success: data.success !== false };
  } catch (error) { return { success: false, error: error.message }; }
}

module.exports = { services, getService, listServices, requestNumber, checkOTP, cancelNumber };
