const telegramService = require('../services/telegramService');
const authentikService = require('../services/authentikService');
const { logger } = require('../utils/helpers');

/**
 * Обработка данных от Telegram Login Widget
 */
exports.handleTelegramCallback = async (req, res) => {
  try {
    const telegramData = req.query;
    
    // Проверка данных от Telegram
    const isValid = telegramService.verifyTelegramData(telegramData);
    if (!isValid) {
      logger.warn('Invalid Telegram authentication data');
      return res.redirect(`${process.env.AUTHENTIK_URL}/if/flow/initial/?error=invalid_telegram_data`);
    }
    
    // Извлечение данных пользователя
    const { id, first_name, last_name, username, photo_url, auth_date } = telegramData;
    
    // Поиск пользователя в Authentik
    let user = await authentikService.findUserByTelegramUsername(username);
    
    if (user) {
      // Пользователь существует - проверяем доступ и авторизуем
      logger.info(`User found: ${username}`);
      const accessToken = await authentikService.authenticateExistingUser(user.id);
      return res.redirect(`${process.env.AUTHENTIK_URL}/if/flow/initial/?token=${accessToken}`);
    } else {
      // Пользователь не существует - создаем нового
      logger.info(`Creating new user: ${username}`);
      const newUser = await authentikService.createUserFromTelegram({
        id,
        first_name,
        last_name,
        username,
        photo_url
      });
      
      if (newUser) {
        // Проверяем доступ нового пользователя
        const hasAccess = await authentikService.checkUserAccess(newUser.id);
        
        if (hasAccess) {
          // Авторизуем пользователя
          const accessToken = await authentikService.authenticateNewUser(newUser.id);
          return res.redirect(`${process.env.AUTHENTIK_URL}/if/flow/initial/?token=${accessToken}`);
        } else {
          // Отказ в доступе
          return res.redirect(`${process.env.AUTHENTIK_URL}/if/flow/initial/?error=access_denied&message=Contact @${process.env.TELEGRAM_BOT_USERNAME} for access`);
        }
      } else {
        // Ошибка создания пользователя
        return res.redirect(`${process.env.AUTHENTIK_URL}/if/flow/initial/?error=user_creation_failed`);
      }
    }
  } catch (error) {
    logger.error(`Error in Telegram callback: ${error.message}`);
    return res.redirect(`${process.env.AUTHENTIK_URL}/if/flow/initial/?error=internal_error`);
  }
};

/**
 * Проверка данных Telegram
 */
exports.verifyTelegramData = (req, res) => {
  try {
    const isValid = telegramService.verifyTelegramData(req.body);
    return res.json({ valid: isValid });
  } catch (error) {
    logger.error(`Error verifying Telegram data: ${error.message}`);
    return res.status(400).json({ valid: false, error: error.message });
  }
};