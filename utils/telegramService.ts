// Telegram Bot Service for Signal Alerts

// @ts-ignore - Vite env variables
const TELEGRAM_BOT_TOKEN = import.meta.env?.VITE_TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const RADAR_ACCESS_URL = 'https://yhgqmbexjscojlrzguvh.supabase.co/functions/v1/radar-access';

let userChatId: string | null = null;
let lastAccessCheck: { allowed: boolean; timestamp: number } | null = null;

/**
 * Check if user has radar access (respects freemium/premium limits)
 */
const checkRadarAccess = async (): Promise<boolean> => {
  try {
    const { supabase } = await import('../services/supabaseClient');
    const { data: { session } } = await supabase.auth.getSession();
    
    // Si no hay sesión (visitante anónimo), permitir acceso
    if (!session) {
      return true;
    }
    
    // Verificar acceso con el mismo sistema del portal
    const response = await fetch(RADAR_ACCESS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action: 'check' })
    });
    
    const data = await response.json();
    return data.allowed === true;
  } catch (error) {
    console.error('[Telegram] Access check error:', error);
    return true; // En caso de error, permitir (fail-open)
  }
};

/**
 * Send goodbye message when access is lost
 */
const sendGoodbyeMessage = async (reason: 'timeout' | 'logout' | 'expired'): Promise<void> => {
  if (!userChatId || !TELEGRAM_BOT_TOKEN) return;
  
  try {
    let message = '';
    
    switch (reason) {
      case 'timeout':
        message = '⏰ *Tu tiempo gratuito ha terminado*\n\n' +
                  'Has agotado tu hora diaria de acceso al Radar.\n\n' +
                  '💡 Opciones:\n' +
                  '• Vuelve mañana para otra hora gratis\n' +
                  '• Hazte Premium para acceso ilimitado\n\n' +
                  '¡Hasta pronto! 👋';
        break;
      case 'logout':
        message = '👋 *Te has desconectado*\n\n' +
                  'Has cerrado sesión en el Radar.\n\n' +
                  'Las alertas se reanudarán cuando vuelvas a conectarte.\n\n' +
                  '¡Hasta pronto!';
        break;
      case 'expired':
        message = '⚠️ *Tu plan Premium ha caducado*\n\n' +
                  'Tu suscripción ya no está activa.\n\n' +
                  'Renueva tu plan para seguir recibiendo alertas ilimitadas.\n\n' +
                  '¡Te esperamos de vuelta! 💎';
        break;
    }
    
    await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: userChatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    
    console.log(`[Telegram] Goodbye message sent (${reason})`);
  } catch (error) {
    console.error('[Telegram] Goodbye message error:', error);
  }
};

/**
 * Initialize Telegram service with user's chat_id from Supabase
 */
export const initializeTelegram = async (userId: string): Promise<boolean> => {
  try {
    const { supabase } = await import('../services/supabaseClient');
    const { data, error } = await supabase
      .from('telegram_connections')
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

  // VERIFICAR ACCESO antes de enviar (respeta límites freemium/premium)
  const hasAccess = await checkRadarAccess();
  
  if (!hasAccess) {
    console.log('[Telegram] Access denied - not sending signal');
    
    // Si es la primera vez que detectamos pérdida de acceso, enviar mensaje de despedida
    if (!lastAccessCheck || lastAccessCheck.allowed) {
      await sendGoodbyeMessage('timeout');
    }
    
    lastAccessCheck = { allowed: false, timestamp: Date.now() };
    return false;
  }
  
  // Actualizar cache de acceso
  lastAccessCheck = { allowed: true, timestamp: Date.now() };

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
      .from('telegram_connections')
      .delete()
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
  sendGoodbye: sendGoodbyeMessage,
};
