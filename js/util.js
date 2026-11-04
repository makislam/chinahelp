/* Core helpers: pinyin/tone logic, speech (TTS), storage, random utilities */
window.CH = window.CH || {};
(function (CH) {
  'use strict';

  /* ---------- tiny helpers ---------- */
  CH.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  CH.$ = (sel, root) => (root || document).querySelector(sel);
  CH.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  CH.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  CH.pick = a => a[Math.floor(Math.random() * a.length)];
  CH.sample = (a, n) => CH.shuffle(a).slice(0, n);
  CH.uniqBy = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };
  /* weighted sample without replacement (Efraimidis-Spirakis) */
  CH.wsample = (items, weightFn, n) => items
    .map(it => ({ it, k: Math.pow(Math.random(), 1 / Math.max(0.0001, weightFn(it))) }))
    .sort((a, b) => b.k - a.k).slice(0, n).map(x => x.it);

  /* ---------- storage ---------- */
  CH.store = {
    get(k, d) { try { const v = localStorage.getItem('ch101:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ch101:' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ---------- pinyin / tones ---------- */
  const TONES = { a: ['ā', 'á', 'ǎ', 'à'], e: ['ē', 'é', 'ě', 'è'], i: ['ī', 'í', 'ǐ', 'ì'], o: ['ō', 'ó', 'ǒ', 'ò'], u: ['ū', 'ú', 'ǔ', 'ù'], 'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ'] };
  const MARKED = {};
  Object.keys(TONES).forEach(b => TONES[b].forEach((c, i) => { MARKED[c] = [b, i + 1]; }));
  CH.TONES = TONES;

  /* put tone mark on a toneless syllable (letters only, ü allowed) */
  CH.applyTone = function (syl, tone) {
    syl = syl.toLowerCase().replace(/v/g, 'ü');
    if (!tone || tone > 4) return syl;
    let idx = -1;
    const a = syl.indexOf('a'), e = syl.indexOf('e');
    if (a >= 0) idx = a;
    else if (e >= 0) idx = e;
    else if (syl.indexOf('ou') >= 0) idx = syl.indexOf('ou');
    else { for (let i = syl.length - 1; i >= 0; i--) if ('aeiouü'.indexOf(syl[i]) >= 0) { idx = i; break; } }
    if (idx < 0) return syl;
    return syl.slice(0, idx) + TONES[syl[idx]][tone - 1] + syl.slice(idx + 1);
  };
  /* "ni3 hao3" -> "nǐ hǎo" ; "lv4" -> "lǜ" */
  CH.numToMarks = s => String(s).replace(/([a-züvA-ZÜ]+)([0-5])/g, (m, syl, d) => CH.applyTone(syl, +d));
  CH.stripTone = s => String(s).toLowerCase().replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, c => MARKED[c][0]);
  CH.toneOf = function (syl) {
    for (const ch of String(syl).toLowerCase()) if (MARKED[ch]) return MARKED[ch][1];
    return 5;
  };
  /* split pinyin string into syllables/words (spaces) */
  CH.pyTokens = py => String(py || '').replace(/[,.?!;:，。？！、；：…"“”()（）]/g, ' ').trim().split(/\s+/).filter(Boolean);
  /* normalise for comparison */
  CH.normPy = function (s, strict) {
    let t = CH.numToMarks(String(s || '').toLowerCase());
    t = t.replace(/v/g, 'ü').replace(/[\s'’\-·,.?!;:，。？！、；：…"“”()（）]/g, '');
    if (strict === false) t = CH.stripTone(t);
    return t;
  };
  CH.samePy = (a, b, strict) => CH.normPy(a, strict) === CH.normPy(b, strict);

  /* initial / final split of toneless syllable */
  const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's'];
  CH.splitSyl = function (syl) {
    const base = CH.stripTone(syl);
    for (const i of INITIALS) if (base.startsWith(i) && base.length > i.length) return { init: i, fin: base.slice(i.length), base };
    return { init: '', fin: base, base };
  };
  CH.CONFUSABLE = [['b', 'p'], ['d', 't'], ['g', 'k'], ['j', 'q', 'x'], ['z', 'c', 's'], ['zh', 'ch', 'sh'], ['z', 'zh'], ['c', 'ch'], ['s', 'sh'], ['n', 'l'], ['l', 'r'], ['f', 'h'], ['m', 'n']];
  CH.CONF_FIN = [['an', 'ang'], ['en', 'eng'], ['in', 'ing'], ['ian', 'iang'], ['uan', 'uang'], ['ai', 'ei'], ['ao', 'ou'], ['u', 'ü'], ['o', 'e'], ['an', 'en'], ['ong', 'eng'], ['ang', 'eng', 'ong'], ['iao', 'iou', 'iu'], ['uai', 'ai'], ['ao', 'ai', 'an']];

  /* ---------- Chinese text ---------- */
  CH.isHan = c => /[一-鿿]/.test(c);
  CH.hanOnly = s => Array.from(String(s || '')).filter(CH.isHan).join('');
  CH.cleanZh = s => String(s || '').replace(/[（(][^）)]*[）)]/g, '').replace(/[…\.]{2,}/g, ' ').replace(/[A-Za-z0-9]+/g, ' ');

  /* ---------- explain what is wrong with a typed pinyin answer (html, '' if nothing specific) ---------- */
  const ORDN = ['1st', '2nd', '3rd', '4th', 'neutral (no mark)'];
  CH.pyDiff = function (user, ref) {
    if (!user || !ref || /[一-鿿]/.test(user)) return '';
    const refToks = CH.pyTokens(CH.numToMarks(ref)).map(t => CH.normPy(t, true)).filter(Boolean);
    const u = CH.normPy(user, true), r = refToks.join('');
    if (u === r) return '';
    if (CH.stripTone(u) !== CH.stripTone(r)) {
      const uToks = CH.pyTokens(CH.numToMarks(user)).map(t => CH.stripTone(CH.normPy(t, true)));
      const miss = Array.from(new Set(refToks.filter(t => uToks.indexOf(CH.stripTone(t)) < 0)));
      return '<div class="hint">' + (miss.length ? 'Spelling: check <b>' + CH.esc(miss.join(', ')) + '</b>' : 'The letters differ, not only the tones.') + '</div>';
    }
    /* letters match, so the strings line up: find each word whose tones differ */
    const notes = [];
    let pos = 0;
    refToks.forEach(t => {
      const ut = u.slice(pos, pos + t.length); pos += t.length;
      if (ut === t) return;
      let why;
      if (CH.stripTone(t) === 'bu') why = t === 'bú' ? '不 changes to <b>bú</b> before a 4th tone (bú shì, bú yào)' : '不 stays <b>bù</b> before 1st, 2nd and 3rd tones (bù hē, bù máng, bù hǎo)';
      else if (t === 'yí' || t === 'yì') why = '一 is <b>yí</b> before a 4th tone and <b>yì</b> before other tones';
      else {
        const tm = Array.from(t), um = Array.from(ut), bits = new Set();
        for (let i = 0; i < tm.length; i++) if (tm[i] !== um[i]) {
          const rt = CH.toneOf(tm[i]), yt = CH.toneOf(um[i]);
          bits.add(rt === 5 ? 'a syllable here is <b>neutral</b>: no tone mark (bàba, māma, nǎinai, péngyou)' : yt === 5 ? 'a tone mark is <b>missing</b>' : 'you wrote a ' + ORDN[yt - 1] + ' tone where it is ' + ORDN[rt - 1]);
        }
        why = Array.from(bits).join('; ');
      }
      notes.push('<b>' + CH.esc(t) + '</b> (you: ' + CH.esc(ut) + ')' + (why ? ': ' + why : ''));
    });
    return notes.length ? '<div class="hint" style="text-align:left">Tones to fix:<br>' + notes.join('<br>') + '</div>' : '';
  };

  /* ---------- loose check of an English translation ---------- */
  /* {ok, notes[]}: same people (my / your / his / her...), same negation, most of the content words */
  const CONTR = [[/n't\b/g, ' not'], [/'s\b/g, ' is'], [/'re\b/g, ' are'], [/'m\b/g, ' am']];
  const SYN = [['mom', 'mother', 'mum', 'mama', 'mommy'], ['dad', 'father', 'papa', 'daddy'], ['grandma', 'grandmother', 'granny', 'nana', 'grandmom'], ['older', 'elder', 'big'], ['younger', 'little'],
    ['also', 'too', 'well', 'so', 'either'], ['both', 'all'], ['doctor', 'physician', 'medic', 'dr'], ['country', 'nationality', 'nation', 'where'], ['chinese', 'china'],
    ['want', 'would', 'like'], ['drink', 'have'], ['very', 'really', 'quite'], ['fine', 'good', 'ok', 'great'], ['teacher', 'instructor', 'professor'],
    ['language', 'lang'], ['foreign', 'foriegn'], ['parent', 'parents'], ['boyfriend', 'bf'], ['girlfriend', 'gf'], ['maternal', 'mother side'], ['paternal', 'father side']];
  const STOP = new Set('a an the is are am be to of and or in on at it this that do does what which who how with from as for some any will one side'.split(' '));
  const PERS = { p1: ['i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours', 'myself'], p2: ['you', 'your', 'yours'], m: ['he', 'him', 'his'], f: ['she', 'her', 'hers'], pl: ['they', 'them', 'their', 'theirs'] };
  const PNAME = { p1: 'I / my / we', p2: 'you / your', m: 'he / his', f: 'she / her', pl: 'they / their' };
  const PZH = { p1: '我', p2: '你 / 您', m: '他', f: '她', pl: '他们' };
  const enWords = s => {
    let t = ' ' + String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[’`]/g, "'").replace(/\bgirl friend/g, 'girlfriend').replace(/\bboy friend/g, 'boyfriend').replace(/\bgrand (ma|mother)/g, 'grand$1') + ' ';
    CONTR.forEach(([a, b]) => { t = t.replace(a, b); });
    return t.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  };
  const canon = w => { if (w.length > 3 && /[^s]s$/.test(w)) w = w.slice(0, -1); for (const g of SYN) if (g.indexOf(w) >= 0) return g[0]; return w; };
  function personsZh(zh) {
    const z = String(zh || ''), p = new Set();
    if (/我/.test(z)) p.add('p1');
    if (/你|您/.test(z)) p.add('p2');
    if (/[他她]们/.test(z)) p.add('pl');
    if (/他(?!们)/.test(z)) p.add('m');
    if (/她(?!们)/.test(z)) p.add('f');
    return p;
  }
  const personsEn = words => { const p = new Set(); words.forEach(w => Object.keys(PERS).forEach(k => { if (PERS[k].indexOf(w) >= 0) p.add(k); })); return p; };
  /* opts.zh: the Chinese, which decides whose it is; opts.heard: only heard, so tā may be he or she */
  CH.enCheck = function (input, ref, opts) {
    opts = opts || {};
    const uw = enWords(input), rw = enWords(ref), notes = [];
    if (!uw.length) return { ok: false, notes: ['Write the English meaning.'] };
    /* required: people in both the Chinese and the model English; allowed: people in either (Chinese often drops 我) */
    const refP = personsEn(rw), zhP = opts.zh ? personsZh(opts.zh) : refP;
    const want = new Set(Array.from(zhP).filter(k => refP.has(k))), allow = new Set(Array.from(zhP).concat(Array.from(refP))), got = personsEn(uw);
    if (opts.heard && (want.has('m') || want.has('f'))) {
      want.delete('m'); want.delete('f'); allow.delete('m'); allow.delete('f');
      if (!got.has('m') && !got.has('f')) notes.push('Who is it about? <b>tā</b> = he / she (his / her).');
      got.delete('m'); got.delete('f');
    }
    want.forEach(k => { if (!got.has(k)) notes.push('Missing <b>' + PNAME[k] + '</b> (' + PZH[k] + ')'); });
    got.forEach(k => { if (!allow.has(k) && !(k === 'p2' && /thank you/.test(String(input).toLowerCase()))) notes.push('<b>' + PNAME[k] + '</b> is not in the Chinese' + (opts.zh ? ' — ' + CH.esc(opts.zh) + ' has ' + (Array.from(want).map(x => PZH[x]).join(', ') || 'no pronoun') : '') + '.'); });
    const neg = w => w.some(x => x === 'not' || x === 'no' || x === 'never');
    if (neg(rw) !== neg(uw)) notes.push(neg(rw) ? 'The Chinese has 不 (not / no): your answer is missing it.' : 'Your answer says "not", but the Chinese is not negative.');
    const ignore = new Set([].concat(PERS.p1, PERS.p2, PERS.m, PERS.f, PERS.pl, ['not', 'no', 'never']));
    const content = ws => Array.from(new Set(ws.filter(w => !STOP.has(w) && !ignore.has(w)).map(canon)));
    const rc = content(rw), uc = new Set(content(uw));
    const hit = rc.filter(w => uc.has(w) || (w === 'also' && uc.has('both')) || ((w === 'maternal' || w === 'paternal') && uc.has('grandma')));
    if (rc.length && hit.length < Math.max(1, Math.ceil(rc.length * 0.6))) notes.push('Key words missing: ' + rc.filter(w => hit.indexOf(w) < 0).map(w => '<b>' + CH.esc(w) + '</b>').join(', '));
    return { ok: !notes.length, notes };
  };

  /* similarity 0..1 between two strings (levenshtein based) */
  CH.similarity = function (a, b) {
    a = CH.hanOnly(a); b = CH.hanOnly(b);
    if (!a.length && !b.length) return 1;
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return 1 - d[m][n] / Math.max(m, n);
  };

  /* ---------- text to speech ---------- */
  const TTS = CH.tts = {
    voices: [], voice: null, rate: 0.85, supported: 'speechSynthesis' in window, hasChinese: false,
    init() {
      if (!this.supported) return;
      const load = () => {
        const all = speechSynthesis.getVoices();
        this.voices = all.filter(v => /^zh/i.test(v.lang) || /chinese|mandarin|普通话|中文/i.test(v.name));
        this.hasChinese = this.voices.length > 0;
        const saved = CH.store.get('voice', null);
        let v = this.voices.find(x => x.voiceURI === saved);
        if (!v) {
          const rank = x => (/zh[-_]CN/i.test(x.lang) ? 0 : /zh[-_]TW|zh[-_]HK/i.test(x.lang) ? 5 : 3) + (/(xiaoxiao|yunxi|huihui|yaoyao|ting-ting|tingting|google|natural)/i.test(x.name) ? -2 : 0);
          v = this.voices.slice().sort((a, b) => rank(a) - rank(b))[0] || null;
        }
        this.voice = v;
        document.dispatchEvent(new Event('tts-voices'));
      };
      load();
      if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', load); else speechSynthesis.onvoiceschanged = load;
      this.rate = CH.store.get('rate', 0.85);
    },
    setVoice(uri) { this.voice = this.voices.find(v => v.voiceURI === uri) || this.voice; CH.store.set('voice', this.voice && this.voice.voiceURI); },
    setRate(r) { this.rate = r; CH.store.set('rate', r); },
    clean(text) { return CH.cleanZh(text).replace(/\s+/g, ' ').trim(); },
    speak(text, opts) {
      opts = opts || {};
      return new Promise(resolve => {
        if (!this.supported) return resolve(false);
        const t = this.clean(text);
        if (!t) return resolve(false);
        try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
        setTimeout(() => {
          const u = new SpeechSynthesisUtterance(t);
          u.lang = (this.voice && this.voice.lang) || 'zh-CN';
          if (this.voice) u.voice = this.voice;
          u.rate = opts.rate || (opts.slow ? Math.max(0.4, this.rate - 0.3) : this.rate);
          u.pitch = 1;
          u.onend = () => resolve(true);
          u.onerror = () => resolve(false);
          speechSynthesis.speak(u);
          this.current = u; /* keep a reference so it is not garbage collected mid-speech */
        }, 40);
      });
    },
    stop() { if (this.supported) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  };

  /* ---------- stats ---------- */
  CH.stats = {
    data: CH.store.get('stats', { items: {}, modes: {} }),
    save() { CH.store.set('stats', this.data); },
    record(mode, key, ok) {
      const m = this.data.modes[mode] = this.data.modes[mode] || { s: 0, c: 0 };
      m.s++; if (ok) m.c++;
      if (key) {
        const it = this.data.items[key] = this.data.items[key] || { s: 0, c: 0, t: 0, miss: 0 };
        it.s++; if (ok) it.c++; else it.miss++;
        it.t = Date.now();
        it.recent = ((it.recent || '') + (ok ? '1' : '0')).slice(-5);
      }
      this.save();
    },
    /* weight multiplier for adaptive picking: recently-missed items come up more often */
    weight(key) {
      const it = this.data.items[key];
      if (!it) return 1.2;
      const r = it.recent || '';
      const misses = (r.match(/0/g) || []).length;
      if (!r.length) return 1.2;
      if (misses === 0 && r.length >= 3) return 0.5;
      return 1 + misses * 1.2;
    },
    reset() { this.data = { items: {}, modes: {} }; this.save(); }
  };
})(window.CH);
