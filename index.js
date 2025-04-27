import bodyParser from 'body-parser';
import crypto from 'crypto';
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN',
  botId: process.env.TELEGRAM_BOT_ID || 'YOUR_BOT_ID',
  callbackUrl: process.env.CALLBACK_URL || 'https://your-domain.com/telegram/callback'
};

app.use(bodyParser.json());

app.get('/auth', (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://telegram.org/js/telegram-widget.js"></script>
      </head>
      <body>
        <script>
          Telegram.Login.auth({
            bot_id: '${config.botId}',
            request_access: 'write',
            lang: 'en'
          }, function(data) {
            fetch('${config.callbackUrl}', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(data)
            }).then(response => response.json())
              .then(data => window.location.href = data.redirect_url);
          });
        </script>
      </body>
    </html>
  `);
});

app.post('/callback', (req, res) => {
  const data = req.body;
  
  const secret = crypto.createHash('sha256')
    .update(config.botToken)
    .digest();
  
  const checkString = Object.keys(data)
    .filter(k => k !== 'hash')
    .sort()
    .map(k => `${k}=${data[k]}`)
    .join('\n');

  const hash = crypto.createHmac('sha256', secret)
    .update(checkString)
    .digest('hex');

  if (hash !== data.hash) {
    return res.status(403).json({error: 'Invalid signature'});
  }

  res.json({
    access_token: 'tg_' + crypto.randomBytes(16).toString('hex'),
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: data.id,
      username: data.username,
      first_name: data.first_name,
      last_name: data.last_name
    },
    redirect_url: process.env.AUTHENTIK_REDIRECT || 'https://auth.your-domain.com/'
  });
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});