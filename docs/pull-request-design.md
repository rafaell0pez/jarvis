# Pull Request Design: JARVIS AI Agent Implementation

**Author:** Chief Systems Architect
**Date:** 2025-10-25
**Related Issue(s):** JARVIS AI Agent for Smart Glasses

## 0. Implementation Approach Justification

*   **Chosen Approach:** Frontend Implementation (React/NextJS)
*   **Justification:**
    *   This implementation is primarily UI-focused with moderate complexity logic that can be handled effectively in React
    *   The real-time nature of the application benefits from client-side processing for immediate feedback
    *   The existing transcription functionality is already implemented in React, maintaining consistency
    *   Face recognition and LLM interactions can be handled through API calls from the frontend
    *   The liquid glassmorphism UI design requires extensive frontend styling work
    *   While some logic could be moved to a backend, the current requirements don't justify the additional complexity of a separate backend service

---

## 1. Problem Statement

*   **Description:** Transform the existing real-time transcription application into JARVIS, an AI agent that provides intelligent conversation assistance through smart glasses. The system needs to detect a "banana" keyword to trigger face recognition, identify people, analyze conversations in real-time, and provide suggestions on what to say.
*   **Success Criteria (High-Level):**
    *   The app detects when someone says "banana" and triggers a mock face recognition API call
    *   Person information is displayed when recognized (name, job, CV-style details)
    *   Conversation analysis starts immediately when transcription begins
    *   Every 3 seconds, conversation history is sent to OpenRouter's deepseek model for analysis
    *   AI suggestions on what to say are displayed in a separate panel in real-time
    *   The UI features a cool liquid glassmorphism transparent dark design
*   **Business Context & User Impact:** This creates an intelligent assistant that helps users navigate conversations more effectively, providing real-time guidance and contextual information about people they're speaking with.

## 2. Solution Overview

*   **High-Level Description:** Enhance the existing transcription app with JARVIS AI capabilities. The app will continuously transcribe audio with speaker diarization, detect the "banana" keyword to trigger face recognition, maintain conversation history, and periodically send this data to an LLM for analysis. The AI's suggestions will be displayed in a sleek glassmorphism UI.
*   **Key Architectural Decisions (Frontend):**
    *   Use React hooks for state management of conversation history, person data, and AI suggestions
    *   Implement a timer-based system to send conversation data to OpenRouter every 3 seconds
    *   Create a modular component structure with separate panels for transcription, person info, and AI suggestions
    *   Apply glassmorphism design patterns with CSS for the liquid transparent dark aesthetic
*   **Technical Approach Summary:** Extend the existing React app with new components for person recognition, AI suggestions, and implement API calls to OpenRouter. Use setInterval for periodic conversation analysis and regex for keyword detection.
*   **Alternatives Considered:** 
    *   Backend implementation: Considered but rejected due to added complexity without significant benefits for current requirements
    *   Web Workers for transcription processing: Considered but the existing Deepgram WebSocket approach is already efficient

## 3. System Architecture (Frontend Focus)

*   **Component Diagram & Interaction Flow (Mermaid):**
    ```mermaid
    graph TD
        A[App Component] --> B[TranscriptionPanel]
        A --> C[PersonInfoPanel]
        A --> D[AISuggestionsPanel]
        A --> E[KeywordDetector]
        A --> F[ConversationAnalyzer]
        
        B --> G[Deepgram WebSocket]
        E --> H[Banana Keyword Detection]
        F --> I[OpenRouter API]
        
        H --> J[Mock Face Recognition API]
        J --> C
        
        F --> D
        
        G --> K[Transcript Segments]
        K --> E
        K --> F
    ```
*   **Data Flow Description:** 
    1. Audio is captured and sent to Deepgram for transcription
    2. Transcript segments are processed for keyword detection
    3. When "banana" is detected, mock face recognition API is called
    4. Person data is stored and displayed
    5. Every 3 seconds, conversation history is sent to OpenRouter
    6. AI suggestions are received and displayed in real-time
