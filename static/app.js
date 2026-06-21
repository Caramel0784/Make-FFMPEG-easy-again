// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ---------- Local path mode (no upload needed) ----------
// Auto-inject a "or paste local file path" field under every <input type=file>
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('input[type=file]').forEach(fileInput => {
    const wrap = document.createElement("div");
    wrap.className = "path-alt";
    wrap.innerHTML = `
      <div class="path-alt-divider">or paste a full file path (skips uploading):</div>
      <input type="text" class="path-text" placeholder="C:\\Videos\\clip.mp4">`;
    fileInput.insertAdjacentElement("afterend", wrap);
  });
});

// Resolve a file input to a usable server-side path:
// - if its paired "path-text" field has a value, validate it via /check_path (no copy)
// - otherwise upload the chosen file
async function resolvePath(inputEl) {
  const pathField = inputEl.parentElement.querySelector(".path-text");
  const typedPath = pathField ? pathField.value.trim() : "";
  if (typedPath) {
    const res = await fetch("/check_path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: typedPath })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.path;
  }
  return uploadFile(inputEl);
}

// ---------- Upload helper ----------
async function uploadFile(inputEl) {
  if (!inputEl.files || !inputEl.files[0]) throw new Error("Please choose a file first.");
  const fd = new FormData();
  fd.append("file", inputEl.files[0]);
  const res = await fetch("/upload", { method: "POST", body: fd });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.path; // absolute path on server
}

async function newOutput(ext) {
  const res = await fetch(`/new_output/${ext}`);
  return await res.json(); // {path, filename}
}

// ---------- Console / job runner ----------
let currentJobId = null;
let pollTimer = null;

function showCmd(cmdStr) {
  document.getElementById("cmd_preview").textContent = cmdStr;
}
function showLog(text) {
  document.getElementById("log_output").textContent = text;
}
function setDownload(filename) {
  const area = document.getElementById("download_area");
  area.innerHTML = `<a href="/outputs/${filename}" download>⬇️ Download result (${filename})</a>`;
}
function clearDownload() {
  document.getElementById("download_area").innerHTML = "";
}

async function runFfmpeg(args, outFilename) {
  clearDownload();
  showLog("Starting...");
  document.getElementById("cancel_btn").style.display = "inline-block";
  const res = await fetch("/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cmd: args })
  });
  const data = await res.json();
  if (data.error) {
    showLog("Error: " + data.error);
    document.getElementById("cancel_btn").style.display = "none";
    return;
  }
  showCmd(data.cmd_str);
  currentJobId = data.job_id;
  pollStatus(outFilename);
}

function pollStatus(outFilename) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!currentJobId) return;
    const res = await fetch(`/status/${currentJobId}`);
    const data = await res.json();
    showLog(data.log || "(working...)");
    if (data.status === "done") {
      clearInterval(pollTimer);
      document.getElementById("cancel_btn").style.display = "none";
      setDownload(outFilename);
    } else if (data.status === "error" || data.status === "cancelled") {
      clearInterval(pollTimer);
      document.getElementById("cancel_btn").style.display = "none";
      showLog(data.log + `\n\n[${data.status.toUpperCase()}]`);
    }
  }, 800);
}

async function cancelJob() {
  if (!currentJobId) return;
  await fetch(`/cancel/${currentJobId}`, { method: "POST" });
}

