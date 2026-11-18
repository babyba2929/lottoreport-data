# lottoreport-data

**로또리포트 AI** 앱이 받아 가는 공개 추첨 결과 자료입니다.
회차별 추첨 번호와 등위별 금액·인원을 JSON 파일로 GitHub Pages에 올려 둡니다.

> 공개된 추첨 결과를 모은 자료라 오류가 있을 수 있어요.

## 파일과 주소

| 파일 | 주소 | 내용 |
| --- | --- | --- |
| `v1/recent.json` | https://babyba2929.github.io/lottoreport-data/v1/recent.json | 최근 20회 |
| `v1/all.json` | https://babyba2929.github.io/lottoreport-data/v1/all.json | 1회부터 최근 회차까지 전체 |

## 형식

두 파일 모두 JSON 배열이고, 회차 오름차순으로 한 줄에 한 회차씩 들어 있습니다.

```json
[
{"draw_no":1250,"numbers":[1,5,18,23,27,28],"bonus_no":8,"date":"2026-11-14T00:00:00Z","divisions":[{"prize":3103164459,"winners":9},{"prize":46547467,"winners":100},{"prize":1491906,"winners":3120},{"prize":50000,"winners":156721},{"prize":5000,"winners":2658318}],"total_sales_amount":116731227000,"winners_combination":{"auto":9}}
]
```

| 필드 | 뜻 |
| --- | --- |
| `draw_no` | 회차 (1회 = 2002-12-07, 이후 매주 토요일) |
| `numbers` | 추첨 번호 6개 (1~45). 오름차순이 아닐 수 있어요 |
| `bonus_no` | 보너스 번호 (1~45) |
| `date` | 추첨일. 앞 10자리(`YYYY-MM-DD`)가 한국 날짜 기준 추첨일이에요 |
| `divisions` | 1~5등 순서의 배열. 각 항목은 `{"prize": 1인당 금액(원), "winners": 인원}`, 해당 등위 정보가 없으면 `{}` |
| `total_sales_amount` | 회차 총 판매 금액(원) |
| `winners_combination` | 1등의 자동(`auto`)·반자동(`semi_auto`)·수동(`manual`) 인원. 정보가 없으면 `{}` |

`v1/` 형식은 바꾸지 않습니다. 형식을 바꿔야 할 때는 `v2/`를 따로 만듭니다.

## 갱신 일정

GitHub Actions가 매주 아래 시각(한국 시간)에 출처 자료를 확인합니다.
새 회차가 있고 검사(번호 형식, 회차 연속성, 지난 회차 불변 등)를 통과했을 때만 반영합니다.

- 토요일 22:17
- 일요일 09:17
- 월요일 09:17

GitHub Actions 예약 실행은 몇 분에서 수십 분까지 늦게 시작될 수 있어요.

## 출처

[smok95/lotto](https://github.com/smok95/lotto)가 공개하는
`https://smok95.github.io/lotto/results/all.json`을 받아 검사한 뒤 내용을 바꾸지 않고 싣습니다.
