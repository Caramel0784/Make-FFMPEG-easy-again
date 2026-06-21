"""
FFmpeg GUI - a local web app that wraps ffmpeg with a friendly UI.
Run with:  python app.py
Then open: http://127.0.0.1:5000
Requires: ffmpeg installed and on PATH (https://ffmpeg.org/download.html)
"""
import os
import re
import shlex
import subprocess
import uuid
import shutil
import json
from flask import Flask, request, jsonify, send_from_directory, Response, render_template

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = None  # no upload size limit

# track running jobs: job_id -> dict(proc, log, status, output_file)
JOBS = {}


def ffmpeg_available():
    return shutil.which("ffmpeg") is not None


def safe_name(filename):
    name = re.sub(r"[^\w.\-]", "_", filename)
    return f"{uuid.uuid4().hex[:8]}_{name}"


def out_path(ext):
    return os.path.join(OUTPUT_DIR, f"{uuid.uuid4().hex[:10]}.{ext}")


@app.route("/")
def index():
    return render_template("index.html", ffmpeg_ok=ffmpeg_available())


@app.route("/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "no file"}), 400
    f = request.files["file"]
    name = safe_name(f.filename)
    path = os.path.join(UPLOAD_DIR, name)
    f.save(path)
    return jsonify({"path": path, "name": f.filename, "saved_as": name})


def run_job(cmd_list):
    """Start ffmpeg as a background job, return job_id."""
    job_id = uuid.uuid4().hex
    log_path = os.path.join(OUTPUT_DIR, f"{job_id}.log")

    def target():
        with open(log_path, "w") as logf:
            proc = subprocess.Popen(
                cmd_list, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                universal_newlines=True, bufsize=1
            )
            JOBS[job_id]["proc"] = proc
            for line in proc.stdout:
                logf.write(line)
                logf.flush()
                JOBS[job_id]["log"].append(line)
                if len(JOBS[job_id]["log"]) > 500:
                    JOBS[job_id]["log"] = JOBS[job_id]["log"][-500:]
            proc.wait()
            JOBS[job_id]["status"] = "done" if proc.returncode == 0 else "error"
            JOBS[job_id]["returncode"] = proc.returncode

    import threading
    JOBS[job_id] = {"proc": None, "log": [], "status": "running", "returncode": None}
    t = threading.Thread(target=target, daemon=True)
    t.start()
    return job_id


@app.route("/run", methods=["POST"])
def run():
    """Accepts a JSON body: {cmd: [list of args after 'ffmpeg'], output_ext: 'mp4'}"""
    if not ffmpeg_available():
        return jsonify({"error": "ffmpeg not found on PATH. Install it first."}), 400
    data = request.get_json(force=True)
    args = data.get("cmd")
    if not args or not isinstance(args, list):
        return jsonify({"error": "invalid command"}), 400
    full_cmd = ["ffmpeg", "-y"] + args
    job_id = run_job(full_cmd)
    return jsonify({"job_id": job_id, "cmd_str": "ffmpeg -y " + " ".join(shlex.quote(a) for a in args)})


@app.route("/status/<job_id>")
def status(job_id):
    job = JOBS.get(job_id)
    if not job:
        return jsonify({"error": "unknown job"}), 404
    return jsonify({
        "status": job["status"],
        "log": "".join(job["log"][-200:]),
        "returncode": job["returncode"],
    })


@app.route("/cancel/<job_id>", methods=["POST"])
def cancel(job_id):
    job = JOBS.get(job_id)
    if job and job.get("proc") and job["status"] == "running":
        job["proc"].terminate()
        job["status"] = "cancelled"
    return jsonify({"ok": True})


@app.route("/outputs/<path:filename>")
def get_output(filename):
    return send_from_directory(OUTPUT_DIR, filename, as_attachment=True)


@app.route("/uploads/<path:filename>")
def get_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/new_output/<ext>")
def new_output(ext):
    """Reserve an output filename for a given extension, return path + url."""
    p = out_path(ext)
    return jsonify({"path": p, "filename": os.path.basename(p)})


@app.route("/check_path", methods=["POST"])
def check_path():
    """Validate that a locally-typed file path exists, without copying it."""
    data = request.get_json(force=True)
    path = (data.get("path") or "").strip().strip('"')
    if not path:
        return jsonify({"error": "empty path"}), 400
    if not os.path.isfile(path):
        return jsonify({"error": f"File not found: {path}"}), 400
    return jsonify({"path": path, "name": os.path.basename(path)})


@app.route("/probe", methods=["POST"])
def probe():
    """Run ffprobe on a file and return basic info (duration, streams)."""
    data = request.get_json(force=True)
    path = data.get("path")
    if not path or not os.path.exists(path):
        return jsonify({"error": "file not found"}), 400
    if not shutil.which("ffprobe"):
        return jsonify({"error": "ffprobe not found on PATH"}), 400
    cmd = ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return jsonify(json.loads(result.stdout))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/concat_list", methods=["POST"])
def concat_list():
    """Write an ffmpeg concat-demuxer list file from a list of absolute paths."""
    data = request.get_json(force=True)
    paths = data.get("paths", [])
    list_path = os.path.join(UPLOAD_DIR, f"concat_{uuid.uuid4().hex[:8]}.txt")
    with open(list_path, "w") as f:
        for p in paths:
            f.write(f"file '{p}'\n")
    return jsonify({"list_path": list_path})


if __name__ == "__main__":
    print("=" * 60)
    print("FFmpeg GUI starting...")
    print("ffmpeg found on PATH:", ffmpeg_available())
    print("Open http://127.0.0.1:5000 in your browser")
    print("=" * 60)
    app.run(debug=False, port=5000, threaded=True)
