# 설정 — 새 컴퓨터에서 프로젝트 실행하기

코드는 GitHub에 있지만, 두 가지는 **컴퓨터마다 따로 설정**해야 합니다:
1. **Git push 인증** (SSH 키) — GitHub에 push 하기 위해 필요합니다.
2. **환경 변수** (`.env.local`) — 앱 실행에 필요한 API 키들. gitignore 처리되어 있어 커밋되지 않습니다.

Vercel 프로덕션은 `main` 브랜치에서 자동으로 배포됩니다 — 사용하는 노트북과는 무관합니다.

---

## 1. 저장소 클론

```bash
git clone git@github-fana00:fana00/social-automation.git
cd social-automation
npm install
```

> `github-fana00`은 SSH 호스트 별칭(alias)입니다 (2단계 참고). 이 컴퓨터에서 아직 설정하지 않았다면 클론 시 권한 오류가 납니다 — 2단계를 먼저 진행한 뒤 클론하세요.

---

## 2. Git push 인증 (SSH 키)

> ⚠️ 이 컴퓨터에는 **GitHub 계정이 여러 개** 있을 수 있습니다. 계정을 섞이지 않게 분리하세요: 이 저장소는 **fana00** 계정 전용 키와 호스트 별칭을 사용합니다. 절대 다른 계정의 키로 이 저장소에 push 하지 마세요.

**a. 전용 키 생성 (비밀번호 없음 — push 할 때 매번 입력하지 않도록):**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_fana00 -N "" -C "master@fana.club"
```

**b. 공개 키를 fana00 GitHub 계정에 등록:**

```bash
cat ~/.ssh/id_ed25519_fana00.pub
```

출력된 줄 전체를 복사 → GitHub(**fana00** 계정으로 로그인) → Settings → **SSH and GPG keys** → **New SSH key** → 붙여넣기.

**c. 호스트 별칭을 `~/.ssh/config`에 추가** (파일이 없으면 새로 만드세요):

```
Host github-fana00
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_fana00
  IdentitiesOnly yes
```

`IdentitiesOnly yes` 옵션은 이 저장소가 **오직 fana00 키만** 사용하도록 보장합니다 — 다른 계정의 키로 넘어가지 않습니다.

**d. 확인** (이름으로 인사하면 성공):

```bash
ssh -T git@github-fana00      # 예상 출력: "Hi fana00! ..."
```

HTTPS로 클론했다면, 원격(remote) 주소를 별칭으로 변경하세요:

```bash
git remote set-url origin git@github-fana00:fana00/social-automation.git
```

**e. 이 저장소의 커밋 작성자 정보 설정:**

```bash
git config user.name  "fana00"
git config user.email "master@fana.club"
```

---

## 3. 환경 변수

앱은 `.env.local`(gitignore 처리됨)에서 비밀 키들을 읽습니다. Vercel에서 받아오세요:

```bash
npm i -g vercel     # 설치되어 있지 않다면
vercel link         # 이 폴더를 Vercel 프로젝트와 연결
vercel env pull     # 모든 환경 변수를 .env.local 파일로 내려받기
```

프로젝트에서 사용하는 키 목록입니다 (vercel env pull로 전부 받아집니다):

| 변수 | 용도 |
|---|---|
| `OPENROUTER_API_KEY` | 프롬프트 확장, 캡션, 품질 검사 (OpenRouter 경유 Grok) |
| `FAL_API_KEY` | 이미지 생성 (Seedream 4.5 edit) |
| `KIE_API_KEY` | 영상 생성 (Kling motion control) |
| `APIFY_API_KEY` | 인스타그램 스크래핑 / 릴 추출 |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | 미디어 호스팅/업로드 |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | 클라이언트 측 Cloudinary |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID` | 구글 시트 (페르소나, 로그, 캘린더) |
| `BLOTATO_API_KEY` | 소셜 게시 |
| `DISCORD_BOT_TOKEN`, `DISCORD_SCHEDULE_CHANNEL_ID`, `DISCORD_WEBHOOK_URL` | 디스코드 알림 |
| `REPLICATE_API_KEY`, `WAVESPEED_API_KEY` | 추가 모델 제공자 |
| `NEXT_PUBLIC_APP_URL` | 콜백 URL (배포 URL로 설정) |

---

## 4. 실행

```bash
npm run dev      # 로컬 개발 서버: http://localhost:3000
```

---

## 배포

`main`에 push 하기만 하면 Vercel이 프로덕션에 자동 배포합니다:

```bash
git push origin main
```

**개별 배포 URL이 아니라 프로덕션 별칭(alias)을 사용하세요.** 개별 배포 URL(`social-automation-<hash>-...vercel.app`)은 고정된 옛 빌드라서 오래된 동작을 보여줍니다. 프로덕션 별칭은 항상 최신 빌드를 가리킵니다:

```
https://social-automation-fanas-projects-6968b881.vercel.app
```
