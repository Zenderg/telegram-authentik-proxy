import bodyParser from 'body-parser';
import crypto from 'crypto';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const port = process.env.PORT || 3000;

const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  botId: process.env.TELEGRAM_BOT_ID,
  clientId: process.env.OAUTH_CLIENT_ID,
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  authentikRedirect: process.env.AUTHENTIK_REDIRECT
};

const authCodes = new Map(); // Храним коды авторизации

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Authorization Endpoint
app.get('/auth', (req, res) => {
  const { redirect_uri, state } = req.query;
  console.log(`redirect_uri: ${redirect_uri}`);
  console.log(`state: ${state}`);
  
  res.send(`
    <html>
      <script src="https://telegram.org/js/telegram-widget.js"></script>
      <script>
        Telegram.Login.auth({
          bot_id: '${config.botId}',
          request_access: 'write',
          lang: 'en',
          return_to: '${redirect_uri}'
        }, function(data) {
          fetch('/telegram-auth/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...data,
              redirect_uri: '${redirect_uri}',
              state: '${state}'
            })
          }).then(() => window.close());
        });
      </script>
    </html>
  `);
});

// Callback Endpoint (обработка данных от Telegram)
app.post('/callback', (req, res) => {
  const data = req.body;

  // Проверка подписи
  const secret = crypto.createHash('sha256')
    .update(config.botToken)
    .digest();
  
  const checkString = Object.keys(data)
    .filter(k => !['hash', 'redirect_uri', 'state'].includes(k))
    .sort()
    .map(k => `${k}=${data[k]}`)
    .join('\n');

  const hash = crypto.createHmac('sha256', secret)
    .update(checkString)
    .digest('hex');

  if (hash !== data.hash) {
    return res.status(403).send('Invalid signature');
  }

  // Генерация кода авторизации
  const code = uuidv4();
  authCodes.set(code, {
    user: {
      id: data.id,
      username: data.username,
      first_name: data.first_name,
      last_name: data.last_name
    },
    redirect_uri: data.redirect_uri,
    state: data.state
  });

  // Перенаправление обратно в Authentik с кодом
  const redirectUrl = new URL(data.redirect_uri);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', data.state);
  res.redirect(redirectUrl.toString());
});

// Token Endpoint
app.post('/token', (req, res) => {
  const { code, client_id, client_secret } = req.body;

  // Проверка client_id и client_secret
  if (client_id !== config.clientId || client_secret !== config.clientSecret) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  const authData = authCodes.get(code);
  if (!authData) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  // Генерация access token
  const accessToken = 'tg_' + crypto.randomBytes(16).toString('hex');
  
  res.json({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    user: authData.user
  });

  authCodes.delete(code); // Удаляем использованный код
});

// UserInfo Endpoint (опционально)
app.get('/userinfo', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  // Здесь можно добавить проверку токена и возврат данных пользователя
  res.json({ error: 'Not implemented' });
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});