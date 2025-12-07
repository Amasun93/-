import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandPosition } from '../types';

interface HandTrackerProps {
  onHandMove: (position: HandPosition | null) => void;
  onCameraReady: (ready: boolean) => void;
  onLoadStatus: (status: string) => void;
  onLoadProgress: (progress: number) => void;
  onError: (error: string) => void;
}

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [9, 10], [10, 11], [11, 12], // Middle (0-9 connection handled in palm)
  [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 5], [5, 9], [9, 13], [13, 17] // Palm
];

const HandTracker: React.FC<HandTrackerProps> = ({ 
  onHandMove, 
  onCameraReady, 
  onLoadStatus,
  onLoadProgress,
  onError
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isVideoReadyRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initializeSystem = async () => {
      try {
        onLoadStatus("正在激活视觉神经...");
        onLoadProgress(5);

        // --- Parallel Execution Start ---
        // We start both the Camera stream and the Model downloading at the same time
        // to minimize waiting time.

        // Task A: Initialize Vision AI
        const aiTask = async () => {
             const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
             );
             if (!mounted) return null;
             
             onLoadStatus("下载手势识别模型 (首次运行需下载)...");
             onLoadProgress(20);

             const landmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                  modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                  delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 1
            });
            return landmarker;
        };

        // Task B: Initialize Camera
        const cameraTask = async () => {
            onLoadStatus("正在请求光学传感器权限...");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: "user" 
                }
            });
            return stream;
        };

        // Wait for both tasks
        const [landmarker, stream] = await Promise.all([aiTask(), cameraTask()]);

        if (!mounted || !landmarker || !stream) {
            landmarker?.close();
            stream?.getTracks().forEach(track => track.stop());
            return;
        }

        // Setup AI
        landmarkerRef.current = landmarker;

        // Setup Camera
        const video = videoRef.current;
        if (video) {
            video.srcObject = stream;
            
            // Wait for video data
            onLoadStatus("正在校准影像流...");
            onLoadProgress(80);

            const onVideoReady = () => {
                if (!isVideoReadyRef.current && video.videoWidth > 0) {
                    video.play().catch(e => console.error("Auto-play failed", e));
                    onLoadProgress(100);
                    
                    setTimeout(() => {
                        if (mounted) {
                            onLoadStatus("系统就绪");
                            onCameraReady(true);
                        }
                    }, 500);
                    
                    isVideoReadyRef.current = true;
                    startLoop();
                }
            };

            video.onloadedmetadata = onVideoReady;
            video.oncanplay = onVideoReady;
        }

      } catch (err) {
        console.error("Initialization failed:", err);
        onError("初始化失败：请允许摄像头权限或检查网络。");
        onLoadStatus("系统错误");
      }
    };

    initializeSystem();

    return () => {
      mounted = false;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calculateForce = (landmarks: {x: number, y: number, z: number}[]) => {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    
    // Scale is essentially the size of the palm
    const scale = Math.sqrt(
      Math.pow(wrist.x - middleMcp.x, 2) + 
      Math.pow(wrist.y - middleMcp.y, 2)
    );

    const tips = [4, 8, 12, 16, 20];
    let totalTipDist = 0;
    tips.forEach(idx => {
      const tip = landmarks[idx];
      totalTipDist += Math.sqrt(
        Math.pow(wrist.x - tip.x, 2) + 
        Math.pow(wrist.y - tip.y, 2)
      );
    });
    const avgTipDist = totalTipDist / 5;
    
    // Ratio of "Tip Distance" to "Palm Size"
    // Open Hand: Ratio is large (approx 1.5 - 2.0)
    // Closed Fist: Ratio is small (approx 0.8 - 1.2)
    const ratio = avgTipDist / scale;

    // Mapping:
    // 1.5 or greater -> 0.0 force (Open)
    // 0.9 or smaller -> 1.0 force (Tight Fist)
    
    const OPEN_THRESHOLD = 1.5;
    const CLOSED_THRESHOLD = 0.9;
    
    // Invert because smaller ratio = higher force
    let force = (OPEN_THRESHOLD - ratio) / (OPEN_THRESHOLD - CLOSED_THRESHOLD);
    
    // Clamp between 0 and 1
    force = Math.max(0, Math.min(1, force));

    return force; 
  };

  const startLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    
    if (!video || !canvas || !landmarker) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pulseAngle = 0;

    const render = () => {
        if (!isVideoReadyRef.current || video.readyState < 2) {
             animationFrameRef.current = requestAnimationFrame(render);
             return;
        }

        if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        const cW = canvas.width;
        const cH = canvas.height;
        const vW = video.videoWidth;
        const vH = video.videoHeight;

        const scale = Math.max(cW / vW, cH / vH);
        const drawnW = vW * scale;
        const drawnH = vH * scale;
        const offsetX = (cW - drawnW) / 2;
        const offsetY = (cH - drawnH) / 2;

        ctx.clearRect(0, 0, cW, cH);
        
        // Draw Video (Standard)
        ctx.drawImage(video, offsetX, offsetY, drawnW, drawnH);

        // Dark Noir Mask (Slightly transparent to see environment)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; 
        ctx.fillRect(0, 0, cW, cH);

        let startTimeMs = performance.now();
        const result = landmarker.detectForVideo(video, startTimeMs);

        if (result.landmarks && result.landmarks.length > 0) {
            const landmarks = result.landmarks[0];
            
            const toScreen = (pt: {x: number, y: number}) => ({
                x: offsetX + pt.x * drawnW,
                y: offsetY + pt.y * drawnH
            });

            // Calculate Force (Analog)
            const force = calculateForce(landmarks);

            const wrist = landmarks[0];
            const middle = landmarks[9];
            
            // Calculate screen coordinates for drawing
            const center = toScreen({
                x: (wrist.x + middle.x) / 2,
                y: (wrist.y + middle.y) / 2
            });

            // Visual Effects for Force (Scale with intensity)
            // Only show effect if force is significant
            if (force > 0.1) {
                pulseAngle += (0.1 + (force * 0.2)); // Spin faster with force
                ctx.beginPath();
                
                // Radius pulses with force
                const baseRadius = 30 + (force * 20); 
                const pulse = Math.sin(pulseAngle * 2) * (5 * force);
                const radius = baseRadius + pulse;
                
                ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
                ctx.lineWidth = 2 + (force * 3); // Thicker line with force
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + (force * 0.6)})`; // Brighter
                ctx.stroke();

                // Inner glow for black hole - darker center
                ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + (force * 0.5)})`;
                ctx.fill();
            }

            // Skeleton
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.shadowColor = 'white';
            ctx.shadowBlur = 10;

            ctx.beginPath();
            for (const [start, end] of CONNECTIONS) {
                const p1 = toScreen(landmarks[start]);
                const p2 = toScreen(landmarks[end]);
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
            ctx.stroke();

            // Joints
            ctx.fillStyle = '#ffffff'; 
            ctx.shadowBlur = 5;
            for (const point of landmarks) {
                const p = toScreen(point);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
                ctx.fill();
            }

            // Output logic
            const rawAvgX = (wrist.x + middle.x) / 2;
            const avgY = (wrist.y + middle.y) / 2;
            
            const physicsX = 1.0 - rawAvgX;

            onHandMove({ x: physicsX, y: avgY, force: force });

        } else {
            onHandMove(null);
        }

        animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
  };

  return (
    <>
        <video 
            ref={videoRef}
            className="hidden"
            playsInline
            muted
            autoPlay
        />
        <canvas 
            ref={canvasRef}
            className="fixed inset-0 w-full h-full z-0 object-cover"
            style={{ transform: 'scaleX(-1)' }}
        />
    </>
  );
};

export default HandTracker;