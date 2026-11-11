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
| 구글 디스플레이(영어) | 보류 | 이미지(3장)는 준비됨 — 검색 광고 결과를 본 뒤 |
| 구글 검색 광고(영어) | **사장님 결정(11-11): 1차는 검색 광고로** — 설정은 아래 4장을 검색용으로 옮겨 쓴다(반응형 검색 광고: 제목 30자 · 설명 90자) | 도구는 '찾는 사람'에게 보이는 게 맞다. 같은 문구를 검색 광고 제목 · 설명으로 쓸 수 있다 |
| 레딧(Reddit) 광고 | **조사함(11-11) — 6-1장** | 하루 최소 $5, 원화 결제 안 됨(달러 계정) |
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

## 4. 구글 검색 광고 1차 시험 — 영어 (사장님 확정 11-11: 하루 1만 원 · 7일)

디스플레이(이미지) 안은 보류 — 3장 이미지는 나중에 디스플레이 · 레딧 · 메타에 쓴다. 검색 광고는 이미지가 필요 없어 사이트 병합을 기다리지 않아도 된다.

- 캠페인 **DetailCrop EN search1** · 검색 · **검색 파트너 끔 · 디스플레이 네트워크 끔**
- 위치: 미국 · 영국 · 캐나다 · 호주 · 뉴질랜드 · 아일랜드(위치 옵션: "그 위치에 있거나 자주 있는 사람") · 언어: 영어
- 예산 하루 **10,000원** · **7일**(시작일은 게시하는 날, 끝나는 날 = 시작일 + 6일) · 입찰 클릭수 최대화, 최대 CPC 한도 **500원**(영어권은 한국보다 비싸 300원이면 거의 안 나갈 수 있음)
- 광고그룹 2개 — 둘 다 첫 화면(도구)으로 보낸다(들어오자마자 쓰게):
  - **batch crop**: "batch crop images" · "crop multiple images at once" · "bulk image cropper" · "bulk crop photos" · "crop multiple photos" · "multi crop images" · "crop images to same size" · [batch crop images]
    최종 URL `https://detailcrop.com/?utm_source=google&utm_medium=cpc&utm_campaign=detailcrop_en_search1&utm_content=batch`
  - **product · instagram**: "crop product photos" · "product photo cropper" · "split image for instagram grid" · "instagram grid split" · "instagram carousel crop" · "etsy photo crop"
    최종 URL `https://detailcrop.com/?utm_source=google&utm_medium=cpc&utm_campaign=detailcrop_en_search1&utm_content=product`
- 제외 키워드(캠페인): photoshop · lightroom · apk · download · remove background · pdf · job · jobs · course
- 측정: Google Ads 보고서(노출 · 클릭 · 비용 · 검색어) + /stats(방문 · **내보내기** · 출처). 기준은 클릭당 비용이 아니라 **내보내기까지 간 사람 1명당 비용**. 페이지는 리퍼러가 있으면 utm 대신 리퍼러를 적으므로 /stats 에서는 google 쪽 출처로 보일 수 있다 — 첫날 확인.

### 반응형 검색 광고 (두 광고그룹 같은 광고 · 글자 수 모두 한도 안 확인)
- 제목 15개(30자 이내): Batch Crop Images Online / Crop Multiple Images at Once / Six Crops Per Image, One Zip / Free Multi Crop Tool / DetailCrop: Batch Image Crop / Your Images Are Not Uploaded / Runs in Your Browser / Crop Product Detail Shots / Same Ratio for Every Image / Instagram Grid in 3, 6 or 9 / Export All Crops as One Zip / No Sign-Up Needed to Crop / Crop Images to the Same Size / 1:1, 4:5, 2:3, 16:9 or Custom / Free Bulk Image Cropper
- 설명 4개(90자 이내):
  1. Crop up to six fixed-ratio details from every image in a batch and download one zip.
  2. Product detail shots, artwork close-ups, Instagram tiles: same crops, same size, at once.
  3. Free and private. Images are cropped in your browser and never uploaded to a server.
  4. The next image starts from the boxes you just placed. Set ratio, size and file names.
