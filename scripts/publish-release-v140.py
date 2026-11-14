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

tag = 'v1.4.0'
release_name = 'ZionCast 1.4.0 - Redesigned Clean Camera Studio (Active Available Cameras Only)'
body_notes = """## ✝️ ZionCast v1.4.0 Release Notes

### 🎥 Major Redesign: Streamlined Camera Studio (Active Available Cameras Only)

1. **🚫 100% Elimination of Unneeded Clutter & Filler Text**:
   - Completely stripped out old tutorial instructions, setup guides, and duplicate control panels.
   - Removed the raw 10-camera driver dropdown that cluttered the interface.
   - Removed filter toggle buttons — ZionCast **now automatically and strictly displays ONLY cameras that are actually connected and transmitting live video**!

2. **⚡ Blazing Fast Live Frame Probing**:
   - Upgraded camera detection with parallel probe algorithms (`Promise.all`).
   - Instantly differentiates active live phone cameras (e.g. your active Iriun phone cams) from disconnected virtual drivers showing static splash logos (Camo, SplitCam, DroidCam, idle Iriun ports, OBS).
   - If a driver has no phone or device connected to it, **it will NEVER appear in any list or menu**.

3. **🎨 Dual-Interface Studio Redesign**:
   - **Sleek Sidebar Camera List**: Shows clean, high-contrast cards for each available camera with status pills (`🟢 READY` vs `🔴 ON AIR`) and 1-click **Preview** and **Project to TV** buttons.
   - **Central Broadcast Switcher**:
     - Live Viewfinder Monitor on your laptop.
     - High-contrast broadcast buttons: `📺 Project Preacher (Full Screen)`, `🎵 Project Worship BG (Behind Lyrics)`, and `⏹️ Take Off TV`.
     - Non-collapsing multi-camera cards with real-time video thumbnails.

4. **🛡️ 100% TV Isolation**:
   - Previewing or auditioning cameras in the studio only displays locally on your operator monitor.
   - Nothing is projected onto the congregation TV unless you explicitly click **`📺 Project Live / Add to TV`**!

---
### 📥 Downloads:
- **Windows Installer (Recommended)**: `ZionCast-Setup-1.4.0.exe`
- **Portable Zip**: `ZionCast-Portable-1.4.0.zip`
- **Portable Exe**: `ZionCast-Portable-1.4.0.exe`
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
    ('dist/ZionCast-Setup-1.4.0.exe', 'ZionCast-Setup-1.4.0.exe', 'application/vnd.microsoft.portable-executable'),
    ('dist/ZionCast-Portable-1.4.0.zip', 'ZionCast-Portable-1.4.0.zip', 'application/zip'),
    ('dist/ZionCast-Portable-1.4.0.exe', 'ZionCast-Portable-1.4.0.exe', 'application/vnd.microsoft.portable-executable')
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

print("\n🎉 GitHub Release v1.4.0 published successfully!")
