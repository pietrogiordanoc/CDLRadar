// Telegram Bot Service for Signal Alerts

// @ts-ignore - Vite env variables
const TELEGRAM_BOT_TOKEN = import.meta.env?.VITE_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

let userChatId: string | null = null;

/**
 * Initialize Telegram service with user's chat_id from Supabase
 */
export const initializeTelegram = async (userId: string): Promise<boolean> => {
  try {
    const { supabase } = await import('../services/supabaseClient');
    const { data, error } = await supabase
      .from('profiles')
      .select('telegram_chat_id')
      .eq('user_id', userId)
      .single();

    if (error || !data?.telegram_chat_id) {
      console.log('[Telegram] No chat_id found for user');
      return false;
    }

    userChatId = data.telegram_chat_id;
    console.log('[Telegram] Service initialized');
    return true;
  } catch (error) {
    console.error('[Telegram] Init error:', error);
    return false;
  }
};

/**
 * Send trading signal to user's Telegram
 */
export const sendTelegramSignal = async (
  symbol: string,
  direction: 'COMPRA' | 'VENTA',
  score: number,
  instrumentType: string,
  entry?: number,
  tp?: number
): Promise<boolean> => {
  if (!userChatId || !TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram] Not configured');
    return false;
  }

  try {
    const directionEmoji = direction === 'COMPRA' ? '📈' : '📉';
    
    let message = `${directionEmoji} *${symbol}* - ${direction} AHORA\n\n`;
    message += `📊 Score: *${score}*\n`;
    message += `🏷️ Tipo: ${instrumentType.toUpperCase()}\n`;
    
    if (entry && tp) {
      message += `\n💰 Entry: ${entry.toFixed(4)}\n`;
      message += `🎯 TP: ${tp.toFixed(4)}\n`;
    }
    
    message += `\n⏰ ${new Date().toLocaleTimeString('es-ES')}`;

    const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: userChatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[Telegram] Send error:', error);
      return false;
    }

    console.log('[Telegram] Signal sent successfully');
    return true;
  } catch (error) {
    console.error('[Telegram] Send error:', error);
    return false;
  }
};

/**
 * Generate deep link for Telegram bot
 */
export const getTelegramBotLink = (userId: string): string => {
  // @ts-ignore - Vite env variables
  const botUsername = import.meta.env?.VITE_TELEGRAM_BOT_USERNAME || 'YourBotUsername';
  // User ID encoded in start parameter for bot to save
  return `https://t.me/${botUsername}?start=${btoa(userId)}`;
};

/**
 * Check if user has Telegram connected
 */
export const isTelegramConnected = (): boolean => {
  return userChatId !== null;
};

/**
 * Disconnect Telegram (clear from Supabase)
 */
export const disconnectTelegram = async (userId: string): Promise<boolean> => {
  try {
    const { supabase } = await import('../services/supabaseClient');
    const { error } = await supabase
      .from('profiles')
      .update({ telegram_chat_id: null })
      .eq('user_id', userId);

    if (error) {
      console.error('[Telegram] Disconnect error:', error);
      return false;
    }

    userChatId = null;
    console.log('[Telegram] Disconnected successfully');
    return true;
  } catch (error) {
    console.error('[Telegram] Disconnect error:', error);
    return false;
  }
};

export const telegramService = {
  initialize: initializeTelegram,
  sendSignal: sendTelegramSignal,
  getBotLink: getTelegramBotLink,
  isConnected: isTelegramConnected,
  disconnect: disconnectTelegram,
};