- 경로 표시: detailcrop.com/**batch-crop**/**free**
- 사이트링크 4개: How to Use(`/how-to/`) · Use Cases(`/uses/`) · Video Multi Crop(`/video/`) · Privacy(`/privacy/`)
- 콜아웃: Free to Use · Nothing Uploaded · Up to 6 Crops per Image · One Zip Download · WebP, JPEG or PNG · Chrome Extension Too

### (보류) 디스플레이 안 — 처음 제안
- 캠페인 DetailCrop EN test1 · 디스플레이 · 같은 6개국 · 최대 CPC 400원 · 키워드 batch crop images 등, 문구는 위 3장 이미지와 함께. 필요해지면 이 기록과 가지 기록을 보고 다시 만든다.

## 5. 탭제어(브라우저 위임 Claude) 프롬프트

### ① 캠페인 만들기 (검색 광고)

```
너는 내 브라우저에서 Google Ads 검색 캠페인 1개를 만든다. 게시(사용 설정)는 내가 확인한 뒤에만 누른다.

[지킬 것]
- 결제 수단·카드 입력 화면이 나오면 멈추고 나에게 넘긴다. 결제 정보는 절대 입력하지 않는다.
- 이미 있는 다른 캠페인·광고는 건드리지 않는다(LottoHex 캠페인 포함).
- Google Ads 계정이 여러 개면 어느 계정인지 먼저 묻는다.
- 정책 경고("제한됨", "비승인" 등)가 뜨면 멈추고 원문 그대로 알려 준다.
- 아래 문구는 바꾸지 않는다. 글자 수 초과로 안 들어가면 멈추고 묻는다.
- 자동 생성 자산(자동 제목·설명·이미지·사이트링크), "AI Max"·검색어 확장·최종 URL 확장은 모두 끈다(내가 준 문구만 쓴다).
- 구글이 추천하는 키워드·예산 올리기 제안은 받지 않는다.

[1. 캠페인]
- 목표: 목표 없이 만들기(또는 웹사이트 트래픽) → 유형: 검색
- 이름: DetailCrop EN search1
- 네트워크: 검색 파트너 끔, 디스플레이 네트워크 끔
- 위치: 미국, 영국, 캐나다, 호주, 뉴질랜드, 아일랜드
  위치 옵션: "그 위치에 있거나 자주 있는 사람"(관심 있는 사람 아님)
- 언어: 영어
- 예산: 하루 10,000원
- 입찰: 클릭수 최대화, 최대 CPC 한도 500원
- 기간: 오늘 시작, 6일 뒤 종료(모두 7일). 날짜를 표에 적어 보여 준다.
- 제외 키워드(캠페인 단위): photoshop, lightroom, apk, download, remove background, pdf, job, jobs, course

[2. 광고그룹 1 — 이름: batch crop]
- 키워드(구문 일치는 "따옴표", 일치는 [대괄호] 그대로 넣는다):
  "batch crop images"
  "crop multiple images at once"
  "bulk image cropper"
  "bulk crop photos"
  "crop multiple photos"
  "multi crop images"
  "crop images to same size"
  [batch crop images]
- 최종 URL: https://detailcrop.com/?utm_source=google&utm_medium=cpc&utm_campaign=detailcrop_en_search1&utm_content=batch

[3. 광고그룹 2 — 이름: product instagram]
- 키워드:
  "crop product photos"
  "product photo cropper"
  "split image for instagram grid"
  "instagram grid split"
  "instagram carousel crop"
  "etsy photo crop"
- 최종 URL: https://detailcrop.com/?utm_source=google&utm_medium=cpc&utm_campaign=detailcrop_en_search1&utm_content=product

[4. 광고 — 반응형 검색 광고, 두 광고그룹에 같은 내용으로 하나씩(최종 URL만 위처럼 다르게)]
- 표시 경로: batch-crop / free
- 광고 제목 15개:
  Batch Crop Images Online
  Crop Multiple Images at Once
  Six Crops Per Image, One Zip
  Free Multi Crop Tool
  DetailCrop: Batch Image Crop
  Your Images Are Not Uploaded
  Runs in Your Browser
  Crop Product Detail Shots
  Same Ratio for Every Image
  Instagram Grid in 3, 6 or 9
  Export All Crops as One Zip
  No Sign-Up Needed to Crop
  Crop Images to the Same Size
  1:1, 4:5, 2:3, 16:9 or Custom
  Free Bulk Image Cropper
- 설명 4개:
  Crop up to six fixed-ratio details from every image in a batch and download one zip.
  Product detail shots, artwork close-ups, Instagram tiles: same crops, same size, at once.
  Free and private. Images are cropped in your browser and never uploaded to a server.
  The next image starts from the boxes you just placed. Set ratio, size and file names.
- 제목 고정(핀)은 하지 않는다.

[5. 애셋 — 캠페인 단위]
- 사이트링크 4개(제목 / 설명1 / 설명2 / URL):
  How to Use / Step-by-step multi crop guide / Set ratio, boxes, export a zip / https://detailcrop.com/how-to/
  Use Cases / Product shots, grids, artwork / See what people crop with it / https://detailcrop.com/uses/
  Video Multi Crop / Crop several clips at once / 9:16, 1:1 and 4:5 from one clip / https://detailcrop.com/video/
  Privacy / Images never leave your browser / No upload, no image data sent / https://detailcrop.com/privacy/
- 콜아웃 6개: Free to Use, Nothing Uploaded, Up to 6 Crops per Image, One Zip Download, WebP, JPEG or PNG, Chrome Extension Too
- 비즈니스 이름: DetailCrop (로고를 넣으라고 하면 건너뛴다)

[6. 게시 전 확인]
게시 버튼을 누르기 전에 멈추고 표로 보여 준다:
캠페인 이름 · 네트워크 · 위치/위치 옵션 · 언어 · 예산 · 입찰 · 시작일/종료일 · 광고그룹별 키워드와 최종 URL · 제외 키워드 · 광고 제목 · 설명 · 사이트링크 · 콜아웃 · 꺼 둔 자동 기능 · 경고 메시지(있으면 원문).
내가 "게시"라고 하면 그때 누른다.
```

