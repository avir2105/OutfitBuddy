"use client";

import { Wifi, WifiOff, Camera, CameraOff, Mic, MicOff, Bot } from "lucide-react";

interface StatusBarProps {
  isConnected: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  isAIResponding: boolean;
}

export default function StatusBar({ 
  isConnected, 
  isCameraOn, 
  isMicOn, 
  isAIResponding 
}: StatusBarProps) {
  return (
    <div className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border/30">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Connection Status */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-success" />
              ) : (
                <WifiOff className="w-4 h-4 text-destructive" />
              )}
              <span className="text-xs font-medium">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            
            <div className="w-px h-4 bg-border"></div>
            
            <div className="flex items-center gap-2">
              {isCameraOn ? (
                <Camera className="w-4 h-4 text-success" />
              ) : (
                <CameraOff className="w-4 h-4 text-muted-foreground" />
              )}
              {isMicOn ? (
                <Mic className="w-4 h-4 text-success" />
              ) : (
                <MicOff className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* AI Status */}
          <div className="flex items-center gap-2">
            <Bot className={`w-4 h-4 ${isAIResponding ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
            <span className="text-xs font-medium">
              {isAIResponding ? 'AI Responding...' : 'AI Ready'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
