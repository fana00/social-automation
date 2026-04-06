# Fana Studio

AI 기반 소셜 미디어 콘텐츠 자동화 플랫폼. 인스타그램 레퍼런스 콘텐츠를 스크래핑하고, AI 페르소나로 재창작한 뒤, Blotato를 통해 소셜 플랫폼에 예약 발행합니다.

## 주요 기능

### IG 리플리케이터
- 인스타그램 프로필에서 레퍼런스 게시물 스크래핑 (이미지, 캐러셀, 동영상)
- 여러 게시물을 선택하여 AI 페르소나로 일괄 재창작
- 스크래핑된 미디어는 Cloudinary에 자동 업로드 (영구 저장)

### AI 생성 파이프라인
- **3-에이전트 시스템**: 초안 생성 -> 품질 검사 -> 캡션 작성
- **Seedream 4.5 Edit**: 얼굴 + 체형 레퍼런스 이미지를 활용한 캐릭터 일관성 유지 이미지 생성
- **Kling 3.0 Motion Control**: 시작 이미지 + 레퍼런스 동영상으로 영상 재창작
- **Grok Vision (OpenRouter 경유)**: 프롬프트 확장, 이미지 분석, QC 검사
- QC에서 해부학적 오류나 체형 비율 문제 감지 시 최대 4회 자동 재시도

### 갤러리
- 생성된 모든 콘텐츠를 상태 뱃지와 함께 조회 (ready / scheduled / published)
- 상태별 또는 페르소나별 그룹핑
- 캡션 인라인 편집, 콘텐츠 거부(reject), 프롬프트 수정 후 재생성(redo)
- Blotato 계정 선택 후 예약 발행 (다음 빈 슬롯 또는 즉시 발행)
- 미디어 전체화면 미리보기 (카드 클릭)
- 중단된 영상 시작 이미지는 "Continue to Video" 버튼으로 영상 생성 재개

### 캘린더
- 예약 및 발행된 게시물 월간 뷰
- Blotato와 자동 동기화하여 발행 완료 여부 감지

### 콘텐츠 유형
- **단일 이미지**: IG 게시물 또는 자유 프롬프트로 재창작
- **캐러셀**: IG 캐러셀 게시물의 모든 하위 이미지를 갤러리에서 그룹으로 표시
- **동영상**: 시작 이미지 재창작 + Kling Motion Control로 레퍼런스 영상 기반 영상 생성

## 기술 스택

