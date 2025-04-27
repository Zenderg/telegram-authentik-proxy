import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { URL } from 'url';

const app = express();
const port = process.env.PORT || 3000;

const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN',
  botId: process.env.TELEGRAM_BOT_ID || 'YOUR_BOT_ID',
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/callback'
};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Хранилище состояний для сессий OAuth
// В продакшене лучше использовать Redis или другое внешнее хранилище
const sessions = {};

// OAuth эндпоинт для авторизации - его вы указываете в Authentik как Authorization URL
app.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, state, scope, response_type } = req.query;
  
  if (!client_id || !redirect_uri || !state) {
    return res.status(400).send('Missing required OAuth parameters');
  }
  
  // Сохраняем состояние для последующей проверки
  const sessionId = crypto.randomBytes(16).toString('hex');
  sessions[sessionId] = {
    client_id,
    redirect_uri,
    state,
    scope,
    created: Date.now()
  };
  
  // Отображаем страницу с Telegram Login виджетом
  res.send(`
    <html>
      <head>
        <title>Telegram Login</title>
        <script async src="https://telegram.org/js/telegram-widget.js"></script>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
          .container { max-width: 500px; margin: 0 auto; }
          h1 { color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Войти через Telegram</h1>
          <div id="telegram-login">
            <script>
              Telegram.Login.auth(
                { 
                  bot_id: '${config.botId}',
                  request_access: true,
                  lang: 'ru'
                },
                function(data) {
                  if (data) {
                    data.session_id = '${sessionId}';
                    // Отправляем данные авторизации на наш сервер
                    fetch('/process-telegram-auth', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify(data)
                    })
                    .then(response => response.json())
                    .then(result => {
                      if (result.redirect_url) {
                        window.location.href = result.redirect_url;
                      }
                    })
                    .catch(error => {
                      console.error('Error:', error);
                      alert('Произошла ошибка при авторизации');
                    });
                  }
                }
              );
            </script>
          </div>
        </div>
      </body>
    </html>
  `);
});

// Обработчик данных от Telegram Login виджета
app.post('/process-telegram-auth', (req, res) => {
  const data = req.body;
  const sessionId = data.session_id;
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'Invalid session' });
  }
  
  const session = sessions[sessionId];
  
  // Проверяем подпись данных от Telegram
  const secret = crypto.createHash('sha256')
    .update(config.botToken)
    .digest();
  
  const checkString = Object.keys(data)
    .filter(k => k !== 'hash' && k !== 'session_id')
    .sort()
    .map(k => `${k}=${data[k]}`)
    .join('\n');
  
  const hash = crypto.createHmac('sha256', secret)
    .update(checkString)
    .digest('hex');
  
  if (hash !== data.hash) {
    return res.status(403).json({ error: 'Invalid signature' });
  }
  
  // Генерируем код авторизации
  const code = crypto.randomBytes(20).toString('hex');
  
  // Сохраняем данные пользователя вместе с кодом
  sessions[sessionId].code = code;
  sessions[sessionId].user_data = {
    id: data.id,
    username: data.username,
    first_name: data.first_name,
    last_name: data.last_name,
    photo_url: data.photo_url
  };
  
  // Создаем URL для редиректа обратно в Authentik с кодом авторизации
  const redirectUrl = new URL(session.redirect_uri);
  redirectUrl.searchParams.append('code', code);
  redirectUrl.searchParams.append('state', session.state);
  
  res.json({ redirect_url: redirectUrl.toString() });
});

// OAuth эндпоинт для обмена кода на токен - его вы указываете в Authentik как Access token URL
app.post('/token', (req, res) => {
  const { grant_type, code, redirect_uri, client_id, client_secret } = req.body;
  
  if (grant_type !== 'authorization_code' || !code) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  // Находим сессию с этим кодом
  const sessionId = Object.keys(sessions).find(id => sessions[id].code === code);
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
  
  const session = sessions[sessionId];
  
  // Генерируем OAuth токен
  const access_token = 'tg_' + crypto.randomBytes(20).toString('hex');
  const expires_in = 3600; // 1 час
  
  // Сохраняем токен в сессии
  session.access_token = access_token;
  session.token_generated = Date.now();
  
  res.json({
    access_token,
    token_type: 'Bearer',
    expires_in,
    refresh_token: 'tg_refresh_' + crypto.randomBytes(20).toString('hex'),
    scope: session.scope || 'read'
  });
  
  // Очистка устаревших сессий (можно вынести в отдельную функцию)
  cleanupSessions();
});

// OAuth эндпоинт для получения информации о пользователе - его вы указываете в Authentik как Profile URL
app.get('/userinfo', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'invalid_token' });
  }
  
  const token = authHeader.split(' ')[1];
  
  // Находим сессию с этим токеном
  const sessionId = Object.keys(sessions).find(id => 
    sessions[id].access_token === token && 
    (Date.now() - sessions[id].token_generated) < 3600000 // Проверка срока действия токена
  );
  
  if (!sessionId || !sessions[sessionId]) {
    return res.status(401).json({ error: 'invalid_token' });
  }
  
  const session = sessions[sessionId];
  const userData = session.user_data;
  
  // Формируем данные пользователя в формате, который ожидает Authentik
  res.json({
    sub: `telegram:${userData.id}`,
    name: [userData.first_name, userData.last_name].filter(Boolean).join(' '),
    preferred_username: userData.username || `user${userData.id}`,
    picture: userData.photo_url || '',
    email: '', // Telegram не предоставляет email
    email_verified: false,
    telegram_id: userData.id.toString()
  });
});

// Периодическая очистка устаревших сессий
function cleanupSessions() {
  const now = Date.now();
  const expiredTime = 24 * 60 * 60 * 1000; // 24 часа
  
  Object.keys(sessions).forEach(sessionId => {
    if (now - sessions[sessionId].created > expiredTime) {
      delete sessions[sessionId];
    }
  });
}

// Запускаем очистку сессий каждый час
setInterval(cleanupSessions, 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`Telegram OAuth proxy server running on port ${port}`);
});