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

tag = 'v1.3.3'
release_name = 'ZionCast 1.3.3 - 5 New Sacred Sanctuary Themes + Calvary Cross of Glory'
body_notes = """## ZionCast v1.3.3 Release Notes

### ✝️ 5 New Sacred Sanctuary Themes (Featuring Calvary Cross of Glory)
- **✝ Calvary Cross of Glory (Sacred Cross)**: Majestic illuminated Cross standing atop Calvary Hill, radiating rotating golden glory beams and gentle rising embers against a twilight sky.
- **✝ Cross of Majesty (Backlit Cross)**: Refined reverent backlit Cross with golden ambient halo and proportional sizing for 1080p and 4K displays.
- **👑 Royal Crown Velvet (King of Kings)**: Imperial deep purple velvet waves with flowing liquid-gold light ribbons and regal crown luminescence.
- **🍷 Holy Communion Crimson (Communion)**: Deep covenant wine velvet with warm candlelit amber glow and sacred rising light motes.
- **🕊️ Heavenly Dove & Sky (Holy Spirit)**: Serene sapphire-azure heavens with descending silver-white glory light beams.
- **☁️ Shekinah Glory Cloud (Sanctuary Gold)**: Swirling temple bronze, radiant amber, and ivory Shekinah clouds for glorious worship.

### 🎨 Available Everywhere Across ZionCast
- Instantly selectable in **Themes** tab (with distinct ✝ emblems), in **+ Announcement Slide**, and in **Create Custom Theme Builder**.

### 📥 Downloads
- **Windows Installer**: `ZionCast-Setup-1.3.3.exe`
- **Portable Edition**: `ZionCast-Portable-1.3.3.zip`
"""

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

files_to_upload = [
    r'dist\ZionCast-Setup-1.3.3.exe',
    r'dist\ZionCast-Portable-1.3.3.zip'
]

for filepath in files_to_upload:
    if not os.path.exists(filepath):
        print(f"ERROR: Missing required build artifact {filepath}!")
        sys.exit(1)

    filename = os.path.basename(filepath)
    filesize = os.path.getsize(filepath)

    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            chk_req = urllib.request.Request(f'https://api.github.com/repos/GreatDev14/ZionCast/releases/{release_id}/assets', headers=headers)
            with urllib.request.urlopen(chk_req) as resp:
                assets = json.loads(resp.read().decode('utf-8'))

            existing = next((a for a in assets if a['name'] == filename), None)
            if existing:
                if existing['size'] == filesize and existing.get('state') == 'uploaded':
                    print(f"[EXISTS] {filename} ({filesize/1024/1024:.1f} MB) already matches. Skipping.")
                    break
                else:
                    del_req = urllib.request.Request(
                        f"https://api.github.com/repos/GreatDev14/ZionCast/releases/assets/{existing['id']}",
                        headers=headers,
                        method='DELETE'
                    )
                    with urllib.request.urlopen(del_req):
                        pass

            print(f"\n>>> Uploading {filename} ({filesize / 1024 / 1024:.1f} MB) to GitHub Release (Attempt {attempt}/{max_attempts})...")
            conn = http.client.HTTPSConnection('uploads.github.com', timeout=600)
            upload_path = f"/repos/GreatDev14/ZionCast/releases/{release_id}/assets?name={filename}"
            conn.putrequest('POST', upload_path)
            conn.putheader('Authorization', f'Bearer {token}')
            conn.putheader('Content-Type', 'application/octet-stream')
            conn.putheader('Accept', 'application/vnd.github+json')
            conn.putheader('Content-Length', str(filesize))
            conn.putheader('User-Agent', 'ZionCast-Release-Tool')
            conn.endheaders()

            CHUNK = 256 * 1024
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
                    if pct != last_pct and (pct % 20 == 0 or pct == 100):
                        elapsed = time.time() - start_time
                        mbps = (sent_bytes / 1024 / 1024) / max(0.1, elapsed)
                        print(f"  [{pct}%] {sent_bytes / 1024 / 1024:.1f} MB / {filesize / 1024 / 1024:.1f} MB ({mbps:.2f} MB/s)", flush=True)
                        last_pct = pct

            res = conn.getresponse()
            print(f"Upload complete for {filename}: HTTP {res.status} {res.reason}")
            if res.status in (200, 201):
                break
            else:
                raise RuntimeError(f"Unexpected HTTP {res.status}: {res.read().decode('utf-8', 'ignore')}")
        except Exception as err:
            print(f"Attempt {attempt} failed: {err}")
            if attempt < max_attempts:
                time.sleep(3)
            else:
                raise

print("\nAll assets successfully published to GitHub Release v1.3.3!")