### ② 매일 확인 (바꾸지 않음)

```
Google Ads 의 "DetailCrop EN search1" 캠페인만 본다. 아무것도 바꾸지 않는다.
기간: 어제 하루, 그리고 시작일부터 어제까지 합계.
1. 노출 · 클릭 · 클릭률 · 평균 CPC · 비용
2. 키워드별 노출 · 클릭 · 평균 CPC · 비용
3. 실제 검색어(검색어 보고서) 상위 20개 — 엉뚱한 검색어가 있으면 제외 키워드 후보로 적기(넣지는 않음)
4. 광고·자산 상태: 승인/제한됨/비승인, 경고 원문
5. 이상한 점: 예산 초과, 이상한 앱·사이트에서 클릭이 몰림 등
표로 짧게 정리한다. 바꿀 것이 보이면 제안만 하고 손대지 않는다.
```

## 6-1. 레딧 광고 조사 (2026-11-11 · 공식 도움말 검색 요약, 직접 열람은 이 환경에서 막힘 — 돈 쓰기 전에 다시 확인)

- 최소 예산 하루 **$5**(레딧 권장은 광고그룹당 $50/일 — $7/일이면 학습이 느리다). 최소 입찰 미국 · 영국 · 캐나다 CPM $3.50 · CPC $0.10.
- 결제: 카드. 통화는 계정 만들 때 정하고 못 바꾼다 — **원화 없음**, 달러 계정 + 해외 결제 되는 카드. 한국 광고주는 Reddit, Inc.(미국)가 청구.
- 타기팅: 커뮤니티(서브레딧, 최근 28일 방문 · 구독자) · 관심사 · 키워드(영어) · 나라 · 기기(데스크톱만 따로 시험할 만함). 커뮤니티는 광고그룹당 15개 이상 권장, 자동 확장은 끈다.
- 형식: 이미지 1:1 · 4:5 · 16:9 권장(1.91:1 은 테두리가 생길 수 있음 → 4:5 · 16:9 판을 새로 만들 것). 제목 100자 안쪽.
- 심사: 사람이 본다, 보통 하루 안 · 최대 48시간, 주말은 월요일. 무료 웹 도구라 걸리는 정책은 찾지 못함. "무료 · 업로드 없음"은 도착 페이지에 보여야 한다.
- 측정: utm 그대로 쓰임(레딧이 `rdt_cid` 를 붙임). 레딧 픽셀은 외부 스크립트라 "아무것도 올리지 않음"과 개인정보 안내를 먼저 정해야 한다 — 1차는 utm + /stats 로만.
- 예상: 하루 $7 × 7일(약 $49)이면 클릭 **15~60회**(업계 블로그 평균 CPC $0.5~2 기준, 공식 수치 아님).
- 후보 커뮤니티(크기 · 광고 가능 여부는 광고 관리자에서 확인): r/EtsySellers · r/Etsy · r/shopify · r/ecommerce · r/AmazonSeller · r/productphotography · r/photography · r/AskPhotography · r/graphic_design · r/photoshop · r/InstagramMarketing · r/smallbusiness (+ 관심사 Photography · Design · Small business)
- 일반 글로 홍보하는 것은 거의 모든 커뮤니티가 막는다 — 광고로만.

