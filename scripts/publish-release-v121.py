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

tag = 'v1.2.1'
release_name = 'ZionCast 1.2.1 - YouTube Live Playback & Camera TV Output Fix'
body_notes = """## ZionCast v1.2.1 Release Notes

### 🔴 YouTube Live & Video Streaming Fixed End-to-End
- **Instant Stream Playback (No More 0:00 Buffering)**: Fixed duplicate `Access-Control-Allow-Origin` header injection on `googlevideo.com` CDN media segments and eliminated `iframe_api` cross-origin `postMessage` stalls so YouTube Live sermons, RCCG Holy Ghost Service streams, and worship loops play immediately with audio.
- **Clean Fullscreen Video**: Removed the orange slide title badge from floating over the middle of YouTube streams and church media flyers, and synchronized dynamic local server ports automatically.
- **Seamless Mode Switching**: Going live on any Song or Scripture after a YouTube or Media item automatically restores lyric visibility (`Theme Only` / `Clear Text` auto-reset).

### 🎥 Live Camera Feed on Audience TV Fixed
- **Full Opacity TV Camera Rendering**: Fixed CSS `.camera-active` opacity activation on the TV Output layer (`#display-camera-layer`) so Preacher Mode and Worship Camera Background display brightly and clearly on the church TV/projector.
- **Windows Exclusive Camera Driver Support (DroidCam, Camo, OBS, USB/HDMI)**: Matched hardware stream resolutions across windows, added device-label matching across Electron windows, and added automatic Control Desk handle release when single-client Windows camera drivers require exclusive hardware access for the TV Output.

### 📱 Mobile Phone Remote Enhancements (Included from v1.2.0 + Polished)
- **📖 1-Tap Bible Scripture Lookup & Live Projection** (KJV, RSV, GNT) directly from any smartphone on Wi-Fi, plus automatic Sunday Order of Service queueing.
- **🤫 Secret Preacher Confidence Screen Notes** sent privately from your phone to `/stage` without appearing on the main congregation TV.

### 📥 Downloads
- **Windows Installer**: `ZionCast-Setup-1.2.1.exe`
- **Portable Edition**: `ZionCast-Portable-1.2.1.zip`
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
    r'dist\ZionCast-Setup-1.2.1.exe',
    r'dist\ZionCast-Portable-1.2.1.zip'
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
                    print(f"Deleting incomplete/old asset {filename} (ID {existing['id']})...")
                    del_req = urllib.request.Request(
                        f"https://api.github.com/repos/GreatDev14/ZionCast/releases/assets/{existing['id']}",
                        headers=headers,
                        method='DELETE'
                    )
                    with urllib.request.urlopen(del_req) as del_resp:
                        print(f"Deleted old asset: HTTP {del_resp.status}")

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
                    if pct != last_pct and (pct % 10 == 0 or pct == 100):
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

print("\nAll assets successfully published to GitHub Release v1.2.1!")

