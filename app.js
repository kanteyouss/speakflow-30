(() => {
  const DATA = window.SPEAKFLOW_DATA;
  const STORAGE_KEY = "speakflow30_state_v1";

  const defaultState = {
    currentBlockId: 1,
    completedBlocks: [],
    xp: 0,
    streak: 1,
    lastVisitDate: new Date().toISOString().slice(0, 10),
    starredVocab: [],
    srsRatings: {},
    completedDays: [],
    journal: [],
    theme: "light"
  };

  let state = loadState();
  let subMode = "dual";
  let sidebarFilter = "all";
  let autoLoop = false;
  let ytPlayer = null;
  let ytTimer = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      const today = new Date().toISOString().slice(0, 10);
      if (parsed.lastVisitDate && parsed.lastVisitDate !== today) {
        const prev = new Date(parsed.lastVisitDate);
        const curr = new Date(today);
        const diffDays = Math.round((curr - prev) / 86400000);
        if (diffDays === 1) parsed.streak = (parsed.streak || 1) + 1;
        else if (diffDays > 1) parsed.streak = 1;
        parsed.lastVisitDate = today;
      }
      return { ...defaultState, ...parsed };
    } catch {
      return { ...defaultState };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderTopStats();
  }

  function addXP(amount) {
    state.xp += amount;
    saveState();
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme || "light");
  }

  document.getElementById("btn-theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    saveState();
  });

  function renderTopStats() {
    document.getElementById("stat-streak").textContent = state.streak;
    document.getElementById("stat-xp").textContent = state.xp;
    document.getElementById("stat-blocks").textContent = `${state.completedBlocks.length}/64`;
    document.getElementById("drawer-trigger-label").textContent = `Bloc ${String(state.currentBlockId).padStart(2, "0")} / 64`;
    const pct = Math.round((state.completedBlocks.length / 64) * 100);
    document.getElementById("global-progress-fill").style.width = `${pct}%`;
  }

  // ==================== SLIDE-OVER DRAWER ====================
  const drawer = document.getElementById("blocks-drawer");
  const backdrop = document.getElementById("drawer-backdrop");

  function openDrawer() {
    drawer.classList.add("open");
    backdrop.classList.add("open");
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
  }

  document.getElementById("btn-open-drawer").addEventListener("click", openDrawer);
  document.getElementById("btn-close-drawer").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);

  // ==================== SPEECH SYNTHESIS (TTS) ====================
  function speakEnglish(text, rate = 0.95, onEnd = null) {
    if (!("speechSynthesis" in window)) {
      if (onEnd) onEnd();
      return;
    }
    window.speechSynthesis.cancel();
    const clean = text.replace(/[`*_]/g, "");
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "en-US";
    utter.rate = rate;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang === "en-US" && /Google|Natural|Samantha|Daniel/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utter.voice = preferred;
    if (onEnd) utter.onend = onEnd;
    window.speechSynthesis.speak(utter);
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // ==================== YOUTUBE PLAYER ====================
  function initYouTube() {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      const blk = getBlock(state.currentBlockId);
      ytPlayer = new YT.Player("yt-player", {
        videoId: "Vh9o-bA359E",
        playerVars: {
          start: blk.start,
          rel: 0,
          modestbranding: 1
        },
        events: {
          onReady: () => startSegmentWatcher()
        }
      });
    };
  }

  function startSegmentWatcher() {
    if (ytTimer) clearInterval(ytTimer);
    ytTimer = setInterval(() => {
      if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
      if (ytPlayer.getPlayerState && ytPlayer.getPlayerState() !== 1) return;
      const blk = getBlock(state.currentBlockId);
      if (ytPlayer.getCurrentTime() >= blk.end) {
        if (autoLoop) {
          ytPlayer.seekTo(blk.start, true);
          ytPlayer.playVideo();
        } else {
          ytPlayer.pauseVideo();
        }
      }
    }, 350);
  }

  // ==================== VIEW & STEPPER NAVIGATION ====================
  document.querySelectorAll(".nav-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-pill").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
      if (btn.dataset.view === "flashcards") renderFlashcard();
    });
  });

  function goToLessonStep(stepNum) {
    document.querySelectorAll(".step-item").forEach((s) => {
      s.classList.toggle("active", s.dataset.step === String(stepNum));
    });
    document.querySelectorAll(".step-panel").forEach((p) => p.classList.remove("active"));
    document.getElementById(`lesson-step-${stepNum}`).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll(".step-item").forEach((item) => {
    item.addEventListener("click", () => goToLessonStep(item.dataset.step));
  });

  document.querySelectorAll(".btn-go-step").forEach((btn) => {
    btn.addEventListener("click", () => goToLessonStep(btn.dataset.target));
  });

  // ==================== BLOCK SELECTION & RENDERING ====================
  function getBlock(id) {
    return DATA.blocks.find((b) => b.id === id) || DATA.blocks[0];
  }

  function getChapter(id) {
    return DATA.chapters.find((c) => c.id === id) || DATA.chapters[0];
  }

  function renderDrawerList() {
    const listEl = document.getElementById("blocks-list");
    const q = document.getElementById("block-search").value.trim().toLowerCase();
    listEl.innerHTML = "";

    let lastChapter = null;
    DATA.blocks.forEach((b) => {
      const isDone = state.completedBlocks.includes(b.id);
      if (sidebarFilter === "todo" && isDone) return;
      if (sidebarFilter === "done" && !isDone) return;
      if (q) {
        const hay = `${b.id} ${b.startStr} ${b.endStr} ${b.en} ${b.fr}`.toLowerCase();
        if (!hay.includes(q)) return;
      }

      if (b.chapter !== lastChapter) {
        lastChapter = b.chapter;
        const ch = getChapter(b.chapter);
        const h = document.createElement("div");
        h.className = "drawer-chapter-label";
        h.textContent = `Chapitre ${ch.id} · ${ch.title.split("(")[0].trim()}`;
        listEl.appendChild(h);
      }

      const btn = document.createElement("button");
      btn.className = `drawer-item ${b.id === state.currentBlockId ? "active" : ""}`;
      btn.innerHTML = `
        <div>
          <span class="drawer-item-title">Bloc ${String(b.id).padStart(2, "0")} · ${b.startStr} – ${b.endStr}</span>
          <span class="drawer-item-sub">${b.en}</span>
        </div>
        <span class="status-badge ${isDone ? "done" : ""}">${isDone ? "✓" : ""}</span>
      `;
      btn.addEventListener("click", () => {
        selectBlock(b.id, true);
        closeDrawer();
      });
      listEl.appendChild(btn);
    });
  }

  function selectBlock(id, seekVideo = false) {
    state.currentBlockId = Math.max(1, Math.min(64, id));
    saveState();
    renderDrawerList();
    renderCurrentBlock();
    goToLessonStep(1);
    switchDrill("puzzle");
    if (seekVideo && ytPlayer && typeof ytPlayer.seekTo === "function") {
      const blk = getBlock(state.currentBlockId);
      ytPlayer.seekTo(blk.start, true);
      ytPlayer.pauseVideo();
    }
  }

  function renderCurrentBlock() {
    const blk = getBlock(state.currentBlockId);
    const ch = getChapter(blk.chapter);
    const isDone = state.completedBlocks.includes(blk.id);

    document.getElementById("current-chapter-badge").textContent = `Chapitre ${ch.id} · ${ch.title.split("(")[0].trim()}`;
    document.getElementById("current-block-title").textContent = `Bloc ${String(blk.id).padStart(2, "0")} · ${blk.startStr} – ${blk.endStr}`;
    document.getElementById("yt-direct-link").href = `https://www.youtube.com/watch?v=Vh9o-bA359E&t=${blk.start}`;

    document.getElementById("btn-prev-block").disabled = blk.id <= 1;
    document.getElementById("btn-next-block").disabled = blk.id >= 64;

    const doneBtn = document.getElementById("btn-mark-done");
    doneBtn.textContent = isDone ? "✓ Déjà validé (cliquer pour annuler)" : "Valider ce bloc (+25 XP)";
    document.getElementById("completion-heading").textContent = isDone
      ? `Bloc ${String(blk.id).padStart(2, "0")} maîtrisé !`
      : `Prêt à valider le Bloc ${String(blk.id).padStart(2, "0")} ?`;

    renderSentences(blk);
    renderVocab(blk);
    renderGrammar(ch);
    setupPuzzle(blk);
    setupCloze(blk);
    setupPronunciation(blk);
    setupPersonalPrompt(blk);
  }

  function renderGrammar(ch) {
    document.getElementById("grammar-chapter-eyebrow").textContent = `Mémo Grammaire · Chapitre ${ch.id}`;
    document.getElementById("grammar-title").textContent = ch.grammar.title;
    document.getElementById("grammar-intro").textContent = ch.grammar.intro;

    const stack = document.getElementById("grammar-rules-container");
    stack.innerHTML = "";
    ch.grammar.rules.forEach((rule) => {
      const card = document.createElement("div");
      card.className = "grammar-rule-card";
      card.innerHTML = `
        <div class="grammar-rule-title">${rule.label}</div>
        <div class="grammar-rule-desc">${rule.desc}</div>
        <div class="grammar-examples-row"></div>
      `;
      const exRow = card.querySelector(".grammar-examples-row");
      rule.examples.forEach((ex) => {
        const chip = document.createElement("button");
        chip.className = "grammar-ex-chip";
        chip.title = `Cliquer pour écouter : "${ex.say}"`;
        chip.innerHTML = `<span>🔊</span> <span>${ex.label}</span>`;
        chip.addEventListener("click", () => speakEnglish(ex.say, 0.92));
        exRow.appendChild(chip);
      });
      stack.appendChild(card);
    });
  }

  function renderSentences(blk) {
    const container = document.getElementById("sentences-container");
    container.innerHTML = "";
    const maxLen = Math.max(blk.enSentences.length, blk.frSentences.length);

    for (let i = 0; i < maxLen; i++) {
      const en = blk.enSentences[i] || "";
      const fr = blk.frSentences[i] || "";
      const row = document.createElement("div");
      row.className = "sentence-item";

      let bodyHtml = "";
      if (subMode === "dual") {
        bodyHtml = `<div class="sent-en-clean">${en}</div><div class="sent-fr-clean">${fr}</div>`;
      } else if (subMode === "en") {
        bodyHtml = `<div class="sent-en-clean">${en}</div>`;
      } else if (subMode === "fr") {
        bodyHtml = `<div class="sent-en-clean">${fr}</div><div class="sent-fr-clean blurred-text" title="Survoler pour voir l'anglais">${en}</div>`;
      } else if (subMode === "blur") {
        bodyHtml = `<div class="sent-en-clean blurred-text" title="Survoler pour révéler">${en}</div><div class="sent-fr-clean blurred-text">${fr}</div>`;
      }

      row.innerHTML = `
        <div>${bodyHtml}</div>
        <div class="sent-btns">
          <button class="audio-pill btn-normal" title="Écouter à vitesse normale">🔊 Écouter</button>
          <button class="audio-pill btn-slow" title="Écouter lentement">0.7×</button>
        </div>
      `;
      row.querySelector(".btn-normal").addEventListener("click", () => speakEnglish(en, 0.95));
      row.querySelector(".btn-slow").addEventListener("click", () => speakEnglish(en, 0.68));
      container.appendChild(row);
    }
  }

  function renderVocab(blk) {
    const list = document.getElementById("block-vocab-list");
    const countBadge = document.getElementById("vocab-count-badge");
    if (countBadge) {
      countBadge.textContent = `${blk.vocab.length} expression${blk.vocab.length > 1 ? "s" : ""}`;
    }
    list.innerHTML = "";
    blk.vocab.forEach((v) => {
      const vocabId = `${blk.id}:${v.en}`;
      const starred = state.starredVocab.includes(vocabId);
      const speakTarget = v.en.split("/")[0].replace(/\+.*|\.\.\./g, "").trim();
      const row = document.createElement("div");
      row.className = "vocab-row";
      row.innerHTML = `
        <div class="vocab-row-main">
          <div class="vocab-headline">
            <span class="vocab-term">${v.en}</span>
            ${v.ipa ? `<span class="ipa-pill">${v.ipa}</span>` : ""}
          </div>
          <div class="vocab-meaning">${v.meaning || ""}</div>
          ${v.tip ? `<div class="vocab-tip-note">💡 ${v.tip}</div>` : ""}
        </div>
        <div class="vocab-row-actions">
          <button class="icon-action-btn v-say" title="Écouter la prononciation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            Écouter
          </button>
          <button class="icon-action-btn v-star ${starred ? "starred" : ""}" title="Ajouter aux favoris">
            ${starred ? "★ Favori" : "☆ Favori"}
          </button>
        </div>
      `;
      row.querySelector(".v-say").addEventListener("click", () => speakEnglish(speakTarget, 0.88));
      row.querySelector(".v-star").addEventListener("click", (e) => {
        const btn = e.currentTarget;
        if (state.starredVocab.includes(vocabId)) {
          state.starredVocab = state.starredVocab.filter((x) => x !== vocabId);
          btn.classList.remove("starred");
          btn.textContent = "☆ Favori";
        } else {
          state.starredVocab.push(vocabId);
          btn.classList.add("starred");
          btn.textContent = "★ Favori";
          addXP(2);
        }
        saveState();
      });
      list.appendChild(row);
    });
  }

  // ==================== STEP 3 DRILLS SWITCHER ====================
  const DRILL_ORDER = ["puzzle", "cloze", "pronounce", "personal"];
  function switchDrill(exoName) {
    const idx = DRILL_ORDER.indexOf(exoName);
    document.getElementById("exo-step-counter").textContent = `Exercice ${idx + 1} sur 4`;
    document.querySelectorAll(".exo-dot").forEach((d) => d.classList.toggle("active", d.dataset.exo === exoName));
    document.querySelectorAll(".drill-pane").forEach((p) => p.classList.remove("active"));
    document.getElementById(`exo-${exoName}`).classList.add("active");
  }

  document.querySelectorAll(".exo-dot").forEach((d) => {
    d.addEventListener("click", () => switchDrill(d.dataset.exo));
  });
  document.querySelectorAll(".btn-switch-exo").forEach((b) => {
    b.addEventListener("click", () => switchDrill(b.dataset.nextexo));
  });

  // ==================== DRILL 1: SENTENCE PUZZLE ====================
  let puzzleSelected = [];
  let puzzleBank = [];

  function setupPuzzle(blk) {
    document.getElementById("puzzle-fr-prompt").textContent = blk.puzzle.fr;
    const words = blk.puzzle.en.replace(/[""]/g, '"').split(/\s+/).filter(Boolean);
    puzzleSelected = [];
    puzzleBank = words.map((w, idx) => ({ id: idx, word: w })).sort(() => Math.random() - 0.5);
    document.getElementById("puzzle-feedback").className = "feedback-banner hidden";
    renderPuzzle();
  }

  function renderPuzzle() {
    const ansEl = document.getElementById("puzzle-answer-zone");
    const bankEl = document.getElementById("puzzle-word-bank");
    ansEl.innerHTML = "";
    bankEl.innerHTML = "";

    puzzleSelected.forEach((item, pos) => {
      const b = document.createElement("button");
      b.className = "word-chip";
      b.textContent = item.word;
      b.addEventListener("click", () => {
        puzzleSelected.splice(pos, 1);
        puzzleBank.push(item);
        renderPuzzle();
      });
      ansEl.appendChild(b);
    });

    puzzleBank.forEach((item, pos) => {
      const b = document.createElement("button");
      b.className = "word-chip";
      b.textContent = item.word;
      b.addEventListener("click", () => {
        speakEnglish(item.word.replace(/[^a-zA-Z']/g, ""), 0.96);
        puzzleBank.splice(pos, 1);
        puzzleSelected.push(item);
        renderPuzzle();
      });
      bankEl.appendChild(b);
    });
  }

  document.getElementById("btn-puzzle-listen").addEventListener("click", () => {
    speakEnglish(getBlock(state.currentBlockId).puzzle.en, 0.86);
  });
  document.getElementById("btn-reset-puzzle").addEventListener("click", () => {
    setupPuzzle(getBlock(state.currentBlockId));
  });
  document.getElementById("btn-check-puzzle").addEventListener("click", () => {
    const blk = getBlock(state.currentBlockId);
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, " ").replace(/\s+/g, " ").trim();
    const attempt = puzzleSelected.map((x) => x.word).join(" ");
    const fb = document.getElementById("puzzle-feedback");
    if (norm(attempt) === norm(blk.puzzle.en)) {
      fb.className = "feedback-banner ok";
      fb.innerHTML = `Parfait ! « <strong>${blk.puzzle.en}</strong> » — Dis-la une fois à voix haute. (+10 XP)`;
      speakEnglish(blk.puzzle.en, 0.95);
      addXP(10);
    } else {
      fb.className = "feedback-banner err";
      fb.innerHTML = `Pas tout à fait dans cet ordre. Réessaie ou aide-toi de l'audio !<br><small>Réponse : ${blk.puzzle.en}</small>`;
    }
  });

  // ==================== DRILL 2: CLOZE ====================
  function setupCloze(blk) {
    document.getElementById("cloze-fr-hint").textContent = blk.cloze.frHint;
    document.getElementById("cloze-sentence-display").innerHTML = blk.cloze.sentenceWithBlank.replace(
      "___",
      `<span class="cloze-slot">?</span>`
    );
    document.getElementById("cloze-input").value = "";
    document.getElementById("cloze-feedback").className = "feedback-banner hidden";

    const optsEl = document.getElementById("cloze-options");
    optsEl.innerHTML = "";
    blk.cloze.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = opt;
      btn.addEventListener("click", () => verifyCloze(opt));
      optsEl.appendChild(btn);
    });
  }

  function verifyCloze(val) {
    const blk = getBlock(state.currentBlockId);
    const clean = (s) => s.trim().toLowerCase().replace(/[^a-z']/g, "");
    const fb = document.getElementById("cloze-feedback");
    if (clean(val) === clean(blk.cloze.answer)) {
      document.getElementById("cloze-sentence-display").innerHTML = blk.cloze.sentenceWithBlank.replace(
        "___",
        `<span class="cloze-slot">${blk.cloze.answer}</span>`
      );
      fb.className = "feedback-banner ok";
      fb.innerHTML = `Exact ! « <strong>${blk.cloze.fullSentence}</strong> » (+10 XP)`;
      speakEnglish(blk.cloze.fullSentence, 0.94);
      addXP(10);
    } else {
      fb.className = "feedback-banner err";
      fb.innerHTML = `Presque ! Le mot exact était <strong>${blk.cloze.answer}</strong>.`;
    }
  }

  document.getElementById("btn-check-cloze").addEventListener("click", () => {
    verifyCloze(document.getElementById("cloze-input").value);
  });
  document.getElementById("cloze-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") verifyCloze(e.target.value);
  });

  // ==================== DRILL 3: PRONUNCIATION + SIDE-BY-SIDE COMPARE ====================
  let recognition = null;
  let isListening = false;
  let compareRecorder = null;
  let compareChunks = [];
  let isRecordingCompare = false;
  let lastCompareUrl = null;

  function setupPronunciation(blk) {
    const sel = document.getElementById("pronounce-sentence-select");
    sel.innerHTML = "";
    blk.enSentences.forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = s;
      sel.appendChild(opt);
    });
    renderPronounceWords();
    document.getElementById("pronounce-live-transcript").textContent = "";
    document.getElementById("pronounce-score-box").className = "feedback-banner hidden";
    document.getElementById("compare-player-row").classList.add("hidden");
  }

  function getSelectedPronounceSentence() {
    const blk = getBlock(state.currentBlockId);
    const idx = Number(document.getElementById("pronounce-sentence-select").value) || 0;
    return blk.enSentences[idx] || blk.en;
  }

  function renderPronounceWords(spokenTranscript = null) {
    const target = getSelectedPronounceSentence();
    const container = document.getElementById("pronounce-target-words");
    container.innerHTML = "";
    const spokenSet = spokenTranscript
      ? new Set(
          spokenTranscript
            .toLowerCase()
            .replace(/[^a-z0-9'\s]/g, "")
            .split(/\s+/)
            .filter(Boolean)
        )
      : null;

    let matches = 0;
    const words = target.split(/\s+/).filter(Boolean);
    words.forEach((w) => {
      const cleanW = w.toLowerCase().replace(/[^a-z0-9']/g, "");
      const span = document.createElement("span");
      span.className = "m-word";
      if (spokenSet) {
        if (spokenSet.has(cleanW)) {
          span.classList.add("good");
          matches++;
        } else {
          span.classList.add("miss");
        }
      }
      span.textContent = w;
      span.title = "Cliquer pour écouter ce mot seul";
      span.addEventListener("click", () => speakEnglish(cleanW, 0.8));
      container.appendChild(span);
    });

    if (spokenSet && words.length > 0) {
      const pct = Math.round((matches / words.length) * 100);
      const box = document.getElementById("pronounce-score-box");
      box.className = `feedback-banner ${pct >= 60 ? "ok" : "err"}`;
      box.innerHTML =
        pct >= 60
          ? `Score de clarté : <strong>${pct}%</strong> ! Clique sur un mot rouge si tu veux l'écouter isolément. (+15 XP)`
          : `Score : <strong>${pct}%</strong> — Écoute au ralenti (0.7×) puis réessaie calmement.`;
      if (pct >= 60) addXP(15);
    }
  }

  document.getElementById("pronounce-sentence-select").addEventListener("change", () => {
    renderPronounceWords();
    document.getElementById("pronounce-score-box").className = "feedback-banner hidden";
    document.getElementById("compare-player-row").classList.add("hidden");
  });

  document.getElementById("btn-pronounce-listen-normal").addEventListener("click", () => {
    speakEnglish(getSelectedPronounceSentence(), 0.95);
  });
  document.getElementById("btn-pronounce-listen-slow").addEventListener("click", () => {
    speakEnglish(getSelectedPronounceSentence(), 0.66);
  });

  document.getElementById("btn-pronounce-mic").addEventListener("click", () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const liveEl = document.getElementById("pronounce-live-transcript");
    const micBtn = document.getElementById("btn-pronounce-mic");

    if (!SpeechRec) {
      liveEl.textContent = "Utilise Chrome/Edge pour l'analyse mot par mot, ou clique sur « M'enregistrer & Comparer » juste à droite !";
      return;
    }

    if (isListening && recognition) {
      recognition.stop();
      return;
    }

    recognition = new SpeechRec();
    recognition.lang = "en-US";
    recognition.interimResults = true;

    recognition.onstart = () => {
      isListening = true;
      micBtn.textContent = "⏹ Arrêter l'écoute";
      liveEl.textContent = "Parle maintenant en anglais...";
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      liveEl.textContent = `Entendu : « ${transcript} »`;
      if (event.results[0].isFinal) renderPronounceWords(transcript);
    };

    recognition.onerror = () => {
      liveEl.textContent = "Microphone non autorisé ou indisponible.";
    };

    recognition.onend = () => {
      isListening = false;
      micBtn.textContent = "🎙️ Tester ma prononciation";
    };

    recognition.start();
  });

  // Side-by-side voice comparison (Speechling feature)
  document.getElementById("btn-compare-record").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const liveEl = document.getElementById("pronounce-live-transcript");

    if (isRecordingCompare && compareRecorder) {
      compareRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      compareChunks = [];
      compareRecorder = new MediaRecorder(stream);
      compareRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) compareChunks.push(ev.data);
      };
      compareRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        isRecordingCompare = false;
        btn.textContent = "🎧 M'enregistrer & Comparer";
        const blob = new Blob(compareChunks, { type: "audio/webm" });
        lastCompareUrl = URL.createObjectURL(blob);
        const audioEl = document.getElementById("compare-audio-el");
        audioEl.src = lastCompareUrl;
        document.getElementById("compare-player-row").classList.remove("hidden");
        liveEl.textContent = "Prise enregistrée ! Clique sur « Écouter Modèle puis Moi » pour comparer.";
        addXP(10);
      };
      compareRecorder.start();
      isRecordingCompare = true;
      btn.textContent = "⏹ Terminer ma phrase";
      liveEl.textContent = "Enregistrement en cours... Dis la phrase à voix haute !";
    } catch {
      liveEl.textContent = "Impossible d'accéder au microphone.";
    }
  });

  document.getElementById("btn-play-both").addEventListener("click", () => {
    if (!lastCompareUrl) return;
    speakEnglish(getSelectedPronounceSentence(), 0.94, () => {
      setTimeout(() => {
        document.getElementById("compare-audio-el").play();
      }, 300);
    });
  });

  // ==================== DRILL 4: PERSONAL SENTENCE ====================
  const FRENCH_SPEAKER_CHECKS = [
    { regex: /\bi have (\d+) years\b/i, tip: "En anglais on utilise le verbe ÊTRE pour l'âge : « I am $1 years old »." },
    { regex: /\bexplain me\b/i, tip: "Après « explain », ajoute toujours « to » : « explain to me »." },
    { regex: /\blisten music\b/i, tip: "On dit toujours « listen TO music »." },
    { regex: /\bi am agree\b/i, tip: "Dis simplement « I agree » (sans 'am')." },
    { regex: /\b(do|did) a mistake\b/i, tip: "Avec « mistake », utilise MAKE : « make / made a mistake »." },
    { regex: /\bdepend of\b/i, tip: "Toujours « depend ON », jamais « depend of »." },
    { regex: /\bgo to home\b/i, tip: "Pas de « to » devant « home » : « go home »." }
  ];

  function setupPersonalPrompt(blk) {
    document.getElementById("personal-hint-text").textContent = blk.personalPrompt.hint;
    document.getElementById("personal-template-code").textContent = blk.personalPrompt.template;
    document.getElementById("personal-textarea").value = "";
    document.getElementById("personal-feedback").className = "feedback-banner hidden";
    renderJournal();
  }

  document.getElementById("btn-speak-personal").addEventListener("click", () => {
    const val = document.getElementById("personal-textarea").value.trim();
    if (val) speakEnglish(val, 0.92);
  });

  document.getElementById("btn-save-personal").addEventListener("click", () => {
    const val = document.getElementById("personal-textarea").value.trim();
    const fb = document.getElementById("personal-feedback");
    if (val.length < 4) {
      fb.className = "feedback-banner err";
      fb.textContent = "Écris d'abord une phrase en anglais.";
      return;
    }

    const warnings = [];
    FRENCH_SPEAKER_CHECKS.forEach((rule) => {
      const m = val.match(rule.regex);
      if (m) warnings.push(rule.tip.replace("$1", m[1] || ""));
    });

    state.journal.unshift({ blockId: state.currentBlockId, text: val });
    state.journal = state.journal.slice(0, 30);
    addXP(15);
    renderJournal();

    if (warnings.length > 0) {
      fb.className = "feedback-banner err";
      fb.innerHTML = `Phrase sauvegardée (+15 XP). Petit conseil : ${warnings.join(" ")}`;
    } else {
      fb.className = "feedback-banner ok";
      fb.innerHTML = `Super phrase enregistrée (+15 XP) ! Répète-la à voix haute.`;
      speakEnglish(val, 0.94);
    }
  });

  function renderJournal() {
    const el = document.getElementById("personal-journal-list");
    if (state.journal.length === 0) {
      el.innerHTML = `<p class="caption">Aucune phrase enregistrée pour le moment.</p>`;
      return;
    }
    el.innerHTML = "";
    state.journal.slice(0, 5).forEach((entry) => {
      const div = document.createElement("div");
      div.className = "journal-row";
      div.innerHTML = `
        <span><strong>Bloc ${String(entry.blockId).padStart(2, "0")}</strong> · ${entry.text}</span>
        <button class="audio-pill">🔊</button>
      `;
      div.querySelector("button").addEventListener("click", () => speakEnglish(entry.text, 0.94));
      el.appendChild(div);
    });
  }

  // ==================== VIDEO & BLOCK COMPLETION EVENTS ====================
  document.getElementById("btn-play-segment").addEventListener("click", () => {
    const blk = getBlock(state.currentBlockId);
    if (ytPlayer && typeof ytPlayer.seekTo === "function") {
      ytPlayer.seekTo(blk.start, true);
      ytPlayer.playVideo();
    }
  });

  document.getElementById("btn-loop-segment").addEventListener("click", (e) => {
    autoLoop = !autoLoop;
    e.currentTarget.setAttribute("aria-pressed", String(autoLoop));
    e.currentTarget.textContent = autoLoop ? "Boucle auto : On" : "Boucle auto : Off";
    e.currentTarget.classList.toggle("active-loop", autoLoop);
  });

  document.querySelectorAll(".speed-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".speed-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      if (ytPlayer && typeof ytPlayer.setPlaybackRate === "function") {
        ytPlayer.setPlaybackRate(Number(btn.dataset.speed));
      }
    });
  });

  document.querySelectorAll(".sub-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".sub-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      subMode = btn.dataset.submode;
      renderSentences(getBlock(state.currentBlockId));
    });
  });

  document.getElementById("btn-prev-block").addEventListener("click", () => selectBlock(state.currentBlockId - 1, true));
  document.getElementById("btn-next-block").addEventListener("click", () => selectBlock(state.currentBlockId + 1, true));

  document.getElementById("btn-mark-done").addEventListener("click", () => {
    const id = state.currentBlockId;
    if (state.completedBlocks.includes(id)) {
      state.completedBlocks = state.completedBlocks.filter((x) => x !== id);
    } else {
      state.completedBlocks.push(id);
      addXP(25);
    }
    saveState();
    renderDrawerList();
    renderCurrentBlock();
  });

  document.getElementById("btn-complete-and-next").addEventListener("click", () => {
    const id = state.currentBlockId;
    if (!state.completedBlocks.includes(id)) {
      state.completedBlocks.push(id);
      addXP(25);
    }
    saveState();
    if (id < 64) selectBlock(id + 1, true);
    else {
      renderDrawerList();
      renderCurrentBlock();
    }
  });

  document.getElementById("block-search").addEventListener("input", renderDrawerList);
  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      sidebarFilter = pill.dataset.filter;
      renderDrawerList();
    });
  });

  // ==================== VIEW 2: DANIEL STUDIO ====================
  const DANIEL_TOPICS = [
    { en: "What did I do today, and what made me happy today?", fr: "Qu'est-ce que j'ai fait aujourd'hui, et qu'est-ce qui m'a rendu heureux ?" },
    { en: "Talk about your morning: when did you wake up and how do you feel?", fr: "Parle de ta matinée : à quelle heure t'es-tu réveillé et comment te sens-tu ?" },
    { en: "Why do I want to speak English, and what door do I want to open?", fr: "Pourquoi est-ce que je veux parler anglais, et quelle porte est-ce que je veux ouvrir ?" },
    { en: "Describe 3 objects around you without saying their exact name.", fr: "Décris 3 objets autour de toi sans dire leur nom exact (l'astuce du parapluie)." },
    { en: "What do you enjoy doing on weekends?", fr: "Qu'aimes-tu faire le week-end ?" }
  ];

  let targetSeconds = 300;
  let remainingSeconds = 300;
  let timerInterval = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let animFrame = null;

  function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      targetSeconds = Number(btn.dataset.seconds);
      remainingSeconds = targetSeconds;
      document.getElementById("daniel-timer").textContent = formatTime(remainingSeconds);
    });
  });

  document.getElementById("btn-random-topic").addEventListener("click", () => {
    const item = DANIEL_TOPICS[Math.floor(Math.random() * DANIEL_TOPICS.length)];
    document.getElementById("daniel-topic-en").textContent = `"${item.en}"`;
    document.getElementById("daniel-topic-fr").textContent = item.fr;
    speakEnglish(item.en, 0.92);
  });

  document.getElementById("btn-start-record").addEventListener("click", async () => {
    const statusEl = document.getElementById("recorder-status");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (animFrame) cancelAnimationFrame(animFrame);
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        appendRecording(URL.createObjectURL(blob), targetSeconds - remainingSeconds);
        addXP(30);
      };

      mediaRecorder.start();
      drawWaveform(stream);
      remainingSeconds = targetSeconds;
      document.getElementById("daniel-timer").textContent = formatTime(remainingSeconds);
      document.getElementById("btn-start-record").disabled = true;
      document.getElementById("btn-stop-record").disabled = false;
      statusEl.textContent = "Enregistrement en cours... Parle librement avec des mots simples.";

      timerInterval = setInterval(() => {
        remainingSeconds--;
        document.getElementById("daniel-timer").textContent = formatTime(Math.max(0, remainingSeconds));
        if (remainingSeconds <= 0) stopDanielRecording();
      }, 1000);
    } catch {
      statusEl.textContent = "Microphone non accessible. Autorise l'accès dans ton navigateur.";
    }
  });

  function stopDanielRecording() {
    if (timerInterval) clearInterval(timerInterval);
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    document.getElementById("btn-start-record").disabled = false;
    document.getElementById("btn-stop-record").disabled = true;
    document.getElementById("recorder-status").textContent = "Prise terminée (+30 XP). Réécoute-toi jusqu'au bout sans te juger.";
  }

  document.getElementById("btn-stop-record").addEventListener("click", stopDanielRecording);

  function drawWaveform(stream) {
    const canvas = document.getElementById("audio-visualizer");
    const ctx = canvas.getContext("2d");
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function frame() {
      animFrame = requestAnimationFrame(frame);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barW = (canvas.width / dataArray.length) * 1.6;
      let x = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const h = Math.max(3, (dataArray[i] / 255) * canvas.height);
        ctx.fillStyle = "#0d9488";
        ctx.fillRect(x, (canvas.height - h) / 2, barW - 3, h);
        x += barW;
      }
    }
    frame();
  }

  function appendRecording(url, durationSec) {
    const list = document.getElementById("recordings-list");
    const cap = list.querySelector("p.caption");
    if (cap) cap.remove();

    const item = document.createElement("div");
    item.className = "rec-card";
    const t = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    item.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:0.82rem;">
        <strong>Prise de ${t} (${Math.max(1, durationSec)}s)</strong>
        <a href="${url}" download="speakflow-${Date.now()}.webm" class="text-link">Télécharger</a>
      </div>
      <audio controls src="${url}"></audio>
    `;
    list.prepend(item);
  }

  document.querySelectorAll(".phrase-helper, .mini-word-btn").forEach((b) => {
    b.addEventListener("click", () => speakEnglish(b.dataset.say, 0.88));
  });

  // ==================== VIEW 3: VOCABULARY, DICTATION & TRAPS ====================
  document.querySelectorAll(".vocab-mode-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".vocab-mode-pill").forEach((p) => p.classList.remove("active"));
      document.querySelectorAll(".vmode-pane").forEach((pane) => pane.classList.remove("active"));
      pill.classList.add("active");
      document.getElementById(`vmode-${pill.dataset.vmode}`).classList.add("active");
    });
  });

  const ALL_CARDS = [];
  DATA.blocks.forEach((b) => {
    b.vocab.forEach((v) => {
      ALL_CARDS.push({
        id: `${b.id}:${v.en}`,
        blockId: b.id,
        chapter: b.chapter,
        en: v.en,
        speakEn: v.en.split("/")[0].replace(/\+.*|\.\.\./g, "").trim(),
        ipa: v.ipa,
        note: v.meaning + (v.tip ? ` (${v.tip})` : ""),
        meaning: v.meaning,
        tip: v.tip,
        context: b.enSentences[0] || b.en
      });
    });
  });

  let fcDeck = [...ALL_CARDS];
  let fcIndex = 0;
  let fcFrToEn = true;

  function rebuildFlashcardDeck() {
    const filter = document.getElementById("fc-deck-filter").value;
    if (filter === "all") fcDeck = [...ALL_CARDS];
    else if (filter === "starred") fcDeck = ALL_CARDS.filter((c) => state.starredVocab.includes(c.id));
    else if (filter === "due") fcDeck = ALL_CARDS.filter((c) => state.srsRatings[c.id] === "hard" || !state.srsRatings[c.id]);
    else if (filter.startsWith("ch")) {
      const chNum = Number(filter.slice(2));
      fcDeck = ALL_CARDS.filter((c) => c.chapter === chNum);
    }
    if (fcDeck.length === 0) fcDeck = [...ALL_CARDS];
    fcIndex = 0;
    renderFlashcard();
  }

  function renderFlashcard() {
    const cardEl = document.getElementById("flashcard-3d");
    cardEl.classList.remove("flipped");
    const c = fcDeck[fcIndex % fcDeck.length];
    document.getElementById("fc-counter").textContent = `Carte ${(fcIndex % fcDeck.length) + 1} / ${fcDeck.length}`;

    if (fcFrToEn) {
      document.getElementById("fc-front-badge").textContent = "Sens en français";
      document.getElementById("fc-front-text").textContent = c.note;
    } else {
      document.getElementById("fc-front-badge").textContent = "Expression anglaise";
      document.getElementById("fc-front-text").textContent = c.en;
    }

    document.getElementById("fc-back-en").textContent = c.en;
    document.getElementById("fc-back-ipa").textContent = c.ipa || "";
    document.getElementById("fc-back-note").textContent = c.note;
    document.getElementById("fc-back-context").textContent = `« ${c.context} »`;
  }

  document.getElementById("flashcard-3d").addEventListener("click", (e) => {
    if (e.target.id === "btn-fc-audio") return;
    const el = document.getElementById("flashcard-3d");
    el.classList.toggle("flipped");
    if (el.classList.contains("flipped")) speakEnglish(fcDeck[fcIndex % fcDeck.length].en, 0.9);
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && document.getElementById("view-flashcards").classList.contains("active") && document.getElementById("vmode-cards").classList.contains("active") && document.activeElement.tagName !== "INPUT") {
      e.preventDefault();
      document.getElementById("flashcard-3d").click();
    }
  });

  document.getElementById("btn-fc-audio").addEventListener("click", (e) => {
    e.stopPropagation();
    speakEnglish(fcDeck[fcIndex % fcDeck.length].en, 0.85);
  });

  document.getElementById("fc-deck-filter").addEventListener("change", rebuildFlashcardDeck);
  document.getElementById("btn-fc-direction").addEventListener("click", (e) => {
    fcFrToEn = !fcFrToEn;
    e.currentTarget.textContent = fcFrToEn ? "Sens : FR → EN" : "Sens : EN → FR";
    renderFlashcard();
  });

  document.querySelectorAll(".btn-rate").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = fcDeck[fcIndex % fcDeck.length];
      state.srsRatings[c.id] = btn.dataset.rate;
      if (btn.dataset.rate === "easy") addXP(5);
      else if (btn.dataset.rate === "good") addXP(3);
      saveState();
      fcIndex = (fcIndex + 1) % fcDeck.length;
      renderFlashcard();
    });
  });

  // Dictation
  let currentDictation = DATA.blocks[0].puzzle.en;
  function pickNewDictation() {
    const b = DATA.blocks[Math.floor(Math.random() * DATA.blocks.length)];
    currentDictation = b.puzzle.en;
    document.getElementById("dictation-input").value = "";
    document.getElementById("dictation-feedback").className = "feedback-banner hidden";
  }

  document.getElementById("btn-dictation-play").addEventListener("click", () => speakEnglish(currentDictation, 0.94));
  document.getElementById("btn-dictation-slow").addEventListener("click", () => speakEnglish(currentDictation, 0.65));
  document.getElementById("btn-dictation-new").addEventListener("click", () => {
    pickNewDictation();
    speakEnglish(currentDictation, 0.94);
  });
  document.getElementById("btn-dictation-check").addEventListener("click", () => {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, " ").replace(/\s+/g, " ").trim();
    const fb = document.getElementById("dictation-feedback");
    if (norm(document.getElementById("dictation-input").value) === norm(currentDictation)) {
      fb.className = "feedback-banner ok";
      fb.innerHTML = `Parfait (+15 XP) ! « <strong>${currentDictation}</strong> »`;
      addXP(15);
    } else {
      fb.className = "feedback-banner err";
      fb.innerHTML = `Réponse attendue : <strong>${currentDictation}</strong>`;
    }
  });
  document.getElementById("btn-dictation-reveal").addEventListener("click", () => {
    const fb = document.getElementById("dictation-feedback");
    fb.className = "feedback-banner ok";
    fb.innerHTML = `Phrase : <strong>${currentDictation}</strong>`;
  });

  // Traps
  const TRAPS = [
    { q: "Comment dit-on « Quand j'avais 12 ans » ?", opts: ["When I was 12 years old", "When I had 12 years old", "When I have 12 years"], ans: 0, exp: "On utilise toujours le verbe ÊTRE (be) pour l'âge en anglais !" },
    { q: "Que signifie « pass an exam » ?", opts: ["Réussir un examen", "Se présenter à un examen", "Rater un examen"], ans: 0, exp: "Pass an exam = réussir ! Passer un examen se dit « take an exam »." },
    { q: "Comment dit-on « faire des erreurs » et « prendre une décision » ?", opts: ["make mistakes / make a decision", "do mistakes / take a decision"], ans: 0, exp: "Tous les deux utilisent le verbe MAKE en anglais." },
    { q: "Quelle est la différence entre « foreigners » et « strangers » ?", opts: ["foreigners = étrangers d'un autre pays · strangers = inconnus", "Aucune différence"], ans: 0, exp: "Un inconnu de ta propre ville est un stranger, pas un foreigner !" },
    { q: "Que veulent dire « confidence » et « journey » ?", opts: ["Confiance en soi & Parcours/Voyage", "Un secret & Une journée"], ans: 0, exp: "Un secret = a secret, et une journée = a day." }
  ];
  let trapIdx = 0;
  function renderTrap() {
    const t = TRAPS[trapIdx % TRAPS.length];
    document.getElementById("trap-question").textContent = t.q;
    const optsEl = document.getElementById("trap-options");
    const fb = document.getElementById("trap-feedback");
    fb.className = "feedback-banner hidden";
    optsEl.innerHTML = "";
    t.opts.forEach((opt, idx) => {
      const b = document.createElement("button");
      b.className = "choice-btn";
      b.textContent = opt;
      b.addEventListener("click", () => {
        fb.className = `feedback-banner ${idx === t.ans ? "ok" : "err"}`;
        fb.innerHTML = `${idx === t.ans ? "Bravo (+10 XP) ! " : "Attention : "}${t.exp}`;
        if (idx === t.ans) addXP(10);
      });
      optsEl.appendChild(b);
    });
  }
  document.getElementById("btn-next-trap").addEventListener("click", () => {
    trapIdx = (trapIdx + 1) % TRAPS.length;
    renderTrap();
  });

  // ==================== VIEW 4: 30-DAY PLAN ====================
  function renderRoadmap() {
    const renderPhase = (elId, startDay, endDay) => {
      const grid = document.getElementById(elId);
      grid.innerHTML = "";
      for (let d = startDay; d <= endDay; d++) {
        const done = state.completedDays.includes(d);
        const btn = document.createElement("button");
        btn.className = `day-pill ${done ? "done" : ""}`;
        btn.textContent = `J${d}`;
        btn.addEventListener("click", () => {
          if (state.completedDays.includes(d)) {
            state.completedDays = state.completedDays.filter((x) => x !== d);
          } else {
            state.completedDays.push(d);
            addXP(20);
          }
          saveState();
          renderRoadmap();
        });
        grid.appendChild(btn);
      }
    };
    renderPhase("days-grid-1", 1, 10);
    renderPhase("days-grid-2", 11, 20);
    renderPhase("days-grid-3", 21, 30);
  }

  document.getElementById("btn-export-progress").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `speakflow-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  document.getElementById("input-import-progress").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = { ...defaultState, ...JSON.parse(reader.result) };
        applyTheme();
        saveState();
        renderDrawerList();
        renderCurrentBlock();
        renderRoadmap();
      } catch {
        alert("Fichier invalide.");
      }
    };
    reader.readAsText(file);
  });

  // ==================== INIT ====================
  applyTheme();
  renderTopStats();
  renderDrawerList();
  renderCurrentBlock();
  pickNewDictation();
  renderTrap();
  renderRoadmap();
  initYouTube();
})();
