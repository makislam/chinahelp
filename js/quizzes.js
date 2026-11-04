/* Question generators. Each returns a question object (or null if data is insufficient).
   Question: { id, drill, title, prompt, speak?, type:'mc'|'input'|'order', choices?, cls?, input?, tiles?, answer..., explain } */
(function (CH) {
  'use strict';
  const { esc, pick, shuffle, sample, uniqBy } = CH;
  const DB = CH.DB;
  const settings = () => CH.settings;

  const han = (z, cls) => '<span class="han ' + (cls || '') + '">' + esc(z) + '</span>';
  const py = p => '<span class="py">' + esc(p) + '</span>';
  const wordLine = w => han(w.zh) + ' ' + py(w.py) + (w.en ? ' — ' + esc(w.en) : '');
  const GLYPH = ['ā', 'á', 'ǎ', 'à', 'a'];
  const ORD = ['1st', '2nd', '3rd', '4th', 'neutral'];

  const allWords = () => DB.words.filter(w => w.lesson <= CH.scope.to);
  const allSents = () => DB.sents.filter(s => s.lesson <= CH.scope.to && s.en);
  const withAlign = list => list.filter(w => w.al && w.al.length);
  /* CH.want (set by the full-review builder) forces a generator onto one specific item; null if it can't use it */
  const one = (list, f) => {
    if (CH.want) { const m = list.filter(x => CH.want(x) && (!f || f(x))); return m.length ? pick(m) : null; }
    const r = CH.draw(list, 1, f); return r[0] || null;
  };

  /* build n distinct distractors */
  function distract(correctKey, list, keyFn, n, prefer) {
    let c = uniqBy(list.filter(x => keyFn(x) !== correctKey && keyFn(x)), keyFn);
    if (prefer) { const p = c.filter(prefer); const o = c.filter(x => !prefer(x)); c = shuffle(p).concat(shuffle(o)); } else c = shuffle(c);
    return c.slice(0, n);
  }
  function mc(base, correct, wrongs, fmt) {
    const choices = shuffle([{ html: fmt(correct), ok: true }].concat(wrongs.map(w => ({ html: fmt(w), ok: false }))));
    return Object.assign({ type: 'mc', choices }, base);
  }
  /* alter one tone in a pinyin string */
  function altTone(pinyin) {
    const toks = CH.pyTokens(pinyin);
    if (!toks.length) return null;
    const i = Math.floor(Math.random() * toks.length);
    const cur = CH.toneOf(toks[i]);
    const opts = [1, 2, 3, 4].filter(t => t !== cur);
    const nt = pick(opts);
    const t = toks.slice(); t[i] = CH.applyTone(CH.stripTone(toks[i]), nt);
    return t.join(' ');
  }
  function wrongPys(w, n, pool) {
    const out = new Set();
    let guard = 0;
    while (out.size < Math.min(n, 2) && guard++ < 20) { const a = altTone(w.py); if (a && !CH.samePy(a, w.py)) out.add(a); }
    const others = distract(w.py, pool, x => CH.normPy(x.py), n, x => (x.al ? x.al.length : 0) === (w.al ? w.al.length : 0)).map(x => x.py);
    for (const o of others) { if (out.size >= n) break; out.add(o); }
    return Array.from(out).slice(0, n);
  }

  /* ---------- tone patterns ---------- */
  function patternChoices(tones) {
    const set = new Set([tones.join('')]);
    let g = 0;
    while (set.size < 4 && g++ < 60) {
      const t = tones.slice();
      const i = Math.floor(Math.random() * t.length);
      t[i] = (i > 0 && Math.random() < 0.25) ? 5 : 1 + Math.floor(Math.random() * 4);
      if (Math.random() < 0.3 && t.length > 1) { const j = Math.floor(Math.random() * t.length); t[j] = j > 0 && Math.random() < 0.25 ? 5 : 1 + Math.floor(Math.random() * 4); }
      set.add(t.join(''));
    }
    return Array.from(set).map(s => s.split('').map(Number));
  }
  const patHtml = t => '<b class="glyphs">' + t.map(x => GLYPH[x - 1]).join(' · ') + '</b><small>' + t.map(x => ORD[x - 1]).join(' + ') + '</small>';
  const patOk = (a, b) => a.join('') === b.join('');

  const G = CH.gen = {};

  /* ===================== PINYIN & TONES ===================== */
  G.toneListen = () => {
    const w = one(withAlign(DB.words), x => x.al.length <= 3);
    if (!w) return null;
    const pats = patternChoices(w.tones);
    return {
      id: 'tl:' + w.id, drill: 'toneListen', title: 'Listen: which tones do you hear?', prompt: '<div class="hint">Tap 🔊 and listen carefully. Choose the tone of each syllable.</div>',
      speak: w.zh, type: 'mc', cls: 'tonepat', choices: shuffle(pats.map(p => ({ html: patHtml(p), ok: patOk(p, w.tones) }))),
      explain: wordLine(w) + '<br><small>' + w.tones.map((t, i) => (w.al[i].py) + ' = ' + ORD[t - 1]).join(' · ') + '</small>', item: w
    };
  };
  G.toneRecall = () => {
    const w = one(withAlign(DB.words), x => x.al.length <= 3);
    if (!w) return null;
    const pats = patternChoices(w.tones);
    return {
      id: 'tr:' + w.id, drill: 'toneRecall', title: 'What are the tones?', prompt: '<div class="big">' + han(w.zh, 'xl') + '</div><div class="py big">' + esc(w.al.map(a => CH.stripTone(a.py)).join(' ')) + '</div><div class="hint">' + esc(w.en) + '</div>',
      speak: null, type: 'mc', cls: 'tonepat', choices: shuffle(pats.map(p => ({ html: patHtml(p), ok: patOk(p, w.tones) }))),
      explain: wordLine(w), item: w
    };
  };
  G.toneMark = () => {
    const w = one(withAlign(DB.words), x => x.al.length <= 3);
    if (!w) return null;
    const bare = w.al.map(a => CH.stripTone(a.py)).join(' ');
    return {
      id: 'tm:' + w.id, drill: 'toneMark', title: 'Add the tone marks', prompt: '<div class="big">' + han(w.zh, 'xl') + '</div><div class="py big">' + esc(bare) + '</div><div class="hint">' + esc(w.en) + ' — type it with tone marks (or use numbers: ni3 hao3).</div>',
      speak: w.zh, type: 'input', inputKind: 'py', placeholder: 'e.g. nǐ hǎo', check: v => CH.samePy(v, w.py, true), answerHtml: py(w.py), explain: wordLine(w), item: w
    };
  };
  G.placement = () => {
    const pool = DB.syls.filter(s => s.lesson <= CH.scope.to && (s.base.match(/[aeiouü]/g) || []).length >= 2 && s.tone < 5);
    const s = one(pool);
    if (!s) return null;
    const letters = uniqBy(Array.from(s.base).filter(c => 'aeiouü'.indexOf(c) >= 0).map(c => ({ c })), x => x.c);
    const marked = CH.applyTone(s.base, s.tone);
    const correct = Array.from(marked).find(c => CH.TONES && Object.values(CH.TONES).some(a => a.indexOf(c) >= 0));
    const base = CH.stripTone(correct);
    const rule = s.base.indexOf('a') >= 0 ? 'a always takes the mark' : s.base.indexOf('e') >= 0 ? 'e takes the mark (if there is no a)' : s.base.indexOf('ou') >= 0 ? 'in "ou" the mark goes on o' : 'otherwise the mark goes on the LAST vowel';
    return {
      id: 'tp:' + s.id, drill: 'placement', title: 'Where does the tone mark go?', prompt: '<div class="py xl">' + esc(s.base + s.tone) + '</div><div class="hint">Put tone ' + s.tone + ' on "' + esc(s.base) + '". Which letter gets the mark?</div>',
      type: 'mc', cls: 'letters', choices: shuffle(letters.map(l => ({ html: '<span class="py xl">' + esc(l.c) + '</span>', ok: l.c === base }))),
      explain: py(marked) + '<br><small>Rule: ' + rule + '.</small>', item: s
    };
  };
  G.soundListen = () => {
    const s = one(DB.syls, x => x.lesson <= CH.scope.to);
    if (!s) return null;
    const full = x => CH.applyTone(x.base || x, x.tone || s.tone);
    const cand = new Set();
    for (let t = 1; t <= 4; t++) if (t !== s.tone) cand.add(CH.applyTone(s.base, t));
    CH.CONFUSABLE.forEach(g => { if (g.indexOf(s.init) >= 0) g.forEach(i => { if (i !== s.init && DB.known.has(i + s.fin)) cand.add(CH.applyTone(i + s.fin, s.tone)); }); });
    CH.CONF_FIN.forEach(g => { g.forEach((f, idx) => { if (f === s.fin) g.forEach(f2 => { if (f2 !== f && DB.known.has(s.init + f2)) cand.add(CH.applyTone(s.init + f2, s.tone)); }); }); });
    const correct = full(s);
    cand.delete(correct);
    let wrong = shuffle(Array.from(cand)).slice(0, 3);
    if (wrong.length < 3) {
      const more = shuffle(DB.syls.filter(x => x.lesson <= CH.scope.to)).map(x => CH.applyTone(x.base, s.tone)).filter(x => x !== correct && wrong.indexOf(x) < 0);
      wrong = wrong.concat(more.slice(0, 3 - wrong.length));
    }
    return mc({ id: 'sl:' + s.id, drill: 'soundListen', title: 'Listen: which syllable is it?', prompt: '<div class="hint">Listen for the initial, the final <i>and</i> the tone.</div>', speak: s.ch, cls: 'pychoice', explain: han(s.ch) + ' ' + py(correct), item: s },
      { v: correct }, wrong.map(v => ({ v })), o => '<span class="py xl">' + esc(o.v) + '</span>');
  };

  const SANDHI = [
    ['你好', 'nǐ hǎo', 'ní hǎo', 1, 'Third tone + third tone: the first becomes 2nd tone.'],
    ['很好', 'hěn hǎo', 'hén hǎo', 1, 'Third tone + third tone: the first becomes 2nd tone.'],
    ['可以', 'kě yǐ', 'ké yǐ', 4, 'Third tone + third tone: the first becomes 2nd tone.'],
    ['小姐', 'xiǎo jiě', 'xiáo jiě', 5, 'Third tone + third tone: the first becomes 2nd tone.'],
    ['水果', 'shuǐ guǒ', 'shuí guǒ', 1, 'Third tone + third tone: the first becomes 2nd tone.'],
    ['你有', 'nǐ yǒu', 'ní yǒu', 1, 'Third tone + third tone: the first becomes 2nd tone.'],
    ['我也', 'wǒ yě', 'wó yě', 1, 'Third tone + third tone: the first becomes 2nd tone.'],
    ['不是', 'bù shì', 'bú shì', 3, '不 is bú before a 4th tone.'],
    ['不对', 'bù duì', 'bú duì', 3, '不 is bú before a 4th tone.'],
    ['不去', 'bù qù', 'bú qù', 3, '不 is bú before a 4th tone.'],
    ['不用', 'bù yòng', 'bú yòng', 3, '不 is bú before a 4th tone.'],
    ['不忙', 'bù máng', 'bù máng', 3, '不 stays bù before 1st, 2nd and 3rd tones.'],
    ['不好', 'bù hǎo', 'bù hǎo', 3, '不 stays bù before 1st, 2nd and 3rd tones.'],
    ['不来', 'bù lái', 'bù lái', 3, '不 stays bù before 1st, 2nd and 3rd tones.'],
    ['一个', 'yī gè', 'yí gè', 6, '一 is yí before a 4th tone.'],
    ['一下', 'yī xià', 'yí xià', 6, '一 is yí before a 4th tone.'],
    ['一起', 'yī qǐ', 'yì qǐ', 6, '一 is yì before 1st, 2nd and 3rd tones.'],
    ['一天', 'yī tiān', 'yì tiān', 6, '一 is yì before 1st, 2nd and 3rd tones.'],
    ['一年', 'yī nián', 'yì nián', 6, '一 is yì before 1st, 2nd and 3rd tones.'],
    ['第一', 'dì yī', 'dì yī', 6, '一 keeps its 1st tone at the end of a word or as an ordinal.']
  ].map((r, i) => ({ id: 'sa:' + i, zh: r[0], base: r[1], ans: r[2], lesson: r[3], rule: r[4] }));
  G.sandhi = () => {
    const it = one(SANDHI, x => x.lesson <= CH.scope.to);
    if (!it) return null;
    const toks = it.base.split(' ');
    const wrongs = new Set([it.base]);
    let g = 0;
    while (wrongs.size < 4 && g++ < 50) {
      const i = Math.floor(Math.random() * toks.length);
      const t = toks.slice(); t[i] = CH.applyTone(CH.stripTone(toks[i]), 1 + Math.floor(Math.random() * 4));
      wrongs.add(t.join(' '));
    }
    wrongs.delete(it.ans);
    const w = Array.from(wrongs).slice(0, 3);
    return mc({ id: it.id, drill: 'sandhi', title: 'Tone changes (sandhi)', prompt: '<div class="big">' + han(it.zh, 'xl') + '</div><div class="py big">written: ' + esc(it.base) + '</div><div class="hint">How is it actually pronounced?</div>', speak: it.zh, cls: 'pychoice', explain: py(it.ans) + '<br><small>' + esc(it.rule) + '</small>', item: it },
      { v: it.ans }, w.map(v => ({ v })), o => '<span class="py xl">' + esc(o.v) + '</span>');
  };

  /* ---------- more pinyin: tone of a syllable, initials, finals, spelling rules ---------- */
  G.toneOfSyl = () => {
    const s = one(DB.syls, x => x.tone < 5);
    if (!s) return null;
    return {
      id: 'ts:' + s.id, drill: 'toneOfSyl', title: 'Which tone is this syllable?', prompt: '<div class="big">' + han(s.ch, 'xl') + '</div><div class="py xl">' + esc(s.base) + '</div>', speak: s.ch, type: 'mc', cls: 'letters',
      choices: [1, 2, 3, 4].map(t => ({ html: '<b class="glyphs">' + GLYPH[t - 1] + '</b><small>' + ORD[t - 1] + ' tone</small>', ok: t === s.tone })),
      explain: han(s.ch) + ' ' + py(s.py) + ' — ' + ORD[s.tone - 1] + ' tone', item: s
    };
  };
  const INITS = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's'];
  function partMC(kind) {
    const s = one(DB.syls, x => x.init && x.fin);
    if (!s) return null;
    const isInit = kind === 'init';
    const correct = isInit ? s.init : s.fin;
    const near = [];
    if (isInit) CH.CONFUSABLE.forEach(g => { if (g.indexOf(correct) >= 0) g.forEach(i => { if (i !== correct && near.indexOf(i) < 0) near.push(i); }); });
    else CH.CONF_FIN.forEach(g => { if (g.indexOf(correct) >= 0) g.forEach(i => { if (i !== correct && near.indexOf(i) < 0) near.push(i); }); });
    const pool = isInit ? INITS : uniqBy(DB.syls.filter(x => x.lesson <= CH.scope.to && x.init).map(x => x.fin), x => x);
    let wr = shuffle(near).slice(0, 3);
    wr = wr.concat(shuffle(pool.filter(x => x !== correct && wr.indexOf(x) < 0))).slice(0, 3);
    if (wr.length < 3) return null;
    return mc({
      id: (isInit ? 'in:' : 'fi:') + s.id, drill: isInit ? 'initialQ' : 'finalQ', title: isInit ? 'Which initial?' : 'Which final?',
      prompt: '<div class="big">' + han(s.ch, 'xl') + '</div><div class="py xl">' + esc(s.py) + '</div><div class="hint">' + (isInit ? 'Which initial (starting consonant) does this syllable begin with?' : 'Which final (everything after the initial) does this syllable have?') + '</div>',
      speak: s.ch, cls: 'letters', explain: han(s.ch) + ' ' + py(s.py) + '<br><small>initial <b>' + esc(s.init) + '</b> + final <b>' + esc(s.fin) + '</b></small>', item: s
    }, { v: correct }, wr.map(v => ({ v })), o => '<span class="py xl">' + esc(o.v) + '</span>');
  }
  G.initialQ = () => partMC('init');
  G.finalQ = () => partMC('fin');

  const SPELL = [
    ['ī (i on its own)', 'yī', ['ī', 'wī', 'yū'], 1, 'i by itself is written yi.'],
    ['iě (i begins the syllable)', 'yě', ['iě', 'wě', 'yè'], 1, 'i at the beginning of a syllable is written y.'],
    ['ǔ (u on its own)', 'wǔ', ['ǔ', 'yǔ', 'wū'], 1, 'u by itself is written wu.'],
    ['uǒ (u begins the syllable)', 'wǒ', ['uǒ', 'yǒ', 'wò'], 1, 'u at the beginning of a syllable is written w.'],
    ['ǚ (ü on its own)', 'yǔ', ['ǚ', 'wǔ', 'yǚ'], 1, 'ü on its own becomes yu — the two dots are dropped.'],
    ['xüé (ü after x)', 'xué', ['xüé', 'xúe', 'xuě'], 4, 'After j, q, x the two dots on ü are dropped.'],
    ['g + uei, 4th tone', 'guì', ['gùei', 'gueì', 'guí'], 4, 'uei after an initial is written -ui, and the mark goes over i.'],
    ['l + uen, 4th tone', 'lùn', ['lùen', 'luèn', 'lún'], 4, 'uen after an initial is written -un.']
  ].map((r, i) => ({ id: 'sr:' + i, q: r[0], a: r[1], w: r[2], lesson: r[3], rule: r[4] }));
  G.spellRule = () => {
    const it = one(SPELL, x => x.lesson <= CH.scope.to);
    if (!it) return null;
    return mc({ id: it.id, drill: 'spellRule', title: 'Pinyin spelling rules', prompt: '<div class="py xl">' + esc(it.q) + '</div><div class="hint">How is this actually written?</div>', cls: 'letters', explain: py(it.a) + '<br><small>' + esc(it.rule) + '</small>', item: it },
      { v: it.a }, it.w.map(v => ({ v })), o => '<span class="py xl">' + esc(o.v) + '</span>');
  };
  G.numToMark = () => {
    const w = one(withAlign(DB.words), x => x.al.length <= 3);
    if (!w) return null;
    const nums = w.al.map(a => CH.stripTone(a.py) + CH.toneOf(a.py)).join(' ');
    return { id: 'nm:' + w.id, drill: 'numToMark', title: 'Tone numbers → tone marks', prompt: '<div class="py xl">' + esc(nums) + '</div><div class="hint">Rewrite with tone marks (5 = neutral tone). ' + esc(w.en) + '</div>', speak: null, type: 'input', inputKind: 'py', placeholder: 'e.g. nǐ hǎo', check: v => CH.samePy(v, w.py, true), answerHtml: py(w.py), explain: wordLine(w), item: w };
  };

  /* ===================== CHARACTER RECOGNITION ===================== */
  const wordPool = () => allWords();
  function wordMC(kind) {
    const w = one(DB.words);
    if (!w) return null;
    const pool = wordPool();
    const base = { id: kind + ':' + w.id, drill: kind, item: w, explain: wordLine(w) };
    const sameLen = x => Array.from(x.han || '').length === Array.from(w.han || '').length;
    if (kind === 'han2py') {
      const wr = wrongPys(w, 3, pool);
      if (wr.length < 2) return null;
      return mc(Object.assign(base, { title: 'What is the pinyin?', prompt: '<div class="big">' + han(w.zh, 'xl') + '</div>', speak: null, cls: 'pychoice' }), { v: w.py }, wr.map(v => ({ v })), o => '<span class="py lg">' + esc(o.v) + '</span>');
    }
    if (kind === 'han2en') {
      const wr = distract(w.en, pool, x => x.en, 3);
      if (wr.length < 2) return null;
      return mc(Object.assign(base, { title: 'What does it mean?', prompt: '<div class="big">' + han(w.zh, 'xl') + '</div><div class="py">' + (settings().showPy ? esc(w.py) : '') + '</div>', speak: w.zh }), w, wr, o => esc(o.en));
    }
    if (kind === 'en2han') {
      const wr = distract(w.han, pool, x => x.han, 3, sameLen);
      if (wr.length < 2) return null;
      return mc(Object.assign(base, { title: 'Pick the Chinese', prompt: '<div class="big">' + esc(w.en) + '</div>' + (w.pos ? '<div class="hint">' + esc(w.pos) + '</div>' : ''), cls: 'hanchoice' }), w, wr, o => han(o.zh, 'lg'));
    }
    if (kind === 'py2han') {
      const wr = distract(w.han, pool, x => x.han, 3, sameLen);
      if (wr.length < 2) return null;
      return mc(Object.assign(base, { title: 'Pick the characters', prompt: '<div class="py xl">' + esc(w.py) + '</div>', speak: w.zh, cls: 'hanchoice' }), w, wr, o => han(o.zh, 'lg'));
    }
    if (kind === 'listen2han') {
      const wr = distract(w.han, pool, x => x.han, 3, sameLen);
      if (wr.length < 2) return null;
      return mc(Object.assign(base, { title: 'Listen: which characters?', prompt: '<div class="hint">Tap 🔊 and choose the characters you hear.</div>', speak: w.zh, cls: 'hanchoice' }), w, wr, o => han(o.zh, 'lg'));
    }
    if (kind === 'listen2en') {
      const wr = distract(w.en, pool, x => x.en, 3);
      if (wr.length < 2) return null;
      return mc(Object.assign(base, { title: 'Listen: what does it mean?', prompt: '<div class="hint">Tap 🔊 and choose the meaning.</div>', speak: w.zh }), w, wr, o => esc(o.en));
    }
    return null;
  }
  ['han2py', 'han2en', 'en2han', 'py2han', 'listen2han', 'listen2en'].forEach(k => { G[k] = () => wordMC(k); });

  /* single characters (components, basic characters, syllable chars) */
  G.char2py = () => {
    const c = one(DB.chars);
    if (!c) return null;
    const pool = DB.chars.filter(x => x.lesson <= CH.scope.to);
    const wr = [];
    const a = altTone(c.py); if (a && !CH.samePy(a, c.py)) wr.push(a);
    distract(CH.normPy(c.py), pool, x => CH.normPy(x.py), 3).forEach(x => { if (wr.length < 3) wr.push(x.py); });
    if (wr.length < 2) return null;
    return mc({ id: 'ch2py:' + c.id, drill: 'char2py', title: 'Which pinyin is this character?', prompt: '<div class="big">' + han(c.zh, 'xxl') + '</div>', speak: c.zh, cls: 'pychoice', explain: han(c.zh) + ' ' + py(c.py) + (c.en ? ' — ' + esc(c.en) : '') + (c.inWord ? '<br><small>in ' + esc(c.inWord.zh) + ' (' + esc(c.inWord.en) + ')</small>' : ''), item: c },
      { v: c.py }, wr.map(v => ({ v })), o => '<span class="py lg">' + esc(o.v) + '</span>');
  };
  G.py2char = () => {
    const c = one(DB.chars);
    if (!c) return null;
    const pool = DB.chars.filter(x => x.lesson <= CH.scope.to);
    const wr = distract(c.zh, pool, x => x.zh, 3);
    if (wr.length < 2) return null;
    return mc({ id: 'py2ch:' + c.id, drill: 'py2char', title: 'Which character is it?', prompt: '<div class="py xl">' + esc(c.py) + '</div>' + (c.en ? '<div class="hint">' + esc(c.en) + '</div>' : ''), speak: c.zh, cls: 'hanchoice', explain: han(c.zh) + ' ' + py(c.py) + (c.en ? ' — ' + esc(c.en) : ''), item: c },
      c, wr, o => han(o.zh, 'xl'));
  };

  /* ===================== WRITING / TYPING ===================== */
  const tilesFor = (answerChars, n) => {
    const pool = uniqBy(DB.chars.filter(x => x.lesson <= CH.scope.to), x => x.zh).map(x => x.zh);
    const extra = shuffle(pool.filter(c => answerChars.indexOf(c) < 0)).slice(0, n || 4);
    return shuffle(answerChars.concat(extra));
  };
  G.typePy = () => {
    const w = one(DB.words);
    if (!w) return null;
    return { id: 'tp:' + w.id, drill: 'typePy', title: 'Write the pinyin', prompt: '<div class="big">' + han(w.zh, 'xl') + '</div>' + (settings().showEn ? '<div class="hint">' + esc(w.en) + '</div>' : ''), speak: null, type: 'input', inputKind: 'py', placeholder: 'pinyin with tones', check: v => CH.samePy(v, w.py, settings().strict), answerHtml: py(w.py), explain: wordLine(w), item: w };
  };
  G.typeHan = () => {
    const w = one(DB.words, x => x.han.length >= 1);
    if (!w) return null;
    const alts = String(w.zh).split('/').map(CH.hanOnly);
    const chars = Array.from(alts[0]);
    return { id: 'th:' + w.id, drill: 'typeHan', title: 'Write the characters', prompt: '<div class="big">' + esc(w.en) + '</div><div class="py lg">' + esc(w.py) + '</div>', speak: null, type: 'input', inputKind: 'han', placeholder: '汉字', tiles: tilesFor(chars, 4), check: v => alts.indexOf(CH.hanOnly(v)) >= 0, answerHtml: han(alts[0], 'lg'), explain: wordLine(w), item: w };
  };
  G.dictPy = () => {
    const w = one(DB.words);
    if (!w) return null;
    return { id: 'dp:' + w.id, drill: 'dictPy', title: 'Dictation: write the pinyin', prompt: '<div class="hint">Listen, then type the pinyin with tones.</div>', speak: w.zh, type: 'input', inputKind: 'py', placeholder: 'pinyin with tones', check: v => CH.samePy(v, w.py, settings().strict), answerHtml: py(w.py), explain: wordLine(w), item: w };
  };
  G.dictHan = () => {
    const w = one(DB.words);
    if (!w) return null;
    const alts = String(w.zh).split('/').map(CH.hanOnly);
    return { id: 'dh:' + w.id, drill: 'dictHan', title: 'Dictation: write the characters', prompt: '<div class="hint">Listen, then write the characters.</div>', speak: w.zh, type: 'input', inputKind: 'han', placeholder: '汉字', tiles: tilesFor(Array.from(alts[0]), 4), check: v => alts.indexOf(CH.hanOnly(v)) >= 0, answerHtml: han(alts[0], 'lg'), explain: wordLine(w), item: w };
  };
  G.sentPy = () => {
    const s = one(allSents(), x => CH.hanOnly(x.zh).length <= 14 && x.py);
    if (!s) return null;
    return { id: 'sp:' + s.id, drill: 'sentPy', title: 'Write the sentence in pinyin', prompt: '<div class="big">' + esc(s.en) + '</div>' + (settings().showPy ? '' : '<div class="hint">Hint: ' + han(s.zh) + '</div>'), speak: s.zh, type: 'input', inputKind: 'py', placeholder: 'pinyin with tones', check: v => CH.samePy(v, s.py, settings().strict), answerHtml: py(s.py), explain: han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en), item: s };
  };
  G.hanToPy = () => {
    const s = one(allSents(), x => CH.hanOnly(x.zh).length <= 14 && x.py);
    if (!s) return null;
    return { id: 'hp:' + s.id, drill: 'hanToPy', title: 'Write the pinyin of this sentence', prompt: '<div class="big">' + han(s.zh, 'lg') + '</div>', speak: null, type: 'input', inputKind: 'py', placeholder: 'pinyin with tones', check: v => CH.samePy(v, s.py, settings().strict), answerHtml: py(s.py), explain: han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en), item: s };
  };

  /* ---------- more reading / writing / dictation ---------- */
  const sentBase = s => han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en);
  const shortSent = n => one(allSents(), x => x.py && CH.hanOnly(x.zh).length >= 2 && CH.hanOnly(x.zh).length <= n);
  const plainPy = p => CH.pyTokens(p).join(' ');
  G.han2pySent = () => {
    const s = shortSent(14);
    if (!s) return null;
    const right = plainPy(s.py);
    const wr = new Set();
    for (let k = 0; k < 6 && wr.size < 2; k++) { const a = altTone(s.py); if (a && !CH.samePy(a, s.py)) wr.add(a); }
    distract(CH.normPy(s.py), allSents().filter(x => x.py), x => CH.normPy(x.py), 3).forEach(x => { if (wr.size < 3) wr.add(plainPy(x.py)); });
    if (wr.size < 2) return null;
    return mc({ id: 'h2ps:' + s.id, drill: 'han2pySent', title: 'Which pinyin matches the sentence?', prompt: '<div class="big">' + han(s.zh, 'lg') + '</div>', cls: 'hanchoice wide', explain: sentBase(s), item: s },
      { v: right }, Array.from(wr).map(v => ({ v })), o => '<span class="py md">' + esc(o.v) + '</span>');
  };
  G.py2enSent = () => {
    const s = shortSent(16);
    if (!s) return null;
    const wr = distract(s.en, allSents(), x => x.en, 3);
    if (wr.length < 2) return null;
    return mc({ id: 'p2es:' + s.id, drill: 'py2enSent', title: 'Read the pinyin: what does it mean?', prompt: '<div class="py big">' + esc(plainPy(s.py)) + '</div>', explain: sentBase(s), item: s }, s, wr, o => esc(o.en));
  };
  G.py2zhSent = () => {
    const s = shortSent(14);
    if (!s) return null;
    const wr = distract(s.zh, allSents(), x => x.zh, 3, x => Math.abs(CH.hanOnly(x.zh).length - CH.hanOnly(s.zh).length) <= 3);
    if (wr.length < 2) return null;
    return mc({ id: 'p2zs:' + s.id, drill: 'py2zhSent', title: 'Which characters match the pinyin?', prompt: '<div class="py big">' + esc(plainPy(s.py)) + '</div>', cls: 'hanchoice wide', explain: sentBase(s), item: s }, s, wr, o => han(o.zh, 'md'));
  };
  G.charTypePy = () => {
    const c = one(DB.chars, x => CH.isHan(x.zh));
    if (!c) return null;
    return { id: 'ctp:' + c.id, drill: 'charTypePy', title: 'Write the pinyin of this character', prompt: '<div class="big">' + han(c.zh, 'xxl') + '</div>' + (c.en && settings().showEn ? '<div class="hint">' + esc(c.en) + '</div>' : ''), speak: null, type: 'input', inputKind: 'py', placeholder: 'pinyin with tone', check: v => CH.samePy(v, c.py, settings().strict), answerHtml: py(c.py), explain: han(c.zh) + ' ' + py(c.py) + (c.en ? ' — ' + esc(c.en) : ''), item: c };
  };
  G.charFromPy = () => {
    const c = one(DB.chars, x => CH.isHan(x.zh));
    if (!c) return null;
    return { id: 'cfp:' + c.id, drill: 'charFromPy', title: 'Write the character', prompt: '<div class="py xl">' + esc(c.py) + '</div>' + (c.en ? '<div class="hint">' + esc(c.en) + '</div>' : ''), speak: null, type: 'input', inputKind: 'han', placeholder: '汉字', tiles: tilesFor([c.zh], 5), check: v => CH.hanOnly(v) === c.zh, answerHtml: han(c.zh, 'lg'), explain: han(c.zh) + ' ' + py(c.py) + (c.en ? ' — ' + esc(c.en) : ''), item: c };
  };
  G.writeSent = () => {
    const s = shortSent(10);
    if (!s) return null;
    const target = CH.hanOnly(s.zh);
    return { id: 'ws:' + s.id, drill: 'writeSent', title: 'Write the sentence in characters', prompt: '<div class="big">' + esc(s.en) + '</div>' + (settings().showPy ? '<div class="py">' + esc(plainPy(s.py)) + '</div>' : ''), speak: null, type: 'input', inputKind: 'han', placeholder: '汉字', tiles: tilesFor(Array.from(target), 4), check: v => CH.hanOnly(v) === target, answerHtml: han(target, 'lg'), explain: sentBase(s), item: s };
  };
  G.dictSentPy = () => {
    const s = shortSent(12);
    if (!s) return null;
    return { id: 'dsp:' + s.id, drill: 'dictSentPy', title: 'Dictation: write the sentence in pinyin', prompt: '<div class="hint">Listen, then type the pinyin with tones.</div>', speak: s.zh, type: 'input', inputKind: 'py', placeholder: 'pinyin with tones', check: v => CH.samePy(v, s.py, settings().strict), answerHtml: py(s.py), explain: sentBase(s), item: s };
  };
  G.dictSentHan = () => {
    const s = shortSent(10);
    if (!s) return null;
    const target = CH.hanOnly(s.zh);
    return { id: 'dsh:' + s.id, drill: 'dictSentHan', title: 'Dictation: write the sentence in characters', prompt: '<div class="hint">Listen, then write the characters.</div>', speak: s.zh, type: 'input', inputKind: 'han', placeholder: '汉字', tiles: tilesFor(Array.from(target), 4), check: v => CH.hanOnly(v) === target, answerHtml: han(target, 'lg'), explain: sentBase(s), item: s };
  };

  /* ===================== SENTENCES ===================== */
  function segment(zh) {
    const text = CH.cleanZh(zh);
    const vocab = uniqBy(allWords().map(w => w.han).filter(Boolean).concat(['吗', '呢', '吧', '的', '了', '们', '也', '都', '很', '不', '是', '我', '你', '他', '她', '在', '有', '去', '来']), x => x).sort((a, b) => b.length - a.length);
    const out = [];
    let i = 0, buf = '';
    const chars = Array.from(text);
    while (i < chars.length) {
      if (!CH.isHan(chars[i])) { if (buf) { out.push(buf); buf = ''; } i++; continue; }
      let hit = null;
      for (const v of vocab) { if (v.length > 1 || true) { const arr = Array.from(v); if (arr.length && arr.every((c, k) => chars[i + k] === c)) { hit = arr; break; } } }
      if (hit) { if (buf) { out.push(buf); buf = ''; } out.push(hit.join('')); i += hit.length; } else { buf += chars[i]; i++; }
    }
    if (buf) out.push(buf);
    return out.filter(x => x);
  }
  CH.segment = segment;

  G.listenEn = () => {
    const s = one(allSents(), x => x.en);
    if (!s) return null;
    const wr = distract(s.en, allSents(), x => x.en, 3);
    if (wr.length < 2) return null;
    return mc({ id: 'le:' + s.id, drill: 'listenEn', title: 'Listen: what was said?', prompt: '<div class="hint">Tap 🔊 and choose the English meaning.</div>', speak: s.zh, explain: han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en), item: s }, s, wr, o => esc(o.en));
  };
  G.readEn = () => {
    const s = one(allSents(), x => x.en);
    if (!s) return null;
    const wr = distract(s.en, allSents(), x => x.en, 3);
    if (wr.length < 2) return null;
    return mc({ id: 're:' + s.id, drill: 'readEn', title: 'What does this sentence mean?', prompt: '<div class="big">' + han(s.zh, 'lg') + '</div>' + (settings().showPy ? '<div class="py">' + esc(s.py) + '</div>' : ''), speak: s.zh, explain: han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en), item: s }, s, wr, o => esc(o.en));
  };
  G.enToZh = () => {
    const s = one(allSents(), x => x.en);
    if (!s) return null;
    const wr = distract(s.zh, allSents(), x => x.zh, 3, x => Math.abs(CH.hanOnly(x.zh).length - CH.hanOnly(s.zh).length) <= 3);
    if (wr.length < 2) return null;
    return mc({ id: 'ez:' + s.id, drill: 'enToZh', title: 'How do you say it in Chinese?', prompt: '<div class="big">' + esc(s.en) + '</div>', cls: 'hanchoice wide', explain: han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en), item: s }, s, wr, o => han(o.zh, 'md'));
  };
  const FUNC = ['吗', '呢', '吧', '的', '都', '也', '很', '不', '没', '了', '在', '是', '有', '和', '太', '还', '就', '才'];
  function blankPick() {
    const s = one(allSents().filter(s => CH.hanOnly(s.zh).length >= 3));
    if (!s) return null;
    const words = allWords();
    const cands = uniqBy(words.filter(w => w.han && s.zh.indexOf(w.han) >= 0 && !/[a-zA-Z]/.test(w.han)), w => w.han).sort((a, b) => b.han.length - a.han.length);
    const funcs = cands.filter(w => FUNC.indexOf(w.han) >= 0);
    const target = (funcs.length && Math.random() < 0.55) ? pick(funcs) : (cands.length ? pick(cands.slice(0, 4)) : null);
    return target ? { s, words, target, blanked: s.zh.replace(target.han, '＿＿') } : null;
  }
  G.blankType = () => {
    const b = blankPick();
    if (!b) return null;
    return { id: 'bt:' + b.s.id + ':' + b.target.han, drill: 'blankType', title: 'Type the missing word', prompt: '<div class="big">' + han(b.blanked, 'lg') + '</div><div class="hint">' + esc(b.s.en) + '</div>', speak: null, type: 'input', inputKind: 'han', placeholder: '汉字', tiles: tilesFor(Array.from(b.target.han), 4), check: v => CH.hanOnly(v) === b.target.han, answerHtml: han(b.target.han, 'lg'), explain: sentBase(b.s), item: b.s };
  };
  G.blank = () => {
    const b = blankPick();
    if (!b) return null;
    const { s, words, target, blanked } = b;
    const pos = target.pos;
    let wr = distract(target.han, words, x => x.han, 3, x => FUNC.indexOf(target.han) >= 0 ? FUNC.indexOf(x.han) >= 0 : (x.pos === pos && x.han.length === target.han.length));
    if (wr.length < 3) wr = wr.concat(distract(target.han, words.filter(x => wr.indexOf(x) < 0), x => x.han, 3 - wr.length));
    if (wr.length < 2) return null;
    return mc({ id: 'bl:' + s.id + ':' + target.han, drill: 'blank', title: 'Fill in the blank', prompt: '<div class="big">' + han(blanked, 'lg') + '</div><div class="hint">' + esc(s.en) + '</div>', speak: null, cls: 'hanchoice', explain: han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en), item: s }, target, wr, o => han(o.han, 'lg'));
  };
  G.reply = () => {
    /* pick a question line followed by an answer line in the same dialogue */
    const ds = DB.dialogs.filter(d => d.lesson <= CH.scope.to);
    const pairs = [];
    ds.forEach(d => d.lines.forEach((l, i) => {
      if (i < d.lines.length - 1 && /[？?]/.test(l.zh) && d.lines[i + 1].zh && !/[？?]/.test(d.lines[i + 1].zh)) pairs.push({ id: 'rp:' + d.id + ':' + i, lesson: d.lesson, q: l, a: d.lines[i + 1] });
    }));
    const p = one(pairs);
    if (!p) return null;
    const answers = uniqBy(pairs.filter(x => x.a.zh !== p.a.zh), x => x.a.zh);
    const wr = sample(answers, 3).map(x => x.a);
    if (wr.length < 2) return null;
    return mc({ id: p.id, drill: 'reply', title: 'Choose the best reply', prompt: '<div class="bubble">' + (p.q.sp ? '<small>' + esc(p.q.sp) + '</small>' : '') + han(p.q.zh, 'lg') + (settings().showPy ? '<div class="py">' + esc(p.q.py) + '</div>' : '') + '</div>', speak: p.q.zh, cls: 'hanchoice wide', explain: han(p.q.zh) + ' → ' + han(p.a.zh) + '<br>' + py(p.a.py) + '<br>' + esc(p.a.en || ''), item: p }, p.a, wr, o => han(o.zh, 'md'));
  };
  G.order = () => {
    const s = one(allSents(), x => { const n = CH.hanOnly(x.zh).length; return n >= 3 && n <= 14; });
    if (!s) return null;
    const toks = segment(s.zh);
    if (toks.length < 3 || toks.length > 9) return null;
    return { id: 'or:' + s.id, drill: 'order', title: 'Put the words in order', prompt: '<div class="big">' + esc(s.en) + '</div>', speak: null, type: 'order', tiles: shuffle(toks), answer: toks, answerText: CH.hanOnly(s.zh), explain: han(s.zh) + '<br>' + py(s.py) + '<br>' + esc(s.en), item: s };
  };

  /* ===================== QUIZ FORMAT (mirrors the CHINA 101 paper quiz) ===================== */
  /* I. hear a syllable, circle its initial or its toneless spelling */
  const validSyls = () => {
    const set = new Set(DB.known);
    DB.nums.filter(n => n <= CH.scope.to).forEach(n => ((DB.lessons[n].pron || {}).drills || []).forEach(d =>
      CH.pyTokens(d.py).forEach(t => { const b = CH.stripTone(t); if (/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[aeiouü]+(n|ng|r)?$/.test(b)) set.add(b); })));
    return set;
  };
  const nearOf = (groups, x) => { const out = []; groups.forEach(g => { if (g.indexOf(x) >= 0) g.forEach(y => { if (y !== x && out.indexOf(y) < 0) out.push(y); }); }); return out; };
  G.examSound = () => {
    const s = one(DB.syls, x => x.tone < 5 && x.init && CH.isHan(x.ch));
    if (!s) return null;
    /* Quiz 2 asked all three ways: the initial (zh ch sh r), the final (ang eng ong an) or the whole toneless syllable */
    const roll = Math.random(), byInit = roll < 0.3, byFin = !byInit && roll < 0.6;
    let correct, wr;
    if (byInit) {
      correct = s.init;
      wr = shuffle(nearOf(CH.CONFUSABLE, correct)).slice(0, 2);
      wr = wr.concat(shuffle(INITS.filter(x => x !== correct && wr.indexOf(x) < 0))).slice(0, 3);
    } else if (byFin) {
      correct = s.fin;
      const fins = uniqBy(DB.syls.filter(x => x.lesson <= CH.scope.to && x.init && x.fin !== correct), x => x.fin).map(x => x.fin);
      wr = uniqBy(shuffle(nearOf(CH.CONF_FIN, correct)).concat(shuffle(fins)), x => x).filter(f => f !== correct).slice(0, 3);
    } else {
      correct = s.base;
      const valid = validSyls();
      const near = nearOf(CH.CONFUSABLE, s.init).map(i => i + s.fin).concat(nearOf(CH.CONF_FIN, s.fin).map(f => s.init + f)).filter(b => valid.has(b));
      const same = Array.from(valid).filter(b => b !== correct && (CH.splitSyl(b).init === s.init || CH.splitSyl(b).fin === s.fin));
      wr = uniqBy(shuffle(near).concat(shuffle(same)).concat(shuffle(Array.from(valid))).filter(b => b !== correct), x => x).slice(0, 3);
    }
    if (wr.length < 3) return null;
    return mc({
      id: 'es:' + (byInit ? 'i:' : byFin ? 'f:' : 's:') + s.id, drill: 'examSound', title: 'Circle the right pinyin according to what you hear',
      prompt: '<div class="hint">Tap 🔊 and listen. ' + (byInit ? 'Which <b>initial</b> does it start with?' : byFin ? 'Which <b>final</b> does it end with? (-n vs -ng, a vs e vs o)' : 'Which syllable is it? (tones are not marked)') + '</div>',
      speak: s.ch, cls: 'letters', explain: han(s.ch) + ' ' + py(s.py) + '<br><small>initial <b>' + esc(s.init) + '</b> + final <b>' + esc(s.fin) + '</b></small>', item: s
    }, { v: correct }, wr.map(v => ({ v })), o => '<span class="py xl">' + esc(o.v) + '</span>');
  };
  /* II. hear a syllable, circle the right tone mark (same spelling, four tones) */
  G.examTone = () => {
    const s = one(DB.syls, x => x.tone < 5 && CH.isHan(x.ch));
    if (!s) return null;
    return {
      id: 'et:' + s.id, drill: 'examTone', title: 'Circle the pinyin with correct tone marks according to what you hear',
      prompt: '<div class="hint">Tap 🔊 and listen for the tone.</div>', speak: s.ch, type: 'mc', cls: 'letters',
      choices: [1, 2, 3, 4].map(t => ({ html: '<span class="py xl">' + esc(CH.applyTone(s.base, t)) + '</span>', ok: t === s.tone })),
      explain: han(s.ch) + ' ' + py(s.py) + ' — ' + ORD[s.tone - 1] + ' tone', item: s
    };
  };
  /* III. dictation of a short sentence */
  G.examDict = () => {
    const s = shortSent(9);
    if (!s) return null;
    return { id: 'ed:' + s.id, drill: 'examDict', title: 'Write down pinyin with tone marks according to what you hear', prompt: '<div class="hint">Listen (as many times as you like), then type the whole sentence in pinyin with tone marks.</div>', speak: s.zh, type: 'input', inputKind: 'py', placeholder: 'e.g. nǐ hǎo ma', check: v => CH.samePy(v, s.py, settings().strict), answerHtml: py(s.py), explain: sentBase(s), item: s };
  };
  /* IV. read a dialogue, translate one line into English */
  const usable = l => l.en && !/exercise|\.\.\.|…|_/.test(l.en + l.zh);
  G.examToEn = () => {
    const ds = DB.dialogs.filter(d => d.lines.length <= 6);
    const lines = [];
    ds.forEach(d => d.lines.forEach((l, i) => { if (usable(l) && CH.hanOnly(l.zh).length <= 12) lines.push({ id: 'ete:' + d.id + ':' + i, lesson: d.lesson, d, i, l }); }));
    const p = one(lines);
    if (!p) return null;
    const others = p.d.lines.filter((l, i) => i !== p.i && usable(l) && l.en !== p.l.en);
    let wr = uniqBy(shuffle(others).slice(0, 1).concat(distract(p.l.en, allSents().filter(usable), x => x.en, 4)), x => x.en).filter(x => x.en !== p.l.en).slice(0, 3);
    if (wr.length < 2) return null;
    const dlg = '<div class="card" style="text-align:left">' + p.d.lines.map((l, i) => '<div style="margin:4px 0;' + (i === p.i ? '' : 'opacity:.5') + '">' + (l.sp ? '<small>' + esc(l.sp) + '：</small>' : '') + (i === p.i ? '<b>▶ </b>' : '') + han(l.zh, i === p.i ? 'lg' : '') + '</div>').join('') + '</div>';
    return mc({ id: p.id, drill: 'examToEn', title: 'Translate the dialogue into English', prompt: dlg + '<div class="hint">What does the ▶ line mean?</div>', speak: p.l.zh, explain: han(p.l.zh) + '<br>' + py(p.l.py) + '<br>' + esc(p.l.en), item: p },
      p.l, wr, o => esc(o.en));
  };
  /* V. English → Chinese, written in characters OR pinyin with tone marks */
  G.examToZh = () => {
    const s = one(allSents(), x => x.py && usable(x) && CH.hanOnly(x.zh).length >= 2 && CH.hanOnly(x.zh).length <= 10);
    if (!s) return null;
    const target = CH.hanOnly(s.zh);
    return {
      id: 'etz:' + s.id, drill: 'examToZh', title: 'Translate into Chinese (characters or pinyin with tone marks)', prompt: '<div class="big">' + esc(s.en) + '</div><div class="hint">Write either Chinese characters or pinyin with proper tone marks.</div>',
      speak: null, type: 'input', inputKind: 'py', placeholder: '汉字 or pinyin', tiles: tilesFor(Array.from(target), 4),
      check: v => /[一-鿿]/.test(v) ? CH.hanOnly(v) === target : CH.samePy(v, s.py, settings().strict), answerHtml: han(target, 'lg') + '<br>' + py(s.py), explain: sentBase(s), item: s
    };
  };
  /* VI. single character → type its English meaning */
  const normEn = s => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\b(to|a|an|the|in|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
  function meaningOk(input, en) {
    const v = normEn(input);
    if (!v) return false;
    const acc = String(en).split(/[;,/]|\bor\b/).map(x => normEn(x.replace(/\([^)]*\)/g, '').trim() ? x.replace(/\([^)]*\)/g, '') : x)).filter(Boolean);
    const has = (a, b) => (' ' + a + ' ').indexOf(' ' + b + ' ') >= 0;
    const vw = v.split(' ').filter(w => w.length >= 3 && ['particle', 'used', 'for', 'and', 'with'].indexOf(w) < 0);
    return acc.some(a => a === v || has(v, a) || (v.length >= 3 && has(a, v)) || vw.some(w => has(a, w)));
  }
  CH.meaningOk = meaningOk;
  G.examMeaning = () => {
    const c = one(DB.chars, x => CH.isHan(x.zh) && x.en && x.en[0] !== '(' && !/name|surname$/.test(x.en));
    if (!c) return null;
    return { id: 'em:' + c.id, drill: 'examMeaning', title: 'Tell the English meaning', prompt: '<div class="big">' + han(c.zh, 'xxl') + '</div>', speak: null, type: 'input', inputKind: 'en', placeholder: 'English meaning', check: v => meaningOk(v, c.en), answerHtml: esc(c.en), explain: han(c.zh) + ' ' + py(c.py) + ' — ' + esc(c.en) + (c.note ? '<br><small>' + esc(c.note) + '</small>' : ''), item: c };
  };

  /* ===================== QUIZ 2 FORMAT: two-part answers (pinyin AND English) ===================== */
  const FAMILY = [['奶奶', '奶奶 nǎinai = father\'s mother (paternal grandma)'], ['外婆', '外婆 wàipó = mother\'s mother (maternal grandma)'], ['爸爸妈妈', '爸爸妈妈 = parents (dad and mom)']];
  const notesFor = zh => { const n = FAMILY.filter(f => zh.indexOf(f[0]) >= 0).map(f => f[1]); if (/[他她]/.test(zh)) n.push('他 = he / his, 她 = she / her, 你 = you / your'); return n.length ? '<br><small>' + n.map(esc).join('<br>') + '</small>' : ''; };
  const pyField = s => ({ label: 'Pinyin with tone marks', kind: 'py', placeholder: 'e.g. Nǐ hǎo ma?', check: v => ({ ok: CH.samePy(v, s.py, settings().strict), note: CH.pyDiff(v, s.py) }), answerHtml: py(s.py) });
  const enField = (s, heard) => ({ label: 'English', kind: 'en', placeholder: 'English translation', loose: true, check: v => { const r = CH.enCheck(v, s.en, { zh: s.zh, heard }); return { ok: r.ok, note: r.notes.join('<br>') }; }, answerHtml: esc(s.en) });
  const q2Sent = max => one(allSents(), x => x.py && usable(x) && CH.hanOnly(x.zh).length >= 3 && CH.hanOnly(x.zh).length <= max && !/[A-Za-z]/.test(x.zh));
  /* III. hear a sentence: write it in pinyin AND translate it */
  G.examDictEn = () => {
    const s = q2Sent(16);
    if (!s) return null;
    return { id: 'ede:' + s.id, drill: 'examDictEn', title: 'Write down the sentence in pinyin and translate into English', prompt: '<div class="hint">Listen as many times as you like. <b>Both parts</b> are marked: pinyin with tone marks, then English.</div>', speak: s.zh, type: 'multi', fields: [pyField(s), enField(s, true)], explain: sentBase(s) + notesFor(s.zh), item: s };
  };
  /* V. read characters: put the pinyin "above" them AND translate */
  G.examPyEn = () => {
    const s = q2Sent(14);
    if (!s) return null;
    return { id: 'epe:' + s.id, drill: 'examPyEn', title: 'Put pinyin above the characters and translate into English', prompt: '<div class="big">' + han(s.zh, 'lg') + '</div><div class="hint">Two answers: the <b>pinyin</b> and the <b>English</b>. (On Quiz 2 the English alone lost half of this section.)</div>', speak: null, type: 'multi', fields: [pyField(s), enField(s, false)], explain: sentBase(s) + notesFor(s.zh), item: s };
  };
  /* the exact traps from Quiz 2: 不 tone change, he / she / you, 奶奶 vs 外婆, neutral tones, -ng finals, word order of 都 / 也 */
  const TRAPS = [
    { lesson: 2, zh: '不是', q: 'Pinyin for 不是 (is not)', a: 'bú shì', w: ['bù shì', 'bū shì', 'bǔ shì'], why: '不 is 4th tone (bù), but before another 4th tone it changes to <b>bú</b>: bú shì, bú yào. Quiz 2 counted bù shì wrong.' },
    { lesson: 2, zh: '不要', q: 'Pinyin for 不要 (don\'t want)', a: 'bú yào', w: ['bù yào', 'bú yāo', 'bǔ yào'], why: 'yào is 4th tone, so 不 becomes <b>bú</b>.' },
    { lesson: 2, zh: '不忙', q: 'Pinyin for 不忙 (not busy)', a: 'bù máng', w: ['bú máng', 'bù mǎng', 'bú mán'], why: 'máng is 2nd tone, so 不 stays <b>bù</b>. It only changes before a 4th tone.' },
    { lesson: 2, zh: '不喝', q: 'Pinyin for 不喝 (don\'t drink)', a: 'bù hē', w: ['bú hē', 'bù hé', 'bú hè'], why: 'hē is 1st tone, so 不 stays <b>bù</b>.' },
    { lesson: 2, zh: '爸爸', q: 'Pinyin for 爸爸 (dad)', a: 'bàba', w: ['bàbà', 'bābà', 'bába'], why: 'The second syllable is <b>neutral</b>: no tone mark. Same pattern: māma, gēge, dìdi, nǎinai.' },
    { lesson: 3, zh: '奶奶', q: 'Pinyin for 奶奶 (paternal grandma)', a: 'nǎinai', w: ['nǎinǎi', 'nàinai', 'nǎinài'], why: 'nǎi + neutral <b>nai</b>, with no mark on the second syllable.' },
    { lesson: 3, zh: '外语', q: 'Pinyin for 外语 (foreign language)', a: 'wàiyǔ', w: ['wàiyú', 'wàiyù', 'wāiyǔ'], why: 'wài (4th) + yǔ (3rd). 语 is the same yǔ as in 汉语 Hànyǔ.' },
    { lesson: 3, zh: '医生', q: 'Pinyin for 医生 (doctor)', a: 'yīshēng', w: ['yīshéng', 'yíshēng', 'yīsēng'], why: 'Both syllables are 1st tone; 生 starts with <b>sh</b> (shēng).' },
    { lesson: 3, zh: '他奶奶是中国人吗？', q: '他奶奶是中国人吗？', a: 'Is his grandmother (father\'s mother) Chinese?', w: ['Is your grandmother Chinese?', 'Is her grandmother Chinese?', 'His grandmother is not Chinese.'], cls: 'wide', why: '<b>他 = he / his</b>. On Quiz 2 "Your grandma" lost marks: 你 would be "your". 吗 makes it a yes/no question.' },
    { lesson: 3, zh: '她妈妈是哪国人？', q: '她妈妈是哪国人？', a: 'Which country is her mom from?', w: ['Which country is your mom from?', 'Which country is his mom from?', 'Her mom is Chinese.'], cls: 'wide', why: '<b>她 = she / her</b> (女 on the left side means female). 哪国人 = from which country.' },
    { lesson: 3, zh: '你男朋友是医生吗？', q: '你男朋友是医生吗？', a: 'Is your boyfriend a doctor?', w: ['Is your girlfriend a doctor?', 'Is his boyfriend a doctor?', 'Your boyfriend is not a doctor.'], cls: 'wide', why: '男 = male, 男朋友 = boyfriend; 女朋友 = girlfriend. 你 = your.' },
    { lesson: 3, zh: '奶奶外婆', q: 'Who is your 奶奶?', a: 'your father\'s mother', w: ['your mother\'s mother', 'your mother', 'your aunt'], why: '奶奶 nǎinai = <b>paternal</b> grandma (father\'s side); 外婆 wàipó = <b>maternal</b> grandma (外 = outside: mother\'s side).' },
    { lesson: 3, zh: '外婆', q: 'Who is your 外婆?', a: 'your mother\'s mother', w: ['your father\'s mother', 'your older sister', 'your teacher'], why: '外婆 wàipó = <b>maternal</b> grandma; 奶奶 = paternal grandma.' },
    { lesson: 3, zh: '我爸爸妈妈都是外语老师。', q: 'My parents are both foreign language teachers.', a: '我爸爸妈妈都是外语老师。', w: ['我爸爸妈妈是都外语老师。', '我都爸爸妈妈是外语老师。', '我爸爸妈妈也是外语老师。'], han: true, why: '<b>都</b> (both / all) goes after the people and <b>before</b> the verb 是.' },
    { lesson: 3, zh: '他女朋友是医生，不是老师。', q: 'His girlfriend is a doctor, not a teacher.', a: '他女朋友是医生，不是老师。', w: ['她女朋友是医生，不是老师。', '他男朋友是医生，不是老师。', '他女朋友不是医生，是老师。'], han: true, why: '<b>他</b> = his (male). 不是 is said <b>bú shì</b>.' },
    { lesson: 3, zh: '她外婆是中国人，我奶奶也是。', q: 'Her maternal grandma is Chinese, and so is my paternal grandma.', a: '她外婆是中国人，我奶奶也是。', w: ['他外婆是中国人，我奶奶也是。', '她奶奶是中国人，我外婆也是。', '她外婆是中国人，我奶奶都是。'], han: true, why: '她 = her, 外婆 = maternal, 奶奶 = paternal. <b>也</b> (also) for "so is mine"; 都 needs a plural subject.' },
    { lesson: 3, zh: '中', q: 'Which final do you hear?', a: 'ong', w: ['ang', 'eng', 'an'], speak: '中', why: '中 zhōng: <b>-ong</b> (lips rounded). Quiz 2 lost a point on ang / eng / ong / an.' },
    { lesson: 3, zh: '生', q: 'Which final do you hear?', a: 'eng', w: ['ang', 'ong', 'en'], speak: '生', why: '生 shēng: <b>-eng</b> (relaxed mouth). Compare 中 zhōng (-ong) and 忙 máng (-ang).' },
    { lesson: 2, zh: '忙', q: 'Which final do you hear?', a: 'ang', w: ['eng', 'ong', 'an'], speak: '忙', why: '忙 máng: <b>-ang</b> (open mouth, back -ng). Compare 生 shēng (-eng) and 中 zhōng (-ong).' },
    { lesson: 2, zh: '朋', q: 'Which final do you hear?', a: 'eng', w: ['ang', 'ong', 'en'], speak: '朋', why: '朋 péng: <b>-eng</b>, ending in a back -ng (not -n).' }
  ].map((t, k) => Object.assign({ id: 'trap:' + k }, t));
  G.examTraps = () => {
    const t = one(TRAPS);
    if (!t) return null;
    const isPy = !t.han && !t.cls && !t.speak && /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü ]+$/.test(t.a);
    const fmt = v => t.han ? han(v, 'md') : isPy || t.speak ? '<span class="py xl">' + esc(v) + '</span>' : esc(v);
    return mc({
      id: t.id, drill: 'examTraps', title: t.speak ? 'Listen: which final?' : 'Quiz 2 trap', prompt: t.speak ? '<div class="hint">Tap 🔊 and listen for the ending.</div>' : '<div class="big">' + (/[一-鿿]/.test(t.q) && !t.han ? han(t.q, 'lg') : esc(t.q)) + '</div>' + (t.han ? '<div class="hint">Which Chinese is correct?</div>' : ''),
      speak: t.speak || null, cls: t.han ? 'hanchoice wide' : t.cls === 'wide' ? '' : 'letters', explain: (t.speak ? han(t.zh) + ' ' : '') + '<b>' + esc(t.a) + '</b><br><small>' + t.why + '</small>', item: t
    }, { v: t.a }, t.w.map(v => ({ v })), o => fmt(o.v));
  };

  /* ===================== catalogue ===================== */
  /* Sections: a drill may appear in more than one (e.g. tone listening is both Pinyin and Listening) */
  CH.drills = [
    {
      id: 'exam', name: 'Quiz format', icon: '📝', desc: 'Question types from the real CHINA 101 quizzes 1 and 2', items: [
        { id: 'examSound', name: 'I. Circle the right pinyin (listening)', gen: 'examSound', audio: true },
        { id: 'examTone', name: 'II. Circle the correct tone marks (listening)', gen: 'examTone', audio: true },
        { id: 'examDict', name: 'III. Write pinyin with tone marks (dictation)', gen: 'examDict', audio: true },
        { id: 'examToEn', name: 'IV. Translate the dialogue into English', gen: 'examToEn' },
        { id: 'examToZh', name: 'V. Translate into Chinese (characters or pinyin)', gen: 'examToZh' },
        { id: 'examMeaning', name: 'VI. English meanings of characters', gen: 'examMeaning' },
        { id: 'examDictEn', name: 'Quiz 2 III. Listen: write pinyin AND translate', gen: 'examDictEn', audio: true },
        { id: 'examPyEn', name: 'Quiz 2 V. Characters: write pinyin AND translate', gen: 'examPyEn' },
        { id: 'examTraps', name: 'Quiz 2 traps: 不 bú, 他/她/你, 奶奶/外婆, -ng finals', gen: 'examTraps' }
      ]
    },
    {
      id: 'pron', name: 'Pinyin & Tones', icon: '🔔', desc: 'Tones, initials & finals, tone marks, spelling, tone changes', items: [
        { id: 'toneOfSyl', name: 'Which tone is this syllable?', gen: 'toneOfSyl' },
        { id: 'toneListen', name: 'Listen: identify the tones', gen: 'toneListen', audio: true },
        { id: 'soundListen', name: 'Listen: pick the pinyin', gen: 'soundListen', audio: true },
        { id: 'toneRecall', name: 'Tones of a word (from memory)', gen: 'toneRecall' },
        { id: 'initialQ', name: 'Identify the initial', gen: 'initialQ' },
        { id: 'finalQ', name: 'Identify the final', gen: 'finalQ' },
        { id: 'han2py', name: 'Character → pinyin', gen: 'han2py' },
        { id: 'char2py', name: 'Single character → pinyin', gen: 'char2py' },
        { id: 'toneMark', name: 'Add the tone marks', gen: 'toneMark' },
        { id: 'numToMark', name: 'Tone numbers → tone marks (ni3 → nǐ)', gen: 'numToMark' },
        { id: 'placement', name: 'Where does the tone mark go?', gen: 'placement' },
        { id: 'spellRule', name: 'Spelling rules (yi, wu, yu, -ui, -un…)', gen: 'spellRule' },
        { id: 'sandhi', name: 'Tone changes: 3rd tone, 不, 一', gen: 'sandhi' },
        { id: 'typePy', name: 'Characters → type pinyin', gen: 'typePy' },
        { id: 'han2pySent', name: 'Sentence → choose the pinyin', gen: 'han2pySent' },
        { id: 'hanToPy', name: 'Sentence → write the pinyin', gen: 'hanToPy' }
      ]
    },
    {
      id: 'read', name: 'Reading', icon: '📖', desc: 'Recognise characters and read words and sentences', items: [
        { id: 'han2en', name: 'Character → meaning', gen: 'han2en' },
        { id: 'en2han', name: 'Meaning → character', gen: 'en2han' },
        { id: 'py2han', name: 'Pinyin → character', gen: 'py2han' },
        { id: 'han2py', name: 'Character → pinyin', gen: 'han2py' },
        { id: 'char2py', name: 'Single character → pinyin', gen: 'char2py' },
        { id: 'py2char', name: 'Pinyin → single character', gen: 'py2char' },
        { id: 'readEn', name: 'Read a sentence → English meaning', gen: 'readEn' },
        { id: 'py2enSent', name: 'Read the pinyin → English meaning', gen: 'py2enSent' },
        { id: 'py2zhSent', name: 'Pinyin sentence → characters', gen: 'py2zhSent' },
        { id: 'han2pySent', name: 'Sentence → choose the pinyin', gen: 'han2pySent' }
      ]
    },
    {
      id: 'write', name: 'Writing', icon: '✍️', desc: 'Type pinyin and characters, handwriting & stroke order', items: [
        { id: 'typeHan', name: 'English → write characters', gen: 'typeHan' },
        { id: 'charFromPy', name: 'Pinyin → write one character', gen: 'charFromPy' },
        { id: 'blankType', name: 'Type the missing word', gen: 'blankType' },
        { id: 'writeSent', name: 'English → write the sentence', gen: 'writeSent' },
        { id: 'typePy', name: 'Characters → type pinyin', gen: 'typePy' },
        { id: 'charTypePy', name: 'Single character → type pinyin', gen: 'charTypePy' },
        { id: 'sentPy', name: 'English → pinyin (sentences)', gen: 'sentPy' },
        { id: 'hanToPy', name: 'Sentence → write the pinyin', gen: 'hanToPy' },
        { id: 'writeEn', name: 'Handwrite characters from English', route: '#/write' },
        { id: 'hand', name: 'Handwriting canvas', route: '#/hand' },
        { id: 'strokes', name: 'Stroke-order practice', route: '#/strokes' }
      ]
    },
    {
      id: 'listen', name: 'Listening & Dictation', icon: '🎧', desc: 'Hear it, then pick or write what you heard', items: [
        { id: 'toneListen', name: 'Listen: identify the tones', gen: 'toneListen', audio: true },
        { id: 'soundListen', name: 'Listen: pick the pinyin', gen: 'soundListen', audio: true },
        { id: 'listen2han', name: 'Listen → character', gen: 'listen2han', audio: true },
        { id: 'listen2en', name: 'Listen → meaning', gen: 'listen2en', audio: true },
        { id: 'listenEn', name: 'Listen → English meaning (sentence)', gen: 'listenEn', audio: true },
        { id: 'dictPy', name: 'Dictation: write pinyin', gen: 'dictPy', audio: true },
        { id: 'dictHan', name: 'Dictation: write characters', gen: 'dictHan', audio: true },
        { id: 'dictSentPy', name: 'Dictation: sentence in pinyin', gen: 'dictSentPy', audio: true },
        { id: 'dictSentHan', name: 'Dictation: sentence in characters', gen: 'dictSentHan', audio: true }
      ]
    },
    {
      id: 'sent', name: 'Sentences & Grammar', icon: '💬', desc: 'Word order, fill-in-the-blank, replies, translation', items: [
        { id: 'enToZh', name: 'English → Chinese sentence', gen: 'enToZh' },
        { id: 'blank', name: 'Fill in the blank (吗 / 呢 / words)', gen: 'blank' },
        { id: 'order', name: 'Build the sentence (word order)', gen: 'order' },
        { id: 'reply', name: 'Choose the best reply', gen: 'reply' },
        { id: 'readEn', name: 'Read → English meaning', gen: 'readEn' }
      ]
    }
  ];
  CH.genIndex = {};
  CH.drills.forEach(c => c.items.forEach(i => { if (i.gen) CH.genIndex[i.id] = Object.assign({ cat: c.id }, i); }));

  /* mixed "mock quiz" recipe */
  CH.MOCK = ['toneListen', 'toneMark', 'sandhi', 'han2py', 'han2en', 'en2han', 'listen2han', 'typePy', 'typeHan', 'dictPy', 'listenEn', 'readEn', 'blank', 'order', 'reply', 'sentPy', 'soundListen', 'placement', 'toneOfSyl', 'initialQ', 'finalQ', 'han2pySent', 'py2enSent', 'charFromPy', 'blankType', 'dictSentPy', 'spellRule', 'examTraps', 'examPyEn', 'examDictEn'];

  /* mock test laid out like the paper quiz: sections in order, same question counts */
  CH.EXAMS = {
    q1: [['I', 'examSound', 10], ['II', 'examTone', 10], ['III', 'examDict', 4], ['IV', 'examToEn', 4], ['V', 'examToZh', 4], ['VI', 'examMeaning', 20]],
    /* Quiz 2: I/II listening (10 each), III dictation + English (2), IV English to Chinese (2), V pinyin + English for characters (4) */
    q2: [['I', 'examSound', 10], ['II', 'examTone', 10], ['III', 'examDictEn', 2], ['IV', 'examToZh', 2], ['V', 'examPyEn', 4]]
  };
  CH.makeExam = function (fmt) {
    const out = [];
    (CH.EXAMS[fmt] || CH.EXAMS.q2).forEach(([num, gid, n]) => CH.makeQuiz([gid], n).forEach(q => { q.title = num + '. ' + q.title; out.push(q); }));
    return out;
  };

  /* ---------- full review: every item in the focus lessons once, asked a different way each time ---------- */
  /* ways to ask each kind of item, in order of preference (quiz-paper styles first) */
  const WAYS = {
    zi: ['examMeaning', 'examTone', 'examSound', 'char2py', 'py2char', 'charTypePy', 'charFromPy', 'toneOfSyl', 'han2en', 'en2han', 'listen2han', 'listen2en', 'typeHan', 'dictHan', 'initialQ', 'finalQ', 'dictPy', 'typePy'],
    ci: ['han2en', 'toneListen', 'typePy', 'en2han', 'dictPy', 'listen2han', 'typeHan', 'han2py', 'py2han', 'listen2en', 'toneMark', 'dictHan', 'toneRecall', 'numToMark'],
    ju: ['examPyEn', 'examDictEn', 'examDict', 'examToEn', 'examToZh', 'readEn', 'listenEn', 'enToZh', 'han2pySent', 'py2enSent', 'py2zhSent', 'writeSent', 'sentPy', 'hanToPy', 'dictSentPy', 'dictSentHan', 'order', 'blank', 'blankType', 'reply']
  };
  /* section order of the finished quiz, roughly following the paper: listening, tones, dictation, translation, writing, meanings */
  const ORDER = ['examSound', 'examTone', 'toneOfSyl', 'initialQ', 'finalQ', 'toneListen', 'toneRecall', 'toneMark', 'numToMark', 'examDict', 'dictPy', 'dictHan', 'dictSentPy', 'dictSentHan', 'examDictEn',
    'listen2han', 'listen2en', 'listenEn', 'examToEn', 'examPyEn', 'readEn', 'py2enSent', 'han2en', 'examToZh', 'enToZh', 'writeSent', 'sentPy', 'typeHan', 'typePy', 'charFromPy', 'charTypePy',
    'han2py', 'char2py', 'py2char', 'py2han', 'en2han', 'han2pySent', 'hanToPy', 'py2zhSent', 'order', 'blank', 'blankType', 'reply', 'examMeaning'];
  CH.coverageUnits = function () {
    const inFocus = x => x.lesson >= CH.scope.from && x.lesson <= CH.scope.to;
    const seen = new Set(), out = [];
    const add = (kind, key, lesson) => { if (!key || seen.has(kind + key)) return; seen.add(kind + key); out.push({ id: kind + ':' + key, kind, key, lesson }); };
    DB.words.filter(inFocus).forEach(w => add(Array.from(w.han).length === 1 ? 'zi' : 'ci', w.han, w.lesson));
    DB.chars.filter(inFocus).forEach(c => { if (CH.isHan(c.zh)) add('zi', c.zh, c.lesson); });
    DB.sents.filter(inFocus).filter(usable).forEach(s => add('ju', CH.hanOnly(s.zh), s.lesson));
    return out;
  };
  /* per item: how many times each way has been answered */
  CH.cover = {
    data: CH.store.get('cover', {}),
    mark(unit, way) { const u = this.data[unit] = this.data[unit] || {}; u[way] = (u[way] || 0) + 1; CH.store.set('cover', this.data); },
    reset() { this.data = {}; CH.store.set('cover', this.data); }
  };
  const keyOf = x => CH.hanOnly(x.zh || x.ch || (x.l && x.l.zh) || (x.q && x.q.zh) || '');
  CH.makeCoverage = function () {
    const out = [];
    CH.coverageUnits().forEach(u => {
      const h = CH.cover.data[u.id] || {};
      /* least-used way first; ties broken at random so one quiz mixes question types */
      const ways = shuffle(WAYS[u.kind].map(g => ({ g, c: h[g] || 0 }))).sort((a, b) => a.c - b.c);
      for (const w of ways) {
        CH.want = x => keyOf(x) === u.key;
        let q = null;
        try { q = G[w.g](); } finally { CH.want = null; }
        if (q) { q.unit = u.id; q.way = w.g; out.push(q); break; }
      }
    });
    const rank = q => { const i = ORDER.indexOf(q.way); return i < 0 ? ORDER.length : i; };
    return shuffle(out).sort((a, b) => rank(a) - rank(b));
  };

  /* build a list of n questions from a set of generator ids */
  CH.makeQuiz = function (genIds, n) {
    const out = [], seen = new Set();
    let guard = 0, i = 0;
    while (out.length < n && guard++ < n * 25) {
      const gid = genIds[i++ % genIds.length];
      const g = G[gid];
      if (!g) continue;
      const q = g();
      if (!q || seen.has(q.id)) continue;
      seen.add(q.id); out.push(q);
    }
    /* a short lesson runs out of distinct items: top up with repeats (fresh choices), spaced apart */
    guard = 0;
    while (out.length < n && guard++ < n * 25) {
      const g = G[genIds[i++ % genIds.length]];
      const q = g && g();
      if (!q || out.slice(-5).some(x => x.id === q.id)) continue;
      out.push(q);
    }
    return out;
  };
})(window.CH);
