import React, { useEffect, useMemo, useRef, useState } from "react";

/** ====== 词库 JSON 配置（按钮名 -> public 路径）适配本地 dev + GitHub Pages ====== */
const BASE = import.meta.env.BASE_URL;

const DICTS = [
  { label: "复习", url: `${BASE}words/复习.json` },
  { label: "生字词", url: `${BASE}words/生字词.json` },
];

/** ====== 儿童友好颜色 ====== */
const WORD_COLORS = [
  "#FF6B6B",
  "#FF8A00",
  "#FFB703",
  "#43AA8B",
  "#00B4D8",
  "#3A86FF",
  "#8338EC",
  "#FF4D9D",
  "#F72585",
  "#2A9D8F",
];

const OK_COLOR = "#43AA8B"; // 绿
const NO_COLOR = "#F72585"; // 玫红

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeSeed() {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const noise = Math.floor(Math.random() * 1e9);
  return (h ^ noise) >>> 0;
}

function hashStringToInt(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickColor(word, salt) {
  const idx = (hashStringToInt(word) + salt) % WORD_COLORS.length;
  return WORD_COLORS[idx];
}

async function loadDict(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`加载失败：${url}（${res.status}）`);
  const json = await res.json();
  const name = typeof json?.name === "string" ? json.name : "词库";
  const words = Array.isArray(json?.words) ? json.words : [];
  const cleaned = words
    .map((w) => String(w).trim())
    .filter((w) => w.length > 0);
  if (cleaned.length === 0) throw new Error(`词库为空：${url}`);
  return { name, words: cleaned };
}

