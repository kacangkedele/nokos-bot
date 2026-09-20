# Nokos Bot

Bot WhatsApp berbasis Baileys dengan registrasi pengguna, saldo, deposit manual, daftar layanan, order nomor virtual, cek OTP, pembatalan/refund, riwayat, dan perintah admin.

## Instalasi Termux

```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
git clone https://github.com/kacangkedele/nokos-bot.git
cd nokos-bot
npm install
cp .env.example .env
nano .env
npm start
```

Scan QR yang tampil melalui WhatsApp → Linked Devices → Link a Device.

## Konfigurasi

- `ADMIN_NUMBER`: nomor admin format internasional tanpa tanda `+`.
- `NOKOS_API_KEY` dan `NOKOS_API_URL`: kredensial provider SMS/nomor virtual yang kompatibel dengan endpoint pada `api.js`.
- `NOKOS_MOCK=true`: hanya untuk pengujian lokal; jangan digunakan untuk transaksi nyata.
- Ubah harga dan daftar layanan pada `api.js`.

`database.json` serta folder autentikasi dibuat otomatis dan dikecualikan dari Git. Jangan memasukkan API key atau kredensial WhatsApp ke repository.

## Perintah pengguna

`.menu`, `.daftar <nama>`, `.saldo`, `.layanan`, `.order <id>`, `.otp <id_order>`, `.batal <id_order>`, `.status <id_order>`, `.riwayat`, `.deposit`, `.konfirmasi <jumlah>`, `.owner`.

## Perintah admin

`.addsaldo <nomor> <jumlah>`, `.minsaldo <nomor> <jumlah>`, `.bc <pesan>`, `.cekuser`.

Deposit masih menggunakan konfirmasi manual oleh admin. Sebelum produksi, sesuaikan adapter provider, kebijakan penggunaan layanan, dan mekanisme pembayaran resmi.
