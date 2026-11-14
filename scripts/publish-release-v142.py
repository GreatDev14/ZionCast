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

tag = 'v1.4.2'
release_name = 'ZionCast 1.4.2 - Redesigned Live Camera Broadcast Section & Fast Connected-Only Detection'
body_notes = """## ✝️ ZionCast v1.4.2 Release Notes

### 🎥 Redesigned Live Camera Broadcast Section & Instant Connected-Only Detection

1. **⚡ Instant Connected-Camera Detection (Fixes Missing Connected Cameras)**:
   - **Fixed Windows `tasklist` Timeout Bug**: Replaced slow `tasklist` process polling (which took 5.6 seconds on Windows and timed out at 1.5s, causing connected Iriun Webcam devices to be skipped) with a 28ms TCP socket check (`netstat -ano -p tcp`) and unified `1280×720` `64×48` frame signature analysis.
   - **Progressive Instant Rendering**: Connected cameras (`Iriun Webcam (Cam 1)`, `Camo`, USB webcams) now appear in the UI in ~0.5 seconds as soon as probed without waiting on slow built-in laptop cameras.
   - **Strict Connected-Only Filtering**: Automatically rejects all disconnected virtual camera splash screens (`Iriun` Orange Cat `"Looking for the phone"`, `Camo` grey offline screen, `DroidCam` orange/blue splash, `SplitCam` static wallpaper, `OBS` offline, and closed laptop privacy shutters), while accurately detecting connected phones even when resting flat on a dark desk.
   - **Shared Zero-Lock Video Stream**: Previewing a camera in `Operator Preview` and on the live camera card shares a single `1280×720` MediaStream so Windows DirectShow camera drivers are never locked by duplicate `getUserMedia` calls.

2. **🎨 Clean Broadcast Camera Section & Dual Monitor Layout**:
   - **Consistent Top Dual Monitors**: Keeps `Operator Preview` (left) and `Live TV Output` (right) visible at the top of the workspace at all times, removing the old duplicate empty black viewfinder box.
   - **Clean Operator Preview**: Previewing a camera on your laptop displays a clean, unobstructed 16:9 camera feed in `Operator Preview` while keeping your active slide on the `Live TV Output` until you explicitly click **`📺 Add to TV`** or **`🎵 Worship BG`**.
   - **Redesigned Live Camera Cards**: Each connected camera card displays its full name, resolution pill (`1280×720 HD`), live status badge (`👁️ PREVIEWING`, `🟢 CONNECTED`, `🔴 LIVE ON TV`, `🎵 WORSHIP BG`), live 16:9 video feed, and 3 clear action buttons (`👁️ Preview`, `📺 Add to TV`, `🎵 Worship BG`) that fit cleanly above the bottom status bar without clipping.

---
### 📥 Downloads:
- **Windows Installer (Recommended)**: `ZionCast-Setup-1.4.2.exe`
- **Portable Zip**: `ZionCast-Portable-1.4.2.zip`
- **Portable Exe**: `ZionCast-Portable-1.4.2.exe`
"""

repo = 'GreatDev14/ZionCast'

print(f"Creating Release {tag} on {repo}...")
create_payload = json.dumps({
    'tag_name': tag,
    'target_commitish': 'main',
    'name': release_name,
    'body': body_notes,
    'draft': False,
    'prerelease': False
}).encode('utf-8')

req = urllib.request.Request(
    f'https://api.github.com/repos/{repo}/releases',
    data=create_payload,
    headers={**headers, 'Content-Type': 'application/json'},
    method='POST'
)

try:
    with urllib.request.urlopen(req) as resp:
        release_data = json.loads(resp.read().decode('utf-8'))
        release_id = release_data['id']
        upload_url = release_data['upload_url'].split('{')[0]
        print(f"Release created successfully! ID: {release_id}")
except urllib.error.HTTPError as e:
    err_body = e.read().decode('utf-8')
    print(f"Release creation info (HTTP {e.code}): {err_body}")
    get_req = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases/tags/{tag}', headers=headers)
    with urllib.request.urlopen(get_req) as resp:
        release_data = json.loads(resp.read().decode('utf-8'))
        release_id = release_data['id']
        upload_url = release_data['upload_url'].split('{')[0]
        print(f"Using existing release ID: {release_id}")

assets_to_upload = [
    ('dist/ZionCast-Setup-1.4.2.exe', 'ZionCast-Setup-1.4.2.exe', 'application/vnd.microsoft.portable-executable'),
    ('dist/ZionCast-Portable-1.4.2.zip', 'ZionCast-Portable-1.4.2.zip', 'application/zip'),
    ('dist/ZionCast-Portable-1.4.2.exe', 'ZionCast-Portable-1.4.2.exe', 'application/vnd.microsoft.portable-executable')
]

for file_path, asset_name, content_type in assets_to_upload:
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}, skipping...")
        continue
    file_size = os.path.getsize(file_path)
    print(f"\nUploading {asset_name} ({file_size / (1024*1024):.1f} MB)...")

    assets_req = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases/{release_id}/assets', headers=headers)
    try:
        with urllib.request.urlopen(assets_req) as resp:
            existing_assets = json.loads(resp.read().decode('utf-8'))
            for a in existing_assets:
                if a['name'] == asset_name:
                    print(f"Deleting existing asset ID {a['id']}...")
                    del_req = urllib.request.Request(a['url'], headers=headers, method='DELETE')
                    urllib.request.urlopen(del_req)
                    time.sleep(1)
    except Exception as e:
        print(f"Could not check existing assets: {e}")

    retries = 3
    for attempt in range(retries):
        try:
            with open(file_path, 'rb') as f:
                upload_req = urllib.request.Request(
                    f"{upload_url}?name={asset_name}",
                    data=f.read(),
                    headers={
                        **headers,
                        'Content-Type': content_type,
                        'Content-Length': str(file_size)
                    },
                    method='POST'
                )
                with urllib.request.urlopen(upload_req, timeout=300) as resp:
                    print(f"Uploaded {asset_name} successfully! (Status: {resp.status})")
                    break
        except Exception as e:
            print(f"Upload failed (attempt {attempt + 1}/{retries}): {e}")
            if attempt < retries - 1:
                time.sleep(5)
            else:
                print(f"Failed to upload {asset_name} after {retries} attempts.")

print("\nAll assets processed.")

