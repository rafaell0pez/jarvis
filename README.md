# 🕶️ Jarvis — AI Networking Assistant for Meta Glasses  

 **“Because LinkedIn is for amateurs.”**  
Jarvis transforms Meta Glasses into a real-time networking assistant — recognizing faces, recalling names, and generating AI-powered conversation cues during in-person interactions.


## 🚀 Overview  

**Cluely** uses live speech transcription, facial recognition, and conversational AI to enhance real-world interactions.  
It helps you *remember people, recall context, and sound sharp — instantly.*

### Core Capabilities  
- **Facial Recognition** – Identify and recall people in real time  
- **Live Transcription** – Multi-speaker diarization with low latency  
- **AI Conversation Hints** – Context-aware, adaptive dialogue prompts  
- **Voice Commands** – Say “banana” to trigger recognition  
- **On-Glasses UI** – Optimized interface for Meta Glasses streaming  

 

## 🧠 Tech Stack  

### Frontend  
- **React 19 + Vite** – Fast, modular UI  
- **WebRTC APIs** – Camera and mic access for live recognition  
- **CSS3 (Glassmorphism)** – Lightweight visual effects  

### Backend  
- **FastAPI + SQLModel + PostgreSQL** – Async Python stack  
- **Docker Compose** – Unified deployment  
- **Face Recognition API** – Custom image-matching service  

### AI & APIs  
- **Deepgram Nova-3** – Real-time speech-to-text  
- **OpenRouter (Grok-4-Fast)** – Conversation intelligence model  

 

## ⚙️ Setup  

### Prerequisites  
- Node.js 18+ and npm/pnpm  
- Python 3.10+ with [UV](https://docs.astral.sh/uv)  
- Deepgram + OpenRouter API keys  
- Docker (optional)  

### Frontend (Main Jarvis UI)
```bash
cd frontend
npm install
npm run dev
```

### Echo (Transcription App)
```bash
cd echo
npm install
npm run dev
```

### Backend  
```bash
cd backend
uv sync --dev
uv run uvicorn app.main:app --reload
```

Access the app at:  
- Frontend → `http://localhost:5173`  
- Backend → `http://localhost:8000`  

 

## 📂 Project Structure

This is a monorepo containing multiple components:

```
.
├── frontend/      # Main Jarvis UI (React + Vite)
│   ├── src/
│   ├── public/
│   └── package.json
├── echo/          # Real-time transcription app (React + Vite)
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/       # FastAPI service
│   ├── app/
│   ├── Dockerfile
│   └── pyproject.toml
└── docs/          # Documentation
```

 

## 🔑 Environment Variables  

| Variable | Description |
|   --|    -|
| `VITE_DEEPGRAM_API_KEY` | Deepgram speech-to-text |
| `VITE_OPENROUTER_API_KEY` | OpenRouter AI models |
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Backend secret key |
| `ENVIRONMENT` | `local`, `staging`, or `production` |

 

## 🧩 Usage  

1. **Enable Camera** → Allow facial recognition access  
2. **Start Transcription** → Begin real-time analysis  
3. **Say “banana”** → Trigger face identification  
4. **View Suggestions** → Watch AI conversation prompts appear  

 

## 🧪 Development Commands  

### Frontend  
```bash
npm run build
npm run preview
npm run lint
```

### Backend  
```bash
make run
make check
make test
```

 

## 🧾 License  

This project was developed for Calhacks 12.0.  
© 2025
