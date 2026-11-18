// scripts/lib.mjs 검증: node scripts/check.mjs (테스트 도구 없이 작은 인라인 예시만 사용)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RECENT_COUNT, recentRows, roundDate, staleRound, toJsonLines, validateSource } from "./lib.mjs";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(err?.message ?? err).split("\n").join("\n     ")}`);
  }
}

// ── 예시 자료 ────────────────────────────────────────────────
const clone = (v) => structuredClone(v);

/** 형식이 맞는 n회차 */
function row(n) {
  const base = ((n * 7) % 39) + 1; // 1~39
  return {
    draw_no: n,
    numbers: [base + 6, base, base + 3, base + 1, base + 5, base + 2], // 일부러 정렬 안 함
    bonus_no: base + 4,
    date: `${roundDate(n)}T00:00:00Z`,
    divisions: [{ prize: 2000000000, winners: 1 }, {}, { prize: 1000000, winners: 10 }, { prize: 50000, winners: 100 }, { prize: 5000, winners: 1000 }],
    total_sales_amount: 100000000,
    winners_combination: {},
  };
}
const rows = (n) => Array.from({ length: n }, (_, i) => row(i + 1));

const PREV = rows(5);
const NEXT = rows(6);
/** 6회(2003-01-11, 토) 다음 날 정오 KST */
const NOW = new Date("2003-01-12T12:00:00+09:00");

/** 문제 목록에 pattern이 들어 있는지 확인 */
function expectProblem(result, pattern) {
  assert.ok(
    result.problems.some((p) => pattern.test(p)),
    `문제 ${pattern}가 잡히지 않음. 실제: ${JSON.stringify(result.problems)}`,
  );
}
function expectPass(result) {
  assert.deepEqual(result.problems, [], `통과해야 하는데 문제가 있음: ${JSON.stringify(result.problems)}`);
}
function withRow(list, n, patch) {
  const out = clone(list);
  out[n - 1] = { ...out[n - 1], ...patch };
  return out;
}

// ── roundDate ────────────────────────────────────────────────
test("roundDate: 1회 = 2002-12-07, 2회 = 2002-12-14, 1250회 = 2026-11-14", () => {
  assert.equal(roundDate(1), "2002-12-07");
  assert.equal(roundDate(2), "2002-12-14");
  assert.equal(roundDate(1250), "2026-11-14");
  assert.equal(new Date(`${roundDate(1251)}T00:00:00Z`).getUTCDay(), 6);
});

// ── validateSource: 통과 ─────────────────────────────────────
test("통과: 새 회차 1개 추가", () => {
  const r = validateSource(NEXT, PREV, NOW);
  expectPass(r);
  assert.deepEqual(r.changed, []);
});

test("통과: divisions 없음·null·빈 배열", () => {
  const next = clone(NEXT);
  delete next[0].divisions;
  next[1].divisions = null;
  next[2].divisions = [];
  expectPass(validateSource(next, null, NOW));
});

test("통과: 추첨일 당일(KST)인 회차는 미래가 아님", () => {
  // 6회 추첨일 2003-01-11 00:00 KST = 2003-01-10T15:00Z
  expectPass(validateSource(NEXT, PREV, new Date("2003-01-10T15:00:00Z")));
});

test("validateSource는 입력을 바꾸지 않음", () => {
  const next = clone(NEXT);
  const prev = clone(PREV);
  validateSource(next, prev, NOW);
  assert.deepEqual(next, NEXT);
  assert.deepEqual(prev, PREV);
});

// ── validateSource: 잡아야 할 예 ─────────────────────────────
test("잡기: 배열이 아님", () => {
  expectProblem(validateSource({ draw_no: 1 }, PREV, NOW), /배열이 아님/);
});

test("잡기: 빈 배열", () => {
  expectProblem(validateSource([], null, NOW), /하나도 없음/);
});

test("잡기: 빠진 회차", () => {
  const next = NEXT.filter((r) => r.draw_no !== 3);
  expectProblem(validateSource(next, null, NOW), /빠진 회차: 3회/);
});

test("잡기: 1회가 없음", () => {
  expectProblem(validateSource(NEXT.slice(1), null, NOW), /빠진 회차: 1회/);
});

test("잡기: 중복 회차", () => {
  const next = [...clone(NEXT.slice(0, 3)), clone(NEXT[2]), ...clone(NEXT.slice(3))];
  expectProblem(validateSource(next, null, NOW), /중복 회차: 3회/);
});

test("잡기: 순서가 어긋남", () => {
  const next = clone(NEXT);
  [next[1], next[2]] = [next[2], next[1]];
  expectProblem(validateSource(next, null, NOW), /오름차순/);
});

test("잡기: draw_no가 양의 정수가 아님", () => {
  expectProblem(validateSource(withRow(NEXT, 6, { draw_no: "6" }), null, NOW), /draw_no가 양의 정수가 아님/);
});

