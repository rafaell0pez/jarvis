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
  
  // Refs
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const analysisIntervalRef = useRef(null);
  const transcriptBoxRef = useRef(null);

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

  // Mock face recognition API
  const getPersonInfo = useCallback(async () => {
    setIsRecognizing(true);
    setRecognitionComplete(false);
    setError(null);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Mock person data
      const mockPersonInfo = {
        id: 'person_001',
        name: 'Alexandra Chen',
        job: 'Senior AI Research Engineer',
        company: 'TechVision Labs',
        bio: 'Specializing in natural language processing and computer vision with 8 years of experience in developing cutting-edge AI solutions.',
        interests: ['Machine Learning', 'Computer Vision', 'Quantum Computing', 'Ethical AI'],
        lastMet: 'Tech Conference 2024',
        notes: 'Interested in collaborative research on multimodal AI systems.'
      };
      
      setPersonInfo(mockPersonInfo);
      setRecognitionComplete(true);
      return mockPersonInfo;
    } catch (err) {
      setError('Failed to recognize person. Please try again.');
      console.error('Face recognition error:', err);
    } finally {
      setIsRecognizing(false);
    }
  }, []);

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
          color: 'rgba(255, 255, 255, 0.6)',
          padding: '2rem'
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
      <div className="person-info fade-in">
        {recognitionComplete && (
          <div className="face-recognition-results">
            <img
              src="https://jsc6.pimeyes.com/proxy/W_U_uPN10dmkNF9mdWIu0aY3yzndT8pMVmzYjZI3O2uyr8tO5U-SZNyaUwiAhM8INlQkV2r6v0pDNP8DZiJdPs5STMDUQ25F4xDuKoGJrBi6L75iDFONZ2aEOzI-oJrWgo24myakGzkC8Lof-keU-an37KFUU-NkbJ53hy_x1XNXCVtrktir-Q07Cp_ePs7nrjEMT96FSAD9gJjqmOM3Tz_e3PtwPuKMt9LsLFDLdICCYqJhoL9W0Rml_cCyv8vO_n7QEvf8AOga0Z8to5msGI7Bo77VC9imqXd4XIiPmKc2k0sMjAWSMErKhOQjSN0xJJOhmA6BDRCTfa-GHCw94oPHFEK7OlIwMZw6FxW2HlEDuVvUKDhdZuosUiZRW8eFjLrMCEEU0ZPyTuF-tn6WKU1tkm3z-877IXfsRhNcxBrL7zkIF2TFXBV-nphGGmuBpPwF8-1lmwVNRCb9mR3YcBNZracB2t0tWFFXG9bJ5Fbq4f75SyJzq3bFJXAR8ESicQgVeBAG2bWe1HvZPZmL2E1hzeyQE_dbF1O_qO6_NYVI91_zq1XcRdMurxYoPnpazjUtc_Bzgo8-IaQJvuRAMK7H3X5FeczuS2BAJnaQwuLMJ4Ikhmp4H_guBmcxUIE90cX0dswyGudqna6uu8IB12O87wPD8XHbEOGGMTKVyGw="
              alt="Recognized Face 1"
              className="face-result-image"
            />
            <img
              src="https://jsc14.pimeyes.com/proxy/8A3QuwjNgHtHN_F8RG8y8FhgbIm1cOUhn3RhmfxGHDW6w-erI2CIaMtPb_jXY5RApczQATl27AwlbCsdHRdhbHWvXtm14_6j7d8Xjo1_chcOSvlu0EA4ISFUnKCW41r_5Zf6xyz0tvV4lR0PkK49afbZmfi_A2dkTuJ-PosAd33-iunY57x6keOLQ6dA6M44AVoP1k87LpiIosXbd4ECPZPGZOkVOftXue_xkR1p_fMe-31x5F1IJd1MUMdYEX5gXQ5wqGAY9sw_D_V-lbcsXggvvcTnYKx1SqVOBne7kqZteMIF4e6fPKy4JnhEr4s5VfYqPosBj3c18NxYWqxUi9jRQWlmLZ2GhWQQ1_FLJ2G6QRzQ4UEFzc7e-Y4Mqtd6iVcr3mxL3QbVYjaD0RY_r0CliZaPoInotOeIX416MxqOxvs6hX8514xPicith28XvXq1TWVPmcKlfu51iXg4k5uBCwZD3KBZn-gDfna0jF8qTjW_uJlLaE6ccELBQ7uB_0d0DVDxLad8YbX449_90kBS-iEPIktLSQjW160PV4yCTgPPHe-ox3KIPpZHke-ADnW6jrMDeGM90T6rS3Sjf8Cl1cMSeec97LzQtOTKSlJ2I1XHl-3f0ITzEFYXDIjqdIkWRw4miYq8z6aoO9lAplZ4saCI9l8URK7wMEb_sdqomAnreEvua__PVpBnVwOiSf4khM3Uq0fuP7rlHm5zXoFx1V53pBmbYJEAFWnFaB_low3D-ULSZD_4_oAIZU2vQgOQ9hCQy5qCGwsq9fdILg=="
              alt="Recognized Face 2"
              className="face-result-image"
            />
            <div className="face-match-indicator">
              <span>✓</span>
              <span>Face Match Found</span>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>
          <div className="person-name">{personInfo.name}</div>
          <div className="person-job">{personInfo.job}</div>
          {personInfo.company && (
            <div className="detail-item">
              <span className="detail-label">Company:</span>
              <span>{personInfo.company}</span>
            </div>
          )}
          {personInfo.bio && (
            <div className="detail-item">
              <span className="detail-label">Bio:</span>
              <span>{personInfo.bio}</span>
            </div>
          )}
          {personInfo.interests && (
            <div className="detail-item">
              <span className="detail-label">Interests:</span>
              <span>{personInfo.interests.join(', ')}</span>
            </div>
          )}
          {personInfo.lastMet && (
            <div className="detail-item">
              <span className="detail-label">Last Met:</span>
              <span>{personInfo.lastMet}</span>
            </div>
          )}
          {personInfo.notes && (
            <div className="detail-item">
              <span className="detail-label">Notes:</span>
              <span>{personInfo.notes}</span>
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
          textAlign: 'center',
          color: 'rgba(255, 255, 255, 0.6)',
          padding: '2rem'
        }}>
          Start a conversation to get AI suggestions
        </div>
      );
    }
    
    return aiSuggestions.map((suggestion, index) => (
      <div
        key={suggestion.id}
        ref={el => {
          // Store ref for the latest suggestion
          if (index === aiSuggestions.length - 1) {
            latestSuggestionRef.current = el;
          }
        }}
        className="ai-suggestion fade-in"
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
      <div className="raw-data-container">
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
      
      <h1 className="header">ECHO</h1>
      
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
      
      <div className="main-container">
        <div className="glass-panel">
          <div className="panel-title">
            <div className="panel-icon">🎙️</div>
            Live Transcription
          </div>
          <div ref={transcriptBoxRef} className="transcript-box">
            {renderTranscript}
          </div>
        </div>
        
        <div className="glass-panel">
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
        
        <div className="glass-panel">
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
