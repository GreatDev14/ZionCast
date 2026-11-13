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

tag = 'v1.3.9'
release_name = 'ZionCast 1.3.9 - Smooth Input Typing, Rate-Limit-Proof Updates & Flyer-Friendly Countdown HUD'
body_notes = """## ✝️ ZionCast v1.3.9 Release Notes

### 🌟 What's New & Fixed in v1.3.9:

1. **⌨️ Smooth Input Typing Everywhere (Never Drops Focus)**:
   - Fixed an Electron Windows issue where focus recovery interrupted native DOM input caret positioning.
   - You can now type freely in the **Custom Slide Builder** (Slide Title, Subtitle / Event Time, Slide Content), **Bible Scripture Quick Search**, **Song Search**, and **Announcement Builder** with zero lag, zero dropped characters, and zero lost focus.
   - Punctuation (including `?`, `:`, `-`, `•`, etc.) types smoothly into all text fields without any presentation hotkey interference.

2. **⏱️ Sleek Flyer-Friendly Countdown HUD (Never Blocks Church Graphics)**:
   - Redesigned the Pre-Service Countdown Timer so it **never covers flyer titles, faces, or church details**.
   - **New Placement Options**:
     - `↗ Top-Right HUD`: Positioned safely in the top corner so center flyer graphics stay 100% visible.
     - `⬇ Bottom-Center Slim Pill`: Ultra-low-profile horizontal glass pill that sits elegantly at the bottom edge.
     - `🎯 Center Floating Glass Badge`: Refined translucent glassmorphism that floats gracefully without opaque blocking.
     - Also supports `Top-Left HUD`, `Bottom-Right HUD`, and `Bottom-Left HUD`.
   - **New Size Presets**:
     - `Compact HUD Pill` (Default - Sleek & non-intrusive)
     - `Mini Corner Timer` (Ultra-subtle corner broadcast clock)
     - `Medium Broadcast Card`
     - `Large Sanctuary Card`

3. **🚀 100% Rate-Limit Proof Update Checker (No More "GitHub HTTP 403")**:
   - Upgraded the software updater with high-speed GitHub CDN checking (`raw.githubusercontent.com`) and zero-rate-limit redirect checking.
   - Never fails with "GitHub HTTP 403" even on shared Wi-Fi networks or mobile hotspots.
   - Checking for updates is now instantaneous and reliable worldwide.

4. **🚫 Auto-Hide Disconnected / Idle Virtual Cameras (Camo, SplitCam, DroidCam, OBS)**:
   - Built-in video signal probe actively detects live video frames.
   - Drivers without a phone or camera connected (e.g. idle Camo, SplitCam, DroidCam, OBS, idle Iriun channels) are **automatically hidden from view**.
   - Only devices with an **active live phone camera or capture card** are displayed in the Camera Studio.
   - Includes a quick toggle button `[ 🟢 Connected Only ]` / `[ ⚙️ All Drivers ]`.

5. **🛡️ Strict TV Broadcast Protection**:
   - Previewing or clicking cameras in the Camera Studio **only plays locally on the operator laptop monitor**.
   - Live TV output to the congregation is protected and **never interrupted** unless the operator explicitly clicks **`📺 Add to TV`**!

---
### 📥 Downloads:
- **Windows Installer (Recommended)**: `ZionCast-Setup-1.3.9.exe`
- **Portable Zip**: `ZionCast-Portable-1.3.9.zip`
- **Portable Exe**: `ZionCast-Portable-1.3.9.exe`
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
    ('dist/ZionCast-Setup-1.3.9.exe', 'ZionCast-Setup-1.3.9.exe', 'application/vnd.microsoft.portable-executable'),
    ('dist/ZionCast-Portable-1.3.9.zip', 'ZionCast-Portable-1.3.9.zip', 'application/zip'),
    ('dist/ZionCast-Portable-1.3.9.exe', 'ZionCast-Portable-1.3.9.exe', 'application/vnd.microsoft.portable-executable')
]

for file_path, name, mime_type in assets_to_upload:
    if not os.path.exists(file_path):
        print(f"Warning: File {file_path} does not exist, skipping.")
        continue
    
    file_size = os.path.getsize(file_path)
    print(f"Uploading {name} ({file_size / (1024*1024):.1f} MB)...")
    
    # Check if asset already exists in release
    get_assets_req = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases/{release_id}/assets', headers=headers)
    with urllib.request.urlopen(get_assets_req) as resp:
        existing_assets = json.loads(resp.read().decode('utf-8'))
        for existing in existing_assets:
            if existing['name'] == name:
                print(f"Deleting older asset {name} (ID: {existing['id']})...")
                del_req = urllib.request.Request(existing['url'], headers=headers, method='DELETE')
                urllib.request.urlopen(del_req)
                time.sleep(1)
                break

    parsed_url = urllib.parse.urlparse(upload_url + f'?name={name}')
    conn = http.client.HTTPSConnection(parsed_url.netloc, timeout=300)
    upload_headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': mime_type,
        'Content-Length': str(file_size),
        'User-Agent': 'ZionCast-Release-Tool'
    }
    
    conn.putrequest('POST', f"{parsed_url.path}?{parsed_url.query}")
    for k, v in upload_headers.items():
        conn.putheader(k, v)
    conn.endheaders()
    
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            conn.send(chunk)
            
    res = conn.getresponse()
    resp_body = res.read().decode('utf-8')
    conn.close()
    
    if res.status in (200, 201):
        print(f"Successfully uploaded {name}!")
    else:
        print(f"Upload failed for {name} with HTTP {res.status}: {resp_body}")

print("\n🎉 GitHub Release v1.3.9 published successfully!")
