// 원본(smok95/lotto)에서 전체 회차를 받아 검사한 뒤 v1/all.json, v1/recent.json을 쓴다.
//
//   node scripts/update.mjs            원본을 받아 갱신
//   node scripts/update.mjs --offline  받지 않고 기존 v1/all.json으로 다시 만들기만
//
// 종료 코드: 0 정상 / 1 받기·검사 실패 (아무 파일도 쓰지 않음) / 2 원본 갱신 지연 (파일 쓰기는 끝난 뒤)

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { recentRows, staleRound, toJsonLines, validateSource } from "./lib.mjs";

const SOURCE_URL = "https://smok95.github.io/lotto/results/all.json";
const TIMEOUT_MS = 30_000;
/** 첫 시도가 실패한 뒤 다시 받기 전에 기다리는 시간 (점점 늘림) */
const RETRY_DELAYS_MS = [10_000, 30_000];
/** 검사 문제를 화면에 보여 주는 최대 개수 */
const MAX_PRINTED_PROBLEMS = 30;

const ALL_PATH = fileURLToPath(new URL("../v1/all.json", import.meta.url));
const RECENT_PATH = fileURLToPath(new URL("../v1/recent.json", import.meta.url));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readTextOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function download() {
  const attempts = RETRY_DELAYS_MS.length + 1;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = JSON.parse(await res.text());
      console.log(`받기 성공 (${attempt}/${attempts}번째 시도): ${SOURCE_URL}`);
      return data;
    } catch (err) {
      const reason = err?.name === "TimeoutError" ? `${TIMEOUT_MS / 1000}초 안에 끝나지 않음` : err?.message ?? String(err);
      if (attempt >= attempts) throw new Error(`받기 실패 (${attempts}번 모두 실패): ${reason}`);
      const wait = RETRY_DELAYS_MS[attempt - 1];
      console.log(`받기 실패 (${attempt}/${attempts}번째 시도): ${reason} → ${wait / 1000}초 뒤 다시 받기`);
      await sleep(wait);
    }
  }
}

/** 바뀐 파일만 임시 파일에 쓴 뒤 한꺼번에 바꿔 넣는다 */
async function writeChanged(files) {
  const changed = files.filter((f) => f.next !== f.current);
  const tmp = (f) => `${f.path}.tmp`;
  try {
    for (const f of changed) await writeFile(tmp(f), f.next, "utf8");
    for (const f of changed) await rename(tmp(f), f.path);
  } catch (err) {
    await Promise.all(changed.map((f) => rm(tmp(f), { force: true })));
    throw err;
  }
  return new Set(changed.map((f) => f.path));
}

function lastRound(rows) {
  return rows.length > 0 ? rows[rows.length - 1].draw_no : 0;
}

async function main(args) {
  const unknown = args.filter((a) => a !== "--offline");
  if (unknown.length > 0) {
    console.error(`알 수 없는 인자: ${unknown.join(" ")}\n사용법: node scripts/update.mjs [--offline]`);
    return 1;
  }
  const offline = args.includes("--offline");
  const now = new Date();

  const allText = await readTextOrNull(ALL_PATH);
  if (allText === null) {
    console.error("v1/all.json이 없어요. 비교 기준이 없으면 갱신하지 않아요.");
    return 1;
  }
  const prev = JSON.parse(allText);

  let next;
  if (offline) {
    console.log("--offline: 받지 않고 기존 v1/all.json으로 다시 만들어요");
    next = JSON.parse(allText);
  } else {
    try {
      next = await download();
    } catch (err) {
      console.error(err.message);
      console.error("아무 파일도 쓰지 않았어요.");
      return 1;
    }
  }

  const { problems, changed } = validateSource(next, prev, now);
  if (problems.length > 0) {
    console.error(`검사 실패: 문제 ${problems.length}개`);
    for (const p of problems.slice(0, MAX_PRINTED_PROBLEMS)) console.error(`  - ${p}`);
    if (problems.length > MAX_PRINTED_PROBLEMS) console.error(`  … 외 ${problems.length - MAX_PRINTED_PROBLEMS}개`);
    console.error("아무 파일도 쓰지 않았어요.");
    return 1;
  }

  const files = [
    { path: ALL_PATH, label: "v1/all.json", current: allText, next: toJsonLines(next) },
    { path: RECENT_PATH, label: "v1/recent.json", current: await readTextOrNull(RECENT_PATH), next: toJsonLines(recentRows(next)) },
  ];
  const written = await writeChanged(files);

  const before = lastRound(prev);
  const after = lastRound(next);
  const added = next.filter((r) => r.draw_no > before).map((r) => `${r.draw_no}회`);
  console.log(`이전 마지막 회차: ${before}회`);
  console.log(`이후 마지막 회차: ${after}회`);
  console.log(`새로 들어온 회차: ${added.length > 0 ? added.join(", ") : "없음"}`);
  console.log(
    `다른 값만 바뀐 지난 회차: ${changed.length > 0 ? changed.map((c) => `${c.draw_no}회(${c.fields.join(", ")})`).join(", ") : "없음"}`,
  );
  for (const f of files) console.log(`${f.label}: ${written.has(f.path) ? "바뀜 → 다시 씀" : "그대로"}`);

  const stale = staleRound(after, now);
  if (stale !== null) {
    console.error(`원본 갱신 지연: ${stale}회가 아직 없어요`);
    return 2;
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(`예상하지 못한 오류: ${err?.stack ?? err}`);
    console.error("아무 파일도 쓰지 않았거나 쓰는 도중 멈췄어요. v1/ 상태를 확인하세요.");
    process.exitCode = 1;
  },
);
