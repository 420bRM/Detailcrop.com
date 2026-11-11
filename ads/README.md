# 광고 집행 인수인계 — DetailCrop (ads/)

광고 집행 세션(사장님 사이트 전체 광고 담당)이 이 파일로 이어 받는다. 사이트 작업 규칙은 루트 `README.md` · `DECISIONS.md`.
이 폴더는 배포되지 않는다(배포는 `public/` 만). 광고 이미지는 플랫폼이 주소로 읽어 가도록 `public/ads/` 에 둔다.

- 처음 씀: 2026-11-11
- 광고 결과 · 결정은 맨 아래 **기록** 표에 날짜순으로 쌓는다.
- 다른 사이트 광고: lottodraw `ads/README.md`, BIG-ART-HOMEPAGE `ads/README.md`.

---

## 0. 지켜야 할 것

- 사장님과는 **한국어 다나까 말투**.
- 돈이 나가는 일(게시 · 예산 · 결제 수단)은 **반드시 사장님 확인 뒤**. 탭제어 Claude 에게 결제 정보 입력을 시키지 않는다.
- 사장님 이메일 · 개인 정보는 외부 서비스(광고 플랫폼 문의 양식 포함)에 넣지 않는다. 넣어야 하면 사장님이 직접.
- 부가세 관련 일은 하지 않는다.
- 광고 문구는 사이트가 실제로 하는 것만: **무료 · 업로드 없음(브라우저 안에서 처리) · 한 장에 최대 6컷 · zip 하나로**.
  "사진은 어디에도 가지 않습니다"는 사실이다(README 첫 줄). 회원 프리셋은 로그인(Google)이 필요하니 '로그인 없이'라고 쓰지 않는다.
- `public/` 은 그대로 배포된다. 광고 이미지 폴더에는 `index.html`(noindex) 하나와 그림만 둔다. sitemap 은 build.py 가 만들어 광고 폴더는 들어가지 않는다.
- 저장소 작업: `main` 에서 새 가지 → PR. 커밋 · PR 에 모델 이름을 쓰지 않는다.

## 1. 무엇을 광고하나

**디테일크롭 DetailCrop — 여러 이미지 한번에 자르기(멀티크롭)**: 사진마다 같은 비율의 컷을 최대 6개씩 잡아 zip 하나로 받는 무료 브라우저 도구. 동영상 판(`/video/`), 크롬 확장도 있다.

- 도착 페이지: **영어 <https://detailcrop.com/>** (한국어 `/ko/`, 일본어 `/ja/`)
- 쓰는 사람(사이트 '누가 쓰는가' 질문 항목): 판매자(쇼핑몰 상세컷), 사진가, 작가 · 디자이너(작품 확대컷), 마케터(인스타 피드 분할)
- **광고는 영어로(2026-11-11 사장님 결정)** — 영어권(미국 · 영국 · 캐나다 · 호주 · 뉴질랜드 · 아일랜드). 한국어 · 일본어는 영어 결과를 본 뒤.
- 영어 문구는 크롬 웹 스토어 등록 문구(`extension/store/listing.md` English)와 같은 말을 쓴다.

## 2. 지금 상태 (2026-11-11)

| 채널 | 상태 | 비고 |
|---|---|---|
| 구글 디스플레이(영어) | **1차 시험 자료 준비(설정 · 게시 전)** | 예산 · 기간은 사장님이 정한다. 아래 4장은 제안값 |
| 구글 검색 광고(영어) | **추천 1순위** | 도구는 '찾는 사람'에게 보이는 게 맞다. 같은 문구를 검색 광고 제목 · 설명으로 쓸 수 있다 |
| 레딧(Reddit) 광고 | 추천 | 판매자 · 사진 · 디자인 커뮤니티를 골라 낼 수 있다. 최소 예산 · 단가는 조사 필요 |
| 무료 등록(Product Hunt · AlternativeTo) | 추천 | 돈이 들지 않는 소개 자리. 올리는 글은 사장님 확인 뒤 |
| 메타(인스타그램) · 핀터레스트 | 후보 | 같은 이미지를 그대로 쓸 수 있다 |

**측정:** `/stats` 대시보드가 방문 · 내보내기를 센다. 페이지는 리퍼러가 비었을 때만 `utm_source` 를 `ref` 로 보내므로, 구글 광고 클릭은 리퍼러(googlesyndication · google 등)로 잡힐 수 있다. 시작 후 /stats 의 '출처'에서 어떻게 보이는지 먼저 확인한다.

