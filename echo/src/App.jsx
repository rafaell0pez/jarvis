import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';

// Color palette for different speakers - moved outside component to be truly constant
const SPEAKER_COLORS = [
  '#3498db', // Blue
  '#e74c3c', // Red
  '#2ecc71', // Green
  '#f39c12', // Orange
  '#9b59b6', // Purple
  '#1abc9c', // Turquoise
  '#34495e', // Dark Gray
  '#e67e22', // Carrot
];

function App() {
  // Existing transcription state
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState(new Set());
  const [rawResponses, setRawResponses] = useState([]);
  const [showRawData, setShowRawData] = useState(false);
  
  // New JARVIS state
  const [personInfo, setPersonInfo] = useState(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionComplete, setRecognitionComplete] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState({
    segments: [],
    lastAnalyzed: 0
  });
  const [error, setError] = useState(null);
  const [cameraPermission, setCameraPermission] = useState('pending');
  const [capturedImage, setCapturedImage] = useState(null);
  
  // Refs
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const transcriptBoxRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const rawDataRef = useRef(null);

  // Keyword detection for "banana"
  const detectBananaKeyword = useCallback((text) => {
    const bananaRegex = /\bbanana\b/i;
    return bananaRegex.test(text);
  }, []);

  // Memoize speaker colors to prevent recalculation
  const speakerColorMap = useMemo(() => {
    const colorMap = {};
    activeSpeakers.forEach(speakerId => {
      colorMap[speakerId] = SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length];
    });
    return colorMap;
  }, [activeSpeakers]);

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to image data URL
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(imageDataUrl);
      
      return imageDataUrl;
    }
    return null;
  }, []);

  // Real face recognition API with captured image
  const getPersonInfo = useCallback(async (imageDataUrl = null) => {
    setIsRecognizing(true);
    setRecognitionComplete(false);
    setError(null);
    
    try {
      // If no image provided, capture one
      const photoData = imageDataUrl || capturePhoto();
      
      if (!photoData) {
        throw new Error('Failed to capture photo');
      }
      
      // Convert data URL to blob for API upload
      const response = await fetch(photoData);
      const blob = await response.blob();
      
      // Create form data for API request
      const formData = new FormData();
      formData.append('image', blob, 'captured-image.jpg');
      
      // Call real face recognition API
      const apiResponse = await fetch('http://localhost:8000/api/v1/automation/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_path: "app/test_data/image.webp",
          headless: false,
          wait_time: 150
        })
      });
      
      if (!apiResponse.ok) {
        throw new Error(`API request failed: ${apiResponse.status}`);
      }
      
      const apiData = await apiResponse.json();
      
      if (!apiData.success) {
        throw new Error('Face recognition failed');
      }
      
      // Create person info from API response
      const personInfo = {
        id: 'recognized_person',
        name: 'Recognized Person',
        job: 'Unknown',
        company: 'Face Recognition API',
        bio: 'Person identified through face recognition system',
        interests: ['Face Recognition', 'AI', 'Computer Vision'],
        lastMet: 'Just now',
        notes: `Found ${apiData.count} potential matches in database`,
        capturedImage: photoData, // Store the captured image
        apiResponse: apiData // Store the full API response for debugging
      };
      
      setPersonInfo(personInfo);
      setRecognitionComplete(true);
      return personInfo;
    } catch (err) {
      setError('Failed to recognize person. Please try again.');
      console.error('Face recognition error:', err);
    } finally {
      setIsRecognizing(false);
    }
  }, [capturePhoto]);

  // Cache for API responses to reduce redundant calls
  const apiCacheRef = useRef(new Map());
  
  // OpenRouter API integration with caching and optimization
  const getConversationSuggestion = useCallback(async (history) => {
    // Create a cache key based on the last 3 segments and last 2 suggestions
    const cacheKey = JSON.stringify({
      segments: history.segments.slice(-3).map(s => ({ text: s.text, speaker: s.speaker })),
      suggestions: aiSuggestions.slice(-2).map(s => s.text)
    });
    
    // Check cache first
    if (apiCacheRef.current.has(cacheKey)) {
      const cached = apiCacheRef.current.get(cacheKey);
      // Only use cache if it's less than 30 seconds old
      if (Date.now() - cached.timestamp < 30000) {
        return {
          id: `suggestion_${Date.now()}`,
          text: cached.text,
          timestamp: Date.now()
        };
      }
    }
    
    try {
      // Use a faster model for more responsive suggestions
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'JARVIS AI Agent'
        },
        body: JSON.stringify({
          model: 'x-ai/grok-4-fast',
          messages: [
            {
              role: 'system',
              content:`You are Echo, a hyper-selective co-pilot. Provide concise, actionable conversation suggestions in 1-2 sentences maximum. Focus on keeping conversations engaging and natural. Avoid generic responses. Be specific and contextual.`
            },
            {
              role: 'user',
              content: `Recent conversation: ${history.segments.slice(-3).map(s => `Speaker ${s.speaker + 1}: ${s.text}`).join('\n')}\nPerson context: ${history.personInfo ? `${history.personInfo.name}, ${history.personInfo.job}` : 'Unknown'}\n\nSuggest one specific, natural thing to say next to keep the conversation flowing.`
            }
          ],
          max_tokens: 100, // Reduced for faster responses
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid API response format');
      }
      
      const message = data.choices[0].message;
      const responseText = message.content || message.reasoning || '';
      
      // Cache the response
      apiCacheRef.current.set(cacheKey, {
        text: responseText,
        timestamp: Date.now()
      });
      
      // Clean old cache entries (keep only last 10)
      if (apiCacheRef.current.size > 10) {
        const entries = Array.from(apiCacheRef.current.entries());
        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        apiCacheRef.current = new Map(entries.slice(0, 10));
      }
      
      return {
        id: `suggestion_${Date.now()}`,
        text: responseText,
        timestamp: Date.now()
      };
    } catch (err) {
      console.error('Error getting AI suggestion:', err);
      // Don't set error for every API failure to avoid spamming the UI
      // setError('Failed to get AI suggestion. Please check your API key.');
      throw err;
    }
  }, [aiSuggestions]);

  // Auto-scroll to latest AI suggestion - Fixed to hide old suggestions
  const aiSuggestionsRef = useRef(null);
  const suggestionRefs = useRef([]);
  const latestSuggestionRef = useRef(null);
  
  useEffect(() => {
    if (aiSuggestionsRef.current && aiSuggestions.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        // Scroll to the latest suggestion
        const latestIndex = aiSuggestions.length - 1;
        if (suggestionRefs.current[latestIndex]) {
          suggestionRefs.current[latestIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'end',
            inline: 'nearest'
          });
        }
      }, 100);
    }
  }, [aiSuggestions]);

  // Auto-scroll to latest transcript segment
  useEffect(() => {
    if (transcriptBoxRef.current && transcriptSegments.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        // Scroll to the bottom of the transcript box
        transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
      }, 100);
    }
  }, [transcriptSegments]);

  // Auto-scroll to latest raw data response
  useEffect(() => {
    if (rawDataRef.current && rawResponses.length > 0 && showRawData) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        // Scroll to the bottom of the raw data container
        rawDataRef.current.scrollTop = rawDataRef.current.scrollHeight;
      }, 100);
    }
  }, [rawResponses, showRawData]);

  // Enhanced conversation analysis with more frequent updates and intelligent throttling
  const lastAnalyzedRef = useRef(Date.now());
  const lastApiCallRef = useRef(0);
  const analysisInProgressRef = useRef(false);
  
  // Debounced analysis function to prevent API spam
  const debouncedAnalysis = useCallback(async () => {
    if (analysisInProgressRef.current) return;
    
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallRef.current;
    const minApiCallInterval = 1000; // Minimum 1 second between API calls
    
    if (timeSinceLastCall < minApiCallInterval) {
      return; // Skip this analysis cycle to prevent API spam
    }
    
    if (conversationHistory.segments.length > 0) {
      try {
        analysisInProgressRef.current = true;
        setIsAnalyzing(true);
        lastApiCallRef.current = Date.now();
        
        const suggestion = await getConversationSuggestion(conversationHistory);
        setAiSuggestions(prev => {
          const newSuggestions = [...prev.slice(-4), suggestion]; // Keep only last 5 suggestions
          aiSuggestionsRef.current = newSuggestions; // Update ref for auto-scroll
          return newSuggestions;
        });
        setConversationHistory(prev => ({
          ...prev,
          lastAnalyzed: Date.now()
        }));
        lastAnalyzedRef.current = Date.now(); // Update last analyzed timestamp
      } catch (error) {
        console.error('Error analyzing conversation:', error);
      } finally {
        setIsAnalyzing(false);
        analysisInProgressRef.current = false;
      }
    }
  }, [conversationHistory, getConversationSuggestion]);
  
  useEffect(() => {
    if (!isTranscribing) {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      return;
    }
    
    // More frequent analysis every 1.5 seconds instead of 3 seconds
    analysisIntervalRef.current = setInterval(debouncedAnalysis, 1500);
    
    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
    };
  }, [isTranscribing, debouncedAnalysis]);
  
  // Additional immediate analysis when new segments arrive
  useEffect(() => {
    if (isTranscribing && conversationHistory.segments.length > 0) {
      const latestSegment = conversationHistory.segments[conversationHistory.segments.length - 1];
      const hasNewTranscription = latestSegment && latestSegment.timestamp > (lastAnalyzedRef.current || 0);
      
      if (hasNewTranscription) {
        // Trigger immediate analysis with a small delay to batch rapid updates
        const timeoutId = setTimeout(() => {
          debouncedAnalysis();
        }, 500);
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [conversationHistory.segments, isTranscribing, debouncedAnalysis]);

  // Initialize camera on component mount or when requested
  const initializeCamera = async () => {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      cameraStreamRef.current = cameraStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = cameraStream;
      }
      
      setCameraPermission('granted');
      setError(null); // Clear any previous camera error
    } catch (err) {
      console.error('Camera access denied:', err);
      setCameraPermission('denied');
      setError('Camera access is required for face recognition. Please click "Enable Camera" button and allow camera access.');
    }
  };

  // Request camera access with user interaction
  const requestCameraAccess = async () => {
    await initializeCamera();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Handle transcription toggle
  const handleTranscriptionToggle = async () => {
    if (isTranscribing) {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      socketRef.current?.close();
      setIsTranscribing(false);
      setConversationHistory({ segments: [], lastAnalyzed: 0 });
      setAiSuggestions([]);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;

        const socket = new WebSocket(
          'wss://api.deepgram.com/v1/listen?model=nova-3&diarize=true&punctuate=true&utterances=true',
          [
            'token',
            import.meta.env.VITE_DEEPGRAM_API_KEY
          ]
        );
        socketRef.current = socket;

        socket.onopen = () => {
          mediaRecorder.addEventListener('dataavailable', (event) => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(event.data);
            }
          });
          mediaRecorder.start(250);
        };

        socket.onmessage = (message) => {
          const received = JSON.parse(message.data);
          
          // Store raw response for debugging
          setRawResponses(prev => [...prev.slice(-9), { // Keep only last 10 responses
            data: received,
            timestamp: new Date().toLocaleTimeString()
          }]);
          
          const alternative = received.channel?.alternatives?.[0];
          
          if (alternative?.transcript && received.is_final) {
            // Extract speaker information from words array
            const words = alternative.words || [];
            if (words.length > 0) {
              // Get the most common speaker in this segment
              const speakerCounts = {};
              words.forEach(word => {
                speakerCounts[word.speaker] = (speakerCounts[word.speaker] || 0) + 1;
              });
              
              const dominantSpeaker = Object.keys(speakerCounts).reduce((a, b) =>
                speakerCounts[a] > speakerCounts[b] ? a : b
              );
              
              // Add new segment with speaker information
              const speakerId = parseInt(dominantSpeaker);
              const newSegment = {
                speaker: speakerId,
                text: alternative.transcript,
                timestamp: Date.now()
              };
              
              setTranscriptSegments(prev => [...prev, newSegment]);
              
              // Update conversation history
              setConversationHistory(prev => ({
                ...prev,
                segments: [...prev.segments, newSegment]
              }));
              
              // Update active speakers
              setActiveSpeakers(prev => new Set([...prev, speakerId]));
              
              // Check for banana keyword
              if (detectBananaKeyword(alternative.transcript)) {
                getPersonInfo();
              }
            }
          }
        };

        setIsTranscribing(true);
      } catch (err) {
        console.error('Failed to start transcription:', err);
        setError('Failed to start transcription. Please check your microphone permissions.');
      }
    }
  };

  // Render transcript segments with speaker labels
  const renderTranscript = useMemo(() => {
    if (transcriptSegments.length === 0) {
      return isTranscribing ? 'Listening...' : 'Click the button to begin';
    }
    
    return transcriptSegments.map((segment, index) => (
      <div key={`${segment.speaker}-${segment.timestamp}-${index}`} className="transcript-segment fade-in">
        <span className="speaker-label" style={{
          color: speakerColorMap[segment.speaker] || SPEAKER_COLORS[segment.speaker % SPEAKER_COLORS.length],
        }}>
          Speaker {segment.speaker + 1}:
        </span>
        <span className="transcript-text">
          {segment.text}
        </span>
      </div>
    ));
  }, [transcriptSegments, isTranscribing, speakerColorMap]);

  // Render person info panel
  const renderPersonInfo = useMemo(() => {
    if (isRecognizing) {
      return (
        <div style={{ padding: '1rem' }}>
          <div className="face-scan-container">
            <div className="face-scan-grid"></div>
            <div className="face-scan-overlay"></div>
            <div className="face-scan-corners"></div>
            <div className="face-scan-text">Scanning...</div>
          </div>
          <div className="loading">
            <div className="loading-spinner"></div>
            Recognizing person...
          </div>
        </div>
      );
    }
    
    if (!personInfo) {
      return (
        <div style={{
          textAlign: 'center',
          color: '#A0A0A0',
          padding: '2rem',
          letterSpacing: '0.5px'
        }}>
          <img
            src="/face-recognition.jpg"
            alt="Face Recognition Research"
            style={{
              width: '100%',
              maxWidth: '300px',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}
          />
          Say "banana" to trigger face recognition
        </div>
      );
    }
    
    return (
      <div className="person-info fade-in" style={{ flexDirection: 'column', alignItems: 'center' }}>
        {recognitionComplete && (
          <>
            {/* Captured image as primary display */}
            {personInfo.capturedImage && (
              <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                <h4 style={{
                  color: '#00ffff',
                  fontSize: '0.9rem',
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  Captured Image
                </h4>
                <img
                  src={personInfo.capturedImage}
                  alt="Captured Face"
                  className="face-result-image captured-image"
                  style={{
                    width: '100%',
                    maxWidth: '200px',
                    height: '150px',
                    objectFit: 'cover',
                    borderRadius: '12px',
                    border: '2px solid rgba(0, 255, 0, 0.5)',
                    boxShadow: '0 0 20px rgba(0, 255, 0, 0.3)'
                  }}
                />
              </div>
            )}
            
            {/* API response images as main content */}
            {personInfo.apiResponse && personInfo.apiResponse.image_urls && (
              <div style={{ width: '100%', marginBottom: '16px' }}>
                <h4 style={{
                  color: '#00ffff',
                  fontSize: '0.9rem',
                  marginBottom: '12px',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}>
                  Found {personInfo.apiResponse.count} Potential Matches
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  width: '100%',
                  maxWidth: '300px',
                  margin: '0 auto'
                }}>
                  {personInfo.apiResponse.image_urls.slice(0, 6).map((url, index) => (
                    <div key={url} style={{ position: 'relative' }}>
                      <img
                        src={url}
                        alt={`Match ${index + 1}`}
                        className="face-result-image"
                        style={{
                          width: '100%',
                          height: '100px',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          border: '1px solid rgba(0, 255, 255, 0.4)',
                          boxShadow: '0 0 15px rgba(0, 255, 255, 0.2)',
                          transition: 'all 0.3s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.transform = 'scale(1.05)';
                          e.target.style.boxShadow = '0 0 25px rgba(0, 255, 255, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.transform = 'scale(1)';
                          e.target.style.boxShadow = '0 0 15px rgba(0, 255, 255, 0.2)';
                        }}
                      />
                      <div style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        background: 'rgba(0, 0, 0, 0.7)',
                        color: '#00ffff',
                        fontSize: '0.7rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: '600'
                      }}>
                        #{index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="face-match-indicator" style={{ marginBottom: '16px' }}>
              <span>✓</span>
              <span>Face Match Found</span>
            </div>
          </>
        )}
        
        {/* Minimal text information */}
        <div style={{
          textAlign: 'center',
          width: '100%',
          padding: '0 8px'
        }}>
          <div className="person-name" style={{ marginBottom: '4px' }}>{personInfo.name}</div>
          <div className="person-job" style={{ marginBottom: '8px', fontSize: '0.8rem' }}>{personInfo.job}</div>
          {personInfo.notes && (
            <div style={{
              fontSize: '0.75rem',
              color: 'rgba(255, 255, 255, 0.6)',
              fontStyle: 'italic',
              marginTop: '8px'
            }}>
              {personInfo.notes}
            </div>
          )}
        </div>
      </div>
    );
  }, [isRecognizing, personInfo, recognitionComplete]);

  // Render AI suggestions with individual refs for auto-scroll
  const renderAISuggestions = useMemo(() => {
    if (isAnalyzing && aiSuggestions.length === 0) {
      return (
        <div className="loading">
          <div className="loading-spinner"></div>
          Analyzing conversation...
        </div>
      );
    }

    if (aiSuggestions.length === 0) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          textAlign: 'center',
          color: '#A0A0A0',
          padding: '2rem',
          letterSpacing: '0.5px'
        }}>
          Start a conversation to get AI suggestions
        </div>
      );
    }

    // Reverse the array to show most recent first
    return [...aiSuggestions].reverse().map((suggestion, index) => (
      <div
        key={suggestion.id}
        ref={el => {
          // Store ref for the latest suggestion (now at index 0 after reverse)
          if (index === 0) {
            latestSuggestionRef.current = el;
          }
        }}
        className={`ai-suggestion ${index === 0 ? 'slide-in-top' : 'fade-in'}`}
      >
        <div className="suggestion-text">{suggestion.text}</div>
        <div className="suggestion-timestamp">
          {new Date(suggestion.timestamp).toLocaleTimeString()}
        </div>
      </div>
    ));
  }, [isAnalyzing, aiSuggestions]);

  // Render speaker legend
  const renderSpeakerLegend = useMemo(() => {
    if (activeSpeakers.size === 0) return null;
    
    return (
      <div className="speaker-legend">
        <h3>Active Speakers:</h3>
        <div className="speaker-chips">
          {Array.from(activeSpeakers).sort((a, b) => a - b).map(speakerId => (
            <div key={speakerId} className="speaker-chip">
              <div
                className="speaker-dot"
                style={{ backgroundColor: speakerColorMap[speakerId] || SPEAKER_COLORS[speakerId % SPEAKER_COLORS.length] }}
              ></div>
              <span>Speaker {speakerId + 1}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }, [activeSpeakers, speakerColorMap]);

  // Render raw data viewer for debugging
  const renderRawData = useMemo(() => {
    if (!showRawData) return null;

    return (
      <div ref={rawDataRef} className="raw-data-container">
        <h3>Raw API Responses (Last 10):</h3>
        {rawResponses.map((response, index) => (
          <div key={`${response.timestamp}-${index}`} className="raw-response">
            <div className="raw-response-time">
              {response.timestamp}
            </div>
            <pre>
              {JSON.stringify(response.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    );
  }, [showRawData, rawResponses]);

  return (
    <div className="app">
      <div className="ar-status-indicator"></div>
      
      <h1 className="header">JARVIS</h1>
      
      {error && (
        <div className="error">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              marginLeft: '0.5rem',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            ✕
          </button>
        </div>
      )}
      
      {/* Camera preview and hidden canvas for photo capture */}
      <div className="camera-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-preview"
          style={{
            display: cameraPermission === 'granted' ? 'block' : 'none'
          }}
        />
        <canvas
          ref={canvasRef}
          className="hidden-canvas"
          style={{ display: 'none' }}
        />
      </div>
      
      <div className="main-container">
        <div className={`glass-panel ${isTranscribing ? 'state-active' : 'state-idle'}`}>
          <div className="panel-title">
            <div className="panel-icon">🎙️</div>
            Live Transcription
          </div>
          <div ref={transcriptBoxRef} className="transcript-box">
            {renderTranscript}
          </div>
        </div>

        <div className={`glass-panel ${isAnalyzing ? 'state-processing' : (aiSuggestions.length > 0 ? 'state-active' : 'state-idle')}`}>
          <div className="panel-title">
            <div className="panel-icon">🤖</div>
            AI Suggestions
            {isAnalyzing && <div className="loading-spinner"></div>}
          </div>
          <div
            ref={aiSuggestionsRef}
            className="ai-suggestions"
          >
            {renderAISuggestions}
          </div>
        </div>

        <div className={`glass-panel ${isRecognizing ? 'state-processing' : (personInfo ? 'state-active' : 'state-idle')}`}>
          <div className="panel-title">
            Research Face Recognition
          </div>
          {renderPersonInfo}
        </div>
      </div>
      
      <div className="control-panel">
        <button
          type="button"
          onClick={handleTranscriptionToggle}
          className="toggle-button"
        >
          {isTranscribing ? 'Stop' : 'Start'}
        </button>
        
        <button
          type="button"
          onClick={requestCameraAccess}
          className="toggle-button"
          style={{
            background: cameraPermission === 'granted' 
              ? 'linear-gradient(135deg, rgba(0, 255, 0, 0.2), rgba(0, 255, 128, 0.2))'
              : 'linear-gradient(135deg, rgba(255, 100, 0, 0.2), rgba(255, 150, 0, 0.2))',
            borderColor: cameraPermission === 'granted' 
              ? 'rgba(0, 255, 0, 0.4)'
              : 'rgba(255, 100, 0, 0.4)'
          }}
        >
          {cameraPermission === 'granted' ? '✓ Camera On' : 'Enable Camera'}
        </button>
        
        <button
          type="button"
          onClick={() => setShowRawData(!showRawData)}
          className="toggle-button"
        >
          {showRawData ? 'Hide Data' : 'Show Data'}
        </button>
      </div>
      
      {renderSpeakerLegend}
      {renderRawData}
    </div>
  );
}

export default App;
