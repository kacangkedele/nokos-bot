const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const db = require('./database');
const api = require('./api');

const { loadDB, getUser, addBalance, deductBalance, createOrder, updateOrder, getOrder, getUserOrders, generateOrderId, getDB } = db;
loadDB();
const config = getDB().config;

const money = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
async function reply(sock, jid, text, quoted) { return sock.sendMessage(jid, { text }, quoted ? { quoted } : {}); }
function registered(user, sock, sender, m) {
  if (user.registered) return true;
  reply(sock, sender, `❌ Anda belum terdaftar!\nKetik: ${config.prefix}daftar <nama>`, m);
  return false;
}
function formatMenu() {
  return `╭─「 🤖 *${config.botName}* 」\n│\n├ 📋 *DAFTAR PERINTAH*\n│\n├ ✅ ${config.prefix}daftar <nama>\n├ 💰 ${config.prefix}saldo\n├ 📋 ${config.prefix}layanan\n├ 🛒 ${config.prefix}order <id_layanan>\n├ 📩 ${config.prefix}otp <id_order>\n├ ❌ ${config.prefix}batal <id_order>\n├ 📊 ${config.prefix}status <id_order>\n├ 📜 ${config.prefix}riwayat\n├ 💳 ${config.prefix}deposit\n├ 👤 ${config.prefix}owner\n│\n╰─「 ✨ Ketik perintah untuk mulai ✨ 」`;
}
function formatServices() {
  return ['╭─「 📋 *DAFTAR LAYANAN* 」', '│', ...api.listServices().flatMap(s => [`├ 🏷️ *${s.id}* — ${s.name}`, `│    💰 ${money(s.price)}`, '│']), `├ ${config.prefix}order <id_layanan>`, `╰─「 *${config.botName}* 」`].join('\n');
}

