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

tag = 'v1.4.1'
release_name = 'ZionCast 1.4.1 - Fix Disconnected Camera False-Positive & Studio Bottom Overlap'
body_notes = """## ✝️ ZionCast v1.4.1 Release Notes

### 🎥 Critical Camera Studio Fixes & UI Layout Perfection

1. **🚫 Complete Elimination of Disconnected Camera False Positives (Iriun Cat / Logo Screens)**:
   - Fixed an issue where Iriun Webcam (Cam 4) or virtual drivers showing `"Looking for the phone..."` or idle splash logos were falsely detected as active cameras.
   - ZionCast now uses deep optical-sensor signal analysis:
     - **Black Pixel Ratio & Luminance Detection**: Filters out digital splash screens with pitch-black backgrounds (`blackRatio > 0.75` and low luminance).
     - **Sensor Micro-Fluctuation Analysis**: Real camera sensors have photon noise and micro-movements across >= 8% of frame pixels. Idle driver screens with animated text or blinking dots (`.` / `..` / `...`) affect less than 0.5% of pixels and are now immediately recognized as disconnected and discarded.
     - **Strict TV Safety**: Removed any bypass logic. Disconnected cameras will **NEVER** show `🔴 ON TV`. If an active camera is disconnected, ZionCast automatically drops the on-air badge to protect your broadcast.

2. **📐 Perfect Studio Bottom Bar Layout & Zero Card Clipping**:
   - Fixed the issue where camera cards in the Camera Studio were pushed down and clipped or overlapped by the global bottom bar.
   - When Camera Studio opens, it now takes full center stage with dedicated scrolling (`overflow-y: auto`) and generous bottom clearance (`padding-bottom: 60px`).
   - All camera card action buttons (`👁️ Preview` and `📺 Add to TV`) are completely visible, easily clickable, and never hidden behind the bottom toolbar.
   - Clicking `✕ Back to Slides` instantly restores the standard dual monitors and slide tile interface.

---
### 📥 Downloads:
- **Windows Installer (Recommended)**: `ZionCast-Setup-1.4.1.exe`
- **Portable Zip**: `ZionCast-Portable-1.4.1.zip`
- **Portable Exe**: `ZionCast-Portable-1.4.1.exe`
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
    ('dist/ZionCast-Setup-1.4.1.exe', 'ZionCast-Setup-1.4.1.exe', 'application/vnd.microsoft.portable-executable'),
    ('dist/ZionCast-Portable-1.4.1.zip', 'ZionCast-Portable-1.4.1.zip', 'application/zip'),
    ('dist/ZionCast-Portable-1.4.1.exe', 'ZionCast-Portable-1.4.1.exe', 'application/vnd.microsoft.portable-executable')
]

for file_path, asset_name, content_type in assets_to_upload:
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}, skipping...")
        continue
    file_size = os.path.getsize(file_path)
    print(f"\nUploading {asset_name} ({file_size / (1024*1024):.1f} MB)...")

    # Check if asset already exists in release
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

    # Stream upload with retry
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

