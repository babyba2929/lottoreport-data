// 로또리포트 데이터 갱신용 순수 함수 모음 (Node 내장 기능만 사용, 파일·네트워크 접근 없음)

/** recent.json에 담는 회차 수 */
export const RECENT_COUNT = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 1회 추첨일 2002-12-07(토) 00:00 UTC */
const FIRST_DRAW_UTC_MS = Date.UTC(2002, 11, 7);
/** 검사 문제 메시지에 늘어놓는 회차 수 상한 */
const LIST_LIMIT = 10;

function toMs(now) {
  const ms = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(ms)) throw new TypeError(`now가 올바른 시각이 아님: ${String(now)}`);
  return ms;
}

/** now 시각의 한국(KST) 날짜 "YYYY-MM-DD" */
export function kstDate(now) {
  return new Date(toMs(now) + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** n회 추첨일 "YYYY-MM-DD" (1회 = 2002-12-07, 매주 토요일) */
export function roundDate(n) {
  return new Date(FIRST_DRAW_UTC_MS + (n - 1) * WEEK_MS).toISOString().slice(0, 10);
}

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isBall(v) {
  return Number.isInteger(v) && v >= 1 && v <= 45;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function fmtList(nums, total = nums.length) {
  const shown = nums.slice(0, LIST_LIMIT).map((n) => `${n}회`).join(", ");
  return total > LIST_LIMIT ? `${shown} 외 ${total - LIST_LIMIT}개 (총 ${total}개)` : shown;
}

function sortedKey(numbers) {
  return Array.isArray(numbers)
    ? JSON.stringify([...numbers].sort((a, b) => a - b))
    : JSON.stringify(numbers);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 회차 하나의 형식 문제 목록 */
function rowProblems(row, index) {
  if (!isPlainObject(row)) return [`${index + 1}번째 항목: 객체가 아님`];

  const label = isPosInt(row.draw_no) ? `${row.draw_no}회` : `${index + 1}번째 항목`;
  const out = [];

  if (!isPosInt(row.draw_no)) out.push(`${label}: draw_no가 양의 정수가 아님 (${JSON.stringify(row.draw_no)})`);

  const nums = row.numbers;
  if (!Array.isArray(nums) || nums.length !== 6) {
    out.push(`${label}: numbers가 6개짜리 배열이 아님 (${JSON.stringify(nums)})`);
  } else if (!nums.every(isBall)) {
    out.push(`${label}: numbers에 1~45 정수가 아닌 값이 있음 (${JSON.stringify(nums)})`);
  } else if (new Set(nums).size !== 6) {
    out.push(`${label}: numbers에 같은 번호가 있음 (${JSON.stringify(nums)})`);
  }

  if (!isBall(row.bonus_no)) {
    out.push(`${label}: bonus_no가 1~45 정수가 아님 (${JSON.stringify(row.bonus_no)})`);
  } else if (Array.isArray(nums) && nums.includes(row.bonus_no)) {
    out.push(`${label}: bonus_no ${row.bonus_no}가 numbers와 겹침`);
  }

  if (typeof row.date !== "string") {
    out.push(`${label}: date가 문자열이 아님 (${JSON.stringify(row.date)})`);
  } else if (isPosInt(row.draw_no) && row.date.slice(0, 10) !== roundDate(row.draw_no)) {
    out.push(`${label}: 추첨일 ${JSON.stringify(row.date)}이 ${roundDate(row.draw_no)}와 다름`);
  }

  const div = row.divisions;
  if (div !== undefined && div !== null) {
    if (!Array.isArray(div) || (div.length !== 0 && div.length !== 5)) {
      out.push(`${label}: divisions가 빈 배열이나 5개짜리 배열이 아님`);
    } else {
      div.forEach((d, i) => {
        const ok = isPlainObject(d) && (Object.keys(d).length === 0 || isPosInt(d.prize));
        if (!ok) out.push(`${label}: divisions ${i + 1}등이 {} 또는 prize가 양의 정수인 객체가 아님 (${JSON.stringify(d)})`);
      });
    }
  }

  return out;
}

/** 두 회차 객체에서 값이 다른 키 목록 (값은 같은데 키 순서만 다르면 ["(키 순서)"]) */
function changedFields(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const fields = keys.filter((k) => !sameJson(a[k], b[k]));
  return fields.length > 0 ? fields : ["(키 순서)"];
}

/**
 * 받은 원본(next)을 기존 자료(prev)·현재 시각(now)과 견줘 검사한다.
 * @param {unknown} next 새로 받은 회차 배열
 * @param {unknown[] | null | undefined} prev 기존 v1/all.json 회차 배열 (없으면 비교 생략)
 * @param {Date | number} now 현재 시각
 * @returns {{ problems: string[], changed: { draw_no: number, fields: string[] }[] }}
 *   problems가 빈 배열이면 통과. changed는 번호·보너스·추첨일은 그대로이고 다른 값만 바뀐 지난 회차.
 */
export function validateSource(next, prev, now) {
  const problems = [];
  const changed = [];
  const today = kstDate(now);

  if (!Array.isArray(next)) {
    return { problems: ["원본이 배열이 아님"], changed };
  }
  if (next.length === 0) problems.push("원본에 회차가 하나도 없음");

  // 회차마다 형식 검사
  next.forEach((row, i) => problems.push(...rowProblems(row, i)));

  // 1회부터 빠짐없이 연속, 중복 없음, 오름차순
  const count = new Map();
  for (const row of next) {
    const no = isPlainObject(row) ? row.draw_no : undefined;
    if (isPosInt(no)) count.set(no, (count.get(no) ?? 0) + 1);
  }
  const dups = [...count].filter(([, c]) => c > 1).map(([no]) => no).sort((a, b) => a - b);
  if (dups.length > 0) problems.push(`중복 회차: ${fmtList(dups)}`);

  let max = 0;
  for (const no of count.keys()) if (no > max) max = no;
  const missingTotal = max - count.size;
  if (missingTotal > 0) {
    const missing = [];
    for (let no = 1; no <= max && missing.length < LIST_LIMIT; no++) if (!count.has(no)) missing.push(no);
    problems.push(`빠진 회차: ${fmtList(missing, missingTotal)}`);
  }
  if (dups.length === 0 && missingTotal === 0) {
    const misplaced = next.findIndex((row, i) => !isPlainObject(row) || row.draw_no !== i + 1);
    if (misplaced !== -1) problems.push(`회차가 1회부터 오름차순으로 놓여 있지 않음 (${misplaced + 1}번째 항목)`);
  }

  // 마지막 회차 추첨일이 오늘(KST)보다 미래가 아님
  if (max > 0 && roundDate(max) > today) {
    problems.push(`미래 회차: ${max}회 추첨일 ${roundDate(max)}이 오늘(KST ${today})보다 뒤`);
  }

  // 기존 자료와 비교
  if (prev !== undefined && prev !== null) {
    if (!Array.isArray(prev)) {
      problems.push("비교 기준(prev)이 배열이 아님");
    } else {
      if (next.length < prev.length) problems.push(`회차 수가 줄어듦: ${prev.length}개 → ${next.length}개`);

      const nextByNo = new Map();
      for (const row of next) {
        if (isPlainObject(row) && isPosInt(row.draw_no) && !nextByNo.has(row.draw_no)) nextByNo.set(row.draw_no, row);
      }
      const gone = [];
      for (const old of prev) {
        if (!isPlainObject(old) || !isPosInt(old.draw_no)) continue;
        const no = old.draw_no;
        const cur = nextByNo.get(no);
        if (!cur) {
          gone.push(no);
          continue;
        }
        const diffs = [];
        if (sortedKey(old.numbers) !== sortedKey(cur.numbers)) {
          diffs.push(`번호 ${JSON.stringify(old.numbers)} → ${JSON.stringify(cur.numbers)}`);
        }
        if (!sameJson(old.bonus_no, cur.bonus_no)) {
          diffs.push(`보너스 ${JSON.stringify(old.bonus_no)} → ${JSON.stringify(cur.bonus_no)}`);
        }
        if (!sameJson(old.date, cur.date)) {
          diffs.push(`추첨일 ${JSON.stringify(old.date)} → ${JSON.stringify(cur.date)}`);
        }
        if (diffs.length > 0) {
          problems.push(`지난 회차 변경: ${no}회 ${diffs.join(", ")}`);
        } else if (!sameJson(old, cur)) {
          changed.push({ draw_no: no, fields: changedFields(old, cur) });
        }
      }
      if (gone.length > 0) problems.push(`지난 회차가 없어짐: ${fmtList(gone)}`);
    }
  }

  return { problems, changed };
}

/** 마지막 RECENT_COUNT회 (회차 오름차순, 입력은 바꾸지 않음) */
export function recentRows(rows) {
  return [...rows].sort((a, b) => a.draw_no - b.draw_no).slice(-RECENT_COUNT);
}

/** "[\n" + 회차 하나당 한 줄 + "\n]\n". 객체는 받은 그대로 직렬화한다 (정렬·키 변경 없음). */
export function toJsonLines(rows) {
  return "[\n" + rows.map((row) => JSON.stringify(row)).join(",\n") + "\n]\n";
}

/**
 * 원본 갱신 지연 검사.
 * 추첨일(토) + 2일, 즉 월요일 00:00 KST가 지난 회차 중 가장 최근 회차가 latestRound보다 크면 그 회차, 아니면 null.
 */
export function staleRound(latestRound, now) {
  // n회의 마감 = 추첨일 00:00 UTC + 2일 - 9시간 (= 월요일 00:00 KST)
  const firstDeadline = FIRST_DRAW_UTC_MS + 2 * DAY_MS - KST_OFFSET_MS;
  const t = toMs(now);
  if (t < firstDeadline) return null;
  const due = Math.floor((t - firstDeadline) / WEEK_MS) + 1;
  return due > (latestRound ?? 0) ? due : null;
}