async function handleMessage(sock, msg) {
  try {
    const m = msg.messages?.[0];
    if (!m?.message || m.key.fromMe) return;
    const sender = m.key.remoteJid;
    if (!sender || sender.endsWith('@g.us')) return;
    const senderNum = sender.split('@')[0];
    const body = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
    const text = body.trim();
    if (!text.startsWith(config.prefix)) return;
    const args = text.slice(config.prefix.length).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    const user = getUser(senderNum);
    console.log(`[${senderNum}] ${text}`);

    switch (cmd) {
      case 'menu': case 'help': return reply(sock, sender, formatMenu(), m);
      case 'daftar': case 'register': {
        if (user.registered) return reply(sock, sender, `✅ Anda sudah terdaftar!\n👤 Nama: ${user.name}\n💰 Saldo: ${money(user.balance)}`, m);
        const name = args.join(' ').trim();
        if (!name) return reply(sock, sender, `❌ Contoh: ${config.prefix}daftar Budi`, m);
        user.name = name; user.registered = true; db.saveDB();
        return reply(sock, sender, `✅ Pendaftaran berhasil, ${name}!\nKetik ${config.prefix}deposit untuk mulai.`, m);
      }
      case 'owner': return reply(sock, sender, `👤 Hubungi Admin:\nwa.me/${config.adminNumber}`, m);
      case 'layanan': case 'list': return reply(sock, sender, formatServices(), m);
      case 'deposit': case 'topup': return reply(sock, sender, `💳 Transfer ke rekening/e-wallet admin lalu kirim bukti ke wa.me/${config.adminNumber}\nMinimal deposit: ${money(config.minDeposit)}\nKetik ${config.prefix}konfirmasi <jumlah> setelah transfer.`, m);
      case 'konfirmasi': {
        if (!registered(user, sock, sender, m)) return;
        const amount = Number.parseInt(args[0], 10);
        if (!Number.isSafeInteger(amount) || amount < config.minDeposit) return reply(sock, sender, `❌ Minimal deposit ${money(config.minDeposit)}.`, m);
        getDB().deposits[senderNum] ||= [];
        const id = `DEP${Date.now().toString(36).toUpperCase()}`;
        getDB().deposits[senderNum].push({ id, amount, status: 'pending', createdAt: Date.now() }); db.saveDB();
        return reply(sock, sender, `⏳ Deposit ${id} sebesar ${money(amount)} menunggu konfirmasi admin.`, m);
      }
      case 'saldo': case 'balance':
        if (registered(user, sock, sender, m)) return reply(sock, sender, `💰 Saldo ${user.name}: ${money(user.balance)}\n🛒 Total order: ${user.totalOrders || 0}`, m);
        return;
      case 'order': case 'pesan': case 'beli': {
        if (!registered(user, sock, sender, m)) return;
        const service = api.getService(args[0]);
        if (!service) return reply(sock, sender, `❌ Layanan tidak ditemukan. Ketik ${config.prefix}layanan.`, m);
        if (user.balance < service.price) return reply(sock, sender, `❌ Saldo tidak cukup. Harga ${money(service.price)}, saldo ${money(user.balance)}.`, m);
        await reply(sock, sender, `⏳ Mencari nomor untuk *${service.name}*...`, m);
        const result = await api.requestNumber(service.code);
        if (!result.success) return reply(sock, sender, `❌ Gagal mendapatkan nomor: ${result.error || 'coba lagi nanti'}`, m);
        if (!deductBalance(senderNum, service.price)) return reply(sock, sender, '❌ Saldo berubah. Silakan coba lagi.', m);
        const orderId = generateOrderId();
        createOrder(senderNum, orderId, service.id, service.name, service.price);
        updateOrder(orderId, { phone: result.phone, activationId: result.activationId, status: 'waiting' });
        user.totalOrders = (user.totalOrders || 0) + 1; db.saveDB();
        return reply(sock, sender, `✅ *PESANAN BERHASIL*\n🆔 ${orderId}\n📱 ${service.name}\n📞 +${result.phone}\n💸 Harga: ${money(service.price)}\n💰 Sisa: ${money(user.balance)}\n\nCek OTP: ${config.prefix}otp ${orderId}\nBatalkan: ${config.prefix}batal ${orderId}`, m);
      }
      case 'otp': case 'cekotp': {
        if (!registered(user, sock, sender, m)) return;
        const orderId = args[0]?.toUpperCase(); const order = getOrder(orderId);
        if (!order || order.user !== senderNum) return reply(sock, sender, '❌ Order tidak ditemukan.', m);
        if (order.status === 'cancelled' || order.status === 'completed') return reply(sock, sender, `📊 Status order: ${order.status}`, m);
        await reply(sock, sender, '⏳ Mengecek OTP...', m);
        const result = await api.checkOTP(order.activationId);
        if (result.success && result.otp) { updateOrder(orderId, { otp: result.otp, status: 'completed' }); return reply(sock, sender, `📩 OTP *${result.otp}* untuk order ${orderId}.`, m); }
        return reply(sock, sender, result.status === 'waiting' ? '⏳ OTP belum masuk, coba lagi beberapa saat.' : `❌ ${result.error || 'OTP tidak tersedia.'}`, m);
      }
      case 'batal': case 'cancel': {
        if (!registered(user, sock, sender, m)) return;
        const orderId = args[0]?.toUpperCase(); const order = getOrder(orderId);
        if (!order || order.user !== senderNum) return reply(sock, sender, '❌ Order tidak ditemukan.', m);
        if (['completed', 'cancelled'].includes(order.status)) return reply(sock, sender, '❌ Order sudah tidak dapat dibatalkan.', m);
        const result = await api.cancelNumber(order.activationId);
        if (!result.success) return reply(sock, sender, `❌ Gagal membatalkan: ${result.error || 'coba lagi'}`, m);
        addBalance(senderNum, order.price); updateOrder(orderId, { status: 'cancelled' });
        return reply(sock, sender, `✅ Order dibatalkan. Refund: ${money(order.price)}\nSaldo: ${money(user.balance)}`, m);
      }
      case 'status': {
        if (!registered(user, sock, sender, m)) return;
        const order = getOrder(args[0]?.toUpperCase());
        if (!order || order.user !== senderNum) return reply(sock, sender, '❌ Order tidak ditemukan.', m);
        return reply(sock, sender, `📊 ${order.id}\n📱 ${order.serviceName}\n📞 +${order.phone || '-'}\nStatus: ${order.status}\nOTP: ${order.otp || 'Belum ada'}\nExpired: ${new Date(order.expiresAt).toLocaleString('id-ID')}`, m);
      }
      case 'riwayat': case 'history': {
        if (!registered(user, sock, sender, m)) return;
        const orders = getUserOrders(senderNum).slice(-10).reverse();
        return reply(sock, sender, orders.length ? orders.map(o => `${o.id} — ${o.serviceName} — ${o.status} — ${money(o.price)}`).join('\n') : '📭 Belum ada riwayat order.', m);
      }
      case 'addsaldo': case 'minsaldo': case 'broadcast': case 'bc': case 'cekuser': {
        if (senderNum !== config.adminNumber) return;
        if (cmd === 'cekuser') return reply(sock, sender, `📊 Total user: ${Object.keys(getDB().users).length}\n✅ Terdaftar: ${Object.values(getDB().users).filter(u => u.registered).length}`, m);
        if (cmd === 'broadcast' || cmd === 'bc') {
          const message = args.join(' ').trim(); if (!message) return reply(sock, sender, `Format: ${config.prefix}bc <pesan>`, m);
          let sent = 0; for (const number of Object.keys(getDB().users)) { try { await sock.sendMessage(`${number}@s.whatsapp.net`, { text: message }); sent++; } catch (_) {} }
          return reply(sock, sender, `✅ Broadcast terkirim ke ${sent} user.`, m);
        }
        const target = args[0]?.replace(/\D/g, ''); const amount = Number.parseInt(args[1], 10);
        if (!target || !Number.isSafeInteger(amount) || amount <= 0) return reply(sock, sender, `Format: ${config.prefix}${cmd} <nomor> <jumlah>`, m);
        if (cmd === 'addsaldo') addBalance(target, amount); else { const targetUser = getUser(target); targetUser.balance = Math.max(0, targetUser.balance - amount); db.saveDB(); }
        return reply(sock, sender, `✅ Saldo ${target} diperbarui.`, m);
      }
      default: return reply(sock, sender, `❓ Perintah tidak dikenal. Ketik ${config.prefix}menu`, m);
    }
  } catch (error) { console.error('Error:', error); }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger: P({ level: 'silent' }), browser: ['Nokos Bot', 'Chrome', '1.0.0'] });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', update => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'open') console.log('✅ Bot terhubung dan siap digunakan.');
    if (connection === 'close') {
      const status = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : null;
      if (status !== DisconnectReason.loggedOut) { console.log('🔄 Menghubungkan ulang...'); setTimeout(startBot, 3000); }
      else console.log('❌ Bot logout. Hapus auth_info_baileys lalu jalankan ulang.');
    }
  });
  sock.ev.on('messages.upsert', msg => handleMessage(sock, msg));
}

console.log('🤖 NOKOS WHATSAPP BOT');
startBot().catch(error => { console.error('Fatal error:', error); process.exit(1); });