*   **External Dependencies:** 
    *   OpenRouter API for LLM functionality
    *   Mock face recognition API (to be implemented)
*   **Architectural Pattern Adherence:** The implementation follows React's component-based architecture with hooks for state management and effects for side effects like API calls and timers.

## 4. Data Models (Frontend Focus)

*   **Frontend Data Structures (TypeScript Interfaces/Types):**
    ```typescript
    // Transcript segment (existing)
    interface TranscriptSegment {
      speaker: number;
      text: string;
      timestamp: number;
    }

    // Person information from face recognition
    interface PersonInfo {
      id: string;
      name: string;
      job: string;
      company?: string;
      bio?: string;
      interests?: string[];
      lastMet?: string;
      notes?: string;
    }

    // AI suggestion from LLM
    interface AISuggestion {
      id: string;
      text: string;
      timestamp: number;
      context?: string;
      confidence?: number;
    }

    // Conversation history for LLM analysis
    interface ConversationHistory {
      segments: TranscriptSegment[];
      personInfo?: PersonInfo;
      lastAnalyzed: number;
    }
    ```
*   **Mapping to Backend Models:** These are frontend-only data structures for now, as we're using mock APIs.
*   **Client-Side Validation:** 
    *   Validate OpenRouter API key format
    *   Validate transcript segments before processing
    *   Validate API responses before storing

## 5. API Design (Frontend Consumption Focus)

*   **Consumed APIs / Server Actions:**
    *   **Mock Face Recognition API:** `/api/face-recognition` (to be mocked)
        *   **Request Payload:** `{ image: string }` (mock image data)
        *   **Response Payload (Success):** `PersonInfo`
        *   **Response Payload (Error):** `{ error: string }`
    
    *   **OpenRouter API:** `https://openrouter.ai/api/v1/chat/completions`
        *   **Request Payload:** 
            ```typescript
            {
              model: "openai/gpt-5-nano",
              messages: Array<{
                role: "system" | "user" | "assistant";
                content: string;
              }>,
              max_tokens: 150,
              temperature: 0.7
            }
            ```
        *   **Response Payload (Success):** 
            ```typescript
            {
              choices: Array<{
                message: {
                  content: string;
                };
              }>;
            }
            ```
        *   **Response Payload (Error):** `{ error: { message: string } }`
*   **Frontend API Interaction Logic:**
    ```typescript
    // Example: Calling OpenRouter API
    async function getConversationSuggestion(history: ConversationHistory): Promise<AISuggestion> {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'deepseek/deepseek-chat-v3-0324:free',
            messages: [
              {
                role: 'system',
                content: 'You are JARVIS, an AI assistant helping with conversation. Based on the conversation transcript and person information, suggest what the user should say next. Keep responses concise and actionable.'
              },
              {
                role: 'user',
                content: `Conversation: ${JSON.stringify(history.segments)}\nPerson Info: ${JSON.stringify(history.personInfo)}`
              }
            ],
            max_tokens: 150,
            temperature: 0.7
          })
        });
        
        const data = await response.json();
        return {
          id: generateId(),
          text: data.choices[0].message.content,
          timestamp: Date.now()
        };
      } catch (error) {
        console.error('Error getting AI suggestion:', error);
        throw error;
      }
    }
    ```
*   **Authentication/Authorization:** API key will be stored in environment variables and accessed through Vite's env system.

## 6. Implementation Plan (Frontend Focus)

**Status: 4/4 phases completed**

*   **Phase 1: UI Redesign with Glassmorphism** ✅
    *   Step 1.1: Update `src/App.css` with glassmorphism styles ✅
        *   Implemented liquid glassmorphism design with transparent backgrounds
        *   Added blur effects, gradients, and subtle animations
        *   Created a cohesive dark theme with glass-like elements
    *   Step 1.2: Update `src/App.jsx` structure to accommodate new panels ✅
        *   Restructured layout to include person info and AI suggestions panels
        *   Implemented responsive design for different screen sizes
    *   **Files:** `src/App.css`, `src/App.jsx`
    *   **Notes:** Complete glassmorphism redesign with animated background, blur effects, and responsive layout

