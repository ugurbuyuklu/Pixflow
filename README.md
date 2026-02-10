# Pixflow

AI-powered desktop application for creative asset production workflows.

## Features

### 🎨 Prompt Factory
Transform concepts and images into structured, production-ready prompts for AI generation.

### 🖼️ Asset Monster
Batch image generation with advanced prompt management:
- Generated, custom, and library prompt sources
- Reference image support (up to 5 images)
- Character-consistent generation
- Configurable aspect ratios, resolutions, and formats

### 👤 Avatar Studio
Create AI avatars with scripts, text-to-speech, and lip-sync capabilities.

### 🔧 The Machine
End-to-end pipeline orchestration for automated asset production.

### 📚 Library
Organize, favorite, and reuse your best prompts and generated assets.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Desktop**: Electron
- **Backend**: Node.js + Express
- **Styling**: TailwindCSS
- **State Management**: Zustand
- **AI Services**: OpenAI, FAL.ai, ElevenLabs, Hedra, Kling

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your API keys to .env

# Start development server
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Package as desktop app
npm run package
```

## Project Structure

```
pixflow/
├── src/
│   ├── main/          # Electron main process
│   ├── preload/       # Electron preload scripts
│   ├── renderer/      # React UI application
│   └── server/        # Express API server
├── docs/              # Documentation
├── avatars/           # Manual avatar gallery (curated)
└── outputs/           # Generated assets
```

## Configuration

API keys required in `.env`:
- `OPENAI_API_KEY` - For prompt generation and text processing
- `FAL_API_KEY` - For image generation
- `ELEVENLABS_API_KEY` - For text-to-speech
- `HEDRA_API_KEY` - For video generation
- `KLING_API_KEY` - For advanced video generation

## Development

```bash
# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## License

Private - All rights reserved

## Notes

- Gallery (`avatars/`) is manually curated - generated assets do not auto-populate
- Generated images are saved to `outputs/` directory
- Avatar Studio outputs go to `avatars_generated/` (not included in gallery)
