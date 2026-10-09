const path = require('path');
const { loadEnv } = require('./server/loadEnv');

loadEnv(path.join(__dirname, '.env'));

const express = require('express');
const { ifpRouter } = require('./server/ifp');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/ifp', ifpRouter());

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/demo', (req, res) => {
  res.render('demo');
});

app.get('/pricing', (req, res) => {
  res.render('pricing');
});

app.get('/ifp-test', (req, res) => {
  res.render('ifp-test');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
