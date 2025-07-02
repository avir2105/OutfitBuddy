import { Base64 } from 'js-base64';
import { TranscriptionService } from './transcriptionService';
import { pcmToWav } from '../utils/audioUtils';

const MODEL = "models/gemini-2.0-flash-exp";
const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
const HOST = "generativelanguage.googleapis.com";
const WS_URL = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

export class GeminiWebSocket {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private isSetupComplete: boolean = false;
  private onMessageCallback: ((text: string) => void) | null = null;
  private onSetupCompleteCallback: (() => void) | null = null;
  private audioContext: AudioContext | null = null;
  
  // Audio queue management
  private audioQueue: Float32Array[] = [];
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlayingResponse: boolean = false;
  private onPlayingStateChange: ((isPlaying: boolean) => void) | null = null;
  private onAudioLevelChange: ((level: number) => void) | null = null;
  private onTranscriptionCallback: ((text: string) => void) | null = null;
  private transcriptionService: TranscriptionService;
  private accumulatedPcmData: string[] = [];
  
  // New properties for system prompt and voice
  private systemPrompt: string;
  private voiceName: string;

  constructor(
    onMessage: (text: string) => void, 
    onSetupComplete: () => void,
    onPlayingStateChange: (isPlaying: boolean) => void,
    onAudioLevelChange: (level: number) => void,
    onTranscription: (text: string) => void,
    systemPrompt: string = `You are Drapo — Avinash's stylish, friendly, and supportive outfit buddy. You chat with Avinash through video and help him choose the best outfits for different occasions. You act like his fashion-savvy best friend: warm, casual, honest, fun, and always focused on boosting his confidence.

# Key Behaviors:
- Speak directly to Avinash like a close buddy. Use casual, lively, and relatable language.
- If the outfit looks cool, stylish, or interesting, give genuine, specific compliments:
    - "Okay, I see you! That's a sharp combo."
    - "Nice! That color really pops on you."
    - "Damn, you’re pulling this off like a pro today!"
- If Avinash is wearing pajamas, home clothes, or very casual outfits, playfully acknowledge it:
    - "Looks like you're chilling at home today, huh?"
    - "Comfy mode activated! Respect! What’s the plan — stepping out or just vibing at home?"
    - "You in your ‘don’t bother me’ outfit, huh? Love that energy."
- Immediately follow with natural, smart questions to drive the conversation:
    - "What's the occasion you're dressing for?"
    - "Daytime or nighttime event?"
    - "Indoor or outdoor vibe?"
    - "You going for something chill or want to make a statement today?"
    - "Comfort first, or you feeling bold today?"
- If the outfit doesn't match the occasion, kindly and directly say it:
    - "Honestly, this feels a little too casual for that formal dinner. Wanna explore something sharper?"
    - "Hmm, this fit might not hit for a party vibe. Let’s level it up, what do you say?"
- Keep the chat flowing like real conversation — no robotic or repetitive summaries.
- Don’t repeat Avinash’s exact words — focus on natural responses.
- Never over-sugarcoat. Be real, but keep it light, playful, and positive.
- Occasionally throw in style tips:
    - "You know, adding a denim jacket here would really take this up a notch."
    - "Those sneakers would totally complete this fit."

# Extra Behaviors for Great UX:
- Suggest matching accessories, shoes, or jackets when relevant.
- Offer options: “Wanna stick to this vibe, or try something totally different?”
- If Avinash is unsure, encourage him: "Bro, you got this. Let’s try a couple more looks till it clicks."
- If the outfit is solid: "No cap, this fit is ready to go. Wanna lock it in or check one more?"
- Occasionally drop fun closing lines:
    - "You’re stepping out in style today, my man! Catch you next time!"
    - "Legendary fit. Go own the day, Avinash!"

# Overall Vibe:
- Best friend energy: supportive, playful, stylish.
- Fast, fun, focused — no robotic pauses, no awkward phrasing.
- Real talk, real confidence boosts. Never judge, always guide.
`,
    voiceName: string = "Charon"
  ) {
    this.onMessageCallback = onMessage;
    this.onSetupCompleteCallback = onSetupComplete;
    this.onPlayingStateChange = onPlayingStateChange;
    this.onAudioLevelChange = onAudioLevelChange;
    this.onTranscriptionCallback = onTranscription;
    this.systemPrompt = systemPrompt;
    this.voiceName = voiceName;
    // Create AudioContext for playback
    this.audioContext = new AudioContext({
      sampleRate: 24000  // Match the response audio rate
    });
    this.transcriptionService = new TranscriptionService();
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.sendInitialSetup();
    };

