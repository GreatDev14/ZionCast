/**
 * ZionCast Shared Bible Scripture Research & Related-Verse Search Engine
 * UMD module: works in Electron renderer (window.ZionBibleSearch) and Node.js (remote-server.js).
 *
 * Capabilities:
 * - Exact phrase matching with highest priority
 * - Multi-word proximity & token-coverage scoring across all 66 books (31,102 verses)
 * - Biblical spelling/archaic-to-modern synonym expansion (KJV/RSV/GNT compatible)
 * - Lightweight English/Biblical suffix stemming (-eth, -est, -ing, -ed, -s, -ness, etc.)
 * - Curated biblical topical cross-reference clusters for worship & preaching themes
 * - Testament filtering (all / OT / NT) and highlighted snippet metadata
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ZionBibleSearch = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const OT_BOOKS = new Set([
    'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
    'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
    '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther',
    'Job', 'Psalms', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Song of Songs',
    'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
    'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
    'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi'
  ]);

  const BOOK_EQUIVALENTS = {
    psalms: ['Psalms', 'Psalm'],
    psalm: ['Psalm', 'Psalms'],
    'song of solomon': ['Song of Solomon', 'Song of Songs'],
    'song of songs': ['Song of Songs', 'Song of Solomon']
  };

  function resolveBookInBible(bibleDatabase, bookName) {
    if (!bibleDatabase || !bibleDatabase.books || !bookName) return null;
    if (bibleDatabase.books[bookName]) return bookName;
    const low = String(bookName).trim().toLowerCase();
    const eqs = BOOK_EQUIVALENTS[low];
    if (eqs) {
      for (const cand of eqs) {
        if (bibleDatabase.books[cand]) return cand;
      }
    }
    return Object.keys(bibleDatabase.books).find(b => b.toLowerCase() === low) || null;
  }

  function canonicalRefKey(ref) {
    const low = String(ref || '').trim().toLowerCase();
    if (low.startsWith('psalm ')) return 'psalms ' + low.slice(6);
    if (low.startsWith('song of songs ')) return 'song of solomon ' + low.slice(14);
    return low;
  }

  const STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
    'do', 'does', 'did', 'for', 'from', 'had', 'has', 'have', 'he', 'her',
    'him', 'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my',
    'no', 'not', 'of', 'on', 'or', 'our', 'shall', 'she', 'so', 'that', 'the',
    'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'thou',
    'thy', 'thee', 'to', 'unto', 'up', 'us', 'was', 'we', 'were', 'what',
    'when', 'which', 'who', 'will', 'with', 'ye', 'you', 'your', 'about',
    'verses', 'verse', 'scripture', 'scriptures', 'bible'
  ]);

  // Bidirectional synonym / spelling / KJV-modern equivalence groups
  const SYNONYM_GROUPS = [
    ['light', 'shine', 'lamp', 'lantern', 'brightness', 'radiance', 'dawn', 'daystar', 'illuminate'],
    ['darkness', 'dark', 'shadow', 'night', 'gloom'],
    ['world', 'earth', 'nations', 'mankind', 'peoples'],
    ['love', 'charity', 'beloved', 'lovingkindness', 'affection', 'compassion'],
    ['faith', 'believe', 'trust', 'confidence', 'faithful', 'assurance'],
    ['heal', 'healing', 'healed', 'health', 'cure', 'restore', 'stripes', 'wholeness'],
    ['peace', 'rest', 'calm', 'still', 'tranquil', 'quietness', 'shalom'],
    ['fear', 'afraid', 'anxiety', 'anxious', 'worry', 'troubled', 'dismayed', 'terror', 'careful'],
    ['strength', 'strong', 'mighty', 'power', 'fortress', 'refuge', 'rock', 'empower'],
    ['pray', 'prayer', 'prayers', 'supplication', 'intercession', 'petition', 'ask'],
    ['worship', 'praise', 'adore', 'magnify', 'exalt', 'glorify', 'sing', 'thanksgiving', 'hallelujah'],
    ['grace', 'mercy', 'favor', 'favour', 'kindness', 'unmerited'],
    ['forgive', 'forgiveness', 'forgiven', 'pardon', 'remission', 'mercy'],
    ['salvation', 'save', 'saved', 'savior', 'saviour', 'redeem', 'redemption', 'deliver', 'deliverance'],
    ['armor', 'armour', 'shield', 'helmet', 'breastplate', 'sword', 'warfare'],
    ['shepherd', 'flock', 'pasture', 'sheep', 'pastor', 'guide'],
    ['joy', 'rejoice', 'glad', 'gladness', 'delight', 'cheerful'],
    ['hope', 'expectation', 'promise', 'anchor', 'future'],
    ['wisdom', 'wise', 'understanding', 'knowledge', 'discernment', 'counsel', 'counselor', 'counsellor'],
    ['spirit', 'ghost', 'comforter', 'helper', 'anointing', 'anointed', 'pentecost'],
    ['prosper', 'prosperity', 'bless', 'blessing', 'blessed', 'provision', 'supply', 'abundant', 'abundance'],
    ['honor', 'honour', 'respect', 'revere', 'glory'],
    ['patience', 'patient', 'longsuffering', 'suffereth', 'endure', 'endurance', 'steadfast', 'perseverance', 'wait'],
    ['humble', 'humility', 'meek', 'meekness', 'lowly', 'gentle'],
    ['courage', 'courageous', 'bold', 'boldness', 'brave', 'valiant'],
    ['victory', 'overcome', 'overcomer', 'conquer', 'conquerors', 'triumph', 'win'],
    ['protect', 'protection', 'refuge', 'shelter', 'defender', 'wings', 'fortress', 'safe', 'safety'],
    ['repent', 'repentance', 'confess', 'turn', 'cleanse', 'renew'],
    ['cross', 'calvary', 'crucified', 'blood', 'sacrifice', 'lamb', 'atonement'],
    ['resurrection', 'risen', 'eternal', 'everlasting', 'immortal', 'alive'],
    ['family', 'marriage', 'husband', 'wife', 'children', 'parents', 'household'],
    ['give', 'giving', 'generous', 'tithe', 'offering', 'cheerful', 'sow', 'reap'],
    ['unity', 'fellowship', 'together', 'harmony', 'brethren', 'one'],
    ['guide', 'guidance', 'direction', 'path', 'steps', 'lead', 'way']
  ];

  // Build fast lookup map: normalized word -> Set of synonyms
  const SYNONYM_MAP = new Map();
  SYNONYM_GROUPS.forEach((group) => {
    group.forEach((word) => {
      if (!SYNONYM_MAP.has(word)) SYNONYM_MAP.set(word, new Set());
      const bucket = SYNONYM_MAP.get(word);
      group.forEach((other) => {
        if (other !== word) bucket.add(other);
      });
    });
  });

  // Curated cross-reference scripture clusters for major worship/study topics
  // Each entry: { triggers: [...], refs: ['Book Ch:V', ...] }
  const TOPIC_CLUSTERS = [
    {
      name: 'Light of the World',
      triggers: ['light of the world', 'light', 'shine', 'lamp', 'darkness', 'city on a hill', 'city set on a hill'],
      refs: [
        'Matthew 5:14', 'John 8:12', 'John 9:5', 'Matthew 5:16', 'Matthew 5:15',
        'John 1:4', 'John 1:5', 'John 1:9', 'John 12:46', 'John 12:35', 'John 12:36',
        'Psalms 27:1', 'Psalms 119:105', 'Isaiah 60:1', 'Isaiah 60:2', 'Isaiah 9:2',
        '1 John 1:5', '1 John 1:7', 'Ephesians 5:8', 'Ephesians 5:14',
        '2 Corinthians 4:6', 'Philippians 2:15', 'Psalms 36:9', 'Psalms 18:28',
        'John 3:19', 'John 3:21', '1 Peter 2:9', 'Proverbs 4:18', 'Isaiah 42:6',
        'Isaiah 49:6', 'Luke 1:79', 'Acts 13:47', 'Revelation 21:23', 'Revelation 22:5'
      ]
    },
    {
      name: 'Faith & Trust',
      triggers: ['faith', 'walk by faith', 'mustard seed', 'believe', 'trust', 'faith without works'],
      refs: [
        'Hebrews 11:1', 'Hebrews 11:6', '2 Corinthians 5:7', 'Romans 10:17',
        'Ephesians 2:8', 'Mark 11:24', 'Matthew 17:20', 'Matthew 21:22',
        'Proverbs 3:5', 'Proverbs 3:6', 'James 2:17', 'James 1:6',
        'Galatians 2:20', 'Romans 1:17', 'Mark 9:23', '1 John 5:4'
      ]
    },
    {
      name: 'Love & Charity',
      triggers: ['love', 'love is patient', 'god is love', 'charity', 'love one another', 'greatest commandment'],
      refs: [
        '1 Corinthians 13:4', '1 Corinthians 13:5', '1 Corinthians 13:7', '1 Corinthians 13:8', '1 Corinthians 13:13',
        'John 3:16', '1 John 4:8', '1 John 4:7', '1 John 4:18', '1 John 4:19',
        'Romans 8:38', 'Romans 8:39', 'Romans 5:8', 'John 13:34', 'John 15:13',
        'Matthew 22:37', 'Matthew 22:39', 'Colossians 3:14', '1 Peter 4:8'
      ]
    },
    {
      name: 'Healing & Health',
      triggers: ['healing', 'heal', 'healed', 'sickness', 'disease', 'by his stripes', 'health', 'restore'],
      refs: [
        'Isaiah 53:5', '1 Peter 2:24', 'Jeremiah 17:14', 'Jeremiah 30:17',
        'Psalms 103:2', 'Psalms 103:3', 'Psalms 147:3', 'Exodus 15:26',
        'James 5:14', 'James 5:15', 'James 5:16', 'Psalms 30:2', 'Psalms 41:3',
        'Proverbs 4:20', 'Proverbs 4:22', 'Malachi 4:2', 'Matthew 8:17', '3 John 1:2'
      ]
    },
    {
      name: 'Peace & Overcoming Anxiety',
      triggers: ['peace', 'anxiety', 'anxious', 'worry', 'fear not', 'afraid', 'rest', 'calm'],
      refs: [
        'Philippians 4:6', 'Philippians 4:7', 'John 14:27', 'John 16:33',
        'Isaiah 26:3', 'Isaiah 41:10', '2 Timothy 1:7', '1 Peter 5:7',
        'Matthew 11:28', 'Matthew 11:29', 'Psalms 23:4', 'Psalms 46:10',
        'Psalms 94:19', 'Romans 8:6', 'Romans 15:13', 'Colossians 3:15', 'Joshua 1:9'
      ]
    },
    {
      name: 'Strength & Courage',
      triggers: ['strength', 'strong', 'courage', 'weary', 'tired', 'power', 'all things through christ'],
      refs: [
        'Philippians 4:13', 'Isaiah 40:31', 'Isaiah 40:29', 'Isaiah 41:10',
        'Joshua 1:9', 'Nehemiah 8:10', 'Psalms 46:1', 'Psalms 28:7', 'Psalms 18:32',
        '2 Corinthians 12:9', 'Ephesians 6:10', 'Deuteronomy 31:6', 'Psalms 73:26', 'Psalms 118:14'
      ]
    },
    {
      name: 'The Good Shepherd',
      triggers: ['shepherd', 'lord is my shepherd', 'green pastures', 'valley of the shadow', 'good shepherd'],
      refs: [
        'Psalms 23:1', 'Psalms 23:2', 'Psalms 23:3', 'Psalms 23:4', 'Psalms 23:5', 'Psalms 23:6',
        'John 10:11', 'John 10:14', 'John 10:27', 'John 10:28',
        'Isaiah 40:11', 'Ezekiel 34:11', 'Hebrews 13:20', '1 Peter 5:4'
      ]
    },
    {
      name: 'Armor of God & Spiritual Warfare',
      triggers: ['armor of god', 'armour of god', 'armor', 'armour', 'spiritual warfare', 'weapon', 'battle'],
      refs: [
        'Ephesians 6:10', 'Ephesians 6:11', 'Ephesians 6:12', 'Ephesians 6:13',
        'Ephesians 6:14', 'Ephesians 6:15', 'Ephesians 6:16', 'Ephesians 6:17', 'Ephesians 6:18',
        '2 Corinthians 10:4', 'Isaiah 54:17', 'Romans 8:37', '1 John 4:4', 'James 4:7'
      ]
    },
    {
      name: 'Prayer & Intercession',
      triggers: ['prayer', 'pray', 'praying', 'intercession', 'ask and it shall be given', 'seek'],
      refs: [
        'Matthew 7:7', 'Philippians 4:6', '1 Thessalonians 5:17', 'James 5:16',
        'Mark 11:24', 'Jeremiah 33:3', 'Jeremiah 29:12', '1 John 5:14', '1 John 5:15',
        'Matthew 6:6', 'Matthew 6:9', 'Romans 8:26', '2 Chronicles 7:14', 'Psalms 145:18'
      ]
    },
    {
      name: 'Worship & Praise',
      triggers: ['worship', 'praise', 'sing', 'thanksgiving', 'spirit and truth', 'enter his gates'],
      refs: [
        'John 4:23', 'John 4:24', 'Psalms 100:4', 'Psalms 150:6', 'Psalms 95:6',
        'Psalms 34:1', 'Psalms 29:2', 'Hebrews 13:15', 'Romans 12:1',
        'Psalms 103:1', 'Psalms 145:3', 'Colossians 3:16', '1 Chronicles 16:29'
      ]
    },
    {
      name: 'Grace, Mercy & Forgiveness',
      triggers: ['grace', 'mercy', 'forgiveness', 'forgive', 'forgiven', 'saved by grace'],
      refs: [
        'Ephesians 2:8', 'Ephesians 2:9', '2 Corinthians 12:9', 'Hebrews 4:16',
        '1 John 1:9', 'Ephesians 4:32', 'Colossians 3:13', 'Matthew 6:14',
        'Lamentations 3:22', 'Lamentations 3:23', 'Psalms 103:12', 'Romans 6:14', 'Titus 2:11'
      ]
    },
    {
      name: 'Salvation & Gospel',
      triggers: ['salvation', 'born again', 'gospel', 'eternal life', 'saved', 'way truth life'],
      refs: [
        'John 3:16', 'John 14:6', 'Romans 10:9', 'Romans 10:10', 'Romans 6:23',
        'Romans 3:23', 'Acts 4:12', 'Acts 16:31', 'Ephesians 2:8', '2 Corinthians 5:17',
        'John 1:12', 'John 3:3', 'Romans 8:1', 'Titus 3:5'
      ]
    },
    {
      name: 'Holy Spirit & Anointing',
      triggers: ['holy spirit', 'holy ghost', 'fruit of the spirit', 'anointing', 'pentecost', 'comforter'],
      refs: [
        'Galatians 5:22', 'Galatians 5:23', 'Acts 1:8', 'Acts 2:4', 'John 14:26',
        'John 16:13', 'Romans 8:11', 'Romans 8:26', '2 Corinthians 3:17',
        '1 Corinthians 6:19', 'Zechariah 4:6', 'Joel 2:28', 'Ephesians 5:18'
      ]
    },
    {
      name: 'Protection & Refuge',
      triggers: ['protection', 'refuge', 'secret place', 'shelter', 'no weapon', 'safety'],
      refs: [
        'Psalms 91:1', 'Psalms 91:2', 'Psalms 91:4', 'Psalms 91:11',
        'Psalms 121:7', 'Psalms 121:8', 'Isaiah 54:17', 'Psalms 46:1',
        'Proverbs 18:10', '2 Thessalonians 3:3', 'Psalms 27:1', 'Psalms 34:7'
      ]
    },
    {
      name: 'Provision, Blessing & Hope',
      triggers: ['provision', 'prosper', 'prosperity', 'blessing', 'plans to prosper', 'hope', 'supply'],
      refs: [
        'Jeremiah 29:11', 'Philippians 4:19', 'Romans 8:28', 'Matthew 6:33',
        'Malachi 3:10', '2 Corinthians 9:8', 'Psalms 37:4', 'Proverbs 10:22',
        'Romans 15:13', 'Deuteronomy 28:2', 'Luke 6:38', '3 John 1:2'
      ]
    },
    {
      name: 'Wisdom & Guidance',
      triggers: ['wisdom', 'guidance', 'direction', 'knowledge', 'understanding', 'steps'],
      refs: [
        'James 1:5', 'Proverbs 3:5', 'Proverbs 3:6', 'Proverbs 9:10', 'Proverbs 4:7',
        'Psalms 32:8', 'Psalms 119:105', 'Psalms 37:23', 'Isaiah 30:21',
        'Proverbs 16:9', 'Colossians 3:16', 'Proverbs 2:6'
      ]
    },
    {
      name: 'Joy & Rejoicing',
      triggers: ['joy', 'rejoice', 'gladness', 'joy of the lord', 'happy'],
      refs: [
        'Nehemiah 8:10', 'Philippians 4:4', 'Psalms 16:11', 'Psalms 30:5',
        'Romans 15:13', 'James 1:2', '1 Thessalonians 5:16', 'Psalms 118:24',
        'John 15:11', 'Psalms 126:5', 'Galatians 5:22'
      ]
    }
  ];

  // Lightweight stemmer tailored for English + KJV biblical endings
  function stemWord(word) {
    let w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return w;
    if (w.endsWith('ieth') && w.length > 5) return w.slice(0, -4) + 'y';
    if (w.endsWith('eth') && w.length > 5) return w.slice(0, -3);
    if (w.endsWith('est') && w.length > 5) return w.slice(0, -3);
    if (w.endsWith('ness') && w.length > 6) return w.slice(0, -4);
    if (w.endsWith('ment') && w.length > 6) return w.slice(0, -4);
    if (w.endsWith('tion') && w.length > 6) return w.slice(0, -4);
    if (w.endsWith('ing') && w.length > 5) {
      let base = w.slice(0, -3);
      if (base.length >= 3 && base[base.length - 1] === base[base.length - 2]) base = base.slice(0, -1);
      return base;
    }
    if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
    if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
    if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
    return w;
  }

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, ' ')
      .split(/\s+/)
      .map(t => t.replace(/^'+|'+$/g, ''))
      .filter(Boolean);
  }

  // Per-Bible-database flat verse index cache (built lazily once per version in ~25ms)
  const indexCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function buildBibleIndex(bibleDatabase) {
    if (!bibleDatabase || !bibleDatabase.books) return [];
    if (indexCache && indexCache.has(bibleDatabase)) {
      return indexCache.get(bibleDatabase);
    }
    const entries = [];
    const byRef = new Map();
    for (const [book, chMap] of Object.entries(bibleDatabase.books)) {
      const testament = OT_BOOKS.has(book) ? 'OT' : 'NT';
      for (const [chapter, vMap] of Object.entries(chMap)) {
        for (const [verse, text] of Object.entries(vMap)) {
          const textStr = String(text || '');
          const lower = textStr.toLowerCase();
          const refKey = `${book} ${chapter}:${verse}`;
          const entry = {
            book,
            chapter: String(chapter),
            verse: String(verse),
            ref: refKey,
            testament,
            text: textStr,
            lower
          };
          entries.push(entry);
          byRef.set(refKey.toLowerCase(), entry);
        }
      }
    }
    const indexObj = { entries, byRef };
    if (indexCache) indexCache.set(bibleDatabase, indexObj);
    return indexObj;
  }

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Search all verses in a Bible database for exact phrases, related keywords, synonyms, and topical cross-references.
   *
   * @param {object} bibleDatabase - Loaded Bible JSON ({ abbreviation, books: { Book: { Ch: { V: text } } } })
   * @param {string} rawQuery - Phrase or topic (e.g. "light of the world", "healing", "love is patient")
   * @param {object} [options]
   * @param {'all'|'OT'|'NT'} [options.testament='all']
   * @param {number} [options.limit=80]
   * @returns {{ query: string, normalizedTerms: string[], relatedTopics: string[], totalFound: number, results: Array }}
   */
  function search(bibleDatabase, rawQuery, options = {}) {
    const query = String(rawQuery || '').trim();
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 80));
    const testamentFilter = String(options.testament || 'all').toUpperCase();

    if (!bibleDatabase || !bibleDatabase.books || query.length < 2) {
      return { query, normalizedTerms: [], relatedTopics: [], totalFound: 0, results: [] };
    }

    const { entries, byRef } = buildBibleIndex(bibleDatabase);
    const queryLower = query.toLowerCase().replace(/\s+/g, ' ').trim();
    const rawTokens = tokenize(queryLower);
    const contentTokens = rawTokens.filter(t => t.length >= 2 && !STOP_WORDS.has(t));
    const coreTokens = contentTokens.length > 0 ? contentTokens : rawTokens.filter(t => t.length >= 2);

    if (coreTokens.length === 0) {
      return { query, normalizedTerms: [], relatedTopics: [], totalFound: 0, results: [] };
    }

    // 1. Expand each core token into stems + synonyms
    const tokenSpecs = coreTokens.map((tok) => {
      const stem = stemWord(tok);
      const syns = new Set();
      if (SYNONYM_MAP.has(tok)) {
        SYNONYM_MAP.get(tok).forEach(s => syns.add(s));
      }
      if (stem !== tok && SYNONYM_MAP.has(stem)) {
        SYNONYM_MAP.get(stem).forEach(s => syns.add(s));
      }
      const synList = Array.from(syns);
      const exactRe = new RegExp(`\\b${escapeRegex(tok)}\\b`, 'i');
      const stemRe = stem.length >= 3 ? new RegExp(`\\b${escapeRegex(stem)}[a-z]*\\b`, 'i') : exactRe;
      const synRes = synList.map(s => ({
        word: s,
        re: new RegExp(`\\b${escapeRegex(stemWord(s))}[a-z]*\\b`, 'i')
      }));
      return { tok, stem, exactRe, stemRe, synRes };
    });

    // 2. Match curated topic clusters
    const curatedBoostMap = new Map(); // refKeyLower -> { bonus, topicName }
    const relatedTopics = [];
    TOPIC_CLUSTERS.forEach((cluster) => {
      let clusterScore = 0;
      for (const trig of cluster.triggers) {
        if (queryLower === trig) {
          clusterScore = Math.max(clusterScore, 100);
        } else if (queryLower.includes(trig) && trig.length >= 4) {
          clusterScore = Math.max(clusterScore, trig.includes(' ') ? 95 : 65);
        } else if (trig.includes(queryLower) && queryLower.length >= 4) {
          clusterScore = Math.max(clusterScore, 75);
        } else {
          const trigTokens = tokenize(trig).filter(t => !STOP_WORDS.has(t));
          const overlap = trigTokens.filter(tt => coreTokens.some(ct => ct === tt || stemWord(ct) === stemWord(tt)));
          if (overlap.length > 0 && overlap.length === trigTokens.length) {
            clusterScore = Math.max(clusterScore, trigTokens.length > 1 ? 85 : 55);
          }
        }
      }
      if (clusterScore > 0) {
        relatedTopics.push(cluster.name);
        cluster.refs.forEach((ref, idx) => {
          const key = canonicalRefKey(ref);
          // Earlier refs in cluster are the most iconic scriptures for that topic
          const posBonus = Math.max(15, clusterScore - idx * 1.8);
          const prev = curatedBoostMap.get(key);
          if (!prev || posBonus > prev.bonus) {
            curatedBoostMap.set(key, { bonus: posBonus, topicName: cluster.name });
          }
        });
      }
    });

    // 3. Score all verses across the entire Bible
    const phraseRe = new RegExp(`\\b${escapeRegex(queryLower)}\\b`, 'i');
    const scored = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (testamentFilter === 'OT' && e.testament !== 'OT') continue;
      if (testamentFilter === 'NT' && e.testament !== 'NT') continue;

      const lower = e.lower;
      const refLower = canonicalRefKey(e.ref);
      const curated = curatedBoostMap.get(refLower);

      const hasExactPhrase = lower.includes(queryLower);
      let score = 0;
      let coreExactHits = 0;
      let coreStemHits = 0;
      let synHits = 0;
      const matchedTerms = [];

      if (hasExactPhrase) {
        score += phraseRe.test(lower) ? 180 : 145;
      }

      // Fast pre-check: if not exact phrase and not curated, check if any core token/stem/synonym can match
      for (let tIdx = 0; tIdx < tokenSpecs.length; tIdx++) {
        const sp = tokenSpecs[tIdx];
        if (sp.exactRe.test(lower)) {
          coreExactHits++;
          score += 34;
          matchedTerms.push(sp.tok);
        } else if (sp.stemRe.test(lower)) {
          coreStemHits++;
          score += 24;
          matchedTerms.push(sp.stem);
        } else {
          // Check synonyms (capped contribution so direct matches always outrank synonyms)
          for (let sIdx = 0; sIdx < sp.synRes.length; sIdx++) {
            const sr = sp.synRes[sIdx];
            if (sr.re.test(lower)) {
              synHits++;
              score += 11;
              matchedTerms.push(sr.word);
              break;
            }
          }
        }
      }

      const directCoverage = coreExactHits + coreStemHits;

      // Require meaningful relevance:
      // - Exact phrase match, OR
      // - Curated topical cross-reference, OR
      // - All core words matched (for 1-3 word queries), OR
      // - At least 2 direct core words matched, OR
      // - Single core word + at least 1 synonym of another word
      const isRelevant = hasExactPhrase
        || !!curated
        || (coreTokens.length === 1 && (directCoverage >= 1 || synHits >= 1))
        || (coreTokens.length === 2 && (directCoverage >= 2 || (directCoverage >= 1 && synHits >= 1)))
        || (coreTokens.length >= 3 && (directCoverage >= 2 || (directCoverage >= 1 && synHits >= 2)));

      if (!isRelevant) continue;

      // Coverage & proximity bonus for multi-word queries
      if (coreTokens.length > 1 && directCoverage === coreTokens.length) {
        score += 48;
        // Proximity bonus: words appearing close together in the verse
        const positions = coreTokens
          .map(tok => lower.indexOf(stemWord(tok)))
          .filter(p => p >= 0)
          .sort((a, b) => a - b);
        if (positions.length >= 2) {
          const span = positions[positions.length - 1] - positions[0];
          if (span < 45) score += 22;
          else if (span < 90) score += 10;
        }
      }

      if (curated) {
        score += curated.bonus;
      }

      let matchType = 'keyword';
      if (hasExactPhrase) matchType = 'exact';
      else if (curated && directCoverage >= 1) matchType = 'related';
      else if (curated) matchType = 'topic';
      else if (coreTokens.length > 1 && directCoverage === coreTokens.length) matchType = 'all-words';

      scored.push({
        book: e.book,
        chapter: e.chapter,
        verse: e.verse,
        ref: e.ref,
        testament: e.testament,
        text: e.text,
        score: Math.round(score * 10) / 10,
        matchType,
        topicName: curated ? curated.topicName : '',
        matchedTerms: Array.from(new Set(matchedTerms))
      });
    }

    // Sort highest relevance first, preserving canonical order for ties
    scored.sort((a, b) => b.score - a.score);

    const totalFound = scored.length;
    const results = scored.slice(0, limit);

    return {
      query,
      normalizedTerms: coreTokens,
      relatedTopics: Array.from(new Set(relatedTopics)),
      totalFound,
      results
    };
  }

  /**
   * Build safe HTML with matched terms highlighted in <mark class="bible-hit-mark">.
   */
  function highlightText(text, query, matchedTerms = [], escapeFn) {
    const esc = typeof escapeFn === 'function'
      ? escapeFn
      : (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safe = esc(text);
    const terms = [];
    const qClean = String(query || '').trim();
    if (qClean.length >= 3) terms.push(qClean);
    (matchedTerms || []).forEach((t) => {
      if (t && t.length >= 3 && !STOP_WORDS.has(t.toLowerCase())) terms.push(t);
    });
    if (terms.length === 0) return safe;

    // Sort longest terms first so full phrase highlights cleanly before individual words
    const uniqueSorted = Array.from(new Set(terms.map(t => t.toLowerCase())))
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);
    const pattern = uniqueSorted.map(t => (t.includes(' ') ? escapeRegex(t) : `\\b${escapeRegex(t)}[a-z]*\\b`)).join('|');
    if (!pattern) return safe;
    try {
      const re = new RegExp(`(${pattern})`, 'gi');
      return safe.replace(re, '<mark class="bible-hit-mark">$1</mark>');
    } catch (_) {
      return safe;
    }
  }

  const POPULAR_TOPICS = [
    { label: 'Light of the World', query: 'light of the world' },
    { label: 'Faith', query: 'faith' },
    { label: 'Healing', query: 'healing' },
    { label: 'Peace', query: 'peace' },
    { label: 'Love', query: 'love is patient' },
    { label: 'Strength', query: 'strength' },
    { label: 'Prayer', query: 'prayer' },
    { label: 'Grace', query: 'grace' },
    { label: 'Worship', query: 'worship' },
    { label: 'Protection', query: 'protection' }
  ];

  return {
    search,
    highlightText,
    stemWord,
    resolveBookInBible,
    canonicalRefKey,
    POPULAR_TOPICS,
    TOPIC_CLUSTERS
  };
});
