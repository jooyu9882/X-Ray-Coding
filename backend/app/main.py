"""HTTP API: POST /api/trace turns source code into a trace JSON.

Run locally:  cd backend && uvicorn app.main:app --reload
"""

import os
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.runner import run_code

MAX_CODE_LENGTH = 10_000  # characters
MAX_CONCURRENT_RUNS = 4  # each run is a separate Python process

# Comma-separated list, e.g. "https://xray.vercel.app,http://localhost:5173"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app = FastAPI(title="Code X-Ray")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_run_slots = threading.BoundedSemaphore(MAX_CONCURRENT_RUNS)


class TraceRequest(BaseModel):
    code: str = Field(max_length=MAX_CODE_LENGTH)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# A plain `def` (not `async def`): run_code blocks for up to the timeout,
# so FastAPI runs it in its thread pool instead of the event loop.
@app.post("/api/trace")
def trace(request: TraceRequest):
    if not _run_slots.acquire(blocking=False):
        raise HTTPException(
            status_code=503, detail="Too many programs running. Try again.")
    try:
        return run_code(request.code)
    finally:
        _run_slots.release()