## 6-2. 검색 광고로 들어온 뒤 다음 단계 (사례 조사 요약 · 11-11)

사장님 방향: 유료 전환(기본 기능 유료화)은 하지 않는다. 사례(Photopea · TinyPNG · remove.bg · Smallpdf · iLovePDF/iLoveIMG · Excalidraw · Carrd · Squoosh)에서 나온 순서:
1. **첫 내보내기까지 빠르게** — 광고그룹마다 그 일 하나에 맞춘 도착 페이지(예: crop product photos 1:1, Instagram grid). 기준 지표는 방문이 아니라 **내보내기**(/stats 의 export).
2. **다시 오게** — 프리셋(로그인) · 크롬 확장 · 마지막 설정 기억. 재방문자가 나중에 유료 · 기업 고객이 된다.
3. **퍼지게** — 결과물에 워터마크는 넣지 않는다. 대신 프리셋 공유 링크, 내보내기 뒤 "도구 공유" 한 줄, 레딧 · Hacker News · Product Hunt 소개 글.
4. **검색 글 늘리기** — 광고에서 잘 된 검색어로 쓰임새 쪽(uses/ how-to)을 더 만든다(Smallpdf · iLovePDF 가 거의 검색으로 큼).
5. **돈은 나중에, 기본 기능 밖에서** — 많이 쓰는 사람용 싼 Pro(큰 묶음 · 프리셋 보관 · 동기화), 한 번 결제(remove.bg 식), 쇼핑몰 · 워드프레스용 API/플러그인(TinyPNG). 화면 광고(AdSense)는 작업 화면에는 넣지 않는다 — 방문이 아주 많을 때만, 내보낸 뒤 화면 · 글 쪽에만.

## 6. 기록

| 날짜 | 매체 | 한 일 · 결과 | 비용 |
|---|---|---|---|
| 2026-11-11 | 구글 | 1차 시험 이미지 7장 · 문구 · 탭제어 프롬프트 준비 | 0 |
| 2026-11-11 | 구글 | 사장님 결정: 디테일크롭 광고는 영어로 → 이미지 7장 · 문구 · 프롬프트를 영어로 바꿈. 매체 추천: 구글 검색 · 레딧 · 무료 등록(Product Hunt · AlternativeTo) | 0 |
| 2026-11-11 | 구글 · 레딧 | 사장님 결정: 1차는 구글 **검색** 광고. 레딧 광고 조사(6-1) · 유입 뒤 다음 단계 사례 정리(6-2) | 0 |
| 2026-11-11 | 구글 검색 | 사장님 확정: 하루 1만 원 · 7일 검색 광고. 설정 · 문구 · 탭제어 프롬프트(검색용) 준비 — 게시는 사장님 | 0 |
