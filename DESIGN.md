# DESIGN.md — 중고시세

styles.css의 `:root` 토큰이 단일 진실 공급원. 여기 값과 다르면 styles.css가 맞다.

## Color (Restrained: tinted neutrals + mint accent)
- `--bg` #ffffff / `--fill` #f2f4f6 (input·chip 배경) / `--fill-hover` #e8ebee
- `--ink` #191f28 (본문) / `--ink-sub` #4e5968 / `--ink-soft` #8b95a1 (힌트) / `--ink-faint` #b0b8c1 (placeholder)
- `--line` #e5e8eb (구분선)
- 액센트: `--mint` #00b8a2, pressed `--mint-deep` #009c8a, selected wash `--mint-tint` #e4f8f4
- `--danger` #f04452
- 액센트는 주요 액션·선택 상태·포커스에만. 장식 사용 금지.

## Typography
- Pretendard Variable (CDN), 시스템 sans 폴백. 단일 패밀리.
- 본문 15.5px / 힌트·캡션 12.5~14px / 섹션 제목 20px·800 / 페이지 제목 clamp(23~28px)·800
- 자간: 제목 -0.02em. 숫자는 굵게(700+)로 강조.

## Shape & Elevation
- `--radius` 16px (카드·입력), `--radius-sm` 12px (콜아웃), 칩·내비 pill 999px
- 그림자 대신 fill 배경과 1px `--line` 테두리로 층위 표현. 드롭다운 등 부유 요소만 부드러운 그림자(0 8px 24px rgba(25,31,40,0.10)) 허용.

## Components
- 입력: `--fill` 배경, 테두리 없음, 포커스 시 mint 2px ring (box-shadow inset 방식은 styles.css 참조)
- 선택 칩: 기본 `--fill`, 선택 시 `--mint-tint` 배경 + mint 텍스트
- 주요 버튼 `.btn-primary`: mint 배경, 흰 글자, radius 16
- 리스트 행 `.more-links__list`: 흰 배경 + line 구분, 우측 → 화살표

## Motion
- `--ease-out` cubic-bezier(0.22,1,0.36,1), 150~250ms. 상태 변화에만.
- 시그니처: 결과 금액 count-up (easeOutQuint 640ms), `prefers-reduced-motion` 존중 필수.

## Layout
- 단일 컬럼, `max-width: 480px` 중앙 정렬 (모바일 퍼스트).
- 페이지 여백: body padding clamp(24~48px) 20px.
