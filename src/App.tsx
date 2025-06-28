import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Play, Pause, Volume2, Heart, Dog, MessageCircle, History, Trash2 } from 'lucide-react';

interface SoundRecord {
  id: string;
  timestamp: Date;
  duration: number;
  translation: string;
  category: 'happy' | 'alert' | 'playful' | 'concerned' | 'excited' | 'sleepy';
  audioBlob?: Blob;
}

const dogTranslations = {
  happy: [
    "I'm so happy to see you!",
    "This is the best day ever!",
    "You're my favorite human!",
    "Let's play together!",
    "I love you so much!"
  ],
  alert: [
    "Someone's at the door!",
    "I'm protecting our home!",
    "Did you hear that sound?",
    "Stay alert, human!",
    "I'm on guard duty!"
  ],
  playful: [
    "Let's play fetch!",
    "Come chase me!",
    "I want to run around!",
    "Playtime, playtime!",
    "Let's have some fun!"
  ],
  concerned: [
    "Are you okay?",
    "I'm worried about something",
    "Something doesn't feel right",
    "I need your attention",
    "Please help me understand"
  ],
  excited: [
    "Walk time? WALK TIME?!",
    "Is that food I smell?",
    "Adventure awaits!",
    "I can barely contain myself!",
    "This is AMAZING!"
  ],
  sleepy: [
    "I'm getting tired...",
    "Nap time sounds good",
    "Just five more minutes",
    "I need my beauty sleep",
    "Zzz... almost there..."
  ]
};

