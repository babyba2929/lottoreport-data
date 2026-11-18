# CLAUDE.md — lottoreport-data

이 저장소에서 작업할 때의 기준 문서입니다. 작업 전에 끝까지 읽고 따릅니다.

## 목적

앱 **로또리포트 AI**(별도 비공개 저장소)가 최신 회차를 받아 가는 공개 정적 JSON 저장소입니다.
GitHub Pages(https://babyba2929.github.io/lottoreport-data/)로 공개합니다.

- 앱은 `v1/recent.json`만 받습니다. 앱 쪽 변환·검사는 앱 저장소에서 합니다. 이 저장소에서 앱 코드를 만들지 않습니다.
- 원본: 공개 저장소 smok95/lotto의 https://smok95.github.io/lotto/results/all.json
- `v1/all.json`의 1~1250회는 앱에 내장된 것과 같은 검증 완료본(smok95 원본 그대로)이고, 매주 갱신할 때 지난 회차가 바뀌지 않았는지 비교하는 기준입니다.

## 파일 구조

```
v1/all.json                   1회부터 전체 (update.mjs만 씀)
v1/recent.json                마지막 20회, 앱이 받아 가는 파일 (update.mjs만 씀)
scripts/lib.mjs               순수 함수: roundDate, validateSource, recentRows, toJsonLines, staleRound
scripts/update.mjs            원본 받기 → 검사 → v1/ 쓰기 → 갱신 지연 검사
scripts/check.mjs             lib.mjs 검증 (인라인 예시 + 실제 v1/all.json)
.github/workflows/update.yml  예약 갱신 + Pages 배포
.nojekyll                     건드리지 않음
README.md                     공개 안내 (한국어)
CLAUDE.md                     이 문서
```

Node 내장 모듈만 씁니다(Node 22). `package.json`도 npm 패키지도 없습니다.

## 명령

```sh
node scripts/check.mjs              # lib 검증. 실패하면 종료 코드 1
node scripts/update.mjs             # 원본을 받아 갱신 (시간 제한 30초, 실패하면 10초·30초 뒤 다시, 총 3번)
node scripts/update.mjs --offline   # 받지 않고 기존 v1/all.json으로 v1/ 파일을 다시 만들기만
```

`update.mjs` 종료 코드

| 코드 | 뜻 | 파일 |
| --- | --- | --- |
| 0 | 정상 | 내용이 바뀐 파일만 다시 씀 |
| 1 | 받기 실패·검사 실패·잘못된 인자 | 아무 파일도 쓰지 않음 |
| 2 | 원본 갱신 지연 (`원본 갱신 지연: ○○회가 아직 없어요`) | 쓰기는 끝낸 뒤 알림 |

출력: 이전·이후 마지막 회차, 새로 들어온 회차, 다른 값만 바뀐 지난 회차, 파일별 다시 씀/그대로.

## 검사 규칙 (`validateSource(next, prev, now)`)

`{ problems, changed }`를 돌려줍니다. `problems`가 빈 배열이면 통과입니다.

- 배열이고 비어 있지 않음. 1회부터 빠짐없이 연속, 중복 없음, 오름차순
- 회차마다
  - `draw_no`: 양의 정수
  - `numbers`: 서로 다른 1~45 정수 6개 (정렬은 요구하지 않음)
  - `bonus_no`: 1~45 정수, `numbers`와 겹치지 않음
  - `date`: 앞 10자리 = `roundDate(draw_no)` (1회 = 2002-12-07, 매주 토요일)
  - `divisions`: 없음·`null`·빈 배열·5개 배열 중 하나. 5개 배열이면 각각 `{}` 또는 `prize`가 양의 정수인 객체
- 마지막 회차 추첨일이 `now`의 KST 날짜보다 미래가 아님
- 회차 수가 `prev`보다 줄지 않음
- `prev`에 있던 회차는 그대로 있어야 하고, `numbers`(정렬 후 비교)·`bonus_no`·`date`가 같아야 함
- 위 세 값은 같고 `divisions` 등 다른 값만 바뀐 지난 회차는 문제가 아니라 `changed`(`{ draw_no, fields }`)로 따로 돌려줌

갱신 지연(`staleRound(latestRound, now)`): 추첨일(토) + 2일, 즉 월요일 00:00 KST가 지난 회차 중 가장 최근 회차가 `latestRound`보다 크면 그 회차, 아니면 `null`.

출력 형식(`toJsonLines`): `"[\n"` + 회차 하나당 한 줄(공백 없는 `JSON.stringify`)을 `",\n"`로 이음 + `"\n]\n"`. 원본 객체를 정렬·키 변경 없이 그대로 씁니다. `recent.json`은 마지막 `RECENT_COUNT`(20)회, 오름차순.

## 워크플로 (`.github/workflows/update.yml`)

- 트리거: `workflow_dispatch`, `push`(main), `schedule`(UTC) `17 13 * * 6`(토 22:17 KST)·`17 0 * * 0`(일 09:17)·`17 0 * * 1`(월 09:17)
- `update` job (schedule·workflow_dispatch, main에서만): `check.mjs` → `update.mjs` → 바뀐 파일이 있으면 github-actions[bot]이 `data: ○○회 반영`으로 커밋해 main에 push
  - 종료 코드 1이면 커밋·배포 없이 실패
  - 종료 코드 2면 바뀐 파일을 커밋·배포한 뒤 `stale-alert` job이 실패로 끝냄 (알림용)
- `deploy` job: Pages "GitHub Actions" 방식으로 `v1/` 폴더만 올림 → `…/lottoreport-data/v1/recent.json`
  - GITHUB_TOKEN으로 push한 커밋은 다른 실행을 깨우지 않으므로 같은 실행에서 새 커밋 기준으로 배포
  - 갱신 job이 성공하면 바뀐 파일이 없어도 배포 (앞선 배포가 실패했어도 다음 실행에서 맞춰짐)
  - push(main)일 때는 배포만
- 권한은 job별로만: `update` = `contents: write`, `deploy` = `contents: read`·`pages: write`·`id-token: write`
- `concurrency`로 한 번에 하나만 실행
- 공식 `actions/*`만 사용: checkout@v6, setup-node@v6(Node 22), upload-pages-artifact@v4, deploy-pages@v4

## 규칙

- **v1/ 데이터는 손으로 고치지 않습니다.** `v1/all.json`, `v1/recent.json`은 `scripts/update.mjs`만 씁니다.
- **v1/ 형식은 바꾸지 않습니다.** 이미 설치된 앱이 읽습니다. 형식을 바꿔야 하면 `v2/`를 새로 만듭니다.
- **패키지를 추가하지 않습니다.** npm 패키지, `package.json`을 만들지 않습니다. Node 내장 모듈만 씁니다.
- `.nojekyll`은 건드리지 않습니다.
- **README 문구**: 한국어. 무엇인지(로또리포트 AI 앱이 받아 가는 공개 추첨 결과 자료), 파일·주소, 형식, 갱신 일정, 출처 smok95/lotto, "공개된 추첨 결과를 모은 자료라 오류가 있을 수 있어요"를 담습니다.
  - 쓰지 않을 표현: 예측·적중·당첨 확률·보장·공식·특허, 복권 구매·판매점 안내, 동행복권 사이트 링크
- **작업 브랜치 → PR.** main에 직접 push하지 않습니다. 워크플로의 데이터 커밋(`data: ○○회 반영`)만 예외입니다.
- 스크립트를 고치면 `node scripts/check.mjs`와 `node scripts/update.mjs --offline`(두 번째 실행에서 바뀐 파일 없음)을 확인합니다.

## 작업 보고 형식

작업을 마치면 아래 4항목으로 보고합니다.

1. 변경·추가 파일 목록
2. 실행한 명령과 결과 (검증 통과 여부)
3. 지시와 다르게 한 부분 (없으면 "없음")
4. 사용자가 직접 해야 할 일
