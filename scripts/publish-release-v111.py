import http.client
import subprocess
import urllib.request
import json
import os
import sys
import time

def get_token():
    p = subprocess.Popen(['git', 'credential', 'fill'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, _ = p.communicate(input='url=https://github.com/GreatDev14/ZionCast.git\n')
    for line in stdout.splitlines():
        if line.startswith('password='):
            return line.split('=', 1)[1].strip()
    return None

token = get_token()
if not token:
    print("Could not retrieve GitHub token!")
    sys.exit(1)

headers = {
    'Authorization': f'Bearer {token}',
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'ZionCast-Release-Tool'
}

tag = 'v1.1.1'
release_name = 'ZionCast 1.1.1 - Smooth YouTube Streaming & Display Enhancements'
body_notes = """## ZionCast v1.1.1 Release Notes

### 🎥 YouTube Live Streaming Fixes & Enhancements
- **Smooth Playback Without Stalling**: Resolved GoogleVideo CDN stream chunk stalling by passing proper Origin and Referer headers on media requests.
- **YouTube IFrame API Auto-Play**: Embedded player now utilizes official YouTube API auto-kickstart (`playVideo()`) with click-to-play pass-through.
- **Clean Fullscreen Presentation**: Completely hidden the duplicate center title badge and removed dark scrim overlay when viewing YouTube live streams.
- **Interactive Controls**: Unlocked pointer events and intelligent cursor auto-hiding (auto-hides after 2.5s of mouse inactivity on projector).

### 📱 Sanctuary Clock & Quick Access
- Single-TV Sanctuary Clock in the top-right corner of the sanctuary TV output for the whole congregation.
- Bottom status bar 1-click shortcuts for Phone Remote QR, TV Sanctuary Clock, Pre-Service Countdown, and Ambient Pads.
- Automatic header wrapping with zero horizontal scrollbars on smaller laptop screens.

### 📥 Downloads & Installation
- **Windows Installer**: Download `ZionCast-Setup-1.1.1.exe` below and run to install or update.
- **Portable Edition**: Download `ZionCast-Portable-1.1.1.zip` for instant plug-and-play without installation.
"""

# 1. Create or fetch release
req = urllib.request.Request(f'https://api.github.com/repos/GreatDev14/ZionCast/releases/tags/{tag}', headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        rel_data = json.loads(resp.read().decode('utf-8'))
        release_id = rel_data['id']
        print(f"Existing release found: ID {release_id}")
except urllib.error.HTTPError as e:
    if e.code == 404:
        print(f"Release {tag} does not exist. Creating new release...")
        create_payload = json.dumps({
            'tag_name': tag,
            'name': release_name,
            'body': body_notes,
            'draft': False,
            'prerelease': False
        }).encode('utf-8')
        create_req = urllib.request.Request(
            'https://api.github.com/repos/GreatDev14/ZionCast/releases',
            data=create_payload,
            headers={**headers, 'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(create_req) as resp:
            rel_data = json.loads(resp.read().decode('utf-8'))
            release_id = rel_data['id']
            print(f"Created release: ID {release_id}")
    else:
        raise

# 2. Upload assets
files_to_upload = [
    r'dist\ZionCast-Setup-1.1.1.exe',
    r'dist\ZionCast-Portable-1.1.1.zip'
]

for filepath in files_to_upload:
    if not os.path.exists(filepath):
        print(f"Skipping {filepath} (file does not exist)")
        continue

    filename = os.path.basename(filepath)
    filesize = os.path.getsize(filepath)

    # Check existing assets
    chk_req = urllib.request.Request(f'https://api.github.com/repos/GreatDev14/ZionCast/releases/{release_id}/assets', headers=headers)
    with urllib.request.urlopen(chk_req) as resp:
        assets = json.loads(resp.read().decode('utf-8'))
    
    existing = next((a for a in assets if a['name'] == filename), None)
    if existing:
        if existing['size'] == filesize:
            print(f"[EXISTS] {filename} ({filesize/1024/1024:.1f} MB) already matches. Skipping.")
            continue
        else:
            print(f"Deleting older asset {filename} (ID {existing['id']})...")
            del_req = urllib.request.Request(
                f"https://api.github.com/repos/GreatDev14/ZionCast/releases/assets/{existing['id']}",
                headers=headers,
                method='DELETE'
            )
            with urllib.request.urlopen(del_req) as del_resp:
                print(f"Deleted old asset: HTTP {del_resp.status}")

    print(f"\n>>> Uploading {filename} ({filesize / 1024 / 1024:.1f} MB) to GitHub Release...")
    conn = http.client.HTTPSConnection('uploads.github.com', timeout=600)
    upload_path = f"/repos/GreatDev14/ZionCast/releases/{release_id}/assets?name={filename}"
    conn.putrequest('POST', upload_path)
    conn.putheader('Authorization', f'Bearer {token}')
    conn.putheader('Content-Type', 'application/octet-stream')
    conn.putheader('Accept', 'application/vnd.github+json')
    conn.putheader('Content-Length', str(filesize))
    conn.putheader('User-Agent', 'ZionCast-Release-Tool')
    conn.endheaders()

    CHUNK = 512 * 1024
    sent_bytes = 0
    start_time = time.time()
    last_pct = -1

    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(CHUNK)
            if not chunk:
                break
            conn.send(chunk)
            sent_bytes += len(chunk)
            pct = int((sent_bytes / filesize) * 100)
            if pct != last_pct and (pct % 10 == 0 or pct == 100):
                elapsed = time.time() - start_time
                mbps = (sent_bytes / 1024 / 1024) / max(0.1, elapsed)
                print(f"  [{pct}%] {sent_bytes / 1024 / 1024:.1f} MB / {filesize / 1024 / 1024:.1f} MB ({mbps:.2f} MB/s)")
                last_pct = pct

    res = conn.getresponse()
    print(f"Upload complete for {filename}: HTTP {res.status} {res.reason}")

print("\nAll assets successfully published to GitHub Release v1.1.1!")
