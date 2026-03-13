import React, { useEffect, useRef, useState } from 'react';

interface TendencialModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const TendencialModal: React.FC<TendencialModalProps> = ({ isVisible, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const isLoaded = useRef(false);

  useEffect(() => {
    if (isVisible && !isLoaded.current && containerRef.current) {
      containerRef.current.innerHTML = ''; // Clear previous content

      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js';
      script.type = 'text/javascript';
      script.async = true;
      script.innerHTML = JSON.stringify({
        "market": "forex",
        "showToolbar": true,
        "defaultColumn": "overview",
        "defaultScreen": "general",
        "isTransparent": false,
        "locale": "es",
        "colorTheme": "dark",
        "width": "100%",
        "height": "100%"
      });
      containerRef.current.appendChild(script);
      isLoaded.current = true;
    }
  }, [isVisible]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if(e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-modal-slide-up`}
      onClick={onClose}
    >
      <style>{`
        @keyframes modal-slide-up {
          from { opacity: 0; transform: translateY(50px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-modal-slide-up {
          animation: modal-slide-up 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
      `}</style>

      <div 
        className={`relative bg-[#131722] overflow-hidden shadow-2xl flex flex-col border-2 border-emerald-500/50 transition-all duration-300 ease-in-out ${isMaximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-7xl h-[85vh] rounded-2xl'}`}
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside modal
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-3">
            <span className="text-lg font-bold tracking-tighter text-white">Screener Tendencial (Forex)</span>
          </div>
          
          <div className="flex items-center space-x-2">
             <button 
              onClick={(e) => { e.stopPropagation(); setIsMaximized(!isMaximized); }}
              className="p-2 text-neutral-500 hover:text-white hover:bg-white/10 rounded-md transition-colors" title={isMaximized ? "Restore" : "Maximize"}>
               {isMaximized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
               ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
               )}
            </button>
            <button 
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white hover:bg-rose-500/50 rounded-md transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="w-full flex-grow relative p-2">
            <div ref={containerRef} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }}>
            </div>
        </div>
      </div>
    </div>
  );
};

export default TendencialModal;