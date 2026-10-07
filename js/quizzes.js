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
  const one = (list, f) => { const r = CH.draw(list, 1, f); return r[0] || null; };

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
  G.blank = () => {
    const sents = allSents().filter(s => CH.hanOnly(s.zh).length >= 3);
    const s = one(sents);
    if (!s) return null;
    const words = allWords();
    const text = s.zh;
    const cands = uniqBy(words.filter(w => w.han && text.indexOf(w.han) >= 0 && !/[a-zA-Z]/.test(w.han)), w => w.han).sort((a, b) => b.han.length - a.han.length);
    const funcs = cands.filter(w => FUNC.indexOf(w.han) >= 0);
    const target = (funcs.length && Math.random() < 0.55) ? pick(funcs) : (cands.length ? pick(cands.slice(0, 4)) : null);
    if (!target) return null;
    const blanked = text.replace(target.han, '＿＿');
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

  /* ===================== catalogue ===================== */
  CH.drills = [
    {
      id: 'pron', name: 'Pinyin & Tones', icon: '🔔', desc: 'Tones, sound recognition, tone marks and tone changes', items: [
        { id: 'toneListen', name: 'Listen: identify the tones', gen: 'toneListen', audio: true },
        { id: 'soundListen', name: 'Listen: pick the pinyin', gen: 'soundListen', audio: true },
        { id: 'toneRecall', name: 'Tones of a word (from memory)', gen: 'toneRecall' },
        { id: 'toneMark', name: 'Add the tone marks', gen: 'toneMark' },
        { id: 'placement', name: 'Where does the tone mark go?', gen: 'placement' },
        { id: 'sandhi', name: 'Tone changes: 3rd tone, 不, 一', gen: 'sandhi' }
      ]
    },
    {
      id: 'chars', name: 'Character Recognition', icon: '字', desc: 'Read characters and match pinyin / meanings', items: [
        { id: 'han2py', name: 'Character → pinyin', gen: 'han2py' },
        { id: 'han2en', name: 'Character → meaning', gen: 'han2en' },
        { id: 'en2han', name: 'Meaning → character', gen: 'en2han' },
        { id: 'py2han', name: 'Pinyin → character', gen: 'py2han' },
        { id: 'listen2han', name: 'Listen → character', gen: 'listen2han', audio: true },
        { id: 'listen2en', name: 'Listen → meaning', gen: 'listen2en', audio: true },
        { id: 'char2py', name: 'Single character → pinyin', gen: 'char2py' },
        { id: 'py2char', name: 'Pinyin → single character', gen: 'py2char' }
      ]
    },
    {
      id: 'write', name: 'Writing', icon: '✍️', desc: 'Type pinyin and characters, dictation, handwriting & stroke order', items: [
        { id: 'typePy', name: 'Characters → type pinyin', gen: 'typePy' },
        { id: 'typeHan', name: 'English → write characters', gen: 'typeHan' },
        { id: 'dictPy', name: 'Dictation: write pinyin', gen: 'dictPy', audio: true },
        { id: 'dictHan', name: 'Dictation: write characters', gen: 'dictHan', audio: true },
        { id: 'sentPy', name: 'Translate → pinyin (sentences)', gen: 'sentPy' },
        { id: 'hanToPy', name: 'Sentence → write the pinyin', gen: 'hanToPy' },
        { id: 'writeEn', name: 'Handwrite characters from English', route: '#/write' },
        { id: 'hand', name: 'Handwriting canvas', route: '#/hand' },
        { id: 'strokes', name: 'Stroke-order practice', route: '#/strokes' }
      ]
    },
    {
      id: 'sent', name: 'Sentences & Dialogues', icon: '💬', desc: 'Comprehension, word order, replies and fill-in-the-blank', items: [
        { id: 'listenEn', name: 'Listen → English meaning', gen: 'listenEn', audio: true },
        { id: 'readEn', name: 'Read → English meaning', gen: 'readEn' },
        { id: 'enToZh', name: 'English → Chinese sentence', gen: 'enToZh' },
        { id: 'blank', name: 'Fill in the blank (吗 / 呢 / words)', gen: 'blank' },
        { id: 'order', name: 'Build the sentence (word order)', gen: 'order' },
        { id: 'reply', name: 'Choose the best reply', gen: 'reply' }
      ]
    }
  ];
  CH.genIndex = {};
  CH.drills.forEach(c => c.items.forEach(i => { if (i.gen) CH.genIndex[i.id] = Object.assign({ cat: c.id }, i); }));

  /* mixed "mock quiz" recipe */
  CH.MOCK = ['toneListen', 'toneMark', 'sandhi', 'han2py', 'han2en', 'en2han', 'listen2han', 'typePy', 'typeHan', 'dictPy', 'listenEn', 'readEn', 'blank', 'order', 'reply', 'sentPy', 'soundListen', 'placement'];

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
    return out;
  };
})(window.CH);
