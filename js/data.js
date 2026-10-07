/* Builds quiz pools from window.LESSONS and handles lesson scoping */
(function (CH) {
  'use strict';

  const DB = CH.DB = { lessons: {}, nums: [], words: [], sents: [], syls: [], chars: [], dialogs: [], topics: [], max: 0 };

  /* align hanzi of a word with its pinyin syllables; returns [{ch, py}] or null */
  const VW = 'aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
  const SYL = new RegExp('^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[' + VW + ']+(?:ng|n)?|[eēéěè]r)$', 'i');
  /* split a run-together pinyin string into exactly k syllables, or null */
  function segPy(s, k) {
    if (k === 1) return SYL.test(s) ? [s] : null;
    for (let len = Math.min(s.length - (k - 1), 8); len >= 1; len--) {
      const head = s.slice(0, len);
      if (!SYL.test(head)) continue;
      const rest = segPy(s.slice(len), k - 1);
      if (rest) return [head].concat(rest);
    }
    return null;
  }
  function align(zh, py) {
    const chars = Array.from(CH.cleanZh(zh)).filter(CH.isHan);
    let toks = CH.pyTokens(py);
    if (!chars.length) return null;
    if (chars.length !== toks.length && !(chars[chars.length - 1] === '儿' && chars.length - 1 === toks.length)) {
      const joined = toks.join('').replace(/['’]/g, '');
      const n = chars[chars.length - 1] === '儿' && /r$/i.test(joined) ? chars.length - 1 : chars.length;
      const seg = segPy(joined, n);
      if (seg) toks = seg;
    }
    if (chars.length === toks.length) return chars.map((c, i) => ({ ch: c, py: toks[i] }));
    /* 儿-hua: "nǎr" = 哪儿 */
    if (chars[chars.length - 1] === '儿' && chars.length - 1 === toks.length) {
      const out = chars.slice(0, -1).map((c, i) => ({ ch: c, py: toks[i] }));
      return out;
    }
    return null;
  }
  CH.align = align;

  CH.build = function () {
    const L = window.LESSONS || {};
    DB.lessons = L;
    DB.nums = Object.keys(L).map(Number).sort((a, b) => a - b);
    DB.max = DB.nums.length ? DB.nums[DB.nums.length - 1] : 14;
    DB.words = []; DB.sents = []; DB.syls = []; DB.chars = []; DB.dialogs = []; DB.topics = [];
    const seenChar = new Set(), seenSyl = new Set();

    DB.nums.forEach(n => {
      const les = L[n];
      (les.vocab || []).forEach((v, i) => {
        if (!v || !v.zh || !v.py) return;
        const w = { id: 'w' + n + ':' + v.zh, kind: 'word', zh: v.zh, py: v.py, en: v.en || '', pos: v.pos || '', lesson: n };
        w.al = align(v.zh, v.py);
        w.han = CH.hanOnly(v.zh);
        w.tones = w.al ? w.al.map(a => CH.toneOf(a.py)) : null;
        DB.words.push(w);
        if (w.al) w.al.forEach(a => {
          const sb = CH.splitSyl(a.py);
          const sk = a.py + '|' + a.ch;
          if (!seenSyl.has(sk)) { seenSyl.add(sk); DB.syls.push({ id: 's:' + sk, ch: a.ch, py: a.py, base: sb.base, init: sb.init, fin: sb.fin, tone: CH.toneOf(a.py), lesson: n }); }
          const ck = a.ch;
          if (!seenChar.has(ck)) {
            seenChar.add(ck);
            DB.chars.push({ id: 'c:' + a.ch, kind: 'char', zh: a.ch, py: a.py, en: (w.han === a.ch ? w.en : ''), inWord: w, lesson: n });
          } else if (w.han === a.ch) {
            const c = DB.chars.find(x => x.zh === a.ch); if (c && !c.en) c.en = w.en;
          }
        });
      });
      (les.chars || []).forEach(c => {
        if (!c || !c.zh || !c.py) return;
        if (Array.from(c.zh).length === 1 && !seenChar.has(c.zh)) {
          seenChar.add(c.zh);
          DB.chars.push({ id: 'c:' + c.zh, kind: 'char', zh: c.zh, py: c.py, en: c.en || '', note: c.note || '', lesson: n });
        }
      });
      /* sentences from texts + phrases */
      (les.texts || []).forEach((t, ti) => {
        const lines = (t.lines || []).filter(l => l && l.zh);
        lines.forEach((l, li) => {
          if (CH.hanOnly(l.zh).length < 2) return;
          DB.sents.push({ id: 's' + n + ':t' + ti + ':' + li, kind: 'line', zh: l.zh, py: l.py || '', en: l.en || '', sp: l.sp || '', lesson: n, src: t.title || '' });
        });
        if (lines.length >= 2) DB.dialogs.push({ id: 'd' + n + ':' + ti, lesson: n, title: t.title || ('Text ' + (ti + 1)), lines });
      });
      (les.phrases || []).forEach((p, pi) => {
        if (!p || !p.zh || CH.hanOnly(p.zh).length < 2) return;
        if (/[_＿]{2,}|…|\.\.\./.test(p.zh + (p.py || ''))) return; /* skip fill-in-the-blank templates */
        DB.sents.push({ id: 'p' + n + ':' + pi, kind: 'phrase', zh: p.zh, py: p.py || '', en: p.en || '', sp: '', topic: p.topic || '', lesson: n });
        if (p.topic) {
          let t = DB.topics.find(x => x.lesson === n && x.topic === p.topic);
          if (!t) DB.topics.push(t = { lesson: n, topic: p.topic, items: [] });
          t.items.push(p);
        }
      });
    });
    DB.sents = CH.uniqBy(DB.sents, s => s.zh + '|' + s.lesson);
    /* map toneless syllable -> hanzi (for sound drills) */
    DB.known = new Set(DB.syls.map(s => s.base));
  };

  /* ---------- scope ---------- */
  CH.scope = Object.assign({ from: 1, to: 2, review: true }, CH.store.get('scope', {}));
  CH.setScope = function (s) {
    Object.assign(CH.scope, s);
    if (CH.scope.to < CH.scope.from) CH.scope.to = CH.scope.from;
    CH.store.set('scope', CH.scope);
  };
  CH.scopeLabel = function () {
    const s = CH.scope;
    const main = s.from === s.to ? 'Lesson ' + s.from : 'Lessons ' + s.from + '–' + s.to;
    return s.from > 1 && s.review ? main + ' + review' : main;
  };
  /* all items up to the focus range end */
  CH.inScope = list => list.filter(i => i.lesson <= CH.scope.to);
  /* weight an item: focus lessons 1.0 ; earlier lessons reduced if review is on, 0 if off */
  CH.itemWeight = function (it) {
    const s = CH.scope;
    let w;
    if (it.lesson > s.to) return 0;
    if (it.lesson >= s.from) w = 1;
    else w = s.review ? 0.35 : 0;
    return w * CH.stats.weight(it.id);
  };
  CH.pool = list => list.filter(i => CH.itemWeight(i) > 0);
  CH.draw = (list, n, filterFn) => {
    let p = CH.pool(list);
    if (filterFn) p = p.filter(filterFn);
    return CH.wsample(p, CH.itemWeight, n);
  };
  CH.lessonTitle = n => { const l = DB.lessons[n]; return l ? (l.titleZh || '') + (l.titleEn ? ' · ' + l.titleEn : '') : ''; };
})(window.CH);
