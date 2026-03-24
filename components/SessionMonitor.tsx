import React, { useState, useEffect } from 'react';

interface SessionInfo {
  name: string;
  status: 'open' | 'closed' | 'pre-open';
  timeLeft?: string;
  opensIn?: string;
}

const SessionMonitor: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [sessions, setSessions] = useState<{
    asia: SessionInfo;
    europe: SessionInfo;
    america: SessionInfo;
    advice: string[];
  }>({
    asia: { name: 'ASIA', status: 'closed' },
    europe: { name: 'EUROPA', status: 'closed' },
    america: { name: 'AMERICA', status: 'closed' },
    advice: []
  });
  const [hasUnreadAdvice, setHasUnreadAdvice] = useState(false);
  const [lastAdviceHash, setLastAdviceHash] = useState('');

  const getSessionStatus = () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    const utcDay = now.getUTCDay();
    const totalMinutes = utcHour * 60 + utcMinute;

    const advice: string[] = [];

    // ASIA: 23:00 - 08:00 UTC (Tokyo + Hong Kong + Shanghai)
    const asiaOpen = utcHour >= 23 || utcHour < 8;
    const asiaTimeLeft = asiaOpen ? (8 * 60 - totalMinutes + (utcHour >= 23 ? 1440 : 0)) : 0;
    const asiaOpensIn = !asiaOpen ? ((23 * 60 - totalMinutes + (totalMinutes < 23 * 60 ? 0 : 1440))) : 0;

    // EUROPA: 07:00 - 16:30 UTC (London + Frankfurt + Paris)
    const europeOpen = utcDay >= 1 && utcDay <= 5 && totalMinutes >= 420 && totalMinutes <= 990;
    const europeTimeLeft = europeOpen ? (990 - totalMinutes) : 0;
    const europeOpensIn = !europeOpen && utcDay >= 1 && utcDay <= 5 ? (totalMinutes < 420 ? 420 - totalMinutes : 420 + 1440 - totalMinutes) : 0;

    // AMERICA: 14:30 - 21:00 UTC (NYSE + NASDAQ)
    const americaOpen = utcDay >= 1 && utcDay <= 5 && totalMinutes >= 870 && totalMinutes <= 1260;
    const americaTimeLeft = americaOpen ? (1260 - totalMinutes) : 0;
    const americaOpensIn = !americaOpen && utcDay >= 1 && utcDay <= 5 ? (totalMinutes < 870 ? 870 - totalMinutes : 870 + 1440 - totalMinutes) : 0;

    // Formato tiempo
    const formatTime = (minutes: number) => {
      if (minutes <= 0) return '';
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    // CONSEJOS INTELIGENTES (tono humano y educativo)
    const overlap = europeOpen && americaOpen; // Solapamiento EU+NY
    
    if (overlap) {
      advice.push("🔥 Momento óptimo para FOREX: Europa y Nueva York operan juntas (máxima liquidez y volatilidad)");
      advice.push("Las señales de EUR/USD, GBP/USD y USD/CHF son más confiables ahora");
    } else if (europeOpen && !americaOpen) {
      advice.push("✅ Puedes operar índices europeos (DAX, CAC, FTSE) con confianza");
      advice.push("⚠️ Evita índices americanos (SPX, IXIC, DJI) - Wall Street está cerrado");
      advice.push("FOREX: Liquidez moderada, espera apertura de NY (14:30 UTC) para mayor movimiento");
    } else if (americaOpen && !europeOpen) {
      advice.push("✅ Wall Street operativo - Señales de SPX, IXIC, DJI y acciones USA son válidas");
      advice.push("⚠️ Evita índices europeos - Mercado EU ya cerró");
      advice.push("FOREX: Buena liquidez con pares del dólar (USD/JPY, USD/CAD, etc)");
    } else if (asiaOpen && !europeOpen && !americaOpen) {
      advice.push("🌏 Solo sesión asiática activa - Liquidez limitada en FOREX");
      advice.push("⚠️ Evita operar FOREX ahora si eres principiante (spreads más altos, movimientos erráticos)");
      advice.push("Índices asiáticos (N225, HSI) podrían tener señales, pero verifica horarios locales");
    }

    if (americaOpen && americaTimeLeft < 30) {
      advice.push("⏰ Wall Street cierra en " + formatTime(americaTimeLeft) + " - NO abras nuevas posiciones");
      advice.push("Última media hora suele tener movimientos bruscos por cierres institucionales");
    }

    if (europeOpen && europeTimeLeft < 30) {
      advice.push("⏰ Mercados europeos cierran en " + formatTime(europeTimeLeft) + " - Precaución con DAX/CAC/FTSE");
      advice.push("Evita abrir trades nuevos en índices EU, cierra posiciones abiertas si puedes");
    }

    if (!asiaOpen && !europeOpen && !americaOpen && (utcDay >= 1 && utcDay <= 5)) {
      advice.push("😴 Mercados principales cerrados - Es momento de descanso");
      advice.push("Solo CRYPTO opera 24/7, pero ten precaución: menor liquidez en estas horas");
      advice.push("Revisa señales acumuladas y prepara estrategia para mañana");
    }

    if (utcDay === 0) {
      // Domingo
      advice.push("📅 Domingo - Solo FOREX desde las 22:00 UTC y CRYPTO 24/7");
      advice.push("Los mercados de acciones e índices abren el lunes. Usa este tiempo para planificar");
    } else if (utcDay === 6) {
      // Sábado
      advice.push("📅 Fin de semana - Mercados cerrados excepto CRYPTO");
      advice.push("⚠️ Ignora señales de FOREX, ÍNDICES y ACCIONES hasta el domingo 22:00 UTC");
      advice.push("Es buen momento para revisar tu historial y analizar trades de la semana");
    }

    // Avisos de apertura próxima
    if (!americaOpen && americaOpensIn > 0 && americaOpensIn <= 30 && utcDay >= 1 && utcDay <= 5) {
      advice.push("⏰ Wall Street abre en " + formatTime(americaOpensIn) + " - Prepárate para volatilidad inicial");
      advice.push("Los primeros 15-30 minutos suelen ser caóticos, espera a que se estabilice");
    }

    if (!europeOpen && europeOpensIn > 0 && europeOpensIn <= 30 && utcDay >= 1 && utcDay <= 5) {
      advice.push("⏰ Europa abre en " + formatTime(europeOpensIn) + " - Ten paciencia en la apertura");
    }

    return {
      asia: {
        name: 'ASIA',
        status: (asiaOpen ? 'open' : 'closed') as 'open' | 'closed',
        timeLeft: asiaOpen ? formatTime(asiaTimeLeft) : undefined,
        opensIn: !asiaOpen && asiaOpensIn > 0 ? formatTime(asiaOpensIn) : undefined
      },
      europe: {
        name: 'EU',
        status: (europeOpen ? 'open' : 'closed') as 'open' | 'closed',
        timeLeft: europeOpen ? formatTime(europeTimeLeft) : undefined,
        opensIn: !europeOpen && europeOpensIn > 0 ? formatTime(europeOpensIn) : undefined
      },
      america: {
        name: 'NY',
        status: (americaOpen ? 'open' : 'closed') as 'open' | 'closed',
        timeLeft: americaOpen ? formatTime(americaTimeLeft) : undefined,
        opensIn: !americaOpen && americaOpensIn > 0 ? formatTime(americaOpensIn) : undefined
      },
      advice
    };
  };

  useEffect(() => {
    const update = () => {
      const newStatus = getSessionStatus();
      setSessions(newStatus);
      
      // Detectar si los mensajes cambiaron
      const newHash = newStatus.advice.join('|');
      if (newHash !== lastAdviceHash && newHash !== '') {
        setHasUnreadAdvice(true);
        setLastAdviceHash(newHash);
      }
    };
    
    update();
    const interval = setInterval(update, 60000); // Actualizar cada minuto
    return () => clearInterval(interval);
  }, [lastAdviceHash]);

  const handleToggleExpand = () => {
    setExpanded(!expanded);
    // Marcar como leído cuando expande
    if (!expanded && sessions.advice.length > 0) {
      setHasUnreadAdvice(false);
    }
  };

  const SessionBadge = ({ session }: { session: SessionInfo }) => (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        session.status === 'open' ? 'bg-emerald-500' : 'bg-neutral-600'
      }`} />
      <span className="text-xs font-bold text-white tracking-wider">
        {session.name}
      </span>
      <span className={`text-xs font-mono font-bold ${
        session.status === 'open' ? 'text-emerald-400' : 'text-neutral-500'
      }`}>
        {session.status === 'open' && session.timeLeft 
          ? session.timeLeft 
          : session.opensIn 
            ? session.opensIn
            : '--'}
      </span>
    </div>
  );

  return (
    <div className="max-w-[1500px] mx-auto px-8 mb-6">
      <div className="bg-gradient-to-r from-white/[0.08] to-white/[0.05] border-2 border-white/20 rounded-xl overflow-hidden shadow-lg">
        {/* Strip principal siempre visible */}
        <div className="flex items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">
              MARKET SESSIONS
            </span>
            <div className="w-px h-6 bg-white/20" />
            <SessionBadge session={sessions.asia} />
            <div className="w-px h-5 bg-white/10" />
            <SessionBadge session={sessions.europe} />
            <div className="w-px h-5 bg-white/10" />
            <SessionBadge session={sessions.america} />
          </div>

          <div className="flex items-center gap-3">
            {sessions.advice.length > 0 && hasUnreadAdvice && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg animate-pulse">
                <span className="text-xs font-bold text-amber-300">
                  {sessions.advice.length} {sessions.advice.length === 1 ? 'aviso' : 'avisos'}
                </span>
              </div>
            )}
            <button
              onClick={handleToggleExpand}
              className="p-1.5 text-white/60 hover:text-white transition-colors"
              title={expanded ? "Colapsar" : "Ver detalles"}
            >
              <svg 
                className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                strokeWidth="3"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Panel expandido con consejos */}
        {expanded && sessions.advice.length > 0 && (
          <div className="border-t border-white/20 px-6 py-4 bg-black/20">
            <div className="flex flex-col gap-2.5">
              {sessions.advice.map((msg, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs font-mono text-neutral-300">
                  <span className="text-cyan-400 mt-0.5 text-sm">•</span>
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionMonitor;
