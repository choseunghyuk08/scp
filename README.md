# GAZE (가제)

SCP 소재의 탑다운 도트 호러 웹 게임. 173은 계속 쳐다봐야 살고, 096은 쳐다보면 안 된다. 기획은 `docs/spec.md`, 버전 계획은 `docs/roadmap.md`.

## 실행

빌드 도구 없음. 저장소 루트에서 정적 서버를 띄우면 된다.

```bash
python3 -m http.server 8000
```

`http://localhost:8000` 접속. (`file://`로 직접 열면 ES module이 막힌다.)

## 테스트

```bash
npm test          # 순수 로직 단위 테스트 (node --test)
npm run smoke     # Playwright 스모크 테스트 (브라우저에서 실제 씬 확인)
```

## 의존성

- Phaser 3.90.0 (MIT) — `vendor/phaser.min.js`에 포함. 라이선스는 `vendor/PHASER_LICENSE.md`.
