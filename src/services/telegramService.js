const crypto = require('crypto');
const dotenv = require('dotenv');
const { logger } = require('../utils/helpers');

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Проверка подлинности данных от Telegram Login Widget
 * @param {Object} telegramData - Данные от Telegram
 * @returns {boolean} - Результат проверки
 */
exports.verifyTelegramData = (telegramData) => {
  if (!telegramData) {
    return false;
  }

  const { hash, ...data } = telegramData;
  
  if (!hash || !data.auth_date || !data.id) {
    return false;
  }

  // Проверка времени аутентификации (не старше 1 часа)
  const authDate = parseInt(data.auth_date);
  const currentTime = Math.floor(Date.now() / 1000);
  if (currentTime - authDate > 3600) {
    logger.warn('Telegram auth data is expired');
    return false;
  }

  // Создание проверочного хэша
  const secretKey = crypto.createHash('sha256')
    .update(TELEGRAM_BOT_TOKEN)
    .digest();

  const dataCheckString = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');

  const calculatedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return calculatedHash === hash;
};

/**
 * Получение информации о пользователе Telegram
 * @param {string} telegramId - ID пользователя Telegram
 * @returns {Promise<Object>} - Информация о пользователе
 */
exports.getTelegramUserInfo = async (telegramId) => {
  // В реальном приложении здесь был бы запрос к Telegram API
  // Но для базовой интеграции логина нам достаточно данных из виджета
  logger.info(`Getting info for Telegram user: ${telegramId}`);
  return null;
};