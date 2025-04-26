const axios = require('axios');
const dotenv = require('dotenv');
const { logger } = require('../utils/helpers');

dotenv.config();

const AUTHENTIK_URL = process.env.AUTHENTIK_URL;
const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN;

// Инициализация клиента Axios для Authentik API
const authentikClient = axios.create({
  baseURL: `${AUTHENTIK_URL}/api/v3`,
  headers: {
    'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Поиск пользователя по имени пользователя Telegram
 * @param {string} telegramUsername - Имя пользователя Telegram
 * @returns {Promise<Object|null>} - Пользователь или null
 */
exports.findUserByTelegramUsername = async (telegramUsername) => {
  try {
    // Сначала ищем по атрибуту telegram_username
    const attributeResponse = await authentikClient.get('/core/users/', {
      params: {
        attributes: `telegram_username=${telegramUsername}`
      }
    });

    if (attributeResponse.data.results && attributeResponse.data.results.length > 0) {
      return attributeResponse.data.results[0];
    }

    // Затем ищем по username
    const usernameResponse = await authentikClient.get('/core/users/', {
      params: {
        username: telegramUsername
      }
    });

    if (usernameResponse.data.results && usernameResponse.data.results.length > 0) {
      return usernameResponse.data.results[0];
    }

    return null;
  } catch (error) {
    logger.error(`Error finding user by Telegram username: ${error.message}`);
    return null;
  }
};

/**
 * Создание нового пользователя на основе данных Telegram
 * @param {Object} telegramData - Данные пользователя Telegram
 * @returns {Promise<Object|null>} - Созданный пользователь или null
 */
exports.createUserFromTelegram = async (telegramData) => {
  try {
    const { id, username, first_name, last_name, photo_url } = telegramData;
    
    // Создание пользователя в Authentik
    const response = await authentikClient.post('/core/users/', {
      username: username || `telegram_${id}`,
      name: `${first_name || ''} ${last_name || ''}`.trim(),
      is_active: true,
      attributes: {
        telegram_username: username,
        telegram_id: id,
        telegram_photo_url: photo_url
      }
    });

    logger.info(`Created new user: ${response.data.username}`);
    return response.data;
  } catch (error) {
    logger.error(`Error creating user from Telegram: ${error.message}`);
    return null;
  }
};

/**
 * Аутентификация существующего пользователя
 * @param {string} userId - ID пользователя в Authentik
 * @returns {Promise<string|null>} - Токен доступа или null
 */
exports.authenticateExistingUser = async (userId) => {
  try {
    // В реальном приложении здесь был бы запрос к Authentik OAuth API
    // для получения токена аутентификации
    
    // Для примера вернем ID сессии
    return `telegram-auth-session-${userId}`;
  } catch (error) {
    logger.error(`Error authenticating existing user: ${error.message}`);
    return null;
  }
};

/**
 * Аутентификация нового пользователя
 * @param {string} userId - ID пользователя в Authentik
 * @returns {Promise<string|null>} - Токен доступа или null
 */
exports.authenticateNewUser = async (userId) => {
  // Для новых пользователей логика может отличаться
  return exports.authenticateExistingUser(userId);
};

/**
 * Проверка доступа пользователя
 * @param {string} userId - ID пользователя в Authentik
 * @returns {Promise<boolean>} - Есть ли у пользователя доступ
 */
exports.checkUserAccess = async (userId) => {
  try {
    // Проверка членства в группах или политик доступа
    // Здесь можно добавить логику проверки доступа на основе групп или политик
    
    // Для примера вернем true (доступ разрешен)
    return true;
  } catch (error) {
    logger.error(`Error checking user access: ${error.message}`);
    return false;
  }
};