import re
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..state import BASE_CLONE_DIR, DOWNLOADS_DIR
from ..utils import command_exists, resolve_input_path, sanitize_repo_name

router = APIRouter()
MEDIA_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".avif",
    ".mp4",
    ".webm",
    ".mov",
    ".mkv",
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
}


@router.get("/api/tools/status")
def get_tools_status():
    return {
        "yt_dlp": command_exists("yt-dlp"),
        "ffmpeg": command_exists("ffmpeg"),
        "gh": command_exists("gh"),
        "git": command_exists("git"),
        "whois": command_exists("whois"),
        "dig": command_exists("dig"),
        "nslookup": command_exists("nslookup"),
    }


@router.post("/api/tools/yt-dlp/update")
def update_ytdlp():
    res = subprocess.run(["python3", "-m", "pip", "install", "-U", "yt-dlp"], capture_output=True, text=True)
    return {"status": "updated", "output": res.stdout}


@router.post("/api/tools/yt-dlp")
def ytdlp_download(data: dict):
    if not command_exists("yt-dlp"):
        raise HTTPException(status_code=400, detail="yt-dlp is missing. Install with: sudo apt install yt-dlp")

    url = (data or {}).get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL required")

    timestamp = str(int(time.time()))
    base_dir = Path(DOWNLOADS_DIR) / "yt-dlp"
    base_dir.mkdir(parents=True, exist_ok=True)

    template = f"{timestamp}_%(title)s/%(title)s.%(ext)s"
    cmd = ["yt-dlp", "--write-thumbnail", "-o", template, url]

    res = subprocess.run(cmd, capture_output=True, text=True, cwd=str(base_dir))
    if res.returncode != 0:
        error_msg = res.stderr or res.stdout or "Process failed"
        raise HTTPException(status_code=500, detail=error_msg.split("ERROR:")[-1].strip())

    created_dir = next((d for d in base_dir.iterdir() if d.is_dir() and d.name.startswith(timestamp)), None)
    if not created_dir:
        raise HTTPException(status_code=500, detail="Folder creation failed.")

    title = created_dir.name.replace(f"{timestamp}_", "")
    video_url = ""
    thumb_url = ""

    for file_path in created_dir.glob("*"):
        rel_path = f"/downloads/yt-dlp/{created_dir.name}/{file_path.name}"
        if file_path.suffix in [".jpg", ".webp", ".png"]:
            thumb_url = rel_path
        else:
            video_url = rel_path

    return {
        "status": "ok",
        "title": title,
        "folder": str(created_dir.resolve()),
        "video_url": video_url,
        "thumb_url": thumb_url,
        "stdout": res.stdout[-1500:],
    }


@router.post("/api/tools/ffmpeg/convert")
def ffmpeg_convert(data: dict):
    if not command_exists("ffmpeg"):
        raise HTTPException(status_code=400, detail="ffmpeg missing")

    payload = data or {}
    input_path = resolve_input_path(payload.get("input_path", "").strip())
    output_format = payload.get("output_format", "mp4").strip().lower().lstrip(".")

    output_dir = Path(DOWNLOADS_DIR) / "ffmpeg"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_name = re.sub(r"[^A-Za-z0-9._-]", "_", payload.get("output_name", "")) or f"{input_path.stem}_converted"
    output_path = (output_dir / f"{output_name}.{output_format}").resolve()

    cmd = ["ffmpeg", "-y"] if payload.get("overwrite", True) else ["ffmpeg"]
    cmd += ["-i", str(input_path)]

    settings = {
        "-ss": payload.get("start_time"),
        "-t": payload.get("duration"),
        "-c:v": payload.get("video_codec"),
        "-c:a": payload.get("audio_codec"),
        "-b:a": payload.get("audio_bitrate"),
        "-vf": f"scale={payload.get('scale')}" if payload.get("scale") else None,
        "-r": payload.get("fps"),
        "-preset": payload.get("preset"),
        "-crf": str(payload.get("crf", "")),
    }
    for flag, value in settings.items():
        if value:
            cmd += [flag, value]

    if output_format in {"jpg", "png"}:
        cmd += ["-frames:v", "1"]

    cmd.append(str(output_path))
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise HTTPException(status_code=500, detail=res.stderr)
    return {"status": "ok", "output_file": str(output_path)}