// ---------- TRIM ----------
async function trimRun() {
  try {
    const inPath = await resolvePath(document.getElementById("trim_file"));
    const start = document.getElementById("trim_start").value || "00:00:00";
    const end = document.getElementById("trim_end").value;
    const reencode = document.getElementById("trim_reencode").checked;
    const { path: outPath, filename } = await newOutput("mp4");
    let args;
    if (reencode) {
      args = ["-i", inPath, "-ss", start];
      if (end) args.push("-to", end);
      args.push("-c:v", "libx264", "-c:a", "aac", outPath);
    } else {
      args = ["-ss", start, "-i", inPath];
      if (end) args.push("-to", end);
      args.push("-c", "copy", outPath);
    }
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- MERGE CLIPS ----------
let mergeFiles = [];
async function addToMergeList() {
  try {
    const fileInput = document.getElementById("merge_file");
    const path = await resolvePath(fileInput);
    const pathField = fileInput.parentElement.querySelector(".path-text");
    const name = (pathField && pathField.value.trim()) ? path.split(/[\\/]/).pop() : fileInput.files[0].name;
    mergeFiles.push({ path, name });
    renderMergeList();
    fileInput.value = "";
    if (pathField) pathField.value = "";
  } catch (e) { showLog("Error: " + e.message); }
}
function renderMergeList() {
  const ol = document.getElementById("merge_list");
  ol.innerHTML = "";
  mergeFiles.forEach((f, i) => {
    const li = document.createElement("li");
    li.textContent = f.name;
    const rm = document.createElement("button");
    rm.textContent = "remove";
    rm.onclick = () => { mergeFiles.splice(i, 1); renderMergeList(); };
    li.appendChild(rm);
    ol.appendChild(li);
  });
}
async function mergeRun() {
  try {
    if (mergeFiles.length < 2) throw new Error("Add at least 2 clips.");
    const reencode = document.getElementById("merge_reencode").checked;
    const { path: outPath, filename } = await newOutput("mp4");
    if (!reencode) {
      const listRes = await fetch("/concat_list", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: mergeFiles.map(f => f.path) })
      });
      const { list_path } = await listRes.json();
      const args = ["-f", "concat", "-safe", "0", "-i", list_path, "-c", "copy", outPath];
      runFfmpeg(args, filename);
    } else {
      // build filter_complex concat for files that may differ in codec/res
      let args = [];
      mergeFiles.forEach(f => { args.push("-i", f.path); });
      let filter = "";
      for (let i = 0; i < mergeFiles.length; i++) filter += `[${i}:v:0][${i}:a:0]`;
      filter += `concat=n=${mergeFiles.length}:v=1:a=1[outv][outa]`;
      args.push("-filter_complex", filter, "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-c:a", "aac", outPath);
      runFfmpeg(args, filename);
    }
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- MERGE AUDIO + VIDEO ----------
async function avRun() {
  try {
    const videoPath = await resolvePath(document.getElementById("av_video"));
    const audioPath = await resolvePath(document.getElementById("av_audio"));
    const mode = document.getElementById("av_mode").value;
    const shortest = document.getElementById("av_shortest").checked;
    const { path: outPath, filename } = await newOutput("mp4");
    let args;
    if (mode === "replace") {
      args = ["-i", videoPath, "-i", audioPath, "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac"];
    } else {
      args = ["-i", videoPath, "-i", audioPath,
        "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac"];
    }
    if (shortest) args.push("-shortest");
    args.push(outPath);
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- EXTRACT AUDIO ----------
async function extractRun() {
  try {
    const inPath = await resolvePath(document.getElementById("ext_file"));
    const fmt = document.getElementById("ext_format").value;
    const { path: outPath, filename } = await newOutput(fmt);
    const codec = fmt === "mp3" ? "libmp3lame" : fmt === "aac" ? "aac" : fmt === "flac" ? "flac" : fmt === "ogg" ? "libvorbis" : "pcm_s16le";
    const args = ["-i", inPath, "-vn", "-acodec", codec, outPath];
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- CONVERT ----------
async function convertRun() {
  try {
    const inPath = await resolvePath(document.getElementById("conv_file"));
    const fmt = document.getElementById("conv_format").value;
    const { path: outPath, filename } = await newOutput(fmt);
    const args = ["-i", inPath, outPath];
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- COMPRESS / RESIZE ----------
async function compressRun() {
  try {
    const inPath = await resolvePath(document.getElementById("comp_file"));
    const crf = document.getElementById("comp_crf").value;
    const scale = document.getElementById("comp_scale").value;
    const { path: outPath, filename } = await newOutput("mp4");
    const args = ["-i", inPath];
    if (scale) args.push("-vf", `scale=${scale}`);
    args.push("-c:v", "libx264", "-crf", crf, "-preset", "medium", "-c:a", "aac", "-b:a", "128k", outPath);
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- SPEED ----------
async function speedRun() {
  try {
    const inPath = await resolvePath(document.getElementById("spd_file"));
    const speed = parseFloat(document.getElementById("spd_val").value);
    const matchAudio = document.getElementById("spd_audio").checked;
    const { path: outPath, filename } = await newOutput("mp4");
    const vFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`;
    let args = ["-i", inPath];
    if (matchAudio) {
      // atempo only supports 0.5-2.0 per filter, chain if needed
      let atempoChain = [];
      let remaining = speed;
      if (remaining < 0.5) {
        while (remaining < 0.5) { atempoChain.push(0.5); remaining /= 0.5; }
        atempoChain.push(remaining);
      } else if (remaining > 2.0) {
        while (remaining > 2.0) { atempoChain.push(2.0); remaining /= 2.0; }
        atempoChain.push(remaining);
      } else {
        atempoChain.push(remaining);
      }
      const aFilter = atempoChain.map(v => `atempo=${v.toFixed(4)}`).join(",");
      args.push("-filter_complex", `[0:v]${vFilter}[v];[0:a]${aFilter}[a]`, "-map", "[v]", "-map", "[a]");
    } else {
      args.push("-vf", vFilter, "-an");
    }
    args.push("-c:v", "libx264", "-c:a", "aac", outPath);
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- ROTATE ----------
async function rotateRun() {
  try {
    const inPath = await resolvePath(document.getElementById("rot_file"));
    const action = document.getElementById("rot_action").value;
    const { path: outPath, filename } = await newOutput("mp4");
    const map = {
      "90cw": "transpose=1",
      "90ccw": "transpose=2",
      "180": "transpose=2,transpose=2",
      "hflip": "hflip",
      "vflip": "vflip"
    };
    const args = ["-i", inPath, "-vf", map[action], "-c:a", "copy", outPath];
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- GIF ----------
async function gifRun() {
  try {
    const inPath = await resolvePath(document.getElementById("gif_file"));
    const start = document.getElementById("gif_start").value || "00:00:00";
    const dur = document.getElementById("gif_dur").value || "3";
    const width = document.getElementById("gif_width").value || "480";
    const fps = document.getElementById("gif_fps").value || "12";
    const { path: outPath, filename } = await newOutput("gif");
    const args = ["-ss", start, "-t", dur, "-i", inPath,
      "-vf", `fps=${fps},scale=${width}:-1:flags=lanczos`,
      "-loop", "0", outPath];
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- SCREENSHOT ----------
async function thumbRun() {
  try {
    const inPath = await resolvePath(document.getElementById("thumb_file"));
    const time = document.getElementById("thumb_time").value || "00:00:01";
    const { path: outPath, filename } = await newOutput("png");
    const args = ["-ss", time, "-i", inPath, "-frames:v", "1", outPath];
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- SUBTITLES ----------
async function subsRun() {
  try {
    const videoPath = await resolvePath(document.getElementById("sub_video"));
    const subPath = await resolvePath(document.getElementById("sub_file"));
    const mode = document.getElementById("sub_mode").value;
    if (mode === "burn") {
      const { path: outPath, filename } = await newOutput("mp4");
      const escaped = subPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      const args = ["-i", videoPath, "-vf", `subtitles='${escaped}'`, "-c:a", "copy", outPath];
      runFfmpeg(args, filename);
    } else {
      const { path: outPath, filename } = await newOutput("mkv");
      const args = ["-i", videoPath, "-i", subPath, "-map", "0", "-map", "1",
        "-c", "copy", "-c:s", "srt", outPath];
      runFfmpeg(args, filename);
    }
  } catch (e) { showLog("Error: " + e.message); }
}

// ---------- CUSTOM ----------
async function customRun() {
  try {
    const f1 = document.getElementById("cust_file1");
    const f2 = document.getElementById("cust_file2");
    let in1 = "", in2 = "";
    const path1Field = f1.parentElement.querySelector(".path-text");
    const path2Field = f2.parentElement.querySelector(".path-text");
    if (f1.files[0] || (path1Field && path1Field.value.trim())) in1 = await resolvePath(f1);
    if (f2.files[0] || (path2Field && path2Field.value.trim())) in2 = await resolvePath(f2);
    const ext = document.getElementById("cust_ext").value || "mp4";
    const { path: outPath, filename } = await newOutput(ext);
    let template = document.getElementById("cust_args").value;
    template = template.replaceAll("{IN}", `"${in1}"`)
                        .replaceAll("{IN2}", `"${in2}"`)
                        .replaceAll("{OUT}", `"${outPath}"`);
    const args = template.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"(.*)"$/, "$1"));
    runFfmpeg(args, filename);
  } catch (e) { showLog("Error: " + e.message); }
}
