import os

BASE_CLONE_DIR = os.path.abspath("sentinel_clones")
DOWNLOADS_DIR = os.path.abspath("downloads")
CONFIG_FILE = "sentinel_config.json"

os.makedirs(BASE_CLONE_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

active_containers = {}