- **프론트엔드**: Next.js 16 (App Router) + Tailwind CSS
- **데이터베이스**: Google Sheets (6개 탭: Personas, Content Calendar, Generation Log, QC Trials, IG Sources, Scraped Posts)
- **이미지/영상 생성**: [kie.ai](https://kie.ai) (Seedream 4.5, Kling 3.0)
- **LLM**: [OpenRouter](https://openrouter.ai) (Grok 4 Fast - 비전 + 텍스트)
- **미디어 저장소**: [Cloudinary](https://cloudinary.com)
- **IG 스크래핑**: [Apify](https://apify.com)
- **소셜 발행**: [Blotato](https://blotato.com)
- **알림**: Discord 웹훅

## 설정 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일에 API 키를 입력합니다:

```
KIE_API_KEY=              # kie.ai API 키
OPENROUTER_API_KEY=       # OpenRouter API 키
APIFY_API_KEY=            # Apify API 키
GOOGLE_SERVICE_ACCOUNT_EMAIL=  # Google Cloud 서비스 계정 이메일
GOOGLE_PRIVATE_KEY=       # 서비스 계정 비공개 키
GOOGLE_SPREADSHEET_ID=    # Google Sheets 스프레드시트 ID
CLOUDINARY_CLOUD_NAME=    # Cloudinary 클라우드 이름
CLOUDINARY_API_KEY=       # Cloudinary API 키
CLOUDINARY_API_SECRET=    # Cloudinary API 시크릿
BLOTATO_API_KEY=          # Blotato API 키
DISCORD_WEBHOOK_URL=      # Discord 웹훅 URL (선택)
NEXT_PUBLIC_APP_URL=      # 앱 URL (kie.ai 콜백용)
```

### 3. Google Sheets 설정

아래 6개 탭을 가진 스프레드시트를 생성합니다 (정확한 이름, 대소문자 구분):

| 탭 | 컬럼 |
|----|------|
| **Personas** | Persona ID, Name, Personality, Body Ref URLs, Face Ref URLs, IG Sources, Source Rotation, Last Source Index, Active |
| **Content Calendar** | Row ID, Date, Platform, Content Type, Persona, Caption, Hashtags, Media URLs, Status, Blotato Post ID, Notes |
| **Generation Log** | Gen ID, Timestamp, Mode, Persona, Source IG URL, Basic Prompt, Expanded Prompt, Model, Task ID, QC Status, QC Attempts, Final Result URLs, Caption, Carousel Group ID, Calendar Row ID |
| **QC Trials** | Trial ID, Gen ID, Attempt #, Timestamp, Image URL, QC Result, Issues Found, Adjusted Prompt |
| **IG Sources** | Profile URL, Persona ID, Last Scraped, Posts Scraped, Active, Notes |
| **Scraped Posts** | Post ID, Source URL, Persona ID, Thumbnail URL, Media URLs, Caption, Type, Likes, Scraped At, Used |

서비스 계정 이메일을 스프레드시트에 편집자(Editor)로 공유합니다.

### 4. 페르소나 추가

Personas 탭에 행을 추가합니다:

```
zoey | Zoey | 캐릭터 성격 설명 | body_ref_url1,body_ref_url2 | face_ref_url | ig_source1,ig_source2 | round-robin | 0 | TRUE
```

### 5. 실행

```bash
npm run dev
```

http://localhost:3000 에서 확인

## 배포

Vercel에 배포:

```bash
vercel
```

Vercel 대시보드에서 모든 환경 변수를 설정하고, `NEXT_PUBLIC_APP_URL`을 프로덕션 URL로 변경합니다 (kie.ai 콜백 동작에 필수).

## 아키텍처

```
IG 소스 -> Apify 스크래핑 -> Cloudinary (영구 저장)
  -> Grok Vision (분석 + 프롬프트 생성)
  -> Seedream 4.5 Edit (얼굴/체형/장면 레퍼런스 + 프롬프트 -> 이미지)
  -> QC 에이전트 (Grok Vision, 최대 4회 자동 재시도)
  -> 캡션 에이전트 (Grok, 페르소나 성격 반영)
  -> Cloudinary (결과물 저장)
  -> Google Sheets (로그 + 캘린더)
  -> Discord (알림)
  -> Blotato (예약 + 발행)
```

## API 라우트

| 라우트 | 메서드 | 설명 |
|--------|--------|------|
| `/api/generate/image` | POST | 프롬프트 또는 IG 레퍼런스로 이미지 생성 |
| `/api/generate/video` | POST | 영상 생성 (시작 이미지 + Kling 모션 컨트롤) |
| `/api/generate/video/continue` | POST | 기존 시작 이미지로 영상 생성 이어하기 |
| `/api/generate/carousel` | POST | 캐러셀 생성 (다양한 앵글 변형) |
| `/api/regenerate` | POST | 수정된 프롬프트로 재생성 |
| `/api/tasks/[taskId]` | GET | kie.ai 작업 상태 폴링 |
| `/api/tasks/callback` | POST | 후처리 웹훅 (QC + 캡션 + 업로드) |
| `/api/scrape/instagram` | GET/POST | IG 프로필 스크래핑 또는 저장된 게시물 조회 |
| `/api/personas` | GET | Sheets에서 페르소나 목록 조회 |
| `/api/accounts` | GET | Blotato 연결 계정 목록 조회 |
| `/api/publish` | POST | Blotato를 통한 게시물 예약 |
| `/api/publish/status` | GET | Blotato 게시물 상태 확인 |
| `/api/sheets/calendar` | GET | 캘린더 항목 조회 |
| `/api/sheets/rows` | GET | 생성 로그 조회 |
| `/api/sheets/update` | PATCH | 캘린더/생성로그/스크래핑 항목 업데이트 |
| `/api/proxy-image` | GET | CORS 우회를 위한 외부 이미지 프록시 |
| `/api/discord/notify` | POST | Discord 알림 전송 |
