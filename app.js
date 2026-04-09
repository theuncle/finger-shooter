(() => {
  "use strict";

  const canvas = document.getElementById("view");
  const video = document.getElementById("video");
  const frame = document.getElementById("frame");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const shotsEl = document.getElementById("shots");
  const fpsEl = document.getElementById("fps");
  const levelEl = document.getElementById("level");
  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");

  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayBody = document.getElementById("overlayBody");
  const overlayHint = document.getElementById("overlayHint");

  const startBtn = document.getElementById("start");
  const handBtn = document.getElementById("hand");
  const resetBtn = document.getElementById("reset");

  const levels = [
    {
      name: "Mesa Dawn",
      skyTop: "#5d3b25",
      skyMid: "#c98a52",
      skyBottom: "#3b2b21",
      sun: "rgba(255, 214, 114, 0.35)",
      mountains: "#533725",
      ground: "#6b4a34",
      cabin: "#3d2a20",
      spawnInterval: 1200,
      lifeMin: 1800,
      lifeMax: 2600,
      goal: 8,
    },
    {
      name: "Canyon Heat",
      skyTop: "#2c3e57",
      skyMid: "#b05c3a",
      skyBottom: "#1d1f2a",
      sun: "rgba(255, 160, 90, 0.4)",
      mountains: "#3c2b2e",
      ground: "#5b392d",
      cabin: "#2e1f1a",
      spawnInterval: 950,
      lifeMin: 1500,
      lifeMax: 2200,
      goal: 12,
    },
    {
      name: "Neon Dusk",
      skyTop: "#2f1f4d",
      skyMid: "#6840a8",
      skyBottom: "#20152f",
      sun: "rgba(100, 220, 240, 0.3)",
      mountains: "#2c2344",
      ground: "#3c2f4d",
      cabin: "#24182a",
      spawnInterval: 760,
      lifeMin: 1200,
      lifeMax: 1900,
      goal: 16,
    },
  ];

  const bandits = [
    { name: "El Rojo", color: "#ff5c36", points: 120 },
    { name: "El Polvo", color: "#f9b35d", points: 90 },
    { name: "La Sombra", color: "#33d0b0", points: 150 },
  ];

  const state = {
    screen: "intro",
    running: false,
    score: 0,
    lives: 3,
    shots: 0,
    pointer: { x: 0.5, y: 0.5 },
    pointerSmooth: { x: 0.5, y: 0.5 },
    spawnTimer: 0,
    spawnInterval: levels[0].spawnInterval,
    cooldown: 0,
    lastTime: performance.now(),
    usingHand: false,
    pinchDown: false,
    levelIndex: 0,
    levelHits: 0,
  };

  const targets = [];
  const bursts = [];

  let hands = null;
  let camera = null;
  let fps = 0;
  let audioCtx = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function unlockAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
  }

  function playTone(freq, duration, type, gain) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(audioCtx.destination);
    osc.start();
    amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration + 0.02);
  }

  function playSound(kind) {
    unlockAudio();
    if (!audioCtx) return;
    if (kind === "shot") playTone(220, 0.12, "square", 0.15);
    if (kind === "hit") playTone(680, 0.15, "triangle", 0.2);
    if (kind === "miss") playTone(140, 0.2, "sawtooth", 0.12);
    if (kind === "level") {
      playTone(440, 0.18, "triangle", 0.2);
      setTimeout(() => playTone(660, 0.18, "triangle", 0.2), 120);
    }
    if (kind === "gameover") {
      playTone(260, 0.25, "sawtooth", 0.18);
      setTimeout(() => playTone(180, 0.25, "sawtooth", 0.18), 160);
      setTimeout(() => playTone(120, 0.25, "sawtooth", 0.18), 320);
    }
    if (kind === "victory") {
      playTone(520, 0.2, "triangle", 0.22);
      setTimeout(() => playTone(660, 0.2, "triangle", 0.22), 140);
      setTimeout(() => playTone(780, 0.25, "triangle", 0.22), 300);
    }
  }

  function updateHud() {
    scoreEl.textContent = state.score.toString().padStart(6, "0");
    livesEl.textContent = state.lives.toString().padStart(2, "0");
    shotsEl.textContent = state.shots.toString().padStart(3, "0");
    levelEl.textContent = (state.levelIndex + 1).toString().padStart(2, "0");
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setOverlay(title, body, hint) {
    overlayTitle.textContent = title;
    overlayBody.textContent = body;
    overlayHint.textContent = hint;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function levelConfig() {
    return levels[state.levelIndex];
  }

  function startLevel(index) {
    state.levelIndex = index;
    state.levelHits = 0;
    state.spawnTimer = 0;
    state.spawnInterval = levels[index].spawnInterval;
    targets.length = 0;
    bursts.length = 0;
    state.running = true;
    state.screen = "playing";
    hideOverlay();
    hintEl.textContent = "Bandoleros a la vista. No dejes que escapen.";
    updateHud();
    playSound("level");
  }

  function endLevel() {
    state.running = false;
    state.screen = "intermission";
    setOverlay(
      "Nivel completado",
      `Has completado ${levels[state.levelIndex].name}`,
      "Pulsa cualquier tecla para continuar"
    );
  }

  function winGame() {
    state.running = false;
    state.screen = "victory";
    setOverlay("Victoria", "El desierto es tuyo", "Pulsa cualquier tecla para reiniciar");
    playSound("victory");
  }

  function gameOver() {
    state.running = false;
    state.screen = "gameover";
    setOverlay("Game Over", "Los bandoleros ganan", "Pulsa cualquier tecla para reintentar");
    playSound("gameover");
  }

  function spawnTarget() {
    const type = bandits[Math.floor(Math.random() * bandits.length)];
    const depth = Math.random() < 0.55 ? 0 : 1;
    const scale = depth === 0 ? 1 : 0.75;
    const horizon = canvas.clientHeight * 0.48;
    const ground = canvas.clientHeight * 0.72;
    const y = depth === 0 ? rand(horizon + 30, ground - 40) : rand(horizon - 10, horizon + 60);
    const x = rand(120, canvas.clientWidth - 120);
    const level = levelConfig();

    targets.push({
      id: Math.random().toString(16).slice(2),
      type,
      x,
      y,
      scale,
      depth,
      born: performance.now(),
      life: rand(level.lifeMin, level.lifeMax),
      sway: rand(-0.5, 0.5),
      hit: false,
      hitTime: 0,
      rot: 0,
      fall: rand(1.2, 2.2),
      alpha: 1,
    });
  }

  function removeTarget(idx, escaped) {
    targets.splice(idx, 1);
    if (escaped) {
      state.lives = Math.max(0, state.lives - 1);
      updateHud();
      if (state.lives === 0) {
        gameOver();
      }
    }
  }

  function markHit(target) {
    target.hit = true;
    target.hitTime = performance.now();
  }

  function shoot() {
    if (state.screen !== "playing") return;
    if (state.cooldown > 0) return;

    state.cooldown = 220;
    state.shots += 1;
    updateHud();
    playSound("shot");

    const px = state.pointerSmooth.x * canvas.clientWidth;
    const py = state.pointerSmooth.y * canvas.clientHeight;

    let hitIndex = -1;
    for (let i = targets.length - 1; i >= 0; i -= 1) {
      const t = targets[i];
      if (t.hit) continue;
      const size = 42 * t.scale;
      const hit =
        px > t.x - size &&
        px < t.x + size &&
        py > t.y - size * 1.2 &&
        py < t.y + size * 1.3;
      if (hit) {
        hitIndex = i;
        state.score += t.type.points;
        state.levelHits += 1;
        bursts.push({ x: px, y: py, life: 0 });
        markHit(t);
        playSound("hit");
        break;
      }
    }

    if (hitIndex < 0) {
      bursts.push({ x: px, y: py, life: 0, miss: true });
      playSound("miss");
    }

    if (state.levelHits >= levelConfig().goal) {
      if (state.levelIndex === levels.length - 1) {
        winGame();
      } else {
        endLevel();
      }
    }
  }

  function drawBackground(level) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, level.skyTop);
    sky.addColorStop(0.4, level.skyMid);
    sky.addColorStop(1, level.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = level.sun;
    ctx.beginPath();
    ctx.arc(w * 0.76, h * 0.18, h * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = level.mountains;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w * 0.2, h * 0.36);
    ctx.lineTo(w * 0.4, h * 0.52);
    ctx.lineTo(w * 0.6, h * 0.34);
    ctx.lineTo(w * 0.8, h * 0.48);
    ctx.lineTo(w, h * 0.4);
    ctx.lineTo(w, h * 0.6);
    ctx.lineTo(0, h * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = level.ground;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.62);
    ctx.lineTo(w * 0.16, h * 0.58);
    ctx.lineTo(w * 0.32, h * 0.66);
    ctx.lineTo(w * 0.52, h * 0.6);
    ctx.lineTo(w * 0.7, h * 0.66);
    ctx.lineTo(w, h * 0.62);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    drawCabin(w * 0.18, h * 0.62, 1.1, level.cabin);
    drawCabin(w * 0.72, h * 0.6, 1.2, level.cabin);
    drawCabin(w * 0.45, h * 0.65, 0.9, level.cabin);

    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect(rand(0, w), rand(h * 0.62, h), rand(2, 6), rand(2, 6));
    }
  }

  function drawCabin(x, y, scale, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fillRect(-40, -30, 80, 40);
    ctx.fillStyle = "#2a1c15";
    ctx.fillRect(-18, -10, 20, 20);
    ctx.fillStyle = "#4f3728";
    ctx.beginPath();
    ctx.moveTo(-50, -30);
    ctx.lineTo(0, -60);
    ctx.lineTo(50, -30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBandit(t) {
    const { x, y, scale, type, hit, rot, alpha } = t;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 45, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = type.color;
    ctx.beginPath();
    ctx.roundRect(-18, 2, 36, 38, 8);
    ctx.fill();

    ctx.fillStyle = "#1b0f0a";
    ctx.beginPath();
    ctx.arc(0, -4, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2b1c15";
    ctx.fillRect(-20, -24, 40, 12);
    ctx.fillRect(-10, -40, 20, 16);

    ctx.fillStyle = "#101014";
    ctx.fillRect(-12, 12, 24, 10);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-2, -6);
    ctx.moveTo(2, -6);
    ctx.lineTo(6, -6);
    ctx.stroke();

    if (hit) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.beginPath();
      ctx.moveTo(-18, -6);
      ctx.lineTo(18, 16);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBurst(burst) {
    const radius = burst.miss ? 14 : 20;
    ctx.save();
    ctx.globalAlpha = 1 - burst.life / 18;
    ctx.strokeStyle = burst.miss ? "rgba(255, 92, 54, 0.9)" : "rgba(255, 208, 66, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, radius + burst.life * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrosshair() {
    const px = state.pointerSmooth.x * canvas.clientWidth;
    const py = state.pointerSmooth.y * canvas.clientHeight;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 20, py);
    ctx.lineTo(px - 8, py);
    ctx.moveTo(px + 20, py);
    ctx.lineTo(px + 8, py);
    ctx.moveTo(px, py - 20);
    ctx.lineTo(px, py - 8);
    ctx.moveTo(px, py + 20);
    ctx.lineTo(px, py + 8);
    ctx.stroke();
    ctx.restore();
  }

  function updateTargets(dt) {
    for (let i = targets.length - 1; i >= 0; i -= 1) {
      const t = targets[i];
      const age = performance.now() - t.born;
      if (!t.hit) {
        t.x += Math.sin((age / 400) + t.sway) * 0.2;
        if (age > t.life) {
          removeTarget(i, true);
        }
      } else {
        const elapsed = performance.now() - t.hitTime;
        t.rot += 0.08;
        t.y += t.fall;
        t.alpha = Math.max(0, 1 - elapsed / 520);
        if (elapsed > 600) {
          targets.splice(i, 1);
        }
      }
    }
  }

  function updateBursts() {
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      bursts[i].life += 1;
      if (bursts[i].life > 18) bursts.splice(i, 1);
    }
  }

  function gameLoop(now) {
    const dt = now - state.lastTime;
    state.lastTime = now;
    fps = lerp(fps, 1000 / Math.max(1, dt), 0.08);
    fpsEl.textContent = fps.toFixed(0);

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    drawBackground(levelConfig());

    if (state.running) {
      state.spawnTimer += dt;
      if (state.spawnTimer > state.spawnInterval) {
        state.spawnTimer = 0;
        spawnTarget();
      }

      updateTargets(dt);
      state.cooldown = Math.max(0, state.cooldown - dt);
    }

    targets.forEach(drawBandit);

    updateBursts();
    bursts.forEach(drawBurst);

    state.pointerSmooth.x = lerp(state.pointerSmooth.x, state.pointer.x, 0.25);
    state.pointerSmooth.y = lerp(state.pointerSmooth.y, state.pointer.y, 0.25);
    drawCrosshair();

    requestAnimationFrame(gameLoop);
  }

  function resetGame() {
    state.running = false;
    state.score = 0;
    state.lives = 3;
    state.shots = 0;
    state.spawnTimer = 0;
    state.levelIndex = 0;
    state.levelHits = 0;
    targets.length = 0;
    bursts.length = 0;
    updateHud();
    setOverlay("Finger Shooter", "Pulsa cualquier tecla para empezar", "SPACE tambien dispara");
    state.screen = "intro";
    hintEl.textContent = "Click o barra espaciadora para disparar. Pulsa Hand para activar el dedo.";
  }

  function handleStartAction() {
    if (state.screen === "intro" || state.screen === "gameover" || state.screen === "victory") {
      state.score = 0;
      state.lives = 3;
      state.shots = 0;
      startLevel(0);
      return;
    }
    if (state.screen === "intermission") {
      startLevel(state.levelIndex + 1);
    }
  }

  function handlePointer(e) {
    const rect = canvas.getBoundingClientRect();
    state.pointer = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  async function enableHand() {
    if (state.usingHand) return;
    if (!window.Hands || !window.Camera) {
      setStatus("MediaPipe no disponible");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      setStatus("Webcam bloqueada");
      return;
    }

    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    hands.onResults((results) => {
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        return;
      }
      const landmarks = results.multiHandLandmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];
      const indexBase = landmarks[5];
      const pinkyBase = landmarks[17];

      const scale = Math.hypot(indexBase.x - pinkyBase.x, indexBase.y - pinkyBase.y);
      const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
      const pinch = pinchDist < scale * 0.45;

      state.pointer = { x: 1 - indexTip.x, y: indexTip.y };

      if (pinch && !state.pinchDown) {
        state.pinchDown = true;
        shoot();
      }
      if (!pinch) state.pinchDown = false;
    });

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
    state.usingHand = true;
    setStatus("Modo mano activo");
  }

  function disableHand() {
    if (camera) camera.stop();
    if (video.srcObject) {
      video.srcObject.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
    state.usingHand = false;
    setStatus("Modo raton activo");
  }

  canvas.addEventListener("mousemove", handlePointer);
  canvas.addEventListener("click", () => {
    if (state.screen === "playing") {
      shoot();
    } else {
      handleStartAction();
    }
  });

  frame.addEventListener("click", () => {
    if (state.screen !== "playing") {
      handleStartAction();
    }
  });

  window.addEventListener("keydown", (e) => {
    unlockAudio();
    if (state.screen === "playing") {
      if (e.code === "Space") shoot();
      return;
    }
    handleStartAction();
  });

  startBtn.addEventListener("click", () => {
    unlockAudio();
    handleStartAction();
  });

  resetBtn.addEventListener("click", resetGame);
  handBtn.addEventListener("click", async () => {
    if (state.usingHand) {
      disableHand();
      return;
    }
    await enableHand();
  });

  window.addEventListener("resize", resize);
  resize();
  updateHud();
  setStatus("Modo raton activo");
  resetGame();
  requestAnimationFrame((t) => {
    state.lastTime = t;
    gameLoop(t);
  });
})();
