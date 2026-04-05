// Notification Service -System notifications for background alerts

let notificationPermission: NotificationPermission = 'default';

/**
 * Request notification permission from user
 * Should be called after user interaction (e.g., clicking connect)
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('[NotificationService] Notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    notificationPermission = 'granted';
    return true;
  }

  if (Notification.permission === 'denied') {
    notificationPermission = 'denied';
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    return permission === 'granted';
  } catch (error) {
    console.error('[NotificationService] Error requesting permission:', error);
    return false;
  }
};

/**
 * Send system notification for new signal
 */
export const sendSignalNotification = (
  symbol: string,
  direction: 'COMPRA' | 'VENTA',
  score: number,
  instrumentType: string
): void => {
  if (!('Notification' in window)) {
    console.warn('[NotificationService] Notifications not supported');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.log('[NotificationService] Permission not granted');
    return;
  }

  try {
    const directionEmoji = direction === 'COMPRA' ? '📈' : '📉';
    const title = `${directionEmoji} ${symbol} - ${direction} AHORA`;
    const body = `Score: ${score} | ${instrumentType.toUpperCase()}`;

    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico', // You can customize this
      badge: '/favicon.ico',
      tag: `signal-${symbol}`, // Prevents duplicate notifications for same symbol
      requireInteraction: false,
      silent: false, // Use system sound
    });

    // Auto-close notification after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);

    // Optional: Handle click to focus radar tab
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.error('[NotificationService] Error sending notification:', error);
  }
};

/**
 * Check if notifications are available and permitted
 */
export const canSendNotifications = (): boolean => {
  return 'Notification' in window && Notification.permission === 'granted';
};

export const notificationService = {
  requestPermission: requestNotificationPermission,
  sendSignal: sendSignalNotification,
  canSend: canSendNotifications,
};
