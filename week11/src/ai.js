/**
 * Workers AI 呼叫、JSON 解析與格式檢查。
 *
 * 這裡刻意不信任模型輸出:先抽出 JSON,再逐欄位驗證;
 * 只有格式正確的資料才會被回傳給 API 層寫入 D1。
 */

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_NOTE_CHARS = 6500;
const AI_TIMEOUT_MS = 45_000;

export class AiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = 'AiError';
    this.code = code;
    this.status = status;
  }
}

const SYSTEM_PROMPT = `你是 StudyBox 的專業讀書助理,擅長把學習筆記整理成考試重點。
所有輸出都必須使用繁體中文(台灣用語),不得使用簡體字。
你必須嚴格遵守使用者指定的 JSON 格式,只輸出 JSON,不要加上程式碼區塊、前言、結語或任何說明。`;

function noteSnippet(note) {
  const content = String(note.content || '').trim();
  const clipped = content.length > MAX_NOTE_CHARS
    ? `${content.slice(0, MAX_NOTE_CHARS)}\n\n(筆記內容過長,以上為節錄)`
    : content;

  return `科目:${note.subject || '一般'}
標題:${note.title || '未命名筆記'}
筆記內容:
"""
${clipped}
"""`;
}

async function runModel(env, userPrompt, maxTokens) {
  if (!env.AI || typeof env.AI.run !== 'function') {
    throw new AiError(
      'AI_UNAVAILABLE',
      'AI 服務尚未設定,請確認 wrangler.toml 中的 [ai] 綁定',
      503
    );
  }

  const model = env.AI_MODEL || DEFAULT_MODEL;
  let timer;

  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new AiError('AI_TIMEOUT', 'AI 回應逾時,請稍後再試', 504));
      }, AI_TIMEOUT_MS);
    });

    const result = await Promise.race([
      env.AI.run(model, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
      timeout,
    ]);

    return getResponseText(result);
  } catch (error) {
    if (error instanceof AiError) throw error;
    console.error('Workers AI error:', error);
    throw new AiError(
      'AI_UNAVAILABLE',
      'AI 服務暫時無法使用,請稍後再試(本機開發請先執行 wrangler login)',
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

function getResponseText(result) {
  let text = '';

  if (typeof result === 'string') {
    text = result;
  } else if (result && typeof result.response === 'string') {
    text = result.response;
  } else if (result && result.response && typeof result.response === 'object') {
    text = JSON.stringify(result.response);
  } else if (result && result.result) {
    if (typeof result.result.response === 'string') {
      text = result.result.response;
    } else if (result.result.response && typeof result.result.response === 'object') {
      text = JSON.stringify(result.result.response);
    }
  } else if (result?.choices?.[0]?.message?.content) {
    text = result.choices[0].message.content;
  }

  text = String(text || '').trim();
  if (!text) {
    throw new AiError('AI_INVALID_OUTPUT', 'AI 回傳的格式不正確,請重試');
  }
  return text;
}

/** 從模型輸出中盡可能抽出完整的 JSON(允許前後有說明文字或 code fence)。 */
function extractJson(text) {
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  const directCandidates = [cleaned, stripTrailingCommas(cleaned)];
  for (const candidate of directCandidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 繼續嘗試從文字中抽 JSON。
    }
  }

  const starts = [];
  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (char === '{' || char === '[') starts.push(index);
    if (starts.length >= 12) break;
  }

  for (const start of starts) {
    const slice = extractBalanced(cleaned, start);
    if (!slice) continue;

    const candidates = [
      slice,
      stripTrailingCommas(slice),
      stripTrailingCommas(escapeControlChars(slice)),
    ];

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // 換下一種修補方式。
      }
    }
  }

  throw new AiError('AI_INVALID_OUTPUT', 'AI 回傳的格式不正確,請重試');
}

function extractBalanced(text, start) {
  const open = text[start];
  if (open !== '{' && open !== '[') return '';
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return '';
}

function stripTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, '$1');
}

/** 將字串內未跳脫的換行、Tab 轉成合法的 JSON escape。 */
function escapeControlChars(text) {
  let output = '';
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      if (escaped) {
        output += char;
        escaped = false;
      } else if (char === '\\') {
        output += char;
        escaped = true;
      } else if (char === '"') {
        output += char;
        inString = false;
      } else if (char === '\n') {
        output += '\\n';
      } else if (char === '\r') {
        output += '\\r';
      } else if (char === '\t') {
        output += '\\t';
      } else if (char.codePointAt(0) < 0x20) {
        output += `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`;
      } else {
        output += char;
      }
    } else {
      output += char;
      if (char === '"') inString = true;
    }
  }

  return output;
}

function cleanText(value, maxLength) {
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') return '';
  const text = value.replace(/\r\n/g, '\n').trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

function toAnswerIndex(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^[A-Da-d]$/.test(trimmed)) return trimmed.toUpperCase().charCodeAt(0) - 65;
    const number = Number(trimmed);
    if (Number.isInteger(number)) return number;
  }
  return -1;
}

