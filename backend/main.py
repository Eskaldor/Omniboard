from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.paths import ensure_dirs
from backend.routers import actors, assets, combat, encounters, logs, render, systems, ws


ensure_dirs()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/assets", StaticFiles(directory="data/assets"), name="assets")
app.mount("/render", StaticFiles(directory="data/render"), name="render")
app.mount("/locales", StaticFiles(directory="data/locales"), name="locales")

app.include_router(ws.router)
app.include_router(combat.router)
app.include_router(actors.router)
app.include_router(systems.router)
app.include_router(encounters.router)
app.include_router(assets.router)
app.include_router(render.router)
app.include_router(logs.router)

# Serve Vite frontend in production (only when SERVE_DIST=1 to avoid catch-all in dev)
if os.path.isdir("dist") and os.environ.get("SERVE_DIST") == "1":
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        # Serve index.html for SPA routing, or specific files if they exist
        file_path = os.path.join("dist", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("dist/index.html")
