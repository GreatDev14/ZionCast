# ZionCast Downloads Hub

This directory hosts download packages for the ZionCast marketing website.

### Local Development:
When testing locally, place your compiled desktop installer binaries here:
- `ZionCast-Setup-1.0.0.exe` (Windows Installer)
- `ZionCast-Portable-1.0.0.zip` (Windows Portable)
- `ZionCast-1.0.0.AppImage` (Linux Universal)
- `zioncast_1.0.0_amd64.deb` (Debian/Ubuntu)

### Vercel & Production Web Hosting:
On Vercel (and other static hosts), file sizes above 50 MB are restricted. Therefore, when deployed to Vercel, the download buttons automatically route directly to the project's high-speed **GitHub Releases**:
`https://github.com/GreatDev14/ZionCast/releases/download/v1.0.0/`

To publish a release:
1. Compile your installer with `npm run pack:fast` or `npm run dist`.
2. Create a new release tag `v1.0.0` on GitHub.
3. Attach `ZionCast-Setup-1.0.0.exe` and `ZionCast-Portable-1.0.0.zip` to the release assets.