export default function App() {
  /** ====== 词库相关状态 ====== */
  const [dictLabel, setDictLabel] = useState(null); // “复习/生字词”
  const [dictName, setDictName] = useState(null); // json.name
  const [words, setWords] = useState([]); // 当前词库数组
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  /** ====== 游戏状态 ====== */
  const [started, setStarted] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [word, setWord] = useState(null);
  const [wordColor, setWordColor] = useState("#111827");
  const [flipKey, setFlipKey] = useState(0);

  const usedRef = useRef(new Set());
  const queueRef = useRef([]);

  const total = useMemo(() => words.length, [words]);
  const progressText = `${usedRef.current.size}/${total || 0}`;

  /** ====== 洗牌/发牌 ====== */
  const resetDeck = () => {
    usedRef.current = new Set();
    const rnd = mulberry32(computeSeed());
    queueRef.current = shuffle(words, rnd);
  };

  const dealNext = (saltOverride) => {
    if (!words || words.length === 0) return;
    if (queueRef.current.length === 0) resetDeck();

    let next = null;
    while (queueRef.current.length > 0) {
      const w = queueRef.current.shift();
      if (!usedRef.current.has(w)) {
        next = w;
        break;
      }
    }

    const salt =
      typeof saltOverride === "number"
        ? saltOverride
        : flipKey + correct * 3 + wrong * 7;

    if (next) {
      usedRef.current.add(next);
      setWord(next);
      setWordColor(pickColor(next, salt));
      return;
    }

    // 用尽则重新洗牌继续
    resetDeck();
    dealNext(salt);
  };

  /** ====== 进入“未开始”页面（统一入口） ====== */
  const toStartScreen = ({ reshuffle = true } = {}) => {
    setStarted(false);
    setCorrect(0);
    setWrong(0);
    setWord(null);
    usedRef.current = new Set();
    queueRef.current = [];
    if (reshuffle && words.length) resetDeck();
    setFlipKey((k) => k + 1);
  };

  /** ====== 选择词库（加载 JSON） ====== */
  const chooseDict = async (label, url) => {
    setErrMsg("");
    setLoading(true);
    try {
      const data = await loadDict(url);
      setDictLabel(label);
      setDictName(data.name);
      setWords(data.words);

      // 选词库后回到“开始页面”（显示词库按钮 + 开始按钮）
      // 注意：这里不能立刻 resetDeck，因为 words 还没更新到 state
      setStarted(false);
      setCorrect(0);
      setWrong(0);
      setWord(null);
      usedRef.current = new Set();
      queueRef.current = [];
      setFlipKey((k) => k + 1);
    } catch (e) {
      setErrMsg(e?.message || "加载词库失败");
    } finally {
      setLoading(false);
    }
  };

  /** ====== 当 words 更新后，自动准备牌堆（不发牌，等开始） ====== */
  useEffect(() => {
    if (words.length) {
      resetDeck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  /** ====== 开始/重开/答题 ====== */
  const onStart = () => {
    if (!words || words.length === 0) return;
    setStarted(true);
    setCorrect(0);
    setWrong(0);
    resetDeck();
    setFlipKey((k) => k + 1);
    dealNext(1);
  };

  const onRestart = () => {
    // ✅ 新规则：回到开始页面（显示《猜猜看》+开始按钮；并重新洗牌；并重新显示词库按钮）
    // 词库不清空，方便快速再来一轮；如果你希望“重开也清空词库选择”，把 toStartScreen 后再 setDictLabel(null) 即可
    toStartScreen({ reshuffle: true });
  };

  const onAnswer = (isCorrect) => {
    if (!started) return;
    if (isCorrect) setCorrect((c) => c + 1);
    else setWrong((w) => w + 1);
    setFlipKey((k) => k + 1);
    dealNext();
  };

  /** ====== 词库按钮 hover：更明显（背景+文字+轻微放大） ====== */
  const dictBtnStyle = (active) => ({
    ...styles.dictBtn,
    outline: active ? "3px solid rgba(0,0,0,0.10)" : "none",
  });

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        {/* 顶部：计数 + 词库名 + 重开 */}
        <div style={styles.topBar}>
          <div style={styles.counter}>
            <span style={{ fontWeight: 900 }}>正确</span> {correct}
            <span style={{ opacity: 0.5 }}> / </span>
            <span style={{ fontWeight: 900 }}>错误</span> {wrong}
          </div>

          <div style={styles.rightTop}>
            <div style={styles.meta}>
              <div style={styles.metaLine}>
                词库：{" "}
                <span style={{ fontWeight: 800 }}>
                  {dictLabel ? dictLabel : "未选择"}
                </span>
                {dictName ? (
                  <span style={{ opacity: 0.7 }}>（{dictName}）</span>
                ) : null}
              </div>
              <div style={styles.metaLineSmall}>本轮进度 {progressText}</div>
            </div>

            <button
              style={{
                ...styles.smallBtn,
                opacity: words.length ? 1 : 0.45,
                cursor: words.length ? "pointer" : "not-allowed",
              }}
              onClick={onRestart}
              disabled={!words.length}
              title="回到开始页面并重新洗牌"
            >
              重开/洗牌
            </button>
          </div>
        </div>

        {/* 主舞台 */}
        <div style={styles.stage}>
          <div style={styles.cardOuter}>
            <div style={styles.hint}>
              {!dictLabel
                ? "请选择一个词库开始"
                : started
                  ? "请读出这个词"
                  : "准备好了吗？"}
            </div>

            <div
              key={flipKey}
              style={{
                ...styles.word,
                color: started
                  ? wordColor
                  : dictLabel
                    ? "#111827"
                    : "rgba(17,24,39,0.35)",
                animation: "pop 180ms ease-out",
              }}
            >
              {started ? (word ?? "…") : "《猜猜看》"}
            </div>

            {started && (
              <div style={styles.subHint}>点击正确/错误，翻到下一个</div>
            )}

            {/* ✅ 进入答题模式后隐藏词库按钮 */}
            {!started && (
              <div style={{ marginTop: 14, width: "100%" }}>
                <div style={styles.dictRow}>
                  {DICTS.map((d) => (
                    <button
                      key={d.label}
                      style={dictBtnStyle(dictLabel === d.label)}
                      onClick={() => chooseDict(d.label, d.url)}
                      disabled={loading}
                      title={`加载 ${d.url}`}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#111827";
                        e.currentTarget.style.color = "white";
                        e.currentTarget.style.transform = "scale(1.03)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.92)";
                        e.currentTarget.style.color = "#111827";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      {loading ? "加载中…" : d.label}
                    </button>
                  ))}
                </div>

                {!!errMsg && <div style={styles.error}>{errMsg}</div>}
              </div>
            )}
          </div>

          {/* 底部按钮区 */}
          {!started ? (
            <button
              style={{
                ...styles.startBtn,
                opacity: words.length ? 1 : 0.45,
                cursor: words.length ? "pointer" : "not-allowed",
              }}
              onClick={onStart}
              disabled={!words.length}
              title={words.length ? "开始出词" : "请先选择词库"}
              onMouseEnter={(e) => {
                if (!words.length) return;
                e.currentTarget.style.background = "#FF6B6B";
                e.currentTarget.style.color = "white";
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "white";
                e.currentTarget.style.color = "#FF6B6B";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              开始
            </button>
          ) : (
            <div style={styles.btnRow}>
              <button
                style={styles.answerBtn(OK_COLOR)}
                onClick={() => onAnswer(true)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = OK_COLOR;
                  e.currentTarget.style.color = "white";
                  e.currentTarget.style.transform = "scale(1.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "white";
                  e.currentTarget.style.color = "black";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                正确
              </button>

              <button
                style={styles.answerBtn(NO_COLOR)}
                onClick={() => onAnswer(false)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = NO_COLOR;
                  e.currentTarget.style.color = "white";
                  e.currentTarget.style.transform = "scale(1.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "white";
                  e.currentTarget.style.color = "black";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                错误
              </button>
            </div>
          )}

          <div style={styles.footer}>
            刷新页面会回到词库选择。词库文件在 public/words/*.json
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pop {
          from { transform: rotateY(35deg) scale(0.98); opacity: 0.3; }
          to   { transform: rotateY(0deg)  scale(1);    opacity: 1; }
        }
        button { cursor: pointer; }
        button:active { transform: scale(0.98); }
      `}</style>
    </div>
  );
}

/** ====== 样式（响应式、居中） ====== */
const styles = {
  page: {
    minHeight: "100svh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    background:
      "radial-gradient(circle at 10% 10%, rgba(255,200,200,0.7), transparent 40%)," +
      "radial-gradient(circle at 90% 90%, rgba(180,220,255,0.8), transparent 45%)," +
      "linear-gradient(135deg, #FDE68A, #BFDBFE, #BBF7D0)",
  },
  wrap: { width: "100%", maxWidth: 720 },

  topBar: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  counter: {
    background: "rgba(255,255,255,0.75)",
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    fontSize: 14,
    whiteSpace: "nowrap",
  },
  rightTop: { display: "flex", alignItems: "center", gap: 10 },
  meta: {
    textAlign: "right",
    lineHeight: 1.2,
    maxWidth: 220,
  },
  metaLine: { fontSize: 12, opacity: 0.85 },
  metaLineSmall: { fontSize: 12, opacity: 0.6 },

  smallBtn: {
    padding: "8px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.75)",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
    fontWeight: 900,
    transition: "transform 150ms ease",
  },

  stage: {
    width: "100%",
    borderRadius: 28,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.10)",
    padding: 18,
    backdropFilter: "blur(8px)",
  },

  cardOuter: {
    borderRadius: 28,
    background: "white",
    border: "1px solid rgba(0,0,0,0.06)",
    padding: "22px 16px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },
  hint: { fontSize: 14, opacity: 0.65, marginBottom: 8, fontWeight: 900 },
  word: {
    fontSize: 64,
    fontWeight: 900,
    letterSpacing: 2,
    textShadow: "0 2px 0 rgba(255,255,255,0.9), 0 14px 30px rgba(0,0,0,0.10)",
    lineHeight: 1.1,
    wordBreak: "break-word",
  },
  subHint: { marginTop: 12, fontSize: 12, opacity: 0.55 },

  dictRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  dictBtn: {
    padding: "12px 10px",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 8px 22px rgba(0,0,0,0.06)",
    fontWeight: 900,
    fontSize: 16,
    color: "#111827",
    transition: "all 160ms ease",
    transform: "scale(1)",
  },

  error: {
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(247, 37, 133, 0.10)",
    border: "1px solid rgba(247, 37, 133, 0.25)",
    color: "#7A0D3C",
    fontWeight: 800,
    fontSize: 13,
  },

  startBtn: {
    marginTop: 14,
    width: "100%",
    padding: "18px 12px",
    borderRadius: 18,
    border: "2px solid #FF6B6B",
    background: "white",
    color: "#FF6B6B",
    fontSize: 18,
    fontWeight: 900,
    boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
    transition: "all 150ms ease",
    transform: "scale(1)",
  },

  btnRow: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  answerBtn: (borderColor) => ({
    padding: "18px 12px",
    borderRadius: 18,
    border: `2px solid ${borderColor}`,
    background: "white",
    color: "black",
    fontSize: 18,
    fontWeight: 900,
    boxShadow: "0 12px 30px rgba(0,0,0,0.10)",
    transition: "all 150ms ease",
    transform: "scale(1)",
  }),

  footer: { marginTop: 12, textAlign: "center", fontSize: 12, opacity: 0.6 },
};
