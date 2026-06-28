# FFmpeg GUI

A local web app that gives ffmpeg a friendly point-and-click interface.
Runs entirely on your machine — no uploads to any server, no internet needed.

## Features
- Trim / cut a clip (lossless or re-encoded)
- Merge clips together (clip1 + clip2 + ...)
- Merge / replace / mix audio with a video
- Extract audio (mp3, wav, aac, flac, ogg)
- Convert between video/audio formats
- Compress + resize video (quality slider + resolution presets)
- Change playback speed (with optional pitch-matched audio)
- Rotate / flip video
- Make a GIF from a video clip
- Grab a screenshot/thumbnail at any timestamp
- Burn-in or soft-add subtitles (.srt/.ass)
- **Custom Command** tab — type raw ffmpeg arguments using `{IN}`, `{IN2}`, `{OUT}`
  placeholders for anything not covered by the buttons above

Every action shows you the exact `ffmpeg ...` command it ran, so over time
you'll pick up the command-line syntax too.

## Setup

1. Install ffmpeg (must be on your system PATH):
   - **Windows**: `winget install ffmpeg` or download from https://ffmpeg.org/download.html
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt install ffmpeg`

   Check it worked: open a terminal and run `ffmpeg -version`.

2. Install Python dependencies:
   ```
   pip install -r requirements.txt
   ```

3. Run the app:
   ```
   python app.py
   ```

4. Open your browser to **http://127.0.0.1:5000**

<<<<<<< HEAD
=======
# Auto
- **open run.bat**
>>>>>>> 081d6c0ff28aa97bebc57c300b4569f33c5b9db8
## Notes
- Uploaded files are saved into `uploads/`, results into `outputs/`. Both are
  ignored by nothing automatically — clear them out periodically if disk space matters.
- The "lossless cut" trim option only cuts on the nearest keyframe (very fast,
  no quality loss, but the start time may shift by up to a second or two).
  Check "Re-encode" for a frame-exact cut.
- "Merge Clips" with re-encode ON uses a filter_complex concat, which works
  even if your clips have different resolutions/codecs/frame rates. With it
  OFF, it uses the fast stream-copy concat, which requires identical codecs.
- This app binds to 127.0.0.1 (localhost) only — it's not exposed to your
  network by default.
