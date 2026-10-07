/* UI: routing, screens, quiz runner */
(function (CH) {
  'use strict';
  const { esc, $, $$ } = CH;
  const app = $('#app');
  CH.settings = Object.assign({ showPy: true, showEn: true, strict: true, n: 10 }, CH.store.get('settings', {}));
  const saveSettings = () => CH.store.set('settings', CH.settings);
  const han = (z, c) => '<span class="han ' + (c || '') + '">' + esc(z) + '</span>';
  const py = p => '<span class="py">' + esc(p) + '</span>';
  const spk = (t, extra) => '<button class="spk ' + (extra || '') + '" data-say="' + esc(t) + '" aria-label="Play">🔊</button>';
  const say = (t, o) => CH.tts.speak(t, o);

  CH.tts.init();
  CH.build();

  function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 1800); }

  /* global delegated audio buttons */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) { e.preventDefault(); if (!CH.tts.supported) return toast('Speech not supported in this browser'); say(b.dataset.say, { slow: b.dataset.slow === '1' }); }
  });

  /* ---------- scope sheet ---------- */
  function openScope() {
    const sh = $('#sheet'); sh.hidden = false;
    const draw = () => {
      const s = CH.scope, n = CH.DB.max;
      let chips = '';
      for (let i = 1; i <= n; i++) chips += '<button class="chip ' + (i >= s.from && i <= s.to ? 'on' : '') + '" data-l="' + i + '">' + i + '</button>';
      sh.innerHTML = '<div><h2>Quiz me on…</h2><p class="hint">Tap a lesson. Tap two lessons to select a range (e.g. 3 then 4). Single tap = just that lesson.</p><div class="chips" id="ch">' + chips + '</div>' +
        '<div class="row" style="margin:12px 0"><button class="btn alt" data-p="1,2">1–2</button><button class="btn alt" data-p="3,4">3–4</button><button class="btn alt" data-p="5,6">5–6</button><button class="btn alt" data-p="1,' + n + '">All</button></div>' +
        '<label class="sw"><span>Include earlier lessons as review<br><small>Mixed in less often (foundational material)</small></span><input type="checkbox" id="rv" ' + (s.review ? 'checked' : '') + '></label>' +
        '<p><b>' + CH.scopeLabel() + '</b></p><button class="btn block" id="done">Done</button></div>';
    };
    let pending = null;
    draw();
    sh.onclick = e => {
      if (e.target === sh) { sh.hidden = true; return route(); }
      const c = e.target.closest('[data-l]'), p = e.target.closest('[data-p]');
      if (c) {
        const l = +c.dataset.l;
        if (pending == null) { pending = l; CH.setScope({ from: l, to: l }); } else { CH.setScope({ from: Math.min(pending, l), to: Math.max(pending, l) }); pending = null; }
        draw();
      } else if (p) { const [a, b] = p.dataset.p.split(',').map(Number); CH.setScope({ from: a, to: b }); pending = null; draw(); }
      else if (e.target.id === 'rv') { CH.setScope({ review: e.target.checked }); draw(); }
      else if (e.target.id === 'done') { sh.hidden = true; route(); }
    };
  }
  $('#scopeBtn').onclick = openScope;

  /* ---------- router ---------- */
  const routes = {};
  function route() {
    CH.tts.stop();
    $('#scopeBtn').textContent = CH.scopeLabel();
    const h = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = h.split('/');
    const r = routes[name || 'home'] || routes.home;
    $$('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.r === (name || 'home')));
    app.innerHTML = '';
    r(rest);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- home ---------- */
  routes.home = () => {
    const missing = [];
    for (let i = 1; i <= 14; i++) if (!CH.DB.lessons[i]) missing.push(i);
    let h = '<div class="card"><h2>Ready to practice</h2><p>Focus: <b>' + CH.scopeLabel() + '</b></p><p class="hint">' +
      (CH.scope.from > 1 && CH.scope.review ? 'Earlier lessons appear less often as review.' : 'Change the range with the red button above.') + '</p>' +
      '<a class="btn block" href="#/quiz/mock">Start mock quiz (' + CH.settings.n * 2 + ' mixed questions)</a></div>';
    if (missing.length) h += '<div class="card hint">Lessons not loaded yet: ' + missing.join(', ') + '</div>';
    h += '<div class="grid">';
    CH.drills.forEach(c => { h += '<a class="tile" href="#/cat/' + c.id + '"><i>' + c.icon + '</i><b>' + esc(c.name) + '</b><small>' + esc(c.desc) + '</small></a>'; });
    h += '<a class="tile" href="#/oral"><i>🎤</i><b>Oral exam prep</b><small>Read aloud, role-play, answer questions</small></a>' +
      '<a class="tile" href="#/study"><i>📖</i><b>Study</b><small>Vocab, flashcards, grammar, pronunciation</small></a></div>';
    app.innerHTML = h;
  };

  routes.cat = ([id]) => {
    const c = CH.drills.find(x => x.id === id); if (!c) return routes.home();
    let h = '<h2>' + c.icon + ' ' + esc(c.name) + '</h2><p class="hint">' + CH.scopeLabel() + '</p>';
    h += '<a class="btn block" href="#/quiz/all:' + c.id + '">Mix everything in this section</a><div class="card list">';
    c.items.forEach(i => { h += '<a class="item" style="text-decoration:none;color:inherit" href="' + (i.route || '#/quiz/' + i.id) + '"><span class="m">' + (i.audio ? '🔊 ' : '') + esc(i.name) + '</span><span>›</span></a>'; });
    app.innerHTML = h + '</div>';
  };

  /* ---------- study ---------- */
  routes.study = ([sub, arg]) => {
    if (sub === 'vocab') return studyVocab();
    if (sub === 'flash') return flash();
    if (sub === 'grammar') return studyGrammar();
    if (sub === 'pron') return studyPron();
    if (sub === 'text') return studyText();
    app.innerHTML = '<h2>Study</h2><p class="hint">' + CH.scopeLabel() + '</p><div class="grid">' +
      '<a class="tile" href="#/study/vocab"><i>📚</i><b>Vocabulary</b><small>With audio</small></a>' +
      '<a class="tile" href="#/study/flash"><i>🃏</i><b>Flashcards</b></a>' +
      '<a class="tile" href="#/study/text"><i>💬</i><b>Dialogues</b><small>Read & listen</small></a>' +
      '<a class="tile" href="#/study/grammar"><i>🧩</i><b>Grammar</b></a>' +
      '<a class="tile" href="#/study/pron"><i>🔔</i><b>Pronunciation</b><small>Initials, finals, tones</small></a></div>';
  };
  const lessonsInRange = () => CH.DB.nums.filter(n => n >= CH.scope.from && n <= CH.scope.to);
  function studyVocab() {
    let h = '<h2>Vocabulary</h2>';
    lessonsInRange().forEach(n => {
      const l = CH.DB.lessons[n];
      h += '<h3>Lesson ' + n + ' ' + esc(CH.lessonTitle(n)) + '</h3><div class="card list">';
      (l.vocab || []).forEach(v => { h += '<div class="item">' + spk(v.zh) + '<div class="m">' + han(v.zh, 'md') + ' ' + py(v.py) + '<br><small>' + esc((v.pos ? v.pos + ' ' : '') + v.en) + '</small></div></div>'; });
      h += '</div>';
    });
    app.innerHTML = h;
  }
  function studyText() {
    let h = '<h2>Dialogues</h2><label class="sw"><span>Show pinyin</span><input type="checkbox" id="tp" ' + (CH.settings.showPy ? 'checked' : '') + '></label>';
    lessonsInRange().forEach(n => {
      (CH.DB.lessons[n].texts || []).forEach(t => {
        h += '<h3>L' + n + ' · ' + esc(t.title || '') + '</h3><div class="card">';
        (t.lines || []).forEach(l => { h += '<div class="dl row">' + spk(l.zh) + '<div class="m">' + (l.sp ? '<span class="sp">' + esc(l.sp) + '：</span>' : '') + han(l.zh, 'md') + '<div class="py pyl" ' + (CH.settings.showPy ? '' : 'hidden') + '>' + esc(l.py || '') + '</div><small>' + esc(l.en || '') + '</small></div></div>'; });
        h += '</div>';
      });
    });
    app.innerHTML = h;
    $('#tp').onchange = e => { CH.settings.showPy = e.target.checked; saveSettings(); $$('.pyl').forEach(x => x.hidden = !e.target.checked); };
  }
  function studyGrammar() {
    let h = '<h2>Grammar</h2>';
    lessonsInRange().forEach(n => {
      const g = CH.DB.lessons[n].grammar || [];
      if (!g.length) return;
      h += '<h3>Lesson ' + n + '</h3>';
      g.forEach(x => {
        h += '<div class="card"><b>' + esc(x.title) + '</b><p>' + esc(x.note) + '</p>';
        (x.examples || []).forEach(e => { h += '<div class="row">' + spk(e.zh) + '<div class="m">' + han(e.zh, 'md') + '<br>' + py(e.py || '') + '<br><small>' + esc(e.en || '') + '</small></div></div>'; });
        h += '</div>';
      });
    });
    app.innerHTML = h;
  }
  function studyPron() {
    let h = '<h2>Pronunciation</h2>';
    lessonsInRange().forEach(n => {
      const p = CH.DB.lessons[n].pron || {};
      const has = (p.initials || []).length || (p.finals || []).length || (p.notes || []).length || (p.drills || []).length;
      if (!has) return;
      h += '<h3>Lesson ' + n + '</h3><div class="card">';
      const fmt = a => a.map(x => esc(typeof x === 'string' ? x : (x.py || x.zh || x.name || JSON.stringify(x)))).join(' · ');
      if ((p.initials || []).length) h += '<p><b>Initials:</b> ' + fmt(p.initials) + '</p>';
      if ((p.finals || []).length) h += '<p><b>Finals:</b> ' + fmt(p.finals) + '</p>';
      (p.notes || []).forEach(x => { h += '<p>• ' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</p>'; });
      if ((p.drills || []).length) {
        h += '<b>Drill (tap to hear):</b><div class="chips" style="margin-top:6px">';
        p.drills.forEach(d => { if (d && d.py) h += '<button class="chip" data-say="' + esc(CH.cleanZh(d.zh || '') || d.py) + '" data-py="' + esc(d.py) + '">' + esc(d.py) + '</button>'; });
        h += '</div>';
      }
      h += '</div>';
    });
    app.innerHTML = h + '<p class="hint">Chip audio uses the Chinese voice reading the pinyin syllable, which is best for tone listening on words. Tone/word drills in the Quiz tab use real characters.</p>';
  }
  function flash() {
    const words = CH.draw(CH.DB.words, 40);
    let i = 0, side = 0;
    const draw = () => {
      const w = words[i];
      if (!w) { app.innerHTML = '<h2>Done!</h2><a class="btn block" href="#/study">Back</a>'; return; }
      app.innerHTML = '<div class="row sp"><h2>Flashcards</h2><small>' + (i + 1) + '/' + words.length + '</small></div><div class="card flip" id="fc">' +
        (side === 0 ? '<div>' + han(w.zh, 'xxl') + '</div><div class="hint">tap to flip</div>' : '<div>' + han(w.zh, 'xl') + '</div><div class="py xl">' + esc(w.py) + '</div><div>' + esc(w.en) + '</div>') + '</div>' +
        '<div class="row" style="justify-content:center">' + spk(w.zh, 'big') + '</div><div class="grid" style="margin-top:12px"><button class="btn alt" id="no">Again</button><button class="btn" id="yes">Got it</button></div>';
      $('#fc').onclick = () => { side ^= 1; if (side) say(w.zh); draw(); };
      $('#no').onclick = () => { CH.stats.record('flash', w.id, false); words.push(w); i++; side = 0; draw(); };
      $('#yes').onclick = () => { CH.stats.record('flash', w.id, true); i++; side = 0; draw(); };
    };
    draw();
  }

  /* ---------- quiz runner ---------- */
  routes.quiz = ([id]) => {
    id = decodeURIComponent(id || 'mock');
    let ids, title, n = CH.settings.n;
    if (id === 'mock') { ids = CH.MOCK; n = CH.settings.n * 2; title = 'Mock quiz'; }
    else if (id.startsWith('all:')) { const c = CH.drills.find(x => x.id === id.slice(4)); ids = c.items.filter(i => i.gen).map(i => i.gen); title = c.name; }
    else { ids = [id]; title = (CH.genIndex[id] || {}).name || id; }
    const qs = CH.makeQuiz(ids, n);
    if (!qs.length) { app.innerHTML = '<div class="card"><h2>Not enough material</h2><p>Not enough content loaded for this drill in ' + CH.scopeLabel() + '. Try widening the lesson range.</p></div>'; return; }
    runQuiz(qs, title);
  };

  function runQuiz(qs, title) {
    let i = 0, score = 0; const missed = [];
    const next = () => {
      if (i >= qs.length) return finish();
      const q = qs[i];
      let h = '<div class="row sp"><b>' + esc(title) + '</b><small>' + (i + 1) + ' / ' + qs.length + '</small></div><div class="bar"><div style="width:' + (i / qs.length * 100) + '%"></div></div><div class="q card"><div class="title">' + esc(q.title) + '</div>';
      if (q.speak) h += '<div style="margin:8px 0">' + spk(q.speak, 'big') + (q.type === 'input' || q.drill.indexOf('listen') === 0 || q.drill === 'toneListen' || q.drill === 'soundListen' ? ' <button class="spk" data-say="' + esc(q.speak) + '" data-slow="1" title="Slow">🐢</button>' : '') + '</div>';
      h += q.prompt || '';
      if (q.type === 'mc') {
        h += '<div class="choices ' + (q.cls || '') + '">' + q.choices.map((c, k) => '<button class="choice" data-k="' + k + '">' + c.html + '</button>').join('') + '</div>';
      } else if (q.type === 'input') {
        h += '<input class="inp" id="in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="' + esc(q.placeholder || '') + '">';
        if (q.inputKind === 'py') h += '<div class="keys">' + ['ā', 'á', 'ǎ', 'à', 'ē', 'é', 'ě', 'è', 'ī', 'í', 'ǐ', 'ì', 'ō', 'ó', 'ǒ', 'ò', 'ū', 'ú', 'ǔ', 'ù', 'ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'].map(c => '<button data-ins="' + c + '">' + c + '</button>').join('') + '</div><div class="hint">Tip: typing numbers works too (ni3 hao3).</div>';
        if (q.tiles) h += '<div class="hint">Or tap characters:</div><div class="tiles">' + q.tiles.map(t => '<button data-ins="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div><button class="btn alt" id="clr">Clear</button>';
        h += '<button class="btn block" id="sub">Check</button>';
      } else if (q.type === 'order') {
        h += '<div class="tiles ans" id="ans"></div><div class="tiles" id="bank">' + q.tiles.map((t, k) => '<button data-k="' + k + '">' + esc(t) + '</button>').join('') + '</div><button class="btn alt" id="clr">Reset</button><button class="btn block" id="sub">Check</button>';
      }
      h += '<div id="fb"></div></div>';
      app.innerHTML = h;
      if (q.speak && CH.settings.autoplay !== false && (q.drill.indexOf('listen') === 0 || q.drill === 'toneListen' || q.drill === 'soundListen' || q.type === 'input')) setTimeout(() => say(q.speak), 250);
      wire(q);
    };

    const feedback = (q, ok, extra) => {
      CH.stats.record(q.drill, q.item && q.item.id, ok);
      if (ok) score++; else missed.push(q);
      $('#fb').innerHTML = '<div class="fb ' + (ok ? 'ok' : 'bad') + '"><b>' + (ok ? '✓ Correct' : '✗ Not quite') + '</b>' + (extra || '') + '<div style="margin-top:6px">' + (q.explain || '') + '</div></div><button class="btn block" id="nx">' + (i + 1 >= qs.length ? 'See results' : 'Next') + '</button>';
      $('#nx').onclick = () => { i++; next(); };
      $('#nx').focus();
    };

    function wire(q) {
      if (q.type === 'mc') {
        $$('.choice').forEach(b => b.onclick = () => {
          if (b.dataset.done) return;
          const ok = q.choices[+b.dataset.k].ok;
          $$('.choice').forEach((x, k) => { x.dataset.done = 1; if (q.choices[k].ok) x.classList.add('ok'); });
          if (!ok) b.classList.add('bad');
          feedback(q, ok);
        });
      } else if (q.type === 'input') {
        const inp = $('#in');
        $$('[data-ins]').forEach(b => b.onclick = () => { inp.value += b.dataset.ins; inp.focus(); });
        const clr = $('#clr'); if (clr) clr.onclick = () => { inp.value = ''; };
        const go = () => {
          if ($('#sub').disabled) return;
          const ok = q.check(inp.value);
          $('#sub').disabled = true; inp.disabled = true;
          feedback(q, ok, ok ? '' : '<div>Your answer: ' + esc(inp.value || '(empty)') + '<br>Correct: ' + q.answerHtml + '</div>');
        };
        $('#sub').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
        inp.focus();
      } else if (q.type === 'order') {
        const picked = [];
        const redraw = () => {
          $('#ans').innerHTML = picked.map(k => '<button data-u="' + k + '">' + esc(q.tiles[k]) + '</button>').join('');
          $$('#bank button').forEach(b => b.style.visibility = picked.indexOf(+b.dataset.k) >= 0 ? 'hidden' : 'visible');
          $$('#ans button').forEach(b => b.onclick = () => { picked.splice(picked.indexOf(+b.dataset.u), 1); redraw(); });
        };
        $$('#bank button').forEach(b => b.onclick = () => { picked.push(+b.dataset.k); redraw(); });
        $('#clr').onclick = () => { picked.length = 0; redraw(); };
        $('#sub').onclick = () => {
          if ($('#sub').disabled) return; $('#sub').disabled = true;
          const got = picked.map(k => q.tiles[k]).join('');
          feedback(q, CH.hanOnly(got) === q.answerText, '<div>Your order: ' + esc(got) + '</div>');
          say(q.item.zh);
        };
      }
    }

    function finish() {
      const pct = Math.round(score / qs.length * 100);
      CH.stats.data.history = (CH.stats.data.history || []).concat([{ t: Date.now(), title, scope: CH.scopeLabel(), score, n: qs.length }]).slice(-30); CH.stats.save();
      let h = '<div class="card q"><h2>' + score + ' / ' + qs.length + ' (' + pct + '%)</h2><p>' + (pct >= 90 ? '优秀! Excellent.' : pct >= 70 ? '不错! Good job.' : 'Keep practicing — review the misses below.') + '</p></div>';
      if (missed.length) {
        h += '<h3>Review misses</h3>';
        missed.forEach(q => { h += '<div class="card"><small>' + esc(q.title) + '</small><br>' + (q.explain || '') + (q.speak ? ' ' + spk(q.speak) : '') + '</div>'; });
      }
      h += '<a class="btn block" href="#/quiz/' + encodeURIComponent(location.hash.split('/').slice(2).join('/')) + '" id="again">Try again (new questions)</a><a class="btn alt block" href="#/">Home</a>';
      app.innerHTML = h;
      $('#again').onclick = e => { e.preventDefault(); routes.quiz([location.hash.split('/').slice(2).join('/')]); };
    }
    next();
  }

  /* ---------- oral ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function listenOnce(onres, onerr) {
    if (!SR) return onerr && onerr('unsupported');
    const r = new SR(); r.lang = 'zh-CN'; r.interimResults = false; r.maxAlternatives = 3;
    r.onresult = e => onres(Array.from(e.results[0]).map(a => a.transcript));
    r.onerror = e => onerr && onerr(e.error);
    r.onend = () => onerr && onerr('end');
    try { r.start(); } catch (e) { onerr && onerr('error'); }
    return r;
  }
  routes.oral = ([mode]) => {
    if (mode === 'read') return oralRead();
    if (mode === 'role') return oralRole();
    if (mode === 'qa') return oralQA();
    if (mode === 'prompts') return oralPrompts();
    app.innerHTML = '<h2>Oral exam prep</h2><p class="hint">' + CH.scopeLabel() + (SR ? '' : ' · Speech recognition not available in this browser (use Chrome/Safari) — you can still self-check.') + '</p><div class="grid">' +
      '<a class="tile" href="#/oral/read"><i>📢</i><b>Read aloud</b><small>Shadow the audio, then record yourself</small></a>' +
      '<a class="tile" href="#/oral/role"><i>🎭</i><b>Role-play</b><small>Partner speaks, you reply</small></a>' +
      '<a class="tile" href="#/oral/qa"><i>❓</i><b>Answer questions</b><small>Respond like the exam</small></a>' +
      '<a class="tile" href="#/oral/prompts"><i>🗣️</i><b>Speaking topics</b><small>Introduce yourself, family…</small></a></div>';
  };
  function selfCheckUI(target, onRate) {
    return '<div class="row" style="justify-content:center;flex-wrap:wrap">' + (SR ? '<button class="btn" id="rec">🎙️ Record</button>' : '') + '<button class="btn alt" id="ok">I said it right</button><button class="btn alt" id="redo">Try again</button></div><div id="res" class="hint"></div>';
  }
  function bindRec(target, onDone) {
    const rec = $('#rec');
    if (rec) rec.onclick = () => {
      rec.disabled = true; rec.textContent = '🎙️ Listening…';
      let got = false;
      listenOnce(alts => {
        got = true;
        const best = Math.max.apply(null, alts.map(a => CH.similarity(a, target)));
        $('#res').innerHTML = 'Heard: <b>' + esc(alts[0]) + '</b> — match ' + Math.round(best * 100) + '%' + (best >= 0.8 ? ' ✓' : ' — listen again and retry');
        if (best >= 0.8) onDone(true);
      }, err => { rec.disabled = false; rec.textContent = '🎙️ Record'; if (!got && err !== 'end') $('#res').textContent = 'Could not hear you (' + err + ').'; });
    };
    $('#ok').onclick = () => onDone(true);
    $('#redo').onclick = () => { $('#res').textContent = ''; say(target); };
  }
  function oralRead() {
    const sents = CH.draw(CH.DB.sents.filter(s => CH.hanOnly(s.zh).length <= 20), 12);
    let i = 0;
    const draw = () => {
      const s = sents[i]; if (!s) { app.innerHTML = '<h2>Done!</h2><a class="btn block" href="#/oral">Back</a>'; return; }
      app.innerHTML = '<div class="row sp"><h2>Read aloud</h2><small>' + (i + 1) + '/' + sents.length + '</small></div><div class="card q">' + han(s.zh, 'lg') + '<div class="py">' + esc(s.py) + '</div><small>' + esc(s.en) + '</small><div style="margin:10px">' + spk(s.zh, 'big') + ' <button class="spk" data-say="' + esc(s.zh) + '" data-slow="1">🐢</button></div>' + selfCheckUI() + '</div><button class="btn block" id="nx">Next</button>';
      bindRec(s.zh, ok => { CH.stats.record('oral', s.id, ok); i++; draw(); });
      $('#nx').onclick = () => { i++; draw(); };
      setTimeout(() => say(s.zh), 200);
    };
    draw();
  }
  function oralRole() {
    const ds = CH.DB.dialogs.filter(d => d.lesson >= CH.scope.from && d.lesson <= CH.scope.to);
    if (!ds.length) { app.innerHTML = '<div class="card">No dialogues in range.</div>'; return; }
    let h = '<h2>Role-play</h2><p class="hint">Pick a dialogue.</p><div class="card list">';
    ds.forEach((d, k) => { h += '<a class="item" style="color:inherit;text-decoration:none" href="#/oral/role" data-d="' + k + '"><span class="m">L' + d.lesson + ' · ' + esc(d.title) + '<br><small>' + esc(d.lines[0].zh) + '</small></span>›</a>'; });
    app.innerHTML = h + '</div>';
    $$('[data-d]').forEach(a => a.onclick = e => { e.preventDefault(); playRole(ds[+a.dataset.d]); });
  }
  function playRole(d) {
    const sps = Array.from(new Set(d.lines.map(l => l.sp || 'A')));
    app.innerHTML = '<h2>' + esc(d.title) + '</h2><p>You play:</p><div class="chips">' + sps.map(s => '<button class="chip" data-me="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>';
    $$('[data-me]').forEach(b => b.onclick = () => runRole(d, b.dataset.me));
  }
  function runRole(d, me) {
    let i = 0;
    const step = () => {
      if (i >= d.lines.length) { app.innerHTML = '<h2>Finished!</h2><a class="btn block" href="#/oral/role">Another dialogue</a>'; return; }
      const l = d.lines[i], mine = (l.sp || 'A') === me;
      const hist = d.lines.slice(0, i).map(x => '<div class="dl">' + (x.sp ? '<span class="sp">' + esc(x.sp) + '：</span>' : '') + han(x.zh) + '</div>').join('');
      app.innerHTML = '<h2>' + esc(d.title) + '</h2><div class="card">' + hist + '</div>' +
        (mine ? '<div class="card q"><div class="title">Your line (' + esc(me) + ')</div><div class="hint">' + esc(l.en || '') + '</div><details><summary>Show hint</summary>' + han(l.zh, 'lg') + '<div class="py">' + esc(l.py || '') + '</div></details>' + selfCheckUI() + '</div>' :
          '<div class="card q"><div class="title">' + esc(l.sp || 'Partner') + ' says…</div>' + spk(l.zh, 'big') + '<div class="hint">' + esc(l.en || '') + '</div><button class="btn block" id="nx">Continue</button></div>');
      if (mine) bindRec(l.zh, () => { i++; step(); }); else { $('#nx').onclick = () => { i++; step(); }; setTimeout(() => say(l.zh), 200); }
    };
    step();
  }
  function oralQA() {
    const pairs = [];
    CH.DB.dialogs.filter(d => d.lesson <= CH.scope.to).forEach(d => d.lines.forEach((l, k) => { if (/[？?]/.test(l.zh) && d.lines[k + 1]) pairs.push({ id: 'qa' + d.id + k, lesson: d.lesson, q: l, a: d.lines[k + 1] }); }));
    const qs = CH.draw(pairs, 10); let i = 0;
    const draw = () => {
      const p = qs[i]; if (!p) { app.innerHTML = '<h2>Done!</h2><a class="btn block" href="#/oral">Back</a>'; return; }
      app.innerHTML = '<div class="row sp"><h2>Answer the question</h2><small>' + (i + 1) + '/' + qs.length + '</small></div><div class="card q">' + spk(p.q.zh, 'big') + '<div>' + han(p.q.zh, 'lg') + '</div><div class="hint">' + esc(p.q.en || '') + '</div>' + selfCheckUI() + '<details><summary>Sample answer</summary>' + han(p.a.zh, 'lg') + '<div class="py">' + esc(p.a.py || '') + '</div><small>' + esc(p.a.en || '') + '</small>' + spk(p.a.zh) + '</details></div><button class="btn block" id="nx">Next</button>';
      bindRec(p.a.zh, () => { i++; draw(); }); $('#nx').onclick = () => { i++; draw(); }; setTimeout(() => say(p.q.zh), 200);
    };
    draw();
  }
  function oralPrompts() {
    const all = [['Greet someone and ask how they are', '你好！你好吗？'], ['Say your name and ask someone\'s name', '我姓…，叫…。你贵姓？'], ['Say your nationality', '我是…人。'], ['Ask where something is', '…在哪儿？'], ['Introduce a friend', '这是我的朋友。'], ['Talk about your family', '我家有…口人。'], ['Ask the price / buy something', '多少钱？我要…。'], ['Tell the date or time', '今天几月几号？现在几点？'], ['Invite someone somewhere', '我们去…，好吗？']];
    let h = '<h2>Speaking topics</h2><p class="hint">Say 2–4 sentences out loud using vocabulary from ' + CH.scopeLabel() + '. Starters shown.</p>';
    all.forEach(a => { h += '<div class="card"><b>' + esc(a[0]) + '</b><div class="row">' + spk(a[1]) + han(a[1], 'md') + '</div></div>'; });
    app.innerHTML = h;
  }

  /* ---------- handwriting & strokes ---------- */
  routes.hand = () => {
    const chars = CH.draw(CH.DB.chars, 30);
    let i = 0, ghost = true;
    const draw = () => {
      const c = chars[i % chars.length];
      app.innerHTML = '<h2>Handwriting</h2><div class="card q"><div class="py xl">' + esc(c.py) + '</div><div class="hint">' + esc(c.en || (c.inWord && c.inWord.en) || '') + '</div>' + spk(c.zh) +
        '<div class="padwrap"><canvas class="pad" id="cv" width="600" height="600"></canvas>' + (ghost ? '<div class="ghost han">' + esc(c.zh) + '</div>' : '') + '</div>' +
        '<div class="row" style="margin-top:10px;justify-content:center"><button class="btn alt" id="und">Undo</button><button class="btn alt" id="clr">Clear</button><button class="btn alt" id="gh">' + (ghost ? 'Hide' : 'Show') + ' guide</button></div>' +
        '<button class="btn block" id="rev">Reveal answer</button><div id="ans"></div><button class="btn alt block" id="nx">Next character</button></div>';
      const cv = $('#cv'), ctx = cv.getContext('2d'); let strokes = [], cur = null;
      const render = () => { ctx.clearRect(0, 0, 600, 600); ctx.lineWidth = 14; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = getComputedStyle(document.body).color; strokes.forEach(s => { ctx.beginPath(); s.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }); };
      const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 600 / r.width, (e.clientY - r.top) * 600 / r.height]; };
      cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); cur = [pos(e)]; strokes.push(cur); render(); };
      cv.onpointermove = e => { if (cur) { cur.push(pos(e)); render(); } };
      cv.onpointerup = cv.onpointercancel = () => { cur = null; };
      $('#und').onclick = () => { strokes.pop(); render(); };
      $('#clr').onclick = () => { strokes = []; render(); };
      $('#gh').onclick = () => { ghost = !ghost; draw(); };
      $('#rev').onclick = () => { $('#ans').innerHTML = '<div class="han xxl">' + esc(c.zh) + '</div><div class="hint">' + strokes.length + ' strokes drawn. Compare shape and stroke order (use Stroke-order practice for animation).</div>'; };
      $('#nx').onclick = () => { i++; draw(); };
    };
    draw();
  };
  /* handwrite a word from its English meaning: one canvas per character, then reveal + self-grade */
  routes.write = () => {
    const words = CH.draw(CH.DB.words.filter(w => w.han && !/[()（）]/.test(w.zh) && Array.from(w.han).length <= 4), CH.settings.n);
    if (!words.length) { app.innerHTML = '<div class="card">Not enough words in this range.</div>'; return; }
    let i = 0, right = 0, hintPy = CH.store.get('writePy', true);
    const draw = () => {
      const w = words[i];
      if (!w) { app.innerHTML = '<div class="card q"><h2>' + right + ' / ' + words.length + '</h2><p>Handwriting practice done.</p></div><a class="btn block" href="#/write" id="again">Again</a><a class="btn alt block" href="#/cat/write">Back</a>'; $('#again').onclick = e => { e.preventDefault(); routes.write(); }; return; }
      const chars = Array.from(w.han);
      app.innerHTML = '<div class="row sp"><b>Handwrite from English</b><small>' + (i + 1) + ' / ' + words.length + '</small></div><div class="bar"><div style="width:' + (i / words.length * 100) + '%"></div></div>' +
        '<div class="card q"><div class="big" style="font-size:1.6rem">' + esc(w.en) + '</div>' + (w.pos ? '<div class="hint">' + esc(w.pos) + ' · ' + chars.length + ' character' + (chars.length > 1 ? 's' : '') + '</div>' : '') +
        (hintPy ? '<div class="py lg">' + esc(w.py) + '</div>' : '') + '<label class="sw"><span>Show pinyin hint</span><input type="checkbox" id="hp" ' + (hintPy ? 'checked' : '') + '></label>' +
        '<div id="pads" style="display:grid;gap:10px;grid-template-columns:repeat(' + Math.min(2, chars.length) + ',1fr);margin-top:10px">' + chars.map((c, k) => '<div><canvas class="pad" data-k="' + k + '" width="400" height="400"></canvas></div>').join('') + '</div>' +
        '<div class="row" style="justify-content:center;margin-top:8px"><button class="btn alt" id="und">Undo</button><button class="btn alt" id="clr">Clear</button><button class="btn alt" id="hear">🔊</button></div>' +
        '<button class="btn block" id="rev">Check my answer</button><div id="ans"></div></div>';
      $('#hp').onchange = e => { hintPy = e.target.checked; CH.store.set('writePy', hintPy); draw(); };
      const pads = $$('canvas.pad').map(cv => {
        const ctx = cv.getContext('2d'); const S = { strokes: [], cur: null };
        const render = () => { ctx.clearRect(0, 0, 400, 400); ctx.lineWidth = 10; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = getComputedStyle(document.body).color; S.strokes.forEach(s => { ctx.beginPath(); s.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }); };
        const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 400 / r.width, (e.clientY - r.top) * 400 / r.height]; };
        cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); S.cur = [pos(e)]; S.strokes.push(S.cur); S.last = S; render(); active = S; };
        cv.onpointermove = e => { if (S.cur) { S.cur.push(pos(e)); render(); } };
        cv.onpointerup = cv.onpointercancel = () => { S.cur = null; };
        S.render = render; return S;
      });
      let active = pads[0];
      $('#und').onclick = () => { active.strokes.pop(); active.render(); };
      $('#clr').onclick = () => { pads.forEach(p => { p.strokes = []; p.render(); }); };
      $('#hear').onclick = () => say(w.zh);
      $('#rev').onclick = () => {
        say(w.zh);
        $('#rev').hidden = true;
        $('#ans').innerHTML = '<div class="han xl">' + esc(w.zh) + '</div><div>' + py(w.py) + '</div><p class="hint">Strokes drawn: ' + pads.map(p => p.strokes.length).join(' + ') + '. Compare shapes and stroke order.</p>' +
          '<div id="hw" style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap"></div><button class="btn alt block" id="anim">▶ Show stroke order</button>' +
          '<div class="grid"><button class="btn alt" id="no">✗ Missed it</button><button class="btn" id="yes">✓ Got it</button></div>';
        const grade = ok => { CH.stats.record('writeEn', w.id, ok); if (ok) right++; i++; draw(); };
        $('#no').onclick = () => grade(false); $('#yes').onclick = () => grade(true);
        $('#anim').onclick = () => loadHW().then(() => {
          $('#hw').innerHTML = chars.map((c, k) => '<div id="hw' + k + '"></div>').join('');
          chars.forEach((c, k) => { const hw = HanziWriter.create('hw' + k, c, { width: 130, height: 130, padding: 5, strokeAnimationSpeed: 1.3, delayBetweenStrokes: 200 }); setTimeout(() => hw.animateCharacter(), k * 1500); });
          $('#anim').hidden = true;
        }).catch(() => toast('Stroke data needs internet'));
      };
    };
    draw();
  };
  let hwLoad = null;
  function loadHW() { return hwLoad || (hwLoad = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); })); }
  routes.strokes = () => {
    const chars = CH.draw(CH.DB.chars.filter(c => Array.from(c.zh).length === 1), 40); let i = 0;
    const draw = () => {
      const c = chars[i % chars.length];
      app.innerHTML = '<h2>Stroke order</h2><div class="card q"><div class="py xl">' + esc(c.py) + '</div><div class="hint">' + esc(c.en || '') + '</div><div id="hw" style="display:flex;justify-content:center"></div><div class="grid"><button class="btn alt" id="an">Animate</button><button class="btn" id="qz">Quiz me (trace)</button></div><button class="btn alt block" id="nx">Next</button><div class="hint">Needs internet for stroke data.</div></div>';
      loadHW().then(() => {
        const w = HanziWriter.create('hw', c.zh, { width: 260, height: 260, padding: 10, showOutline: true, strokeAnimationSpeed: 1.2, delayBetweenStrokes: 250 });
        w.animateCharacter();
        $('#an').onclick = () => { w.cancelQuiz(); w.animateCharacter(); };
        $('#qz').onclick = () => w.quiz({ onComplete: () => toast('Nice! ✓') });
      }).catch(() => { $('#hw').innerHTML = '<div class="han xxl">' + esc(c.zh) + '</div><div class="hint">Stroke data unavailable offline.</div>'; });
      $('#nx').onclick = () => { i++; draw(); };
    };
    draw();
  };

  /* ---------- progress / settings ---------- */
  routes.progress = () => {
    const d = CH.stats.data, modes = Object.keys(d.modes);
    let h = '<h2>Progress</h2>';
    if (!modes.length) h += '<p class="hint">Take a quiz and your stats will show up here.</p>';
    else { h += '<div class="card"><table class="t"><tr><th>Drill</th><th>Correct</th></tr>'; modes.forEach(m => { const x = d.modes[m]; h += '<tr><td>' + esc((CH.genIndex[m] || {}).name || m) + '</td><td>' + x.c + '/' + x.s + ' (' + Math.round(x.c / x.s * 100) + '%)</td></tr>'; }); h += '</table></div>'; }
    const weak = Object.keys(d.items).filter(k => d.items[k].miss > 0).sort((a, b) => d.items[b].miss - d.items[a].miss).slice(0, 12);
    if (weak.length) h += '<h3>Trouble spots</h3><div class="card">' + weak.map(k => esc(k.replace(/^[a-z]+\d*:/, '')) + ' <small>×' + d.items[k].miss + '</small>').join(' · ') + '</div>';
    if ((d.history || []).length) { h += '<h3>Recent quizzes</h3><div class="card">'; d.history.slice().reverse().slice(0, 8).forEach(x => { h += '<div>' + esc(x.title) + ' — ' + x.score + '/' + x.n + ' <small>' + esc(x.scope) + '</small></div>'; }); h += '</div>'; }
    h += '<h3>Settings</h3><div class="card"><label class="sw"><span>Show pinyin hints</span><input type="checkbox" data-s="showPy" ' + (CH.settings.showPy ? 'checked' : '') + '></label>' +
      '<label class="sw"><span>Strict tone marks when typing pinyin</span><input type="checkbox" data-s="strict" ' + (CH.settings.strict ? 'checked' : '') + '></label>' +
      '<p>Questions per quiz: <b id="nv">' + CH.settings.n + '</b></p><input type="range" min="5" max="30" step="5" value="' + CH.settings.n + '" id="nr">' +
      '<p>Speech speed: <b id="rv">' + CH.tts.rate.toFixed(2) + '</b></p><input type="range" min="0.4" max="1.2" step="0.05" value="' + CH.tts.rate + '" id="rr">' +
      '<p>Voice:</p><select id="vs"></select><p class="hint" id="vh"></p><button class="btn alt" id="tv">🔊 Test voice (你好，我是你的汉语老师)</button><br><br><button class="btn alt" id="rs">Reset progress</button></div>';
    app.innerHTML = h;
    $$('[data-s]').forEach(c => c.onchange = () => { CH.settings[c.dataset.s] = c.checked; saveSettings(); });
    $('#nr').oninput = e => { CH.settings.n = +e.target.value; $('#nv').textContent = e.target.value; saveSettings(); };
    $('#rr').oninput = e => { CH.tts.setRate(+e.target.value); $('#rv').textContent = (+e.target.value).toFixed(2); };
    const fillV = () => { $('#vs').innerHTML = CH.tts.voices.map(v => '<option value="' + esc(v.voiceURI) + '" ' + (CH.tts.voice === v ? 'selected' : '') + '>' + esc(v.name + ' (' + v.lang + ')') + '</option>').join(''); $('#vh').textContent = CH.tts.hasChinese ? '' : 'No Chinese voice found. On Windows: Settings › Time & language › Speech › add Chinese voices. On iPhone: Settings › Accessibility › Spoken Content › Voices › Chinese. Android: install Google Text-to-speech Mandarin.'; };
    fillV(); document.addEventListener('tts-voices', fillV, { once: true });
    $('#vs').onchange = e => CH.tts.setVoice(e.target.value);
    $('#tv').onclick = () => say('你好，我是你的汉语老师');
    $('#rs').onclick = () => { if (confirm('Reset all progress?')) { CH.stats.reset(); routes.progress(); } };
  };

  route();
})(window.CH);
