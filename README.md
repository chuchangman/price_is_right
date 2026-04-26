# 🎯 가격 맞추기 (The Price is Right)

SSAFY데이용 실시간 가격 맞추기 게임. 참여자들이 동시에 상품 가격을 예측하고, 정답과 제출 속도로 점수를 받아 순위를 매깁니다.

## 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Firebase Realtime Database (실시간 동기화)
- Vercel (배포)

## 점수 공식 (v2)

```
최종 점수 = 시간점수 (0~30) + 정답점수 (0~70)   # 독립 합산, 최대 100점

시간점수 (30점 만점)
  · 0~3초:        30점 (사람 반응속도 한계, 1초컷 방지)
  · 3~10초:       30 → 0 선형 감소
  · 10초 초과/미제출: 0

정답점수 (70점 만점)
  · 오차율 |예측 - 실제| / 실제 를 5% 단위 20구간으로 분할
  · 구간당 3.5점씩 감점
  · 0~5% 오차: 70점, 5~10%: 66.5점, ..., 95~100%: 3.5점, 100%+: 0점
```

---

## 🚀 세팅 순서 (총 ~1시간)

### 1️⃣ 프로젝트 설치 (5분)

```bash
cd price-is-right
npm install
```

### 2️⃣ Firebase 프로젝트 생성 (15분)

