const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Which persona page '/' sends visitors to. Swap by changing this (or
// setting HOME_PERSONA in the environment) and restarting — '/success' and
// '/sales' are always reachable directly regardless of this setting.
const HOME_PERSONA = process.env.HOME_PERSONA || 'sales';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect(`/${HOME_PERSONA}`);
});

app.get('/success', (req, res) => {
  res.render('success');
});

app.get('/sales', (req, res) => {
  res.render('sales');
});

app.get('/demo', (req, res) => {
  res.render('demo');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