*   **Phase 2: Keyword Detection and Face Recognition** ✅
    *   Step 2.1: Implement keyword detection in `src/App.jsx` ✅
        *   Added regex pattern to detect "banana" in transcript segments
        *   Created state for tracking keyword detection status
    *   Step 2.2: Create mock face recognition API call ✅
        *   Implemented `getPersonInfo` function that returns mock data
        *   Added loading and error states for face recognition
    *   Step 2.3: Create PersonInfoPanel component ✅
        *   Display person information in a glassmorphism card
        *   Include name, job, and other CV-style details
    *   **Files:** `src/App.jsx`
    *   **Notes:** Keyword detection triggers mock face recognition with comprehensive person data display

*   **Phase 3: Conversation Analysis and AI Suggestions** ✅
    *   Step 3.1: Implement conversation history management ✅
        *   Created state to store conversation segments
        *   Implemented logic to maintain conversation history
    *   Step 3.2: Create OpenRouter API integration ✅
        *   Implemented `getConversationSuggestion` function
        *   Added error handling for API failures
    *   Step 3.3: Implement periodic conversation analysis ✅
        *   Used setInterval to trigger analysis every 3 seconds
        *   Included conversation history and person info in API calls
    *   Step 3.4: Create AISuggestionsPanel component ✅
        *   Display AI suggestions in real-time
        *   Include timestamps and context information
    *   **Files:** `src/App.jsx`, `vite.config.js`
    *   **Notes:** Real-time AI suggestions with OpenRouter integration and proper error handling

*   **Phase 4: Integration and Testing** ✅
    *   Step 4.1: Integrate all components seamlessly ✅
        *   Ensured smooth interaction between transcription, person info, and AI suggestions
        *   Implemented proper state management across components
    *   Step 4.2: Add environment variable support ✅
        *   Updated environment variable access for OpenRouter API key
        *   Implemented proper environment variable access in Vite
    *   Step 4.3: Performance optimization ✅
        *   Optimized re-renders and state updates with useMemo
        *   Implemented cleanup for timers and WebSocket connections
    *   **Files:** `src/App.jsx`, `vite.config.js`
    *   **Notes:** Performance optimizations with memoization and proper cleanup

## Implementation Summary
- **Completed 4/4 total phases**
- **Key milestone:** Full JARVIS AI agent implementation with glassmorphism UI
- **Current focus:** All implementation tasks completed successfully

*   **Code Snippet Examples:**
    ```typescript
    // Example: Keyword detection logic
    const detectBananaKeyword = (text: string): boolean => {
      const bananaRegex = /\bbanana\b/i;
      return bananaRegex.test(text);
    };

    // Example: Glassmorphism CSS
    .glass-panel {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    }

    // Example: Periodic conversation analysis
    useEffect(() => {
      if (!isTranscribing) return;
      
      const interval = setInterval(async () => {
        if (conversationHistory.segments.length > 0) {
          try {
            const suggestion = await getConversationSuggestion(conversationHistory);
            setAiSuggestions(prev => [...prev, suggestion]);
            setConversationHistory(prev => ({
              ...prev,
              lastAnalyzed: Date.now()
            }));
          } catch (error) {
            console.error('Error analyzing conversation:', error);
          }
        }
      }, 3000);
      
      return () => clearInterval(interval);
    }, [isTranscribing, conversationHistory.segments]);
    ```

## 7. Quality Assurance Plan (Frontend Focus)

*   **Verification Commands (Fail Fast):**
    *   `pnpm run format` (Run after any significant code change)
    *   `pnpm lint` (Run periodically and before committing)
    *   `pnpm build` (Run before finalizing PR to ensure production build works)
    *   `pnpm preview` (Test production build locally)

