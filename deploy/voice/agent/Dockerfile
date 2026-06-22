# Happy voice agent worker. CPU-only image: STT/LLM/TTS run as external
# OpenAI-compatible endpoints (vLLM / faster-whisper-server / kokoro-fastapi),
# and Silero VAD runs on CPU. Colocate with LiveKit per the deploy plan.
FROM python:3.12-slim

WORKDIR /app

# uv for fast, reproducible installs.
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN uv pip install --system --no-cache .

COPY voice_agent.py voice_agent_prompt.py ./

# Pre-download the Silero VAD weights so the first session is not delayed.
RUN python -c "from livekit.plugins import silero; silero.VAD.load()"

# `start` connects to LiveKit and waits for room dispatches.
CMD ["python", "voice_agent.py", "start"]
