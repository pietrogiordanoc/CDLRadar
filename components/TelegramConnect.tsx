import React, { useState, useEffect } from 'react';
import { telegramService } from '../utils/telegramService';
import QRCode from 'qrcode';

interface TelegramConnectProps {
  userId: string;
}

const TelegramConnect: React.FC<TelegramConnectProps> = ({ userId }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [showQR, setShowQR] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    // Check if already connected
    const checkConnection = async () => {
      const connected = await telegramService.initialize(userId);
      setIsConnected(connected);
    };
    checkConnection();
  }, [userId]);

  useEffect(() => {
    // Master key: Shift + F10 para activar debug mode
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'F10') {
        e.preventDefault();
        setDebugMode(prev => !prev);
        console.log('[Debug] Telegram test mode:', !debugMode);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [debugMode]);

  useEffect(() => {
    // Generate QR code when needed
    if (showQR && !qrCodeUrl) {
      const botLink = telegramService.getBotLink(userId);
      QRCode.toDataURL(botLink, { width: 200 }).then(setQrCodeUrl);
    }
  }, [showQR, userId, qrCodeUrl]);

  const handleDisconnect = async () => {
    const success = await telegramService.disconnect(userId);
    if (success) {
      setIsConnected(false);
      setQrCodeUrl('');
    }
  };

  const handleTestAlert = async () => {
    const success = await telegramService.sendSignal(
      'EUR/USD',
      'COMPRA',
      92,
      'forex',
      1.0826,
      1.0850
    );
    if (success) {
      console.log('[Test] Alerta de prueba enviada');
    } else {
      console.error('[Test] Error al enviar alerta de prueba');
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isConnected ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.332-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.099.155.232.171.326.016.094.036.308.02.475z"/>
            </svg>
            <span className="text-xs text-emerald-400 font-medium">Telegram conectado</span>
          </div>
          {debugMode && (
            <button
              onClick={handleTestAlert}
              className="px-2 py-1 text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20 rounded transition-colors"
              title="Enviar alerta de prueba a Telegram"
            >
              TEST
            </button>
          )}
          <button
            onClick={handleDisconnect}
            className="px-2 py-1 text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Desconectar
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setShowQR(!showQR)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.332-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.099.155.232.171.326.016.094.036.308.02.475z"/>
            </svg>
            <span className="text-xs text-cyan-400 font-medium">Conectar Telegram</span>
          </button>
          
          {showQR && (
            <div className="absolute top-full right-0 mt-2 z-50 bg-neutral-900 border border-neutral-800 rounded-lg p-4 shadow-xl">
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs text-neutral-400 text-center max-w-[180px]">
                  Escanea este QR desde Telegram para recibir alertas
                </p>
                {qrCodeUrl && (
                  <img src={qrCodeUrl} alt="QR Code" className="w-[160px] h-[160px]" />
                )}
                <a
                  href={telegramService.getBotLink(userId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  O abre el bot directamente
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TelegramConnect;
