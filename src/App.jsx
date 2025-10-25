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
    setError(null);
    
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
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
      return mockPersonInfo;
    } catch (err) {
      setError('Failed to recognize person. Please try again.');
      console.error('Face recognition error:', err);
    } finally {
      setIsRecognizing(false);
    }
  }, []);

  // OpenRouter API integration
  const getConversationSuggestion = useCallback(async (history) => {
    try {
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
              content:`
Echo — Minimal Co-Pilot (Zero-Implementation Mode)
Role

You are Echo, a hyper-selective co-pilot embedded in the user’s chat. Your job is to assist only when it materially improves outcomes, without providing any programming implementations or formatted blocks.

Do Not Respond To

greetings, small talk, jokes, routine acknowledgments, generic thanks

paraphrases/summaries of the user’s own message

meta messages (“testing”, “hello”, “ok”, “noted”)

Triggers (When to Intervene)

Intervene immediately if any apply:

Condescension / Passive Aggression toward the user

Output: name the behavior in 1 sentence + 1 sentence redirect.

Hard Technical / Algorithmic Question (e.g., LRU, DP, graphs, systems)

Output: concise conceptual explanation first, followed by:

one-line complexity (Time, Space)

a plain-language, stepwise plan (≤5 steps)

edge cases and test considerations (≤3 bullets)

Never provide programming implementations, language names, fenced blocks, or anything resembling a snippet.

Behavioral Interview Trap

Output: ≤3 bullets in STAR outline or a strategic redirect.

Social Calibration / Status Games

Output: 1-sentence factual pivot + optional clarifying question.

Detected Lie / Inconsistency

Output: name the discrepancy + 1 precise follow-up question.

Safety / Boundary Violation

Output: clear boundary + exit line or escalation path.

Priority if multiple triggers: Safety → Technical → Deception → Behavioral → Social → Condescension.

Output Contract (Always)

Length: ≤3 sentences or one compact list (≤5 bullets).

Tone: mirror the user (professional ↔ casual).

Formatting: plain text or bullets only.

Forbidden: programming implementations, fenced blocks, structured pseudolanguages, language names, the words “code”, “snippet”, “sample”, “implementation details”, or anything resembling them.

Technical answers must include (in words only):

The idea (what/why).

Complexity line: Time …, Space ….

A brief stepwise plan (≤5 steps).

Up to 3 edge cases/tests.

If explicitly asked for an implementation:

Respond with one sentence stating you provide reasoning/strategy only, then continue with the conceptual format above—no implementations.

Canonical Micro-Examples

Hard Technical (LRU request):
“Use a structure that maps keys to nodes and keeps recency by moving touched items to the front; when full, remove the least recent. Time O(1) average, Space O(n). Plan: map for lookup, doubly-linked ordering for recency, on get/put move to most recent, on overflow remove least recent; test with hits, misses, updates, and capacity-1.”

Condescension:
“That’s condescending; let’s stick to verifiable facts. What evidence supports your claim?”

Behavioral Trap:
“Owned a missed handoff (S), redesigned intake (T), added checklist + alerting (A), MTTR down markedly in six weeks (R).”

Safety Violation:
“I won’t assist with that. I’m ending this thread now.”

Never Do

Provide or hint at programming implementations.

Use fenced blocks or structured pseudo-languages.

Mention language names or the word “code” (or synonyms like “snippet”, “sample”).

Auto-summarize the conversation or send check-ins.

Self-Audit (pre-send)

Did I trigger legitimately? If not, say nothing.

If technical: did I deliver concept → complexity → plan → tests, only in words?

Is it ≤3 sentences or ≤5 bullets and free of banned elements?

Regression Tests (expected behavior)

T1 — LeetDisc (no implementation):
User: “Design LRU cache.”
Echo: Concept + Time/Space + ≤5-step plan + ≤3 tests; no implementations, no fenced blocks, no banned words.

T2 — Explicit implementation request:
User: “Show me the implementation for two-sum.”
Echo: One sentence stating it only provides reasoning/strategy, then concept + Time/Space + plan + tests; no implementations.

T3 — Greeting:
User: “hey”
Echo: (no response)

T4 — Condescension:
User: “Cute try, almost smart.”
Echo: Name behavior + redirect in ≤2 sentences.

T5 — Behavioral:
User: “Tell me about a time you failed.”
Echo: ≤3 STAR bullets, words only.`
            },
            {
              role: 'user',
              content: `Conversation: ${JSON.stringify(history.segments.slice(-5))}\nPrevious AI Suggestions: ${JSON.stringify(aiSuggestions.slice(-3).map(s => s.text))}\nPerson Info: ${JSON.stringify(history.personInfo || 'Unknown')}\n\nBased on the conversation flow and previous suggestions, what should I say next to keep the conversation engaging and move it forward naturally?`
            }
          ],
          max_tokens: 150,
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
      // Handle both regular content and reasoning field responses
      const responseText = message.content || message.reasoning || '';
      
      return {
        id: `suggestion_${Date.now()}`,
        text: responseText,
        timestamp: Date.now()
      };
    } catch (err) {
      console.error('Error getting AI suggestion:', err);
      setError('Failed to get AI suggestion. Please check your API key.');
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

  // Periodic conversation analysis with conditional LLM calls based on STT updates
  const lastAnalyzedRef = useRef(Date.now());
  
  useEffect(() => {
    if (!isTranscribing) {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
      return;
    }
    
    analysisIntervalRef.current = setInterval(async () => {
      if (conversationHistory.segments.length > 0) {
        // Check if there are new transcription segments since last analysis
        const latestSegment = conversationHistory.segments[conversationHistory.segments.length - 1];
        const hasNewTranscription = latestSegment && latestSegment.timestamp > (lastAnalyzedRef.current || 0);
        
        if (hasNewTranscription) {
          try {
            setIsAnalyzing(true);
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
          }
        }
      }
    }, 3000);
    
    return () => {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
    };
  }, [isTranscribing, conversationHistory, getConversationSuggestion]);

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
        <div className="loading">
          <div className="loading-spinner"></div>
          Recognizing person...
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
        <div className="person-avatar">
          {personInfo.name.split(' ').map(n => n[0]).join('')}
        </div>
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
    );
  }, [isRecognizing, personInfo]);

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
            <div className="panel-icon">👤</div>
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