test("잡기: 추첨일 어긋남", () => {
  const next = withRow(NEXT, 4, { date: "2002-12-29T00:00:00Z" });
  expectProblem(validateSource(next, null, NOW), /4회: 추첨일/);
});

test("잡기: 번호 5개", () => {
  expectProblem(validateSource(withRow(NEXT, 6, { numbers: [1, 2, 3, 4, 5] }), null, NOW), /6회: numbers가 6개/);
});

test("잡기: 번호 46", () => {
  expectProblem(validateSource(withRow(NEXT, 6, { numbers: [1, 2, 3, 4, 5, 46], bonus_no: 7 }), null, NOW), /6회: numbers에 1~45/);
});

test("잡기: 번호 0·소수·문자열", () => {
  expectProblem(validateSource(withRow(NEXT, 6, { numbers: [0, 2, 3, 4, 5, 6], bonus_no: 7 }), null, NOW), /1~45/);
  expectProblem(validateSource(withRow(NEXT, 6, { numbers: [1.5, 2, 3, 4, 5, 6], bonus_no: 7 }), null, NOW), /1~45/);
  expectProblem(validateSource(withRow(NEXT, 6, { numbers: ["1", 2, 3, 4, 5, 6], bonus_no: 7 }), null, NOW), /1~45/);
});

test("잡기: 번호 중복", () => {
  expectProblem(validateSource(withRow(NEXT, 6, { numbers: [1, 2, 3, 4, 5, 5], bonus_no: 7 }), null, NOW), /6회: numbers에 같은 번호/);
});

test("잡기: 보너스 번호 범위", () => {
  expectProblem(validateSource(withRow(NEXT, 6, { bonus_no: 46 }), null, NOW), /6회: bonus_no가 1~45/);
});

test("잡기: 보너스 겹침", () => {
  const bonus = NEXT[5].numbers[0];
  expectProblem(validateSource(withRow(NEXT, 6, { bonus_no: bonus }), null, NOW), /6회: bonus_no \d+가 numbers와 겹침/);
});

test("잡기: divisions 형식", () => {
  const four = NEXT[5].divisions.slice(0, 4);
  expectProblem(validateSource(withRow(NEXT, 6, { divisions: four }), null, NOW), /6회: divisions가 빈 배열이나 5개/);
  expectProblem(validateSource(withRow(NEXT, 6, { divisions: {} }), null, NOW), /6회: divisions가 빈 배열이나 5개/);
  const zero = clone(NEXT[5].divisions);
  zero[2] = { prize: 0, winners: 0 };
  expectProblem(validateSource(withRow(NEXT, 6, { divisions: zero }), null, NOW), /6회: divisions 3등/);
  const str = clone(NEXT[5].divisions);
  str[0] = { prize: "2000000000", winners: 1 };
  expectProblem(validateSource(withRow(NEXT, 6, { divisions: str }), null, NOW), /6회: divisions 1등/);
  const nul = clone(NEXT[5].divisions);
  nul[4] = null;
  expectProblem(validateSource(withRow(NEXT, 6, { divisions: nul }), null, NOW), /6회: divisions 5등/);
});

test("잡기: 미래 회차 (KST 날짜 기준)", () => {
  // 6회 추첨일 2003-01-11 00:00 KST 직전
  expectProblem(validateSource(NEXT, PREV, new Date("2003-01-10T14:59:59Z")), /미래 회차: 6회/);
});

test("잡기: 회차 수 감소", () => {
  expectProblem(validateSource(rows(4), PREV, NOW), /회차 수가 줄어듦: 5개 → 4개/);
});

test("잡기: 지난 회차 번호 변경", () => {
  const next = withRow(NEXT, 2, { numbers: [1, 2, 3, 4, 5, 6], bonus_no: 7 });
  const prev = withRow(PREV, 2, { numbers: [1, 2, 3, 4, 5, 45], bonus_no: 7 });
  const r = validateSource(next, prev, NOW);
  expectProblem(r, /지난 회차 변경: 2회 번호/);
  assert.deepEqual(r.changed, []);
});

test("잡기: 지난 회차 보너스·추첨일 변경", () => {
  const prev = withRow(PREV, 3, { bonus_no: 45 });
  expectProblem(validateSource(NEXT, prev, NOW), /지난 회차 변경: 3회 보너스/);
  const prev2 = withRow(PREV, 3, { date: "2002-12-21T09:00:00Z" });
  expectProblem(validateSource(NEXT, prev2, NOW), /지난 회차 변경: 3회 추첨일/);
});

test("문제 아님: 지난 회차 divisions·번호 순서만 바뀜 → changed로 따로", () => {
  const prev = clone(PREV);
  prev[1].divisions = [];
  prev[3].numbers = [...prev[3].numbers].sort((a, b) => a - b);
  const r = validateSource(NEXT, prev, NOW);
  expectPass(r);
  assert.deepEqual(r.changed, [
    { draw_no: 2, fields: ["divisions"] },
    { draw_no: 4, fields: ["numbers"] },
  ]);
});

