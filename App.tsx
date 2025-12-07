import React, { useState, useEffect, useCallback, useRef } from 'react';
import HandTracker from './components/HandTracker';
import RainCanvas from './components/RainCanvas';
import { generateMagicCommentary } from './services/geminiService';
import { RainState, HandPosition } from './types';
import { CloudRain, RotateCcw, Hand, Zap, Activity, Loader2, AlertCircle } from 'lucide-react';

const App: React.FC = () => {
  const [handPos, setHandPos] = useState<HandPosition | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  
  // Loading States
  const [loadStatus, setLoadStatus] = useState("正在初始化...");
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);
  const [rainState, setRainState] = useState<RainState>(RainState.FALLING);
  
  const [commentary, setCommentary] = useState<string>("正在连接以太元素...");
  const [showCommentary, setShowCommentary] = useState(true);
  
  const targetSpeedRef = useRef(1.0);
  const lastStateRef = useRef<RainState>(RainState.FALLING);
  const commentaryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleHandMove = useCallback((pos: HandPosition | null) => {
    setHandPos(pos);
    if (pos) {
      const MAX_SPEED = 0.8;
      const target = (pos.y - 0.5) * 2 * MAX_SPEED;
      targetSpeedRef.current = target;
    } else {
      targetSpeedRef.current = 0.5;
    }
  }, []);

  useEffect(() => {
    let animationFrame: number;
    const updatePhysics = () => {
      setSpeedMultiplier(prev => {
        const factor = 0.08;
        const next = prev + (targetSpeedRef.current - prev) * factor;
        return next;
      });
      animationFrame = requestAnimationFrame(updatePhysics);
    };
    animationFrame = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (!isCameraReady) return; // Don't run AI generation if loading

    let currentState = RainState.PAUSED;
    const THRESHOLD = 0.02;

    if (speedMultiplier > THRESHOLD) currentState = RainState.FALLING;
    else if (speedMultiplier < -THRESHOLD) currentState = RainState.RISING;
    else currentState = RainState.PAUSED;

    if (currentState !== rainState) {
      setRainState(currentState);
      
      if (currentState !== lastStateRef.current) {
        lastStateRef.current = currentState;
        if (commentaryTimeoutRef.current) clearTimeout(commentaryTimeoutRef.current);
        
        commentaryTimeoutRef.current = setTimeout(async () => {
          setShowCommentary(false);
          setTimeout(async () => {
             const text = await generateMagicCommentary(currentState);
             setCommentary(text);
             setShowCommentary(true);
          }, 300);
        }, 1500); 
      }
    }
  }, [speedMultiplier, rainState, isCameraReady]);

  const getExplanation = () => {
    const speedPct = Math.abs(speedMultiplier * 100).toFixed(0);
    const force = handPos?.force || 0;
    
    let baseStatus = "";
    if (rainState === RainState.FALLING) baseStatus = `重力场正常 ${speedPct}%`;
    else if (rainState === RainState.RISING) baseStatus = `时空逆流 ${speedPct}%`;
    else baseStatus = `绝对领域 · 时间静止`;

    if (force > 0.1) {
        const intensity = (force * 100).toFixed(0);
        return `${baseStatus} | 引力奇点 [${intensity}%]`;
    }
    
    return baseStatus;
  };

  return (
    <div className="relative w-full h-screen overflow-hidden text-white font-sans selection:bg-gray-500/30">
      
      <HandTracker 
        onHandMove={handleHandMove} 
        onCameraReady={setIsCameraReady} 
        onLoadStatus={setLoadStatus}
        onLoadProgress={setLoadProgress}
        onError={setLoadError}
      />

      <RainCanvas speedMultiplier={speedMultiplier} handPosition={handPos} />

      <div className="relative z-20 w-full h-full pointer-events-none">
        
        {/* Title Section - Responsive Size & Position */}
        <div className="absolute top-4 left-4 md:top-10 md:left-10 opacity-90 transition-all duration-500">
            <h1 className="text-5xl md:text-7xl lg:text-9xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 cinzel drop-shadow-[0_4px_20px_rgba(255,255,255,0.2)]">
            时之雨
            </h1>
            <p className="text-gray-400 text-[10px] md:text-sm tracking-[0.4em] md:tracking-[0.8em] uppercase border-b border-gray-700 pb-2 md:pb-3 inline-block ml-1 md:ml-2 mt-1 md:mt-2">
                CHRONOS RAIN
            </p>
        </div>

        {/* Oracle Section / Loading Status - Highly Compact on Mobile */}
        <div className="absolute top-4 right-2 md:top-8 md:right-8 max-w-[45%] md:max-w-md text-right transition-all duration-500">
            {/* Determine Content based on Loading vs Ready */}
            {!isCameraReady ? (
                // LOADING STATE UI
                <div className="flex flex-col items-end animate-in fade-in duration-700">
                     <div className="flex items-center gap-1 md:gap-2 mb-1 md:mb-2">
                        <span className="text-[8px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">系统启动</span>
                        <Loader2 className="w-2 h-2 md:w-3 md:h-3 text-gray-400 animate-spin" />
                     </div>
                     <div className="p-2 md:p-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 shadow-xl w-full">
                        {loadError ? (
                            <div className="text-red-400 flex flex-col items-end gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-[10px] md:text-xs">错误</span>
                                    <AlertCircle className="w-3 h-3 md:w-4 md:h-4" />
                                </div>
                                <span className="text-[8px] md:text-xs text-right opacity-80">{loadError}</span>
                            </div>
                        ) : (
                            <>
                                <p className="text-[10px] md:text-sm text-gray-200 font-mono mb-2 md:mb-3 text-right whitespace-nowrap overflow-hidden text-ellipsis">{loadStatus}</p>
                                <div className="w-full h-1 bg-gray-700/50 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-white/80 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                        style={{ width: `${loadProgress}%` }}
                                    />
                                </div>
                                <p className="text-[8px] md:text-[10px] text-gray-500 mt-1 md:mt-2 font-mono text-right">{loadProgress}%</p>
                            </>
                        )}
                     </div>
                </div>
            ) : (
                // READY STATE UI (Oracle)
                <div className={`transition-all duration-700 transform ${showCommentary ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
                    <div className="flex items-center justify-end gap-1 md:gap-2 mb-1 md:mb-2">
                        <span className="text-[8px] md:text-xs font-bold text-gray-500 uppercase tracking-widest">魔法神谕</span>
                        <Zap className="w-2 h-2 md:w-3 md:h-3 text-gray-400" />
                    </div>
                    
                    <div className="p-2 md:p-6 bg-black/40 backdrop-blur-md rounded-none border-r-2 md:border-r-4 border-white/20 shadow-2xl">
                        <p className="text-xs md:text-2xl font-normal italic text-white cinzel leading-snug">
                            "{commentary}"
                        </p>
                        
                        <div className="mt-2 md:mt-4 pt-2 md:pt-3 border-t border-white/10 flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2 text-gray-400 mb-1">
                                <Activity className="w-2 h-2 md:w-3 md:h-3" />
                                <span className="text-[6px] md:text-[10px] font-mono tracking-widest uppercase">
                                    实时状态
                                </span>
                            </div>
                            <p className="text-[8px] md:text-xs font-light tracking-wide font-mono text-white/90">
                                {getExplanation()}
                            </p>
                            
                            {/* Force State Indicator - Gather Only */}
                            {handPos && (
                                <div className={`mt-1 md:mt-2 flex items-center gap-2 md:gap-3 transition-opacity duration-300 ${handPos.force > 0.1 ? 'opacity-100' : 'opacity-0'}`}>
                                    <div className="flex gap-1 relative">
                                        <div 
                                            className="w-1 h-1 md:w-2 md:h-2 bg-white rounded-full transition-all duration-100"
                                            style={{ 
                                                boxShadow: `0 0 ${10 + (handPos.force * 15)}px rgba(255,255,255, ${0.5 + handPos.force * 0.5})`,
                                                transform: `scale(${1 + handPos.force * 0.5})`
                                            }} 
                                        />
                                    </div>
                                    
                                    <span className="text-[6px] md:text-[10px] uppercase text-white font-bold" style={{ opacity: 0.5 + (handPos.force * 0.5) }}>
                                        念力
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Bottom Controls - Responsive Gap & Size */}
        <div className="absolute bottom-8 md:bottom-12 left-0 right-0 flex flex-col items-center justify-end pb-4 md:pb-8">
            
            {isCameraReady && !handPos && (
                <div className="mb-6 md:mb-10 flex items-center gap-2 md:gap-3 bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 md:px-6 md:py-3 rounded-full animate-bounce scale-90 md:scale-100">
                    <Hand className="w-4 h-4 md:w-5 md:h-5 text-gray-300" />
                    <span className="text-gray-200 text-xs md:text-sm font-medium tracking-wide">抬起手掌 · 掌控时间</span>
                </div>
            )}

            {isCameraReady && handPos && (
                <div className="flex gap-4 md:gap-8">
                    {/* Reverse */}
                    <div className={`flex flex-col items-center gap-1 md:gap-2 transition-all duration-500 ${rainState === RainState.RISING ? 'opacity-100 scale-110' : 'opacity-30 grayscale scale-90'}`}>
                        <div className={`p-3 md:p-4 rounded-full transition-all duration-300 ${rainState === RainState.RISING ? 'bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-transparent border border-white/10'}`}>
                             <RotateCcw className={`w-6 h-6 md:w-8 md:h-8 text-white ${rainState === RainState.RISING ? 'animate-spin-slow-reverse' : ''}`} />
                        </div>
                        <span className="text-[10px] md:text-xs font-bold tracking-[0.2em] text-gray-400 uppercase">倒流</span>
                    </div>
                    
                    {/* Freeze */}
                    <div className={`flex flex-col items-center gap-1 md:gap-2 transition-all duration-500 ${rainState === RainState.PAUSED ? 'opacity-100 scale-110' : 'opacity-30 grayscale scale-90'}`}>
                         <div className={`p-3 md:p-4 rounded-full transition-all duration-300 ${rainState === RainState.PAUSED ? 'bg-white/20 shadow-[0_0_30px_white]' : 'bg-transparent border border-white/10'}`}>
                             <div className="w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
                                <div className="w-2.5 h-2.5 md:w-3 md:h-3 bg-white rounded-sm shadow-[0_0_10px_white]" />
                             </div>
                        </div>
                        <span className="text-[10px] md:text-xs font-bold tracking-[0.2em] text-white uppercase">静止</span>
                    </div>

                    {/* Fall */}
                    <div className={`flex flex-col items-center gap-1 md:gap-2 transition-all duration-500 ${rainState === RainState.FALLING ? 'opacity-100 scale-110' : 'opacity-30 grayscale scale-90'}`}>
                        <div className={`p-3 md:p-4 rounded-full transition-all duration-300 ${rainState === RainState.FALLING ? 'bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-transparent border border-white/10'}`}>
                            <CloudRain className={`w-6 h-6 md:w-8 md:h-8 text-white ${rainState === RainState.FALLING ? 'animate-bounce-slight' : ''}`} />
                        </div>
                        <span className="text-[10px] md:text-xs font-bold tracking-[0.2em] text-gray-400 uppercase">下落</span>
                    </div>
                </div>
            )}
        </div>

        {/* Vertical Slider Visualizer - Hidden on mobile to avoid clutter */}
        {isCameraReady && (
            <div className="absolute right-6 top-1/3 bottom-1/3 w-0.5 bg-gradient-to-b from-transparent via-white/10 to-transparent hidden lg:block backdrop-blur-sm">
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-0.5 bg-white/20" />
                 
                 <div 
                    className="absolute w-6 h-6 -left-2.5 -mt-3 border border-white/80 rounded-full bg-black/50 shadow-[0_0_15px_rgba(255,255,255,0.5)] transition-all duration-75 ease-linear backdrop-blur-sm"
                    style={{ 
                        top: handPos ? `${handPos.y * 100}%` : '50%', 
                        opacity: handPos ? 1 : 0,
                    }}
                 />
            </div>
        )}

      </div>
    </div>
  );
};

export default App;