const categoryColors = {
  happy: 'bg-yellow-100 border-yellow-300 text-yellow-800',
  alert: 'bg-red-100 border-red-300 text-red-800',
  playful: 'bg-green-100 border-green-300 text-green-800',
  concerned: 'bg-blue-100 border-blue-300 text-blue-800',
  excited: 'bg-purple-100 border-purple-300 text-purple-800',
  sleepy: 'bg-gray-100 border-gray-300 text-gray-800'
};

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSounds, setRecordedSounds] = useState<SoundRecord[]>([]);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [microphoneError, setMicrophoneError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const dataArray = useRef<Uint8Array | null>(null);
  const animationFrame = useRef<number | null>(null);
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioChunks = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Check microphone permission on component mount
    checkMicrophonePermission();
    
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContext.current && audioContext.current.state !== 'closed') {
      audioContext.current.close();
    }
  };

  const checkMicrophonePermission = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setHasPermission(result.state === 'granted');
      
      result.onchange = () => {
        setHasPermission(result.state === 'granted');
      };
    } catch (error) {
      console.log('Permission API not supported, will request on first use');
      setHasPermission(null);
    }
  };

  const requestMicrophoneAccess = async (): Promise<MediaStream | null> => {
    try {
      setMicrophoneError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      setHasPermission(true);
      return stream;
    } catch (error) {
      console.error('Error accessing microphone:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setMicrophoneError('Microphone access denied. Please allow microphone access and try again.');
        } else if (error.name === 'NotFoundError') {
          setMicrophoneError('No microphone found. Please connect a microphone and try again.');
        } else if (error.name === 'NotReadableError') {
          setMicrophoneError('Microphone is being used by another application. Please close other apps and try again.');
        } else {
          setMicrophoneError('Unable to access microphone. Please check your browser settings.');
        }
      } else {
        setMicrophoneError('An unknown error occurred while accessing the microphone.');
      }
      
      setHasPermission(false);
      return null;
    }
  };

  const startRecording = async () => {
    try {
      const stream = await requestMicrophoneAccess();
      if (!stream) return;

      streamRef.current = stream;
      audioChunks.current = [];
      
      // Create audio context for visualization
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Handle suspended audio context (required by some browsers)
      if (audioContext.current.state === 'suspended') {
        await audioContext.current.resume();
      }
      
      analyser.current = audioContext.current.createAnalyser();
      const source = audioContext.current.createMediaStreamSource(stream);
      source.connect(analyser.current);
      
      analyser.current.fftSize = 256;
      const bufferLength = analyser.current.frequencyBinCount;
      dataArray.current = new Uint8Array(bufferLength);
      
      // Create MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      mediaRecorder.current = new MediaRecorder(stream, { mimeType });
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };
      
      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: mimeType });
        translateSound(audioBlob);
        cleanup();
      };
      
      mediaRecorder.current.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setMicrophoneError('Recording failed. Please try again.');
        stopRecording();
      };
      
      mediaRecorder.current.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingDuration(0);
      setMicrophoneError(null);
      
      recordingInterval.current = setInterval(() => {
        setRecordingDuration(prev => prev + 0.1);
      }, 100);
      
      drawWaveform();
    } catch (error) {
      console.error('Error starting recording:', error);
      setMicrophoneError('Failed to start recording. Please try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
    }
    
    setIsRecording(false);
    setIsTranslating(true);
    
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
    }
    
    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
    }
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !analyser.current || !dataArray.current || !isRecording) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    analyser.current.getByteFrequencyData(dataArray.current);
    
    ctx.fillStyle = '#F7F3F0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / dataArray.current.length) * 2.5;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < dataArray.current.length; i++) {
      barHeight = (dataArray.current[i] / 255) * canvas.height * 0.8;
      
      const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
      gradient.addColorStop(0, '#D4A574');
      gradient.addColorStop(1, '#F4A460');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      
      x += barWidth + 1;
    }
    
    animationFrame.current = requestAnimationFrame(drawWaveform);
  };

  const translateSound = async (audioBlob: Blob) => {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const categories: (keyof typeof dogTranslations)[] = ['happy', 'alert', 'playful', 'concerned', 'excited', 'sleepy'];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const translations = dogTranslations[randomCategory];
    const randomTranslation = translations[Math.floor(Math.random() * translations.length)];
    
    const newRecord: SoundRecord = {
      id: Date.now().toString(),
      timestamp: new Date(),
      duration: recordingDuration,
      translation: randomTranslation,
      category: randomCategory,
      audioBlob
    };
    
    setRecordedSounds(prev => [newRecord, ...prev]);
    setIsTranslating(false);
    setRecordingDuration(0);
  };

  const playSound = async (record: SoundRecord) => {
    if (!record.audioBlob) return;
    
    if (currentlyPlaying === record.id) {
      setCurrentlyPlaying(null);
      return;
    }
    
    try {
      const audio = new Audio(URL.createObjectURL(record.audioBlob));
      setCurrentlyPlaying(record.id);
      
      audio.onended = () => {
        setCurrentlyPlaying(null);
        URL.revokeObjectURL(audio.src);
      };
      
      audio.onerror = () => {
        setCurrentlyPlaying(null);
        URL.revokeObjectURL(audio.src);
      };
      
      await audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      setCurrentlyPlaying(null);
    }
  };

  const clearHistory = () => {
    setRecordedSounds([]);
  };

  const formatTime = (seconds: number) => {
    return `${seconds.toFixed(1)}s`;
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-orange-200/50 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center space-x-3">
            <div className="bg-gradient-to-r from-orange-400 to-amber-500 p-3 rounded-full">
              <Dog className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                Woof Translator
              </h1>
              <p className="text-orange-600/70 font-medium">Understanding your furry friend</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Recording Section */}
        <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-orange-200/50 p-8 mb-8">
          <div className="text-center">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center justify-center space-x-2">
                <MessageCircle className="w-6 h-6 text-orange-500" />
                <span>Listen & Translate</span>
              </h2>
              <p className="text-gray-600">
                Hold the microphone button and let your dog speak their mind
              </p>
            </div>

            {/* Error Message */}
            {microphoneError && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-red-700 font-medium">{microphoneError}</p>
                <button
                  onClick={() => setMicrophoneError(null)}
                  className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Waveform Visualization */}
            {isRecording && (
              <div className="mb-6 bg-gradient-to-r from-orange-100 to-amber-100 rounded-2xl p-4">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={100}
                  className="w-full max-w-md mx-auto rounded-lg"
                />
                <p className="text-orange-700 font-semibold mt-2">
                  Recording... {formatTime(recordingDuration)}
                </p>
              </div>
            )}

            {/* Recording Button */}
            <div className="flex flex-col items-center space-y-4">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTranslating}
                className={`relative group ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600'
                } ${
                  isTranslating ? 'opacity-50 cursor-not-allowed' : ''
                } text-white p-6 rounded-full shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95`}
              >
                {isRecording ? (
                  <MicOff className="w-8 h-8" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
                
                {isRecording && (
                  <div className="absolute inset-0 rounded-full border-4 border-red-300 animate-pulse" />
                )}
              </button>
              
              <p className="text-sm font-medium text-gray-600">
                {isTranslating
                  ? 'Translating your pup\'s message...'
                  : isRecording
                  ? 'Tap to stop recording'
                  : hasPermission === false
                  ? 'Click to allow microphone access'
                  : 'Tap to start listening'
                }
              </p>
            </div>

            {isTranslating && (
              <div className="mt-6 flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                <span className="text-orange-600 font-medium">Processing woof sounds...</span>
              </div>
            )}
          </div>
        </div>

        {/* Translation History */}
        {recordedSounds.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-orange-200/50 p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-800 flex items-center space-x-2">
                <History className="w-6 h-6 text-orange-500" />
                <span>Translation History</span>
              </h3>
              <button
                onClick={clearHistory}
                className="text-red-500 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                title="Clear history"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {recordedSounds.map((record) => (
                <div
                  key={record.id}
                  className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${categoryColors[record.category]}`}>
                          {record.category.charAt(0).toUpperCase() + record.category.slice(1)}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {formatTimestamp(record.timestamp)}
                        </span>
                        <span className="text-gray-500 text-sm">
                          {formatTime(record.duration)}
                        </span>
                      </div>
                      <p className="text-gray-800 text-lg font-medium mb-2">
                        "{record.translation}"
                      </p>
                    </div>
                    <button
                      onClick={() => playSound(record)}
                      className="ml-4 p-3 bg-orange-100 hover:bg-orange-200 rounded-full transition-colors group"
                    >
                      {currentlyPlaying === record.id ? (
                        <Pause className="w-5 h-5 text-orange-600" />
                      ) : (
                        <Play className="w-5 h-5 text-orange-600" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {recordedSounds.length === 0 && !isRecording && !isTranslating && (
          <div className="text-center py-12">
            <div className="bg-white/50 rounded-full p-6 w-24 h-24 mx-auto mb-4">
              <Volume2 className="w-12 h-12 text-orange-400 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Ready to Listen</h3>
            <p className="text-gray-600">
              Start recording to hear what your dog is trying to tell you!
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white/50 border-t border-orange-200/50 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Heart className="w-5 h-5 text-red-500" />
            <span className="text-gray-600">Made with love for dog parents everywhere</span>
          </div>
          <p className="text-sm text-gray-500">
            Note: This is a fun interpretation tool. Actual dog communication is much more complex!
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;