// ── staleRound ───────────────────────────────────────────────
test("staleRound: 1250회(2026-11-14 토) 마감 경계", () => {
  assert.equal(staleRound(1249, new Date("2026-11-15T23:59:00+09:00")), null, "일요일 23:59 KST → null");
  assert.equal(staleRound(1249, new Date("2026-11-15T23:59:59.999+09:00")), null);
  assert.equal(staleRound(1249, new Date("2026-11-16T00:00:00+09:00")), 1250, "월요일 00:00 KST → 1250");
  assert.equal(staleRound(1250, new Date("2026-11-16T00:00:00+09:00")), null);
});

test("staleRound: 토 22:17·일 09:17·월 09:17 실행 시점", () => {
  // 1251회 = 2026-11-21(토)
  assert.equal(staleRound(1250, new Date("2026-11-21T22:17:00+09:00")), null);
  assert.equal(staleRound(1250, new Date("2026-11-22T09:17:00+09:00")), null);
  assert.equal(staleRound(1250, new Date("2026-11-23T09:17:00+09:00")), 1251);
  assert.equal(staleRound(1251, new Date("2026-11-23T09:17:00+09:00")), null);
  assert.equal(staleRound(1249, new Date("2026-11-23T09:17:00+09:00")), 1251, "가장 최근 회차를 돌려줌");
});

test("staleRound: 1회 마감 전", () => {
  assert.equal(staleRound(0, new Date("2002-12-08T23:59:00+09:00")), null);
  assert.equal(staleRound(0, new Date("2002-12-09T00:00:00+09:00")), 1);
});

// ── toJsonLines ──────────────────────────────────────────────
test("toJsonLines: 형식·결정성·원본 그대로", () => {
  const input = [
    { draw_no: 1, numbers: [3, 1, 2], z: { b: 1, a: 2 } },
    { a: 1, draw_no: 2 },
  ];
  const before = clone(input);
  const out = toJsonLines(input);
  assert.equal(out, '[\n{"draw_no":1,"numbers":[3,1,2],"z":{"b":1,"a":2}},\n{"a":1,"draw_no":2}\n]\n');
  assert.equal(toJsonLines(input), out, "같은 입력 = 같은 출력");
  assert.equal(toJsonLines(clone(input)), out);
  assert.deepEqual(input, before, "입력을 바꾸지 않음");
  assert.deepEqual(JSON.parse(out), input);
});

// ── recentRows ───────────────────────────────────────────────
test("recentRows: 마지막 20회 오름차순", () => {
  assert.equal(RECENT_COUNT, 20);
  const all = rows(25);
  const recent = recentRows(all);
  assert.equal(recent.length, 20);
  assert.deepEqual(recent.map((r) => r.draw_no), Array.from({ length: 20 }, (_, i) => i + 6));
  assert.equal(recent[0], all[5], "원본 객체를 그대로 씀");
  assert.equal(all.length, 25, "입력을 바꾸지 않음");
});

test("recentRows: 20회보다 적으면 전부, 순서가 섞여 있어도 오름차순", () => {
  assert.deepEqual(recentRows(rows(3)).map((r) => r.draw_no), [1, 2, 3]);
  const shuffled = [row(22), row(3), ...rows(21).slice(3), row(1), row(2)];
  assert.deepEqual(recentRows(shuffled).map((r) => r.draw_no), Array.from({ length: 20 }, (_, i) => i + 3));
});

// ── 실제 자료 ────────────────────────────────────────────────
const allText = readFileSync(fileURLToPath(new URL("../v1/all.json", import.meta.url)), "utf8");
const all = JSON.parse(allText);

// 기준 시각은 2026-11-19. 다만 워크플로가 이후 회차(1251회 = 2026-11-21 …)를 더하면 고정 날짜로는
// "미래 회차"가 되어 매주 검사가 막히므로, 지금이 더 늦으면 지금을 쓴다.
const REAL_NOW = new Date(Math.max(Date.parse("2026-11-19T00:00:00+09:00"), Date.now()));

test(`실제 v1/all.json: validateSource(자기 자신, 자기 자신, ${REAL_NOW.toISOString()}) 통과`, () => {
  const r = validateSource(all, all, REAL_NOW);
  expectPass(r);
  assert.deepEqual(r.changed, []);
  assert.equal(all[0].draw_no, 1);
  assert.ok(all.length >= 1250);
});

test("실제 v1/all.json: 2026-11-13(1250회 전날)이면 미래 회차로 잡음", () => {
  const r = validateSource(all.slice(0, 1250), all.slice(0, 1250), new Date("2026-11-13T12:00:00+09:00"));
  expectProblem(r, /미래 회차: 1250회/);
});

console.log(`\n${passed}개 통과, ${failed}개 실패`);
if (failed > 0) process.exitCode = 1;
