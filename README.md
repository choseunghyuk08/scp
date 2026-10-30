# GAZE (가제)

SCP 소재의 탑다운 도트 호러 웹 게임. 173은 계속 쳐다봐야 살고, 096은 쳐다보면 안 된다. 기획은 `docs/spec.md`, 버전 계획은 `docs/roadmap.md`, 결정 기록은 `docs/decisions.md`.

**현재 버전: v0.1 — 173 재미 검증** (고정 테스트 맵 1개, SCP-173만, 임시 도형 에셋)

## 조작

| 입력 | 동작 |
|---|---|
| WASD | 이동 |
| 마우스 | 시선 조준 (시야 콘이 커서 방향을 향함) |
| Shift | 달리기 (스태미너 소모) |
| E | 출구 문 열기 (카드키가 있을 때) |
| Space | 사망·탈출 후 다시 시작 |

규칙: 카드키(노란 점)를 찾아 출구(붉은 문)에서 E를 누르면 탈출. 173은 **시야 콘 안에 있으면 멈추고**, 벗어나거나 눈이 깜빡이는 순간 달려든다. 눈 깜빡임 게이지(하단 "눈")가 차면 강제로 눈이 감긴다.

## 실행

빌드 도구 없음. 저장소 루트에서 정적 서버를 띄우면 된다.

```bash
python3 -m http.server 8000
```

`http://localhost:8000` 접속. (`file://`로 직접 열면 ES module이 막힌다.)

GitHub Pages로도 그대로 열린다 (모든 경로가 상대 경로).

## 테스트

```bash
npm test          # 순수 로직 단위 테스트 (node --test, 추가 설치 불필요)
npm install && npx playwright install chromium   # 스모크 테스트를 처음 돌릴 때 한 번
npm run smoke     # Playwright 스모크 테스트 (브라우저에서 실제 씬 확인, python3 필요)
```

- `src/logic/` — DOM·Phaser를 모르는 순수 규칙(이동 충돌, 시야, 173, 스태미너, 깜빡임, 무전, 맵 파서). 단위 테스트 대상.
- `src/scenes/`, `src/render/`, `src/audio/` — Phaser 연결·그리기. 스모크 테스트 대상.
- 스모크 테스트는 `?debug=1`일 때만 켜지는 `window.__debug` 훅(`src/debug.js`)으로 씬 상태를 읽고 조작한다.

## 의존성

- Phaser 3.90.0 (MIT) — `vendor/phaser.min.js`에 포함. 라이선스는 `vendor/PHASER_LICENSE.md`.
