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

    // CONSEJOS INTELIGENTES
    const overlap = europeOpen && americaOpen; // Solapamiento EU+NY
    
    if (overlap) {
      advice.push("FOREX: Liquidez MAXIMA (Europa + NY activas)");
    } else if (europeOpen && !americaOpen) {
      advice.push("Indices EU operativos (DAX, CAC, FTSE) - Indices USA cerrados");
    } else if (americaOpen && !europeOpen) {
      advice.push("Indices USA operativos (SPX, IXIC, DJI) - Indices EU cerrados");
    } else if (asiaOpen && !europeOpen && !americaOpen) {
      advice.push("FOREX: Liquidez BAJA (solo Asia) - Indices cerrados");
    }

    if (americaOpen && americaTimeLeft < 30) {
      advice.push("NYSE cierra en " + formatTime(americaTimeLeft) + " - Evita nuevas entradas");
    }

    if (europeOpen && europeTimeLeft < 30) {
      advice.push("Mercado EU cierra en " + formatTime(europeTimeLeft) + " - Precaucion DAX/CAC");
    }

    if (!asiaOpen && !europeOpen && !americaOpen && (utcDay >= 1 && utcDay <= 5)) {
      advice.push("Mercados principales cerrados - Solo CRYPTO 24/7 operativo");
    }

    if (utcDay === 0 || utcDay === 6) {
      advice.push("Fin de semana - Solo FOREX (desde Dom 22:00) y CRYPTO");
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
    const update = () => setSessions(getSessionStatus());
    update();
    const interval = setInterval(update, 60000); // Actualizar cada minuto
    return () => clearInterval(interval);
  }, []);

  const SessionBadge = ({ session }: { session: SessionInfo }) => (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${
        session.status === 'open' ? 'bg-emerald-500' : 'bg-neutral-700'
      }`} />
      <span className="text-[10px] font-mono font-bold text-neutral-400 tracking-wide">
        {session.name}
      </span>
      <span className={`text-[9px] font-mono ${
        session.status === 'open' ? 'text-emerald-400' : 'text-neutral-600'
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
    <div className="max-w-[1500px] mx-auto px-8 mb-4">
      <div className="bg-neutral-900/50 border border-neutral-800/50 rounded-lg overflow-hidden">
        {/* Strip principal siempre visible */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-6">
            <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">
              SESSION
            </span>
            <SessionBadge session={sessions.asia} />
            <SessionBadge session={sessions.europe} />
            <SessionBadge session={sessions.america} />
          </div>

          <div className="flex items-center gap-3">
            {sessions.advice.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded">
                <span className="text-[9px] font-mono text-amber-400">
                  {sessions.advice.length} {sessions.advice.length === 1 ? 'aviso' : 'avisos'}
                </span>
              </div>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors"
              title={expanded ? "Colapsar" : "Ver detalles"}
            >
              <svg 
                className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} 
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
          <div className="border-t border-neutral-800/50 px-4 py-3 bg-neutral-900/30">
            <div className="flex flex-col gap-2">
              {sessions.advice.map((msg, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[10px] font-mono text-neutral-400">
                  <span className="text-cyan-500 mt-0.5">•</span>
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
