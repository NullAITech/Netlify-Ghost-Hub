import re
import shlex
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ..state import BASE_CLONE_DIR, DOWNLOADS_DIR, FFMPEG_INBOX_DIR
from ..utils import command_exists, sanitize_repo_name

router = APIRouter()
NATIVE_OUTPUT_LIMIT = 24000
FFMPEG_OUTPUT_DIR = (Path(DOWNLOADS_DIR) / "ffmpeg").resolve()
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


def _combine_output(res: subprocess.CompletedProcess) -> str:
    output = (res.stdout or "") + ("\n" + res.stderr if res.stderr else "")
    return output[-NATIVE_OUTPUT_LIMIT:]


def _parse_int(payload: dict, key: str, default: int, min_value: int, max_value: int) -> int:
    raw = payload.get(key, default)
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{key} must be an integer") from exc
    if value < min_value or value > max_value:
        raise HTTPException(status_code=400, detail=f"{key} must be between {min_value} and {max_value}")
    return value


def _parse_float(payload: dict, key: str, default: float, min_value: float, max_value: float) -> float:
    raw = payload.get(key, default)
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"{key} must be a number") from exc
    if value < min_value or value > max_value:
        raise HTTPException(status_code=400, detail=f"{key} must be between {min_value} and {max_value}")
    return value


def _parse_extra_args(raw_args: str) -> list[str]:
    if not raw_args or not raw_args.strip():
        return []
    try:
        parts = shlex.split(raw_args)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="extra_args is not valid shell-style text") from exc
    if len(parts) > 24:
        raise HTTPException(status_code=400, detail="extra_args has too many parts (max 24)")
    return parts


def _resolve_ffmpeg_inbox_path(raw_path: str) -> Path:
    inbox = Path(FFMPEG_INBOX_DIR).resolve()
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = inbox / candidate
    candidate = candidate.resolve()

    try:
        candidate.relative_to(inbox)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"ffmpeg input must be inside the workspace inbox: {inbox}",
        ) from exc

    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail=f"Input file not found in ffmpeg inbox: {candidate}")
    return candidate


def _ffmpeg_inbox_listing() -> list[dict]:
    inbox = Path(FFMPEG_INBOX_DIR).resolve()
    rows = []
    if not inbox.exists():
        return rows

    for file_path in inbox.rglob("*"):
        if not file_path.is_file():
            continue
        rel = file_path.relative_to(inbox).as_posix()
        stat = file_path.stat()
        rows.append(
            {
                "name": file_path.name,
                "relative_path": rel,
                "path": str(file_path),
                "size_bytes": stat.st_size,
                "modified_epoch": int(stat.st_mtime),
            }
        )

    rows.sort(key=lambda item: item["modified_epoch"], reverse=True)
    return rows[:400]


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
        "ping": command_exists("ping"),
        "traceroute": command_exists("traceroute") or command_exists("tracepath"),
        "ip": command_exists("ip"),
        "ss": command_exists("ss"),
        "curl": command_exists("curl"),
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
    input_path = _resolve_ffmpeg_inbox_path((payload.get("input_path") or "").strip())
    output_format = payload.get("output_format", "mp4").strip().lower().lstrip(".")

    FFMPEG_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    output_name = re.sub(r"[^A-Za-z0-9._-]", "_", payload.get("output_name", "")) or f"{input_path.stem}_converted"
    output_path = (FFMPEG_OUTPUT_DIR / f"{output_name}.{output_format}").resolve()

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
    return {"status": "ok", "input_file": str(input_path), "output_file": str(output_path)}


@router.get("/api/tools/ffmpeg/inbox")
def ffmpeg_inbox():
    inbox = Path(FFMPEG_INBOX_DIR).resolve()
    inbox.mkdir(parents=True, exist_ok=True)
    return {
        "status": "ok",
        "input_dir": str(inbox),
        "output_dir": str(FFMPEG_OUTPUT_DIR),
        "files": _ffmpeg_inbox_listing(),
    }


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
    uploads_dir = Path(FFMPEG_INBOX_DIR).resolve()
    uploads_dir.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename or "upload.bin")
    timestamp = str(int(time.time()))
    target = (uploads_dir / f"{timestamp}_{safe_name}").resolve()

    content = await file.read()
    target.write_bytes(content)

    rel = target.relative_to(Path(DOWNLOADS_DIR).resolve()).as_posix()
    return {
        "status": "ok",
        "input_path": str(target),
        "input_dir": str(uploads_dir),
        "url": f"/downloads/{rel}",
        "name": target.name,
    }


@router.post("/api/tools/native/whois")
def native_whois(data: dict):
    payload = data or {}
    target = (payload.get("target") or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="target is required")
    if not command_exists("whois"):
        raise HTTPException(status_code=400, detail="whois is not installed")

    res = subprocess.run(["whois", target], capture_output=True, text=True)
    output = _combine_output(res)
    if res.returncode != 0 and not output.strip():
        raise HTTPException(status_code=500, detail="whois command failed")
    return {"status": "ok", "target": target, "output": output}


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
        output = _combine_output(res)
        if res.returncode != 0 and not output.strip():
            raise HTTPException(status_code=500, detail="nslookup command failed")
        return {"status": "ok", "domain": domain, "resolver": "nslookup", "raw_output": output}

    raise HTTPException(status_code=400, detail="Neither dig nor nslookup is installed")


