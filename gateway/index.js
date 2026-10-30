require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const verify = require('./verify');

const app = express();

// body parser HANYA untuk /auth (supaya body request ke service tidak "termakan")
app.use('/auth', express.json(), require('./auth'));

// semua selain /auth wajib lewat verifikasi token + device
app.use(verify);
app.use(require('./enforce'));

function proxyTo(target, paths) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathFilter: paths,
    on: {
      proxyReq: (proxyReq) => {
        // gateway menambahkan secret; secret kiriman client ikut tertimpa
        proxyReq.setHeader('X-Gateway-Secret', process.env.GATEWAY_SECRET);
      },
    },
  });
}

app.use(proxyTo('http://127.0.0.1:3001', ['/nilai', '/kelas']));
app.use(proxyTo('http://127.0.0.1:3002', ['/transkrip']));

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ada' }));

app.listen(3000, () => console.log('Gateway jalan di port 3000'));
