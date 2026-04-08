(() => {
  "use strict";

  const video = document.getElementById("video");
  const canvas = document.getElementById("view");
  const frame = document.getElementById("frame");
  const ctx = canvas.getContext("2d");

  const statusChip = document.getElementById("statusChip");
  const handStatus = document.getElementById("handStatus");
  const fpsEl = document.getElementById("fps");
  const shotCountEl = document.getElementById("shotCount");

  const funSlider = document.getElementById("funSlider");
  const funValue = document.getElementById("funValue");
  const burstSlider = document.getElementById("burst");
  const burstValue = document.getElementById("burstValue");
  const gravitySlider = document.getElementById("gravity");
  const gravityValue = document.getElementById("gravityValue");
  const trailSlider = document.getElementById("trail");
  const trailValue = document.getElementById("trailValue");

  const toggleWebcam = document.getElementById("toggleWebcam");
  const clearBtn = document.getElementById("clear");

  const shards = [];
  const sparks = [];
  const ripples = [];

  const textBits = [
    "HTML",
    "IN",
    "CANVAS",
    "API",
    "IS",
    "FUN",
    "BEND",
    "THUMB",
    "TO",
    "FIRE",
  ];

  const state = {
    pointer: { x: 0.5, y: 0.5 },
    pointerSmooth: { x: 0.5, y: 0.5 },
    hasHand: false,
    pinchDown: false,
    shots: 0,
    running: false,
    ready: false,
  };

  let hands = null;
  let camera = null;
  let lastTime = performance.now();
  let fps = 0;

  function setChip(text, mode = "info") {
    statusChip.textContent = text;
    statusChip.style.borderColor =
      mode === "ok" ? "rgba(46, 148, 255, 0.6)" : "rgba(240, 76, 43, 0.5)";
    statusChip.style.background =
      mode === "ok" ? "rgba(46, 148, 255, 0.14)" : "rgba(240, 76, 43, 0.14)";
  }

  function resize() {
    const rect = frame.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function updateHud() {
    funValue.textContent = `${funSlider.value}%`;
    burstValue.textContent = burstSlider.value;
    gravityValue.textContent = gravitySlider.value;
    trailValue.textContent = trailSlider.value;
    shotCountEl.textContent = String(state.shots);
  }

  function spawnBurst(x, y, dir) {
    const burstCount = Number(burstSlider.value);
    const speed = 3 + Number(funSlider.value) / 20;
    const baseAngle = Math.atan2(dir.y, dir.x);

    ripples.push({ x, y, life: 0, max: 18 });

    for (let i = 0; i < burstCount; i += 1) {
      const angle = baseAngle + (Math.random() - 0.5) * 0.9;
      const magnitude = speed + Math.random() * 3;
      shards.push({
        x,
        y,
        vx: Math.cos(angle) * magnitude,
        vy: Math.sin(angle) * magnitude - 1.2,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 120 + Math.random() * 40,
        text: textBits[Math.floor(Math.random() * textBits.length)],
        size: 11 + Math.random() * 6,
        hue: 18 + Math.random() * 40,
      });
    }

    for (let i = 0; i < 18; i += 1) {
      sparks.push({
        x,
        y,
        vx: dir.x * (4 + Math.random() * 3) + (Math.random() - 0.5) * 2,
        vy: dir.y * (4 + Math.random() * 3) + (Math.random() - 0.5) * 2,
        life: 40 + Math.random() * 30,
      });
    }
  }

  function drawVideo() {
    if (!video.videoWidth) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const vidW = video.videoWidth;
    const vidH = video.videoHeight;
    const scale = Math.max(w / vidW, h / vidH);
    const drawW = vidW * scale;
    const drawH = vidH * scale;
    const dx = (w - drawW) / 2;
    const dy = (h - drawH) / 2;

    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.filter = "contrast(1.05) saturate(1.05)";
    ctx.drawImage(video, dx, dy, drawW, drawH);
    ctx.restore();
  }

  function drawCrosshair(x, y) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x - 8, y);
    ctx.moveTo(x + 18, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 8);
    ctx.moveTo(x, y + 18);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.restore();
  }

  function renderFX() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const gravity = Number(gravitySlider.value) / 10;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const ripple = ripples[i];
      ripple.life += 1;
      const progress = ripple.life / ripple.max;
      const radius = 10 + progress * 60;
      ctx.strokeStyle = `rgba(248, 215, 86, ${0.5 - progress * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (ripple.life >= ripple.max) ripples.splice(i, 1);
    }

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const spark = sparks[i];
      spark.x += spark.vx;
      spark.y += spark.vy;
      spark.vx *= 0.96;
      spark.vy *= 0.96;
      spark.life -= 1;
      ctx.fillStyle = `rgba(248, 215, 86, ${spark.life / 80})`;
      ctx.fillRect(spark.x, spark.y, 2, 2);
      if (spark.life <= 0) sparks.splice(i, 1);
    }

    ctx.restore();

    ctx.save();
    ctx.font = "600 14px JetBrains Mono";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = shards.length - 1; i >= 0; i -= 1) {
      const shard = shards[i];
      shard.x += shard.vx;
      shard.y += shard.vy;
      shard.vy += gravity * 0.08;
      shard.vx *= 0.985;
      shard.vy *= 0.985;
      shard.rot += shard.vr;
      shard.life -= 1;

      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(shard.rot);
      ctx.fillStyle = `hsla(${shard.hue}, 90%, 70%, ${Math.max(0, shard.life / 120)})`;
      ctx.fillText(shard.text, 0, 0);
      ctx.restore();

      if (shard.x < -50 || shard.x > w + 50 || shard.y > h + 60 || shard.life <= 0) {
        shards.splice(i, 1);
      }
    }

    ctx.restore();
  }

  function renderOverlay() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(10, 12, 18, ${Number(trailSlider.value) / 100})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function render() {
    const now = performance.now();
    const delta = now - lastTime;
    fps = lerp(fps, 1000 / Math.max(1, delta), 0.08);
    lastTime = now;
    fpsEl.textContent = `FPS: ${fps.toFixed(0)}`;

    drawVideo();
    renderOverlay();

    state.pointerSmooth.x = lerp(state.pointerSmooth.x, state.pointer.x, 0.25);
    state.pointerSmooth.y = lerp(state.pointerSmooth.y, state.pointer.y, 0.25);

    const px = state.pointerSmooth.x * canvas.clientWidth;
    const py = state.pointerSmooth.y * canvas.clientHeight;

    drawCrosshair(px, py);
    renderFX();

    requestAnimationFrame(render);
  }

  function handlePointer(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    state.pointer = { x, y };
  }

  function manualFire() {
    const px = state.pointerSmooth.x * canvas.clientWidth;
    const py = state.pointerSmooth.y * canvas.clientHeight;
    const dir = { x: 1, y: -0.3 };
    spawnBurst(px, py, dir);
    state.shots += 1;
    updateHud();
  }

  function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      state.hasHand = false;
      handStatus.textContent = "READY · HAND: --";
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    state.hasHand = true;

    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];
    const indexBase = landmarks[5];
    const pinkyBase = landmarks[17];
    const wrist = landmarks[0];

    const scale = Math.hypot(indexBase.x - pinkyBase.x, indexBase.y - pinkyBase.y);
    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    const pinch = pinchDist < scale * 0.6;

    state.pointer = { x: 1 - indexTip.x, y: indexTip.y };

    const dir = {
      x: (indexTip.x - wrist.x) * -1,
      y: indexTip.y - wrist.y,
    };

    if (pinch && !state.pinchDown) {
      state.pinchDown = true;
      const px = state.pointerSmooth.x * canvas.clientWidth;
      const py = state.pointerSmooth.y * canvas.clientHeight;
      spawnBurst(px, py, dir);
      state.shots += 1;
      updateHud();
    } else if (!pinch) {
      state.pinchDown = false;
    }

    handStatus.textContent = `READY · HAND: ${results.multiHandedness?.[0]?.label || "ON"}`;
  }

  async function startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      state.running = true;
      setChip("Webcam live", "ok");
      handStatus.textContent = "READY · HAND: SEEKING";
    } catch (err) {
      setChip("Webcam blocked", "error");
      console.error(err);
    }
  }

  function stopWebcam() {
    const stream = video.srcObject;
    if (stream && stream.getTracks) {
      stream.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
    state.running = false;
    setChip("Webcam stopped", "error");
  }

  function initHands() {
    if (!window.Hands || !window.Camera) {
      setChip("MediaPipe unavailable (fallback ok)", "error");
      return;
    }

    hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults(onHandResults);

    camera = new Camera(video, {
      onFrame: async () => {
        if (video.videoWidth) {
          await hands.send({ image: video });
        }
      },
      width: 1280,
      height: 720,
    });

    camera.start();
  }

  function clearFX() {
    shards.length = 0;
    sparks.length = 0;
    ripples.length = 0;
  }

  funSlider.addEventListener("input", updateHud);
  burstSlider.addEventListener("input", updateHud);
  gravitySlider.addEventListener("input", updateHud);
  trailSlider.addEventListener("input", updateHud);

  toggleWebcam.addEventListener("click", async () => {
    if (state.running) {
      stopWebcam();
      if (camera) camera.stop();
      return;
    }
    await startWebcam();
    initHands();
  });

  clearBtn.addEventListener("click", clearFX);

  window.addEventListener("resize", resize);
  canvas.addEventListener("mousemove", handlePointer);
  canvas.addEventListener("click", manualFire);

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      manualFire();
    }
  });

  resize();
  updateHud();
  setChip("Allow webcam to start", "ok");

  startWebcam().then(() => {
    initHands();
  });

  requestAnimationFrame(render);
})();
