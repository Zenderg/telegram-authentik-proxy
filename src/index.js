const express = require('express');
const cors = require('cors');
const session = require('express-session');
const dotenv = require('dotenv');
const authController = require('./controllers/authController');
const logger = require('./utils/helpers').logger;

// Загрузка переменных окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 часа
  }
}));

// Маршруты
app.get('/', (req, res) => {
  res.send('Telegram Authentik Proxy Service');
});

// Маршруты для аутентификации через Telegram
app.get('/auth/telegram', authController.handleTelegramCallback);
app.post('/auth/verify', authController.verifyTelegramData);

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Запуск сервера
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});