(function () {
  'use strict';

  var APP_KEY = 'webgame_memoryMatchBuddy';
  var APP_VERSION = '001.001';
  var DIFFICULTY_KEY = APP_KEY + '.difficulty.v1';
  var HIGHSCORES_KEY = APP_KEY + '.highscores.v1';
  var PROGRESS_KEY = APP_KEY + '.progress.v1';

  var DIFFICULTIES = {
    easy: { rows: 4, cols: 4, label: 'Easy' },
    medium: { rows: 4, cols: 6, label: 'Medium' },
    hard: { rows: 6, cols: 6, label: 'Hard' },
    expert: { rows: 6, cols: 8, label: 'Expert' }
  };

  var EMOJI_POOL = [
    '🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍩', '🍪', '🍦', '🍫',
    '🍇', '🍉', '🍓', '🍒', '🍑', '🍍', '🥝', '🥑', '🍎', '🍋',
    '🥕', '🌽', '🍄', '🥦', '🍌', '🥥'
  ];

  var ICONS = Object.assign({}, Buddy.ICONS, {
    timer: Buddy.icon('timer')
  });
  var HELP_ICON_SVG = '<svg class="icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M8 1C5.419 1 2.75 2.964 2.75 6.25C2.75 8.167 3.637 9.184 4.224 9.856C4.408 10.067 4.598 10.285 4.628 10.398L5.568 13.889C5.744 14.543 6.34 14.999 7.017 14.999H8.984C9.662 14.999 10.257 14.542 10.432 13.889L11.372 10.397C11.402 10.285 11.593 10.067 11.776 9.856C12.363 9.183 13.25 8.167 13.25 6.25C13.25 3.355 10.895 1 8 1ZM9.467 13.63C9.408 13.848 9.209 14 8.984 14H7.017C6.791 14 6.593 13.848 6.534 13.63L6.095 12H9.906L9.467 13.63ZM11.022 9.199C10.741 9.522 10.497 9.802 10.407 10.137L10.175 10.999H5.826L5.594 10.138C5.503 9.801 5.26 9.522 4.977 9.199C4.43 8.572 3.75 7.792 3.75 6.25C3.75 3.59 5.911 2 8 2C10.344 2 12.25 3.907 12.25 6.25C12.25 7.792 11.569 8.572 11.022 9.199Z"/></svg>';
  var escapeHtml = Buddy.escapeHtml;

  var MISMATCH_DELAY = 700;

  var dom = {};
  var state = {
    difficulty: 'easy',
    highscores: {},
    rows: 0,
    cols: 0,
    cards: [],
    cardEls: [],
    status: 'idle',
    flipped: [],
    matchedPairs: 0,
    totalPairs: 0,
    moves: 0,
    busy: false,
    elapsedSeconds: 0,
    startTime: null,
    timerId: null
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheDom();
    initStaticIcons();
    bindGlobalEvents();
    state.difficulty = loadDifficulty();
    state.highscores = loadHighscores();
    setDifficultyToggleUI(state.difficulty);

    var urlProgress = new URLSearchParams(window.location.search).get('progress');
    if (urlProgress) {
      history.replaceState(null, '', location.protocol + '//' + location.host + location.pathname);
      var urlData = decodeProgress(urlProgress);
      if (isValidProgressPayload(urlData)) {
        loadProgressData(urlData);
        return;
      }
    }

    var saved = loadSavedProgress();
    if (saved) {
      openResumeModal(saved);
      return;
    }

    newGame();
  }

  function cacheDom() {
    dom.btnSettings = document.getElementById('btnSettings');
    dom.btnShare = document.getElementById('btnShare');
    dom.btnHighScores = document.getElementById('btnHighScores');
    dom.btnHelp = document.getElementById('btnHelp');
    dom.difficultyToggle = document.getElementById('difficultyToggle');
    dom.movesIcon = document.getElementById('movesIcon');
    dom.timerIcon = document.getElementById('timerIcon');
    dom.bestIcon = document.getElementById('bestIcon');
    dom.movesCount = document.getElementById('movesCount');
    dom.timeElapsed = document.getElementById('timeElapsed');
    dom.bestMoves = document.getElementById('bestMoves');
    dom.board = document.getElementById('board');
    dom.banner = document.getElementById('banner');
  }

  function initStaticIcons() {
    dom.btnSettings.innerHTML = ICONS.settings;
    dom.btnShare.innerHTML = ICONS.send;
    dom.btnHighScores.innerHTML = ICONS.award;
    dom.btnHelp.innerHTML = HELP_ICON_SVG;
    dom.movesIcon.innerHTML = ICONS.hash;
    dom.timerIcon.innerHTML = ICONS.timer;
    dom.bestIcon.innerHTML = ICONS.award;
  }

  function bindGlobalEvents() {
    dom.btnSettings.addEventListener('click', openSettingsModal);
    dom.btnShare.addEventListener('click', shareProgress);
    dom.btnHighScores.addEventListener('click', openHighScoresModal);
    dom.btnHelp.addEventListener('click', openHelpModal);

    dom.difficultyToggle.querySelectorAll('[data-difficulty]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-difficulty');
        state.difficulty = id;
        saveDifficulty();
        setDifficultyToggleUI(id);
        newGame();
      });
    });
  }



  function loadDifficulty() {
    try {
      var saved = localStorage.getItem(DIFFICULTY_KEY);
      return DIFFICULTIES.hasOwnProperty(saved) ? saved : 'easy';
    } catch (e) {
      return 'easy';
    }
  }

  function saveDifficulty() {
    try { localStorage.setItem(DIFFICULTY_KEY, state.difficulty); } catch (e) {}
  }

  function loadHighscores() {
    try {
      var raw = localStorage.getItem(HIGHSCORES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveHighscores() {
    try { localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(state.highscores)); } catch (e) {}
  }


  function buildProgressPayload() {
    var keyStr = '', matchedStr = '';
    state.cards.forEach(function (card) {
      keyStr += EMOJI_POOL.indexOf(card.value).toString(36);
      matchedStr += card.matched ? '1' : '0';
    });
    return { d: state.difficulty, r: state.rows, c: state.cols, k: keyStr, m: matchedStr, mv: state.moves, t: state.elapsedSeconds };
  }

  function encodeProgress(payload) {
    return btoa(JSON.stringify(payload));
  }

  function decodeProgress(str) {
    try {
      return JSON.parse(atob(str));
    } catch (e) {
      return null;
    }
  }

  function isValidProgressPayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (!DIFFICULTIES.hasOwnProperty(data.d)) return false;
    if (typeof data.r !== 'number' || typeof data.c !== 'number') return false;
    var dd = DIFFICULTIES[data.d];
    if (data.r !== dd.rows || data.c !== dd.cols) return false;

    var total = data.r * data.c;
    if (total % 2 !== 0) return false;
    var pairs = total / 2;
    if (pairs < 2 || pairs > EMOJI_POOL.length) return false;

    if (typeof data.k !== 'string' || data.k.length !== total || !/^[0-9a-z]+$/i.test(data.k)) return false;
    if (typeof data.m !== 'string' || data.m.length !== total || !/^[01]+$/.test(data.m)) return false;
    if (typeof data.mv !== 'number' || data.mv < 0) return false;
    if (typeof data.t !== 'number' || data.t < 0) return false;

    var positionsByIdx = {};
    for (var i = 0; i < data.k.length; i++) {
      var idx = parseInt(data.k[i], 36);
      if (isNaN(idx) || idx < 0 || idx >= EMOJI_POOL.length) return false;
      (positionsByIdx[idx] = positionsByIdx[idx] || []).push(i);
    }
    var keys = Object.keys(positionsByIdx);
    if (keys.length !== pairs) return false;
    for (var k = 0; k < keys.length; k++) {
      var positions = positionsByIdx[keys[k]];
      if (positions.length !== 2) return false;
      if (data.m[positions[0]] !== data.m[positions[1]]) return false;
    }

    return true;
  }

  function saveProgress() {
    try {
      if (state.status !== 'playing') {
        localStorage.removeItem(PROGRESS_KEY);
        return;
      }
      localStorage.setItem(PROGRESS_KEY, encodeProgress(buildProgressPayload()));
    } catch (e) {}
  }

  function clearProgress() {
    try { localStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }

  function loadSavedProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return null;
      var data = decodeProgress(raw);
      return isValidProgressPayload(data) ? data : null;
    } catch (e) {
      return null;
    }
  }

  function loadProgressData(data) {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }

    state.difficulty = data.d;
    saveDifficulty();
    setDifficultyToggleUI(state.difficulty);

    state.rows = data.r;
    state.cols = data.c;
    state.totalPairs = (data.r * data.c) / 2;
    state.cards = [];
    var matchedCount = 0;
    for (var i = 0; i < data.k.length; i++) {
      var matched = data.m[i] === '1';
      if (matched) matchedCount++;
      state.cards.push({ value: EMOJI_POOL[parseInt(data.k[i], 36)], matched: matched, flipped: matched });
    }
    state.matchedPairs = matchedCount / 2;
    state.flipped = [];
    state.moves = data.mv;
    state.busy = false;
    state.elapsedSeconds = data.t;
    state.status = state.matchedPairs >= state.totalPairs ? 'won' : 'playing';

    renderBoard();
    hideBanner();
    updateScoreboard();
    if (state.status === 'playing') {
      startTimer(state.elapsedSeconds);
    } else {
      showBanner(false);
    }
    saveProgress();
  }

  function shareProgress() {
    var url = location.protocol + '//' + location.host + location.pathname +
      '?progress=' + encodeURIComponent(encodeProgress(buildProgressPayload()));
    navigator.clipboard.writeText(url).then(function () {
      dom.btnShare.innerHTML = ICONS.check;
      setTimeout(function () { dom.btnShare.innerHTML = ICONS.send; }, 1200);
    }).catch(function () {});
  }



  function currentDims() {
    return DIFFICULTIES[state.difficulty];
  }

  function setDifficultyToggleUI(id) {
    dom.difficultyToggle.querySelectorAll('[data-difficulty]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-difficulty') === id);
    });
  }

  function shuffleArray(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function buildDeck(pairCount) {
    var pool = shuffleArray(EMOJI_POOL.slice());
    var chosen = pool.slice(0, pairCount);
    var deck = chosen.concat(chosen);
    shuffleArray(deck);
    return deck.map(function (value) {
      return { value: value, matched: false, flipped: false };
    });
  }

  function newGame() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }

    var d = currentDims();
    state.rows = d.rows;
    state.cols = d.cols;
    state.totalPairs = (d.rows * d.cols) / 2;
    state.cards = buildDeck(state.totalPairs);
    state.status = 'idle';
    state.flipped = [];
    state.matchedPairs = 0;
    state.moves = 0;
    state.busy = false;
    state.elapsedSeconds = 0;
    state.startTime = null;

    renderBoard();
    hideBanner();
    updateScoreboard();
    saveProgress();
  }

  function renderBoard() {
    dom.board.innerHTML = '';
    dom.board.classList.remove('is-locked');
    dom.board.style.gridTemplateColumns = 'repeat(' + state.cols + ', var(--card-size))';
    dom.board.style.gridTemplateRows = 'repeat(' + state.rows + ', var(--card-size))';

    state.cardEls = [];
    state.cards.forEach(function (card, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mm-card' + (card.flipped ? ' is-flipped' : '') + (card.matched ? ' is-matched' : '');
      btn.setAttribute('data-idx', idx);
      btn.innerHTML =
        '<span class="mm-card-inner">' +
        '<span class="mm-card-face mm-card-front"></span>' +
        '<span class="mm-card-face mm-card-back">' + escapeHtml(card.value) + '</span>' +
        '</span>';
      btn.addEventListener('click', onCardClick);
      dom.board.appendChild(btn);
      state.cardEls.push(btn);
      updateCardAria(idx);
    });
  }



  function onCardClick(e) {
    if (state.busy || state.status === 'won') return;
    var idx = Number(e.currentTarget.getAttribute('data-idx'));
    var card = state.cards[idx];
    if (card.flipped || card.matched) return;

    if (state.status === 'idle') {
      state.status = 'playing';
      startTimer();
    }

    flipCard(idx);
    state.flipped.push(idx);

    if (state.flipped.length === 2) {
      state.moves++;
      updateScoreboard();
      state.busy = true;
      dom.board.classList.add('is-locked');
      evaluatePair(state.flipped[0], state.flipped[1]);
      state.flipped = [];
    }
  }

  function flipCard(idx) {
    state.cards[idx].flipped = true;
    state.cardEls[idx].classList.add('is-flipped');
    updateCardAria(idx);
  }

  function unflipCard(idx) {
    state.cards[idx].flipped = false;
    state.cardEls[idx].classList.remove('is-flipped', 'is-wrong');
    updateCardAria(idx);
  }

  function evaluatePair(idxA, idxB) {
    var a = state.cards[idxA], b = state.cards[idxB];
    if (a.value === b.value) {
      a.matched = true;
      b.matched = true;
      state.cardEls[idxA].classList.add('is-matched');
      state.cardEls[idxB].classList.add('is-matched');
      updateCardAria(idxA);
      updateCardAria(idxB);
      state.matchedPairs++;
      state.busy = false;
      dom.board.classList.remove('is-locked');

      if (state.matchedPairs >= state.totalPairs) {
        handleWin();
      }
      saveProgress();
      return;
    }

    state.cardEls[idxA].classList.add('is-wrong');
    state.cardEls[idxB].classList.add('is-wrong');
    setTimeout(function () {
      unflipCard(idxA);
      unflipCard(idxB);
      state.busy = false;
      saveProgress();
      dom.board.classList.remove('is-locked');
    }, MISMATCH_DELAY);
  }



  function handleWin() {
    state.status = 'won';
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }

    var isBest = maybeSaveHighscore();
    updateScoreboard();
    Buddy.spawnConfetti();
    showBanner(isBest);
  }

  function maybeSaveHighscore() {
    var best = state.highscores[state.difficulty];
    var isBetter = !best || state.moves < best.moves ||
      (state.moves === best.moves && state.elapsedSeconds < best.time);
    if (isBetter) {
      state.highscores[state.difficulty] = { moves: state.moves, time: state.elapsedSeconds };
      saveHighscores();
      return true;
    }
    return false;
  }



  function updateCardAria(idx) {
    var card = state.cards[idx];
    var el = state.cardEls[idx];
    if (card.matched) {
      el.setAttribute('aria-label', 'Card ' + (idx + 1) + ', matched, ' + card.value);
    } else if (card.flipped) {
      el.setAttribute('aria-label', 'Card ' + (idx + 1) + ', showing ' + card.value);
    } else {
      el.setAttribute('aria-label', 'Card ' + (idx + 1) + ', hidden');
    }
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatTime(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    var s = totalSeconds % 60;
    return (h > 0 ? h + ':' + pad2(m) : '' + m) + ':' + pad2(s);
  }

  function updateScoreboard() {
    dom.movesCount.textContent = String(state.moves);
    dom.timeElapsed.textContent = formatTime(state.elapsedSeconds);
    var best = state.highscores[state.difficulty];
    dom.bestMoves.textContent = best == null ? '--' : String(best.moves);
  }

  function startTimer(initialElapsed) {
    state.elapsedSeconds = initialElapsed || 0;
    state.startTime = Date.now() - state.elapsedSeconds * 1000;
    state.timerId = setInterval(function () {
      state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
      dom.timeElapsed.textContent = formatTime(state.elapsedSeconds);
    }, 250);
  }

  function hideBanner() {
    dom.banner.hidden = true;
    dom.banner.innerHTML = '';
  }

  function showBanner(isBest) {
    dom.banner.hidden = false;
    dom.banner.className = 'mm-banner';
    dom.banner.innerHTML = ICONS.award +
      '<span>You matched everything! ' + state.moves + ' moves in ' + formatTime(state.elapsedSeconds) +
      (isBest ? ' — new best!' : '') + '</span>';
  }



  var modalApi = Buddy.modal.init();
  var openModal = modalApi.open;
  var closeModal = modalApi.close;

  function openConfirmModal(title, message, confirmLabel, onConfirm, opts) {
    opts = opts || {};
    var danger = opts.danger ? 'btn-danger' : 'btn-primary';
    var html =
      '<p class="modal-message">' + escapeHtml(message) + '</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="btnConfirmNo">Cancel</button>' +
      '<button class="btn ' + danger + '" id="btnConfirmYes">' + escapeHtml(confirmLabel) + '</button>' +
      '</div>';
    openModal(title, html, function (body) {
      body.querySelector('#btnConfirmNo').addEventListener('click', closeModal);
      body.querySelector('#btnConfirmYes').addEventListener('click', function () {
        closeModal();
        onConfirm();
      });
    }, { autoSize: true });
  }

  function openSettingsModal() {
    Buddy.settings.open(APP_KEY, openModal, closeModal, { appVersion: APP_VERSION });
  }

  function openResumeModal(progressData) {
    var html =
      '<p class="modal-message">We found a saved game on your system.<br>Do you want to resume from where you left off?</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="btnResumeNo">No</button>' +
      '<button class="btn btn-primary" id="btnResumeYes">Yes</button>' +
      '</div>';
    openModal('Resume Saved Game?', html, function (body) {
      body.querySelector('#btnResumeNo').addEventListener('click', function () {
        closeModal();
        clearProgress();
        newGame();
      });
      body.querySelector('#btnResumeYes').addEventListener('click', function () {
        closeModal();
        loadProgressData(progressData);
      });
    }, { autoSize: true, forceChoice: true });
  }

  function openHelpModal() {
    var html =
      '<div class="modal-message">' +
      '<ul class="help-list">' +
      '<li>Click any face-down card to flip it, then click a second card to try to match it.</li>' +
      '<li>Matching pairs stay face-up. If they don&rsquo;t match, both cards flip back after a moment.</li>' +
      '<li>Clear the whole board by matching every pair — fewer moves and less time make for a better score.</li>' +
      '<li>Your best move count for each difficulty is saved. Check it anytime from the High Scores button.</li>' +
      '<li>Switch difficulty anytime with Easy / Medium / Hard / Expert for a bigger board.</li>' +
      '</ul>' +
      '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-primary" id="btnCloseHelp">Got it</button>' +
      '</div>';

    openModal('How to Play', html, function (body) {
      body.querySelector('#btnCloseHelp').addEventListener('click', closeModal);
    }, { autoSize: true });
  }

  function openHighScoresModal() {
    var rows = ['easy', 'medium', 'hard', 'expert'].map(function (id) {
      var d = DIFFICULTIES[id];
      var best = state.highscores[id];
      var value = best == null ? '—' :
        best.moves + ' moves<span class="mm-score-sep">&middot;</span>' + formatTime(best.time);
      return '<div class="mm-score-row">' +
        '<span class="mm-score-label">' + escapeHtml(d.label) + '</span>' +
        '<span class="mm-score-value">' + value + '</span>' +
        '</div>';
    }).join('');

    var html = '<div class="mm-score-list">' + rows + '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" id="btnClearScores">Clear High Scores</button>' +
      '<button type="button" class="btn btn-primary" id="btnCloseScores">Close</button>' +
      '</div>';

    openModal('High Scores', html, function (body) {
      body.querySelector('#btnCloseScores').addEventListener('click', closeModal);
      body.querySelector('#btnClearScores').addEventListener('click', function () {
        openConfirmModal('Clear High Scores', 'Delete all saved best scores? This cannot be undone.', 'Clear', function () {
          state.highscores = {};
          saveHighscores();
          updateScoreboard();
        }, { danger: true });
      });
    }, { autoSize: true });
  }
})();
