"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Sparkles } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";

interface ChatContainerProps {
  children: ReactNode;
  className?: string;
}

export default function ChatContainer({ children, className = "" }: ChatContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [children]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-br from-primary to-[hsl(var(--outfit-buddy))] rounded-lg flex items-center justify-center">
            <MessageCircle className="w-3 h-3 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground font-fredoka">Style Chat</h3>
            <p className="text-xs text-muted-foreground">Live conversation</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse"></div>
          <span className="text-xs text-success font-medium">Live</span>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea className="h-full">
          <div ref={scrollRef} className="p-4 space-y-4">
            {children}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Footer */}
      <div className="px-4 py-2 border-t border-border/30 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-pulse"></div>
          <span>AI is listening and analyzing your style...</span>
        </div>
      </div>
    </div>
  );
}