function invalidOutput() {
  return new AiError('AI_INVALID_OUTPUT', 'AI 回傳的格式不正確,請重試');
}

/* ------------------------------ 摘要 ------------------------------ */

export async function summarizeNote(env, note) {
  const prompt = `${noteSnippet(note)}

請根據以上筆記完成兩件事:
1. 用 3 到 6 個重點寫出摘要,每個重點以「• 」開頭,重點之間換行;保留專有名詞與數字。
2. 抽出 5 到 8 個關鍵字或短語,不要加井號、標點或編號。

只輸出以下格式的 JSON 物件:
{"summary":"摘要文字,可用 \\n 換行","keywords":["關鍵字1","關鍵字2","關鍵字3"]}`;

  const text = await runModel(env, prompt, 900);
  const parsed = extractJson(text);
  const data = Array.isArray(parsed) ? parsed[0] : parsed;

  if (!data || typeof data !== 'object') throw invalidOutput();

  let summary = data.summary ?? data.content ?? data.text;
  if (Array.isArray(summary)) {
    summary = summary.map((item) => cleanText(item, 500)).filter(Boolean).join('\n');
  }
  summary = cleanText(summary, 4000);
  if (!summary) throw invalidOutput();

  let rawKeywords = data.keywords ?? data.key_points ?? [];
  if (typeof rawKeywords === 'string') {
    rawKeywords = rawKeywords.split(/[,、,;；\n]/);
  }
  if (!Array.isArray(rawKeywords)) rawKeywords = [];

  const keywords = [...new Set(
    rawKeywords
      .map((keyword) => cleanText(keyword, 30).replace(/^[#\-\s]+/, ''))
      .filter(Boolean)
  )].slice(0, 10);

  return { summary, keywords };
}

/* ------------------------------ 出題 ------------------------------ */

function normalizeQuestion(item) {
  if (!item || typeof item !== 'object') return null;

  const question = cleanText(item.question ?? item.title ?? item.prompt, 500);
  let options = Array.isArray(item.options)
    ? item.options
    : Array.isArray(item.choices)
      ? item.choices
      : [];

  options = options.map((option) => cleanText(option, 300)).filter(Boolean);
  if (!question || options.length < 4) return null;
  options = options.slice(0, 4);

  const answer = toAnswerIndex(
    item.answer ?? item.correct ?? item.correct_answer ?? item.answer_index
  );
  if (answer < 0 || answer > 3) return null;

  const explanation = cleanText(item.explanation ?? item.reason ?? item.analysis, 1000);

  return {
    question,
    options,
    answer,
    explanation: explanation || '本題未提供解析,請回到筆記確認相關概念。',
  };
}

export async function generateQuestions(env, note) {
  const prompt = `${noteSnippet(note)}

請根據以上筆記產生 3 道單選題,用來測驗是否理解內容:
- 每題正好 4 個選項,只有 1 個正確答案。
- 題目與選項都要使用繁體中文,選項長度盡量相近,不要出現「以上皆是」。
- 附上 1 到 2 句解析,說明為什麼答案正確。
- answer 欄位使用正確選項的索引,必須是 0、1、2 或 3。

只輸出以下格式的 JSON 陣列:
[{"question":"題目","options":["選項A","選項B","選項C","選項D"],"answer":0,"explanation":"解析"}]`;

  const text = await runModel(env, prompt, 1500);
  const parsed = extractJson(text);
  let items = parsed;

  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
    if (Array.isArray(parsed.questions)) items = parsed.questions;
    else if (parsed.question) items = [parsed];
  }

  if (!Array.isArray(items)) throw invalidOutput();

  const questions = items
    .map(normalizeQuestion)
    .filter(Boolean)
    .slice(0, 5);

  if (!questions.length) throw invalidOutput();
  return questions;
}

/* ------------------------------ 閃卡 ------------------------------ */

function normalizeCard(item) {
  if (!item || typeof item !== 'object') return null;

  const front = cleanText(item.front ?? item.question ?? item.term, 600);
  const back = cleanText(item.back ?? item.answer ?? item.definition, 1200);

  if (!front || !back) return null;
  return { front, back };
}

export async function generateCards(env, note) {
  const prompt = `${noteSnippet(note)}

請根據以上筆記製作 5 張複習閃卡:
- 正面放一個問題、名詞或提示,背面放簡潔的答案或解釋。
- 每張卡只考一個概念,避免整段照抄。
- 全部使用繁體中文,答案要能獨立看懂。

只輸出以下格式的 JSON 陣列:
[{"front":"正面內容","back":"背面內容"}]`;

  const text = await runModel(env, prompt, 1400);
  const parsed = extractJson(text);
  let items = parsed;

  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
    if (Array.isArray(parsed.cards)) items = parsed.cards;
    else if (parsed.front) items = [parsed];
  }

  if (!Array.isArray(items)) throw invalidOutput();

  const cards = items.map(normalizeCard).filter(Boolean).slice(0, 8);
  if (!cards.length) throw invalidOutput();
  return cards;
}