## 3. 이미지 — `public/ads/google-detailcrop-en-1/` (영어)

목록 쪽: <https://detailcrop.com/ads/google-detailcrop-en-1/> (noindex, 병합 · 배포 뒤 열림). 구글 Ads "웹사이트 스캔"에 넣어 고른다.

| 파일 | 크기 | 내용 |
|---|---|---|
| `landscape-1-crops.jpg` | 1200×628 | 왼쪽 예시 사진에 상자 6개, 오른쪽 잘린 컷 6장 + 'Batch-crop every image, six details each' |
| `landscape-2-strip.jpg` | 1200×628 | 잘린 컷 6장 + 'Six crops per image, one zip' |
| `square-1-crops.jpg` | 1200×1200 | 사진 + 컷 2×3 + 'Six crops per image, at once' |
| `square-2-grid.jpg` | 1200×1200 | 컷 3×2 크게 + 로고 |
| `portrait-crops.jpg` | 900×1600 | 9:16 — 사진 위 · 컷 아래 |
| `logo-square.png` | 1200×1200 | 앱 아이콘(icon-512 와 같은 모양) |
| `logo-landscape.png` | 1200×300 | 아이콘 + DetailCrop |

그림은 도구의 예시 사진(template.html 의 DEMO '야경-도시')과 상자 색(--b1~)으로 그렸다. 다시 만들기: `NODE_PATH=$(npm root -g) node scripts/make-ad-images.cjs`
(새 세트는 스크립트의 `OUT` · `IMAGES` 를 바꿔 `public/ads/<매체>-detailcrop-<언어>-<차수>/` 에). 처음 만든 한국어 세트는 영어로 바꾸며 지웠다(가지 기록에 남음).

## 4. 구글 디스플레이 1차 시험 — 영어 (제안 — 사장님 확인 전)

- 캠페인 **DetailCrop EN test1** · 디스플레이 · 미국 · 영국 · 캐나다 · 호주 · 뉴질랜드 · 아일랜드 · 영어 · 클릭수 최대화(최대 CPC 400원) · 하루 10,000원 · 7일 (날짜는 사장님이)
  영어권은 클릭 값이 한국보다 비싸다 — 첫날 노출이 거의 없으면 CPC 한도를 올릴지 사장님께 묻는다.
- 광고그룹 **batch crop**: 키워드 batch crop images · bulk image cropper · crop multiple images at once · product photo crop · instagram grid split · image cropper online · crop images to same size · 최적화된 타기팅 끔
- 최종 URL `https://detailcrop.com/?utm_source=google&utm_medium=display&utm_campaign=detailcrop_en_test1` · 비즈니스 이름 **DetailCrop**

### 광고 문구 (영어 1자 = 1 · 모두 한도 안 확인)
- 짧은 제목(30 이내): Batch Crop Images Online / Six Crops Per Image, One Zip / Free Multi Crop Tool / Crop Product Detail Shots / Crops Stay in Your Browser
- 긴 제목(90 이내): Crop up to six fixed-ratio details from every image in a batch and download one zip
- 설명(90 이내):
  1. Product detail shots, artwork close-ups, Instagram tiles: same crops, same size, at once.
  2. Free and private. Images are cropped in your browser and never uploaded to a server.
  3. The next image starts from the boxes you just placed. Set ratio, size and file names.

## 5. 탭제어(브라우저 위임 Claude) 프롬프트

### ① 캠페인 만들기

