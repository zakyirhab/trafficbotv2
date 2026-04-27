const axios = require('axios');

(async () => {
  try {
    console.log('🔍 Mencoba koneksi ke https://example.com ...');
    const res = await axios.get('https://example.com', { timeout: 15000 });
    console.log('✅ Berhasil! Status:', res.status);
  } catch (err) {
    console.error('❌ Gagal:', err.message);
  }
})();