@router.post("/api/tools/repo/create")
def create_repo(data: dict):
    payload = data or {}
    repo_name = sanitize_repo_name(payload.get("name", ""))
    repo_path = Path(BASE_CLONE_DIR) / repo_name
    if repo_path.exists():
        raise HTTPException(status_code=409, detail="Exists")

    repo_path.mkdir(parents=True)
    (repo_path / "README.md").write_text(f"# {repo_name}\n{payload.get('description', '')}")

    subprocess.run(["git", "init", "-b", "main"], cwd=str(repo_path))
    subprocess.run(["git", "add", "."], cwd=str(repo_path))
    subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=str(repo_path))

    gh_res = {"message": "Local only"}
    if payload.get("create_github") and command_exists("gh"):
        gh_cmd = [
            "gh",
            "repo",
            "create",
            repo_name,
            "--source",
            str(repo_path),
            "--push",
            "--private" if payload.get("visibility") == "private" else "--public",
        ]
        res = subprocess.run(gh_cmd, capture_output=True, text=True)
        gh_res["message"] = "GitHub Created" if res.returncode == 0 else res.stderr

    return {"status": "ok", "repo_path": str(repo_path.resolve()), "github": gh_res}


@router.get("/api/tools/downloads/media")
def list_download_media():
    base = Path(DOWNLOADS_DIR).resolve()
    media = []
    if base.exists():
        for file_path in base.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix.lower() not in MEDIA_EXTENSIONS:
                continue
            rel = file_path.relative_to(base).as_posix()
            media_type = "image"
            if file_path.suffix.lower() in {".mp4", ".webm", ".mov", ".mkv"}:
                media_type = "video"
            elif file_path.suffix.lower() in {".mp3", ".wav", ".ogg", ".m4a"}:
                media_type = "audio"
            media.append(
                {
                    "name": file_path.name,
                    "path": str(file_path),
                    "rel_path": rel,
                    "url": f"/downloads/{rel}",
                    "type": media_type,
                }
            )

    media.sort(key=lambda item: item["rel_path"], reverse=True)
    return {"status": "ok", "count": len(media), "media": media[:400]}


@router.post("/api/tools/uploads")
async def upload_tool_input(file: UploadFile = File(...)):
    uploads_dir = Path(DOWNLOADS_DIR) / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "upload.bin")
    timestamp = str(int(time.time()))
    target = (uploads_dir / f"{timestamp}_{safe_name}").resolve()

    content = await file.read()
    target.write_bytes(content)

    rel = target.relative_to(Path(DOWNLOADS_DIR).resolve()).as_posix()
    return {"status": "ok", "input_path": str(target), "url": f"/downloads/{rel}", "name": target.name}


@router.post("/api/tools/native/whois")
def native_whois(data: dict):
    payload = data or {}
    target = (payload.get("target") or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="target is required")
    if not command_exists("whois"):
        raise HTTPException(status_code=400, detail="whois is not installed")

    res = subprocess.run(["whois", target], capture_output=True, text=True)
    output = (res.stdout or "") + ("\n" + res.stderr if res.stderr else "")
    if res.returncode != 0 and not output.strip():
        raise HTTPException(status_code=500, detail="whois command failed")
    return {"status": "ok", "target": target, "output": output[-24000:]}


@router.post("/api/tools/native/dns")
def native_dns_lookup(data: dict):
    payload = data or {}
    domain = (payload.get("domain") or "").strip()
    if not domain:
        raise HTTPException(status_code=400, detail="domain is required")

    records = {}
    if command_exists("dig"):
        for record_type in ["A", "AAAA", "MX", "TXT", "NS", "CNAME"]:
            res = subprocess.run(["dig", "+short", domain, record_type], capture_output=True, text=True)
            lines = [line.strip() for line in (res.stdout or "").splitlines() if line.strip()]
            records[record_type] = lines
        return {"status": "ok", "domain": domain, "resolver": "dig", "records": records}

    if command_exists("nslookup"):
        res = subprocess.run(["nslookup", domain], capture_output=True, text=True)
        output = (res.stdout or "") + ("\n" + res.stderr if res.stderr else "")
        if res.returncode != 0 and not output.strip():
            raise HTTPException(status_code=500, detail="nslookup command failed")
        return {"status": "ok", "domain": domain, "resolver": "nslookup", "raw_output": output[-24000:]}

    raise HTTPException(status_code=400, detail="Neither dig nor nslookup is installed")