    this.ws.onmessage = async (event) => {
      try {
        let messageText: string;
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          messageText = new TextDecoder('utf-8').decode(bytes);
        } else {
          messageText = event.data;
        }
        
        await this.handleMessage(messageText);
      } catch (error) {
        console.error("[WebSocket] Error processing message:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      
      // Only attempt to reconnect if we haven't explicitly called disconnect
      if (!event.wasClean && this.isSetupComplete) {
        setTimeout(() => this.connect(), 1000);
      }
    };
  }

  private sendInitialSetup() {
    const setupMessage = {
      setup: {
        model: MODEL,
        generation_config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.voiceName
              }
            }
          }
        },
        system_instruction: {
          parts: [{ text: this.systemPrompt }],
          role: "user"
        }
      }
    };
    this.ws?.send(JSON.stringify(setupMessage));
  }

  sendMediaChunk(b64Data: string, mimeType: string) {
    if (!this.isConnected || !this.ws || !this.isSetupComplete) return;

    const message = {
      realtime_input: {
        media_chunks: [{
          mime_type: mimeType === "audio/pcm" ? "audio/pcm" : mimeType,
          data: b64Data
        }]
      }
    };

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error("[WebSocket] Error sending media chunk:", error);
    }
  }

  private async playAudioResponse(base64Data: string) {
    if (!this.audioContext) return;

    try {
      // Decode base64 to bytes
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert to Int16Array (PCM format)
      const pcmData = new Int16Array(bytes.buffer);
      
      // Convert to float32 for Web Audio API
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }

      // Add to queue and start playing if not already playing
      this.audioQueue.push(float32Data);
      this.playNextInQueue();
    } catch (error) {
      console.error("[WebSocket] Error processing audio:", error);
    }
  }

  private async playNextInQueue() {
    if (!this.audioContext || this.isPlaying || this.audioQueue.length === 0) return;

    try {
      this.isPlaying = true;
      this.isPlayingResponse = true;
      this.onPlayingStateChange?.(true);
      const float32Data = this.audioQueue.shift()!;

      // Calculate audio level
      let sum = 0;
      for (let i = 0; i < float32Data.length; i++) {
        sum += Math.abs(float32Data[i]);
      }
      const level = Math.min((sum / float32Data.length) * 100 * 5, 100);
      this.onAudioLevelChange?.(level);

      const audioBuffer = this.audioContext.createBuffer(
        1,
        float32Data.length,
        24000
      );
      audioBuffer.getChannelData(0).set(float32Data);

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.audioContext.destination);
      
      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        if (this.audioQueue.length === 0) {
          this.isPlayingResponse = false;
          this.onPlayingStateChange?.(false);
        }
        this.playNextInQueue();
      };

      this.currentSource.start();
    } catch (error) {
      console.error("[WebSocket] Error playing audio:", error);
      this.isPlaying = false;
      this.isPlayingResponse = false;
      this.onPlayingStateChange?.(false);
      this.currentSource = null;
      this.playNextInQueue();
    }
  }

  private stopCurrentAudio() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.isPlayingResponse = false;
    this.onPlayingStateChange?.(false);
    this.audioQueue = []; // Clear queue
  }

  private async handleMessage(message: string) {
    try {
      const messageData = JSON.parse(message);
      
      if (messageData.setupComplete) {
        this.isSetupComplete = true;
        this.onSetupCompleteCallback?.();
        return;
      }

      // Handle audio data
      if (messageData.serverContent?.modelTurn?.parts) {
        const parts = messageData.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.inlineData?.mimeType === "audio/pcm;rate=24000") {
            this.accumulatedPcmData.push(part.inlineData.data);
            this.playAudioResponse(part.inlineData.data);
          }
        }
      }

      // Handle turn completion separately
      if (messageData.serverContent?.turnComplete === true) {
        if (this.accumulatedPcmData.length > 0) {
          try {
            const fullPcmData = this.accumulatedPcmData.join('');
            const wavData = await pcmToWav(fullPcmData, 24000);
            
            const transcription = await this.transcriptionService.transcribeAudio(
              wavData,
              "audio/wav"
            );
            console.log("[Transcription]:", transcription);

            this.onTranscriptionCallback?.(transcription);
            this.accumulatedPcmData = []; // Clear accumulated data
          } catch (error) {
            console.error("[WebSocket] Transcription error:", error);
          }
        }
      }
    } catch (error) {
      console.error("[WebSocket] Error parsing message:", error);
    }
  }

  disconnect() {
    this.isSetupComplete = false;
    if (this.ws) {
      this.ws.close(1000, "Intentional disconnect");
      this.ws = null;
    }
    this.isConnected = false;
    this.accumulatedPcmData = [];
  }
}