import React, { useEffect, useRef } from 'react';
import { HandPosition } from '../types';

interface RainCanvasProps {
  speedMultiplier: number;
  handPosition: HandPosition | null;
}

interface Drop {
  x: number;
  y: number;
  vx: number; // Velocity X
  vy: number; // Velocity Y
  z: number; // Depth 0 to 1
  baseSpeedRatio: number; // Speed as a ratio of screen height
  opacity: number;
  size: number; // Thickness
  life: number; // For respawn delays
}

const RainCanvas: React.FC<RainCanvasProps> = ({ speedMultiplier, handPosition }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const dropsRef = useRef<Drop[]>([]);
  const widthRef = useRef(0);
  const heightRef = useRef(0);
  const lastTimeRef = useRef<number>(0);

  // Creates a drop with relative speed instead of absolute pixels
  const createDrop = (width: number, height: number, startY: number = -100): Drop => {
    return {
      x: Math.random() * width,
      y: startY === -100 ? Math.random() * height : startY,
      vx: 0,
      vy: 0,
      z: Math.random(), // 0 = far, 1 = near
      // Base speed is now 1.0x to 1.8x of "Screen Height per second"
      baseSpeedRatio: (Math.random() * 0.8 + 1.0), 
      opacity: Math.random() * 0.5 + 0.2,
      size: Math.random() * 1.5 + 0.5,
      life: 1.0
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      widthRef.current = window.innerWidth;
      heightRef.current = window.innerHeight;
      
      // Dynamic Quantity Optimization
      const area = window.innerWidth * window.innerHeight;
      // Increase density slightly for better gathering visuals
      const targetCount = Math.floor(area / 800); 

      if (dropsRef.current.length < targetCount) {
          const extra = targetCount - dropsRef.current.length;
          for(let i=0; i<extra; i++) {
              dropsRef.current.push(createDrop(canvas.width, canvas.height, Math.random() * canvas.height));
          }
      } else if (dropsRef.current.length > targetCount) {
          dropsRef.current = dropsRef.current.slice(0, targetCount);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();

    // Reset last time
    lastTimeRef.current = performance.now();

    const animate = () => {
      if (!ctx || !canvas) return;
      
      const currentTime = performance.now();
      const deltaTime = Math.min((currentTime - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = currentTime;

      const timeScale = deltaTime / 0.01667; // Normalized to 60FPS

      ctx.clearRect(0, 0, widthRef.current, heightRef.current);

      const w = widthRef.current;
      const h = heightRef.current;
      
      const screenScale = h / 1000; 

      ctx.lineCap = 'round';

      const handX = handPosition ? handPosition.x * w : -1000;
      const handY = handPosition ? handPosition.y * h : -1000;
      const force = handPosition ? handPosition.force : 0; 
      
      // Threshold to start any effect
      const isGathering = force > 0.05;
      
      const heightBaseSpeed = h * 0.015;

      // === SPIRAL VECTOR FIELD PARAMETERS ===
      
      // 1. Inward Bias (Suction vs Rotation)
      // Low Force (0.1): 0.25 (25% Suction, 75% Rotation) -> Increased base suction slightly to break donuts
      // High Force (1.0): 0.80 (80% Suction, 20% Rotation) -> Strong suction
      let baseInwardBias = 0.25 + (force * 0.55);

      // 2. Max Speed (The Regulator)
      // Low Force: Slow movement (Elegant Tai Chi)
      // High Force: Very Fast movement (Intense Black Hole)
      const maxSpeedLimit = (3 + (force * 70)) * screenScale;

      // 3. Dynamic Kill Radius
      // Low Force: Large radius (~70px). Rain gets "absorbed" easily.
      // High Force: Tiny radius (~15px). Rain must hit the singularity.
      const dynamicKillRadius = (70 * screenScale) - (force * 55 * screenScale);

      dropsRef.current.forEach((drop) => {
        const depthFactor = (drop.z * 0.5) + 0.5; 
        
        // --- 1. Vertical Gravity (Time Control) ---
        const pixelBaseSpeed = heightBaseSpeed * drop.baseSpeedRatio;
        const targetVy = pixelBaseSpeed * depthFactor * speedMultiplier;
        
        // Transition smoothness
        const lerpFactor = 1 - Math.pow(0.9, timeScale);
        
        if (isGathering) {
            // Give up vertical control easily to the hand
            drop.vy += (targetVy - drop.vy) * (lerpFactor * 0.02); 
        } else {
            drop.vy += (targetVy - drop.vy) * lerpFactor;
        }

        let distortion = 1.0;
        let safeDist = 9999;

        // --- 2. Vortex Physics (Spiral Steering) ---
        if (isGathering) { 
            const dx = handX - drop.x;
            const dy = handY - drop.y;
            const distSq = dx*dx + dy*dy;
            safeDist = Math.max(1, Math.sqrt(distSq)); 

            // === CONSUME & RESPAWN ===
            if (safeDist < dynamicKillRadius) {
                // Respawn Logic
                const side = Math.floor(Math.random() * 4);
                // Add randomness to spawn position to desynchronize waves
                const offset = (Math.random() - 0.5) * 100;

                if (side === 0) { // Top
                    drop.x = (Math.random() * w) + offset;
                    drop.y = -20;
                } else if (side === 1) { // Right
                    drop.x = w + 20;
                    drop.y = (Math.random() * h) + offset;
                } else if (side === 2) { // Bottom
                    drop.x = (Math.random() * w) + offset;
                    drop.y = h + 20;
                } else { // Left
                    drop.x = -20;
                    drop.y = (Math.random() * h) + offset;
                }

                // Initial Velocity: Push gently towards center
                // Add more randomness to initial speed to prevent "pulsing"
                const startAngle = Math.atan2(handY - drop.y, handX - drop.x);
                const angleVar = (Math.random() - 0.5) * 0.8; 
                const initSpeed = (2 + Math.random() * 5) * screenScale; 
                
                drop.vx = Math.cos(startAngle + angleVar) * initSpeed;
                drop.vy = Math.sin(startAngle + angleVar) * initSpeed;
                
                drop.opacity = Math.random() * 0.5 + 0.4;
                drop.size = Math.random() * 1.5 + 0.5;
                return; // Done processing this frame
            }

            // === THE SPIRAL STEERING ===
            
            // Normalized vector to center
            const nx = dx / safeDist; 
            const ny = dy / safeDist; 

            // Tangent vector (Rotation CCW)
            const tx = -ny;
            const ty = nx;

            // DYNAMIC INWARD BIAS (SPIRAL DECAY)
            // As particle gets closer, we force it to become more radial (suction)
            // This prevents the "Donut" effect where particles orbit forever at a fixed distance.
            let effectiveInwardBias = baseInwardBias;
            
            // Influence zone: 150px
            if (safeDist < 150 * screenScale) {
                // 0.0 (at 150px) to 1.0 (at 0px)
                const proximity = 1 - (safeDist / (150 * screenScale));
                // Blend current bias towards 1.0 (pure suction) based on proximity
                // This ensures the spiral tightens and inevitably crashes into the center
                effectiveInwardBias = baseInwardBias + ((1 - baseInwardBias) * (proximity * 0.7));
            }

            // Calculate "Ideal Velocity" vector
            // Blend Radial (Suction) and Tangential (Rotation)
            const spiralVx = (tx * (1 - effectiveInwardBias)) + (nx * effectiveInwardBias);
            const spiralVy = (ty * (1 - effectiveInwardBias)) + (ny * effectiveInwardBias);

            // Acceleration Strength
            // Smooth acceleration based on force
            const steerStrength = (0.5 + (force * 2.0)) * screenScale; 

            // Apply Steering Force
            // F = m*a, but here we just add to velocity
            drop.vx += spiralVx * steerStrength * timeScale;
            drop.vy += spiralVy * steerStrength * timeScale;

            // === DRAG & CLAMP ===
            
            // Apply Drag (Air Resistance)
            const friction = Math.pow(0.92, timeScale); 
            drop.vx *= friction;
            drop.vy *= friction;

            // Hard Speed Clamp (The Regulator)
            const currentSpeed = Math.sqrt(drop.vx*drop.vx + drop.vy*drop.vy);
            if (currentSpeed > maxSpeedLimit) {
                const ratio = maxSpeedLimit / currentSpeed;
                drop.vx *= ratio;
                drop.vy *= ratio;
            }

            // Visual Distortion
            // Stretch particles as they get sucked in
            distortion = 1.0 + (force * 3.0 * (50/Math.max(50, safeDist)));
        }

        // Apply Friction (Standard rain non-gathering)
        if (!isGathering) {
            const friction = Math.pow(0.98, timeScale);
            drop.vx *= friction;
        }

        // Update Position
        drop.x += drop.vx * timeScale;
        drop.y += drop.vy * timeScale;

        // Screen Wrapping (Only when NOT gathering)
        if (!isGathering) {
             if (drop.vy >= 0) {
                if (drop.y > h) {
                    drop.y = -20;
                    drop.x = Math.random() * w;
                    drop.vx = 0; 
                    drop.vy = pixelBaseSpeed * depthFactor * speedMultiplier;
                }
            } else {
                if (drop.y < -20) {
                    drop.y = h;
                    drop.x = Math.random() * w;
                    drop.vx = 0;
                    drop.vy = pixelBaseSpeed * depthFactor * speedMultiplier;
                }
            }
            if (drop.x > w) drop.x = 0;
            if (drop.x < 0) drop.x = w;
        }

        // === DRAWING ===
        ctx.beginPath();
        
        const displayOpacity = Math.min(1, (drop.opacity * depthFactor));
        ctx.strokeStyle = `rgba(255, 255, 255, ${displayOpacity})`;
        
        const speedSq = drop.vx*drop.vx + drop.vy*drop.vy;
        const speed = Math.sqrt(speedSq);

        // Thin out fast moving particles slightly
        ctx.lineWidth = Math.max(0.5, drop.size * (1 - speed * (0.005 / screenScale))); 

        // Trail Logic
        let maxTrailLength = 40 * screenScale; 
        if (isGathering) {
            // Force affects max trail length
            maxTrailLength = (15 + (force * 50)) * screenScale;
            
            // Shorten trails very close to center to prevent "Hedgehog" look
            if (safeDist < 60 * screenScale) {
                maxTrailLength *= (safeDist / (60 * screenScale));
            }
        }

        const rawTrailLength = speed * 1.5 * distortion;
        const trailLength = Math.min(maxTrailLength, rawTrailLength);

        if (trailLength < 2) {
             ctx.moveTo(drop.x, drop.y);
             ctx.lineTo(drop.x, drop.y + 1.5); 
        } else {
             const angle = Math.atan2(drop.vy, drop.vx);
             const tailX = drop.x - Math.cos(angle) * trailLength;
             const tailY = drop.y - Math.sin(angle) * trailLength;
             
             ctx.moveTo(drop.x, drop.y);
             ctx.lineTo(tailX, tailY);
        }
        
        ctx.stroke();
      });

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [speedMultiplier, handPosition]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-10"
      style={{ background: 'transparent' }}
    />
  );
};

export default RainCanvas;