1. [Firebase Console](https://console.firebase.google.com/) 접속 → **프로젝트 추가**
2. 프로젝트 이름: `price-is-right` (원하는 이름) → Google Analytics는 **사용 안 함**
3. 프로젝트 대시보드에서 좌측 메뉴 → **Build** → **Realtime Database** → **데이터베이스 만들기**
   - 위치: **싱가포르 (asia-southeast1)** 선택 (한국에서 제일 빠름)
   - 보안 규칙: **테스트 모드** 선택 (나중에 교체)
4. 좌측 상단 ⚙️ → **프로젝트 설정** → 아래 **"내 앱"** 섹션에서 **웹 아이콘(`</>`)** 클릭
   - 앱 닉네임: `price-is-right-web`
   - Firebase Hosting **체크 안 함** → 앱 등록
   - **SDK 설정 및 구성** → `const firebaseConfig = {...}` 값 복사해두기

### 3️⃣ 보안 규칙 적용 (3분)

Firebase Console → **Realtime Database** → **규칙** 탭:

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

**게시** 클릭. (프로젝트 루트의 `firebase.rules.json`과 동일)

> ⚠️ 이 규칙은 방 코드를 아는 사람만 접근 가능하게 하는 단순 규칙이에요. 방 코드가 비밀번호 역할.

### 4️⃣ 환경변수 설정 (3분)

`.env.example`을 복사해서 `.env.local` 생성:

```bash
cp .env.example .env.local
```

`.env.local`을 열고 Firebase SDK 구성 값을 채워넣기:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

NEXT_PUBLIC_ADMIN_PASSWORD=원하는_암호
```

> `databaseURL`이 안 보이면 Firebase Console → Realtime Database 메인 페이지 상단에서 URL 복사.

### 5️⃣ 로컬 실행 테스트 (3분)

```bash
npm run dev
```

브라우저 두 개 열기:
- `http://localhost:3000/admin` → 관리자 페이지 (암호 입력 → 방 생성)
- `http://localhost:3000/` → 참여자 페이지 (닉네임 + 방 코드 입력)

### 6️⃣ 상품 이미지 & 데이터 준비 (30분)

**이미지 저장**: `public/images/products/` 폴더에 저장
- 파일명: **영문 소문자 + 하이픈** (`dyson-airwrap.jpg`, `nintendo-switch.webp`)
- ❌ 한글, 공백, 대문자, 특수문자 금지
- 장당 300KB 이하, 가로 800~1200px 권장
- 포맷: `.jpg` / `.png` / `.webp` 자유

**JSON 편집**: `data/questionPool.json`

```json
{
  "id": "q006",
  "productName": "에어프라이어 10L",
  "category": "appliance",
  "imageUrl": "/images/products/airfryer-10l.jpg",
  "actualPrice": 89000
}
```

카테고리 목록: `electronics`, `appliance`, `beauty`, `fashion`, `food`, `living`, `leisure`, `etc`

> ⚠️ `actualPrice`가 `0`이거나 `productName`이 `"TODO"`인 항목은 자동으로 풀에서 제외돼요.

### 7️⃣ Vercel 배포 (10분)

1. [GitHub](https://github.com/new)에 새 레포 만들고 코드 푸시
2. [Vercel](https://vercel.com/new)에서 **Import Git Repository**
3. **Environment Variables** 섹션에 `.env.local`의 모든 변수 그대로 추가 (8개)
4. **Deploy** 클릭 → 2~3분 대기
5. 발급된 `https://price-is-right-xxx.vercel.app` URL이 최종 게임 주소

> 📱 QR 코드로 만들어두면 현장 공유 편함. `https://www.qr-code-generator.com` 등

---

## 🎬 당일 운영 가이드

### 현장 흐름

1. **5분 전**: 관리자로 `https://your-url.vercel.app/admin` 접속
   - 암호 입력
   - 문제 수, 카테고리 선택
   - "방 만들고 시작하기" → 6자리 방 코드 생성됨
2. **시작**: 방 코드 & 참여자 URL (`https://your-url.vercel.app`) 화면에 크게 공유
3. **참여자 입장 확인**: 관리자 화면에서 "참여자 ({N}명)" 확인
4. **게임 진행**:
   - `▶ 첫 문제 시작` 클릭 → 3초 프리로드 → 10초 플레이 자동 진행
   - 시간 끝나면 `✅ 결과 공개` 클릭 → 정답 & 점수 공개
   - `▶ 다음 문제` 클릭 → 반복
5. **마지막 문제 후**: `🏁 최종 리더보드 공개` → 전체 순위 발표

### 중요 주의사항

- ⚠️ **관리자는 게임 중 브라우저를 절대 닫지 마세요.** 점수 계산이 관리자 클라이언트에서 이뤄져요.
- ⚠️ **관리자는 새로고침도 피하세요.** 방 코드는 유지되지만 진행이 꼬일 수 있어요.
- ⚠️ **WiFi 백업**: 싸피 WiFi가 불안할 수 있으니 핸드폰 테더링 준비.
- ⚠️ **예행연습 필수**: 친구 1~2명 붙잡고 반드시 한 번 전체 흐름 돌려보세요.

### 현장 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| 이미지가 안 뜸 | 파일명 오타/대소문자 확인. Vercel은 리눅스라 `Dyson.jpg`≠`dyson.jpg` |
| 카운트다운이 어긋남 | Firebase 연결 불안정. 새로고침은 세션 복구됨 |
| 특정 참여자만 입장 안 됨 | 닉네임 중복. 다른 닉네임으로 재시도 |
| "이미 사용 중인 닉네임" | 이전 접속 기록. 로컬스토리지 지우거나 다른 닉네임 |
| 점수가 안 더해짐 | 관리자 "결과 공개"를 두 번 이상 눌렀을 가능성. 방 삭제 후 재생성 |

### 참여자 경험

- 📱 스마트폰 세로 모드 최적화
- 🔄 새로고침해도 닉네임/방 자동 복구 (localStorage)
- ⏱ 제출 시간은 서버 시각 기준으로 측정 (공정)
- 🎯 같은 문제는 한 번만 제출 가능

---

## 📁 프로젝트 구조

```
price-is-right/
├─ app/
│  ├─ page.tsx              # 홈 (닉네임 + 방 코드 입력)
│  ├─ play/page.tsx         # 참여자 게임 화면
│  └─ admin/page.tsx        # 관리자 패널
├─ components/
│  ├─ CountdownRing.tsx     # 원형 카운트다운
│  └─ Leaderboard.tsx       # 리더보드
├─ lib/
│  ├─ firebase.ts           # Firebase 초기화
│  ├─ score.ts              # 점수 계산 로직
│  ├─ roomCode.ts           # 방 코드 생성/검증
│  └─ types.ts              # 타입 정의
├─ data/
│  └─ questionPool.json     # 문제 풀 (100개)
├─ public/images/products/  # 상품 이미지 저장 위치
├─ firebase.rules.json      # Firebase 보안 규칙
├─ .env.example             # 환경변수 템플릿
└─ README.md                # 이 파일
```

## 📊 Firebase 데이터 구조

```
rooms/{roomCode}/
├─ meta: { createdAt, questionsTotal, currentIndex }
├─ state: { phase, currentQuestionId, phaseStartedAt, playingStartsAt }
├─ questions: [{ id, productName, category, imageUrl, actualPrice }]
├─ players/{nickname}: { joinedAt, lastSeenAt, totalScore }
└─ submissions/{questionId}/{nickname}: { guess, submittedAt, elapsedMs, score }
```

## ❓ FAQ

**Q. 크롤링은 안 쓰나요?**
A. 현장 라이브에서는 쿠팡 봇 차단 위험 때문에 사전 JSON 방식이 안전해요. 문제 출제 시점에만 수동으로 상품 정보 수집.

**Q. 참여자 최대 몇 명까지?**
A. Firebase 무료 티어 기준 동시접속 100명까지 OK. 25명 정도는 여유.

**Q. 동점자 처리?**
A. 공동 순위 (1위 2명이면 둘 다 1위, 다음은 3위). 점수는 소수 둘째자리까지 표시.

**Q. 문제당 몇 개?**
A. `questionPool.json`에 100개 준비됨 (IT/가전 90개 + 패션/뷰티/예술품/주류 등 10개, 가격대 1만원~238억원). 방 생성 시 전체 풀에서 원하는 수만큼 랜덤 추출.

**Q. 입력 가능한 가격 범위는?**
A. 1원 ~ 1조원. 카텔란 바나나(87억), 피카츄 카드(238억) 같은 초고가 문제도 입력 가능.

**Q. 이미지 100장 이상 넣어도 돼요?**
A. 이론상 300장까지 Vercel Hobby 무료 한도(100MB) 안. 현실적으로 100장까진 걱정 없음.

---

## 🏃 빠른 체크리스트 (현장 직전)

- [ ] `.env.local`의 7개 Firebase 변수 + 관리자 암호 입력됨
- [ ] Firebase 보안 규칙 업데이트됨
- [ ] `questionPool.json` 100문제 + 상품 이미지 모두 `public/images/products/`에 존재
- [ ] 이미지 파일명 모두 영문 소문자 + 하이픈
- [ ] Vercel 배포 완료, 환경변수 주입됨
- [ ] 배포된 URL로 관리자 로그인 성공
- [ ] 친구랑 2인 테스트 완료
- [ ] QR 코드 준비
- [ ] 핸드폰 테더링 백업 준비

---

재밌게 하세요! 🎉