```
너는 내 브라우저에서 Google Ads 디스플레이 캠페인 1개를 만든다. 게시(사용 설정)는 내가 확인한 뒤에만 누른다.

[지킬 것]
- 결제 수단·카드 입력 화면이 나오면 멈추고 나에게 넘긴다. 결제 정보는 절대 입력하지 않는다.
- 이미 있는 다른 캠페인·광고는 건드리지 않는다.
- Google Ads 계정이 여러 개면 어느 계정인지 먼저 묻는다.
- 정책 경고("제한됨", "비승인" 등)가 뜨면 멈추고 원문 그대로 알려 준다.
- 아래 문구는 바꾸지 않는다. 글자 수 초과로 안 들어가면 멈추고 묻는다.
- 자동 생성 자산·자동 생성 동영상·이미지 자동 개선은 모두 끈다(내가 준 이미지·문구만 쓴다).

[1. 캠페인]
- 목표: 목표 없이 만들기(또는 웹사이트 트래픽) → 유형: 디스플레이
- 이름: DetailCrop EN test1
- 위치: 미국, 영국, 캐나다, 호주, 뉴질랜드, 아일랜드 / 언어: 영어
- 입찰: 클릭수 최대화, 최대 CPC 한도 400원
- 예산: 하루 10,000원
- 기간: (내가 알려 주는 날짜)
- 기기: 기본값(모든 기기)

[2. 광고그룹·타기팅]
- 광고그룹 이름: batch crop
- 키워드: batch crop images, bulk image cropper, crop multiple images at once, product photo crop, instagram grid split, image cropper online, crop images to same size
- 최적화된 타기팅: 끔

[3. 광고 — 반응형 디스플레이 광고]
- 최종 URL: https://detailcrop.com/?utm_source=google&utm_medium=display&utm_campaign=detailcrop_en_test1
- 비즈니스 이름: DetailCrop
- 이미지·로고: "이미지 추가" → "웹사이트 스캔"에 https://detailcrop.com/ads/google-detailcrop-en-1/ 을 넣고 아래 파일 이름의 이미지를 고른다.
  자르기 화면이 나오면 아래 비율로, 그림 전체가 들어가게 맞춘다.
    가로 1.91:1 → landscape-1-crops.jpg, landscape-2-strip.jpg
    정사각형 1:1 → square-1-crops.jpg, square-2-grid.jpg
    세로 9:16(칸이 있을 때만) → portrait-crops.jpg
    로고 1:1 → logo-square.png
    로고 4:1 → logo-landscape.png
  · 스캔으로 안 찾아지거나 고를 수 없으면 "업로드" 파일 선택 창을 띄운 채 멈추고 "파일 올려 주세요"라고 말한다.
  · "이미지 속 텍스트가 많음" 경고가 뜨면 그 이미지만 뺀다.
- 짧은 광고 제목 5개:
  Batch Crop Images Online
  Six Crops Per Image, One Zip
  Free Multi Crop Tool
  Crop Product Detail Shots
  Crops Stay in Your Browser
- 긴 광고 제목: Crop up to six fixed-ratio details from every image in a batch and download one zip
- 설명 3개:
  Product detail shots, artwork close-ups, Instagram tiles: same crops, same size, at once.
  Free and private. Images are cropped in your browser and never uploaded to a server.
  The next image starts from the boxes you just placed. Set ratio, size and file names.
- 행동 유도 버튼을 고를 수 있으면 "Use now" 또는 "Learn more"(없으면 자동)

[4. 게시 전 확인]
게시 버튼을 누르기 전에 멈추고 표로 보여 준다:
캠페인 이름 · 예산 · 기간 · 입찰 · 위치/언어 · 키워드 · 최종 URL · 들어간 이미지 파일 이름과 비율 · 광고 제목 · 설명 · 경고 메시지(있으면 원문).
내가 "게시"라고 하면 그때 누른다.
```

### ② 매일 확인 (바꾸지 않음)

```
Google Ads 의 "DetailCrop EN test1" 캠페인만 본다. 아무것도 바꾸지 않는다.
기간: 어제 하루, 그리고 시작일부터 어제까지 합계.
1. 노출 · 클릭 · 클릭률 · 평균 CPC · 비용
2. 게재된 위치 상위 10곳: 위치 · 노출 · 클릭 · 비용
3. 키워드별 노출 · 클릭
4. 광고·자산 상태: 승인/제한됨/비승인, 경고 원문
5. 이상한 점: 예산 초과, 이상한 앱·사이트에서 클릭이 몰림 등
표로 짧게 정리한다. 바꿀 것이 보이면 제안만 하고 손대지 않는다.
```

## 6. 기록

| 날짜 | 매체 | 한 일 · 결과 | 비용 |
|---|---|---|---|
| 2026-11-11 | 구글 | 1차 시험 이미지 7장 · 문구 · 탭제어 프롬프트 준비 | 0 |
| 2026-11-11 | 구글 | 사장님 결정: 디테일크롭 광고는 영어로 → 이미지 7장 · 문구 · 프롬프트를 영어로 바꿈. 매체 추천: 구글 검색 · 레딧 · 무료 등록(Product Hunt · AlternativeTo) | 0 |