@router.post("/api/tools/native/ping")
def native_ping(data: dict):
    payload = data or {}
    target = (payload.get("target") or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="target is required")
    if not command_exists("ping"):
        raise HTTPException(status_code=400, detail="ping is not installed")

    count = _parse_int(payload, "count", 4, 1, 25)
    timeout_sec = _parse_int(payload, "timeout_sec", 3, 1, 15)
    interval_sec = _parse_float(payload, "interval_sec", 0.3, 0.1, 5.0)
    packet_size = payload.get("packet_size")
    extra_args = _parse_extra_args(payload.get("extra_args") or "")

    cmd = ["ping", "-c", str(count), "-W", str(timeout_sec), "-i", str(interval_sec)]
    if packet_size not in (None, ""):
        size_value = _parse_int(payload, "packet_size", 56, 8, 1472)
        cmd += ["-s", str(size_value)]
    cmd += extra_args
    cmd.append(target)

    res = subprocess.run(cmd, capture_output=True, text=True)
    output = _combine_output(res)
    if res.returncode not in (0, 1) and not output.strip():
        raise HTTPException(status_code=500, detail="ping command failed")
    return {"status": "ok", "target": target, "command": cmd, "output": output}


@router.post("/api/tools/native/traceroute")
def native_traceroute(data: dict):
    payload = data or {}
    target = (payload.get("target") or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="target is required")

    max_hops = _parse_int(payload, "max_hops", 20, 1, 64)
    wait_sec = _parse_int(payload, "wait_sec", 3, 1, 20)
    queries = _parse_int(payload, "queries", 1, 1, 5)
    use_icmp = bool(payload.get("use_icmp", False))
    extra_args = _parse_extra_args(payload.get("extra_args") or "")

    if command_exists("traceroute"):
        cmd = ["traceroute", "-m", str(max_hops), "-w", str(wait_sec), "-q", str(queries)]
        if use_icmp:
            cmd.append("-I")
    elif command_exists("tracepath"):
        cmd = ["tracepath", "-m", str(max_hops)]
    else:
        raise HTTPException(status_code=400, detail="Neither traceroute nor tracepath is installed")

    cmd += extra_args
    cmd.append(target)

    res = subprocess.run(cmd, capture_output=True, text=True)
    output = _combine_output(res)
    if res.returncode != 0 and not output.strip():
        raise HTTPException(status_code=500, detail="traceroute command failed")
    return {"status": "ok", "target": target, "command": cmd, "output": output}


@router.post("/api/tools/native/ip")
def native_ip(data: dict):
    payload = data or {}
    if not command_exists("ip"):
        raise HTTPException(status_code=400, detail="ip command is not installed")

    scope = (payload.get("scope") or "addr").strip().lower()
    if scope not in {"addr", "route", "link"}:
        raise HTTPException(status_code=400, detail="scope must be one of: addr, route, link")

    interface = (payload.get("interface") or "").strip()
    extra_args = _parse_extra_args(payload.get("extra_args") or "")
    cmd = ["ip", scope, "show"]
    if interface:
        cmd.append(interface)
    cmd += extra_args

    res = subprocess.run(cmd, capture_output=True, text=True)
    output = _combine_output(res)
    if res.returncode != 0 and not output.strip():
        raise HTTPException(status_code=500, detail="ip command failed")
    return {"status": "ok", "scope": scope, "command": cmd, "output": output}


@router.post("/api/tools/native/ss")
def native_ss(data: dict):
    payload = data or {}
    if not command_exists("ss"):
        raise HTTPException(status_code=400, detail="ss command is not installed")

    mode = (payload.get("mode") or "listening").strip().lower()
    protocol = (payload.get("protocol") or "all").strip().lower()
    if mode not in {"listening", "all"}:
        raise HTTPException(status_code=400, detail="mode must be listening or all")
    if protocol not in {"all", "tcp", "udp"}:
        raise HTTPException(status_code=400, detail="protocol must be all, tcp, or udp")

    cmd = ["ss", "-n", "-p"]
    if mode == "listening":
        cmd.append("-l")
    else:
        cmd.append("-a")

    if protocol == "tcp":
        cmd.append("-t")
    elif protocol == "udp":
        cmd.append("-u")
    else:
        cmd += ["-t", "-u"]

    if payload.get("extended"):
        cmd.append("-e")

    extra_args = _parse_extra_args(payload.get("extra_args") or "")
    cmd += extra_args

    res = subprocess.run(cmd, capture_output=True, text=True)
    output = _combine_output(res)
    if res.returncode != 0 and not output.strip():
        raise HTTPException(status_code=500, detail="ss command failed")
    return {"status": "ok", "command": cmd, "output": output}