*   **Success Criteria (Detailed & Measurable):**
    *   **Functional:**
        *   Transcription continues to work with speaker diarization
        *   "Banana" keyword is detected reliably in transcript segments
        *   Mock face recognition API is called when keyword is detected
        *   Person information is displayed correctly in the dedicated panel
        *   Conversation history is maintained and updated in real-time
        *   OpenRouter API is called every 3 seconds with conversation data
        *   AI suggestions are displayed in the dedicated panel with timestamps
    *   **UI/UX:**
        *   Glassmorphism design is applied consistently across all components
        *   UI is responsive and works on different screen sizes
        *   Loading states and error messages are user-friendly
        *   Transitions and animations are smooth and performant
    *   **Performance:**
        *   Application remains responsive during continuous transcription
        *   Memory usage stays stable during extended use
        *   API calls are properly managed and don't cause memory leaks
        *   Timer cleanup works correctly when transcription stops

*   **Testing Strategy:**
    *   **Manual Testing:**
        *   Test keyword detection with various phrases containing "banana"
        *   Verify face recognition mock API returns expected data
        *   Check AI suggestions update every 3 seconds
        *   Test error handling for API failures
        *   Verify UI responsiveness with different amounts of content
    *   **Performance Testing:**
        *   Monitor memory usage during extended transcription sessions
        *   Check for memory leaks when starting/stopping transcription
        *   Verify timer cleanup works correctly

*   **Example Test Cases:**
    ```javascript
    // Manual test case for keyword detection
    // 1. Start transcription
    // 2. Say "I like to eat banana for breakfast"
    // 3. Verify face recognition API is called
    // 4. Verify person info panel appears with mock data

    // Manual test case for AI suggestions
    // 1. Start transcription and have a conversation
    // 2. Wait 3 seconds
    // 3. Verify AI suggestion appears in the dedicated panel
    // 4. Wait another 3 seconds
    // 5. Verify new AI suggestion appears
    ```

## 8. Pull Request Strategy

*   **Branch Naming Convention:** `feature/jarvis-ai-agent`
*   **Commit Message Standard:** Follow Conventional Commits
    *   Example: `feat(ui): implement glassmorphism design`
    *   Example: `feat(ai): add conversation analysis with OpenRouter`
    *   Example: `feat(recognition): implement keyword detection and face recognition`
*   **PR Structure and Template:**
    *   **Title:** `feat: Implement JARVIS AI agent with real-time conversation analysis`
    *   **Description:**
        *   Link to this PR Design document
        *   Summary of changes
        *   Verification that all tests pass
*   **Merge Strategy:** Squash and Merge

## 9. Project Context and Relevant Folders

*   **High-Level Description of Modified Area:** This PR transforms the existing transcription app into JARVIS, an AI agent that provides real-time conversation assistance. The implementation includes keyword detection, face recognition, conversation analysis, and AI suggestions, all wrapped in a glassmorphism UI.
*   **Key Folders for Context:**
    *   `src/` (Main application code)
    *   `src/App.jsx` (Main component to be enhanced)
    *   `src/App.css` (Styles to be updated with glassmorphism)
    *   `public/` (For any static assets if needed)
*   **Primary Files to be Modified/Created:**
    *   `src/App.jsx` (Major enhancements for JARVIS functionality)
    *   `src/App.css` (Complete redesign with glassmorphism)
    *   `.env.local` (Already contains OpenRouter API key)
    *   `package.json` (May need additional dependencies)

## 10. Future Considerations

*   **Scalability:** 
    *   Consider implementing Web Workers for heavy processing
    *   Optimize conversation history management for longer conversations
    *   Implement caching for AI suggestions to reduce API calls
*   **Potential Future Enhancements:**
    *   Real face recognition API integration
    *   Voice synthesis for AI suggestions
    *   Conversation summarization features
    *   Integration with calendar and contacts
*   **Maintainability:**
    *   Component structure allows for easy addition of new features
    *   Clear separation of concerns between transcription, recognition, and AI analysis
    *   Environment variables for easy configuration
*   **Technical Debt:** 
    *   Mock face recognition API should be replaced with real implementation
    *   Error handling could be more sophisticated
    *   Consider adding unit tests for critical functions